import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { format } from 'node:util';
import { hashPassword } from 'better-auth/crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { openFixture, seedOwner } from '../../experiments/identity/fixture.ts';
import {
  createResetFixtureAuth,
  resetFixtureRequest,
} from '../../experiments/identity/reset-fixture.ts';
import { launchResetProcess } from '../../experiments/identity/reset-process.ts';
import { resetCliPassword } from '../../experiments/identity/cli-password.ts';
import {
  account,
  session,
  verification,
} from '../../experiments/identity/schema.ts';

let directory: string;
let connection: ReturnType<typeof openFixture>;
let auth: ReturnType<typeof createResetFixtureAuth>;
let deliveries: { token: string; url: string }[];
let ownerId: string;
let processes: Awaited<ReturnType<typeof launchResetProcess>>[];
let ip = 0;
const origin = 'http://localhost:3146';
const email = 'owner@example.test';
const password = 'reset-experiment-original-password';
const newPassword = 'reset-experiment-new-password';
const secret = randomBytes(32).toString('hex');
const cookieFrom = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
const readSession = (cookie: string) =>
  auth.handler(
    new Request(`${origin}/api/auth/get-session`, { headers: { cookie } }),
  );
const credential = () => connection.db.select().from(account).get()!;
const deferred = () => Promise.withResolvers<void>();

const post = (endpoint: string, body: object) =>
  auth.handler(resetFixtureRequest(origin, endpoint, body, `192.0.2.${++ip}`));
const requestReset = (address = email) =>
  post('request-password-reset', {
    email: address,
    redirectTo: '/reset-password',
  });
const resetPassword = (token: string, value = newPassword) =>
  post('reset-password', { token, newPassword: value });
const login = (value = password) =>
  post('sign-in/email', { email, password: value });

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'ariso-reset-experiment-'));
  connection = openFixture(join(directory, 'auth.db'));
  ownerId = await seedOwner(connection.db, email, password);
  deliveries = [];
  processes = [];
  auth = createResetFixtureAuth(connection.db, origin, secret, {
    sendResetPassword: async ({ token, url }) => {
      deliveries.push({ token, url });
    },
  });
});
afterEach(async () => {
  await Promise.all(processes.map((child) => child.stop()));
  vi.restoreAllMocks();
  connection.close();
  rmSync(directory, { recursive: true, force: true });
});

it('uses the current origin and fixed callback, one-hour token and generic unknown-email response', async () => {
  const known = await requestReset();
  expect(known.status).toBe(200);
  const knownBody = await known.json();
  const unknown = await requestReset('absent@example.test');
  expect(unknown.status).toBe(200);
  expect(await unknown.json()).toEqual(knownBody);
  expect(JSON.stringify(knownBody)).not.toContain(email);
  expect(deliveries).toHaveLength(1);
  const { token, url } = deliveries[0];
  const sent = new URL(url);
  expect(sent.origin).toBe(origin);
  expect(sent.pathname).toBe(`/api/auth/reset-password/${token}`);
  expect(sent.searchParams.get('callbackURL')).toBe('/reset-password');
  const record = connection.db.select().from(verification).get()!;
  expect(record).toMatchObject({
    identifier: `reset-password:${token}`,
    value: ownerId,
  });
  expect(record.expiresAt.getTime() - record.createdAt.getTime()).toBeCloseTo(
    3600000,
    -2,
  );
  const callback = await auth.handler(new Request(url));
  expect(callback.status).toBe(302);
  expect(callback.headers.get('location')).toBe(
    `${origin}/reset-password?token=${token}`,
  );
  expect(connection.db.select().from(account).all()).toHaveLength(1);
  expect(connection.db.select().from(session).all()).toEqual([]);
});

it('waits for the actual send callback before returning success', async () => {
  const entered = deferred();
  const accepted = deferred();
  let callbackRequest: Request | undefined;
  auth = createResetFixtureAuth(connection.db, origin, secret, {
    async sendResetPassword(_data, request) {
      callbackRequest = request;
      entered.resolve();
      await accepted.promise;
    },
  });
  const request = resetFixtureRequest(origin, 'request-password-reset', {
    email,
    redirectTo: '/reset-password',
  });
  let finished = false;
  const pending = auth.handler(request).then((response) => {
    finished = true;
    return response;
  });
  await entered.promise;
  expect(callbackRequest).toBe(request);
  expect(finished).toBe(false);
  accepted.resolve();
  expect((await pending).status).toBe(200);
});

