import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from 'vitest';
import { GET, PATCH } from '../../../src/app/api/settings/smtp/route.ts';
import { POST } from '../../../src/app/api/settings/smtp/test/route.ts';
import { getAuth } from '../../../src/server/identity/auth.ts';
import {
  createSmtpTransport,
  readSmtpConfig,
  readSmtpSettings,
  smtpTimeouts,
  updateSmtpSettings,
} from '../../../src/server/identity/mail.ts';
import { smtpSettings, user } from '../../../src/server/identity/schema.ts';
import { createSecretCrypto } from '../../../src/server/runtime/crypto.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import { initializeRuntimePaths } from '../../../src/server/runtime/paths.ts';
import { startServer } from '../../../src/server/startup/server-start.ts';
import { prepareInitialStorage } from '../../../src/server/storage/defaults.ts';
import {
  createSmtpCertificates,
  openSmtpFixture,
} from '../../experiments/identity/smtp-fixture.ts';
import { email, password, seedAuthOwner } from './auth-fixture.ts';

let certificates: ReturnType<typeof createSmtpCertificates>;
let directory: string;
let connection: ReturnType<typeof openRuntimeDatabase>;
let runtime: ReturnType<typeof startServer> | undefined;
let cookie: string;
let env: Record<string, string>;
const fixtures: Awaited<ReturnType<typeof openSmtpFixture>>[] = [];
const origin = 'http://localhost:3182';
const state = globalThis as typeof globalThis & {
  arisoServerRuntime?: ReturnType<typeof startServer>;
};
const input = {
  host: 'localhost',
  port: 465,
  mode: 'tls' as const,
  username: 'smtp-owner',
  password: 'private-production-smtp-password',
  fromName: 'Ariso Test',
  fromEmail: 'sender@example.test',
};
const originalTransport = nodemailer.createTransport.bind(nodemailer);
const crypto = () =>
  createSecretCrypto(Buffer.from(env.ARISO_ENCRYPTION_KEY, 'hex'));
const request = (
  method: string,
  body?: unknown,
  headers: Record<string, string> = {},
) =>
  new Request(`${origin}/api/settings/smtp`, {
    method,
    headers: { cookie, origin, ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const save = (values: Parameters<typeof updateSmtpSettings>[2] = input) =>
  updateSmtpSettings(connection.db, crypto(), values);
function trustFixture(timeouts: object = {}) {
  vi.spyOn(nodemailer, 'createTransport').mockImplementation((options) =>
    originalTransport({
      ...(options as SMTPTransport.Options),
      ...timeouts,
      tls: { ...(options as SMTPTransport.Options).tls, ca: certificates.ca },
    }),
  );
}
beforeAll(() => {
  certificates = createSmtpCertificates();
});
afterAll(() => certificates.close());
beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'ariso-smtp-production-'));
  env = {
    DATA_DIR: join(directory, 'data'),
    BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
    ARISO_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
    LOG_LEVEL: 'fatal',
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
  const login = await getAuth(runtime)!.api.signInEmail({
    body: { email, password },
    asResponse: true,
  });
  expect(login.status).toBe(200);
  cookie = login.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
});
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.close()));
  await runtime?.stop();
  runtime = undefined;
  delete state.arisoServerRuntime;
  vi.unstubAllEnvs();
  connection?.close();
  rmSync(directory, { recursive: true, force: true });
});

it('owner APIs expose null before configuration, reject unauthorized writes and arbitrary recipients', async () => {
  const empty = await GET(request('GET'));
  expect(empty.headers.get('cache-control')).toBe('no-store');
  expect(await empty.json()).toBeNull();
  expect(
    (
      await GET(
        request('GET', undefined, {
          cookie: '',
          authorization: 'Bearer upload-token',
        }),
      )
    ).status,
  ).toBe(401);
  expect(
    (await PATCH(request('PATCH', input, { origin: 'http://other.test' })))
      .status,
  ).toBe(403);
  expect((await POST(request('POST'))).status).toBe(400);
  const invalidRecipient = await POST(
    request('POST', { to: 'arbitrary@example.test' }),
  );
  expect(invalidRecipient.status).toBe(400);
  expect(await invalidRecipient.json()).toMatchObject({
    message: '请检查邮件设置',
  });
  expect(readSmtpSettings(connection.db)).toBeNull();
});

