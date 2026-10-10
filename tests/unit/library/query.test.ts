import { describe, expect, it } from 'vitest';
import { libraryDateRange } from '../../../src/server/library/query-dates.ts';
import {
  encodeLibraryCursor,
  libraryStatusSchema,
  parseLibraryQuery,
} from '../../../src/server/library/query-schema.ts';
const parse = (value = '') => parseLibraryQuery(new URLSearchParams(value));

it('normalizes equivalent queries before binding cursors', () => {
  const original = parse(
    'tagId=b&tagId=a&tagId=b&q=%20Photo%20&uploadedFrom=2026-01-01T08:00:00%2B08:00',
  );
  const cursor = encodeLibraryCursor(original.filters, 10, 'id');
  const same = new URLSearchParams(
    'q=Photo&tagId=a&tagId=b&uploadedFrom=2026-01-01T00:00:00Z',
  );
  same.set('cursor', cursor);
  expect(parseLibraryQuery(same).cursor?.id).toBe('id');
  for (const [key, value] of [
    ['q', 'Other'],
    ['sort', 'size_desc'],
    ['pageSize', '80'],
    ['failure', 'reprocess'],
    ['scope', 'album'],
    ['albumId', 'different'],
  ]) {
    const changed = new URLSearchParams(same);
    changed.set(key, value);
    expect(() => parseLibraryQuery(changed)).toThrow();
  }
});

it.each([
  'q=%00not-present',
  '__proto__=ignored',
  'page=0',
  'page=1.5',
  'page=9007199254740991',
  'page=1&cursor=abc',
  'pageSize=81',
  'pageSize=0',
  'pageSize=20&pageSize=40',
  'q=a&q=b',
  'tagId=',
  'format=unknown',
  'sort=oops',
  'scope=album',
  'scope=album&albumId=a&sort=uploaded_desc',
  'deletionStatus=none',
  'failure=historical',
  'failure=initial&failure=reprocess',
  'scope=trash&failure=initial',
  'scope=trash&failure=reprocess',
  'scope=trash&tagId=a',
  'scope=trash&visibility=private',
  'scope=trash&uploadedFrom=2026-01-01T00:00:00Z',
  'unknown=a',
  'cursor=',
  'cursor=abc',
  'uploadedFrom=2026-02-30T00:00:00Z',
  'uploadedFrom=2026-01-01',
  'uploadedFrom=2026-01-02T00:00:00Z&uploadedBefore=2026-01-02T00:00:00Z',
])('rejects invalid query %s', (query) => expect(() => parse(query)).toThrow());

it('limits raw status requests to 80 and deduplicates valid IDs', () => {
  expect(libraryStatusSchema.parse({ ids: ['a', 'a', 'b'] })).toEqual({
    ids: ['a', 'b'],
  });
  for (const value of [
    { ids: [] },
    { ids: [''] },
    { ids: Array(81).fill('a') },
    { ids: ['a'], allMatching: true },
  ])
    expect(libraryStatusSchema.safeParse(value).success).toBe(false);
});

describe('site calendar boundaries', () => {
  it.each([
    ['2026-03-08', '2026-03-08T05:00:00.000Z', '2026-03-09T04:00:00.000Z', 23],
    ['2026-11-01', '2026-11-01T04:00:00.000Z', '2026-11-02T05:00:00.000Z', 25],
  ])('uses calendar days across DST %s', (date, start, end, hours) => {
    const range = libraryDateRange(
      date as string,
      date as string,
      'America/New_York',
    );
    expect(range).toEqual({ uploadedFrom: start, uploadedBefore: end });
    expect(
      Date.parse(range.uploadedBefore!) - Date.parse(range.uploadedFrom!),
    ).toBe(Number(hours) * 3600000);
  });
  it('handles one-sided ranges and rejects invalid dates, ranges and zones', () => {
    expect(libraryDateRange(undefined, '2026-09-03', 'Asia/Shanghai')).toEqual({
      uploadedFrom: undefined,
      uploadedBefore: '2026-09-03T16:00:00.000Z',
    });
    expect(
      libraryDateRange('2026-09-01', undefined, 'Asia/Shanghai').uploadedFrom,
    ).toBe('2026-08-31T16:00:00.000Z');
    expect(() => libraryDateRange('2026-02-30', undefined, 'UTC')).toThrow();
    expect(() => libraryDateRange('2026-09-02', '2026-09-01', 'UTC')).toThrow();
    expect(() =>
      libraryDateRange('2026-09-01', undefined, 'invalid'),
    ).toThrow();
  });
});

it.each(['initial', 'reprocess'] as const)(
  'accepts current %s failure queries in normal and album scopes',
  (failure) => {
    expect(parse(`failure=${failure}`).filters.failure).toBe(failure);
    expect(
      parse(`scope=album&albumId=album&failure=${failure}`).filters.failure,
    ).toBe(failure);
  },
);
