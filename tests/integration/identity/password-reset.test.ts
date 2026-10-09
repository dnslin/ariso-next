import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';
import { hashPassword } from 'better-auth/crypto';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from 'vitest';
import { GET, POST } from '../../../src/app/api/auth/[...all]/route.ts';
import { getAuth } from '../../../src/server/identity/auth.ts';
import * as mail from '../../../src/server/identity/mail.ts';
import { resetCliPassword } from '../../../src/server/identity/reset-password.ts';
import {
  account,
  session,
  smtpSettings,
  verification,
} from '../../../src/server/identity/schema.ts';
import { siteSettings } from '../../../src/server/site/schema.ts';
import { createSecretCrypto } from '../../../src/server/runtime/crypto.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import { initializeRuntimePaths } from '../../../src/server/runtime/paths.ts';
import { startServer } from '../../../src/server/startup/server-start.ts';
import * as runtimeLogger from '../../../src/server/runtime/logger.ts';
import { prepareInitialStorage } from '../../../src/server/storage/defaults.ts';
import {
  createSmtpCertificates,
  openSmtpFixture,
} from '../../experiments/identity/smtp-fixture.ts';
import { email, password, seedAuthOwner } from './auth-fixture.ts';
import { launchPasswordResetProcess } from './password-reset-process.ts';

const origin = 'http://localhost:3184';
const nextPassword = 'production-reset-new-password';
let directory: string;
let connection: ReturnType<typeof openRuntimeDatabase>;
let runtime: ReturnType<typeof startServer>;
let auth: NonNullable<ReturnType<typeof getAuth>>;
let certificates: ReturnType<typeof createSmtpCertificates>;
let deliveries: { token: string; url: string }[];
let diagnostics: string[];
const createLogger = runtimeLogger.createRuntimeLogger;
const fixtures: Awaited<ReturnType<typeof openSmtpFixture>>[] = [];
const originalTransport = nodemailer.createTransport.bind(nodemailer);
const state = globalThis as typeof globalThis & {
  arisoServerRuntime?: ReturnType<typeof startServer>;
};
let ip = 0;
function post(
  path: string,
  body: object,
  headers: Record<string, string> = {},
) {
  return POST(
    new Request(`${origin}/api/auth/${path}`, {
      method: 'POST',
      headers: {
        origin,
        'content-type': 'application/json',
        'x-forwarded-for': `192.0.2.${++ip}`,
        ...headers,
      },
      body: JSON.stringify(body),
    }),
  );
}
const apply = (address = email, headers = {}) =>
  post(
    'request-password-reset',
    { email: address, redirectTo: '/arbitrary-page' },
    headers,
  );
const reset = (token: string, newPassword = nextPassword) =>
  post('reset-password', { token, newPassword });
const login = (value = password) =>
  post('sign-in/email', { email, password: value });
const cookie = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
const readSession = async (value: string) =>
  (
    await GET(
      new Request(`${origin}/api/auth/get-session`, {
        headers: { cookie: value },
      }),
    )
  ).json();
const credential = () => connection.db.select().from(account).get()!.password;
function saveSmtp(port = 465) {
  mail.updateSmtpSettings(
    connection.db,
    createSecretCrypto(runtime.config.encryptionKey),
    {
      host: 'localhost',
      port,
      mode: 'tls',
      fromName: 'Ariso',
      fromEmail: 'sender@example.test',
      clearCredentials: true,
    },
  );
}
function captureMail() {
  return vi
    .spyOn(mail, 'sendSmtpMail')
    .mockImplementation(async (_config, message) => {
      const url = message.text.match(/https?:\/\/[^\s]+/)![0];
      deliveries.push({ url, token: new URL(url).pathname.split('/').at(-1)! });
      return {
        acceptance: 'smtp-accepted',
        finalReceipt: 'unverified',
        accepted: [message.to],
        rejected: [],
        messageId: 'isolated-reset-mail',
      };
    });
}
function trustFixture() {
  vi.spyOn(nodemailer, 'createTransport').mockImplementation((options) =>
    originalTransport({
      ...(options as SMTPTransport.Options),
      tls: { ...(options as SMTPTransport.Options).tls, ca: certificates.ca },
    }),
  );
}
beforeAll(() => {
  certificates = createSmtpCertificates();
});
afterAll(() => certificates.close());
beforeEach(async () => {
  diagnostics = [];
  vi.spyOn(runtimeLogger, 'createRuntimeLogger').mockImplementation(
    (module, level) =>
      createLogger(module, level, {
        write(value) {
          diagnostics.push(value);
        },
      }),
  );
  directory = mkdtempSync(join(tmpdir(), 'ariso-password-reset-production-'));
  const env = {
    DATA_DIR: join(directory, 'data'),
    BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
    ARISO_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
    LOG_LEVEL: 'error',
  };
  initializeRuntimePaths(env.DATA_DIR);
  connection = openRuntimeDatabase(join(env.DATA_DIR, 'ariso.db'));
  migrateRuntimeDatabase(connection.db, resolve('drizzle'));
  prepareInitialStorage(connection.db, {
    storage: join(env.DATA_DIR, 'storage'),
  });
  await seedAuthOwner(connection, origin);
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  runtime = startServer();
  auth = getAuth(runtime)!;
  deliveries = [];
});
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.close()));
  await runtime?.stop();
  delete state.arisoServerRuntime;
  vi.unstubAllEnvs();
  connection?.close();
  rmSync(directory, { recursive: true, force: true });
});

