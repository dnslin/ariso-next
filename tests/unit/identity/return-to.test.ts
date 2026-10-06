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

it('returns to the delivered upload page after authentication', () => {
  expect(loginDestination('/upload')).toBe('/upload');
  expect(loginDestination('/upload/unknown')).toBe('/admin');
  expect(loginDestination('https://evil.test/upload')).toBe('/admin');
});

it('returns to delivered album list and details after authentication', () => {
  expect(loginDestination('/albums')).toBe('/albums');
  expect(loginDestination('/albums/album-1')).toBe('/albums/album-1');
  expect(loginDestination('/albums/album-1#main-content')).toBe(
    '/albums/album-1#main-content',
  );
  expect(loginDestination('/albums/album-1/unknown')).toBe('/admin');
  expect(loginDestination('https://evil.test/albums/album-1')).toBe('/admin');
});

it('returns to the implemented tags query after login', () => {
  expect(loginDestination('/tags?q=Go&page=2&pageSize=20')).toBe(
    '/tags?q=Go&page=2&pageSize=20',
  );
  expect(loginDestination('/tags/unknown')).toBe('/admin');
  expect(loginDestination('https://evil.test/tags')).toBe('/admin');
});

it('returns to account management after session expiry or explicit login verification', () => {
  expect(loginDestination('/settings/account')).toBe('/settings/account');
  expect(loginDestination('/settings/account#main-content')).toBe(
    '/settings/account#main-content',
  );
  expect(loginDestination('/settings/account/unimplemented')).toBe('/admin');
  expect(loginDestination('/settings/github')).toBe('/admin');
  expect(loginDestination('https://evil.test/settings/account')).toBe('/admin');
});

it('retains delivered sharing routes and album return context', () => {
  expect(loginDestination('/shares')).toBe('/shares');
  expect(loginDestination('/shares/album-1?from=album')).toBe(
    '/shares/album-1?from=album',
  );
  expect(loginDestination('/shares/album-1/unimplemented')).toBe('/admin');
  expect(loginDestination('https://evil.test/shares')).toBe('/admin');
});

it('returns to upload Token management after session expiry', () => {
  expect(loginDestination('/settings/api')).toBe('/settings/api');
  expect(loginDestination('/settings/api#main-content')).toBe(
    '/settings/api#main-content',
  );
  expect(loginDestination('/settings/api/unimplemented')).toBe('/admin');
  expect(loginDestination('https://evil.test/settings/api')).toBe('/admin');
});
