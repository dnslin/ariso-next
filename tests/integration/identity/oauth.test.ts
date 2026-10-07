import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  GET as settingsGet,
  PATCH as settingsPatch,
} from '../../../src/app/api/settings/github/route.ts';
import {
  GET as bindingGet,
  DELETE as bindingDelete,
} from '../../../src/app/api/account/github/route.ts';
import { POST as bindingLink } from '../../../src/app/api/account/github/link/route.ts';
import {
  getAuth,
  handleAuthRequest,
} from '../../../src/server/identity/auth.ts';
import {
  captureGithubSettings,
  updateGithubSettings,
} from '../../../src/server/identity/github-settings.ts';
import {
  account,
  githubSettings,
  session,
  user,
  verification,
} from '../../../src/server/identity/schema.ts';
import { createSecretCrypto } from '../../../src/server/runtime/crypto.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { parseRuntimeEnv } from '../../../src/server/runtime/env.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import { siteSettings } from '../../../src/server/site/schema.ts';
import type { getServerRuntime } from '../../../src/server/startup/server-start.ts';
import { email, password, seedAuthOwner } from './auth-fixture.ts';

const runtimeState = vi.hoisted(() => ({
  runtime: null as unknown as ReturnType<typeof getServerRuntime>,
}));
vi.mock('../../../src/server/startup/server-start.ts', () => ({
  getServerRuntime: () => runtimeState.runtime,
}));
let directory: string;
let connection: ReturnType<typeof openRuntimeDatabase>;
let origin: string;
let ownerId: string;
let ownerCookie: string;
let providerEmail: string;
let providerId: number;
let providerLogin: string;
let exchanges: { clientId: string | null; clientSecret: string | null }[];
let requestIp = 0;
const cookies = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
const crypto = () =>
  createSecretCrypto(runtimeState.runtime.config.encryptionKey);

function request(
  path: string,
  method = 'GET',
  body?: unknown,
  cookie = ownerCookie,
  requestOrigin = origin,
) {
  return new Request(`${origin}${path}`, {
    method,
    headers: {
      origin: requestOrigin,
      cookie,
      'content-type': 'application/json',
      'x-forwarded-for': `192.0.2.${++requestIp}`,
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
}
function postAuth(path: string, body: object, cookie = '') {
  return handleAuthRequest(request(`/api/auth/${path}`, 'POST', body, cookie));
}
function patch(body: object, cookie = ownerCookie, requestOrigin = origin) {
  return settingsPatch(
    request('/api/settings/github', 'PATCH', body, cookie, requestOrigin),
  );
}
function restart() {
  runtimeState.runtime = {
    ...runtimeState.runtime,
    github: captureGithubSettings(connection.db, crypto()),
  };
}
async function begin(link = false, requestSignUp = false) {
  const response = link
    ? await bindingLink(request('/api/account/github/link', 'POST'))
    : await postAuth('sign-in/social', {
        provider: 'github',
        callbackURL: `${origin}/admin`,
        errorCallbackURL: `${origin}/login?github=error`,
        disableRedirect: true,
        requestSignUp,
      });
  expect(response.status, await response.clone().text()).toBe(200);
  const url = new URL((await response.json()).url);
  return {
    state: url.searchParams.get('state')!,
    cookie: cookies(response),
    url,
  };
}
function callback(
  flow: { state: string; cookie: string },
  cookie = flow.cookie,
) {
  return handleAuthRequest(
    new Request(
      `${origin}/api/auth/callback/github?code=fixture-code&state=${flow.state}`,
      { headers: { cookie } },
    ),
  );
}
function githubAccount() {
  return connection.db
    .select()
    .from(account)
    .where(eq(account.providerId, 'github'))
    .get();
}
function expectNoTokens() {
  expect(githubAccount()).toMatchObject({
    accessToken: null,
    refreshToken: null,
    idToken: null,
    accessTokenExpiresAt: null,
    refreshTokenExpiresAt: null,
    password: null,
  });
}

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'ariso-production-oauth-'));
  connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  migrateRuntimeDatabase(connection.db, resolve('drizzle'));
  origin = 'http://localhost:3181';
  ownerId = await seedAuthOwner(connection, origin);
  const config = parseRuntimeEnv({
    DATA_DIR: directory,
    BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
    ARISO_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
    LOG_LEVEL: 'fatal',
  });
  runtimeState.runtime = {
    connection,
    config,
    github: captureGithubSettings(
      connection.db,
      createSecretCrypto(config.encryptionKey),
    ),
  } as ReturnType<typeof getServerRuntime>;
  updateGithubSettings(connection.db, crypto(), runtimeState.runtime.github, {
    enabled: true,
    clientId: 'fixture-client',
    clientSecret: 'fixture-secret',
  });
  restart();
  providerEmail = email;
  providerId = 181;
  providerLogin = 'fixture-login';
  exchanges = [];
  // Production routes, hooks, signed state and SQLite are real; only provider HTTP is a substitute.
  vi.stubGlobal(
    'fetch',
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url === 'https://github.com/login/oauth/access_token') {
        const body = new URLSearchParams(String(init?.body));
        exchanges.push({
          clientId: body.get('client_id'),
          clientSecret: body.get('client_secret'),
        });
        return Response.json({
          access_token: 'fixture-access-token',
          refresh_token: 'fixture-refresh-token',
          id_token: 'fixture-id-token',
          expires_in: 3600,
          refresh_token_expires_in: 7200,
          token_type: 'bearer',
          scope: 'read:user,user:email',
        });
      }
      if (url === 'https://api.github.com/user')
        return Response.json({
          id: providerId,
          login: providerLogin,
          name: 'Provider Display Name',
          email: providerEmail,
        });
      if (url === 'https://api.github.com/user/emails')
        return Response.json([
          { email: providerEmail, primary: true, verified: true },
        ]);
      throw new Error(`Unexpected provider request: ${url}`);
    },
  );
  const login = await postAuth('sign-in/email', { email, password });
  expect(login.status).toBe(200);
  ownerCookie = cookies(login);
});
afterEach(() => {
  vi.unstubAllGlobals();
  connection?.close();
  if (directory) rmSync(directory, { recursive: true, force: true });
});