it('keeps absent SMTP unavailable for known and unknown emails without generating a token', async () => {
  for (const address of [email, 'absent@example.test']) {
    const response = await apply(address);
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({
      code: 'SMTP_NOT_CONFIGURED',
    });
  }
  expect(connection.db.select().from(verification).all()).toEqual([]);
});

it('delivers through real TLS SMTP, fixes the callback, and returns identical unknown-email feedback', async () => {
  const fixture = await openSmtpFixture(certificates, { secure: true });
  fixtures.push(fixture);
  trustFixture();
  saveSmtp(fixture.port);
  const known = await apply(email.toUpperCase());
  expect(known.status).toBe(200);
  expect(await (await apply('absent@example.test')).json()).toEqual(
    await known.json(),
  );
  expect(fixture.received).toHaveLength(1);
  const sent = fixture.received[0];
  expect(sent.secure).toBe(true);
  expect(sent.recipients).toEqual([email]);
  // Quoted-printable folding is an SMTP representation, not part of the URL.
  const text = sent.raw.replace(/=\r?\n/g, '').replace(/=3D/g, '=');
  const url = text.match(
    /http:\/\/localhost:3184\/api\/auth\/reset-password\/[^\s]+/,
  )![0];
  const link = new URL(url);
  expect(link.searchParams.get('callbackURL')).toBe('/reset-password');
  link.searchParams.set('callbackURL', '/arbitrary-page');
  const response = await GET(new Request(link));
  expect(response.status).toBe(302);
  expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  expect(response.headers.get('location')).toBe(
    `${origin}/reset-password?token=${link.pathname.split('/').at(-1)}`,
  );
  const record = connection.db.select().from(verification).get()!;
  expect(record.expiresAt.getTime() - record.createdAt.getTime()).toBeCloseTo(
    3600000,
    -2,
  );
});

it('rebuilds links from the current publicUrl and prohibits direct server delivery calls', async () => {
  saveSmtp();
  captureMail();
  await expect(
    auth.api.requestPasswordReset({ body: { email } }),
  ).rejects.toMatchObject({ body: { code: 'RESET_REQUEST_REQUIRED' } });
  await apply();
  connection.db
    .update(siteSettings)
    .set({ publicUrl: 'https://updated.example.test' })
    .run();
  const response = await POST(
    new Request(
      'https://updated.example.test/api/auth/request-password-reset',
      {
        method: 'POST',
        headers: {
          origin: 'https://updated.example.test',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          email,
          redirectTo: '/arbitrary-page',
        }),
      },
    ),
  );
  expect(response.status).toBe(200);
  expect(new URL(deliveries[1].url).origin).toBe(
    'https://updated.example.test',
  );
  expect(new URL(deliveries[1].url).searchParams.get('callbackURL')).toBe(
    '/reset-password',
  );
});

it('waits for delivery, propagates real failures, and isolates concurrent requests', async () => {
  saveSmtp();
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let calls = 0;
  vi.spyOn(mail, 'sendSmtpMail').mockImplementation(async () => {
    const current = ++calls;
    if (calls === 2) entered.resolve();
    await release.promise;
    if (current === 2)
      throw new mail.SmtpSendError({
        code: 'EAUTH',
        command: 'AUTH',
        responseCode: 535,
      });
    return {
      acceptance: 'smtp-accepted',
      finalReceipt: 'unverified',
      accepted: [email],
      rejected: [],
      messageId: 'isolated',
    };
  });
  let finished = false;
  const success = apply().then((result) => {
    finished = true;
    return result;
  });
  const failure = apply();
  await entered.promise;
  expect(finished).toBe(false);
  release.resolve();
  expect((await success).status).toBe(200);
  const failed = await failure;
  expect(failed.status).toBe(502);
  expect(await failed.json()).toMatchObject({
    code: 'RESET_EMAIL_DELIVERY_FAILED',
  });
  expect((await apply()).status).toBe(200);
});

