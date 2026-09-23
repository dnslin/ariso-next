import { rm } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { session } from '../../../src/server/identity/schema.ts';
import {
  mediaImages,
  mediaSettings,
} from '../../../src/server/media/schema.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import { launchLocalDelivery } from './local-fixture.ts';

let app: Awaited<ReturnType<typeof launchLocalDelivery>>;
let asset: Awaited<ReturnType<typeof app.seed>>;
beforeEach(async () => {
  app = await launchLocalDelivery();
  asset = await app.seed();
}, 30000);
afterEach(async () => {
  await app?.close();
});
async function request(
  query = '?type=original',
  init: RequestInit = {},
  id: string = asset.imageId,
) {
  const response = await fetch(`${app.origin}/i/${id}${query}`, {
    ...init,
    signal: AbortSignal.timeout(10000),
    redirect: 'manual',
  });
  expect(response.headers.get('cache-control')).toBe(
    'private, no-store, no-transform',
  );
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  return response;
}
function update(values: Partial<typeof mediaImages.$inferInsert>) {
  app.db
    .update(mediaImages)
    .set(values)
    .where(eq(mediaImages.id, asset.imageId))
    .run();
}
it('delivers exact bytes and real HEAD, conditions, Range and attachment responses', async () => {
  const get = await request();
  expect(get.status).toBe(200);
  expect(get.headers.get('content-type')).toBe('image/png');
  expect(get.headers.get('x-ariso-image-version')).toBe('original');
  expect(Number(get.headers.get('content-length'))).toBe(asset.bytes.length);
  expect(Buffer.from(await get.arrayBuffer())).toEqual(asset.bytes);
  const etag = get.headers.get('etag')!;
  const head = await request('?type=original', { method: 'HEAD' });
  expect(head.status).toBe(200);
  expect(head.headers.get('content-length')).toBe(String(asset.bytes.length));
  expect(await head.text()).toBe('');
  for (const method of ['GET', 'HEAD']) {
    for (const headers of [
      { 'if-none-match': etag },
      { 'if-none-match': '*' },
      { 'if-none-match': `W/${etag}` },
    ] as Record<string, string>[]) {
      const result = await request('?type=original', { method, headers });
      expect(result.status).toBe(304);
      expect(await result.text()).toBe('');
    }
    const failure = await request('?type=original', {
      method,
      headers: { 'if-match': '"other"' },
    });
    expect(failure.status).toBe(412);
    if (method === 'HEAD') expect(await failure.text()).toBe('');
    else
      expect(await failure.json()).toMatchObject({
        code: 'PRECONDITION_FAILED',
      });
  }
  const range = await request('?type=original', {
    headers: { range: 'bytes=0-3' },
  });
  expect(range.status).toBe(200);
  expect(range.headers.get('accept-ranges')).toBe('none');
  expect(Buffer.from(await range.arrayBuffer())).toEqual(asset.bytes);
  const download = await request('?type=original&download=1');
  expect(download.headers.get('content-disposition')).toContain(
    "filename*=UTF-8''%E6%97%85%E8%A1%8C.final.png",
  );
  expect(download.headers.get('content-disposition')).toMatch(/^attachment;/);
  await download.arrayBuffer();
  const svg = await app.seed(true);
  const response = await request('?type=original', {}, svg.imageId);
  expect(response.headers.get('content-type')).toBe('image/svg+xml');
  expect(response.headers.get('content-disposition')).toMatch(/^attachment;/);
  expect(Buffer.from(await response.arrayBuffer())).toEqual(svg.bytes);
});
it('reads current default, rejects missing versions and never exposes private state to other credentials', async () => {
  app.db.update(mediaSettings).set({ defaultLinkVersion: 'original' }).run();
  expect((await request('')).status).toBe(200);
  app.db.update(mediaSettings).set({ defaultLinkVersion: 'compressed' }).run();
  expect((await request('')).status).toBe(404);
  expect((await request('?type=original')).status).toBe(200);
  update({ visibility: 'private', processingStatus: 'failed' });
  app.db.update(storageConfigs).set({ enabled: false }).run();
  for (const headers of [
    {},
    { authorization: `Bearer ${app.token}` },
    { cookie: `ariso.share_token=${app.token}` },
  ] as Record<string, string>[]) {
    const denied = await request('?type=watermark', { headers });
    expect(denied.status).toBe(401);
    expect(await denied.json()).toMatchObject({ code: 'OWNER_LOGIN_REQUIRED' });
  }
  app.db.update(storageConfigs).set({ enabled: true }).run();
  expect(
    (await request('?type=original', { headers: { cookie: app.cookie } }))
      .status,
  ).toBe(200);
  app.db.delete(session).run();
  const revoked = await request('?type=original', {
    headers: { cookie: app.cookie, 'if-none-match': '*' },
  });
  expect(revoked.status).toBe(401);
});
it('rechecks lifecycle, storage and actual files before evaluating conditions', async () => {
  for (const processingStatus of ['pending', 'processing', 'failed'] as const) {
    update({ processingStatus });
    expect((await request()).status).toBe(409);
    expect(
      (await request('?type=original', { headers: { cookie: app.cookie } }))
        .status,
    ).toBe(200);
  }
  update({ processingStatus: 'ready', trashedAt: new Date() });
  for (const headers of [{}, { cookie: app.cookie }] as Record<
    string,
    string
  >[])
    expect((await request('?type=original', { headers })).status).toBe(404);
  update({ trashedAt: null });
  for (const deletionStatus of ['deleting', 'cleanup_failed'] as const) {
    update({ deletionStatus });
    expect((await request()).status).toBe(404);
  }
  update({ deletionStatus: null });
  app.db.update(storageConfigs).set({ enabled: false }).run();
  expect((await request()).status).toBe(409);
  app.db.update(storageConfigs).set({ enabled: true }).run();
  expect((await request()).status).toBe(200);
  await rm(asset.path);
  const missing = await request('?type=original', {
    headers: { 'if-none-match': '*' },
  });
  expect(missing.status).toBe(404);
});
it('returns explicit no-store method and parameter errors through Next HTTP', async () => {
  for (const query of [
    '?type=',
    '?type=unknown',
    '?type=original&type=original',
    '?download=0',
    '?download=1&download=1',
  ])
    expect((await request(query)).status).toBe(400);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    const response = await request('', { method });
    expect(response.status).toBe(method === 'OPTIONS' ? 204 : 405);
    expect(response.headers.get('allow')).toBe('GET, HEAD, OPTIONS');
  }
  expect((await request('?type=original', {}, 'missing')).status).toBe(404);
});
