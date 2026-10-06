import { execFile, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify, format } from 'node:util';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { openFixture, seedOwner } from '../../experiments/identity/fixture.ts';
import {
  createResetFixtureAuth,
  resetFixtureRequest,
} from '../../experiments/identity/reset-fixture.ts';
import {
  createSmtpCertificates,
  openSmtpFixture,
} from '../../experiments/identity/smtp-fixture.ts';
import { loadRealSmtpSettings } from '../../experiments/identity/smtp-run.ts';
import {
  createSmtpTransport,
  sendSmtpMail,
  smtpFailureDiagnostic,
  smtpTimeouts,
  type SmtpConfig,
} from '../../experiments/identity/smtp.ts';

let certificates: ReturnType<typeof createSmtpCertificates>;
const fixtures: Awaited<ReturnType<typeof openSmtpFixture>>[] = [];
beforeAll(() => {
  certificates = createSmtpCertificates();
});
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.close()));
});
afterAll(() => certificates?.close());

const config: SmtpConfig = {
  host: '127.0.0.1',
  port: 465,
  mode: 'tls',
  fromName: 'Ariso SMTP experiment',
  fromEmail: 'sender@example.test',
};
const mail = {
  to: 'owner@example.test',
  subject: 'Ariso SMTP experiment',
  text: 'This is a protocol experiment, not an external receipt assertion.',
};

it.each(['tls', 'starttls'] as const)(
  '%s keeps certificate validation and bounded transport timeouts',
  (mode) => {
    const transport = createSmtpTransport({ ...config, mode });
    expect(transport.options).toMatchObject({
      ...smtpTimeouts,
      secure: mode === 'tls',
      requireTLS: mode === 'starttls',
      tls: { rejectUnauthorized: true },
      logger: false,
      debug: false,
    });
    transport.close();
  },
);