it('preserves SMTP timeout status and unknown delivery semantics', async () => {
  saveSmtp();
  vi.spyOn(mail, 'sendSmtpMail').mockRejectedValue(
    new mail.SmtpSendError({
      code: 'ETIMEDOUT',
      command: 'DATA',
      message: 'Timeout',
    }),
  );
  const response = await apply();
  expect(response.status).toBe(504);
  expect(await response.json()).toMatchObject({
    code: 'RESET_EMAIL_DELIVERY_UNKNOWN',
  });
});

it('does not claim success after real SMTP DATA acceptance loses its response or log reset URLs', async () => {
  const fixture = await openSmtpFixture(
    certificates,
    { secure: true },
    { disconnectAfterData: 'close' },
  );
  fixtures.push(fixture);
  trustFixture();
  saveSmtp(fixture.port);
  const response = await apply();
  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({
    code: 'RESET_EMAIL_DELIVERY_UNKNOWN',
  });
  expect(fixture.received).toHaveLength(1);
  const token = connection.db
    .select()
    .from(verification)
    .get()!
    .identifier.replace('reset-password:', '');
  expect(diagnostics.join('\n')).toContain('Password reset email failed');
  expect(diagnostics.join('\n')).not.toContain(token);
  expect(diagnostics.join('\n')).not.toContain('/api/auth/reset-password/');
});

it('changes a real credential once, revokes both old Cookies, and issues no new Cookie', async () => {
  saveSmtp();
  captureMail();
  const cookies = [cookie(await login()), cookie(await login())];
  await apply();
  const token = deliveries[0].token;
  const response = await reset(token);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: true });
  expect(response.headers.getSetCookie()).toEqual([]);
  expect(connection.db.select().from(session).all()).toEqual([]);
  for (const value of cookies) expect(await readSession(value)).toBeNull();
  expect((await login()).status).toBe(401);
  expect((await login(nextPassword)).status).toBe(200);
  expect((await reset(token)).status).toBe(400);
});

it('validates password length before consuming and preserves password whitespace', async () => {
  saveSmtp();
  captureMail();
  await apply();
  const token = deliveries[0].token;
  for (const value of ['short', 'x'.repeat(129)]) {
    expect((await reset(token, value)).status).toBe(400);
    expect(connection.db.select().from(verification).all()).toHaveLength(1);
  }
  const value = '  abcd  ';
  expect((await reset(token, value)).status).toBe(200);
  expect((await login(value)).status).toBe(200);
  expect((await login(value.trim())).status).toBe(401);
});

it('advances the clock beyond one hour, rejects callbacks and reset, and permits a fresh application', async () => {
  saveSmtp();
  captureMail();
  const active = cookie(await login());
  const previous = credential();
  await apply();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.now() + 3600001);
  const response = await GET(new Request(deliveries[0].url));
  expect(response.headers.get('location')).toBe(
    `${origin}/reset-password?error=INVALID_TOKEN`,
  );
  expect((await reset(deliveries[0].token)).status).toBe(400);
  expect(credential()).toBe(previous);
  expect(await readSession(active)).not.toBeNull();
  vi.useRealTimers();
  await apply();
  expect((await reset(deliveries[1].token)).status).toBe(200);
});

it('atomically allows exactly one consumption after two production processes read the same disk token', async () => {
  saveSmtp();
  captureMail();
  await apply();
  const cookies = [cookie(await login()), cookie(await login())];
  const candidates = ['first-race-password', 'second-race-password'];
  const children = await Promise.all(
    candidates.map((password) =>
      launchPasswordResetProcess({
        database: join(directory, 'data', 'ariso.db'),
        origin,
        secret: runtime.config.betterAuthSecret,
        encryptionKey: runtime.config.encryptionKey.toString('hex'),
        token: deliveries[0].token,
        password,
      }),
    ),
  );
  try {
    expect(children[0].child.pid).not.toBe(children[1].child.pid);
    await Promise.all(children.map((child) => child.consuming));
    expect(connection.db.select().from(verification).all()).toHaveLength(1);
    for (const child of children) child.resume();
    const results = await Promise.all(children.map((child) => child.result));
    expect(results.map((response) => response.status).sort()).toEqual([
      200, 400,
    ]);
    const winner = results.findIndex((response) => response.status === 200);
    expect(results[winner].body).toEqual({ status: true });
    expect(results[1 - winner].body).toMatchObject({ code: 'INVALID_TOKEN' });
    for (const result of results) expect(result.cookies).toEqual([]);
    expect((await login(candidates[winner])).status).toBe(200);
    expect((await login(candidates[1 - winner])).status).toBe(401);
    for (const value of cookies) expect(await readSession(value)).toBeNull();
  } finally {
    await Promise.all(children.map((child) => child.stop()));
  }
}, 20000);