it('records native library false-success evidence when awaited sendResetPassword rejects', async () => {
  const entered = deferred();
  const rejected = deferred();
  const diagnostics: string[] = [];
  auth = createResetFixtureAuth(connection.db, origin, secret, {
    propagateDeliveryFailure: false,
    logger: {
      log: (_level, message, ...args) =>
        diagnostics.push(format(message, ...args)),
    },
    async sendResetPassword({ token, url }) {
      deliveries.push({ token, url });
      entered.resolve();
      await rejected.promise;
      throw new Error(`injected SMTP accepted-send failure for ${url}`);
    },
  });
  let finished = false;
  const pending = requestReset().then((response) => {
    finished = true;
    return response;
  });
  await entered.promise;
  expect(finished).toBe(false);
  rejected.resolve();
  const response = await pending;
  // This is the observed package limitation, not acceptable product behavior.
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ status: true });
  expect(
    diagnostics.some((line) =>
      line.includes('injected SMTP accepted-send failure'),
    ),
  ).toBe(true);
  // The raw library logger preserves a callback error's recovery URL.
  expect(diagnostics.some((line) => line.includes(deliveries[0].url))).toBe(
    true,
  );
  expect(connection.db.select().from(verification).all()).toHaveLength(1);
  expect((await login()).status).toBe(200);
});

it('propagates send failure through the after hook and isolates simultaneous HTTP requests on one auth instance', async () => {
  const entered = deferred();
  const release = deferred();
  const capturedErrors: unknown[] = [];
  const diagnostics: string[] = [];
  const seenRequests = new Set<Request>();
  let calls = 0;
  auth = createResetFixtureAuth(connection.db, origin, secret, {
    logger: {
      log: (_level, message, ...args) =>
        diagnostics.push(format(message, ...args)),
    },
    onDeliveryError: (error) => capturedErrors.push(error),
    async sendResetPassword({ token, url }, request) {
      deliveries.push({ token, url });
      seenRequests.add(request!);
      if (++calls === 2) entered.resolve();
      await release.promise;
      if (request!.headers.get('x-delivery') === 'fail')
        throw new Error(`SMTP failed for ${url}; password=${password}`);
    },
  });
  const success = resetFixtureRequest(
    origin,
    'request-password-reset',
    { email, redirectTo: '/reset-password' },
    '192.0.2.210',
  );
  const failure = resetFixtureRequest(
    origin,
    'request-password-reset',
    { email, redirectTo: '/reset-password' },
    '192.0.2.211',
  );
  failure.headers.set('x-delivery', 'fail');
  const pendingSuccess = auth.handler(success);
  const pendingFailure = auth.handler(failure);
  await entered.promise;
  expect(seenRequests).toEqual(new Set([success, failure]));
  release.resolve();
  expect((await pendingSuccess).status).toBe(200);
  const failed = await pendingFailure;
  expect(failed.status).toBe(502);
  expect(await failed.json()).toEqual({
    code: 'RESET_EMAIL_DELIVERY_FAILED',
    message: 'Reset email delivery failed; retry or use the local CLI',
  });
  expect(capturedErrors).toHaveLength(1);
  expect(diagnostics.join('\n')).not.toContain(password);
  for (const { token, url } of deliveries) {
    expect(diagnostics.join('\n')).not.toContain(token);
    expect(diagnostics.join('\n')).not.toContain(url);
  }
  expect(connection.db.select().from(verification).all()).toHaveLength(2);
  expect((await requestReset()).status).toBe(200);
  expect(capturedErrors).toHaveLength(1);
});

it('consumes once, changes the real credential and revokes two real Cookie sessions without signing in', async () => {
  const first = await login();
  const second = await login();
  expect(first.status).toBe(200);
  expect(second.status).toBe(200);
  const cookies = [cookieFrom(first), cookieFrom(second)];
  expect(cookies[0]).not.toBe(cookies[1]);
  for (const cookie of cookies)
    expect(await (await readSession(cookie)).json()).toMatchObject({
      user: { id: ownerId },
    });
  const previous = credential().password;
  expect((await requestReset()).status).toBe(200);
  const response = await resetPassword(deliveries[0].token);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: true });
  expect(response.headers.getSetCookie()).toEqual([]);
  expect(credential().password).not.toBe(previous);
  expect(connection.db.select().from(session).all()).toEqual([]);
  expect(connection.db.select().from(verification).all()).toEqual([]);
  for (const cookie of cookies)
    expect(await (await readSession(cookie)).json()).toBeNull();
  expect((await login()).status).toBe(401);
  const fresh = await login(newPassword);
  expect(fresh.status).toBe(200);
  const after = credential().password;
  const replay = await resetPassword(deliveries[0].token, 'replayed-password');
  expect(replay.status).toBe(400);
  expect(await replay.json()).toMatchObject({ code: 'INVALID_TOKEN' });
  expect(credential().password).toBe(after);
  expect(await (await readSession(cookieFrom(fresh))).json()).toMatchObject({
    user: { id: ownerId },
  });
});