it.each([false, true])(
  'runs the real SMTP to Better Auth reset combination (delivery rejected: %s)',
  async (rejected) => {
    const directory = mkdtempSync(join(tmpdir(), 'ariso-smtp-reset-'));
    const connection = openFixture(join(directory, 'auth.db'));
    const smtpPassword = 'not-for-diagnostic-output';
    const rejection = Object.assign(new Error('Delivery rejected'), {
      responseCode: 554,
    });
    const fixture = await openSmtpFixture(
      certificates,
      { secure: true },
      rejected ? { error: rejection } : {},
    );
    fixtures.push(fixture);
    const diagnostics: string[] = [];
    const origin = 'http://localhost:3146';
    const oldPassword = 'smtp-reset-original-password';
    const newPassword = 'smtp-reset-new-password';
    let generatedUrl = '';
    try {
      await seedOwner(connection.db, mail.to, oldPassword);
      const auth = createResetFixtureAuth(
        connection.db,
        origin,
        randomBytes(32).toString('hex'),
        {
          logger: {
            log: (_level, message, ...args) =>
              diagnostics.push(format(message, ...args)),
          },
          onDeliveryError: (error) =>
            diagnostics.push(JSON.stringify(smtpFailureDiagnostic(error))),
          async sendResetPassword({ user, url }) {
            generatedUrl = url;
            rejection.message = `Rejected ${smtpPassword} ${url}`;
            await sendSmtpMail(
              { ...config, port: fixture.port },
              { to: user.email, subject: 'Ariso reset experiment', text: url },
              { ca: certificates.ca },
            );
          },
        },
      );
      const requested = await auth.handler(
        resetFixtureRequest(origin, 'request-password-reset', {
          email: mail.to,
          redirectTo: '/reset-password',
        }),
      );
      expect(fixture.received).toHaveLength(1);
      expect(fixture.received[0].secure).toBe(true);
      if (rejected) {
        expect(requested.status).toBe(502);
        expect(await requested.json()).toMatchObject({
          code: 'RESET_EMAIL_DELIVERY_FAILED',
        });
        expect(diagnostics.join('\n')).toContain('EMESSAGE');
        expect(diagnostics.join('\n')).not.toContain(smtpPassword);
        expect(diagnostics.join('\n')).not.toContain(generatedUrl);
        return;
      }
      expect(requested.status).toBe(200);
      // The fixture sends only this ASCII URL. Unwrap its quoted-printable transfer encoding.
      const body = fixture.received[0].raw
        .split('\r\n\r\n')
        .slice(1)
        .join('\r\n\r\n')
        .replace(/=\r\n/g, '')
        .replace(/=3D/g, '=');
      const capturedUrl = new URL(body.trim());
      expect(capturedUrl.href).toBe(generatedUrl);
      const callback = await auth.handler(new Request(capturedUrl));
      expect(callback.status).toBe(302);
      const redirect = new URL(callback.headers.get('location')!);
      expect(redirect.pathname).toBe('/reset-password');
      const token = redirect.searchParams.get('token');
      expect(token).toBeTruthy();
      const reset = (password: string) =>
        auth.handler(
          resetFixtureRequest(origin, 'reset-password', {
            token,
            newPassword: password,
          }),
        );
      expect((await reset(newPassword)).status).toBe(200);
      expect((await reset('replayed-password')).status).toBe(400);
      const login = (password: string) =>
        auth.handler(
          resetFixtureRequest(origin, 'sign-in/email', {
            email: mail.to,
            password,
          }),
        );
      expect((await login(oldPassword)).status).toBe(401);
      expect((await login(newPassword)).status).toBe(200);
      expect(diagnostics.join('\n')).not.toContain(generatedUrl);
    } finally {
      connection.close();
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

it('manual runner reads ignored local settings and leaves external receipt unverified', async () => {
  const fixture = await openSmtpFixture(certificates, { secure: true });
  fixtures.push(fixture);
  mkdirSync(resolve('.data'), { recursive: true });
  const directory = mkdtempSync(resolve('.data/smtp-runner-'));
  try {
    const path = join(directory, 'settings.json');
    const caFile = join(directory, 'ca.pem');
    writeFileSync(caFile, certificates.ca);
    writeFileSync(
      path,
      JSON.stringify({
        smtp: { ...config, port: fixture.port },
        ownerEmail: mail.to,
        caFile,
      }),
      { mode: 0o600 },
    );
    const result = await promisify(execFile)(process.execPath, [
      'tests/experiments/identity/smtp-run.ts',
      path,
    ]);
    expect(result.stderr).toBe('');
    const output = JSON.parse(result.stdout);
    expect(output).toMatchObject({
      acceptance: 'smtp-accepted',
      finalReceipt: 'unverified',
      accepted: [mail.to],
    });
    expect(fixture.received).toHaveLength(1);
    expect(fixture.received[0].raw).toContain(output.receiptMarker);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('manual runner accepts repository-external files and logs no secrets for invalid settings', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ariso-smtp-settings-'));
  const password = 'private-smtp-password';
  const resetUrl = 'https://private.example/reset-password?token=private-token';
  try {
    const path = join(directory, 'settings.json');
    writeFileSync(path, JSON.stringify({ smtp: config, ownerEmail: mail.to }), {
      mode: 0o600,
    });
    expect(loadRealSmtpSettings(path)).toEqual({
      smtp: config,
      ownerEmail: mail.to,
    });
    // A password without a username must not silently become a relay setting.
    writeFileSync(
      path,
      JSON.stringify({
        smtp: { ...config, password },
        ownerEmail: mail.to,
        resetUrl,
      }),
      { mode: 0o600 },
    );
    const result = spawnSync(
      process.execPath,
      ['tests/experiments/identity/smtp-run.ts', path],
      { encoding: 'utf8' },
    );
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stderr)).toEqual({
      stage: 'configuration',
      code: 'SMTP_CONFIG_INVALID',
      path,
    });
    expect(result.stdout + result.stderr).not.toContain(password);
    expect(result.stdout + result.stderr).not.toContain(resetUrl);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('manual runner identifies a missing settings file as configuration with its path and filesystem code', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ariso-smtp-missing-'));
  try {
    const path = join(directory, 'missing.json');
    const result = spawnSync(
      process.execPath,
      ['tests/experiments/identity/smtp-run.ts', path],
      { encoding: 'utf8' },
    );
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stderr)).toEqual({
      stage: 'configuration',
      code: 'ENOENT',
      path,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('authenticates over TLS and preserves a rejected authentication failure', async () => {
  const fixture = await openSmtpFixture(certificates, {
    secure: true,
    authOptional: false,
    onAuth(auth, _session, callback) {
      if (auth.username === 'owner' && auth.password === 'smtp-secret')
        callback(null, { user: 'owner' });
      else
        callback(
          Object.assign(new Error('Authentication rejected'), {
            responseCode: 535,
          }),
        );
    },
  });
  fixtures.push(fixture);
  const authenticated = {
    ...config,
    port: fixture.port,
    username: 'owner',
    password: 'smtp-secret',
  };
  expect(
    await sendSmtpMail(authenticated, mail, { ca: certificates.ca }),
  ).toMatchObject({ acceptance: 'smtp-accepted' });
  const failure = await sendSmtpMail(
    { ...authenticated, password: 'wrong-smtp-password' },
    mail,
    { ca: certificates.ca },
  ).catch((error: unknown) => error);
  expect(smtpFailureDiagnostic(failure)).toMatchObject({
    stage: 'authentication',
    code: 'EAUTH',
    responseCode: 535,
    delivery: 'not-accepted',
  });
  expect(fixture.received).toHaveLength(1);
});

it.each(['tls', 'starttls'] as const)(
  '%s rejects an untrusted certificate without sending DATA',
  async (mode) => {
    const fixture = await openSmtpFixture(certificates, {
      secure: mode === 'tls',
    });
    fixtures.push(fixture);
    const failure = await sendSmtpMail(
      { ...config, port: fixture.port, mode },
      mail,
    ).catch((error: unknown) => error);
    expect(smtpFailureDiagnostic(failure)).toMatchObject({
      stage: 'tls',
      delivery: 'not-accepted',
    });
    expect(failure).toBeInstanceOf(Error);
    expect(fixture.received).toHaveLength(0);
  },
);

it('requires STARTTLS even when the server does not offer it', async () => {
  const fixture = await openSmtpFixture(certificates, {
    disabledCommands: ['AUTH', 'STARTTLS'],
  });
  fixtures.push(fixture);
  const failure = await sendSmtpMail(
    { ...config, port: fixture.port, mode: 'starttls' },
    mail,
    { ca: certificates.ca },
  ).catch((error: unknown) => error);
  expect(smtpFailureDiagnostic(failure)).toMatchObject({
    stage: 'tls',
    code: 'ETLS',
    command: 'STARTTLS',
    delivery: 'not-accepted',
  });
  expect(fixture.received).toHaveLength(0);
});

it('reports a refused connection separately from delivery', async () => {
  const fixture = await openSmtpFixture(certificates, { secure: true });
  await fixture.close();
  const failure = await sendSmtpMail({ ...config, port: fixture.port }, mail, {
    ca: certificates.ca,
  }).catch((error: unknown) => error);
  expect(smtpFailureDiagnostic(failure)).toMatchObject({
    stage: 'connection',
    code: 'ESOCKET',
    delivery: 'not-accepted',
  });
  expect(failure).toMatchObject({
    message: expect.stringContaining('ECONNREFUSED'),
  });
});

it('sendMail detects a recipient refusal that verify cannot detect', async () => {
  const fixture = await openSmtpFixture(certificates, {
    secure: true,
    onRcptTo(_address, _session, callback) {
      callback(
        Object.assign(new Error('Recipient rejected'), { responseCode: 550 }),
      );
    },
  });
  fixtures.push(fixture);
  const recipientConfig = { ...config, port: fixture.port };
  const transport = createSmtpTransport(recipientConfig, {
    ca: certificates.ca,
  });
  try {
    expect(await transport.verify()).toBe(true);
  } finally {
    transport.close();
  }
  const failure = await sendSmtpMail(recipientConfig, mail, {
    ca: certificates.ca,
  }).catch((error: unknown) => error);
  expect(smtpFailureDiagnostic(failure)).toMatchObject({
    stage: 'delivery',
    code: 'EENVELOPE',
    command: 'RCPT',
    responseCode: 550,
    delivery: 'not-accepted',
  });
  expect(fixture.received).toHaveLength(0);
});

it('preserves DATA rejection but excludes response secrets from diagnostics', async () => {
  const password = 'must-not-log-smtp-password';
  const resetUrl = 'https://ariso.example/reset-password?token=must-not-log';
  const fixture = await openSmtpFixture(
    certificates,
    { secure: true },
    {
      error: Object.assign(new Error(`Rejected ${password} ${resetUrl}`), {
        responseCode: 554,
      }),
    },
  );
  fixtures.push(fixture);
  const failure = await sendSmtpMail(
    { ...config, port: fixture.port },
    { ...mail, text: resetUrl },
    { ca: certificates.ca },
  ).catch((error: unknown) => error);
  const diagnostic = smtpFailureDiagnostic(failure);
  expect(diagnostic).toMatchObject({
    stage: 'delivery',
    code: 'EMESSAGE',
    command: 'DATA',
    responseCode: 554,
    delivery: 'not-accepted',
  });
  expect(failure).toMatchObject({ message: expect.stringContaining(resetUrl) });
  expect(JSON.stringify(diagnostic)).not.toContain(password);
  expect(JSON.stringify(diagnostic)).not.toContain(resetUrl);
  expect(fixture.received).toHaveLength(1);
});

it('times out while waiting for the greeting before sending DATA', async () => {
  const fixture = await openSmtpFixture(certificates, {
    secure: true,
    onConnect() {
      /* Deliberately withhold the SMTP greeting. */
    },
  });
  fixtures.push(fixture);
  const failure = await sendSmtpMail({ ...config, port: fixture.port }, mail, {
    ca: certificates.ca,
    timeouts: { greetingTimeout: 150 },
  }).catch((error: unknown) => error);
  expect(smtpFailureDiagnostic(failure)).toMatchObject({
    stage: 'connection',
    code: 'ETIMEDOUT',
    delivery: 'not-accepted',
  });
  expect(failure).toMatchObject({ message: 'Greeting never received' });
  expect(fixture.received).toHaveLength(0);
});

it('marks delivery unknown when DATA was received but the final reply times out', async () => {
  const fixture = await openSmtpFixture(
    certificates,
    { secure: true },
    { delayMs: 700 },
  );
  fixtures.push(fixture);
  const failure = await sendSmtpMail({ ...config, port: fixture.port }, mail, {
    ca: certificates.ca,
    timeouts: { socketTimeout: 350 },
  }).catch((error: unknown) => error);
  expect(smtpFailureDiagnostic(failure)).toMatchObject({
    stage: 'delivery',
    code: 'ETIMEDOUT',
    delivery: 'unknown',
  });
  expect(fixture.received).toHaveLength(1);
  expect(fixture.received[0].raw).toContain(mail.text);
});

it.each(['tls', 'starttls'] as const)(
  '%s sends real encrypted DATA through a relay without authentication',
  async (mode) => {
    const fixture = await openSmtpFixture(certificates, {
      secure: mode === 'tls',
      disabledCommands: ['AUTH'],
    });
    fixtures.push(fixture);
    const result = await sendSmtpMail(
      { ...config, port: fixture.port, mode },
      mail,
      { ca: certificates.ca },
    );
    expect(result).toMatchObject({
      acceptance: 'smtp-accepted',
      finalReceipt: 'unverified',
      accepted: [mail.to],
      rejected: [],
    });
    expect(fixture.received).toHaveLength(1);
    expect(fixture.received[0]).toMatchObject({
      secure: true,
      from: config.fromEmail,
      recipients: [mail.to],
    });
    expect(fixture.received[0].raw).toContain(mail.text);
  },
);
