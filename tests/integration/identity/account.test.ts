import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { hashPassword } from 'better-auth/crypto';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  updateOwnerEmail,
  updateOwnerPassword,
} from '../../../src/server/identity/account.ts';
import type { requireOwnerSession } from '../../../src/server/identity/owner.ts';
import {
  account,
  session,
  user,
  verification,
} from '../../../src/server/identity/schema.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { launch, stop } from '../runtime/process-helpers.ts';
import { email, password, seedAuthOwner } from './auth-fixture.ts';

let directory: string;
let server: Awaited<ReturnType<typeof launch>>;
let connection: ReturnType<typeof openRuntimeDatabase>;
let origin: string;
let ownerId: string;
let requestIp = 80;
const newPassword = 'new-account-test-password';
const cookies = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');

function request(path: string, init: RequestInit = {}) {
  return fetch(`${origin}${path}`, {
    ...init,
    redirect: 'manual',
    signal: AbortSignal.timeout(10000),
  });
}
function mutation(
  path: string,
  method: string,
  body: unknown,
  cookie: string,
  requestOrigin: string | null = origin,
) {
  return request(path, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `192.0.2.${++requestIp % 255}`,
      cookie,
      ...(requestOrigin === null ? {} : { origin: requestOrigin }),
    },
    body: JSON.stringify(body),
  });
}
function login(loginEmail = email, loginPassword = password) {
  return mutation(
    '/api/auth/sign-in/email',
    'POST',
    { email: loginEmail, password: loginPassword },
    '',
  );
}
async function signedCookie() {
  const response = await login();
  expect(response.status, await response.clone().text()).toBe(200);
  return cookies(response);
}
async function readSession(cookie: string) {
  const response = await request('/api/auth/get-session', {
    headers: { cookie },
  });
  expect(response.status).toBe(200);
  return response.json() as Promise<
    Awaited<ReturnType<typeof requireOwnerSession>>
  >;
}
function changeEmail(cookie: string, overrides: object = {}) {
  return mutation(
    '/api/account/email',
    'PATCH',
    { email: 'new@example.test', currentPassword: password, ...overrides },
    cookie,
  );
}
function changePassword(cookie: string, overrides: object = {}) {
  return mutation(
    '/api/account/password',
    'POST',
    {
      currentPassword: password,
      newPassword,
      confirmPassword: newPassword,
      ...overrides,
    },
    cookie,
  );
}
function snapshot() {
  return {
    users: connection.db.select().from(user).all(),
    accounts: connection.db.select().from(account).all(),
    sessions: connection.db.select().from(session).all(),
    verifications: connection.db.select().from(verification).all(),
  };
}
function resetRecord(identifier: string, value = ownerId) {
  return {
    id: randomUUID(),
    identifier,
    value,
    expiresAt: new Date(Date.now() + 3600000),
  };
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ariso-account-'));
  const env = {
    DATA_DIR: join(directory, 'data'),
    HOST: '127.0.0.1',
    BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
    ARISO_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
  };
  server = await launch(resolve('.next/standalone'), directory, env);
  origin = `http://127.0.0.1:${server.port}`;
  await vi.waitFor(
    async () => {
      if (server.child.exitCode !== null) throw new Error(server.logs());
      expect((await request('/api/health')).status).toBe(200);
    },
    { timeout: 15000 },
  );
  connection = openRuntimeDatabase(join(env.DATA_DIR, 'ariso.db'));
}, 30000);
afterEach(async () => {
  if (server) await stop(server.child, server.closed);
  connection?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

it('uninitialized account endpoints require a Cookie owner and create no identity', async () => {
  const response = await request('/api/account');
  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({ code: 'UNAUTHORIZED' });
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect((await changeEmail('')).status).toBe(401);
  expect((await changePassword('')).status).toBe(401);
  expect(connection.db.select().from(user).all()).toEqual([]);
});

describe('real Cookie account management', () => {
  beforeEach(async () => {
    ownerId = await seedAuthOwner(connection, origin);
  });

  it('exposes only the real email and rejects anonymous, Bearer/share and wrong-origin writes', async () => {
    const cookie = await signedCookie();
    const response = await request('/api/account', { headers: { cookie } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ email });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.getSetCookie()).toEqual([]);
    const before = snapshot();
    const unauthorizedHeaders: Record<string, string>[] = [
      {},
      { authorization: 'Bearer upload-token', cookie: 'share_access=granted' },
      { cookie: 'ariso.session_token=invalid', 'x-user-id': ownerId },
    ];
    for (const headers of unauthorizedHeaders) {
      const denied = await request('/api/account', { headers });
      expect(denied.status).toBe(401);
      expect(await denied.json()).toMatchObject({ code: 'UNAUTHORIZED' });
    }
    for (const requestOrigin of [null, 'https://foreign.example']) {
      for (const [path, method, body] of [
        ['/api/account/email', 'PATCH', { email, currentPassword: password }],
        [
          '/api/account/password',
          'POST',
          {
            currentPassword: password,
            newPassword,
            confirmPassword: newPassword,
          },
        ],
      ] as const) {
        const denied = await mutation(
          path,
          method,
          body,
          cookie,
          requestOrigin,
        );
        expect(denied.status).toBe(403);
        expect(await denied.json()).toMatchObject({ code: 'INVALID_ORIGIN' });
      }
    }
    expect(snapshot()).toEqual(before);
    connection.db
      .update(session)
      .set({ expiresAt: new Date(Date.now() - 1) })
      .run();
    expect((await changeEmail(cookie)).status).toBe(401);
    expect((await changePassword(cookie)).status).toBe(401);
    const fresh = await signedCookie();
    expect(
      (await mutation('/api/auth/sign-out', 'POST', {}, fresh)).status,
    ).toBe(200);
    expect(
      (await request('/api/account', { headers: { cookie: fresh } })).status,
    ).toBe(401);
  });

  it('validates JSON, required fields, password length and confirmation without persistence changes', async () => {
    const cookie = await signedCookie();
    const before = snapshot();
    for (const [path, method] of [
      ['/api/account/email', 'PATCH'],
      ['/api/account/password', 'POST'],
    ]) {
      for (const body of ['{', 'null', '[]', undefined]) {
        const response = await request(path, {
          method,
          headers: { cookie, origin, 'content-type': 'application/json' },
          body,
        });
        expect(response.status, String(body)).toBe(400);
        expect(await response.json()).toMatchObject({
          code: 'INVALID_ACCOUNT_INPUT',
        });
        expect(response.headers.get('cache-control')).toBe('no-store');
      }
    }
    const cases = [
      [await changeEmail(cookie, { email: 'invalid' }), 'email'],
      [await changeEmail(cookie, { currentPassword: '' }), 'currentPassword'],
      [
        await changePassword(cookie, { currentPassword: '' }),
        'currentPassword',
      ],
      [
        await changePassword(cookie, {
          newPassword: 'short',
          confirmPassword: 'short',
        }),
        'newPassword',
      ],
      [
        await changePassword(cookie, {
          newPassword: 'a'.repeat(129),
          confirmPassword: 'a'.repeat(129),
        }),
        'newPassword',
      ],
      [
        await changePassword(cookie, { confirmPassword: 'mismatch' }),
        'confirmPassword',
      ],
    ] as const;
    for (const [response, field] of cases) {
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        code: 'INVALID_ACCOUNT_INPUT',
        fields: expect.arrayContaining([expect.objectContaining({ field })]),
      });
    }
    expect(snapshot()).toEqual(before);
  });

  it.each([false, true])(
    'changes verified=%s email without SMTP, keeps GitHub and sessions, and revokes only owner reset records',
    async (emailVerified) => {
      connection.db.update(user).set({ emailVerified }).run();
      const github = {
        id: randomUUID(),
        accountId: 'github-stable-id',
        providerId: 'github',
        userId: ownerId,
        updatedAt: new Date(),
      };
      connection.db.insert(account).values(github).run();
      const records = [
        resetRecord('reset-password:unused-one'),
        resetRecord('reset-password:unused-two'),
        resetRecord('reset-password:other-owner', 'other-owner-id'),
        resetRecord('oauth-state:unchanged'),
      ];
      connection.db.insert(verification).values(records).run();
      const first = await signedCookie();
      const second = await signedCookie();
      const before = snapshot();
      const response = await changeEmail(first, {
        email: ' NEW@EXAMPLE.TEST ',
      });
      expect(response.status, await response.clone().text()).toBe(200);
      expect(await response.json()).toEqual({
        code: 'ACCOUNT_EMAIL_UPDATED',
        email: 'new@example.test',
      });
      expect(response.headers.getSetCookie()).toEqual([]);
      expect(connection.db.select().from(user).get()).toMatchObject({
        email: 'new@example.test',
        emailVerified: false,
      });
      expect(connection.db.select().from(account).all()).toEqual(
        before.accounts,
      );
      expect(connection.db.select().from(session).all()).toEqual(
        before.sessions,
      );
      expect(
        connection.db
          .select()
          .from(verification)
          .all()
          .map((record) => record.id),
      ).toEqual(records.slice(2).map((record) => record.id));
      for (const cookie of [first, second]) {
        expect((await readSession(cookie)).user.email).toBe('new@example.test');
        const current = await request('/api/account', { headers: { cookie } });
        expect(await current.json()).toEqual({ email: 'new@example.test' });
      }
      expect((await login(email)).status).toBe(401);
      expect((await login('new@example.test')).status).toBe(200);
    },
  );

  it('incorrect and padded current passwords leave email, credentials, reset records and all sessions unchanged', async () => {
    connection.db
      .insert(verification)
      .values(resetRecord('reset-password:unused'))
      .run();
    const cookie = await signedCookie();
    await signedCookie();
    const before = snapshot();
    for (const currentPassword of ['wrong-password', ` ${password} `]) {
      for (const response of [
        await changeEmail(cookie, { currentPassword }),
        await changePassword(cookie, { currentPassword }),
      ]) {
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({
          code: 'INVALID_PASSWORD',
          message: '当前密码不正确',
          fields: [{ field: 'currentPassword', message: '当前密码不正确' }],
        });
        expect(response.headers.getSetCookie()).toEqual([]);
      }
      expect(snapshot()).toEqual(before);
    }
  });

  it('password success keeps the exact current Cookie session and revokes other sessions even when requested false', async () => {
    const first = await signedCookie();
    const second = await signedCookie();
    const firstSession = await readSession(first);
    const before = snapshot();
    const response = await changePassword(first, {
      newPassword: ` ${newPassword} `,
      confirmPassword: ` ${newPassword} `,
      revokeOtherSessions: false,
      sessionId: (await readSession(second)).session.id,
    });
    expect(response.status, await response.clone().text()).toBe(200);
    expect(await response.json()).toEqual({ code: 'ACCOUNT_PASSWORD_UPDATED' });
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(connection.db.select().from(session).all()).toEqual(
      before.sessions.filter((row) => row.id === firstSession.session.id),
    );
    expect((await readSession(first)).session.id).toBe(firstSession.session.id);
    expect(await readSession(second)).toBeNull();
    expect((await changeEmail(second)).status).toBe(401);
    expect(connection.db.select().from(user).all()).toEqual(before.users);
    expect((await login(email, password)).status).toBe(401);
    expect((await login(email, newPassword)).status).toBe(401);
    expect((await login(email, ` ${newPassword} `)).status).toBe(200);
  });

  it.each(['email', 'password'])(
    '%s verification detects a concurrent credential change before commit and requires retry',
    async (operation) => {
      const cookie = await signedCookie();
      const owner = await readSession(cookie);
      const concurrentHash = await hashPassword(
        'concurrently-changed-password',
      );
      const before = snapshot();
      // Start real asynchronous verification, then simulate a second writer's committed password.
      const pending =
        operation === 'email'
          ? updateOwnerEmail(connection.db, owner, {
              email: 'new@example.test',
              currentPassword: password,
            })
          : updateOwnerPassword(connection.db, owner, {
              currentPassword: password,
              newPassword,
              confirmPassword: newPassword,
            });
      connection.db
        .update(account)
        .set({ password: concurrentHash })
        .where(eq(account.providerId, 'credential'))
        .run();
      await expect(pending).rejects.toMatchObject({
        code: 'ACCOUNT_PASSWORD_CHANGED',
        status: 409,
      });
      expect(connection.db.select().from(user).all()).toEqual(before.users);
      expect(connection.db.select().from(session).all()).toEqual(
        before.sessions,
      );
      expect(connection.db.select().from(account).get()?.password).toBe(
        concurrentHash,
      );
      const retry = await changeEmail(cookie, {
        currentPassword: 'concurrently-changed-password',
      });
      expect(retry.status, await retry.clone().text()).toBe(200);
    },
  );

  it.each(['email', 'password'])(
    '%s verification rejects a concurrently revoked current session without account writes',
    async (operation) => {
      const cookie = await signedCookie();
      const owner = await readSession(cookie);
      await signedCookie();
      connection.db
        .insert(verification)
        .values(resetRecord('reset-password:unused'))
        .run();
      const pending =
        operation === 'email'
          ? updateOwnerEmail(connection.db, owner, {
              email: 'new@example.test',
              currentPassword: password,
            })
          : updateOwnerPassword(connection.db, owner, {
              currentPassword: password,
              newPassword,
              confirmPassword: newPassword,
            });
      connection.db
        .delete(session)
        .where(eq(session.id, owner.session.id))
        .run();
      const afterRevocation = snapshot();
      await expect(pending).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
        status: 401,
      });
      expect(snapshot()).toEqual(afterRevocation);
      expect(await readSession(cookie)).toBeNull();
      expect((await changeEmail(cookie)).status).toBe(401);
      expect((await changePassword(cookie)).status).toBe(401);
    },
  );

  it.each(['email', 'password'])(
    '%s transaction write failure rolls back every write and a later explicit retry succeeds',
    async (operation) => {
      const cookie = await signedCookie();
      await signedCookie();
      connection.db
        .insert(verification)
        .values(resetRecord('reset-password:unused'))
        .run();
      const before = snapshot();
      const table = operation === 'email' ? 'verification' : 'session';
      connection.db.$client.exec(
        `CREATE TRIGGER reject_account_write BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT, 'injected account transaction failure'); END`,
      );
      const offset = server.logs().length;
      try {
        const response =
          operation === 'email'
            ? await changeEmail(cookie)
            : await changePassword(cookie);
        expect(response.status).toBe(500);
        expect(await response.json()).toMatchObject({
          code: 'INTERNAL_SERVER_ERROR',
        });
        expect(response.headers.getSetCookie()).toEqual([]);
        expect(snapshot()).toEqual(before);
        await vi.waitFor(() =>
          expect(server.logs().slice(offset)).toContain(
            'injected account transaction failure',
          ),
        );
        const diagnostics = server.logs().slice(offset);
        for (const secret of [
          password,
          newPassword,
          cookie,
          before.accounts[0].password!,
        ])
          expect(diagnostics).not.toContain(secret);
      } finally {
        connection.db.$client.exec('DROP TRIGGER reject_account_write');
      }
      const retry =
        operation === 'email'
          ? await changeEmail(cookie)
          : await changePassword(cookie);
      expect(retry.status, await retry.clone().text()).toBe(200);
    },
  );

  it('account changes do not open arbitrary user mutation, credential unlink or native password endpoints', async () => {
    const cookie = await signedCookie();
    const before = snapshot();
    for (const path of [
      'update-user',
      'unlink-account',
      'change-password',
      'change-email',
      'set-password',
    ]) {
      const response = await mutation(
        `/api/auth/${path}`,
        'POST',
        {
          userId: ownerId,
          name: 'Changed',
          email: 'changed@example.test',
          providerId: 'credential',
          currentPassword: password,
          newPassword,
        },
        cookie,
      );
      expect(response.status, path).toBe(404);
    }
    expect(snapshot()).toEqual(before);
  });
});