it('rejects invalid and expired tokens without writing credentials or revoking sessions, then recovers by reapplying', async () => {
  const active = cookieFrom(await login());
  const before = credential().password;
  const invalid = await resetPassword('not-a-real-token');
  expect(invalid.status).toBe(400);
  expect(await invalid.json()).toMatchObject({ code: 'INVALID_TOKEN' });
  await requestReset();
  connection.db
    .update(verification)
    .set({ expiresAt: new Date(Date.now() - 1) })
    .run();
  const callback = await auth.handler(new Request(deliveries[0].url));
  expect(callback.status).toBe(302);
  expect(callback.headers.get('location')).toBe(
    `${origin}/reset-password?error=INVALID_TOKEN`,
  );
  const expired = await resetPassword(deliveries[0].token);
  expect(expired.status).toBe(400);
  expect(await expired.json()).toMatchObject({ code: 'INVALID_TOKEN' });
  expect(credential().password).toBe(before);
  expect(await (await readSession(active)).json()).toMatchObject({
    user: { id: ownerId },
  });
  expect(connection.db.select().from(verification).all()).toEqual([]);
  expect((await requestReset()).status).toBe(200);
  expect(deliveries[1].token).not.toBe(deliveries[0].token);
  expect((await resetPassword(deliveries[1].token)).status).toBe(200);
  expect((await login(newPassword)).status).toBe(200);
});

it('fixes the callback independently of caller input and refreshes email links with the configured current origin', async () => {
  await expect(
    auth.api.requestPasswordReset({ body: { email } }),
  ).rejects.toMatchObject({
    status: 'BAD_REQUEST',
    body: { code: 'RESET_EXPERIMENT_REQUEST_REQUIRED' },
  });
  expect(deliveries).toEqual([]);
  expect(connection.db.select().from(verification).all()).toEqual([]);
  for (const current of [origin, 'https://new-origin.example.test', origin]) {
    auth = createResetFixtureAuth(connection.db, current, secret, {
      sendResetPassword: async ({ token, url }) => {
        deliveries.push({ token, url });
      },
    });
    const response = await auth.handler(
      resetFixtureRequest(
        current,
        'request-password-reset',
        {
          email,
          redirectTo: '/arbitrary-page',
        },
        `192.0.2.${++ip}`,
      ),
    );
    expect(response.status).toBe(200);
    const delivery = deliveries.at(-1)!;
    const sent = new URL(delivery.url);
    expect(sent.origin).toBe(current);
    expect(sent.searchParams.get('callbackURL')).toBe('/reset-password');
    sent.searchParams.set('callbackURL', '/arbitrary-page');
    const callback = await auth.handler(new Request(sent));
    expect(callback.status).toBe(302);
    expect(callback.headers.get('location')).toBe(
      `${current}/reset-password?token=${delivery.token}`,
    );
    const denied = resetFixtureRequest(
      current,
      'request-password-reset',
      { email },
      `192.0.2.${++ip}`,
    );
    denied.headers.set('origin', 'https://foreign.example.test');
    denied.headers.set('cookie', 'existing_browser_cookie=present');
    expect((await auth.handler(denied)).status).toBe(403);
  }
});

