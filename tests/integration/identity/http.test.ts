import { request as httpRequest } from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { hasSecureAttribute } from './cookie-attributes.ts';
import {
  createFixtureAuth,
  openFixture,
  seedOwner,
} from '../../experiments/identity/fixture.ts';
import { launchIdentity } from '../../experiments/identity/http-process.ts';
import { account, session, user } from '../../experiments/identity/schema.ts';

let directory: string;
let connection: ReturnType<typeof openFixture>;
let server: Awaited<ReturnType<typeof launchIdentity>>;
let origin: string;
let config: string;
const secret = randomBytes(32).toString('hex');
const email = 'owner@example.test';
const password = 'identity-experiment-password';
let ip = 0;
const cookies = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
const setOrigin = (value: string) => {
  origin = value;
  writeFileSync(config, JSON.stringify({ origin }));
};
const request = (path: string, init: RequestInit = {}) =>
  fetch(`http://127.0.0.1:${server.port}${path}`, {
    ...init,
    redirect: 'manual',
    signal: AbortSignal.timeout(30000),
  });
function post(
  path: string,
  body: object,
  headers: Record<string, string> = {},
) {
  return request(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin,
      'x-experiment-ip': `192.0.2.${++ip}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
const signIn = (headers: Record<string, string> = {}) =>
  post('/api/auth/sign-in/email', { email, password }, headers);
async function ready() {
  await vi.waitFor(() => expect(server.logs()).toContain('Ready in'), {
    timeout: 30000,
  });
  expect((await request('/')).status, server.logs()).toBe(200);
}
beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), 'ariso-identity-http-'));
  config = join(directory, 'config.json');
  connection = openFixture(join(directory, 'auth.db'));
  await seedOwner(connection.db, email, password);
  server = await launchIdentity(join(directory, 'auth.db'), config, secret);
  setOrigin(`http://127.0.0.1:${server.port}`);
  await ready();
}, 60000);
afterAll(async () => {
  if (server) await server.stop();
  connection?.close();
  if (directory) rmSync(directory, { recursive: true, force: true });
});

it('direct credential seed logs in over Next HTTP, real Cookie agrees with server API and logout revokes it', async () => {
  const response = await signIn();
  expect(response.status, await response.clone().text()).toBe(200);
  const raw = response.headers.getSetCookie();
  expect(raw).toHaveLength(1);
  expect(raw[0]).toMatch(/ariso-identity-experiment.session_token=/);
  for (const attribute of [
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    'Max-Age=604800',
  ])
    expect(raw[0]).toContain(attribute);
  expect(raw[0]).not.toContain('Secure');
  expect(raw[0]).not.toContain('Domain=');
  expect(await response.json()).toMatchObject({ user: { email } });
  const cookie = cookies(response);
  const http = await request('/api/auth/get-session', { headers: { cookie } });
  const body = await http.json();
  expect(body.user).toMatchObject({ email, emailVerified: false });
  expect(body.user).not.toHaveProperty('ownerSlot');
  const api = await request('/probe/session', { headers: { cookie } });
  expect(await api.json()).toEqual(body);
  expect(await (await request('/api/auth/get-session')).json()).toBeNull();
  const updated = await post(
    '/api/auth/update-user',
    { ownerSlot: 2 },
    { cookie },
  );
  expect(updated.status).toBe(400);
  expect(await updated.json()).toMatchObject({ code: 'FIELD_NOT_ALLOWED' });
  expect(connection.db.select().from(user).get()?.ownerSlot).toBe(1);
  const logout = await post('/api/auth/sign-out', {}, { cookie });
  expect(logout.status).toBe(200);
  expect(logout.headers.getSetCookie().join(';')).toContain('Max-Age=0');
  expect(
    await (
      await request('/api/auth/get-session', { headers: { cookie } })
    ).json(),
  ).toBeNull();
  expect(
    await (await request('/probe/session', { headers: { cookie } })).json(),
  ).toBeNull();
}, 60000);

