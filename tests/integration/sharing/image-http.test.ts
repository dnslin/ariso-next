import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { launchLocalDelivery } from '../delivery/local-fixture.ts';
import { mediaImages } from '../../../src/server/media/schema.ts';

let app: Awaited<ReturnType<typeof launchLocalDelivery>>;
let asset: Awaited<ReturnType<typeof app.seed>>;
beforeAll(async () => {
  app = await launchLocalDelivery();
  asset = await app.seed();
  app.db
    .update(mediaImages)
    .set({ visibility: 'private' })
    .where(eq(mediaImages.id, asset.imageId))
    .run();
}, 30000);
afterAll(async () => {
  await app?.close();
});

it('enforces real owner sessions and source checks, serves an independent anonymous view, and revokes its private bytes', async () => {
  const endpoint = `${app.origin}/api/images/${asset.imageId}/share`;
  expect((await fetch(endpoint)).status).toBe(401);
  expect(
    (
      await fetch(endpoint, {
        headers: { authorization: `Bearer ${app.token}` },
      })
    ).status,
  ).toBe(401);
  const setup = await fetch(endpoint, { headers: { cookie: app.cookie } });
  expect(setup.status).toBe(200);
  expect(await setup.json()).toMatchObject({
    share: null,
    sourceVersion: 'original',
  });
  const body = JSON.stringify({ sourceVersion: 'original', hours: 1 });
  expect(
    (
      await fetch(endpoint, {
        method: 'POST',
        headers: {
          cookie: app.cookie,
          origin: 'https://unrelated.example',
          'content-type': 'application/json',
        },
        body,
      })
    ).status,
  ).toBe(403);
  const created = await fetch(endpoint, {
    method: 'POST',
    headers: {
      cookie: app.cookie,
      origin: app.origin,
      'content-type': 'application/json',
    },
    body,
  });
  expect(created.status).toBe(200);
  const { share } = await created.json();
  const page = await fetch(`${app.origin}/s/image/${share.token}`);
  expect(page.status).toBe(200);
  expect(page.headers.get('cache-control')).toContain('no-store');
  expect(page.headers.get('referrer-policy')).toBe('no-referrer');
  const html = await page.text();
  expect(html).toContain('临时图片分享');
  expect(html).not.toContain('旅行.final');
  const media = `${app.origin}/s/image/${share.token}/media`;
  const bytes = await fetch(media, { redirect: 'manual' });
  expect(bytes.status).toBe(200);
  expect(bytes.headers.get('location')).toBeNull();
  expect(Buffer.from(await bytes.arrayBuffer())).toEqual(asset.bytes);
  expect(
    (
      await fetch(`${app.origin}/i/${asset.imageId}?type=original`, {
        redirect: 'manual',
      })
    ).status,
  ).toBe(401);
  expect((await fetch(`${media}?type=original`)).status).toBe(400);
  const listing = await fetch(`${app.origin}/api/shares/images`, {
    headers: { cookie: app.cookie },
  });
  expect(await listing.json()).toMatchObject({
    total: 1,
    items: [{ imageId: asset.imageId }],
  });
  const revoked = await fetch(endpoint, {
    method: 'DELETE',
    headers: { cookie: app.cookie, origin: app.origin },
  });
  expect(revoked.status).toBe(200);
  expect((await fetch(media, { method: 'HEAD' })).status).toBe(410);
  const unavailablePage = await fetch(`${app.origin}/s/image/${share.token}`);
  expect(unavailablePage.status).toBe(410);
  expect(await unavailablePage.text()).not.toContain('旅行.final');
});