it('save never connects, encrypts the password, preserves/replaces it and explicitly clears both credentials', async () => {
  const transport = vi.spyOn(nodemailer, 'createTransport');
  const saved = await PATCH(request('PATCH', input));
  expect(saved.status).toBe(200);
  const publicSettings = await saved.json();
  expect(publicSettings).toMatchObject({ host: input.host, hasPassword: true });
  expect(publicSettings).not.toHaveProperty('password');
  expect(publicSettings).not.toHaveProperty('passwordEncrypted');
  const encrypted = connection.db.select().from(smtpSettings).get()!
    .passwordEncrypted;
  expect(encrypted).not.toContain(input.password);
  expect(readSmtpConfig(connection.db, crypto())?.password).toBe(
    input.password,
  );
  const omitted = await PATCH(request('PATCH', { fromName: 'Updated sender' }));
  expect(omitted.status).toBe(200);
  expect(
    connection.db.select().from(smtpSettings).get()!.passwordEncrypted,
  ).toBe(encrypted);
  const invalid = await PATCH(request('PATCH', { username: '' }));
  expect(invalid.status).toBe(400);
  expect(await invalid.json()).toMatchObject({
    fields: [{ field: 'username' }],
  });
  expect(
    connection.db.select().from(smtpSettings).get()!.passwordEncrypted,
  ).toBe(encrypted);
  expect(
    (await PATCH(request('PATCH', { password: 'replacement-password' })))
      .status,
  ).toBe(200);
  expect(readSmtpConfig(connection.db, crypto())?.password).toBe(
    'replacement-password',
  );
  const cleared = await PATCH(request('PATCH', { clearCredentials: true }));
  expect(await cleared.json()).toMatchObject({
    username: '',
    hasPassword: false,
    host: input.host,
    fromName: 'Updated sender',
  });
  expect(
    connection.db.select().from(smtpSettings).get()!.passwordEncrypted,
  ).toBeNull();
  expect(transport).not.toHaveBeenCalled();
});

it.each(['tls', 'starttls'] as const)(
  '%s sends persisted configuration to the current owner through a real encrypted relay',
  async (mode) => {
    const fixture = await openSmtpFixture(certificates, {
      secure: mode === 'tls',
      disabledCommands: ['AUTH'],
    });
    fixtures.push(fixture);
    trustFixture();
    save({
      ...input,
      username: '',
      password: undefined,
      port: fixture.port,
      mode,
    });
    connection.db
      .update(user)
      .set({ email: 'updated-owner@example.test' })
      .run();
    const response = await POST(request('POST', {}));
    expect(response.status, await response.clone().text()).toBe(200);
    expect(await response.json()).toMatchObject({
      acceptance: 'smtp-accepted',
      finalReceipt: 'unverified',
      accepted: ['updated-owner@example.test'],
    });
    expect(fixture.received).toHaveLength(1);
    expect(fixture.received[0]).toMatchObject({
      secure: true,
      recipients: ['updated-owner@example.test'],
      from: input.fromEmail,
    });
    expect(response.headers.get('cache-control')).toBe('no-store');
  },
);

it('production TLS policy keeps certificate checks, bounded timeouts and raw SMTP logging disabled', () => {
  const transport = createSmtpTransport({ ...input, password: null });
  expect(transport.options).toMatchObject({
    ...smtpTimeouts,
    secure: true,
    requireTLS: false,
    tls: { rejectUnauthorized: true },
    logger: false,
    debug: false,
  });
  transport.close();
});

it.each(['tls', 'starttls'] as const)(
  '%s rejects untrusted certificates with a safe TLS diagnostic',
  async (mode) => {
    const fixture = await openSmtpFixture(certificates, {
      secure: mode === 'tls',
    });
    fixtures.push(fixture);
    save({ ...input, port: fixture.port, mode });
    const response = await POST(request('POST'));
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      code: 'SMTP_SEND_FAILED',
      diagnostic: { stage: 'tls', delivery: 'not-accepted' },
    });
    expect(fixture.received).toHaveLength(0);
  },
);

it('STARTTLS refuses a server without an upgrade', async () => {
  const fixture = await openSmtpFixture(certificates, {
    disabledCommands: ['STARTTLS'],
  });
  fixtures.push(fixture);
  save({ ...input, port: fixture.port, mode: 'starttls' });
  const response = await POST(request('POST'));
  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({
    diagnostic: {
      stage: 'tls',
      command: 'STARTTLS',
      code: 'ETLS',
      delivery: 'not-accepted',
    },
  });
});

it('connection refusal and authentication rejection retain their actual stages without leaking secrets', async () => {
  const refused = await openSmtpFixture(certificates, { secure: true });
  await refused.close();
  save({ ...input, port: refused.port });
  const connectionFailure = await POST(request('POST'));
  expect(connectionFailure.status).toBe(502);
  expect(await connectionFailure.json()).toMatchObject({
    diagnostic: { stage: 'connection', delivery: 'not-accepted' },
  });
  const fixture = await openSmtpFixture(certificates, {
    secure: true,
    authOptional: false,
    onAuth(_auth, _session, callback) {
      callback(
        Object.assign(new Error(`Rejected ${input.password}`), {
          responseCode: 535,
        }),
      );
    },
  });
  fixtures.push(fixture);
  trustFixture();
  save({ ...input, port: fixture.port });
  const response = await POST(request('POST'));
  expect(response.status).toBe(502);
  const text = await response.text();
  expect(JSON.parse(text)).toMatchObject({
    diagnostic: {
      stage: 'authentication',
      code: 'EAUTH',
      responseCode: 535,
      delivery: 'not-accepted',
    },
  });
  expect(text).not.toContain(input.password);
});

