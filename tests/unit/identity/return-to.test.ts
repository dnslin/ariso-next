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
  '/library/unknown',
  'https://evil.test/library',
  'javascript:alert(1)',
  '/\n/[',
  '/\t/:',
  '/\r/[invalid',
])('uses the delivered default for invalid return destination %s', (value) => {
  expect(loginDestination(value)).toBe('/admin');
});
it('returns to the delivered library after authentication', () => {
  expect(loginDestination('/library')).toBe('/library');
  expect(loginDestination('/library?image=photo-1')).toBe(
    '/library?image=photo-1',
  );
  expect(loginDestination('/library#main-content')).toBe(
    '/library#main-content',
  );
});
it('preserves the query and fragment of the delivered protected page', () => {
  expect(loginDestination('/admin?view=account#main-content')).toBe(
    '/admin?view=account#main-content',
  );
});
it('returns to the delivered trash record after authentication', () => {
  expect(loginDestination('/trash')).toBe('/trash');
  expect(loginDestination('/trash?image=photo-1')).toBe('/trash?image=photo-1');
  expect(loginDestination('/trash/unknown')).toBe('/admin');
  expect(loginDestination('https://evil.test/trash')).toBe('/admin');
});
