import { expect, it } from 'vitest';
import { hasSecureAttribute } from '../../integration/identity/cookie-attributes.ts';

it.each([
  '__Secure-session=token; Path=/; HttpOnly; SameSite=Lax',
  '__Secure-session=; Max-Age=0; Path=/',
  'session=containsSecure; Path=/',
  'session=token; SecureFlag=true',
])('does not mistake a name or value for a Secure attribute: %s', (cookie) => {
  expect(hasSecureAttribute(cookie)).toBe(false);
});

it.each([
  '__Secure-session=token; Path=/; Secure; HttpOnly',
  '__Secure-session=; Max-Age=0; Secure',
  'session=token; secure; Path=/',
])('recognizes the actual case-insensitive Secure attribute: %s', (cookie) => {
  expect(hasSecureAttribute(cookie)).toBe(true);
});
