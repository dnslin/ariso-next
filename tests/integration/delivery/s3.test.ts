import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { analyticsImageTotals } from '../../../src/server/analytics/schema.ts';
import {
  mediaImages,
  mediaObjects,
  mediaSettings,
  mediaVersions,
  versionKinds,
} from '../../../src/server/media/schema.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import { launchProtocolDelivery } from './s3-fixture.ts';

let app: Awaited<ReturnType<typeof launchProtocolDelivery>>;
beforeAll(async () => {
  app = await launchProtocolDelivery();
}, 30000);
afterAll(async () => {
  await app?.close();
});

async function request(
  id: string,
  query = '?type=original',
  init: RequestInit = {},
) {
  const response = await fetch(`${app.origin}/i/${id}${query}`, {
    ...init,
    redirect: 'manual',
    signal: AbortSignal.timeout(10000),
  });
  expect(response.headers.get('cache-control')).toBe(
    'private, no-store, no-transform',
  );
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  return response;
}

it('signs GET and HEAD for 300 seconds and applies final download/cache headers over real Next HTTP', async () => {
  const signatures: string[] = [];
  for (const method of ['GET', 'HEAD']) {
    const response = await request(
      app.publicAsset.imageId,
      '?type=original&download=1',
      { method, headers: { cookie: app.cookie } },
    );
    expect(response.status).toBe(302);
    expect(await response.text()).toBe('');
    expect(response.headers.get('x-ariso-image-version')).toBe('original');
    const signed = new URL(response.headers.get('location')!);
    signatures.push(signed.searchParams.get('X-Amz-Signature')!);
    expect(signed.searchParams.get('X-Amz-Expires')).toBe('300');
    if (method === 'GET') {
      expect(signed.searchParams.get('response-cache-control')).toBe(
        'private, no-store, no-transform',
      );
      expect(signed.searchParams.get('response-content-disposition')).toMatch(
        /^attachment;/,
      );
      expect(signed.searchParams.get('response-content-disposition')).toContain(
        "filename*=UTF-8''%E6%97%85%E8%A1%8C.final.png",
      );
    }
    const remote = await fetch(signed, { method });
    expect(remote.status).toBe(200);
    if (method === 'GET')
      expect(Buffer.from(await remote.arrayBuffer())).toEqual(
        app.publicAsset.bytes,
      );
    else expect(await remote.text()).toBe('');
  }
  expect(new Set(signatures).size).toBe(2);
});

it('uses the same owner and anonymous permission boundary for all four versions', async () => {
  for (const kind of versionKinds) {
    const query = `?type=${kind}`;
    for (const headers of [
      {},
      { authorization: `Bearer ${app.token}` },
      { cookie: `ariso.share_token=${app.token}` },
    ] as Record<string, string>[]) {
      expect(
        (await request(app.privateAsset.imageId, query, { headers })).status,
      ).toBe(401);
    }
    expect(
      (
        await request(app.privateAsset.imageId, query, {
          headers: { cookie: app.cookie },
        })
      ).status,
    ).toBe(302);
    // Owner/public accesses are excluded from aggregation as well.
    expect(
      (
        await request(app.publicAsset.imageId, query, {
          headers: { cookie: app.cookie },
        })
      ).status,
    ).toBe(302);
  }
  for (const values of [
    { processingStatus: 'failed' as const },
    { processingStatus: 'ready' as const, trashedAt: new Date() },
    { trashedAt: null, deletionStatus: 'deleting' as const },
    { deletionStatus: 'cleanup_failed' as const },
  ]) {
    app.db
      .update(mediaImages)
      .set(values)
      .where(eq(mediaImages.id, app.privateAsset.imageId))
      .run();
    for (const kind of versionKinds) {
      expect(
        (await request(app.privateAsset.imageId, `?type=${kind}`)).status,
      ).toBe(401);
      const owner = await request(app.privateAsset.imageId, `?type=${kind}`, {
        headers: { cookie: app.cookie },
      });
      expect(owner.status).toBe(
        values.processingStatus === 'failed' ? 302 : 404,
      );
    }
  }
  app.db
    .update(mediaImages)
    .set({ processingStatus: 'ready', trashedAt: null, deletionStatus: null })
    .where(eq(mediaImages.id, app.privateAsset.imageId))
    .run();
  app.db
    .update(storageConfigs)
    .set({ enabled: false })
    .where(eq(storageConfigs.id, app.storageId))
    .run();
  for (const kind of versionKinds)
    expect(
      (
        await request(app.privateAsset.imageId, `?type=${kind}`, {
          headers: { cookie: app.cookie },
        })
      ).status,
    ).toBe(409);
  app.db
    .update(storageConfigs)
    .set({ enabled: true })
    .where(eq(storageConfigs.id, app.storageId))
    .run();
});