it('DATA rejection retains a delivery diagnostic and excludes echoed credentials and reset URLs from HTTP and logs', async () => {
  const resetUrl =
    'https://ariso.example/reset-password?token=private-reset-token';
  const fixture = await openSmtpFixture(
    certificates,
    { secure: true, disabledCommands: ['AUTH'] },
    {
      error: Object.assign(
        new Error(`Rejected ${input.password} ${resetUrl}`),
        { responseCode: 554 },
      ),
    },
  );
  fixtures.push(fixture);
  trustFixture();
  save({ ...input, username: '', password: undefined, port: fixture.port });
  vi.stubEnv('LOG_LEVEL', 'error');
  runtime!.config.logLevel = 'error';
  const writes: string[] = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    writes.push(String(chunk));
    return true;
  });
  const response = await POST(request('POST'));
  expect(response.status).toBe(502);
  const text = await response.text();
  expect(JSON.parse(text)).toMatchObject({
    diagnostic: {
      stage: 'delivery',
      command: 'DATA',
      responseCode: 554,
      delivery: 'not-accepted',
    },
  });
  expect(writes.join('')).toContain('SMTP test send failed');
  for (const secret of [input.password, resetUrl])
    expect(text + writes.join('')).not.toContain(secret);
});

it.each(['timeout', 'close', 'reset'] as const)(
  'DATA %s keeps delivery unknown and never resends automatically',
  async (failure) => {
    const fixture = await openSmtpFixture(
      certificates,
      { secure: true, disabledCommands: ['AUTH'] },
      failure === 'timeout'
        ? { delayMs: 700 }
        : { disconnectAfterData: failure },
    );
    fixtures.push(fixture);
    trustFixture(failure === 'timeout' ? { socketTimeout: 350 } : {});
    save({ ...input, username: '', password: undefined, port: fixture.port });
    const response = await POST(request('POST'));
    expect(response.status).toBe(failure === 'timeout' ? 504 : 502);
    expect(await response.json()).toMatchObject({
      diagnostic: { delivery: 'unknown' },
    });
    expect(fixture.received).toHaveLength(1);
  },
);

it('greeting timeout confirms the message was not accepted', async () => {
  const fixture = await openSmtpFixture(certificates, {
    secure: true,
    onConnect() {},
  });
  fixtures.push(fixture);
  trustFixture({ greetingTimeout: 150 });
  save({ ...input, port: fixture.port });
  const response = await POST(request('POST'));
  expect(response.status).toBe(504);
  expect(await response.json()).toMatchObject({
    diagnostic: {
      stage: 'connection',
      code: 'ETIMEDOUT',
      delivery: 'not-accepted',
    },
  });
  expect(fixture.received).toHaveLength(0);
});

it('wrong-key prestart and malformed-ciphertext Web startup fail while preserving the saved password', async () => {
  save();
  const original = connection.db.select().from(smtpSettings).get()!;
  const run = (key: string) =>
    spawnSync(process.execPath, [resolve('src/cli/prestart.ts')], {
      env: {
        ...process.env,
        ...env,
        ARISO_ENCRYPTION_KEY: key,
        NODE_OPTIONS: '',
      },
      encoding: 'utf8',
      timeout: 15000,
    });
  const failed = run(randomBytes(32).toString('hex'));
  expect(failed.status).toBe(1);
  expect(failed.stdout + failed.stderr).toContain('identity/smtp/password');
  for (const secret of [
    input.password,
    original.passwordEncrypted!,
    env.ARISO_ENCRYPTION_KEY,
  ])
    expect(failed.stdout + failed.stderr).not.toContain(secret);
  expect(connection.db.select().from(smtpSettings).get()).toEqual(original);
  expect(run(env.ARISO_ENCRYPTION_KEY).status).toBe(0);
  await runtime!.stop();
  runtime = undefined;
  delete state.arisoServerRuntime;
  connection.db
    .update(smtpSettings)
    .set({ passwordEncrypted: 'malformed-ciphertext' })
    .run();
  expect(() => startServer()).toThrow('identity/smtp/password: 密文格式无效');
  expect(state.arisoServerRuntime).toBeUndefined();
  expect(
    connection.db.select().from(smtpSettings).get()!.passwordEncrypted,
  ).toBe('malformed-ciphertext');
  connection.db
    .update(smtpSettings)
    .set({ passwordEncrypted: original.passwordEncrypted })
    .run();
  runtime = startServer();
});
