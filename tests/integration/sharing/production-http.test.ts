import { writeFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { albums } from '../../../src/server/collections/schema.ts';
import { mediaImages } from '../../../src/server/media/schema.ts';
import {
  requireSiteSettings,
  updateSiteSettings,
} from '../../../src/server/site/settings.ts';
import { readShareAccess } from '../../../src/server/sharing/authorization.ts';
import {
  albumShares,
  shareGrants,
} from '../../../src/server/sharing/schema.ts';
import { launchLocalDelivery } from '../delivery/local-fixture.ts';

let app: Awaited<ReturnType<typeof launchLocalDelivery>>;
beforeAll(async () => {
  app = await launchLocalDelivery();
}, 30000);
afterAll(async () => {
  if (app)
    writeFileSync('test-results/sharing-production-server.log', app.logs());
  await app?.close();
});
function album() {
  const id = randomUUID();
  app.db
    .insert(albums)
    .values({
      id,
      name: '协议相册',
      description: '不能泄露',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();
  return id;
}
const request = (
  path: string,
  method = 'GET',
  body?: unknown,
  headers: Record<string, string> = { cookie: app.cookie, origin: app.origin },
) =>
  fetch(`${app.origin}${path}`, {
    method,
    headers: { ...headers, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
async function create(password = ' 密码Ａ ') {
  const id = album();
  const response = await request(`/api/albums/${id}/share`, 'POST', {
    password: { action: 'set', value: password },
  });
  expect(response.status).toBe(200);
  const { share } = await response.json();
  return { id, share, path: `/api/albums/${id}/share` };
}
const unlock = (
  token: string,
  password = ' 密码A ',
  headers: Record<string, string> = { origin: app.origin },
) => request(`/s/${token}/unlock`, 'POST', { password }, headers);

it('protects every management route with real owner sessions and write origins; validates strict JSON', async () => {
  const id = album();
  const path = `/api/albums/${id}/share`;
  for (const [url, method] of [
    [path, 'GET'],
    [path, 'POST'],
    [path, 'PATCH'],
    [`${path}/rotate`, 'POST'],
    ['/api/shares', 'GET'],
  ]) {
    for (const headers of [
      {},
      { authorization: `Bearer ${app.token}` },
      { cookie: 'ariso_share_grant=unrelated' },
    ] as Record<string, string>[]) {
      const response = await request(
        url,
        method,
        method === 'GET' ? undefined : {},
        headers,
      );
      expect(response.status).toBe(401);
    }
    if (method !== 'GET')
      for (const origin of ['', 'https://other.test'])
        expect(
          (await request(url, method, {}, { cookie: app.cookie, origin }))
            .status,
        ).toBe(403);
  }
  expect(await (await request(path)).json()).toEqual({ share: null });
  expect((await request('/api/albums/missing/share')).status).toBe(404);
  for (const body of [
    { password: '' },
    { password: { action: 'set', value: '' } },
    { expiresAt: '2040-01-01T00:00:00' },
    { enabled: false },
    { layout: 'invalid' },
  ])
    expect((await request(path, 'POST', body)).status).toBe(400);
  const malformed = await fetch(`${app.origin}${path}`, {
    method: 'POST',
    headers: {
      cookie: app.cookie,
      origin: app.origin,
      'content-type': 'application/json',
    },
    body: '{',
  });
  expect(malformed.status).toBe(400);
});

it('returns actual configuration and pagination without credentials; duplicate create and rotate preserve settings', async () => {
  const { id, share, path } = await create();
  expect(share).toMatchObject({
    albumId: id,
    hasPassword: true,
    layout: 'grid',
    showName: false,
    enabled: true,
    url: `${app.origin}/s/${share.token}`,
  });
  expect(JSON.stringify(share)).not.toContain('passwordHash');
  expect(JSON.stringify(share)).not.toContain('密码');
  for (const body of [
    { password: null },
    { token: 'client-chosen-token' },
    { layout: 'invalid' },
  ])
    expect((await request(path, 'POST', body)).status).toBe(400);
  expect(
    await (
      await request(path, 'POST', {
        layout: 'masonry',
        password: { action: 'clear' },
      })
    ).json(),
  ).toEqual({ share });
  const patched = (
    await (
      await request(path, 'PATCH', { layout: 'masonry', showName: true })
    ).json()
  ).share;
  expect(patched).toMatchObject({
    token: share.token,
    hasPassword: true,
    layout: 'masonry',
    showName: true,
  });
  const list = await request('/api/shares?pageSize=20&q=协议');
  expect((await list.json()).items).toContainEqual({
    ...patched,
    publicImageCount: 0,
    cover: {
      imageId: null,
      displayName: null,
      status: 'empty',
      thumbnailUrl: null,
    },
  });
  for (const query of ['pageSize=30', 'page=0', 'page=1&page=2', 'unknown=1'])
    expect((await request(`/api/shares?${query}`)).status).toBe(400);
  const rotated = (await (await request(`${path}/rotate`, 'POST')).json())
    .share;
  expect(rotated).toMatchObject({
    id: share.id,
    hasPassword: true,
    layout: 'masonry',
    showName: true,
  });
  expect(rotated.token).not.toBe(share.token);
  expect((await unlock(share.token)).status).toBe(404);
  expect((await request(path, 'PATCH', {})).status).toBe(400);
});

it('issues path-scoped fixed cookies after real Unicode password checks and rejects origins/input/expired shares', async () => {
  const { share, path } = await create();
  for (const origin of ['', 'https://other.test'])
    expect((await unlock(share.token, ' 密码A ', { origin })).status).toBe(403);
  expect((await unlock(share.token, 'wrong')).status).toBe(401);
  for (const password of ['', '🙂'.repeat(129)])
    expect((await unlock(share.token, password)).status).toBe(400);
  const response = await unlock(share.token);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ unlocked: true });
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  expect(response.headers.get('x-robots-tag')).toBe('noindex');
  const setCookie = response.headers.getSetCookie()[0];
  expect(setCookie).toContain(`Path=/s/${share.token}`);
  expect(setCookie).toMatch(/HttpOnly/i);
  expect(setCookie).toMatch(/SameSite=lax/i);
  expect(setCookie).toMatch(/Max-Age=86400/i);
  expect(setCookie).not.toMatch(/Domain=|Secure/i);
  const secret = setCookie.split(';')[0].split('=')[1];
  const grant = app.db
    .select()
    .from(shareGrants)
    .where(eq(shareGrants.shareId, share.id))
    .get()!;
  expect(grant.grantSecretHash).toHaveLength(64);
  expect(grant.grantSecretHash).not.toBe(secret);
  expect(grant.expiresAt.getTime() - grant.verifiedAt.getTime()).toBe(86400000);
  expect(
    app.db.transaction((tx) =>
      readShareAccess(tx, {
        token: share.token,
        grantSecret: secret,
        now: new Date(),
      }),
    ).allowed,
  ).toBe(true);
  expect(
    (
      await unlock(share.token, 'wrong', {
        origin: app.origin,
        cookie: app.cookie,
      })
    ).status,
  ).toBe(401);
  await request(path, 'PATCH', { enabled: false });
  expect((await unlock(share.token)).status).toBe(410);
});

it('sets Secure in the real response when the canonical site uses HTTPS', async () => {
  const { share } = await create();
  const { publicUrl: previousUrl, timeZone } = requireSiteSettings(app.db);
  const publicUrl = 'https://sharing.example.test';
  try {
    app.db.transaction((tx) => updateSiteSettings(tx, { publicUrl, timeZone }));
    const response = await unlock(share.token, ' 密码A ', {
      origin: publicUrl,
    });
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()[0]).toMatch(/; Secure(?:;|$)/i);
  } finally {
    app.db.transaction((tx) =>
      updateSiteSettings(tx, { publicUrl: previousUrl, timeZone }),
    );
  }
});

it('two albums and two tabs produce independent successful grants; global load and twenty guesses get 429', async () => {
  const first = await create('correct');
  const second = await create('correct');
  const responses = await Promise.all([
    unlock(first.share.token, 'correct'),
    unlock(second.share.token, 'correct'),
  ]);
  expect(responses.map((r) => r.status)).toEqual([200, 200]);
  const tabs = await Promise.all([
    unlock(first.share.token, 'correct'),
    unlock(first.share.token, 'correct'),
  ]);
  expect(tabs.map((r) => r.status)).toEqual([200, 200]);
  expect(
    app.db
      .select()
      .from(shareGrants)
      .where(eq(shareGrants.shareId, first.share.id))
      .all(),
  ).toHaveLength(3);
  const burst = await Promise.all(
    Array.from({ length: 8 }, () => unlock(second.share.token, 'wrong')),
  );
  expect(burst.filter((r) => r.status === 401)).toHaveLength(2);
  expect(burst.filter((r) => r.status === 429)).toHaveLength(6);
  for (const response of burst.filter((r) => r.status === 429))
    expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0);
  const bounded = await create('correct');
  for (let i = 0; i < 20; i++)
    expect((await unlock(bounded.share.token, 'wrong')).status).toBe(401);
  const rejected = await unlock(bounded.share.token, 'correct');
  expect(rejected.status).toBe(429);
  expect(Number(rejected.headers.get('retry-after'))).toBeGreaterThan(0);
}, 15000);

it('a production grant never authorizes management or private bytes; deletion cascades without deleting images', async () => {
  const { id, share } = await create('correct');
  const granted = await unlock(share.token, 'correct');
  const cookie = granted.headers.getSetCookie()[0].split(';')[0];
  expect(
    (await request('/api/shares', 'GET', undefined, { cookie })).status,
  ).toBe(401);
  const asset = await app.seed();
  app.db
    .update(mediaImages)
    .set({ visibility: 'private' })
    .where(eq(mediaImages.id, asset.imageId))
    .run();
  expect(
    (
      await request(`/i/${asset.imageId}?type=original`, 'GET', undefined, {
        cookie,
      })
    ).status,
  ).toBe(401);
  expect((await request(`/api/albums/${id}`, 'DELETE')).status).toBe(200);
  expect(
    app.db.select().from(albumShares).where(eq(albumShares.id, share.id)).get(),
  ).toBeUndefined();
  expect(
    app.db
      .select()
      .from(shareGrants)
      .where(eq(shareGrants.shareId, share.id))
      .all(),
  ).toEqual([]);
  expect(
    app.db
      .select()
      .from(mediaImages)
      .where(eq(mediaImages.id, asset.imageId))
      .get(),
  ).toBeDefined();
  expect((await unlock(share.token, 'correct')).status).toBe(404);
});

it('real database errors are diagnostic 500 responses; logs redact password, paths, cookies and grant secrets', async () => {
  const { share, path } = await create('diagnostic-password');
  app.db.$client.exec(
    "CREATE TRIGGER reject_share_grant BEFORE INSERT ON share_grants BEGIN SELECT RAISE(ABORT, 'test grant write failure'); END",
  );
  try {
    const encodedToken = `%${share.token.charCodeAt(0).toString(16)}${share.token.slice(1)}`;
    const response = await unlock(encodedToken, 'diagnostic-password');
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    });
  } finally {
    app.db.$client.exec('DROP TRIGGER reject_share_grant');
  }
  app.db.$client.exec(
    "CREATE TRIGGER reject_share_update BEFORE UPDATE ON album_shares BEGIN SELECT RAISE(ABORT, 'test share write failure'); END",
  );
  try {
    expect((await request(path, 'PATCH', { layout: 'masonry' })).status).toBe(
      500,
    );
  } finally {
    app.db.$client.exec('DROP TRIGGER reject_share_update');
  }
  await vi.waitFor(() =>
    expect(app.logs()).toContain('test grant write failure'),
  );
  expect(app.logs()).toContain('test share write failure');
  expect(app.logs()).toContain('/s/[Redacted]/unlock');
  expect(app.logs()).not.toContain(share.token);
  expect(app.logs()).not.toContain('diagnostic-password');
  const response = await unlock(share.token, 'diagnostic-password');
  expect(response.status).toBe(200);
  expect(app.logs()).not.toContain(
    response.headers.getSetCookie()[0].split(';')[0].split('=')[1],
  );
});
