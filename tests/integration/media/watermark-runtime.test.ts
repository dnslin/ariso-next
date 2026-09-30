import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import pino from 'pino';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mediaWatermarkAssets } from '../../../src/server/media/schema.ts';
import { prepareInitialMedia } from '../../../src/server/media/settings.ts';
import { getWatermarkAsset } from '../../../src/server/media/watermark-assets.ts';
import { startWatermarkRuntime } from '../../../src/server/media/watermark-runtime.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';

let directory: string;
let watermarksRoot: string;
let connection: ReturnType<typeof openRuntimeDatabase>;
let runtime: ReturnType<typeof startWatermarkRuntime> | undefined;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ariso-watermark-runtime-'));
  watermarksRoot = join(directory, 'assets', 'watermarks');
  await mkdir(watermarksRoot, { recursive: true });
  connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  migrateRuntimeDatabase(connection.db, resolve('drizzle'));
  connection.db.transaction(prepareInitialMedia);
});

afterEach(async () => {
  try {
    await runtime?.stop();
  } finally {
    runtime = undefined;
    connection.close();
    await rm(directory, { recursive: true, force: true });
  }
});

function start() {
  runtime = startWatermarkRuntime({
    db: connection.db,
    watermarksRoot,
    hasUploadReference: () => false,
    logger: pino(),
  });
  return runtime;
}

function request(body: BodyInit, headers?: HeadersInit) {
  return new Request('http://localhost/api/media/watermark-assets', {
    method: 'POST',
    body,
    headers,
    ...(body instanceof ReadableStream ? { duplex: 'half' } : {}),
  });
}

function fileForm(bytes: Buffer) {
  const body = new FormData();
  body.append('file', new Blob([new Uint8Array(bytes)]), 'watermark.png');
  return body;
}

it('receives a real PNG through FormData and persists the exact bytes and ready metadata', async () => {
  const bytes = await readFile('tests/fixtures/media-formats/source.png');
  const received = await start().receive(request(fileForm(bytes)));
  expect(received).toMatchObject({
    status: 'ready',
    format: 'PNG',
    mime: 'image/png',
    width: 64,
    height: 48,
    byteSize: bytes.length,
    expiresAt: expect.any(Date),
  });
  expect(await readFile(join(watermarksRoot, received.path))).toEqual(bytes);
  expect(getWatermarkAsset(connection.db, received.id)).toEqual(received);
});

it('cancels unfinished request bodies, settles their work before stop resolves and refuses later uploads', async () => {
  const service = start();
  let cancelReason: unknown;
  let settled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(Buffer.from('--pending\r\n'));
    },
    cancel(reason) {
      cancelReason = reason;
    },
  });
  const received = service
    .receive(
      request(body, {
        'content-type': 'multipart/form-data; boundary=pending',
      }),
    )
    .finally(() => {
      settled = true;
    });
  const rejected = expect(received).rejects.toMatchObject({
    code: 'MEDIA_INTERRUPTED',
  });
  await service.stop();
  expect(settled).toBe(true);
  await rejected;
  expect(cancelReason).toMatchObject({ code: 'MEDIA_INTERRUPTED' });
  expect(body.locked).toBe(false);
  expect(() => service.receive(request(new FormData()))).toThrowError(
    expect.objectContaining({ code: 'MEDIA_STOPPING', status: 503 }),
  );
  expect(connection.db.select().from(mediaWatermarkAssets).all()).toEqual([]);
});

