import { describe, expect, it, vi } from 'vitest';
import {
  libraryListKey,
  libraryRequestParams,
  parseLibraryLocation,
} from '../../../src/app/library/query-state';
import { parseLibraryQuery } from '../../../src/server/library/query-schema';
import {
  defaultLibraryPreferences,
  readLibraryPreferences,
} from '../../../src/app/library/library-preferences';

const parse = (value: string, albumId?: string) =>
  parseLibraryLocation(new URLSearchParams(value), albumId);

describe('applied library URL', () => {
  it('shares normalization with HTTP and keeps repeated tags as IDs', () => {
    const value = 'q=%20Photo%20&tagId=b&tagId=a&tagId=b&pageSize=20&page=3';
    expect(parse(value).filters).toEqual(
      parseLibraryQuery(new URLSearchParams(value)).filters,
    );
    expect(parse(value).filters.tagIds).toEqual(['a', 'b']);
    expect(parse(value).page).toBe(3);
  });
  it('preserves failure scope in requests, neighbors and query identity', () => {
    const initial = parse('failure=initial');
    const reprocess = parse('failure=reprocess');
    for (const current of [initial, reprocess]) {
      expect(
        parseLibraryQuery(libraryRequestParams(current.filters, {})).filters,
      ).toEqual(current.filters);
    }
    expect(libraryListKey(initial.filters, 'more', 1)).not.toEqual(
      libraryListKey(reprocess.filters, 'more', 1),
    );
  });
  it('keeps image identity out of the list key', () => {
    const first = parse('image=one&q=photo');
    const second = parse('image=two&q=photo');
    expect(libraryListKey(first.filters, 'more', 1)).toEqual(
      libraryListKey(second.filters, 'more', 8),
    );
    expect(libraryListKey(first.filters, 'pages', 1)).not.toEqual(
      libraryListKey(first.filters, 'pages', 2),
    );
  });
  it('keeps detail workspace and preview state out of the applied query and selection identity', () => {
    const query = 'q=photo&status=failed&tagId=tag&page=3';
    const list = parse(query);
    for (const detail of [
      'image=one&detailView=versions&preview=compressed',
      'image=one&detailView=reprocess&preview=original',
      'image=one&preview=thumbnail',
    ]) {
      const page = parse(`${query}&${detail}`);
      expect(page).toEqual(list);
      expect(libraryListKey(page.filters, 'pages', page.page)).toEqual(
        libraryListKey(list.filters, 'pages', list.page),
      );
      expect(parse(`${query}&${detail}`, 'album').filters).toEqual(
        parse(query, 'album').filters,
      );
    }
  });
  it.each([
    '__proto__=ignored',
    'page=1.5',
    'page=0',
    'pageSize=41',
    'sort=oops',
    'q=a&q=b',
    'tagId=',
    'unknown=value',
    'scope=trash',
    'scope=album',
    'cursor=abc',
    'uploadedFrom=2026-02-30T00:00:00Z',
  ])('does not silently default invalid URL %s', (value) => {
    expect(() => parse(value)).toThrow();
  });
  it('binds album queries to the path and preserves the fixed ordering', () => {
    const result = parse('tagId=tag&page=3', 'album');
    expect(result.filters.scope).toBe('album');
    expect(result.filters.sort).toBe('joined_desc');
    const request = libraryRequestParams(result.filters, { page: result.page });
    expect(request.get('scope')).toBe('album');
    expect(request.get('albumId')).toBe('album');
    expect(request.has('sort')).toBe(false);
    expect(parseLibraryQuery(request).filters).toEqual(result.filters);
    expect(() => parse('albumId=other', 'album')).toThrow('相册筛选');
    expect(() => parse('sort=uploaded_desc', 'album')).toThrow('固定顺序');
  });
  it('serializes all filters to the existing HTTP contract', () => {
    const value =
      'q=photo&albumId=a&tagId=x&tagId=y&uploadedFrom=2026-01-01T00:00:00Z&uploadedBefore=2026-02-01T00:00:00Z&format=png&storageId=s&visibility=private&status=failed&failure=initial&sort=size_asc&pageSize=80';
    const result = parse(value);
    const request = libraryRequestParams(result.filters, { page: 12 });
    expect(parseLibraryQuery(request)).toEqual({
      filters: result.filters,
      page: 12,
      cursor: null,
    });
    expect(
      libraryRequestParams(result.filters, { cursor: 'cursor' }).get('cursor'),
    ).toBe('cursor');
    expect(
      libraryRequestParams(result.filters, { cursor: null }).has('page'),
    ).toBe(false);
  });
});

describe('presentation preferences', () => {
  it('defaults to grid + more and reads all four combinations', () => {
    expect(readLibraryPreferences({ getItem: () => null })).toEqual(
      defaultLibraryPreferences,
    );
    for (const layout of ['grid', 'masonry']) {
      for (const loadingMode of ['more', 'pages']) {
        const value = { layout, loadingMode };
        expect(
          readLibraryPreferences({ getItem: () => JSON.stringify(value) }),
        ).toEqual(value);
      }
    }
  });
  it('surfaces malformed or inaccessible storage to the session preference handler', () => {
    expect(() => readLibraryPreferences({ getItem: () => '{' })).toThrow();
    expect(() =>
      readLibraryPreferences({ getItem: () => '{"layout":"rows"}' }),
    ).toThrow();
    expect(() =>
      readLibraryPreferences({
        getItem: () => {
          throw new Error('blocked');
        },
      }),
    ).toThrow('blocked');
  });
});

it('retains preference updates for the session when localStorage is blocked', async () => {
  vi.resetModules();
  vi.stubGlobal('window', {
    get localStorage() {
      throw new Error('storage blocked');
    },
  });
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const store = await import('../../../src/app/library/library-preferences');
    expect(store.getLibraryPreferences()).toEqual({
      layout: 'grid',
      loadingMode: 'more',
    });
    store.setLibraryPreferences({ layout: 'masonry', loadingMode: 'pages' });
    expect(store.getLibraryPreferences()).toEqual({
      layout: 'masonry',
      loadingMode: 'pages',
    });
    expect(warning).toHaveBeenCalledTimes(2);
  } finally {
    warning.mockRestore();
    vi.unstubAllGlobals();
  }
});
