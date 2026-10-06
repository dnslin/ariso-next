import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { updateOwnerPassword } from '../../../src/server/identity/account.ts';
import { getAuth } from '../../../src/server/identity/auth.ts';
import { session } from '../../../src/server/identity/schema.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { parseRuntimeEnv } from '../../../src/server/runtime/env.ts';
import { email, password, seedAuthOwner } from './auth-fixture.ts';

const origin = 'http://localhost:3000';
const newPassword = 'updated-login-race-password';
let connection: ReturnType<typeof openRuntimeDatabase>;
let auth: NonNullable<ReturnType<typeof getAuth>>;
let requestIp = 0;

function login(loginPassword = password, loginEmail = email) {
  return auth.handler(
    new Request(`${origin}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: {
        origin,
        'content-type': 'application/json',
        'x-forwarded-for': `198.51.100.${++requestIp}`,
      },
      body: JSON.stringify({
        email: loginEmail,
        password: loginPassword,
        callbackURL: `${origin}/settings/account`,
        rememberMe: false,
      }),
    }),
  );
}

function cookies(response: Response) {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
}

async function owner(cookie: string) {
  const current = await auth.api.getSession({
    headers: new Headers({ cookie }),
    query: { disableRefresh: true },
  });
  expect(current).not.toBeNull();
  return current!;
}

beforeEach(async () => {
  connection = openRuntimeDatabase(':memory:');
  migrate(connection.db, { migrationsFolder: resolve('drizzle') });
  await seedAuthOwner(connection, origin);
  auth = getAuth({
    connection,
    github: { enabled: false, clientId: '', clientSecret: null },
    config: parseRuntimeEnv({
      BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
      ARISO_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
      LOG_LEVEL: 'error',
    }),
  })!;
});

afterEach(() => connection?.close());

it.each(['password verified', 'session created'])(
  'rejects old-password login when a password change commits after %s and before response delivery',
  async (pausedAt) => {
    const first = await login();
    expect(first.status).toBe(200);
    const firstCookie = cookies(first);
    const current = await owner(firstCookie);
    const context = await auth.$context;
    const reached = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    const verify = context.password.verify;
    const createSession = context.internalAdapter.createSession;

    if (pausedAt === 'password verified') {
      context.password.verify = async (input) => {
        const valid = await verify(input);
        expect(valid).toBe(true);
        reached.resolve();
        await resume.promise;
        return valid;
      };
    } else {
      context.internalAdapter.createSession = async (...args) => {
        const created = await createSession(...args);
        expect(created).not.toBeNull();
        reached.resolve();
        await resume.promise;
        return created;
      };
    }

    const lateLogin = login();
    let rejected: Response;
    try {
      await reached.promise;
      await expect(
        updateOwnerPassword(connection.db, current, {
          currentPassword: password,
          newPassword,
          confirmPassword: newPassword,
        }),
      ).resolves.toEqual({ code: 'ACCOUNT_PASSWORD_UPDATED' });
      expect(connection.db.select().from(session).all()).toHaveLength(1);
    } finally {
      resume.resolve();
      try {
        // 断言失败时也先等在途请求结束，再由 afterEach 关闭独立数据库。
        rejected = await lateLogin;
      } finally {
        context.password.verify = verify;
        context.internalAdapter.createSession = createSession;
      }
    }

    expect(rejected.status).toBe(401);
    const body = await rejected.json();
    expect(body).toMatchObject({
      code: 'INVALID_EMAIL_OR_PASSWORD',
    });
    expect(body).not.toHaveProperty('token');
    expect(rejected.headers.getSetCookie()).toEqual([]);
    expect(rejected.headers.has('location')).toBe(false);
    expect(connection.db.select().from(session).all()).toHaveLength(1);
    expect((await owner(firstCookie)).session.id).toBe(current.session.id);
    expect((await login()).status).toBe(401);
    const fresh = await login(newPassword);
    expect(fresh.status).toBe(200);
    expect((await owner(cookies(fresh))).session.id).not.toBe(
      current.session.id,
    );
  },
);

it('revokes a login already accepted before the password change while preserving the initiating session', async () => {
  const firstCookie = cookies(await login());
  const current = await owner(firstCookie);
  const second = await login();
  expect(second.status).toBe(200);
  const secondCookie = cookies(second);
  expect(connection.db.select().from(session).all()).toHaveLength(2);
  await updateOwnerPassword(connection.db, current, {
    currentPassword: password,
    newPassword,
    confirmPassword: newPassword,
  });
  expect(connection.db.select().from(session).all()).toHaveLength(1);
  expect(
    await auth.api.getSession({
      headers: new Headers({ cookie: secondCookie }),
      query: { disableRefresh: true },
    }),
  ).toBeNull();
  expect((await owner(firstCookie)).session.id).toBe(current.session.id);
});

it('keeps normalized normal login and its seven-day cookie, and never creates a session for a wrong password', async () => {
  const accepted = await login(password, '  OWNER@EXAMPLE.TEST ');
  expect(accepted.status).toBe(200);
  expect(accepted.headers.getSetCookie()).toHaveLength(1);
  expect(accepted.headers.getSetCookie()[0]).toContain('Max-Age=604800');
  expect(accepted.headers.get('location')).toBe(`${origin}/settings/account`);
  const current = await owner(cookies(accepted));
  const rejected = await login('incorrect-password');
  expect(rejected.status).toBe(401);
  expect(rejected.headers.getSetCookie()).toEqual([]);
  expect(connection.db.select().from(session).all()).toHaveLength(1);
  expect((await owner(cookies(accepted))).session.id).toBe(current.session.id);
});