it('production management requires the owner Cookie and current saved origin, and hides both forms of the secret', async () => {
  for (const operation of [
    () => settingsGet(request('/api/settings/github', 'GET', undefined, '')),
    () => patch({ enabled: false }, ''),
    () => bindingGet(request('/api/account/github', 'GET', undefined, '')),
    () =>
      bindingLink(request('/api/account/github/link', 'POST', undefined, '')),
    () =>
      bindingDelete(request('/api/account/github', 'DELETE', undefined, '')),
  ])
    expect((await operation()).status).toBe(401);
  expect(
    (await patch({ enabled: false }, ownerCookie, 'https://foreign.test'))
      .status,
  ).toBe(403);
  const response = await settingsGet(request('/api/settings/github'));
  expect(response.headers.get('cache-control')).toBe('no-store');
  const body = await response.json();
  expect(body).toEqual({
    saved: { enabled: true, clientId: 'fixture-client', hasSecret: true },
    effective: { enabled: true, clientId: 'fixture-client', hasSecret: true },
    pendingRestart: false,
    callbackUrl: `${origin}/api/auth/callback/github`,
  });
  const ciphertext = connection.db.select().from(githubSettings).get()!
    .clientSecretEncrypted!;
  expect(ciphertext).not.toContain('fixture-secret');
  expect(JSON.stringify(body)).not.toContain(ciphertext);
  expect(JSON.stringify(body)).not.toContain('fixture-secret');
});

it('saved enablement and client credentials remain pending across live origin changes until a fresh runtime snapshot', async () => {
  const response = await patch({
    enabled: false,
    clientId: 'next-client',
    clientSecret: 'next-secret',
  });
  expect(await response.json()).toMatchObject({
    saved: { enabled: false, clientId: 'next-client', hasSecret: true },
    effective: { enabled: true, clientId: 'fixture-client', hasSecret: true },
    pendingRestart: true,
  });
  origin = 'http://127.0.0.1:3181';
  connection.db.update(siteSettings).set({ publicUrl: origin }).run();
  const flow = await begin(true);
  expect(flow.url.searchParams.get('redirect_uri')).toBe(
    `${origin}/api/auth/callback/github`,
  );
  expect((await callback(flow)).headers.get('location')).toBe(
    `${origin}/settings/account?github=linked`,
  );
  expect(exchanges).toEqual([
    { clientId: 'fixture-client', clientSecret: 'fixture-secret' },
  ]);
  expect(
    await (await settingsGet(request('/api/settings/github'))).json(),
  ).toMatchObject({
    pendingRestart: true,
    callbackUrl: `${origin}/api/auth/callback/github`,
  });
  restart();
  expect(
    (await postAuth('sign-in/social', { provider: 'github' })).status,
  ).toBe(404);
  expect(
    (await bindingLink(request('/api/account/github/link', 'POST'))).status,
  ).toBe(409);
  expect(githubAccount()?.accountId).toBe('181');
  expect((await postAuth('sign-in/email', { email, password })).status).toBe(
    200,
  );
  await patch({ enabled: true });
  restart();
  const login = await callback(await begin());
  expect(login.headers.get('location')).toBe(`${origin}/admin`);
  expect(exchanges.at(-1)).toEqual({
    clientId: 'next-client',
    clientSecret: 'next-secret',
  });
  expectNoTokens();
});

