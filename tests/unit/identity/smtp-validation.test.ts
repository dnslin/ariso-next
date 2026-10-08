import { expect, it } from 'vitest';
import { readAccountInput } from '../../../src/server/identity/account.ts';
import {
  smtpSettingsInputSchema,
  smtpTestInputSchema,
} from '../../../src/server/identity/validation.ts';
import { smtpFailureDiagnostic } from '../../../src/server/identity/mail.ts';

it('SMTP settings accept internal hosts, explicit relay clearing and secret omission without accepting placeholders or arbitrary recipient input', () => {
  expect(
    smtpSettingsInputSchema.parse({
      host: ' smtp.internal ',
      fromEmail: ' Owner@Example.test ',
    }),
  ).toEqual({ host: 'smtp.internal', fromEmail: 'owner@example.test' });
  expect(smtpSettingsInputSchema.parse({ host: '::1' }).host).toBe('::1');
  expect(smtpSettingsInputSchema.parse({ clearCredentials: true })).toEqual({
    clearCredentials: true,
  });
  expect(
    smtpSettingsInputSchema.parse({ password: ' new secret ' }).password,
  ).toBe(' new secret ');
  for (const input of [
    { host: '' },
    { host: 'smtp://example.com' },
    { host: 'example.com:465' },
    { port: 0 },
    { port: 65536 },
    { port: 1.5 },
    { mode: 'plain' },
    { password: null },
    { password: '' },
    { password: '••••••' },
    { password: '已设置' },
    { clearCredentials: true, password: 'new' },
    { clearCredentials: true, username: '' },
    { recipient: 'someone@example.test' },
  ])
    expect(smtpSettingsInputSchema.safeParse(input).success).toBe(false);
  expect(
    smtpTestInputSchema.safeParse({ to: 'someone@example.test' }).success,
  ).toBe(false);
});

it('SMTP diagnostics expose only known codes, command verbs and numeric response codes', () => {
  const secret = 'never-show-this-secret';
  const diagnostic = smtpFailureDiagnostic({
    code: secret,
    command: `AUTH ${secret}`,
    responseCode: 535,
    message: secret,
    response: secret,
  });
  expect(diagnostic).toMatchObject({
    code: 'UNKNOWN',
    command: 'AUTH',
    responseCode: 535,
  });
  expect(JSON.stringify(diagnostic)).not.toContain(secret);
  expect(
    smtpFailureDiagnostic({
      code: 'EAUTH',
      command: secret,
      responseCode: secret,
    }),
  ).toEqual({
    stage: 'authentication',
    code: 'EAUTH',
    command: undefined,
    responseCode: undefined,
    delivery: 'not-accepted',
  });
});

it('SMTP input labels preserve the existing account input errors and field details', async () => {
  const invalid = () =>
    new Request('http://localhost/test', {
      method: 'PATCH',
      body: JSON.stringify({ host: '' }),
    });
  await expect(
    readAccountInput(invalid(), smtpSettingsInputSchema),
  ).rejects.toMatchObject({
    message: '请检查账号信息',
    fields: [{ field: 'host', message: '请输入 SMTP 主机' }],
  });
  await expect(
    readAccountInput(invalid(), smtpSettingsInputSchema, '邮件设置'),
  ).rejects.toMatchObject({
    message: '请检查邮件设置',
    fields: [{ field: 'host', message: '请输入 SMTP 主机' }],
  });
  await expect(
    readAccountInput(
      new Request('http://localhost/test', { method: 'POST', body: '{' }),
      smtpSettingsInputSchema,
      '邮件设置',
    ),
  ).rejects.toMatchObject({ message: '请提交 JSON 邮件设置' });
});
