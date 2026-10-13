import { expect, it } from 'vitest';
import {
  collectionListHref,
  collectionDetailHref,
  collectionReturnIdentity,
  shareSettingsHref,
  readCollectionQuery,
  readCollectionReturn,
} from '../../../src/app/albums/collection-navigation';

it('restores the list search, page and page size from its URL after navigation', () => {
  const query = { q: '旅行与秋日', page: 3, pageSize: 20 };
  for (const path of ['/albums', '/shares'] as const) {
    const href = collectionListHref(path, query);
    const url = new URL(href, 'https://ariso.test');
    expect(url.pathname).toBe(path);
    expect(readCollectionQuery(url.searchParams)).toEqual(query);
  }
  expect(readCollectionQuery(new URLSearchParams())).toEqual({
    q: '',
    page: 1,
    pageSize: 40,
  });
});

it('keeps the exact list source through album detail, share settings and two returns', () => {
  const source = collectionListHref('/albums', {
    q: '同名旅行',
    page: 2,
    pageSize: 20,
  });
  const detail = collectionDetailHref('album', source);
  const share = shareSettingsHref('album', detail);
  const shareReturn = readCollectionReturn(
    new URL(share, 'https://ariso.test').searchParams.get('returnTo'),
    'album',
    '/shares',
  );
  expect(shareReturn).toBe(detail);
  expect(
    readCollectionReturn(
      new URL(shareReturn, 'https://ariso.test').searchParams.get('returnTo'),
      'album',
      '/albums',
    ),
  ).toBe(source);
});

it('distinguishes opening settings from an album card and from the shares list', () => {
  for (const path of ['/albums', '/shares'] as const) {
    const source = collectionListHref(path, {
      q: '旅行',
      page: 2,
      pageSize: 80,
    });
    const href = shareSettingsHref('album', source);
    expect(
      readCollectionReturn(
        new URL(href, 'https://ariso.test').searchParams.get('returnTo'),
        'album',
        '/shares',
      ),
    ).toBe(source);
  }
});

it('keeps navigation inside the collection destinations and rejects executable/external return targets', () => {
  for (const target of [
    'https://other.test/albums',
    '//other.test/albums',
    'javascript:alert(1)',
    '/settings/account',
    '/albums/another',
  ])
    expect(readCollectionReturn(target, 'album', '/shares')).toBe('/shares');
  expect(readCollectionReturn(null, 'album', '/albums')).toBe('/albums');
});

it('reports malformed page controls instead of silently changing the query', () => {
  for (const query of [
    'page=-1',
    'page=1.5',
    'page=oops',
    'pageSize=30',
    'page=1&page=2',
  ])
    expect(() => readCollectionQuery(new URLSearchParams(query))).toThrow(
      '列表查询参数无效',
    );
});

it('keeps album filters and parent source while excluding image dialog and subview state from cross-page returns', () => {
  const source = collectionListHref('/albums', {
    q: '旅行',
    page: 2,
    pageSize: 20,
  });
  const base = `${collectionDetailHref('album', source)}&q=%E6%9E%97%E9%97%B4&page=3&pageSize=40`;
  expect(
    collectionReturnIdentity(
      `${base}&image=image-1&detailView=versions&preview=compressed`,
    ),
  ).toBe(base);
  expect(
    collectionReturnIdentity(`${base}&image=image-2&detailView=reprocess`),
  ).toBe(base);
});