it('keeps SVG bytes and .svg attachment, falls back only for an inapplicable default, and rejects missing applicable versions', async () => {
  app.db.update(mediaSettings).set({ defaultLinkVersion: 'compressed' }).run();
  const response = await request(app.svgAsset.imageId, '', {
    headers: { cookie: app.cookie },
  });
  expect(response.status).toBe(302);
  expect(response.headers.get('x-ariso-image-version')).toBe('original');
  const remote = await fetch(response.headers.get('location')!);
  expect(remote.headers.get('content-type')).toBe('application/octet-stream');
  expect(remote.headers.get('content-disposition')).toMatch(/^attachment;/);
  expect(remote.headers.get('content-disposition')).toContain('.svg');
  expect(Buffer.from(await remote.arrayBuffer())).toEqual(app.svgAsset.bytes);
  expect((await request(app.svgAsset.imageId, '?type=compressed')).status).toBe(
    404,
  );
  const missing = await app.seed();
  expect((await request(missing.imageId, '')).status).toBe(404);
  expect(
    (
      await request(missing.imageId, '?type=original', {
        headers: { cookie: app.cookie },
      })
    ).status,
  ).toBe(302);
  // A missing published thumbnail remains unavailable even for an owner.
  app.db
    .delete(mediaVersions)
    .where(eq(mediaVersions.imageId, missing.imageId))
    .run();
  expect(
    (
      await request(missing.imageId, '?type=original', {
        headers: { cookie: app.cookie },
      })
    ).status,
  ).toBe(404);
});

it('flushes real analytics once per successful anonymous Ariso GET and excludes HEAD, owner and denial', async () => {
  const asset = await app.seed({ fourVersions: true });
  for (const kind of versionKinds) {
    const redirect = await request(asset.imageId, `?type=${kind}`);
    expect(redirect.status).toBe(302);
    const location = redirect.headers.get('location')!;
    // Following the remote signature twice never returns through Ariso's collector.
    for (let count = 0; count < 2; count++)
      await (await fetch(location)).arrayBuffer();
    expect(
      (await request(asset.imageId, `?type=${kind}`, { method: 'HEAD' }))
        .status,
    ).toBe(302);
    expect(
      (
        await request(asset.imageId, `?type=${kind}`, {
          headers: { cookie: app.cookie },
        })
      ).status,
    ).toBe(302);
  }
  expect((await request('missing')).status).toBe(404);
  const lost = await app.seed();
  const object = app.db
    .select()
    .from(mediaObjects)
    .where(eq(mediaObjects.id, lost.objectId))
    .get()!;
  await app.storage.deleteObject(object.key);
  const remoteRequests = app.endpoint.requests.length;
  const signedMissing = await request(lost.imageId);
  expect(signedMissing.status).toBe(302);
  expect(app.endpoint.requests.length).toBe(remoteRequests);
  expect((await fetch(signedMissing.headers.get('location')!)).status).toBe(
    404,
  );
  await app.shutdown();
  expect(
    app.db
      .select()
      .from(analyticsImageTotals)
      .where(eq(analyticsImageTotals.imageId, asset.imageId))
      .get(),
  ).toMatchObject({ originalCount: 1, compressedCount: 1, watermarkCount: 1 });
  expect(
    app.db
      .select()
      .from(analyticsImageTotals)
      .where(eq(analyticsImageTotals.imageId, app.privateAsset.imageId))
      .get(),
  ).toBeUndefined();
  expect(
    app.db
      .select()
      .from(analyticsImageTotals)
      .where(eq(analyticsImageTotals.imageId, lost.imageId))
      .get(),
  ).toMatchObject({ originalCount: 1 });
});