it('public registration stays disabled at HTTP and trusted API boundaries', async () => {
  const body = { name: 'Other', email: 'other@example.test', password };
  const response = await post('/api/auth/sign-up/email', body);
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({
    code: 'EMAIL_PASSWORD_SIGN_UP_DISABLED',
  });
  const auth = createFixtureAuth(connection.db, origin, secret);
  await expect(auth.api.signUpEmail({ body })).rejects.toMatchObject({
    body: { code: 'EMAIL_PASSWORD_SIGN_UP_DISABLED' },
  });
  expect(connection.db.select().from(user).all()).toHaveLength(1);
});

it('A→B→A refreshes Secure Cookies, rejects the previous origin and checks raw CSRF responses', async () => {
  const a = `http://127.0.0.1:${server.port}`;
  const b = `https://localhost:${server.port}`;
  for (const [current, previous] of [
    [a, b],
    [b, a],
    [a, b],
  ]) {
    setOrigin(current);
    const login = await signIn();
    expect(login.status).toBe(200);
    const raw = login.headers.getSetCookie()[0];
    expect(hasSecureAttribute(raw)).toBe(current.startsWith('https:'));
    expect(raw.startsWith('__Secure-')).toBe(current.startsWith('https:'));
    const cookie = cookies(login);
    const bad = await signIn({ origin: previous, cookie });
    expect(bad.status).toBe(403);
    expect(await bad.json()).toMatchObject({ code: 'INVALID_ORIGIN' });
    const missing = await post(
      '/api/auth/sign-out',
      {},
      { origin: '', cookie },
    );
    expect(missing.status).toBe(403);
    const externalCallback = await post('/api/auth/sign-in/email', {
      email,
      password,
      callbackURL: `${previous}/private`,
    });
    expect(externalCallback.status).toBe(403);
    const http = await (
      await request('/api/auth/get-session', { headers: { cookie } })
    ).json();
    expect(http.user.email).toBe(email);
    expect(
      await (await request('/probe/session', { headers: { cookie } })).json(),
    ).toEqual(http);
    const logout = await post('/api/auth/sign-out', {}, { cookie });
    expect(logout.status).toBe(200);
    expect(logout.headers.getSetCookie().join(';')).toContain('Max-Age=0');
    expect(hasSecureAttribute(logout.headers.getSetCookie()[0])).toBe(
      current.startsWith('https:'),
    );
  }
  // Node fetch overwrites Sec-Fetch-Mode with cors. Send the real navigation headers verbatim.
  const csrf = await new Promise<Response>((resolve, reject) => {
    const req = httpRequest(
      `http://127.0.0.1:${server.port}/api/auth/sign-in/email`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin,
          'sec-fetch-site': 'cross-site',
          'sec-fetch-mode': 'navigate',
          'sec-fetch-dest': 'document',
          'x-experiment-ip': '203.0.113.52',
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () =>
          resolve(
            new Response(Buffer.concat(chunks), { status: res.statusCode }),
          ),
        );
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('CSRF request timeout')));
    req.end(JSON.stringify({ email, password }));
  });
  expect(csrf.status).toBe(403);
  expect(await csrf.json()).toMatchObject({
    code: 'CROSS_SITE_NAVIGATION_LOGIN_BLOCKED',
  });
}, 60000);

it('A→B→A does not reset the HTTP limiter; trusted signIn API is not a public HTTP substitute', async () => {
  const a = `http://127.0.0.1:${server.port}`;
  const b = `http://localhost:${server.port}`;
  const headers = { 'x-experiment-ip': '198.51.100.52' };
  setOrigin(a);
  for (let i = 0; i < 3; i++) expect((await signIn(headers)).status).toBe(200);
  for (const current of [a, b, a]) {
    setOrigin(current);
    const limited = await signIn(headers);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('x-retry-after'))).toBeGreaterThan(0);
  }
  // The library's trusted API intentionally bypasses router-level CSRF/rate limiting.
  const direct = await post(
    '/probe/sign-in',
    { email, password },
    { ...headers, origin: 'https://untrusted.example' },
  );
  expect(direct.status).toBe(200);
  expect(direct.headers.getSetCookie()).not.toHaveLength(0);
}, 30000);

