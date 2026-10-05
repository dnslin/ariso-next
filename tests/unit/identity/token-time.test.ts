import { CalendarDateTime } from '@internationalized/date';
import { expect, it } from 'vitest';
import {
  tokenExpiresIn,
  tokenExpired,
  formatTokenTime,
} from '../../../src/components/identity/token-time';

const current = Date.parse('2026-10-06T00:00:00.000Z');
it('interprets date and time in the site zone rather than the browser zone', () => {
  expect(
    tokenExpiresIn(
      new CalendarDateTime(2026, 10, 6, 8, 0, 1),
      'Asia/Shanghai',
      current,
    ),
  ).toBe(1);
  expect(
    tokenExpiresIn(
      new CalendarDateTime(2026, 10, 5, 20, 0, 1),
      'America/New_York',
      current,
    ),
  ).toBe(1);
});
it('permits short lifetimes and expiration beyond one year', () => {
  expect(
    tokenExpiresIn(
      new CalendarDateTime(2026, 10, 6, 8, 0, 10),
      'Asia/Shanghai',
      current,
    ),
  ).toBe(10);
  expect(
    tokenExpiresIn(
      new CalendarDateTime(2028, 10, 6, 8),
      'Asia/Shanghai',
      current,
    ),
  ).toBeGreaterThan(365 * 86400);
});
it.each([
  null,
  new CalendarDateTime(2026, 10, 6, 8),
  new CalendarDateTime(2026, 10, 6, 7, 59, 59),
])('rejects absent and nonfuture times: %s', (value) => {
  expect(() => tokenExpiresIn(value, 'Asia/Shanghai', current)).toThrow();
});
it('rejects a nonfinite conversion rather than treating it as unlimited', () => {
  expect(() =>
    tokenExpiresIn(
      new CalendarDateTime(2026, 10, 6, 8, 0, 1),
      'Asia/Shanghai',
      Number.NaN,
    ),
  ).toThrow();
});
it('treats the exact expiration boundary as expired', () => {
  const expiresAt = '2026-10-06T00:00:00.000Z';
  expect(tokenExpired(expiresAt, current - 1)).toBe(false);
  expect(tokenExpired(expiresAt, current)).toBe(true);
  expect(tokenExpired(expiresAt, current + 1)).toBe(true);
  expect(tokenExpired(null, current)).toBe(false);
});
it('formats stored UTC dates using the current site zone', () => {
  expect(
    formatTokenTime('2026-10-06T00:00:01.000Z', 'Asia/Shanghai'),
  ).toContain('08:00:01');
  expect(
    formatTokenTime('2026-10-06T00:00:01.000Z', 'America/New_York'),
  ).toContain('20:00:01');
});
