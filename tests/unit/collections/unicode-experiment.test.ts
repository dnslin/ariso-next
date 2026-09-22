import { describe, expect, it } from 'vitest';
import {
  normalizeName,
  tagName,
  verifyUnicode,
} from '../../experiments/collections/unicode.ts';

describe('EV-COLLECTIONS-01 Unicode experiment', () => {
  it('matches the complete pinned default full-fold data and explicit name samples', () => {
    expect(verifyUnicode().scalarCount).toBe(1_112_064);
  });
  it('counts NFC display-name code points before folding, not UTF-16 units or folded length', () => {
    expect(tagName('📷'.repeat(50)).displayName).toBe('📷'.repeat(50));
    expect(tagName('e\u0301'.repeat(50)).displayName).toBe('é'.repeat(50));
    expect(tagName('ß'.repeat(50)).normalizedKey).toHaveLength(100);
    expect(() => tagName('📷'.repeat(51))).toThrow();
    expect(normalizeName('📷'.repeat(100), 100)).toBe('📷'.repeat(100));
    expect(() => normalizeName('📷'.repeat(101), 100)).toThrow();
  });
  it.each([
    '',
    ' \u3000 ',
    'Go\n',
    '\tGo',
    'a\rb',
    'a\0b',
    'a\u007fb',
    'a\u0085b',
    'a\u2028b',
    'a\u2029b',
  ])('rejects blank, control and newline input %j', (input) => {
    expect(() => tagName(input)).toThrow();
  });
});