it.each(['consume', 'hash', 'password-write', 'session-revoke'] as const)(
  'preserves actual partial state after %s failure and recovers with a fresh link',
  async (fault) => {
    saveSmtp();
    captureMail();
    const cookies = [cookie(await login()), cookie(await login())];
    const previous = credential();
    await apply();
    const context = await auth.$context;
    const hash = context.password.hash;
    const triggers = {
      consume:
        "CREATE TRIGGER reject_reset BEFORE DELETE ON verification BEGIN SELECT RAISE(ABORT, 'injected reset consume failure'); END",
      'password-write':
        "CREATE TRIGGER reject_reset BEFORE UPDATE OF password ON account BEGIN SELECT RAISE(ABORT, 'injected reset write failure'); END",
      'session-revoke':
        "CREATE TRIGGER reject_reset BEFORE DELETE ON session BEGIN SELECT RAISE(ABORT, 'injected reset revoke failure'); END",
    };
    if (fault === 'hash')
      context.password.hash = async () => {
        throw new Error('injected reset hash failure');
      };
    else connection.db.$client.exec(triggers[fault]);
    try {
      const failed = await reset(deliveries[0].token);
      expect(failed.status).toBe(500);
      expect(await failed.text()).not.toContain(deliveries[0].token);
      expect(diagnostics.join('\n')).toContain('injected reset');
      for (const secret of [
        deliveries[0].token,
        deliveries[0].url,
        password,
        nextPassword,
      ])
        expect(diagnostics.join('\n')).not.toContain(secret);
      expect(connection.db.select().from(verification).all()).toHaveLength(
        fault === 'consume' ? 1 : 0,
      );
      if (fault === 'session-revoke') expect(credential()).not.toBe(previous);
      else expect(credential()).toBe(previous);
      expect(connection.db.select().from(session).all()).toHaveLength(2);
      for (const value of cookies)
        expect(await readSession(value)).not.toBeNull();
    } finally {
      context.password.hash = hash;
      if (fault !== 'hash')
        connection.db.$client.exec('DROP TRIGGER reject_reset');
    }
    expect((await login()).status).toBe(fault === 'session-revoke' ? 401 : 200);
    expect((await login(nextPassword)).status).toBe(
      fault === 'session-revoke' ? 200 : 401,
    );
    await apply();
    expect(
      (await reset(deliveries[1].token, 'fresh-recovery-password')).status,
    ).toBe(200);
    for (const value of cookies) expect(await readSession(value)).toBeNull();
    expect((await login('fresh-recovery-password')).status).toBe(200);
  },
);

it('records the real CLI boundary: consumed in-flight email reset can write after CLI and revoke its later session', async () => {
  saveSmtp();
  captureMail();
  await apply();
  await apply();
  const context = await auth.$context;
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const hash = context.password.hash;
  context.password.hash = async (value) => {
    entered.resolve();
    await release.promise;
    return hashPassword(value);
  };
  const pending = reset(deliveries[0].token);
  let result: Response;
  try {
    await entered.promise;
    expect(connection.db.select().from(verification).all()).toHaveLength(1);
    await resetCliPassword(
      connection.db,
      'cli-while-email-in-flight',
      'cli-while-email-in-flight',
    );
    expect(connection.db.select().from(verification).all()).toEqual([]);
    const afterCli = cookie(await login('cli-while-email-in-flight'));
    expect(await readSession(afterCli)).not.toBeNull();
    release.resolve();
    result = await pending;
    expect(result.status).toBe(200);
    expect(await readSession(afterCli)).toBeNull();
    expect((await login(nextPassword)).status).toBe(200);
    expect((await login('cli-while-email-in-flight')).status).toBe(401);
  } finally {
    release.resolve();
    await pending;
    context.password.hash = hash;
  }
});

it('rejects foreign origins and unexposed auth methods without generating tokens', async () => {
  saveSmtp();
  captureMail();
  expect(
    (
      await apply(email, {
        origin: 'https://foreign.example.test',
        cookie: 'browser=present',
      })
    ).status,
  ).toBe(403);
  expect(
    (await GET(new Request(`${origin}/api/auth/request-password-reset`)))
      .status,
  ).toBe(404);
  expect(
    (await post('sign-up/email', { email, password, name: 'Unauthorized' }))
      .status,
  ).toBe(404);
  expect(deliveries).toEqual([]);
  expect(connection.db.select().from(smtpSettings).all()).toHaveLength(1);
});
