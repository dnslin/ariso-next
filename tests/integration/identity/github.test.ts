import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createGithubAuth,
  openGithubHttpFixture,
  type GithubConfig,
} from '../../experiments/identity/github-fixture.ts';
import { openFixture, seedOwner } from '../../experiments/identity/fixture.ts';
import {
  account,
  user,
  verification,
} from '../../experiments/identity/schema.ts';

let directory: string;
let connection: ReturnType<typeof openFixture>;
let auth: ReturnType<typeof createGithubAuth>;
let ownerId: string;
let ownerCookie: string;
let githubEmail: string;
let githubId: number;
let exchanges: number;
let tokenSecret: string | null;
let authSecret: string;
let requestIp = 0;
const origin = 'http://localhost:3145';
const email = 'owner@example.test';
const password = 'github-experiment-password';
const cookies = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');

function post(path: string, body: object, cookie = '') {
  return auth.handler(
    new Request(`${origin}/api/auth/${path}`, {
      method: 'POST',
      headers: {
        origin,
        cookie,
        'content-type': 'application/json',
        'x-forwarded-for': `192.0.2.${++requestIp}`,
      },
      body: JSON.stringify(body),
    }),
  );
}
async function begin(
  link = false,
  cookie = ownerCookie,
  requestSignUp = false,
) {
  const response = await post(
    link ? 'link-social' : 'sign-in/social',
    {
      provider: 'github',
      callbackURL: `${origin}/`,
      disableRedirect: true,
      requestSignUp,
    },
    link ? cookie : '',
  );
  expect(response.status, await response.clone().text()).toBe(200);
  const url = new URL((await response.json()).url);
  return { state: url.searchParams.get('state')!, cookie: cookies(response) };
}
function callback(
  flow: { state: string; cookie: string },
  cookie = flow.cookie,
) {
  return auth.handler(
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
  directory = mkdtempSync(join(tmpdir(), 'ariso-github-'));
  connection = openFixture(join(directory, 'auth.db'));
  ownerId = await seedOwner(connection.db, email, password);
  authSecret = randomBytes(32).toString('hex');
  auth = createGithubAuth(connection.db, origin, authSecret, {
    enabled: true,
    clientId: 'fixture-client',
    clientSecret: 'fixture-secret',
  });
  githubEmail = email;
  githubId = 145;
  exchanges = 0;
  // Only GitHub HTTP is a substitute. Better Auth, signed state, hooks and SQLite are real.
  vi.stubGlobal(
    'fetch',
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url === 'https://github.com/login/oauth/access_token') {
        exchanges++;
        tokenSecret = new URLSearchParams(String(init?.body)).get(
          'client_secret',
        );
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
          id: githubId,
          login: 'fixture-login',
          name: 'Fixture',
          email: githubEmail,
        });
      if (url === 'https://api.github.com/user/emails')
        return Response.json([
          { email: githubEmail, primary: true, verified: true },
        ]);
      throw new Error(`Unexpected provider request: ${url}`);
    },
  );
  const login = await post('sign-in/email', { email, password });
  expect(login.status, await login.clone().text()).toBe(200);
  ownerCookie = cookies(login);
  expect(ownerCookie).toContain('session_token=');
});
afterEach(() => {
  vi.unstubAllGlobals();
  connection?.close();
  if (directory) rmSync(directory, { recursive: true, force: true });
});

it.each([email, 'different@example.test'])(
  'active binding of %s preserves the owner and credential and stores no provider tokens',
  async (providerEmail) => {
    githubEmail = providerEmail;
    const credential = connection.db.select().from(account).get();
    const response = await callback(await begin(true));
    expect(response.headers.get('location')).toBe(`${origin}/`);
    expect(githubAccount()).toMatchObject({
      userId: ownerId,
      accountId: '145',
    });
    expectNoTokens();
    expect(connection.db.select().from(user).all()).toHaveLength(1);
    expect(connection.db.select().from(user).get()?.email).toBe(email);
    expect(
      connection.db
        .select()
        .from(account)
        .where(eq(account.providerId, 'credential'))
        .get(),
    ).toEqual(credential);
    // Repeat binding exercises account.update.before, not only create.before.
    connection.db
      .update(account)
      .set({
        accessToken: 'old-token',
        refreshToken: 'old-refresh',
        idToken: 'old-id',
        accessTokenExpiresAt: new Date(),
        refreshTokenExpiresAt: new Date(),
      })
      .where(eq(account.providerId, 'github'))
      .run();
    expect((await callback(await begin(true))).headers.get('location')).toBe(
      `${origin}/`,
    );
    expectNoTokens();
    // Stable provider ID still logs in after the provider email changes.
    githubEmail = 'renamed@example.test';
    const login = await callback(await begin());
    expect(login.headers.get('location')).toBe(`${origin}/`);
    const session = await auth.api.getSession({
      headers: new Headers({ cookie: cookies(login) }),
    });
    expect(session?.user.id).toBe(ownerId);
    expectNoTokens();
  },
);

