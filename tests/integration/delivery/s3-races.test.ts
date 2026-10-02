import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { prepareImageDelivery } from '../../../src/server/delivery/response.ts';
import { createSecretCrypto } from '../../../src/server/runtime/crypto.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import { acceptOriginal } from '../../../src/server/media/images.ts';
import {
  mediaImages,
  mediaObjects,
  mediaSettings,
  mediaVersions,
} from '../../../src/server/media/schema.ts';
import {
  createProcessingSnapshot,
  prepareInitialMedia,
} from '../../../src/server/media/settings.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import * as s3 from '../../../src/server/storage/s3.ts';

let directory: string;
let connection: ReturnType<typeof openRuntimeDatabase>;
let imageId: string;
let storageId: string;
let owner: boolean;
let afterSign: (() => void | Promise<void>) | undefined;
const secretCrypto = createSecretCrypto(randomBytes(32));
const onAccess = vi.fn();
const logger = { error: vi.fn() };
const createS3Storage = s3.createS3Storage;
const clients: ReturnType<typeof createS3Storage>[] = [];
const signatures: { key: string; method: string }[] = [];

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'ariso-s3-races-'));
  connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  migrateRuntimeDatabase(connection.db, resolve('drizzle'));
  connection.db.transaction((tx) => prepareInitialMedia(tx));
  storageId = randomUUID();
  imageId = randomUUID();
  owner = false;
  afterSign = undefined;
  onAccess.mockReset();
  logger.error.mockReset();
  signatures.length = 0;
  const now = new Date();
  connection.db
    .insert(storageConfigs)
    .values({
      id: storageId,
      name: 'S3 fixture',
      type: 's3',
      enabled: true,
      endpoint: 'https://objects.example',
      region: 'us-east-1',
      bucket: 'private',
      pathPrefix: '中文 prefix',
      forcePathStyle: true,
      accessKeyEncrypted: secretCrypto.encryptSecret('fixture-access'),
      secretKeyEncrypted: secretCrypto.encryptSecret('fixture-secret'),
      createdAt: now,
      updatedAt: now,
    })
    .run();
  connection.db.transaction((tx) =>
    acceptOriginal(tx, {
      imageId,
      storageId,
      key: 'uploads/original',
      originalName: '旅行.final.png',
      visibility: 'public',
      format: 'PNG',
      mime: 'image/png',
      byteSize: 42,
      classification: 'static',
      snapshot: createProcessingSnapshot(tx),
      expectedVersions: [],
    }),
  );
  patchImage({ processingStatus: 'ready' });
  connection.db
    .update(mediaSettings)
    .set({ defaultLinkVersion: 'original' })
    .run();
  vi.spyOn(s3, 'createS3Storage').mockImplementation((config) => {
    const client = createS3Storage(config);
    clients.push(client);
    const sign = client.signRead.bind(client);
    vi.spyOn(client, 'destroy');
    vi.spyOn(client, 'signRead').mockImplementation(async (key, options) => {
      signatures.push({ key, method: options.method });
      const result = await sign(key, options);
      await afterSign?.();
      return result;
    });
    return client;
  });
});
afterEach(() => {
  for (const client of clients.splice(0)) {
    expect(client.destroy).toHaveBeenCalledTimes(1);
  }
  vi.restoreAllMocks();
  connection.close();
  rmSync(directory, { recursive: true, force: true });
});
function patchImage(values: Partial<typeof mediaImages.$inferInsert>) {
  connection.db
    .update(mediaImages)
    .set(values)
    .where(eq(mediaImages.id, imageId))
    .run();
}
function request(
  init: RequestInit = {},
  query = '',
  access: 'published' | 'trash-preview' = 'published',
) {
  return prepareImageDelivery(
    new Request(`https://ariso.test/i/${imageId}${query}`, init),
    imageId,
    {
      db: connection.db,
      storageRoot: join(directory, 'storage'),
      secretCrypto,
      readOwner: async () => owner,
      onAccess,
      logger,
      access,
    },
  );
}
async function error(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(await response.json()).toMatchObject({ code });
  expect(response.headers.get('cache-control')).toBe(
    'private, no-store, no-transform',
  );
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(onAccess).not.toHaveBeenCalled();
}
function replaceOriginal(key: string) {
  const id = randomUUID();
  const now = new Date();
  connection.db.transaction((tx) => {
    tx.insert(mediaObjects)
      .values({
        id,
        imageId,
        storageId,
        key,
        purpose: 'original',
        status: 'stored',
        byteSize: 42,
        format: 'PNG',
        mime: 'image/png',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    tx.update(mediaVersions)
      .set({ objectId: id })
      .where(eq(mediaVersions.imageId, imageId))
      .run();
  });
}
it('returns one no-store 302 with GET overrides, no local validators or body, and one access event', async () => {
  const response = await request(
    { headers: { 'if-none-match': '*', range: 'bytes=0-1' } },
    '?download=1&unrelated=ignored',
  );
  expect(response.status).toBe(302);
  const url = new URL(response.headers.get('location')!);
  expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
  expect(url.searchParams.get('response-content-type')).toBe('image/png');
  expect(url.searchParams.get('response-cache-control')).toBe(
    'private, no-store, no-transform',
  );
  expect(url.searchParams.get('response-content-disposition')).toContain(
    "filename*=UTF-8''%E6%97%85%E8%A1%8C.final.png",
  );
  expect(url.searchParams.has('unrelated')).toBe(false);
  expect(response.headers.get('etag')).toBeNull();
  expect(response.headers.get('accept-ranges')).toBeNull();
  expect(response.headers.get('content-length')).toBeNull();
  expect(await response.text()).toBe('');
  expect(signatures).toEqual([{ key: 'uploads/original', method: 'GET' }]);
  expect(onAccess).toHaveBeenCalledTimes(1);
  expect(onAccess).toHaveBeenCalledWith(
    expect.objectContaining({
      imageId,
      storageId,
      actualVersion: 'original',
      occurredAt: expect.any(Date),
    }),
  );
});
it('HEAD signs only HEAD without GET response overrides and never records access', async () => {
  const response = await request(
    { method: 'HEAD', headers: { 'if-none-match': '*' } },
    '?download=1',
  );
  expect(response.status).toBe(302);
  const url = new URL(response.headers.get('location')!);
  expect(
    [...url.searchParams.keys()].some((key) => key.startsWith('response-')),
  ).toBe(false);
  expect(await response.text()).toBe('');
  expect(signatures).toEqual([{ key: 'uploads/original', method: 'HEAD' }]);
  expect(onAccess).not.toHaveBeenCalled();
});
it.each([
  'private',
  'trash',
  'disabled',
  'not-ready',
  'deleting',
  'cleanup-failed',
] as const)(
  'rechecks %s after signing before publishing the redirect',
  async (change) => {
    afterSign = () => {
      if (change === 'private') patchImage({ visibility: 'private' });
      if (change === 'trash') patchImage({ trashedAt: new Date() });
      if (change === 'disabled')
        connection.db.update(storageConfigs).set({ enabled: false }).run();
      if (change === 'not-ready') patchImage({ processingStatus: 'failed' });
      if (change === 'deleting') patchImage({ deletionStatus: 'deleting' });
      if (change === 'cleanup-failed')
        patchImage({ deletionStatus: 'cleanup_failed' });
    };
    const expected = {
      private: [401, 'OWNER_LOGIN_REQUIRED'],
      trash: [404, 'IMAGE_UNAVAILABLE'],
      disabled: [409, 'STORAGE_DISABLED'],
      'not-ready': [409, 'IMAGE_NOT_READY'],
      deleting: [404, 'IMAGE_UNAVAILABLE'],
      'cleanup-failed': [404, 'IMAGE_UNAVAILABLE'],
    } as const;
    const response = await request();
    expect(response.headers.get('location')).toBeNull();
    await error(response, expected[change][0], expected[change][1]);
  },
);
it('rejects a revoked owner session for private content after signing', async () => {
  owner = true;
  patchImage({ visibility: 'private' });
  afterSign = () => {
    owner = false;
  };
  await error(await request(), 401, 'OWNER_LOGIN_REQUIRED');
});
it('counts according to final session state and excludes an owner that logs in during signing', async () => {
  owner = true;
  afterSign = () => {
    owner = false;
  };
  expect((await request()).status).toBe(302);
  expect(onAccess).toHaveBeenCalledTimes(1);
  onAccess.mockClear();
  afterSign = () => {
    owner = true;
  };
  expect((await request()).status).toBe(302);
  expect(onAccess).not.toHaveBeenCalled();
});
it('reselects a changed published object only once and never exposes the abandoned signature', async () => {
  afterSign = () => {
    afterSign = undefined;
    replaceOriginal('derived/replacement');
  };
  const response = await request();
  expect(response.status).toBe(302);
  expect(new URL(response.headers.get('location')!).pathname).toContain(
    '/derived/replacement',
  );
  expect(signatures.map(({ key }) => key)).toEqual([
    'uploads/original',
    'derived/replacement',
  ]);
  expect(onAccess).toHaveBeenCalledTimes(1);
});
it('rejects continuous changes after two signing attempts', async () => {
  afterSign = () => replaceOriginal(`derived/${randomUUID()}`);
  await error(await request(), 409, 'IMAGE_CHANGED');
  expect(signatures).toHaveLength(2);
});
it.each(['name', 'config', 'default'] as const)(
  're-signs changed %s parameters instead of releasing stale delivery',
  async (change) => {
    afterSign = () => {
      afterSign = undefined;
      if (change === 'name') patchImage({ displayName: '新名称.jpg' });
      if (change === 'config')
        connection.db
          .update(storageConfigs)
          .set({ configRevision: 2, bucket: 'replacement-bucket' })
          .run();
      if (change === 'default') {
        connection.db
          .update(mediaSettings)
          .set({ defaultLinkVersion: 'watermark' })
          .run();
      }
    };
    if (change === 'default')
      await error(await request(), 404, 'VERSION_UNAVAILABLE');
    else {
      const response = await request();
      expect(response.status).toBe(302);
      const url = new URL(response.headers.get('location')!);
      if (change === 'name')
        expect(url.searchParams.get('response-content-disposition')).toContain(
          '%E6%96%B0%E5%90%8D%E7%A7%B0.jpg.png',
        );
      if (change === 'config')
        expect(url.pathname).toContain('/replacement-bucket/');
      expect(signatures).toHaveLength(2);
      expect(onAccess).toHaveBeenCalledTimes(1);
    }
  },
);
it.each([
  ['STORAGE_OPERATION_FAILED', 502],
  ['STORAGE_TIMEOUT', 504],
] as const)(
  'keeps %s observable without counting or returning a Location',
  async (code, status) => {
    afterSign = () => {
      throw Object.assign(new Error('signing failed'), { code });
    };
    await error(await request(), status, code);
    expect(logger.error).toHaveBeenCalledTimes(1);
  },
);
it('keeps aggregation failure observable without retrying the count or rejecting an authorized redirect', async () => {
  onAccess.mockImplementationOnce(() => {
    throw new Error('collector failed');
  });
  expect((await request()).status).toBe(302);
  expect(onAccess).toHaveBeenCalledTimes(1);
  expect(logger.error).toHaveBeenCalledTimes(1);
});
it('requires the owner throughout trash preview and never counts it', async () => {
  owner = true;
  patchImage({ trashedAt: new Date(), processingStatus: 'failed' });
  expect((await request({}, '?type=original', 'trash-preview')).status).toBe(
    302,
  );
  expect(onAccess).not.toHaveBeenCalled();
  afterSign = () => patchImage({ trashedAt: null });
  await error(
    await request({}, '?type=original', 'trash-preview'),
    404,
    'IMAGE_UNAVAILABLE',
  );
});
