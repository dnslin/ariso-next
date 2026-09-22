import { expect, it } from 'vitest';
import {
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
