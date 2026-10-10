import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execa } from 'execa';
import { expect, it } from 'vitest';
import type { SmtpConfig } from '../../../src/server/identity/mail.ts';
import { startSmtpBrowserFixture } from '../../../e2e/smtp-fixture.mjs';
import { startPasswordResetBrowserFixture } from '../../../e2e/password-reset-fixture.mjs';

it('a fresh production mail process trusts both browser fixtures and still rejects the wrong SMTP password', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ariso-browser-smtp-ca-'));
  let smtp: Awaited<ReturnType<typeof startSmtpBrowserFixture>> | undefined;
  let reset:
    Awaited<ReturnType<typeof startPasswordResetBrowserFixture>> | undefined;
  try {
    smtp = await startSmtpBrowserFixture(directory);
    reset = await startPasswordResetBrowserFixture(directory);
    const smtpTarget = Reflect.get(smtp.browserInput.targets, 'tls') as Pick<
      SmtpConfig,
      'host' | 'port' | 'mode'
    >;
    const resetTarget = Reflect.get(
      reset.browserInput.targets,
      'accepted',
    ) as Pick<SmtpConfig, 'host' | 'port' | 'mode'>;
    const caPath = join(directory, 'combined-ca.pem');
    await writeFile(
      caPath,
      (
        await Promise.all([
          readFile(smtp.caPath, 'utf8'),
          readFile(reset.caPath, 'utf8'),
        ])
      ).join('\n'),
    );
    // Node reads extra CAs at startup. Credentials travel only through stdin.
    const { stdout, stderr } = await execa(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { sendSmtpMail } from './src/server/identity/mail.ts';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const results = [];
for (const entry of JSON.parse(input)) {
  try {
    await sendSmtpMail(entry.config, {
      to: 'recipient@example.test',
      subject: 'Independent browser TLS fixture check',
      text: 'https://example.test/api/auth/reset-password/fixture-check',
    });
    results.push({ name: entry.name, accepted: true });
  } catch (error) {
    results.push({ name: entry.name, accepted: false, diagnostic: error.diagnostic });
  }
}
process.stdout.write(JSON.stringify(results));`,
      ],
      {
        env: { NODE_EXTRA_CA_CERTS: caPath },
        timeout: 10_000,
        input: JSON.stringify([
          {
            name: 'smtp',
            config: {
              ...smtpTarget,
              username: smtp.browserInput.username,
              password: smtp.browserInput.password,
              fromName: 'SMTP fixture',
              fromEmail: 'sender@example.test',
            },
          },
          {
            name: 'password-reset',
            config: {
              ...resetTarget,
              username: '',
              password: null,
              fromName: 'Recovery fixture',
              fromEmail: 'sender@example.test',
            },
          },
          {
            name: 'smtp-wrong-password',
            config: {
              ...smtpTarget,
              username: smtp.browserInput.username,
              password: 'incorrect-isolated-fixture-password',
              fromName: 'SMTP fixture',
              fromEmail: 'sender@example.test',
            },
          },
        ]),
      },
    );
    expect(stderr).toBe('');
    expect(JSON.parse(stdout)).toEqual([
      { name: 'smtp', accepted: true },
      { name: 'password-reset', accepted: true },
      {
        name: 'smtp-wrong-password',
        accepted: false,
        diagnostic: {
          stage: 'authentication',
          code: 'EAUTH',
          command: 'AUTH',
          responseCode: 535,
          delivery: 'not-accepted',
        },
      },
    ]);
    const smtpState = await fetch(`${smtp.browserInput.control}/state`).then(
      (response) => response.json(),
    );
    expect(smtpState.tls.received).toHaveLength(1);
    expect(smtpState.tls.received[0].secure).toBe(true);
    const resetState = await fetch(
      `${reset.browserInput.control}/messages`,
    ).then((response) => response.json());
    expect(resetState.accepted).toHaveLength(1);
    expect(resetState.accepted[0].secure).toBe(true);
  } finally {
    try {
      await Promise.all([smtp?.close(), reset?.close()]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}, 15_000);