it('two independent processes read the same disk token before an atomic delete permits exactly one reset', async () => {
  const cookies = [cookieFrom(await login()), cookieFrom(await login())];
  await requestReset();
  for (const candidate of ['race-first-password', 'race-second-password']) {
    processes.push(
      await launchResetProcess({
        database: join(directory, 'auth.db'),
        origin,
        secret,
        token: deliveries[0].token,
        newPassword: candidate,
        pauseBeforeConsume: true,
      }),
    );
  }
  expect(processes[0].child.pid).not.toBe(processes[1].child.pid);
  for (const child of processes) child.start();
  await Promise.all(processes.map((child) => child.consuming));
  expect(connection.db.select().from(verification).all()).toHaveLength(1);
  for (const child of processes) child.resumeConsume();
  const results = await Promise.all(processes.map((child) => child.result));
  expect(results.map((result) => result.status).sort()).toEqual([200, 400]);
  const winner = results.findIndex((result) => result.status === 200);
  expect(results[winner].body).toEqual({ status: true });
  expect(results[1 - winner].body).toMatchObject({ code: 'INVALID_TOKEN' });
  for (const result of results) expect(result.cookies).toEqual([]);
  expect(connection.db.select().from(verification).all()).toEqual([]);
  expect(connection.db.select().from(session).all()).toEqual([]);
  for (const cookie of cookies)
    expect(await (await readSession(cookie)).json()).toBeNull();
  expect((await login()).status).toBe(401);
  const candidates = ['race-first-password', 'race-second-password'];
  expect((await login(candidates[winner])).status).toBe(200);
  expect((await login(candidates[1 - winner])).status).toBe(401);
}, 20000);

it('records that CLI cannot cancel a native reset already past token consumption and the later password write wins', async () => {
  const oldCookies = [cookieFrom(await login()), cookieFrom(await login())];
  await requestReset();
  await requestReset();
  const child = await launchResetProcess({
    database: join(directory, 'auth.db'),
    origin,
    secret,
    token: deliveries[0].token,
    newPassword,
    pauseBeforeHash: true,
  });
  processes.push(child);
  child.start();
  await child.consumed;
  expect(connection.db.select().from(verification).all()).toMatchObject([
    { identifier: `reset-password:${deliveries[1].token}` },
  ]);
  const cliPassword = 'cli-reset-while-native-in-flight';
  let cliCookie: string;
  try {
    await resetCliPassword(connection.db, cliPassword, cliPassword);
    expect(connection.db.select().from(verification).all()).toEqual([]);
    expect(connection.db.select().from(session).all()).toEqual([]);
    for (const cookie of oldCookies)
      expect(await (await readSession(cookie)).json()).toBeNull();
    expect((await login()).status).toBe(401);
    const cliLogin = await login(cliPassword);
    expect(cliLogin.status).toBe(200);
    cliCookie = cookieFrom(cliLogin);
    expect(await (await readSession(cliCookie)).json()).toMatchObject({
      user: { id: ownerId },
    });
  } finally {
    child.resumeHash();
  }
  const completed = await child.result;
  expect(completed.status).toBe(200);
  expect(completed.body).toEqual({ status: true });
  expect(completed.cookies).toEqual([]);
  expect(connection.db.select().from(session).all()).toEqual([]);
  expect(await (await readSession(cliCookie)).json()).toBeNull();
  expect((await login(cliPassword)).status).toBe(401);
  expect((await login(newPassword)).status).toBe(200);
  const replay = await resetPassword(deliveries[0].token);
  expect(replay.status).toBe(400);
  expect(await replay.json()).toMatchObject({ code: 'INVALID_TOKEN' });
}, 20000);