it('secret omission preserves ciphertext, equivalent replacement clears pending status, and removal requires disabling', async () => {
  const original = connection.db.select().from(githubSettings).get()!
    .clientSecretEncrypted;
  expect((await patch({ clientId: 'fixture-client' })).status).toBe(200);
  expect(
    connection.db.select().from(githubSettings).get()!.clientSecretEncrypted,
  ).toBe(original);
  expect(
    await (await patch({ clientSecret: 'fixture-secret' })).json(),
  ).toMatchObject({ pendingRestart: false });
  expect(
    connection.db.select().from(githubSettings).get()!.clientSecretEncrypted,
  ).not.toBe(original);
  expect((await patch({ clientSecret: null })).status).toBe(400);
  expect((await patch({ enabled: false, clientSecret: null })).status).toBe(
    200,
  );
  expect(connection.db.select().from(githubSettings).get()).toMatchObject({
    enabled: false,
    clientSecretEncrypted: null,
  });
  expect((await patch({ enabled: true })).status).toBe(400);
  expect(
    (await patch({ enabled: true, clientSecret: '••••••••' })).status,
  ).toBe(400);
  expect((await patch({ enabled: true, provider: 'credential' })).status).toBe(
    400,
  );
});

it.each([email, 'different@example.test'])(
  'active binding of %s preserves all local identity data and stores only the real public login',
  async (githubEmail) => {
    providerEmail = githubEmail;
    const credential = connection.db.select().from(account).get();
    const owner = connection.db.select().from(user).get();
    const currentSession = connection.db.select().from(session).get();
    const response = await callback(await begin(true));
    expect(response.headers.get('location')).toBe(
      `${origin}/settings/account?github=linked`,
    );
    expect(
      await (await bindingGet(request('/api/account/github'))).json(),
    ).toEqual({ binding: { accountId: '181', login: 'fixture-login' } });
    expect(githubAccount()).toMatchObject({
      userId: ownerId,
      accountId: '181',
      githubLogin: 'fixture-login',
    });
    expectNoTokens();
    expect(connection.db.select().from(user).get()).toEqual(owner);
    expect(
      connection.db
        .select()
        .from(account)
        .where(eq(account.providerId, 'credential'))
        .get(),
    ).toEqual(credential);
    expect(connection.db.select().from(session).get()).toEqual(currentSession);
    providerEmail = 'renamed@example.test';
    providerLogin = 'renamed-login';
    connection.db
      .update(account)
      .set({
        accessToken: 'old-access-token',
        refreshToken: 'old-refresh-token',
        idToken: 'old-id-token',
        accessTokenExpiresAt: new Date(),
        refreshTokenExpiresAt: new Date(),
      })
      .where(eq(account.providerId, 'github'))
      .run();
    const login = await callback(await begin());
    expect(login.headers.get('location')).toBe(`${origin}/admin`);
    expect(
      (
        await getAuth()!.api.getSession({
          headers: new Headers({ cookie: cookies(login) }),
        })
      )?.user.id,
    ).toBe(ownerId);
    expect(githubAccount()?.githubLogin).toBe('renamed-login');
    expectNoTokens();
    expect(connection.db.select().from(user).get()?.email).toBe(email);
    expect(
      connection.db
        .select()
        .from(account)
        .where(eq(account.providerId, 'credential'))
        .get(),
    ).toEqual(credential);
  },
);

