import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { account, session, user } from '../../../src/server/identity/schema.ts';
import { siteSettings } from '../../../src/server/site/schema.ts';
import { launch, stop } from '../runtime/process-helpers.ts';
import { seedAuthOwner, email, password } from './auth-fixture.ts';
import { hasSecureAttribute } from './cookie-attributes.ts';

let directory: string;
let server: Awaited<ReturnType<typeof launch>>;
let connection: ReturnType<typeof openRuntimeDatabase>;
let env: Record<string, string>;
let origin: string;
const day = 86400000;
let requestIp = 0;
const cookies = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
function request(path: string, init: RequestInit = {}) {
  return fetch(`http://127.0.0.1:${server.port}/api/auth/${path}`, {
    ...init,
    redirect: 'manual',
    signal: AbortSignal.timeout(10000),
  });
}
function post(
  path: string,
  body: object = {},
  headers: Record<string, string> = {},
) {
  return request(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `192.0.2.${++requestIp}`,
      origin,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
async function login(body: object = {}) {
  const response = await post('sign-in/email', { email, password, ...body });
  expect(response.status, await response.clone().text()).toBe(200);
  return response;
}
async function getSession(cookie: string) {
  return request('get-session', { headers: { cookie } });
}
async function ready() {
  await vi.waitFor(
    async () => {
      if (server.child.exitCode !== null) throw new Error(server.logs());
      const response = await fetch(
        `http://127.0.0.1:${server.port}/api/health`,
        { signal: AbortSignal.timeout(1000) },
      );
      expect(response.status).toBe(200);
    },
    { timeout: 15000 },
  );
}
function owner(
  cookie = '',
  method = 'GET',
  requestOrigin = origin,
  headers: Record<string, string> = {},
  query = '',
) {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        resolve('tests/integration/identity/auth-process.ts'),
        JSON.stringify({
          url: `${origin}/admin${query}`,
          method,
          headers: { cookie, origin: requestOrigin, ...headers },
        }),
      ],
      { env: { ...process.env, ...env }, encoding: 'utf8', timeout: 10000 },
    )
      .trim()
      .split('\n')
      .at(-1)!,
  );
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ariso-production-auth-'));
  env = {
    DATA_DIR: join(directory, 'data'),
    HOST: '127.0.0.1',
    BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
    ARISO_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
  };
  server = await launch(resolve('.next/standalone'), directory, env);
  await ready();
  origin = `http://127.0.0.1:${server.port}`;
  connection = openRuntimeDatabase(join(env.DATA_DIR, 'ariso.db'));
}, 30000);
afterEach(async () => {
  if (server) await stop(server.child, server.closed);
  connection?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

it('uninitialized production auth requests return setup-required without creating an owner', async () => {
  const loginPage = await fetch(`${origin}/login?setup=completed`);
  const loginHtml = await loginPage.text();
  expect(loginHtml).toContain('站点尚未初始化');
  expect(loginHtml).not.toContain('初始化已完成');
  for (const path of ['get-session', 'sign-in/email', 'sign-up/email']) {
    const response = await post(path);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'SETUP_REQUIRED' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  }
  expect(owner()).toEqual({ status: 401, code: 'UNAUTHORIZED' });
  expect(connection.db.select().from(user).all()).toEqual([]);
});

describe('initialized production auth', () => {
  beforeEach(async () => {
    await seedAuthOwner(connection, origin);
  });

  it('renders the login form when the return destination is malformed', async () => {
    const response = await fetch(
      `${origin}/login?returnTo=${encodeURIComponent('/\n/[')}`,
    );
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('login-heading');
    expect(html).toContain('current-password');
  });

  it('protects the real admin page independently of navigation, including expired and revoked Cookie replay', async () => {
    const page = (headers: Record<string, string> = {}) =>
      fetch(`${origin}/admin`, { headers, redirect: 'manual' });
    const anonymousHeaders: Record<string, string>[] = [
      {},
      { authorization: 'Bearer upload-token', cookie: 'share_access=granted' },
    ];
    for (const headers of anonymousHeaders) {
      const response = await page(headers);
      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe('/login?returnTo=%2Fadmin');
      expect(await response.text()).not.toContain(email);
    }
    const serverComponent = await fetch(`${origin}/admin?_rsc`, {
      headers: { RSC: '1' },
    });
    const componentBody = await serverComponent.text();
    expect(componentBody).toContain('/login?returnTo=%2Fadmin');
    expect(componentBody).not.toContain(email);
    const cookie = cookies(await login());
    const allowed = await page({ cookie });
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get('cache-control')).toContain('no-store');
    expect(await allowed.text()).toContain(email);
    connection.db
      .update(session)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .run();
    const expired = await page({ cookie });
    expect(expired.status).toBe(307);
    expect(expired.headers.get('location')).toBe(
      '/login?returnTo=%2Fadmin&reason=expired',
    );
    expect(await expired.text()).not.toContain(email);
    const fresh = cookies(await login());
    expect((await post('sign-out', {}, { cookie: fresh })).status).toBe(200);
    const replay = await page({ cookie: fresh });
    expect(replay.status).toBe(307);
    expect(await replay.text()).not.toContain(email);
    const notice = await fetch(
      `${origin}/login?reason=expired&returnTo=https://evil.test`,
    );
    const html = await notice.text();
    expect(html).toContain('会话已失效');
    expect(html).not.toContain('"returnTo":"https://evil.test"');
  });

  it('production constraints reject invalid owners and duplicate providers; incomplete identity is explicit', async () => {
    for (const value of ['NULL', '0', '2']) {
      expect(() =>
        connection.db.$client.exec(`UPDATE user SET owner_slot = ${value}`),
      ).toThrow();
    }
    expect(() =>
      connection.db
        .insert(user)
        .values({ id: 'second', name: 'Second', email: 'second@example.test' })
        .run(),
    ).toThrow();
    const credential = connection.db.select().from(account).get()!;
    expect(() =>
      connection.db
        .insert(account)
        .values({ ...credential, id: 'duplicate' })
        .run(),
    ).toThrow();
    const settings = connection.db.select().from(siteSettings).get()!;
    connection.db.delete(siteSettings).run();
    try {
      expect(owner()).toEqual({ status: 500, code: 'IDENTITY_INCOMPLETE' });
    } finally {
      connection.db.insert(siteSettings).values(settings).run();
    }
    connection.db.delete(account).run();
    try {
      expect(owner()).toEqual({ status: 500, code: 'IDENTITY_INCOMPLETE' });
    } finally {
      connection.db.insert(account).values(credential).run();
    }
  });

  it('real login normalizes email and keeps seven-day host-only HttpOnly cookies even with rememberMe false', async () => {
    const response = await login({
      email: '  OWNER@EXAMPLE.TEST ',
      rememberMe: false,
    });
    const raw = response.headers.getSetCookie();
    expect(raw).toHaveLength(1);
    for (const attribute of [
      'ariso.session_token=',
      'HttpOnly',
      'SameSite=Lax',
      'Path=/',
      'Max-Age=604800',
    ])
      expect(raw[0]).toContain(attribute);
    expect(raw[0]).not.toContain('Domain=');
    expect(hasSecureAttribute(raw[0])).toBe(false);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const cookie = cookies(response);
    expect((await (await getSession(cookie)).json()).user.email).toBe(email);
    expect(owner(cookie).user.email).toBe(email);
    expect(owner(cookie, 'POST').user.email).toBe(email);
    expect(owner(cookie, 'POST', 'https://foreign.example')).toEqual({
      status: 403,
      code: 'INVALID_ORIGIN',
    });
    expect(owner(cookie, 'POST', '')).toEqual({
      status: 403,
      code: 'INVALID_ORIGIN',
    });
    expect(owner('invalid')).toEqual({ status: 401, code: 'UNAUTHORIZED' });
    const invalid = await post('sign-in/email', {
      email,
      password: 'wrong-password',
    });
    expect(invalid.status).toBe(401);
    expect(invalid.headers.getSetCookie()).toEqual([]);
    const padded = await post('sign-in/email', {
      email,
      password: ` ${password} `,
    });
    expect(padded.status).toBe(401);
    expect(padded.headers.getSetCookie()).toEqual([]);
  }, 30000);

  it.each(['{', undefined, 'null', '[]'])(
    'login body %s is a client error',
    async (body) => {
      const response = await request('sign-in/email', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin,
          'x-forwarded-for': `192.0.2.${++requestIp}`,
        },
        body,
      });
      expect(
        response.status,
        `body=${String(body)}: ${await response.clone().text()}`,
      ).toBe(400);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.getSetCookie()).toEqual([]);
    },
  );

  it('only a signed session cookie grants ownership; bearer, share cookie and claimed userId do not', async () => {
    const response = await login();
    const signed = cookies(response);
    const { token, user: loggedInUser } = await response.json();
    expect(token).toEqual(expect.any(String));
    expect(owner(signed).user.id).toBe(loggedInUser.id);
    const unauthorized = { status: 401, code: 'UNAUTHORIZED' };
    expect(
      owner('', 'GET', origin, { authorization: `Bearer ${token}` }),
    ).toEqual(unauthorized);
    expect(owner(`ariso.share_token=${encodeURIComponent(token)}`)).toEqual(
      unauthorized,
    );
    expect(
      owner('', 'GET', origin, {
        'x-user-id': loggedInUser.id,
        userId: loggedInUser.id,
      }),
    ).toEqual(unauthorized);
    expect(
      owner(
        '',
        'GET',
        origin,
        {},
        `?userId=${encodeURIComponent(loggedInUser.id)}`,
      ),
    ).toEqual(unauthorized);
    const bearerSession = await request('get-session', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(bearerSession.status).toBe(200);
    expect(await bearerSession.json()).toBeNull();
  }, 30000);

  it('only the three delivered path/method pairs are reachable and all forbidden mutations leave data unchanged', async () => {
    const before = connection.db.select().from(user).all();
    for (const path of [
      'sign-up/email',
      'sign-in/social',
      'callback/github',
      'link-social',
      'unlink-account',
      'update-user',
      'change-password',
      'request-password-reset',
      'reset-password',
      'delete-user',
      'list-sessions',
      'revoke-sessions',
      'unknown',
    ]) {
      for (const method of [
        'GET',
        'POST',
        'PUT',
        'PATCH',
        'DELETE',
        'HEAD',
        'OPTIONS',
      ]) {
        const response = await request(path, { method });
        expect(response.status, `${method} ${path}`).toBe(404);
      }
    }
    for (const [path, allowed] of [
      ['get-session', 'GET'],
      ['sign-in/email', 'POST'],
      ['sign-out', 'POST'],
    ]) {
      for (const method of [
        'GET',
        'POST',
        'PUT',
        'PATCH',
        'DELETE',
        'HEAD',
        'OPTIONS',
      ].filter((m) => m !== allowed))
        expect(
          (await request(path, { method })).status,
          `${method} ${path}`,
        ).toBe(404);
    }
    expect(connection.db.select().from(user).all()).toEqual(before);
    expect(connection.db.select().from(account).all()).toHaveLength(1);
  }, 30000);

  it('real sessions renew after one day, expire after seven days, and logout revokes only its own cookie', async () => {
    const first = cookies(await login());
    const second = cookies(await login());
    expect(first).not.toBe(second);
    const initial = await (await getSession(first)).json();
    const id = initial.session.id;
    const row = () =>
      connection.db.select().from(session).where(eq(session.id, id)).get()!;
    expect(row().expiresAt.getTime() - row().createdAt.getTime()).toBeCloseTo(
      7 * day,
      -3,
    );
    expect((await getSession(first)).headers.getSetCookie()).toEqual([]);
    const now = Date.now();
    connection.db
      .update(session)
      .set({
        createdAt: new Date(now - day - 60000),
        updatedAt: new Date(now - day - 60000),
        expiresAt: new Date(now + 6 * day - 60000),
      })
      .where(eq(session.id, id))
      .run();
    const renewed = await getSession(first);
    expect(renewed.headers.getSetCookie().join(';')).toContain(
      'Max-Age=604800',
    );
    expect(row().expiresAt.getTime()).toBeGreaterThanOrEqual(
      now + 7 * day - 1000,
    );
    const logout = await post('sign-out', {}, { cookie: first });
    expect(logout.status).toBe(200);
    expect(logout.headers.getSetCookie().join(';')).toContain('Max-Age=0');
    expect(await (await getSession(first)).json()).toBeNull();
    expect(owner(first)).toEqual({ status: 401, code: 'UNAUTHORIZED' });
    const other = await (await getSession(second)).json();
    expect(other.user.email).toBe(email);
    connection.db
      .update(session)
      .set({ expiresAt: new Date(Date.now() - 1) })
      .where(eq(session.id, other.session.id))
      .run();
    expect(await (await getSession(second)).json()).toBeNull();
    expect(owner(second)).toEqual({ status: 401, code: 'UNAUTHORIZED' });
  }, 30000);

  it.each(['read', 'delete'])(
    'logout %s failure preserves the cookie and reports failure until a successful retry',
    async (fault) => {
      const loginResponse = await login();
      const cookie = cookies(loginResponse);
      const { token } = await loginResponse.json();
      const logOffset = server.logs().length;
      if (fault === 'read')
        connection.db.$client.exec(
          'ALTER TABLE session RENAME TO unavailable_session',
        );
      else
        connection.db.$client.exec(
          "CREATE TRIGGER reject_logout BEFORE DELETE ON session BEGIN SELECT RAISE(ABORT, 'injected logout deletion failure'); END",
        );
      try {
        const response = await post('sign-out', {}, { cookie });
        expect(response.status).toBe(500);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(response.headers.getSetCookie()).toEqual([]);
        await vi.waitFor(() =>
          expect(server.logs().slice(logOffset)).toContain(
            fault === 'read' ? 'session' : 'injected logout deletion failure',
          ),
        );
        const diagnostics = server.logs().slice(logOffset);
        for (const value of [token, cookie, password])
          expect(diagnostics).not.toContain(value);
      } finally {
        if (fault === 'read')
          connection.db.$client.exec(
            'ALTER TABLE unavailable_session RENAME TO session',
          );
        else connection.db.$client.exec('DROP TRIGGER reject_logout');
      }
      expect((await (await getSession(cookie)).json()).user.email).toBe(email);
      const retry = await post('sign-out', {}, { cookie });
      expect(retry.status).toBe(200);
      expect(retry.headers.getSetCookie().join(';')).toContain('Max-Age=0');
      expect(await (await getSession(cookie)).json()).toBeNull();
    },
    30000,
  );

  it('saved origin A→B→A changes secure-cookie behavior and rejects foreign or missing write origins', async () => {
    const a = origin;
    const b = `https://localhost:${server.port}`;
    for (const current of [a, b, a]) {
      origin = current;
      connection.db.update(siteSettings).set({ publicUrl: current }).run();
      const response = await login();
      const raw = response.headers.getSetCookie()[0];
      expect(hasSecureAttribute(raw)).toBe(current === b);
      expect(raw.startsWith('__Secure-')).toBe(current === b);
      const cookie = cookies(response);
      for (const bad of ['', current === a ? b : a]) {
        const denied = await post('sign-out', {}, { cookie, origin: bad });
        expect(denied.status).toBe(403);
        const deniedLogin = await post(
          'sign-in/email',
          { email, password },
          { cookie, origin: bad },
        );
        expect(deniedLogin.status).toBe(403);
      }
      const externalCallback = await post('sign-in/email', {
        email,
        password,
        callbackURL: 'https://foreign.example/admin',
      });
      expect(externalCallback.status).toBe(403);
      expect((await (await getSession(cookie)).json()).user.email).toBe(email);
      expect(owner(cookie, 'POST').user.email).toBe(email);
      expect((await post('sign-out', {}, { cookie })).status).toBe(200);
    }
  }, 30000);

  it('production login limiting survives saved-origin instance refresh', async () => {
    const a = origin;
    const b = `http://localhost:${server.port}`;
    const headers = { 'x-forwarded-for': '198.51.100.53' };
    for (let attempt = 0; attempt < 3; attempt++) {
      expect(
        (await post('sign-in/email', { email, password }, headers)).status,
      ).toBe(200);
    }
    for (const current of [a, b, a]) {
      origin = current;
      connection.db.update(siteSettings).set({ publicUrl: current }).run();
      const response = await post(
        'sign-in/email',
        { email, password },
        headers,
      );
      expect(response.status).toBe(429);
      expect(Number(response.headers.get('x-retry-after'))).toBeGreaterThan(0);
    }
  });

  it('a new process with rotated Secret rejects old cookies while retaining persisted identity and session rows', async () => {
    const cookie = cookies(await login());
    const snapshot = () => ({
      users: connection.db.select().from(user).all(),
      accounts: connection.db.select().from(account).all(),
      sessions: connection.db.select().from(session).all(),
    });
    const before = snapshot();
    const pid = server.child.pid;
    env.PORT = String(server.port);
    await stop(server.child, server.closed);
    env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
    server = await launch(resolve('.next/standalone'), directory, env);
    await ready();
    expect(server.child.pid).not.toBe(pid);
    expect(await (await getSession(cookie)).json()).toBeNull();
    expect(owner(cookie)).toEqual({ status: 401, code: 'UNAUTHORIZED' });
    expect(snapshot()).toEqual(before);
    const fresh = cookies(await login());
    expect((await (await getSession(fresh)).json()).user.email).toBe(email);
  }, 30000);
});
