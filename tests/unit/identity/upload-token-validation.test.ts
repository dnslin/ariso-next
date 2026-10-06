import { afterEach, expect, it, vi } from 'vitest';
import {
  uploadTokenCreateInputSchema,
  uploadTokenUpdateInputSchema,
} from '../../../src/server/identity/validation.ts';

afterEach(() => vi.useRealTimers());

it('requires a trimmed name and supports no expiry, short expiry and more than a year', () => {
  expect(uploadTokenCreateInputSchema.parse({ name: ' CLI ' })).toEqual({
    name: 'CLI',
  });
  for (const expiresIn of [1, 60, 400 * 86400])
    expect(
      uploadTokenCreateInputSchema.parse({ name: 'CLI', expiresIn }),
    ).toEqual({ name: 'CLI', expiresIn });
});

it('rejects missing names, unsupported properties and invalid expiry before persistence', () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime('2026-10-06T00:00:00.000Z');
  for (const input of [
    {},
    { name: '' },
    { name: '  ' },
    { name: 'x'.repeat(33) },
    { name: 'CLI', userId: 'other' },
    { name: 'CLI', permissions: { upload: ['delete'] } },
    { name: 'CLI', disableKeyHashing: true },
    { name: 'CLI', prefix: 'plaintext' },
    { name: 'CLI', rateLimitEnabled: true },
    ...[0, -1, 0.5, 1e20, Number.MAX_VALUE, Infinity, NaN, null, '60'].map(
      (expiresIn) => ({ name: 'CLI', expiresIn }),
    ),
  ])
    expect(uploadTokenCreateInputSchema.safeParse(input).success).toBe(false);
});

it('only enables or disables an existing token without allowing permission or expiry changes', () => {
  for (const enabled of [false, true])
    expect(uploadTokenUpdateInputSchema.parse({ enabled })).toEqual({
      enabled,
    });
  for (const input of [
    {},
    { enabled: 'false' },
    { enabled: false, permissions: {} },
    { enabled: true, expiresIn: 3600 },
    { enabled: true, userId: 'other' },
  ])
    expect(uploadTokenUpdateInputSchema.safeParse(input).success).toBe(false);
});