it.each([
  [email, false, 'account_not_linked'],
  [email, true, 'account_not_linked'],
  ['stranger@example.test', false, 'signup_disabled'],
  ['stranger@example.test', true, 'signup_disabled'],
])(
  'unbound %s cannot sign in or register (requestSignUp=%s)',
  async (providerEmail, explicit, error) => {
    githubEmail = providerEmail;
    const response = await callback(await begin(false, '', explicit));
    expect(
      new URL(response.headers.get('location')!).searchParams.get('error'),
    ).toBe(error);
    expect(githubAccount()).toBeUndefined();
    expect(connection.db.select().from(user).all()).toHaveLength(1);
    expect(response.headers.getSetCookie().join(';')).not.toContain(
      'session_token=',
    );
  },
);

it('anonymous linking and local registration are refused', async () => {
  const anonymous = await post('link-social', {
    provider: 'github',
    callbackURL: `${origin}/`,
  });
  expect(anonymous.status).toBe(401);
  expect(
    (
      await post('sign-up/email', {
        name: 'Other',
        email: 'other@example.test',
        password,
      })
    ).status,
  ).toBe(400);
  expect(connection.db.select().from(user).all()).toHaveLength(1);
  expect(githubAccount()).toBeUndefined();
});

it('missing, foreign, expired and replayed state never exchange a provider code', async () => {
  const flow = await begin(true);
  for (const cookie of ['', 'ariso-identity-experiment.state=foreign']) {
    const response = await callback(flow, cookie);
    expect(response.headers.get('location')).toContain('error=state_mismatch');
  }
  const missing = await auth.handler(
    new Request(`${origin}/api/auth/callback/github?code=fixture-code`),
  );
  expect(missing.headers.get('location')).toContain('error=state_not_found');
  expect(exchanges).toBe(0);
  expect((await callback(flow)).headers.get('location')).toBe(`${origin}/`);
  expect(exchanges).toBe(1);
  expect((await callback(flow)).headers.get('location')).toContain(
    'error=state_mismatch',
  );
  expect(exchanges).toBe(1);
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
  expect(exchanges).toBe(1);
});

it('unlink uses the local GitHub row id, retains credential login and blocks later GitHub login', async () => {
  await callback(await begin(true));
  const linked = githubAccount()!;
  const response = await auth.api.unlinkAccount({
    headers: new Headers({ cookie: ownerCookie }),
    body: { accountId: linked.id },
    asResponse: true,
  });
  expect(response.status).toBe(200);
  expect(githubAccount()).toBeUndefined();
  expect((await post('sign-in/email', { email, password })).status).toBe(200);
  expect((await callback(await begin())).headers.get('location')).toContain(
    'error=account_not_linked',
  );
});

it('the database refuses replacing an existing GitHub binding with a second account', async () => {
  await callback(await begin(true));
  githubId = 146;
  expect((await callback(await begin(true))).status).toBe(500);
  expect(githubAccount()?.accountId).toBe('145');
  expect(connection.db.select().from(account).all()).toHaveLength(2);
});

it('the token exchange keeps the startup Client Secret across live origin refresh and uses a new one after restart', async () => {
  const configPath = join(directory, 'github.json');
  const originPath = join(directory, 'origin.json');
  writeFileSync(
    configPath,
    JSON.stringify({
      enabled: true,
      clientId: 'fixture-client',
      clientSecret: 'before-secret',
    }),
  );
  const capture = () =>
    JSON.parse(readFileSync(configPath, 'utf8')) as GithubConfig;
  let runtime = openGithubHttpFixture(
    join(directory, 'auth.db'),
    originPath,
    capture(),
    authSecret,
  );
  async function complete(currentOrigin: string) {
    writeFileSync(originPath, JSON.stringify({ origin: currentOrigin }));
    const current = runtime.getAuth();
    const started = await current.api.linkSocialAccount({
      headers: new Headers({ cookie: ownerCookie }),
      body: {
        provider: 'github',
        callbackURL: `${currentOrigin}/`,
        disableRedirect: true,
      },
      asResponse: true,
    });
    const url = new URL((await started.json()).url);
    expect(url.searchParams.get('redirect_uri')).toBe(
      `${currentOrigin}/api/auth/callback/github`,
    );
    const response = await current.handler(
      new Request(
        `${currentOrigin}/api/auth/callback/github?code=fixture-code&state=${url.searchParams.get('state')}`,
        { headers: { cookie: cookies(started) } },
      ),
    );
    expect(response.headers.get('location')).toBe(`${currentOrigin}/`);
  }
  try {
    await complete(origin);
    expect(tokenSecret).toBe('before-secret');
    writeFileSync(
      configPath,
      JSON.stringify({
        enabled: true,
        clientId: 'fixture-client',
        clientSecret: 'after-secret',
      }),
    );
    await complete('http://127.0.0.1:3145');
    expect(tokenSecret).toBe('before-secret');
    runtime.close();
    runtime = openGithubHttpFixture(
      join(directory, 'auth.db'),
      originPath,
      capture(),
      authSecret,
    );
    await complete(origin);
    expect(tokenSecret).toBe('after-secret');
    expectNoTokens();
  } finally {
    runtime.close();
  }
});