it.each(['consume', 'hash', 'password-write', 'session-revoke'] as const)(
  'records real persistence and session behavior at the %s failure, then recovers through a fresh request',
  async (fault) => {
    const diagnostics: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args) =>
      diagnostics.push(format(...args)),
    );
    let injectHashFailure = fault === 'hash';
    let attemptedHash: string | undefined;
    auth = createResetFixtureAuth(connection.db, origin, secret, {
      logger: {
        log: (_level, message, ...args) =>
          diagnostics.push(format(message, ...args)),
      },
      sendResetPassword: async ({ token, url }) => {
        deliveries.push({ token, url });
      },
      password: {
        async hash(value) {
          if (injectHashFailure)
            throw new Error('injected password hash failure');
          const hashed = await hashPassword(value);
          if (value === newPassword) attemptedHash = hashed;
          return hashed;
        },
      },
    });
    const cookies = [cookieFrom(await login()), cookieFrom(await login())];
    const originalHash = credential().password;
    const originalSessions = connection.db.select().from(session).all();
    expect(originalSessions).toHaveLength(2);
    await requestReset();
    const token = deliveries[0].token;
    const triggers = {
      consume:
        "CREATE TRIGGER reject_reset BEFORE DELETE ON verification BEGIN SELECT RAISE(ABORT, 'injected reset token consumption failure'); END",
      'password-write':
        "CREATE TRIGGER reject_reset BEFORE UPDATE OF password ON account BEGIN SELECT RAISE(ABORT, 'injected reset password write failure'); END",
      'session-revoke':
        "CREATE TRIGGER reject_reset BEFORE DELETE ON session BEGIN SELECT RAISE(ABORT, 'injected reset session revoke failure'); END",
    };
    if (fault !== 'hash') connection.db.$client.exec(triggers[fault]);
    try {
      const failed = await resetPassword(token);
      expect(failed.status).toBe(500);
      expect(failed.headers.getSetCookie()).toEqual([]);
      const body = await failed.text();
      for (const sensitive of [token, password, newPassword, deliveries[0].url])
        expect(body).not.toContain(sensitive);
      expect(diagnostics.join('\n')).toContain(
        `injected ${fault === 'consume' ? 'reset token consumption' : fault === 'hash' ? 'password hash' : fault === 'password-write' ? 'reset password write' : 'reset session revoke'} failure`,
      );
      expect(connection.db.select().from(verification).all()).toHaveLength(
        fault === 'consume' ? 1 : 0,
      );
      expect(credential().password).toBe(
        fault === 'session-revoke' ? attemptedHash : originalHash,
      );
      expect(connection.db.select().from(session).all()).toEqual(
        originalSessions,
      );
      for (const cookie of cookies)
        expect(await (await readSession(cookie)).json()).toMatchObject({
          user: { id: ownerId },
        });
      if (attemptedHash)
        expect(diagnostics.join('\n')).not.toContain(attemptedHash);
      for (const sensitive of [token, password, newPassword, deliveries[0].url])
        expect(diagnostics.join('\n')).not.toContain(sensitive);
    } finally {
      injectHashFailure = false;
      if (fault !== 'hash')
        connection.db.$client.exec('DROP TRIGGER reject_reset');
    }
    if (fault !== 'consume') {
      const replay = await resetPassword(token);
      expect(replay.status).toBe(400);
      expect(await replay.json()).toMatchObject({ code: 'INVALID_TOKEN' });
    }
    expect((await login()).status).toBe(fault === 'session-revoke' ? 401 : 200);
    expect((await login(newPassword)).status).toBe(
      fault === 'session-revoke' ? 200 : 401,
    );
    expect((await requestReset()).status).toBe(200);
    const fresh = deliveries[1].token;
    expect(fresh).not.toBe(token);
    const restored = await resetPassword(fresh, 'recovery-request-password');
    expect(restored.status).toBe(200);
    expect(await restored.json()).toEqual({ status: true });
    expect(connection.db.select().from(session).all()).toEqual([]);
    for (const cookie of cookies)
      expect(await (await readSession(cookie)).json()).toBeNull();
    expect((await login('recovery-request-password')).status).toBe(200);
    expect((await login()).status).toBe(401);
    expect((await login(newPassword)).status).toBe(401);
  },
  20000,
);

it('keeps credential and token recoverable at a real table lookup failure and checks emitted diagnostics', async () => {
  const diagnostics: string[] = [];
  vi.spyOn(console, 'error').mockImplementation((...args) =>
    diagnostics.push(format(...args)),
  );
  auth = createResetFixtureAuth(connection.db, origin, secret, {
    logger: {
      log: (_level, message, ...args) =>
        diagnostics.push(format(message, ...args)),
    },
    sendResetPassword: async ({ token, url }) => {
      deliveries.push({ token, url });
    },
  });
  const active = cookieFrom(await login());
  const previous = credential().password;
  await requestReset();
  const token = deliveries[0].token;
  connection.db.$client.exec(
    'ALTER TABLE verification RENAME TO unavailable_verification',
  );
  try {
    const failed = await resetPassword(token);
    expect(failed.status).toBe(500);
    const body = await failed.text();
    expect(body).not.toContain(token);
    expect(credential().password).toBe(previous);
    expect(await (await readSession(active)).json()).toMatchObject({
      user: { id: ownerId },
    });
    expect(diagnostics.some((line) => line.includes(token))).toBe(false);
    expect(
      diagnostics.some((line) => line.includes('no such table: verification')),
    ).toBe(true);
    expect(diagnostics.some((line) => line.includes(password))).toBe(false);
  } finally {
    connection.db.$client.exec(
      'ALTER TABLE unavailable_verification RENAME TO verification',
    );
  }
  expect(connection.db.select().from(verification).all()).toHaveLength(1);
  expect((await resetPassword(token)).status).toBe(200);
  expect((await login(newPassword)).status).toBe(200);
});
