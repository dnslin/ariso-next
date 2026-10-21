import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createArchiveService } from '../../../src/server/delivery/archive.ts';
import { acceptOriginal } from '../../../src/server/media/images.ts';
import { mediaImages, mediaJobs } from '../../../src/server/media/schema.ts';
import {
  createProcessingSnapshot,
  prepareInitialMedia,
} from '../../../src/server/media/settings.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import {
  prepareInitialStorage,
  resolveLocalUploadStorage,
} from '../../../src/server/storage/defaults.ts';
import * as local from '../../../src/server/storage/local.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import { createSecretCrypto } from '../../../src/server/runtime/crypto.ts';
import { startProtocolEndpoint } from '../delivery/s3-endpoint.ts';

let directory: string;
let connection: ReturnType<typeof openRuntimeDatabase>;
let archive: ReturnType<typeof createArchiveService>;
let storage: ReturnType<typeof resolveLocalUploadStorage>;
const logger = { error: vi.fn() };

beforeEach(async () => {
  logger.error.mockClear();
  directory = await mkdtemp(join(tmpdir(), 'ariso-archive-'));
  connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  migrateRuntimeDatabase(connection.db, resolve('drizzle'));
  await mkdir(join(directory, 'storage'));
  prepareInitialStorage(connection.db, { storage: join(directory, 'storage') });
  connection.db.transaction(prepareInitialMedia);
  storage = resolveLocalUploadStorage(connection.db);
  archive = createArchiveService({
    db: connection.db,
    storageRoot: join(directory, 'storage'),
    logger,
  });
});
afterEach(async () => {
  await archive?.close();
  connection?.close();
  await rm(directory, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function seed(
  name: string,
  visibility: 'public' | 'private' = 'public',
  imageStorageId = storage.id,
  content?: Buffer,
) {
  const imageId = randomUUID();
  const bytes = content ?? Buffer.from(`original content ${imageId}`);
  const plan = local.planLocalWrite('uploads');
  await local.writeObject(
    join(directory, 'storage'),
    storage,
    plan,
    Readable.from(bytes),
  );
  connection.db.transaction((tx) => {
    const accepted = acceptOriginal(tx, {
      imageId,
      storageId: imageStorageId,
      key: plan.key,
      originalName: name,
      visibility,
      format: 'PNG',
      mime: 'image/png',
      byteSize: bytes.length,
      classification: 'static',
      snapshot: createProcessingSnapshot(tx),
      expectedVersions: [],
    });
    tx.update(mediaImages)
      .set({ processingStatus: 'ready' })
      .where(eq(mediaImages.id, imageId))
      .run();
    tx.update(mediaJobs)
      .set({ status: 'succeeded' })
      .where(eq(mediaJobs.id, accepted.jobId))
      .run();
  });
  return { imageId, bytes, key: plan.key };
}
const prepare = (ids: string[], version = 'original') =>
  archive.prepare({ ids, query: '', version });
const owner = async () => undefined;
const request = () =>
  new Request('http://ariso.test/api/images/archives/ticket');

function unzipStored(bytes: Buffer) {
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(end).toBeGreaterThan(0);
  const count = bytes.readUInt16LE(end + 10);
  let cursor = bytes.readUInt32LE(end + 16);
  const entries: { name: string; bytes: Buffer }[] = [];
  for (let index = 0; index < count; index++) {
    expect(bytes.readUInt32LE(cursor)).toBe(0x02014b50);
    expect(bytes.readUInt16LE(cursor + 10)).toBe(0);
    const size = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    const name = bytes
      .subarray(cursor + 46, cursor + 46 + nameLength)
      .toString('utf8');
    const start =
      localOffset +
      30 +
      bytes.readUInt16LE(localOffset + 26) +
      bytes.readUInt16LE(localOffset + 28);
    entries.push({ name, bytes: bytes.subarray(start, start + size) });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

it('streams complete stored ZIP bytes for public and private originals with safe distinct Unicode filenames', async () => {
  const first = await seed('../旅行.png');
  const second = await seed('../旅行.png', 'private');
  const prepared = await prepare([
    first.imageId,
    second.imageId,
    first.imageId,
  ]);
  expect(prepared.unavailable).toEqual([]);
  expect(prepared.totalBytes).toBe(first.bytes.length + second.bytes.length);
  expect(prepared.items.map((item) => item.filename)).toEqual([
    '旅行.png',
    '旅行 (2).png',
  ]);
  expect(prepared.downloadUrl).toMatch(/^\/api\/images\/archives\//);
  const response = await archive.download(
    prepared.downloadUrl!.split('/').at(-1)!,
    request(),
    owner,
  );
  expect(response.headers.get('content-type')).toBe('application/zip');
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(response.headers.get('content-disposition')).toContain('attachment');
  expect(unzipStored(Buffer.from(await response.arrayBuffer()))).toEqual([
    { name: '旅行.png', bytes: first.bytes },
    { name: '旅行 (2).png', bytes: second.bytes },
  ]);
});

it('reports every unavailable selected item and never creates a partial-download ticket', async () => {
  const good = await seed('good.png');
  const trashed = await seed('trash.png');
  connection.db
    .update(mediaImages)
    .set({ trashedAt: new Date() })
    .where(eq(mediaImages.id, trashed.imageId))
    .run();
  const result = await prepare([good.imageId, trashed.imageId, 'missing']);
  expect(result.items.map((item) => item.imageId)).toEqual([good.imageId]);
  expect(result.unavailable.map((item) => item.imageId)).toEqual([
    trashed.imageId,
    'missing',
  ]);
  expect(result.downloadUrl).toBeNull();
  const excluded = await prepare([good.imageId]);
  expect(excluded.downloadUrl).toBeTruthy();
  const version = await prepare([good.imageId], 'compressed');
  expect(version.unavailable[0].reason).toContain('版本');
  expect(version.downloadUrl).toBeNull();
});

it('rejects empty, oversized and non-fixed version requests before creating a list', async () => {
  for (const input of [
    { ids: [], query: '', version: 'original' },
    {
      ids: Array.from({ length: 201 }, (_, i) => String(i)),
      query: '',
      version: 'original',
    },
    { ids: ['one'], query: '', version: 'default' },
    { ids: ['one'], query: 'scope=trash', version: 'original' },
    { ids: ['one'], query: 'page=1', version: 'original' },
  ])
    await expect(archive.prepare(input)).rejects.toMatchObject({ status: 400 });
});

it('requires the owner again, rejects expired lists, and rechecks trashed or disabled sources before delivery', async () => {
  const image = await seed('one.png');
  const prepared = await prepare([image.imageId]);
  const id = prepared.downloadUrl!.split('/').at(-1)!;
  await expect(
    archive.download(id, request(), async () => {
      throw Object.assign(new Error('请先登录'), { status: 401 });
    }),
  ).rejects.toMatchObject({ status: 401 });
  connection.db
    .update(storageConfigs)
    .set({ enabled: false })
    .where(eq(storageConfigs.id, storage.id))
    .run();
  await expect(archive.download(id, request(), owner)).rejects.toMatchObject({
    status: 409,
  });
  connection.db
    .update(storageConfigs)
    .set({ enabled: true })
    .where(eq(storageConfigs.id, storage.id))
    .run();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.now() + 600_000);
  await expect(archive.download(id, request(), owner)).rejects.toMatchObject({
    status: 410,
  });
});

it('does not expose bytes when the owner session is revoked while the streaming source opens', async () => {
  const image = await seed('private.png', 'private');
  const prepared = await prepare([image.imageId]);
  let loggedIn = true;
  const readOwner = async () => {
    if (!loggedIn) throw Object.assign(new Error('请先登录'), { status: 401 });
  };
  const response = await archive.download(
    prepared.downloadUrl!.split('/').at(-1)!,
    request(),
    readOwner,
  );
  const actualRead = local.readObject;
  vi.spyOn(local, 'readObject').mockImplementation(async (...args) => {
    const opened = await actualRead(...args);
    loggedIn = false;
    return opened;
  });
  await expect(response.arrayBuffer()).rejects.toThrow();
});

it('proxies private S3 bytes into the same ZIP without a public signature or access counter', async () => {
  const endpoint = await startProtocolEndpoint();
  const secretCrypto = createSecretCrypto(randomBytes(32));
  try {
    const remoteId = randomUUID();
    const now = new Date();
    const remote = endpoint.target;
    connection.db
      .insert(storageConfigs)
      .values({
        id: remoteId,
        name: 'S3',
        type: 's3',
        enabled: true,
        endpoint: remote.endpoint,
        region: remote.region,
        bucket: remote.bucket,
        forcePathStyle: true,
        pathPrefix: '',
        accessKeyEncrypted: secretCrypto.encryptSecret(
          remote.credentials.accessKeyId,
        ),
        secretKeyEncrypted: secretCrypto.encryptSecret(
          remote.credentials.secretAccessKey,
        ),
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const image = await seed('远端.png', 'private', remoteId);
    endpoint.objects.set(`/${remote.bucket}/ariso/${remoteId}/${image.key}`, {
      bytes: image.bytes,
      contentType: 'image/png',
    });
    await archive.close();
    archive = createArchiveService({
      db: connection.db,
      storageRoot: join(directory, 'storage'),
      logger,
      secretCrypto,
    });
    const prepared = await prepare([image.imageId]);
    expect(prepared.unavailable).toEqual([]);
    const response = await archive.download(
      prepared.downloadUrl!.split('/').at(-1)!,
      request(),
      owner,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(unzipStored(Buffer.from(await response.arrayBuffer()))).toEqual([
      { name: '远端.png', bytes: image.bytes },
    ]);
    expect(endpoint.requests.every((item) => item.method === 'GET')).toBe(true);
  } finally {
    await endpoint.close();
  }
});

it('reports a physically missing file before preparing and rejects an otherwise valid ticket after recycling', async () => {
  const image = await seed('one.png');
  const prepared = await prepare([image.imageId]);
  connection.db
    .update(mediaImages)
    .set({ trashedAt: new Date() })
    .where(eq(mediaImages.id, image.imageId))
    .run();
  await expect(
    archive.download(
      prepared.downloadUrl!.split('/').at(-1)!,
      request(),
      owner,
    ),
  ).rejects.toMatchObject({ status: 409 });
  connection.db
    .update(mediaImages)
    .set({ trashedAt: null })
    .where(eq(mediaImages.id, image.imageId))
    .run();
  await local.deleteObject(join(directory, 'storage'), storage, image.key);
  const missing = await prepare([image.imageId]);
  expect(missing.items).toEqual([]);
  expect(missing.unavailable[0].reason).toContain('文件不存在');
  expect(missing.downloadUrl).toBeNull();
});

it('destroys the active file source when the browser cancels and aborts rather than silently omitting a later missing file', async () => {
  const large = await seed(
    'large.png',
    'private',
    storage.id,
    Buffer.alloc(8 * 1024 * 1024, 9),
  );
  const prepared = await prepare([large.imageId]);
  const response = await archive.download(
    prepared.downloadUrl!.split('/').at(-1)!,
    request(),
    owner,
  );
  const actualRead = local.readObject;
  let source:
    Awaited<ReturnType<typeof local.readObject>>['stream'] | undefined;
  vi.spyOn(local, 'readObject').mockImplementation(async (...args) => {
    const opened = await actualRead(...args);
    source = opened.stream;
    return opened;
  });
  const reader = response.body!.getReader();
  expect((await reader.read()).done).toBe(false);
  await reader.cancel();
  expect(source?.destroyed).toBe(true);
  vi.restoreAllMocks();
  const later = await seed('later.png');
  const both = await prepare([large.imageId, later.imageId]);
  const failing = await archive.download(
    both.downloadUrl!.split('/').at(-1)!,
    request(),
    owner,
  );
  await local.deleteObject(join(directory, 'storage'), storage, later.key);
  await expect(failing.arrayBuffer()).rejects.toThrow();
  expect(logger.error).toHaveBeenCalledWith(
    expect.objectContaining({ imageId: later.imageId }),
    'Archive stream failed',
  );
});

it('cancels unconsumed responses during shutdown and rejects preparation after shutdown', async () => {
  const image = await seed('one.png');
  const prepared = await prepare([image.imageId]);
  const response = await archive.download(
    prepared.downloadUrl!.split('/').at(-1)!,
    request(),
    owner,
  );
  await archive.close();
  await expect(response.arrayBuffer()).rejects.toThrow();
  await expect(prepare([image.imageId])).rejects.toMatchObject({ status: 503 });
});
