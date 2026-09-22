import { expect, it } from 'vitest';
import { loginDestination } from '../../../src/components/identity/return-to';

it.each([
  undefined,
  ['/admin'],
  'https://evil.test/admin',
  '//evil.test/admin',
  '/\\evil.test/admin',
  '/login',
  '/api/auth/sign-out',
  '/admin/unknown',
  'javascript:alert(1)',
  '/\n/[',
  '/\t/:',
  '/\r/[invalid',
])('uses the delivered default for invalid return destination %s', (value) => {
  expect(loginDestination(value)).toBe('/admin');
});
it('preserves the query and fragment of the delivered protected page', () => {
  expect(loginDestination('/admin?view=account#main-content')).toBe(
    '/admin?view=account#main-content',
  );
});