it.each([
  [email, false, false, 'account_not_linked'],
  [email, true, false, 'account_not_linked'],
  [email, false, true, 'account_not_linked'],
  [email, true, true, 'account_not_linked'],
  ['stranger@example.test', false, false, 'signup_disabled'],
  ['stranger@example.test', true, false, 'signup_disabled'],
] as const)(
  'unbound %s cannot sign in or register with requestSignUp=%s and local emailVerified=%s',
  async (githubEmail, explicit, verified, error) => {
    if (verified) {
      expect((await callback(await begin(true))).headers.get('location')).toBe(
        `${origin}/settings/account?github=linked`,
      );
      const login = await callback(await begin());
      expect(login.headers.get('location')).toBe(`${origin}/admin`);
      expect(
        (
          await getAuth()!.api.getSession({
            headers: new Headers({ cookie: cookies(login) }),
          })
        )?.user.id,
      ).toBe(ownerId);
      const unlink = await bindingDelete(
        request('/api/account/github', 'DELETE'),
      );
      expect(unlink.status).toBe(200);
      expect(await unlink.json()).toEqual({ binding: null });
    }
    expect(connection.db.select().from(user).get()?.emailVerified).toBe(
      verified,
    );
    expect(githubAccount()).toBeUndefined();
    const sessions = connection.db
      .select({ id: session.id })
      .from(session)
      .all();
    providerEmail = githubEmail;
    const response = await callback(await begin(false, explicit));
    expect(
      new URL(response.headers.get('location')!).searchParams.get('error'),
    ).toBe(error);
    expect(githubAccount()).toBeUndefined();
    expect(connection.db.select().from(user).all()).toHaveLength(1);
    expect(
      connection.db.select({ id: session.id }).from(session).all(),
    ).toEqual(sessions);
    expect(response.headers.getSetCookie().join(';')).not.toContain(
      'session_token=',
    );
    expect(
      await getAuth()!.api.getSession({
        headers: new Headers({ cookie: cookies(response) }),
      }),
    ).toBeNull();
  },
);

it('the public authentication facade refuses generic linking, unlinking, registration, other providers and token APIs', async () => {
  for (const path of [
    'link-social',
    'unlink-account',
    'get-access-token',
    'refresh-token',
    'sign-up/email',
    'update-user',
  ])
    expect(
      (
        await postAuth(
          path,
          {
            provider: 'github',
            accountId: connection.db.select().from(account).get()!.id,
          },
          ownerCookie,
        )
      ).status,
    ).toBe(404);
  expect(
    (await postAuth('sign-in/social', { provider: 'google' })).status,
  ).toBe(400);
  expect(
    (await handleAuthRequest(request('/api/auth/callback/google'))).status,
  ).toBe(404);
});

it('missing, foreign, expired and replayed state reject callbacks before provider code exchange', async () => {
  const flow = await begin(true);
  for (const cookie of ['', 'ariso.state=foreign'])
    expect((await callback(flow, cookie)).headers.get('location')).toContain(
      'error=state_mismatch',
    );
  expect(
    (
      await handleAuthRequest(
        new Request(`${origin}/api/auth/callback/github?code=fixture-code`),
      )
    ).headers.get('location'),
  ).toContain('error=state_not_found');
  expect(exchanges).toHaveLength(0);
  expect((await callback(flow)).headers.get('location')).toBe(
    `${origin}/settings/account?github=linked`,
  );
  expect((await callback(flow)).headers.get('location')).toContain(
    'error=state_mismatch',
  );
  expect(exchanges).toHaveLength(1);
  await bindingDelete(request('/api/account/github', 'DELETE'));
  const expired = await begin(true);
  const row = connection.db
    .select()
    .from(verification)
    .where(eq(verification.identifier, expired.state))
    .get()!;
  connection.db
    .update(verification)
    .set({
      value: JSON.stringify({
        ...JSON.parse(row.value),
        expiresAt: Date.now() - 1000,
      }),
    })
    .where(eq(verification.id, row.id))
    .run();
  expect((await callback(expired)).headers.get('location')).toContain(
    'error=state_mismatch',
  );
  expect(exchanges).toHaveLength(1);
});

it('a bound account blocks a second link, including authorization begun before the first binding completed', async () => {
  const first = await begin(true);
  const second = await begin(true);
  await callback(first);
  expect(
    (await bindingLink(request('/api/account/github/link', 'POST'))).status,
  ).toBe(409);
  providerId = 182;
  expect((await callback(second)).headers.get('location')).toContain(
    'error=github_already_linked',
  );
  expect(githubAccount()?.accountId).toBe('181');
  expect(connection.db.select().from(account).all()).toHaveLength(2);
});