it('recovers interrupted writes and expired temporary assets by their registered directories only', async () => {
  const now = new Date();
  const records = [
    {
      id: randomUUID(),
      folder: 'interrupted-owned',
      status: 'writing' as const,
      expiresAt: null,
    },
    {
      id: randomUUID(),
      folder: 'expired-owned',
      status: 'ready' as const,
      expiresAt: new Date(0),
    },
    {
      id: randomUUID(),
      folder: 'active-owned',
      status: 'ready' as const,
      expiresAt: new Date(now.getTime() + 3600000),
    },
  ];
  for (const record of records) {
    await mkdir(join(watermarksRoot, record.folder));
    await writeFile(
      join(watermarksRoot, record.folder, 'source'),
      record.folder,
    );
    connection.db
      .insert(mediaWatermarkAssets)
      .values({
        id: record.id,
        path: `${record.folder}/source`,
        status: record.status,
        expiresAt: record.expiresAt,
        byteSize: record.folder.length,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }
  // An unregistered sibling and an unrelated directory with the same ID must survive.
  await mkdir(join(watermarksRoot, 'unregistered'));
  await writeFile(join(watermarksRoot, 'unregistered', 'source'), 'keep');
  await mkdir(join(watermarksRoot, records[0].id));
  await writeFile(
    join(watermarksRoot, records[0].id, 'source'),
    'keep by path',
  );
  start();
  await vi.waitFor(() => {
    expect(getWatermarkAsset(connection.db, records[0].id)?.status).toBe(
      'deleted',
    );
    expect(getWatermarkAsset(connection.db, records[1].id)?.status).toBe(
      'deleted',
    );
  });
  for (const record of records.slice(0, 2)) {
    await expect(
      readFile(join(watermarksRoot, record.folder, 'source')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  }
  expect(getWatermarkAsset(connection.db, records[2].id)?.status).toBe('ready');
  expect(
    await readFile(join(watermarksRoot, 'active-owned', 'source'), 'utf8'),
  ).toBe('active-owned');
  expect(
    await readFile(join(watermarksRoot, 'unregistered', 'source'), 'utf8'),
  ).toBe('keep');
  expect(
    await readFile(join(watermarksRoot, records[0].id, 'source'), 'utf8'),
  ).toBe('keep by path');
});

it('rejects malformed multipart and invalid form shape without creating an asset', async () => {
  const service = start();
  const textFile = new FormData();
  textFile.append('file', 'text instead of a file');
  const multiple = fileForm(Buffer.from('first'));
  multiple.append('file', new Blob(['second']), 'second.png');
  const extra = fileForm(Buffer.from('first'));
  extra.append('label', 'extra field');
  const requests = [
    request('invalid', { 'content-type': 'application/json' }),
    request('--broken', {
      'content-type': 'multipart/form-data; boundary=test',
    }),
    ...[
      new FormData(),
      textFile,
      multiple,
      extra,
      fileForm(Buffer.alloc(0)),
    ].map((body) => request(body)),
  ];
  for (const input of requests) {
    await expect(service.receive(input)).rejects.toMatchObject({
      code: 'MEDIA_WATERMARK_REQUEST',
      status: 400,
    });
  }
  expect(connection.db.select().from(mediaWatermarkAssets).all()).toEqual([]);
});

it('rejects a file one byte over 5 MiB before registering an asset', async () => {
  await expect(
    start().receive(request(fileForm(Buffer.alloc(5 * 1024 * 1024 + 1)))),
  ).rejects.toMatchObject({
    code: 'MEDIA_WATERMARK_REQUEST',
    status: 413,
  });
  expect(connection.db.select().from(mediaWatermarkAssets).all()).toEqual([]);
});

it('cancels an oversized multipart envelope before consuming the rest of its stream', async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(Buffer.alloc(5 * 1024 * 1024 + 64 * 1024 + 1));
    },
    cancel() {
      cancelled = true;
    },
  });
  await expect(
    start().receive(
      request(body, { 'content-type': 'multipart/form-data; boundary=test' }),
    ),
  ).rejects.toMatchObject({
    code: 'MEDIA_WATERMARK_REQUEST',
    status: 413,
  });
  expect(cancelled).toBe(true);
  expect(body.locked).toBe(false);
  expect(connection.db.select().from(mediaWatermarkAssets).all()).toEqual([]);
});
