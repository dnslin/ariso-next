import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { collectionFixture } from '../collections/helpers.ts';
import { startProtocolEndpoint } from '../delivery/s3-endpoint.ts';
import { initializeSiteSettings } from '../../../src/server/site/settings.ts';
import { mediaImages, mediaObjects } from '../../../src/server/media/schema.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import { requireLocalStorage } from '../../../src/server/storage/settings.ts';
import { writeObject } from '../../../src/server/storage/local.ts';
import { createSecretCrypto } from '../../../src/server/runtime/crypto.ts';
import { createRuntimeLogger } from '../../../src/server/runtime/logger.ts';
import {
  createImageShare,
  revokeImageShares,
} from '../../../src/server/sharing/image-configuration.ts';
import { prepareImageShareDelivery } from '../../../src/server/sharing/image-delivery.ts';
import * as mediaStorage from '../../../src/server/media/storage.ts';

let fixture: ReturnType<typeof collectionFixture>;
let endpoint: Awaited<ReturnType<typeof startProtocolEndpoint>> | undefined;
const logger = createRuntimeLogger('sharing.image.test', 'fatal');
beforeEach(() => {
  fixture = collectionFixture();
  fixture.db.transaction((tx) =>
    initializeSiteSettings(tx, {
      publicUrl: 'https://images.example.test',
      timeZone: 'Asia/Shanghai',
    }),
  );
});
afterEach(async () => {
  vi.restoreAllMocks();
  await endpoint?.close();
  endpoint = undefined;
  fixture.close();
});
async function seed() {
  const imageId = fixture.image('secret-image');
  fixture.db
    .update(mediaImages)
    .set({
      visibility: 'private',
      processingStatus: 'ready',
      classification: 'static',
      displayName: '秘密名称',
    })
    .where(eq(mediaImages.id, imageId))
    .run();
  const object = fixture.db
    .select()
    .from(mediaObjects)
    .where(eq(mediaObjects.imageId, imageId))
    .get()!;
  const bytes = Buffer.alloc(100, 'a');
  const storage = { ...fixture.storage };
  requireLocalStorage(storage);
  await writeObject(
    fixture.storageRoot,
    storage,
    { key: object.key, temporaryKey: `${object.key}.partial` },
    Readable.from(bytes),
  );
  const share = createImageShare(fixture.db, imageId, {
    sourceVersion: 'original',
  });
  return { imageId, object, bytes, share };
}
function request(token: string, method = 'GET', query = '') {
  return new Request(
    `https://images.example.test/s/image/${token}/media${query}`,
    { method },
  );
}
const options = () => ({
  db: fixture.db,
  storageRoot: fixture.storageRoot,
  temporaryRoot: fixture.storageRoot,
  logger,
});

it('delivers only the token-scoped bytes without leaking names, metadata or a storage redirect', async () => {
  const { share, bytes } = await seed();
  const response = await prepareImageShareDelivery(
    request(share.token),
    share.token,
    options(),
  );
  expect(response.status).toBe(200);
  expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  expect(response.headers.get('x-robots-tag')).toBe('noindex');
  expect(response.headers.get('content-disposition')).not.toContain('秘密');
  expect(response.headers.get('location')).toBeNull();
  const head = await prepareImageShareDelivery(
    request(share.token, 'HEAD'),
    share.token,
    options(),
  );
  expect(head.status).toBe(200);
  expect(await head.text()).toBe('');
  expect(head.headers.get('content-length')).toBe('100');
});

it('rejects version overrides, exact expiry and revocation for GET and HEAD', async () => {
  const { imageId, share } = await seed();
  for (const method of ['GET', 'HEAD']) {
    const override = await prepareImageShareDelivery(
      request(share.token, method, '?type=original'),
      share.token,
      options(),
    );
    expect(override.status).toBe(400);
    const expired = await prepareImageShareDelivery(
      request(share.token, method),
      share.token,
      { ...options(), now: () => new Date(share.expiresAt) },
    );
    expect(expired.status).toBe(410);
  }
  fixture.db.transaction((tx) => revokeImageShares(tx, imageId));
  expect(
    (
      await prepareImageShareDelivery(
        request(share.token),
        share.token,
        options(),
      )
    ).status,
  ).toBe(410);
});

it('rechecks authorization after asynchronous preparation before exposing any bytes', async () => {
  const { imageId, share } = await seed();
  const realRead = mediaStorage.readMediaObject;
  const source = vi
    .spyOn(mediaStorage, 'readMediaObject')
    .mockImplementationOnce(async (...args) => {
      const opened = await realRead(...args);
      fixture.db.transaction((tx) => revokeImageShares(tx, imageId));
      return opened;
    });
  const response = await prepareImageShareDelivery(
    request(share.token),
    share.token,
    options(),
  );
  expect(source).toHaveBeenCalled();
  expect(response.status).toBe(410);
  expect(await response.text()).not.toContain('aaaa');
});

it('proxies S3 content through the cancellable existing reader and never issues a signed redirect', async () => {
  const { imageId, share, bytes, object } = await seed();
  endpoint = await startProtocolEndpoint();
  const remotePath = `/delivery-fixture/ariso/${fixture.storage.id}/${object.key}`;
  endpoint.objects.set(remotePath, { bytes, contentType: 'image/png' });
  const crypto = createSecretCrypto(randomBytes(32));
  fixture.db
    .update(storageConfigs)
    .set({
      type: 's3',
      localPath: null,
      endpoint: endpoint.target.endpoint,
      bucket: endpoint.target.bucket,
      region: endpoint.target.region,
      pathPrefix: '',
      forcePathStyle: true,
      accessKeyEncrypted: crypto.encryptSecret(
        endpoint.target.credentials.accessKeyId,
      ),
      secretKeyEncrypted: crypto.encryptSecret(
        endpoint.target.credentials.secretAccessKey,
      ),
    })
    .where(eq(storageConfigs.id, fixture.storage.id))
    .run();
  const errors = vi.fn();
  const response = await prepareImageShareDelivery(
    request(share.token),
    share.token,
    {
      ...options(),
      secretCrypto: crypto,
      logger: { info: vi.fn(), error: errors },
    },
  );
  expect(response.status, String(errors.mock.calls[0]?.[0]?.err)).toBe(200);
  expect(response.headers.get('location')).toBeNull();
  expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
  expect(endpoint.requests).toEqual([{ method: 'GET', path: remotePath }]);
  fixture.db.transaction((tx) => revokeImageShares(tx, imageId));
  expect(
    (
      await prepareImageShareDelivery(request(share.token), share.token, {
        ...options(),
        secretCrypto: crypto,
      })
    ).status,
  ).toBe(410);
  expect(endpoint.requests).toHaveLength(1);
});

it('closing the response consumer disposes the object source', async () => {
  const { share } = await seed();
  const source = new Readable({
    read() {
      this.push(Buffer.alloc(100));
    },
  });
  vi.spyOn(mediaStorage, 'readMediaObject').mockResolvedValueOnce({
    stream: source,
  });
  const response = await prepareImageShareDelivery(
    request(share.token),
    share.token,
    options(),
  );
  await response.body!.cancel();
  expect(source.destroyed).toBe(true);
});