it('unlinking ignores a supplied credential target, keeps the same local session and prevents later GitHub login', async () => {
  await callback(await begin(true));
  const credential = connection.db
    .select()
    .from(account)
    .where(eq(account.providerId, 'credential'))
    .get()!;
  const sessions = connection.db.select().from(session).all();
  const response = await bindingDelete(
    request('/api/account/github', 'DELETE', {
      accountId: credential.id,
      provider: 'credential',
    }),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ binding: null });
  expect(connection.db.select().from(account).get()).toEqual(credential);
  expect(connection.db.select().from(session).all()).toEqual(sessions);
  expect(
    (
      await getAuth()!.api.getSession({
        headers: new Headers({ cookie: ownerCookie }),
      })
    )?.user.id,
  ).toBe(ownerId);
  expect((await postAuth('sign-in/email', { email, password })).status).toBe(
    200,
  );
  expect((await callback(await begin())).headers.get('location')).toContain(
    'error=account_not_linked',
  );
  expect(
    (await bindingDelete(request('/api/account/github', 'DELETE'))).status,
  ).toBe(404);
});

it('invalid public profile fails visibly without persisting a binding', async () => {
  providerLogin = '';
  expect((await callback(await begin(true))).headers.get('location')).toContain(
    'error=github_profile_invalid',
  );
  expect(githubAccount()).toBeUndefined();
});

it('disabled effective configuration stops new linking but always retains local password login', async () => {
  await patch({ enabled: false });
  restart();
  const link = await bindingLink(request('/api/account/github/link', 'POST'));
  expect(link.status).toBe(404);
  expect(await link.json()).toMatchObject({
    code: 'PROVIDER_NOT_FOUND',
    message: 'GitHub 登录尚未生效，请检查配置并重启容器',
  });
  expect((await postAuth('sign-in/email', { email, password })).status).toBe(
    200,
  );
  expect(githubAccount()).toBeUndefined();
});

it('a stale but still-valid owner session receives a clear library refusal and does not unlink', async () => {
  await callback(await begin(true));
  connection.db
    .update(session)
    .set({ createdAt: new Date(Date.now() - 2 * 86400000) })
    .run();
  const before = githubAccount();
  const response = await bindingDelete(
    request('/api/account/github', 'DELETE'),
  );
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({
    code: 'SESSION_NOT_FRESH',
    message: '请重新登录后解绑 GitHub',
  });
  expect(githubAccount()).toEqual(before);
});

it.each(['settings update', 'binding delete'])(
  '%s database failure is visible, preserves data and logs the real cause without credentials',
  async (operation) => {
    runtimeState.runtime = {
      ...runtimeState.runtime,
      config: { ...runtimeState.runtime.config, logLevel: 'error' },
    };
    if (operation === 'binding delete') await callback(await begin(true));
    const saved = connection.db.select().from(githubSettings).all();
    const accounts = connection.db.select().from(account).all();
    const sql =
      operation === 'settings update'
        ? "CREATE TRIGGER reject_github_operation BEFORE UPDATE ON identity_github_settings BEGIN SELECT RAISE(ABORT, 'injected GitHub settings failure'); END"
        : "CREATE TRIGGER reject_github_operation BEFORE DELETE ON account WHEN OLD.provider_id = 'github' BEGIN SELECT RAISE(ABORT, 'injected GitHub binding failure'); END";
    connection.db.$client.exec(sql);
    let logs = '';
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk) => {
        logs += String(chunk);
        return true;
      });
    try {
      const response =
        operation === 'settings update'
          ? await patch({ clientSecret: 'replacement-secret' })
          : await bindingDelete(request('/api/account/github', 'DELETE'));
      expect(response.status).toBe(500);
      expect(await response.json()).toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
      });
      expect(logs).toContain('injected GitHub');
      expect(logs).toContain(connection.db.$client.name);
      for (const secret of [
        'fixture-secret',
        'replacement-secret',
        ownerCookie,
        password,
        runtimeState.runtime.config.betterAuthSecret,
        saved[0].clientSecretEncrypted!,
      ])
        expect(logs).not.toContain(secret);
      expect(connection.db.select().from(githubSettings).all()).toEqual(saved);
      expect(connection.db.select().from(account).all()).toEqual(accounts);
    } finally {
      write.mockRestore();
      connection.db.$client.exec('DROP TRIGGER reject_github_operation');
    }
    expect(
      (operation === 'settings update'
        ? await patch({ clientSecret: 'replacement-secret' })
        : await bindingDelete(request('/api/account/github', 'DELETE'))
      ).status,
    ).toBe(200);
  },
);

