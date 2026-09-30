import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, type InfiniteData } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import {
  libraryListKey,
  parseLibraryLocation,
} from '../../../src/app/library/query-state';
import { useLibraryQuery } from '../../../src/app/library/use-library-query';
import type {
  LibraryItem,
  LibraryPage,
} from '../../../src/server/library/types';

const context = vi.hoisted(() => ({ search: '', mode: 'more' }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(context.search),
}));
vi.mock('nuqs', async (original) => ({
  ...(await original<typeof import('nuqs')>()),
  useQueryStates: () => [
    {},
    async (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(context.search);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) params.delete(key);
        else params.set(key, value);
      }
      context.search = params.toString();
      return params;
    },
  ],
}));
vi.mock('../../../src/app/library/library-preferences', async (original) => ({
  ...(await original<
    typeof import('../../../src/app/library/library-preferences')
  >()),
  serverLibraryPreferences: () => ({
    layout: 'grid',
    loadingMode: context.mode,
  }),
  setLibraryPreferences: (patch: { loadingMode?: string }) => {
    if (patch.loadingMode) context.mode = patch.loadingMode;
  },
}));
function mount(client: QueryClient) {
  let result!: ReturnType<typeof useLibraryQuery>;
  function Probe() {
    result = useLibraryQuery(client);
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  return result;
}
const item = (id: string): LibraryItem => ({
  id,
  displayName: id,
  originalName: `${id}.png`,
  byteSize: 100,
  format: 'png',
  width: 100,
  height: 100,
  visibility: 'private',
  processingStatus: 'ready',
  createdAt: '2026-01-01T00:00:00Z',
  storage: { id: 's', name: 'Local', enabled: true },
  versions: {
    original: true,
    compressed: false,
    thumbnail: false,
    watermark: false,
  },
  thumbnailUrl: null,
  thumbnailDimensions: null,
  activeJob: null,
  latestFailedJob: null,
  trashedAt: null,
  deletionStatus: null,
});
const page = (
  ids: string[],
  nextCursor: string | null,
  total = 100,
): LibraryPage => ({
  items: ids.map(item),
  nextCursor,
  total,
  hasMore: nextCursor !== null,
});
afterEach(() => {
  vi.unstubAllGlobals();
  context.search = '';
  context.mode = 'more';
});

it.each([1, 3])(
  'restores explicit page %s with the default more preference',
  (number) => {
    context.search = `q=photo&pageSize=20&page=${number}`;
    const filters = parseLibraryLocation(
      new URLSearchParams(context.search),
    ).filters;
    const client = new QueryClient();
    client.setQueryData(
      libraryListKey(filters, 'pages', number),
      page([`page-${number}`], null),
    );
    const query = mount(client);
    expect(query.loadingMode).toBe('pages');
    expect(query.page).toBe(number);
    expect(query.items.map((item) => item.id)).toEqual([`page-${number}`]);
    client.clear();
  },
);

it('removing an item preserves all loaded batches and the server cursor values', async () => {
  context.search = 'q=photo&pageSize=20';
  const filters = parseLibraryLocation(
    new URLSearchParams(context.search),
  ).filters;
  const key = libraryListKey(filters, 'more', 1);
  const client = new QueryClient();
  const data: InfiniteData<LibraryPage> = {
    pages: [
      page(['a', 'b'], 'cursor-after-b'),
      page(['c', 'd'], 'cursor-after-d'),
    ],
    pageParams: [null, 'cursor-after-b'],
  };
  client.setQueryData(key, data);
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  await mount(client).onItemRemoved('d');
  const current = client.getQueryData<InfiniteData<LibraryPage>>(key)!;
  expect(
    current.pages.map((page) => page.items.map((item) => item.id)),
  ).toEqual([['a', 'b'], ['c']]);
  expect(current.pages.map((page) => page.total)).toEqual([99, 99]);
  expect(current.pages.map((page) => page.nextCursor)).toEqual([
    'cursor-after-b',
    'cursor-after-d',
  ]);
  expect(current.pageParams).toEqual([null, 'cursor-after-b']);
  expect(fetcher).not.toHaveBeenCalled();
  fetcher.mockResolvedValue(Response.json(page(['e'], null, 99)));
  await mount(client).loadMore();
  expect(
    new URL(fetcher.mock.calls[0][0], 'https://example.test').searchParams.get(
      'cursor',
    ),
  ).toBe('cursor-after-d');
  expect(
    client
      .getQueryData<InfiniteData<LibraryPage>>(key)
      ?.pages.flatMap((page) => page.items.map((item) => item.id)),
  ).toEqual(['a', 'b', 'c', 'e']);
  client.clear();
});

it('removing an item in pages mode refetches the same page and invalidates earlier cached pages', async () => {
  context.mode = 'pages';
  context.search = 'q=photo&pageSize=20&page=3';
  const filters = parseLibraryLocation(
    new URLSearchParams(context.search),
  ).filters;
  const client = new QueryClient();
  client.setQueryData(
    libraryListKey(filters, 'pages', 1),
    page(['earlier'], null),
  );
  client.setQueryData(
    libraryListKey(filters, 'pages', 3),
    page(['removed', 'stay'], null),
  );
  const fetcher = vi
    .fn()
    .mockResolvedValue(Response.json(page(['stay', 'next'], null, 99)));
  vi.stubGlobal('fetch', fetcher);
  await mount(client).onItemRemoved('removed');
  expect(
    new URL(fetcher.mock.calls[0][0], 'https://example.test').searchParams.get(
      'page',
    ),
  ).toBe('3');
  expect(
    client
      .getQueryData<LibraryPage>(libraryListKey(filters, 'pages', 3))
      ?.items.map((item) => item.id),
  ).toEqual(['stay', 'next']);
  expect(
    client.getQueryState(libraryListKey(filters, 'pages', 1))?.isInvalidated,
  ).toBe(true);
  client.clear();
});

it('more mode applies a filter without a page parameter and mode switching removes page one', async () => {
  context.search = 'q=photo&pageSize=20';
  const client = new QueryClient();
  await mount(client).applyQuery({ q: 'new' });
  expect(new URLSearchParams(context.search).has('page')).toBe(false);
  expect(mount(client).loadingMode).toBe('more');
  context.search = 'q=new&page=1&pageSize=20';
  expect(mount(client).loadingMode).toBe('pages');
  await mount(client).setLoadingMode('more');
  expect(new URLSearchParams(context.search).has('page')).toBe(false);
  expect(mount(client).loadingMode).toBe('more');
  client.clear();
});

it('Back and Forward resolve the entry mode rather than the latest preference', async () => {
  context.search = 'q=photo&pageSize=20';
  const moreUrl = context.search;
  const filters = parseLibraryLocation(new URLSearchParams(moreUrl)).filters;
  const client = new QueryClient();
  const key = libraryListKey(filters, 'more', 1);
  const data = {
    pages: [page(['a', 'b'], 'after-b'), page(['c', 'd'], null)],
    pageParams: [null, 'after-b'],
  };
  client.setQueryData(key, data);
  await mount(client).setLoadingMode('pages');
  const pagesUrl = context.search;
  expect(context.mode).toBe('pages');
  context.search = moreUrl;
  expect(mount(client).loadingMode).toBe('more');
  expect(client.getQueryData(key)).toEqual(data);
  context.search = pagesUrl;
  expect(mount(client).loadingMode).toBe('pages');
  client.clear();
});
