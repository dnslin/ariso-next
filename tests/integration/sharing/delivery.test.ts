import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { mediaImages } from '../../../src/server/media/schema.ts';
import { openSharingFixture } from '../../experiments/sharing/fixture.ts';
import { launchLocalDelivery } from '../delivery/local-fixture.ts';

let app: Awaited<ReturnType<typeof launchLocalDelivery>>;
let sharing: ReturnType<typeof openSharingFixture>;
let asset: Awaited<ReturnType<typeof app.seed>>;
let shareCookie: string;

beforeAll(async () => {
  sharing = openSharingFixture(':memory:', () => 1800000000000);
  const share = await sharing.seed('production-boundary', 'share-password');
  const grant = await sharing.unlock(share.token, 'share-password');
  expect(grant.status).toBe(200);
  expect(grant.grantSecret).toBeTruthy();
  expect(sharing.read(share.token, grant.grantSecret, 'items').status).toBe(
    200,
  );
  shareCookie = `ariso_share_grant=${grant.grantSecret}`;
  app = await launchLocalDelivery();
  asset = await app.seed();
}, 30000);

afterAll(async () => {
  try {
    await app?.close();
  } finally {
    sharing?.close();
  }
});

async function content(method: 'GET' | 'HEAD', cookie: string) {
  // Forward the real grant deliberately, even though its browser Path is /s/{token}.
  // The production handler must reject it independently of browser Cookie scoping.
  const response = await fetch(
    `${app.origin}/i/${asset.imageId}?type=original`,
    {
      method,
      headers: { cookie },
      signal: AbortSignal.timeout(10000),
      redirect: 'manual',
    },
  );
  expect(response.headers.get('cache-control')).toBe(
    'private, no-store, no-transform',
  );
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  return response;
}

it('a genuine share grant reads public bytes but never authorizes private GET or HEAD; the genuine owner session does', async () => {
  for (const method of ['GET', 'HEAD'] as const) {
    const response = await content(method, shareCookie);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-length')).toBe(
      String(asset.bytes.length),
    );
    if (method === 'GET')
      expect(Buffer.from(await response.arrayBuffer())).toEqual(asset.bytes);
    else expect(await response.text()).toBe('');
  }

  app.db
    .update(mediaImages)
    .set({ visibility: 'private' })
    .where(eq(mediaImages.id, asset.imageId))
    .run();

  for (const method of ['GET', 'HEAD'] as const) {
    const denied = await content(method, shareCookie);
    expect(denied.status).toBe(401);
    if (method === 'GET')
      expect(await denied.json()).toMatchObject({
        code: 'OWNER_LOGIN_REQUIRED',
      });
    else expect(await denied.text()).toBe('');

    const owner = await content(method, app.cookie);
    expect(owner.status).toBe(200);
    expect(owner.headers.get('content-length')).toBe(
      String(asset.bytes.length),
    );
    if (method === 'GET')
      expect(Buffer.from(await owner.arrayBuffer())).toEqual(asset.bytes);
    else expect(await owner.text()).toBe('');
  }
});

it('the production storage management route rejects a genuine share grant and accepts a genuine owner session', async () => {
  const request = (cookie: string) =>
    fetch(`${app.origin}/api/storages`, {
      headers: { cookie },
      signal: AbortSignal.timeout(10000),
      redirect: 'manual',
    });
  const denied = await request(shareCookie);
  expect(denied.status).toBe(401);
  expect(denied.headers.get('cache-control')).toBe('no-store');
  expect(await denied.json()).toMatchObject({ code: 'UNAUTHORIZED' });

  const owner = await request(app.cookie);
  expect(owner.status).toBe(200);
  expect(owner.headers.get('cache-control')).toBe('no-store');
  await owner.json();
});