it('simultaneous callbacks for different GitHub accounts return to account settings and preserve the winning binding', async () => {
  const first = await begin(true);
  const second = await begin(true);
  const credential = connection.db.select().from(account).get();
  const sessions = connection.db.select().from(session).all();
  let pendingProfiles = 0;
  const profilesReady = Promise.withResolvers<void>();
  vi.stubGlobal(
    'fetch',
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url === 'https://github.com/login/oauth/access_token') {
        const code = new URLSearchParams(String(init?.body)).get('code');
        return Response.json({
          access_token: code,
          token_type: 'bearer',
          scope: 'read:user,user:email',
        });
      }
      if (url === 'https://api.github.com/user') {
        const token = new Headers(init?.headers).get('authorization')!;
        pendingProfiles++;
        if (pendingProfiles === 2) profilesReady.resolve();
        await profilesReady.promise;
        return Response.json({
          id: token.includes('182') ? 182 : 181,
          login: token.includes('182') ? 'second-login' : 'first-login',
          email: providerEmail,
        });
      }
      if (url === 'https://api.github.com/user/emails')
        return Response.json([
          { email: providerEmail, primary: true, verified: true },
        ]);
      throw new Error(`Unexpected provider request: ${url}`);
    },
  );
  const complete = (flow: { state: string; cookie: string }, code: string) =>
    handleAuthRequest(
      new Request(
        `${origin}/api/auth/callback/github?code=${code}&state=${flow.state}`,
        { headers: { cookie: flow.cookie } },
      ),
    );
  const results = await Promise.all([
    complete(first, '181'),
    complete(second, '182'),
  ]);
  expect(results.map((response) => response.status)).toEqual([302, 302]);
  expect(
    results.map((response) => response.headers.get('location')).sort(),
  ).toEqual([
    `${origin}/settings/account?github=error&error=github_already_linked`,
    `${origin}/settings/account?github=linked`,
  ]);
  expect(['181', '182']).toContain(githubAccount()?.accountId);
  expect(connection.db.select().from(account).all()).toHaveLength(2);
  expect(
    connection.db
      .select()
      .from(account)
      .where(eq(account.providerId, 'credential'))
      .get(),
  ).toEqual(credential);
  expect(connection.db.select().from(session).all()).toEqual(sessions);
  expectNoTokens();
});

it('the adapter preserves unrelated model/provider constraints and GitHub storage faults', async () => {
  const adapter = (await getAuth()!.$context).adapter;
  const credential = connection.db.select().from(account).get()!;
  await expect(
    adapter.create({
      model: 'account',
      data: { ...credential, id: 'duplicate-credential' },
      forceAllowId: true,
    }),
  ).rejects.toMatchObject({
    code: 'SQLITE_CONSTRAINT_UNIQUE',
    message: 'UNIQUE constraint failed: account.user_id, account.provider_id',
  });
  const owner = connection.db.select().from(user).get()!;
  await expect(
    adapter.create({
      model: 'user',
      data: { ...owner, id: 'second-owner', email: 'second@example.test' },
      forceAllowId: true,
    }),
  ).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT_UNIQUE' });
  connection.db.$client.exec(
    "CREATE TRIGGER reject_github_insert BEFORE INSERT ON account WHEN NEW.provider_id = 'github' BEGIN SELECT RAISE(ABORT, 'injected GitHub insert failure'); END",
  );
  try {
    await expect(
      adapter.create({
        model: 'account',
        data: {
          ...credential,
          id: 'github-insert',
          accountId: '181',
          providerId: 'github',
          password: null,
        },
        forceAllowId: true,
      }),
    ).rejects.toMatchObject({
      code: 'SQLITE_CONSTRAINT_TRIGGER',
      message: 'injected GitHub insert failure',
    });
  } finally {
    connection.db.$client.exec('DROP TRIGGER reject_github_insert');
  }
  expect(connection.db.select().from(account).all()).toEqual([credential]);
});