it('OAuth state is browser-bound, survives A→B→A instance refresh and consumes once without contacting GitHub', async () => {
  const a = `http://127.0.0.1:${server.port}`;
  const b = `http://localhost:${server.port}`;
  for (const current of [a, b, a]) {
    setOrigin(current);
    const response = await post('/api/auth/sign-in/social', {
      provider: 'github',
      callbackURL: `${current}/`,
      disableRedirect: true,
    });
    expect(response.status).toBe(200);
    const authorization = new URL((await response.json()).url);
    expect(authorization.origin).toBe('https://github.com');
    expect(authorization.searchParams.get('redirect_uri')).toBe(
      `${current}/api/auth/callback/github`,
    );
    const state = authorization.searchParams.get('state');
    expect(state).toBeTruthy();
    const cookie = cookies(response);
    expect(response.headers.getSetCookie()[0]).toContain('HttpOnly');
    const callback = `/api/auth/callback/github?state=${state}&error=access_denied`;
    const missing = await request(callback);
    expect(missing.status).toBe(302);
    expect(missing.headers.get('location')).toContain('error=state_mismatch');
    // Refresh twice, then consume the original browser state in the original origin.
    setOrigin(current === a ? b : a);
    await request('/probe/session');
    setOrigin(current);
    const valid = await request(callback, { headers: { cookie } });
    expect(valid.status).toBe(302);
    expect(valid.headers.get('location')).toBe(
      `${current}/api/auth/error?error=access_denied`,
    );
    expect(valid.headers.getSetCookie().join(';')).toContain('Max-Age=0');
    const replay = await request(callback, { headers: { cookie } });
    expect(replay.headers.get('location')).toContain('error=state_mismatch');
    const direct = await post('/probe/social', {
      provider: 'github',
      callbackURL: `${current}/`,
      disableRedirect: true,
    });
    expect(direct.status).toBe(200);
    const directURL = new URL((await direct.json()).url);
    expect(directURL.searchParams.get('redirect_uri')).toBe(
      `${current}/api/auth/callback/github`,
    );
    const directCallback = await request(
      `/api/auth/callback/github?state=${directURL.searchParams.get('state')}&error=access_denied`,
      { headers: { cookie: cookies(direct) } },
    );
    expect(directCallback.headers.get('location')).toBe(
      `${current}/api/auth/error?error=access_denied`,
    );
  }
  const noState = await request(
    '/api/auth/callback/github?error=access_denied',
  );
  expect(noState.headers.get('location')).toContain('error=state_not_found');
  expect(connection.db.select().from(account).all()).toHaveLength(1);
}, 60000);

it('new process and Secret reject old signed Cookie without deleting users/credentials/sessions', async () => {
  const response = await signIn();
  expect(response.status).toBe(200);
  const cookie = cookies(response);
  const before = {
    users: connection.db.select().from(user).all(),
    accounts: connection.db.select().from(account).all(),
    sessions: connection.db.select().from(session).all(),
  };
  const oldPid = server.child.pid;
  const port = server.port;
  await server.stop();
  server = await launchIdentity(
    join(directory, 'auth.db'),
    config,
    randomBytes(32).toString('hex'),
    port,
  );
  await ready();
  expect(server.child.pid).not.toBe(oldPid);
  expect(
    await (
      await request('/api/auth/get-session', { headers: { cookie } })
    ).json(),
  ).toBeNull();
  expect(
    await (await request('/probe/session', { headers: { cookie } })).json(),
  ).toBeNull();
  expect(connection.db.select().from(user).all()).toEqual(before.users);
  expect(connection.db.select().from(account).all()).toEqual(before.accounts);
  expect(connection.db.select().from(session).all()).toEqual(before.sessions);
  const fresh = await signIn();
  expect(fresh.status).toBe(200);
  expect(
    (
      await (
        await request('/api/auth/get-session', {
          headers: { cookie: cookies(fresh) },
        })
      ).json()
    ).user.email,
  ).toBe(email);
}, 60000);
