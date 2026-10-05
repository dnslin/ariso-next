import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { launchSharing } from '../../experiments/sharing/harness.ts';

type Share = { id: string; token: string; revision: number };
type Body = {
  albumName: string;
  layout: 'grid' | 'masonry';
  showName: boolean;
  items: { id: string; displayName?: string }[];
};
type Probe = {
  grantCount: number;
  gates: { id: string; kind: string; entered: number }[];
};
let app: Awaited<ReturnType<typeof launchSharing>>;
let serial = 0;
const now = 1800000000000;
const day = 24 * 60 * 60 * 1000;
const password = ' sharing password ';
const cookies = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
const path = (share: Share, suffix = '') => `/s/${share.token}${suffix}`;
const cache = (response: Response) => {
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  expect(response.headers.get('x-robots-tag')).toBe('noindex');
};
const post = (
  target: string,
  body: object,
  headers: Record<string, string> = {},
) =>
  app.request(target, {
    method: 'POST',
    headers: {
      origin: app.origin,
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
const unlock = (share: Share, value = password, origin = app.origin) =>
  post(path(share, '/unlock'), { password: value }, { origin });
const clock = (value: number) => app.control({ action: 'clock', now: value });
const change = (share: Share, patch: object) =>
  app.control<Share>({ action: 'change', id: share.id, patch });
const seed = (value: string | null = password) =>
  app.control<Share>({
    action: 'seed',
    id: `case-${++serial}`,
    password: value,
  });
const probe = async (): Promise<Probe> =>
  (await app.request('/control')).json();
const items = (share: Share, cookie = '') =>
  app.request(path(share, '/items'), { headers: { cookie } });

async function endpoints(share: Share, cookie = '') {
  return Promise.all([
    app.request(path(share), { headers: { cookie } }),
    items(share, cookie),
    app.request(path(share, '/neighbors?imageId=img-040'), {
      headers: { cookie },
    }),
    post(
      path(share, '/refresh'),
      { ids: ['img-000', 'private-image', 'trashed-image'] },
      { cookie },
    ),
  ]);
}
async function denied(share: Share, status: number, cookie = '') {
  for (const response of await endpoints(share, cookie)) {
    expect(response.status).toBe(status);
    cache(response);
    const body = await response.text();
    expect(body).not.toContain(`album-${share.id}`);
    expect(body).not.toContain('img-000');
    expect(body).not.toContain('private-image');
    expect(body).not.toContain('trashed-image');
    expect(body).not.toContain('PRIVATE NAME');
    expect(body).not.toContain('TRASH NAME');
    expect(body).not.toContain('passwordHash');
    expect(response.headers.getSetCookie()).toHaveLength(0);
  }
}

beforeAll(async () => {
  app = await launchSharing(AbortSignal.timeout(150000));
}, 180000);
beforeEach(async () => {
  await clock(now);
});
afterAll(async () => {
  if (app) {
    await mkdir('test-results/sharing', { recursive: true });
    await writeFile('test-results/sharing/server.log', app.logs());
    await app.stop();
  }
});

it('real password validation preserves spaces and case, accepts NFKC equivalents, and issues a scoped opaque Cookie', async () => {
  const share = await seed(' ＡbＣ ');
  const before = (await probe()).grantCount;
  for (const value of [' Abc ', 'AbC', 'wrong']) {
    const response = await unlock(share, value);
    expect(response.status).toBe(401);
    cache(response);
    expect(await response.json()).toEqual({ status: 401 });
    expect(response.headers.getSetCookie()).toHaveLength(0);
  }
  expect((await probe()).grantCount).toBe(before);
  const response = await unlock(share, ' AbC ');
  expect(response.status).toBe(200);
  cache(response);
  expect(await response.json()).toEqual({ status: 200 });
  const raw = response.headers.getSetCookie();
  expect(raw).toHaveLength(1);
  expect(raw[0]).toMatch(/^ariso_share_grant=[A-Za-z0-9_-]{43};/);
  for (const attribute of ['HttpOnly', `Path=${path(share)}`, 'Max-Age=86400'])
    expect(raw[0]).toContain(attribute);
  expect(raw[0]).toMatch(/(?:^|;)\s*SameSite=lax(?:;|$)/i);
  expect(raw[0]).not.toMatch(/(?:^|;)\s*Secure(?:;|$)/);
  expect(raw[0]).not.toContain('Domain=');
  expect((await items(share, cookies(response))).status).toBe(200);
});

it('the HTTP password schema counts Unicode code points and rejects empty or overlong values without grants', async () => {
  const value = '😀'.repeat(128);
  const share = await seed(value);
  const before = (await probe()).grantCount;
  for (const invalid of ['', `${value}😀`]) {
    const response = await unlock(share, invalid);
    expect(response.status).toBe(400);
    cache(response);
    expect(await response.json()).toEqual({ status: 400 });
    expect(response.headers.getSetCookie()).toHaveLength(0);
  }
  expect((await probe()).grantCount).toBe(before);
  expect((await unlock(share, value)).status).toBe(200);
});

it('the persisted grant expires at exactly 24 hours and browsing or refresh never slides its deadline', async () => {
  const share = await seed();
  const cookie = cookies(await unlock(share));
  await clock(now + day - 1);
  for (const response of await endpoints(share, cookie)) {
    expect(response.status).toBe(200);
    cache(response);
    expect(response.headers.getSetCookie()).toHaveLength(0);
    await response.text();
  }
  await clock(now + day);
  await denied(share, 401, cookie);
  await clock(now + day + 1);
  await denied(share, 401, cookie);
});

it('future deadline edits retain a live grant while the latest share deadline always wins', async () => {
  const share = await seed();
  const token = share.token;
  const cookie = cookies(await unlock(share));
  const extended = await change(share, { expiresAt: now + 10000 });
  expect(extended).toMatchObject({ token, revision: share.revision });
  await clock(now + 1000);
  const shortened = await change(share, { expiresAt: now + 2000 });
  expect(shortened).toMatchObject({ token, revision: share.revision });
  await clock(now + 1999);
  expect((await items(share, cookie)).status).toBe(200);
  await clock(now + 2000);
  await denied(share, 410, cookie);
});

it('editing an already expired share revokes its grant even without a request at expiration', async () => {
  for (const restoredExpiry of [null, now + 10000]) {
    const share = await seed();
    const cookie = cookies(await unlock(share));
    await change(share, { expiresAt: now + 1000 });
    await clock(now + 1000);
    const restored = await change(share, { expiresAt: restoredExpiry });
    expect(restored).toMatchObject({
      token: share.token,
      revision: share.revision + 1,
    });
    await denied(share, 401, cookie);
    expect((await unlock(share)).status).toBe(200);
    await clock(now);
  }
});

it('layout and name settings preserve authorization and return only the current public projection', async () => {
  const share = await seed();
  const cookie = cookies(await unlock(share));
  const changed = await change(share, { layout: 'masonry', showName: true });
  expect(changed).toMatchObject({
    token: share.token,
    revision: share.revision,
  });
  const shown: Body = await (await items(share, cookie)).json();
  expect(shown).toMatchObject({ layout: 'masonry', showName: true });
  expect(shown.items).toHaveLength(161);
  expect(shown.items[0]).toEqual({
    id: 'img-000',
    displayName: 'name-img-000',
  });
  await change(share, { showName: false });
  for (const response of await endpoints(share, cookie)) {
    expect(response.status).toBe(200);
    cache(response);
    const body = await response.text();
    for (const field of [
      'displayName',
      'name-img-',
      'private-image',
      'trashed-image',
      'originalName',
      'passwordHash',
      'storageId',
      'EXIF',
      'GPS',
    ])
      expect(body).not.toContain(field);
  }
});

it('setting, replacing and clearing a password keep the address and revoke every earlier grant', async () => {
  const share = await seed(null);
  expect((await items(share)).status).toBe(200);
  await change(share, { password });
  await denied(share, 401);
  const first = cookies(await unlock(share));
  const replacement = await change(share, { password: 'replacement' });
  expect(replacement.token).toBe(share.token);
  await denied(share, 401, first);
  expect((await unlock(share)).status).toBe(401);
  const second = cookies(await unlock(share, 'replacement'));
  const cleared = await change(share, { password: null });
  expect(cleared.token).toBe(share.token);
  expect((await items(share)).status).toBe(200);
  await change(share, { password: 'third' });
  await denied(share, 401, second);
  expect((await unlock(share, 'third')).status).toBe(200);
});

it('closing and reopening preserves the Token and requires a new password grant', async () => {
  const share = await seed();
  const cookie = cookies(await unlock(share));
  const closed = await change(share, { enabled: false });
  expect(closed.token).toBe(share.token);
  await denied(share, 410, cookie);
  await change(share, { enabled: true });
  await denied(share, 401, cookie);
  expect((await unlock(share)).status).toBe(200);
});

it('rotating permanently rejects the old address and deleting cascades the share and its grants', async () => {
  const share = await seed();
  const cookie = cookies(await unlock(share));
  const rotated = await change(share, { rotate: true });
  expect(rotated.token).not.toBe(share.token);
  await denied(share, 404, cookie);
  await denied(rotated, 401, cookie);
  const fresh = cookies(await unlock(rotated));
  const before = (await probe()).grantCount;
  await change(rotated, { deleted: true });
  await denied(rotated, 404, fresh);
  expect((await probe()).grantCount).toBe(before - 1);
});

it('a real process restart preserves owner sessions and the share grant without renewing either Cookie', async () => {
  const share = await seed();
  const shareCookie = cookies(await unlock(share));
  const ownerCookie = await app.login();
  const before = (await probe()).grantCount;
  await clock(now + 1000);
  await app.restart();
  expect((await probe()).grantCount).toBe(before);
  const response = await items(share, shareCookie);
  expect(response.status).toBe(200);
  expect(response.headers.getSetCookie()).toHaveLength(0);
  expect(
    (await app.request('/owner', { headers: { cookie: ownerCookie } })).status,
  ).toBe(200);
  await denied(share, 401);
}, 60000);

it('all four anonymous entries share the same authorization boundary and never expand for an owner', async () => {
  const share = await seed();
  const ownerCookie = await app.login();
  await denied(share, 401);
  await denied(share, 401, ownerCookie);
  const shareCookie = cookies(await unlock(share));
  for (const ownerSuffix of ['', `; ${ownerCookie}`]) {
    const response = await items(share, `${shareCookie}${ownerSuffix}`);
    expect(response.status).toBe(200);
    const body: Body = await response.json();
    expect(body.items.map((item) => item.id)).toEqual(
      Array.from(
        { length: 161 },
        (_, index) => `img-${String(index).padStart(3, '0')}`,
      ),
    );
    expect(body.items.every((item) => Object.keys(item).join() === 'id')).toBe(
      true,
    );
  }
  for (const target of ['/owner']) {
    expect((await app.request(target)).status).toBe(401);
    expect(
      (await app.request(target, { headers: { cookie: shareCookie } })).status,
    ).toBe(401);
    expect(
      (await app.request(target, { headers: { cookie: ownerCookie } })).status,
    ).toBe(200);
  }
});

it('share grants stay independent across albums and simultaneous verification in one album', async () => {
  const a = await seed();
  const b = await seed();
  const before = (await probe()).grantCount;
  const [a1, a2, b1] = await Promise.all([unlock(a), unlock(a), unlock(b)]);
  expect([a1.status, a2.status, b1.status]).toEqual([200, 200, 200]);
  expect(cookies(a1)).not.toBe(cookies(a2));
  expect((await probe()).grantCount).toBe(before + 3);
  expect((await items(a, cookies(a1))).status).toBe(200);
  expect((await items(a, cookies(a2))).status).toBe(200);
  expect((await items(b, cookies(b1))).status).toBe(200);
  await denied(a, 401, cookies(b1));
  await denied(b, 401, cookies(a1));
  await change(a, { enabled: false });
  expect((await items(b, cookies(b1))).status).toBe(200);
});

it('anonymous writes reject foreign or absent origins and HTTPS configuration adds Secure to the share Cookie', async () => {
  const share = await seed();
  const before = (await probe()).grantCount;
  for (const origin of ['', 'https://untrusted.example']) {
    for (const response of [
      await unlock(share, password, origin),
      await post(path(share, '/refresh'), { ids: ['img-000'] }, { origin }),
    ]) {
      expect(response.status).toBe(403);
      cache(response);
      expect(await response.json()).toEqual({ status: 403 });
      expect(response.headers.getSetCookie()).toHaveLength(0);
    }
  }
  expect((await probe()).grantCount).toBe(before);
  const config = join(app.directory, 'config.json');
  const original = await readFile(config, 'utf8');
  try {
    const httpsOrigin = 'https://sharing.example.test';
    await writeFile(config, JSON.stringify({ origin: httpsOrigin, now }));
    const response = await unlock(share, password, httpsOrigin);
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()[0]).toMatch(
      /(?:^|;)\s*Secure(?:;|$)/,
    );
    expect(response.headers.getSetCookie()[0]).toContain(`Path=${path(share)}`);
    expect((await unlock(share)).status).toBe(403);
  } finally {
    await writeFile(config, original);
  }
});

it('refresh accepts at most 80 explicit IDs and never reveals private, trashed or unknown members', async () => {
  const share = await seed();
  const cookie = cookies(await unlock(share));
  const ids = Array.from(
    { length: 80 },
    (_, index) => `img-${String(index).padStart(3, '0')}`,
  );
  const accepted = await post(path(share, '/refresh'), { ids }, { cookie });
  expect(accepted.status).toBe(200);
  cache(accepted);
  expect(
    ((await accepted.json()) as Body).items.map((item) => item.id),
  ).toEqual(ids);
  const rejected = await post(
    path(share, '/refresh'),
    { ids: [...ids, 'img-080'] },
    { cookie },
  );
  expect(rejected.status).toBe(400);
  cache(rejected);
  expect(await rejected.json()).toEqual({ status: 400 });
  const privateOnly = await post(
    path(share, '/refresh'),
    { ids: ['private-image', 'trashed-image', 'missing-image'] },
    { cookie },
  );
  expect(privateOnly.status).toBe(200);
  expect(((await privateOnly.json()) as Body).items).toEqual([]);
});

it('password verification races with password changes, close, expiry, Token rotation and deletion without issuing any stale grant', async () => {
  const scenarios = [
    { patch: { password: 'changed' }, status: 409 },
    { patch: { enabled: false }, status: 410 },
    { patch: { expiresAt: now + 1 }, status: 410, expire: true },
    { patch: { rotate: true }, status: 404 },
    { patch: { deleted: true }, status: 404 },
  ];
  for (const scenario of scenarios) {
    await clock(now);
    const share = await seed();
    if (scenario.expire) await change(share, scenario.patch);
    const before = (await probe()).grantCount;
    await app.control({
      action: 'gate',
      id: share.id,
      kind: 'unlock',
      enabled: true,
    });
    const pending = unlock(share);
    try {
      await vi.waitFor(
        async () => {
          expect(
            (await probe()).gates.find(
              (gate) => gate.id === share.id && gate.kind === 'unlock',
            )?.entered,
          ).toBe(1);
        },
        { timeout: 10000 },
      );
      if (scenario.expire) await clock(now + 1);
      else await change(share, scenario.patch);
    } finally {
      await app.control({ action: 'release', id: share.id, kind: 'unlock' });
    }
    const response = await pending;
    expect(response.status).toBe(scenario.status);
    cache(response);
    expect(await response.json()).toEqual({ status: scenario.status });
    expect(response.headers.getSetCookie()).toHaveLength(0);
    expect((await probe()).grantCount).toBe(before);
  }
}, 60000);
