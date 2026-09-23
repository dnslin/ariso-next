import { describe, expect, it } from 'vitest';
import {
  albumInputSchema,
  tagNameSchema,
  tagNamesSchema,
} from '../../../src/server/collections/validation.ts';

describe('collections name validation', () => {
  it.each([
    [' Go ', 'Go', 'go'],
    ['Straße', 'Straße', 'strasse'],
    ['STRASSE', 'STRASSE', 'strasse'],
    ['Σ', 'Σ', 'σ'],
    ['ς', 'ς', 'σ'],
    ['I', 'I', 'i'],
    ['İ', 'İ', 'i\u0307'],
    ['ı', 'ı', 'ı'],
    ['Cafe\u0301', 'Café', 'café'],
    ['\u0345\u0300', '\u0300\u0345', '\u0300ι'],
    ['ＦＯＯ', 'ＦＯＯ', 'ｆｏｏ'],
    ['FOO', 'FOO', 'foo'],
    ['①', '①', '①'],
    ['a  b', 'a  b', 'a  b'],
    ['a\u00a0b', 'a\u00a0b', 'a\u00a0b'],
    ['𐐀', '𐐀', '𐐨'],
  ])(
    'normalizes %j without compatibility folding or changing inner whitespace',
    (input, displayName, normalizedKey) => {
      expect(tagNameSchema.parse(input)).toEqual({
        displayName,
        normalizedKey,
      });
    },
  );

  it('counts NFC code points before folding rather than UTF-16 units', () => {
    expect(tagNameSchema.parse('📷'.repeat(50)).displayName).toBe(
      '📷'.repeat(50),
    );
    expect(tagNameSchema.parse('e\u0301'.repeat(50)).displayName).toBe(
      'é'.repeat(50),
    );
    expect(tagNameSchema.parse('ß'.repeat(50)).normalizedKey).toHaveLength(100);
    expect(tagNameSchema.safeParse('📷'.repeat(51)).success).toBe(false);
    expect(albumInputSchema.parse({ name: '📷'.repeat(100) }).name).toBe(
      '📷'.repeat(100),
    );
    expect(albumInputSchema.safeParse({ name: '📷'.repeat(101) }).success).toBe(
      false,
    );
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
  ])('rejects blank, newline or control names before trimming: %j', (input) => {
    expect(tagNameSchema.safeParse(input).success).toBe(false);
    expect(albumInputSchema.safeParse({ name: input }).success).toBe(false);
  });

  it('normalizes descriptions, allows newlines and defaults to empty plain text', () => {
    expect(albumInputSchema.parse({ name: ' 相册 ' })).toEqual({
      name: '相册',
      description: '',
    });
    expect(
      albumInputSchema.parse({
        name: '相册',
        description: '  Cafe\u0301\n<script>  ',
      }).description,
    ).toBe('Café\n<script>');
    expect(
      albumInputSchema.parse({ name: '相册', description: ' \n ' }).description,
    ).toBe('');
    expect(
      albumInputSchema.parse({ name: '相册', description: '📷'.repeat(2000) })
        .description,
    ).toBe('📷'.repeat(2000));
    expect(
      albumInputSchema.safeParse({
        name: '相册',
        description: '📷'.repeat(2001),
      }).success,
    ).toBe(false);
  });

  it('rejects invalid types and validates every tag before a caller writes records', () => {
    expect(albumInputSchema.safeParse({ name: null }).success).toBe(false);
    expect(tagNamesSchema.safeParse(['Go', 12]).success).toBe(false);
    expect(tagNamesSchema.safeParse(['Go', '\t']).success).toBe(false);
    expect(tagNamesSchema.parse([])).toEqual([]);
  });
});
