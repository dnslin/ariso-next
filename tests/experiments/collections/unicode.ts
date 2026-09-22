import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { caseFold } from 'unicode-case-folding';

// Experiment only: production validation belongs to T-COL-01.
export function normalizeName(input: string, limit = 50) {
  assert(
    !/[\p{Cc}\u2028\u2029]/u.test(input),
    'Name contains a control or newline',
  );
  const displayName = input.trim().normalize('NFC');
  const length = [...displayName].length;
  assert(
    length >= 1 && length <= limit,
    `Name must contain 1–${limit} code points`,
  );
  return displayName;
}

export function tagName(input: string) {
  const displayName = normalizeName(input);
  return { displayName, normalizedKey: caseFold(displayName).normalize('NFC') };
}

// Explicit expected values, independent of the implementation under test.
export const samples = [
  [' Go ', 'Go', 'go'],
  ['go', 'go', 'go'],
  ['GO', 'GO', 'go'],
  ['Straße', 'Straße', 'strasse'],
  ['STRASSE', 'STRASSE', 'strasse'],
  ['ẞ', 'ẞ', 'ss'],
  ['Σ', 'Σ', 'σ'],
  ['ς', 'ς', 'σ'],
  ['ΟΣ', 'ΟΣ', 'οσ'],
  ['I', 'I', 'i'],
  ['İ', 'İ', 'i\u0307'],
  ['ı', 'ı', 'ı'],
  ['Cafe\u0301', 'Café', 'café'],
  ['CAFÉ', 'CAFÉ', 'café'],
  ['Cafe', 'Cafe', 'cafe'],
  ['\u01F0', '\u01F0', '\u01F0'],
  ['\u0345\u0300', '\u0300\u0345', '\u0300ι'],
  ['ﬀ', 'ﬀ', 'ff'],
  ['ＦＯＯ', 'ＦＯＯ', 'ｆｏｏ'],
  ['FOO', 'FOO', 'foo'],
  ['①', '①', '①'],
  ['1', '1', '1'],
  ['a  b', 'a  b', 'a  b'],
  ['a b', 'a b', 'a b'],
  ['a\u00a0b', 'a\u00a0b', 'a\u00a0b'],
  ['\u3000旅行\u00a0', '旅行', '旅行'],
  ['𐐀', '𐐀', '𐐨'],
  ['ꭰ', 'ꭰ', 'Ꭰ'],
  ['📷', '📷', '📷'],
] as const;

export function verifyUnicode() {
  const data = readFileSync(
    new URL(
      '../../fixtures/collections/CaseFolding-17.0.0.txt',
      import.meta.url,
    ),
    'utf8',
  );
  assert(data.startsWith('# CaseFolding-17.0.0.txt'));
  const mappings = new Map<number, string>();
  for (const line of data.split('\n')) {
    const [source, status, target] = line
      .split('#')[0]
      .split(';')
      .map((s) => s.trim());
    if (status !== 'C' && status !== 'F') continue;
    mappings.set(
      parseInt(source, 16),
      String.fromCodePoint(...target.split(' ').map((s) => parseInt(s, 16))),
    );
  }
  assert(mappings.size > 1500);
  let scalarCount = 0;
  for (let code = 0; code <= 0x10ffff; code++) {
    if (code >= 0xd800 && code <= 0xdfff) continue;
    const input = String.fromCodePoint(code);
    assert.equal(
      caseFold(input),
      mappings.get(code) ?? input,
      `U+${code.toString(16)}`,
    );
    scalarCount++;
  }
  const rows = samples.map(([input, displayName, normalizedKey]) => {
    const actual = tagName(input);
    assert.deepEqual(
      actual,
      { displayName, normalizedKey },
      JSON.stringify(input),
    );
    return { input, ...actual };
  });
  return {
    unicodeVersion: '17.0.0',
    mappingCount: mappings.size,
    scalarCount,
    samples: rows,
  };
}
