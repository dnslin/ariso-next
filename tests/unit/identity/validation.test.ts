import { expect, it } from 'vitest';
import {
  accountEmailInputSchema,
  accountPasswordInputSchema,
  setupAccountSchema,
  setupInputSchema,
} from '../../../src/server/identity/validation';

const account = {
  code: 'startup-code',
  email: ' OWNER@EXAMPLE.COM ',
  password: ' password ',
  confirmPassword: ' password ',
};

it('normalizes email while preserving password whitespace and requires matching confirmation', () => {
  expect(setupAccountSchema.parse(account)).toMatchObject({
    email: 'owner@example.com',
    password: ' password ',
  });
  expect(
    setupAccountSchema.safeParse({ ...account, confirmPassword: 'password' })
      .success,
  ).toBe(false);
});

it('requires complete setup and excludes confirmation from the submitted contract', () => {
  const input = {
    ...account,
    publicUrl: 'https://photos.example.com/',
    timeZone: 'UTC',
  };
  expect(setupInputSchema.parse(input)).toEqual({
    code: account.code,
    email: 'owner@example.com',
    password: account.password,
    publicUrl: 'https://photos.example.com',
    timeZone: 'UTC',
  });
  for (const field of ['code', 'email', 'password', 'publicUrl', 'timeZone']) {
    expect(setupInputSchema.safeParse({ ...input, [field]: '' }).success).toBe(
      false,
    );
  }
});

it.each([
  'https://example.com/path',
  'https://owner:secret@example.com',
  'https://example.com/?',
  'https://example.com/#',
])('rejects non-root site URL %s', (publicUrl) => {
  expect(
    setupInputSchema.safeParse({ ...account, publicUrl, timeZone: 'UTC' })
      .success,
  ).toBe(false);
});

it.each(['', '+08:00', 'Unknown/Zone'])(
  'does not silently replace invalid time zone %s',
  (timeZone) => {
    expect(
      setupInputSchema.safeParse({
        ...account,
        publicUrl: 'http://localhost:3000',
        timeZone,
      }).success,
    ).toBe(false);
  },
);

it('email changes normalize the email and preserve the current password', () => {
  expect(
    accountEmailInputSchema.parse({
      email: ' NEW@EXAMPLE.COM ',
      currentPassword: ' current password ',
      userId: 'ignored-user',
    }),
  ).toEqual({
    email: 'new@example.com',
    currentPassword: ' current password ',
  });
  for (const input of [
    { email: 'invalid', currentPassword: 'password' },
    { email: 'new@example.com', currentPassword: '' },
  ])
    expect(accountEmailInputSchema.safeParse(input).success).toBe(false);
});

it('password changes enforce the server confirmation and fixed length without trimming', () => {
  const input = {
    currentPassword: ' current password ',
    newPassword: ' new password ',
    confirmPassword: ' new password ',
    revokeOtherSessions: false,
  };
  expect(accountPasswordInputSchema.parse(input)).toEqual({
    currentPassword: input.currentPassword,
    newPassword: input.newPassword,
    confirmPassword: input.confirmPassword,
  });
  for (const length of [7, 129]) {
    const password = 'a'.repeat(length);
    const result = accountPasswordInputSchema.safeParse({
      ...input,
      newPassword: password,
      confirmPassword: password,
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0].path).toEqual(['newPassword']);
  }
  for (const length of [8, 128]) {
    const password = 'a'.repeat(length);
    expect(
      accountPasswordInputSchema.safeParse({
        ...input,
        newPassword: password,
        confirmPassword: password,
      }).success,
    ).toBe(true);
  }
  const mismatch = accountPasswordInputSchema.safeParse({
    ...input,
    confirmPassword: 'new password',
  });
  expect(mismatch.success).toBe(false);
  if (!mismatch.success)
    expect(mismatch.error.issues[0].path).toEqual(['confirmPassword']);
});
