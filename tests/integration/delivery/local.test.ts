import { randomUUID } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  type ReadStream,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import {
  prepareInitialStorage,
  resolveUploadStorage,
} from '../../../src/server/storage/defaults.ts';
import * as local from '../../../src/server/storage/local.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import { acceptOriginal } from '../../../src/server/media/images.ts';
import {
  prepareInitialMedia,
  createProcessingSnapshot,
} from '../../../src/server/media/settings.ts';
import {
  mediaImages,
  mediaObjects,
  mediaVersions,
  mediaSettings,
  type VersionKind,
} from '../../../src/server/media/schema.ts';
import { prepareImageDelivery } from '../../../src/server/delivery/response.ts';

let directory: string;
let storageRoot: string;
let connection: ReturnType<typeof openRuntimeDatabase>;
let imageId: string;
let storage: ReturnType<typeof resolveUploadStorage>;
let owner: boolean;
const bytes = readFileSync(resolve('tests/fixtures/runtime/images/sample.png'));
const onAccess = vi.fn();
const logger = { error: vi.fn() };
const readObject = local.readObject;
const streams: ReadStream[] = [];

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'ariso-delivery-'));
  storageRoot = join(directory, 'storage');
  mkdirSync(storageRoot);
  connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  migrateRuntimeDatabase(connection.db, resolve('drizzle'));
  prepareInitialStorage(connection.db, { storage: storageRoot });
  storage = resolveUploadStorage(connection.db);
  imageId = randomUUID();
  owner = false;
  onAccess.mockReset();
  logger.error.mockReset();
  const plan = local.planLocalWrite('uploads');
  await local.writeObject(storageRoot, storage, plan, Readable.from(bytes));
  connection.db.transaction((tx) => {
    prepareInitialMedia(tx);
    acceptOriginal(tx, {
      imageId,
      storageId: storage.id,
      key: plan.key,
      originalName: '旅行.final.png',
      visibility: 'public',
      format: 'PNG',
      mime: 'image/png',
      byteSize: bytes.length,
      classification: 'static',
      animated: false,
      pageCount: 1,
      snapshot: createProcessingSnapshot(tx),
      expectedVersions: ['compressed', 'thumbnail'],
    });
    tx.update(mediaImages).set({ processingStatus: 'ready' }).run();
    tx.update(mediaSettings).set({ defaultLinkVersion: 'original' }).run();
  });
});
afterEach(async () => {
  for (const stream of streams.splice(0)) {
    stream.destroy();
    await finished(stream).catch(() => undefined);
  }
  vi.restoreAllMocks();
  connection.close();
  rmSync(directory, { recursive: true, force: true });
});
function request(query = '', init?: RequestInit) {
  return prepareImageDelivery(
    new Request(`http://ariso.test/i/${imageId}${query}`, init),
    imageId,
    {
      db: connection.db,
      storageRoot,
      readOwner: async () => owner,
      onAccess,
      logger,
    },
  );
}
function patchImage(patch: Partial<typeof mediaImages.$inferInsert>) {
  connection.db
    .update(mediaImages)
    .set(patch)
    .where(eq(mediaImages.id, imageId))
    .run();
}
async function saveVersion(kind: VersionKind, content = bytes) {
  const plan = local.planLocalWrite('derived');
  await local.writeObject(storageRoot, storage, plan, Readable.from(content));
  const objectId = randomUUID();
  connection.db
    .insert(mediaObjects)
    .values({
      id: objectId,
      imageId,
      storageId: storage.id,
      key: plan.key,
      purpose: kind,
      status: 'stored',
      byteSize: content.length,
      format: 'PNG',
      mime: 'image/png',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();
  connection.db
    .insert(mediaVersions)
    .values({
      imageId,
      kind,
      objectId,
      byteSize: content.length,
      format: 'PNG',
      mime: 'image/png',
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [mediaVersions.imageId, mediaVersions.kind],
      set: { objectId, byteSize: content.length },
    })
    .run();
  return plan.key;
}
function interceptOpened(change: () => void | Promise<void>) {
  return vi
    .spyOn(local, 'readObject')
    .mockImplementationOnce(async (...args) => {
      const object = await readObject(...args);
      streams.push(object.stream);
      await change();
      return object;
    });
}
async function error(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get('cache-control')).toBe(
    'private, no-store, no-transform',
  );
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(await response.json()).toMatchObject({ code });
  expect(onAccess).not.toHaveBeenCalled();
}

describe('delivery with SQLite and local objects', () => {
  it('streams exact original bytes and counts only on the first consumed block', async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-length')).toBe(String(bytes.length));
    expect(response.headers.get('x-ariso-image-version')).toBe('original');
    await new Promise<void>((done) => setImmediate(done));
    expect(onAccess).not.toHaveBeenCalled();
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    expect(onAccess).toHaveBeenCalledExactlyOnceWith({
      imageId,
      storageId: storage.id,
      actualVersion: 'original',
      occurredAt: expect.any(Date),
    });
  });

  it('follows default changes while explicit original remains fixed and missing applicable versions fail', async () => {
    const compressed = Buffer.from('saved compressed bytes');
    await saveVersion('compressed', compressed);
    connection.db
      .update(mediaSettings)
      .set({ defaultLinkVersion: 'compressed' })
      .run();
    const response = await request();
    expect(response.headers.get('x-ariso-image-version')).toBe('compressed');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(compressed);
    expect(
      Buffer.from(await (await request('?type=original')).arrayBuffer()),
    ).toEqual(bytes);
    connection.db
      .update(mediaSettings)
      .set({ defaultLinkVersion: 'watermark' })
      .run();
    onAccess.mockClear();
    await error(await request(), 404, 'VERSION_UNAVAILABLE');
  });

  it('falls back only for an inapplicable default and counts actual original', async () => {
    patchImage({ classification: 'animated', format: 'GIF' });
    connection.db
      .update(mediaSettings)
      .set({ defaultLinkVersion: 'compressed' })
      .run();
    const response = await request();
    expect(response.headers.get('x-ariso-image-version')).toBe('original');
    await response.arrayBuffer();
    expect(onAccess.mock.calls[0]![0].actualVersion).toBe('original');
    onAccess.mockClear();
    await error(await request('?type=compressed'), 404, 'VERSION_UNAVAILABLE');
  });

  it('checks private permission before exposing disabled storage or missing versions', async () => {
    patchImage({ visibility: 'private' });
    connection.db.update(storageConfigs).set({ enabled: false }).run();
    await error(
      await request('?type=watermark', {
        headers: { Authorization: 'Bearer upload-token' },
      }),
      401,
      'OWNER_LOGIN_REQUIRED',
    );
    owner = true;
    await error(await request(), 409, 'STORAGE_DISABLED');
  });

  it.each(['pending', 'processing', 'failed'] as const)(
    'allows only owner to read saved original in %s state',
    async (processingStatus) => {
      patchImage({ processingStatus });
      await error(await request(), 409, 'IMAGE_NOT_READY');
      owner = true;
      expect(Buffer.from(await (await request()).arrayBuffer())).toEqual(bytes);
      expect(onAccess).not.toHaveBeenCalled();
    },
  );

  it.each([
    { trashedAt: new Date() },
    { deletionStatus: 'deleting' as const },
    { deletionStatus: 'cleanup_failed' as const },
  ])('rejects unavailable records even for owner: %j', async (state) => {
    patchImage(state);
    owner = true;
    await error(await request(), 404, 'IMAGE_UNAVAILABLE');
  });

  it('excludes owner and thumbnail accesses but counts anonymous attachment once', async () => {
    owner = true;
    await (await request()).arrayBuffer();
    owner = false;
    await saveVersion('thumbnail');
    await (await request('?type=thumbnail')).arrayBuffer();
    expect(onAccess).not.toHaveBeenCalled();
    const response = await request('?download=1');
    expect(response.headers.get('content-disposition')).toContain(
      'attachment;',
    );
    expect(response.headers.get('content-disposition')).toContain(
      "filename*=UTF-8''%E6%97%85%E8%A1%8C.final.png",
    );
    await response.arrayBuffer();
    expect(onAccess).toHaveBeenCalledTimes(1);
  });

  it('HEAD, conditional requests and Range retain access checks without partial responses', async () => {
    const head = await request('', { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
    const etag = head.headers.get('etag')!;
    expect(etag).toBeTruthy();
    const unchanged = await request('', {
      headers: { 'If-None-Match': `W/${etag}` },
    });
    expect(unchanged.status).toBe(304);
    expect(await unchanged.text()).toBe('');
    await error(
      await request('', { headers: { 'If-Match': '"different"' } }),
      412,
      'PRECONDITION_FAILED',
    );
    patchImage({ visibility: 'private' });
    await error(
      await request('', { headers: { 'If-None-Match': '*' } }),
      401,
      'OWNER_LOGIN_REQUIRED',
    );
    patchImage({ visibility: 'public' });
    const full = await request('', { headers: { Range: 'bytes=0-1' } });
    expect(full.status).toBe(200);
    expect(full.headers.get('accept-ranges')).toBe('none');
    expect(Buffer.from(await full.arrayBuffer())).toEqual(bytes);
    expect(onAccess).toHaveBeenCalledTimes(1);
  });

  it('forces local SVG attachment with verified type and Chinese display name', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><text>旅行</text></svg>',
    );
    await saveVersion('original', svg);
    connection.db
      .update(mediaVersions)
      .set({ format: 'SVG', mime: 'image/svg+xml' })
      .run();
    patchImage({
      format: 'SVG',
      mime: 'image/svg+xml',
      classification: 'preview_only',
    });
    const response = await request();
    expect(response.headers.get('content-type')).toBe('image/svg+xml');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-disposition')).toContain(
      'attachment;',
    );
    expect(response.headers.get('content-disposition')).toContain('.svg');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(svg);
  });

  it.each(['private', 'trash', 'disabled'] as const)(
    'rechecks %s change after opening and closes rejected object',
    async (change) => {
      interceptOpened(() => {
        if (change === 'private') patchImage({ visibility: 'private' });
        if (change === 'trash') patchImage({ trashedAt: new Date() });
        if (change === 'disabled')
          connection.db.update(storageConfigs).set({ enabled: false }).run();
      });
      const expected = {
        private: [401, 'OWNER_LOGIN_REQUIRED'],
        trash: [404, 'IMAGE_UNAVAILABLE'],
        disabled: [409, 'STORAGE_DISABLED'],
      } as const;
      await error(await request(), expected[change][0], expected[change][1]);
      expect(streams[0]!.destroyed).toBe(true);
    },
  );

  it('rechecks revoked owner after opening a private object', async () => {
    owner = true;
    patchImage({ visibility: 'private' });
    interceptOpened(() => {
      owner = false;
    });
    await error(await request(), 401, 'OWNER_LOGIN_REQUIRED');
    expect(streams[0]!.destroyed).toBe(true);
  });

  it('reselects a newly published version after open without returning old bytes', async () => {
    const replacement = Buffer.from('new current version');
    interceptOpened(async () => {
      await saveVersion('original', replacement);
    });
    expect(Buffer.from(await (await request()).arrayBuffer())).toEqual(
      replacement,
    );
    expect(streams[0]!.destroyed).toBe(true);
    expect(onAccess).toHaveBeenCalledTimes(1);
  });

  it('reselects once when the selected object was deleted before it could open', async () => {
    const replacement = Buffer.from('replacement after cleanup');
    vi.spyOn(local, 'readObject').mockImplementationOnce(async (...args) => {
      await saveVersion('original', replacement);
      await local.deleteObject(storageRoot, storage, args[2]);
      return readObject(...args);
    });
    expect(Buffer.from(await (await request()).arrayBuffer())).toEqual(
      replacement,
    );
    expect(onAccess).toHaveBeenCalledTimes(1);
  });

  it('rejects repeated version changes after a bounded reselect', async () => {
    vi.spyOn(local, 'readObject').mockImplementation(async (...args) => {
      const object = await readObject(...args);
      streams.push(object.stream);
      await saveVersion('original', Buffer.from(randomUUID()));
      return object;
    });
    await error(await request(), 409, 'IMAGE_CHANGED');
    expect(streams).toHaveLength(2);
    expect(streams.every((stream) => stream.destroyed)).toBe(true);
  });

  it('first read failure closes the real file stream without counting', async () => {
    interceptOpened(() => undefined);
    const response = await request();
    streams[0]!.destroy(new Error('injected disk read failure'));
    await expect(response.arrayBuffer()).rejects.toThrow();
    expect(streams[0]!.destroyed).toBe(true);
    expect(onAccess).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('logs a file error once even when nobody consumes the response', async () => {
    interceptOpened(() => undefined);
    const response = await request();
    streams[0]!.destroy(new Error('injected unconsumed file failure'));
    await finished(streams[0]!).catch(() => undefined);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(streams[0]!.closed).toBe(true);
    expect(onAccess).not.toHaveBeenCalled();
    await response.body!.cancel();
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it.each(['cancel', 'error'] as const)(
    'after first block, %s closes the real stream and retains exactly one count',
    async (action) => {
      await saveVersion('original', Buffer.alloc(1024 * 1024, 42));
      interceptOpened(() => undefined);
      const response = await request();
      const reader = response.body!.getReader();
      expect((await reader.read()).value!.length).toBeGreaterThan(0);
      expect(onAccess).toHaveBeenCalledTimes(1);
      if (action === 'cancel') await reader.cancel();
      else {
        streams[0]!.destroy(new Error('injected mid-stream failure'));
        await expect(reader.read()).rejects.toThrow();
        expect(logger.error).toHaveBeenCalledTimes(1);
      }
      expect(streams[0]!.destroyed).toBe(true);
      expect(onAccess).toHaveBeenCalledTimes(1);
    },
  );

  it('does not count a response cancelled before its first read and closes the handle', async () => {
    interceptOpened(() => undefined);
    const response = await request();
    await response.body!.cancel();
    expect(streams[0]!.destroyed).toBe(true);
    expect(streams[0]!.closed).toBe(true);
    expect(onAccess).not.toHaveBeenCalled();
  });

  it('propagates request abortion to the actual file stream', async () => {
    interceptOpened(() => undefined);
    const controller = new AbortController();
    const response = await request('', { signal: controller.signal });
    controller.abort();
    await expect(response.arrayBuffer()).rejects.toThrow();
    await finished(streams[0]!).catch(() => undefined);
    expect(streams[0]!.closed).toBe(true);
    expect(onAccess).not.toHaveBeenCalled();
  });

  it('counts a public image after owner session is revoked during open', async () => {
    owner = true;
    interceptOpened(() => {
      owner = false;
    });
    expect(Buffer.from(await (await request()).arrayBuffer())).toEqual(bytes);
    expect(onAccess).toHaveBeenCalledTimes(1);
  });

  it('does not turn authentication infrastructure failure into anonymous access', async () => {
    const response = await prepareImageDelivery(
      new Request(`http://ariso.test/i/${imageId}`),
      imageId,
      {
        db: connection.db,
        storageRoot,
        onAccess,
        logger,
        readOwner: async () => {
          throw new Error('session database unavailable');
        },
      },
    );
    await error(response, 500, 'DELIVERY_FAILED');
    expect(logger.error).toHaveBeenCalled();
  });

  it('requires a real readable object before honoring conditional requests', async () => {
    const object = connection.db.select().from(mediaObjects).get()!;
    await local.deleteObject(storageRoot, storage, object.key);
    await error(
      await request('', { headers: { 'If-None-Match': '*' } }),
      404,
      'STORAGE_OBJECT_MISSING',
    );
    expect(logger.error).toHaveBeenCalled();
  });

  it('rejects physical size mismatch and closes the opened file', async () => {
    connection.db
      .update(mediaVersions)
      .set({ byteSize: bytes.length + 1 })
      .run();
    interceptOpened(() => undefined);
    await error(await request(), 500, 'DELIVERY_FAILED');
    expect(streams[0]!.closed).toBe(true);
    expect(logger.error).toHaveBeenCalled();
  });

  it('logs aggregation failure without interrupting allowed bytes or retrying count', async () => {
    onAccess.mockImplementationOnce(() => {
      throw new Error('aggregation failed');
    });
    expect(Buffer.from(await (await request()).arrayBuffer())).toEqual(bytes);
    expect(onAccess).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});
