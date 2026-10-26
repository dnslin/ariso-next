import { createElement, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, type InfiniteData } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import {
  libraryListKey,
  parseLibraryLocation,
} from '../../../src/app/library/query-state';
import { useLibraryQuery } from '../../../src/app/library/use-library-query';
import { useLibrarySelection } from '../../../src/app/library/use-library-selection';
import { selectionBatchActions } from '../../../src/app/library/library-actions';
import { smartCollectionTemplate } from '../../../src/app/library/smart-collection-templates';
import type {
  LibraryItem,
  LibraryPage,
} from '../../../src/server/library/types';

const context = vi.hoisted(() => ({
  search: '',
  mode: 'more',
  bootstrapTarget: null as unknown,
  bootstrap: null as (() => void) | null,
  captureCleanup: false,
  cleanupEffect: null as (() => void | (() => void)) | null,
}));
vi.mock('react', async (original) => {
  const actual = await original<typeof import('react')>();
  return {
    ...actual,
    useEffect: (
      effect: () => void | (() => void),
      dependencies?: unknown[],
    ) => {
      if (
        context.bootstrapTarget &&
        dependencies?.includes(context.bootstrapTarget)
      )
        context.bootstrap = effect;
      if (
        context.captureCleanup &&
        dependencies?.length === 0 &&
        !context.cleanupEffect
      )
        context.cleanupEffect = effect;
      actual.useEffect(effect, dependencies);
    },
  };
});
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(context.search),
}));
vi.mock('nuqs', async (original) => ({
  ...(await original<typeof import('nuqs')>()),
  useQueryStates: () => [
    {},
    async (patch: Record<string, string | string[] | null>) => {
      const params = new URLSearchParams(context.search);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) params.delete(key);
        else if (Array.isArray(value)) {
          params.delete(key);
          for (const item of value) params.append(key, item);
        } else params.set(key, value);
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
function mount(
  client: QueryClient,
  options?: Parameters<typeof useLibraryQuery>[1],
) {
  let result!: ReturnType<typeof useLibraryQuery>;
  function Probe() {
    result = useLibraryQuery(client, options);
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  return result;
}

it('publishes a newly opened collection through the query adapter before enabling its list', async () => {
  context.search = 'image=selected';
  const collection = {
    id: 'saved',
    name: '待整理',
    rules: { q: 'prefix', tagState: 'none' },
    createdAt: '',
    updatedAt: '',
  };
  context.bootstrapTarget = collection;
  vi.stubGlobal('window', {
    location: {
      href: 'http://ariso.test/library/collections/saved?image=selected',
    },
    history: { replaceState: vi.fn() },
  });
  const client = new QueryClient();
  mount(client, {
    collection,
    initialQuery:
      'scope=normal&q=prefix&tagState=none&pageSize=40&sort=uploaded_desc',
  });
  expect(context.bootstrap).toBeTypeOf('function');
  context.bootstrap!();
  await Promise.resolve();
  const opened = mount(client, {
    collection,
    initialQuery:
      'scope=normal&q=prefix&tagState=none&pageSize=40&sort=uploaded_desc',
  });
  expect(opened.filters).toMatchObject({ q: 'prefix', tagState: 'none' });
  expect(new URLSearchParams(context.search).get('scope')).toBe('normal');
  expect(new URLSearchParams(context.search).get('image')).toBe('selected');
  client.clear();
});

it('does not let a late relative-time response overwrite a newer absolute-date edit', async () => {
  let release!: (response: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    ),
  );
  const client = new QueryClient();
  const hook = mount(client);
  const pending = hook.applyQuery({ recentDays: '7' });
  await hook.applyQuery({
    uploadedFrom: '2026-10-01T00:00:00Z',
    uploadedBefore: '2026-10-02T00:00:00Z',
  });
  release(
    Response.json({ query: 'recentDays=7&relativeTo=2026-10-24T00:00:00Z' }),
  );
  await pending;
  expect(new URLSearchParams(context.search).get('uploadedFrom')).toBe(
    '2026-10-01T00:00:00Z',
  );
  expect(new URLSearchParams(context.search).has('recentDays')).toBe(false);
  client.clear();
});

it('does not restore pending relative criteria after the user resets the query', async () => {
  let release!: (response: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    ),
  );
  vi.stubGlobal('window', {
    location: { href: 'http://ariso.test/library' },
    history: {
      pushState: (_data: unknown, _unused: string, url: URL) => {
        context.search = url.searchParams.toString();
      },
    },
  });
  const client = new QueryClient();
  const hook = mount(client);
  const pending = hook.applyQuery({ recentDays: '7' });
  hook.resetQuery();
  release(
    Response.json({ query: 'recentDays=7&relativeTo=2026-10-24T00:00:00Z' }),
  );
  await pending;
  expect(new URLSearchParams(context.search).has('recentDays')).toBe(false);
  client.clear();
});

it('does not publish a pending relative response after leaving the page', async () => {
  context.captureCleanup = true;
  vi.stubGlobal('window', {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  let release!: (response: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    ),
  );
  const client = new QueryClient();
  const hook = mount(client);
  const pending = hook.applyQuery({ recentDays: '7' });
  const cleanup = context.cleanupEffect!();
  expect(cleanup).toBeTypeOf('function');
  cleanup!();
  release(
    Response.json({ query: 'recentDays=7&relativeTo=2026-10-24T00:00:00Z' }),
  );
  await pending;
  expect(context.search).toBe('');
  client.clear();
});

it('does not let a pending relative response replace same-page browser history after Back', async () => {
  context.captureCleanup = true;
  const events = new EventTarget();
  vi.stubGlobal('window', {
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  });
  let release!: (response: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    ),
  );
  const client = new QueryClient();
  const hook = mount(client);
  const cleanup = context.cleanupEffect!();
  const pending = hook.applyQuery({ recentDays: '7' });
  context.search = 'q=previous-history';
  events.dispatchEvent(new Event('popstate'));
  release(
    Response.json({ query: 'recentDays=7&relativeTo=2026-10-24T00:00:00Z' }),
  );
  await pending;
  expect(context.search).toBe('q=previous-history');
  cleanup!();
  client.clear();
});

it('replaces an older collection definition completely using the returned server boundary', async () => {
  context.search = 'tagState=none&format=jpeg&albumId=old&storageId=old';
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const client = new QueryClient();
  const hook = mount(client);
  expect(
    await hook.replaceQuery(
      'q=latest&tagId=current&recentDays=7&relativeTo=2026-10-24T00:00:00Z',
      hook.getQueryRevision(),
    ),
  ).toBe(true);
  expect(
    parseLibraryLocation(new URLSearchParams(context.search)).filters,
  ).toMatchObject({
    q: 'latest',
    tagIds: ['current'],
    recentDays: 7,
    format: null,
    albumId: null,
    storageId: null,
  });
  expect(new URLSearchParams(context.search).has('tagState')).toBe(false);
  expect(fetcher).not.toHaveBeenCalled();
  client.clear();
});

it('retains edits made while the latest saved definition is being read', async () => {
  const client = new QueryClient();
  const hook = mount(client);
  const revision = hook.getQueryRevision();
  await hook.applyQuery({ q: 'local draft' });
  expect(await hook.replaceQuery('q=remote', revision)).toBe(false);
  expect(new URLSearchParams(context.search).get('q')).toBe('local draft');
  client.clear();
});

it('applies the screenshot template without retaining previous format, storage, album, status or sort filters', async () => {
  context.search =
    'q=before&format=jpeg&albumId=old&storageId=old&visibility=private&status=failed&failure=initial&sort=size_asc';
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({ query: 'recentDays=7&relativeTo=2026-10-24T00:00:00Z' }),
    ),
  );
  const client = new QueryClient();
  await mount(client).applyQuery(
    smartCollectionTemplate('screenshot', ['real-screenshot']),
  );
  expect(
    parseLibraryLocation(new URLSearchParams(context.search)).filters,
  ).toMatchObject({
    q: '',
    tagIds: ['real-screenshot'],
    recentDays: 7,
    format: null,
    albumId: null,
    storageId: null,
    visibility: null,
    status: null,
    failure: null,
    sort: 'uploaded_desc',
  });
  client.clear();
});

it('keeps a saved collection query ready when resetting invalid criteria', () => {
  context.search = 'scope=normal&tagId=removed';
  const pushState = vi.fn();
  vi.stubGlobal('window', {
    location: {
      href: `http://ariso.test/library/collections/saved?${context.search}`,
    },
    history: { pushState },
  });
  mount(new QueryClient(), {
    collection: {
      id: 'saved',
      name: '保存集合',
      rules: { tagId: ['removed'] },
      createdAt: '',
      updatedAt: '',
    },
    initialQuery: context.search,
  }).resetQuery();
  expect((pushState.mock.calls[0][2] as URL).searchParams.get('scope')).toBe(
    'normal',
  );
});

it('keeps relative time stable for data refresh and resolves a new boundary only on explicit refresh', async () => {
  context.search = 'recentDays=7&relativeTo=2026-10-24T12%3A00%3A00.000Z';
  const previous = context.search;
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/library/collections/resolve') {
      expect(JSON.parse(String(init?.body))).toMatchObject({ recentDays: '7' });
      expect(JSON.parse(String(init?.body))).not.toHaveProperty('relativeTo');
      return Response.json({
        query: 'recentDays=7&relativeTo=2026-10-25T12%3A00%3A00.000Z',
      });
    }
    expect(
      new URL(url, 'http://localhost').searchParams.get('relativeTo'),
    ).toBe('2026-10-24T12:00:00.000Z');
    return Response.json({
      items: [],
      total: 0,
      hasMore: false,
      nextCursor: null,
    });
  });
  vi.stubGlobal('fetch', fetcher);
  const client = new QueryClient();
  await mount(client).refreshCurrent();
  expect(context.search).toBe(previous);
  await mount(client).refresh();
  expect(new URLSearchParams(context.search).get('relativeTo')).toBe(
    '2026-10-25T12:00:00.000Z',
  );
  expect(new URLSearchParams(context.search).has('uploadedFrom')).toBe(false);
  client.clear();
});

it('clears library filters without removing the storage reference return destination', () => {
  const source = '/settings/storage/archive?view=references';
  context.search = `storageId=archive&storageReturn=${encodeURIComponent(source)}`;
  const pushState = vi.fn();
  vi.stubGlobal('window', {
    location: { href: `http://ariso.test/library?${context.search}` },
    history: { pushState },
  });
  mount(new QueryClient()).resetQuery();
  const url = pushState.mock.calls[0][2] as URL;
  expect(url.searchParams.has('storageId')).toBe(false);
  expect(url.searchParams.get('storageReturn')).toBe(source);
});
const item = (id: string): LibraryItem => ({
  id,
  displayName: id,
  originalName: `${id}.png`,
  byteSize: 100,
  format: 'png',
  width: 100,
  height: 100,
  visibility: 'private',
  hasAlbums: false,
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
  metadataJob: null,
  processingJob: null,
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
  context.bootstrapTarget = null;
  context.bootstrap = null;
  context.captureCleanup = false;
  context.cleanupEffect = null;
});

it('refreshes from the first cursor without replacing real cards with an empty loading state', async () => {
  context.search = 'q=photo&pageSize=20';
  const filters = parseLibraryLocation(
    new URLSearchParams(context.search),
  ).filters;
  const key = libraryListKey(filters, 'more', 1);
  const client = new QueryClient();
  client.setQueryData<InfiniteData<LibraryPage>>(
    key,
    {
      pages: [page(['a', 'b'], 'old-cursor'), page(['c', 'd'], 'bad-cursor')],
      pageParams: [null, 'old-cursor'],
    },
    { updatedAt: 123 },
  );
  let release!: () => void;
  const fetcher = vi.fn(async (url: string) => {
    expect(new URL(url, 'http://localhost').searchParams.has('cursor')).toBe(
      false,
    );
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return Response.json(page(['new', 'a'], 'fresh-cursor'));
  });
  vi.stubGlobal('fetch', fetcher);
  const pending = mount(client).refresh();
  expect(
    client
      .getQueryData<InfiniteData<LibraryPage>>(key)
      ?.pages[0].items.map((item) => item.id),
  ).toEqual(['a', 'b']);
  expect(mount(client).dataUpdatedAt).toBe(123);
  expect(fetcher).toHaveBeenCalledOnce();
  release();
  await pending;
  const refreshed = client.getQueryData<InfiniteData<LibraryPage>>(key)!;
  expect(refreshed.pages).toHaveLength(1);
  expect(refreshed.pages[0].items.map((item) => item.id)).toEqual(['new', 'a']);
  expect(refreshed.pages[0].nextCursor).toBe('fresh-cursor');
  expect(refreshed.pageParams).toEqual([null]);
  expect(mount(client).dataUpdatedAt).not.toBe(123);
  client.clear();
});

it('does not advance the thumbnail read revision when a more-mode refresh fails', async () => {
  const filters = parseLibraryLocation(new URLSearchParams()).filters;
  const key = libraryListKey(filters, 'more', 1);
  const client = new QueryClient();
  client.setQueryData<InfiniteData<LibraryPage>>(
    key,
    {
      pages: [page(['a'], null)],
      pageParams: [null],
    },
    { updatedAt: 123 },
  );
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ message: '读取失败' }, { status: 500 }),
      ),
  );
  await mount(client).refresh();
  const result = mount(client);
  expect(result.items.map((item) => item.id)).toEqual(['a']);
  expect(result.error?.message).toBe('读取失败');
  expect(result.dataUpdatedAt).toBe(123);
  client.clear();
});

it('keeps the current page visible when a manual refresh fails', async () => {
  context.mode = 'pages';
  context.search = 'page=2&pageSize=20';
  const filters = parseLibraryLocation(
    new URLSearchParams(context.search),
  ).filters;
  const key = libraryListKey(filters, 'pages', 2);
  const client = new QueryClient();
  const original = page(['a', 'b'], null);
  client.setQueryData(key, original);
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ message: '读取失败' }, { status: 500 }),
      ),
  );
  await mount(client).refresh();
  const result = mount(client);
  expect(result.items.map((item) => item.id)).toEqual(['a', 'b']);
  expect(result.error?.message).toBe('读取失败');
  expect(result.page).toBe(2);
  client.clear();
});

it('refreshes every currently loaded batch without clearing the current window or changing query state', async () => {
  context.search = 'q=photo&pageSize=20';
  const filters = parseLibraryLocation(
    new URLSearchParams(context.search),
  ).filters;
  const key = libraryListKey(filters, 'more', 1);
  const client = new QueryClient();
  client.setQueryData<InfiniteData<LibraryPage>>(key, {
    pages: [page(['a', 'b'], 'cursor-b'), page(['c', 'd'], 'cursor-d')],
    pageParams: [null, 'cursor-b'],
  });
  let release!: () => void;
  const requests: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      requests.push(url);
      if (requests.length === 1) {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return Response.json(page(['new', 'a'], 'cursor-a', 101));
      }
      return Response.json(page(['b', 'c'], 'cursor-c', 101));
    }),
  );
  const pending = mount(client).refreshCurrent();
  expect(
    client
      .getQueryData<InfiniteData<LibraryPage>>(key)
      ?.pages.flatMap((entry) => entry.items.map((item) => item.id)),
  ).toEqual(['a', 'b', 'c', 'd']);
  release();
  await pending;
  const refreshed = client.getQueryData<InfiniteData<LibraryPage>>(key)!;
  expect(
    refreshed.pages.flatMap((entry) => entry.items.map((item) => item.id)),
  ).toEqual(['new', 'a', 'b', 'c']);
  expect(requests).toHaveLength(2);
  expect(
    new URL(requests[1], 'http://localhost').searchParams.get('cursor'),
  ).toBe('cursor-a');
  expect(context.search).toBe('q=photo&pageSize=20');
  client.clear();
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

it('removes confirmed invalid IDs from all same-query cached pages without refetching or losing cursors', () => {
  context.search = 'q=photo&pageSize=20&page=2';
  const filters = parseLibraryLocation(
    new URLSearchParams(context.search),
  ).filters;
  const other = parseLibraryLocation(
    new URLSearchParams('q=other&pageSize=20'),
  ).filters;
  const client = new QueryClient();
  const first = libraryListKey(filters, 'pages', 1);
  const second = libraryListKey(filters, 'pages', 2);
  const more = libraryListKey(filters, 'more', 1);
  const different = libraryListKey(other, 'pages', 1);
  client.setQueryData(first, page(['a', 'b'], null), { updatedAt: 123 });
  client.setQueryData(second, page(['c', 'd'], null), { updatedAt: 456 });
  client.setQueryData(
    more,
    { pages: [page(['a', 'b'], 'after-b')], pageParams: [null] },
    { updatedAt: 789 },
  );
  client.setQueryData(different, page(['a'], null));
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  mount(client).onSelectionInvalid(['a', 'c']);
  expect(
    client.getQueryData<LibraryPage>(first)!.items.map((item) => item.id),
  ).toEqual(['b']);
  expect(
    client.getQueryData<LibraryPage>(second)!.items.map((item) => item.id),
  ).toEqual(['d']);
  const infinite = client.getQueryData<InfiniteData<LibraryPage>>(more)!;
  expect(infinite.pages[0].items.map((item) => item.id)).toEqual(['b']);
  expect(infinite.pages[0].nextCursor).toBe('after-b');
  expect(infinite.pageParams).toEqual([null]);
  expect(
    client.getQueryData<LibraryPage>(different)!.items.map((item) => item.id),
  ).toEqual(['a']);
  expect(
    [first, second, more].map(
      (key) => client.getQueryState(key)!.dataUpdatedAt,
    ),
  ).toEqual([123, 456, 789]);
  expect(fetcher).not.toHaveBeenCalled();
  client.clear();
});

it.each(['pages', 'more'] as const)(
  'keeps other tag combinations in %s history when selection is invalidated',
  (mode) => {
    context.search = 'tagId=a&pageSize=20&page=1';
    const filters = parseLibraryLocation(
      new URLSearchParams(context.search),
    ).filters;
    const client = new QueryClient();
    const current = libraryListKey(filters, mode, 1);
    const broader = libraryListKey(
      parseLibraryLocation(new URLSearchParams('tagId=a&tagId=b&pageSize=20'))
        .filters,
      mode,
      1,
    );
    const cached =
      mode === 'pages'
        ? page(['image-with-a-and-b'], null)
        : {
            pages: [page(['image-with-a-and-b'], 'next')],
            pageParams: [null],
          };
    client.setQueryData(current, cached);
    client.setQueryData(broader, cached, { updatedAt: 123 });
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);

    // Removing tag a invalidates this selection, but tag b still matches history.
    mount(client).onSelectionInvalid(['image-with-a-and-b']);
    const updated = client.getQueryData<
      LibraryPage | InfiniteData<LibraryPage>
    >(current)!;
    expect('pages' in updated ? updated.pages[0].items : updated.items).toEqual(
      [],
    );
    expect(client.getQueryData(broader)).toEqual(cached);
    expect(client.getQueryState(broader)!.dataUpdatedAt).toBe(123);
    context.search = 'tagId=a&tagId=b&pageSize=20';
    if (mode === 'pages') context.search += '&page=1';
    expect(mount(client).items.map((item) => item.id)).toEqual([
      'image-with-a-and-b',
    ]);
    expect(fetcher).not.toHaveBeenCalled();
    client.clear();
  },
);

it('batch completion refreshes the current page and invalidates previously cached pages', async () => {
  context.mode = 'pages';
  context.search = 'q=photo&pageSize=20&page=2';
  const filters = parseLibraryLocation(
    new URLSearchParams(context.search),
  ).filters;
  const client = new QueryClient();
  const first = libraryListKey(filters, 'pages', 1);
  const current = libraryListKey(filters, 'pages', 2);
  client.setQueryData(first, page(['removed', 'earlier'], null));
  client.setQueryData(current, page(['stay'], null));
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json(page(['stay', 'next'], null, 99))),
  );
  await mount(client).onBatchCompleted(
    [{ id: 'removed', status: 'changed', inQuery: false, message: '已回收' }],
    { type: 'trash' },
  );
  expect(client.getQueryState(first)?.isInvalidated).toBe(true);
  expect(
    client.getQueryData<LibraryPage>(first)?.items.map((item) => item.id),
  ).toEqual(['earlier']);
  expect(
    client.getQueryData<LibraryPage>(current)?.items.map((item) => item.id),
  ).toEqual(['stay', 'next']);
  client.clear();
});

it('batch completion preserves loaded pages and continues after the original deleted cursor anchor', async () => {
  context.search = 'q=photo&pageSize=20';
  const filters = parseLibraryLocation(
    new URLSearchParams(context.search),
  ).filters;
  const client = new QueryClient();
  const key = libraryListKey(filters, 'more', 1);
  client.setQueryData(key, {
    pages: [page(['a', 'b'], 'after-b', 5), page(['c', 'd'], 'after-d', 5)],
    pageParams: [null, 'after-b'],
  });
  const fetcher = vi
    .fn()
    .mockResolvedValue(Response.json(page(['e'], null, 3)));
  vi.stubGlobal('fetch', fetcher);
  await mount(client).onBatchCompleted(
    ['b', 'd'].map((id) => ({
      id,
      status: 'changed' as const,
      inQuery: false,
      message: '已回收',
    })),
    { type: 'trash' },
  );
  const current = client.getQueryData<InfiniteData<LibraryPage>>(key)!;
  expect(
    current.pages.flatMap((page) => page.items.map((item) => item.id)),
  ).toEqual(['a', 'c']);
  expect(current.pages.map((page) => page.nextCursor)).toEqual([
    'after-b',
    'after-d',
  ]);
  expect(current.pageParams).toEqual([null, 'after-b']);
  expect(fetcher).not.toHaveBeenCalled();
  await mount(client).loadMore();
  expect(
    new URL(fetcher.mock.calls[0][0], 'https://example.test').searchParams.get(
      'cursor',
    ),
  ).toBe('after-d');
  expect(
    client
      .getQueryData<InfiniteData<LibraryPage>>(key)
      ?.pages.flatMap((page) => page.items.map((item) => item.id)),
  ).toEqual(['a', 'c', 'e']);
  client.clear();
});

it('batch visibility updates cached loaded cards while leaving valid failed cards unchanged', async () => {
  context.search = 'q=photo&pageSize=20';
  const filters = parseLibraryLocation(
    new URLSearchParams(context.search),
  ).filters;
  const client = new QueryClient();
  const key = libraryListKey(filters, 'more', 1);
  const history = libraryListKey(
    parseLibraryLocation(new URLSearchParams('q=other&pageSize=20')).filters,
    'more',
    1,
  );
  client.setQueryData(key, {
    pages: [page(['changed', 'unchanged', 'failed'], 'original-cursor', 3)],
    pageParams: [null],
  });
  client.setQueryData(history, {
    pages: [page(['changed'], 'other-cursor')],
    pageParams: [null],
  });
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const results = [
    {
      id: 'changed',
      status: 'changed' as const,
      inQuery: true,
      message: '已公开',
    },
    {
      id: 'unchanged',
      status: 'unchanged' as const,
      inQuery: true,
      message: '已公开',
    },
    {
      id: 'failed',
      status: 'failed' as const,
      inQuery: true,
      message: '保存失败',
    },
  ];
  await mount(client).onBatchCompleted(results, {
    type: 'visibility',
    visibility: 'public',
  });
  const data = client.getQueryData<InfiniteData<LibraryPage>>(key)!;
  expect(data.pages[0].items.map((item) => item.visibility)).toEqual([
    'public',
    'public',
    'private',
  ]);
  expect(data.pages[0].total).toBe(3);
  expect(data.pages[0].nextCursor).toBe('original-cursor');
  expect(client.getQueryState(key)?.isInvalidated).toBe(false);
  expect(client.getQueryState(history)?.isInvalidated).toBe(true);
  expect(fetcher).not.toHaveBeenCalled();
  client.clear();
});

it.each(['all', 'drag', 'reselect'] as const)(
  'keeps the remove-albums action after adding an album and selecting by %s',
  async (method) => {
    const filters = parseLibraryLocation(new URLSearchParams()).filters;
    const client = new QueryClient();
    const key = libraryListKey(filters, 'more', 1);
    client.setQueryData(key, {
      pages: [page(['a'], 'after-a', 2), page(['b'], 'after-b', 2)],
      pageParams: [null, 'after-a'],
    });
    const before = mount(client).items;
    const updated = { ...item('a'), hasAlbums: true };
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ items: [updated], missingIds: [] }));
    vi.stubGlobal('fetch', fetcher);

    await mount(client).onBatchCompleted(
      [{ id: 'a', status: 'changed', inQuery: true, message: '已添加' }],
      { type: 'add-albums', albumIds: ['album-one'] },
    );

    const refreshed = mount(client).items;
    function Probe() {
      const [step, setStep] = useState(0);
      const selection = useLibrarySelection(
        'query',
        step < 2 ? before : refreshed,
      );
      if (step === 0) selection.toggle(before[0]);
      else if (step === 1)
        selection.reconcile(new Map(selection.selected), [updated]);
      else if (step === 2) {
        expect(selection.selected.get('a')?.hasAlbums).toBe(true);
        if (method === 'all') selection.selectCurrent();
        else if (method === 'drag') selection.selectIds(['a', 'b']);
        else selection.clear();
      } else if (step === 3 && method === 'reselect')
        selection.toggle(refreshed[0]);
      else {
        expect(selection.selected.get('a')?.hasAlbums).toBe(true);
        expect(
          selectionBatchActions([...selection.selected.values()], false),
        ).toContain('remove-albums');
      }
      if (step < (method === 'reselect' ? 4 : 3)) setStep(step + 1);
      return null;
    }
    renderToStaticMarkup(createElement(Probe));
    expect(fetcher).toHaveBeenCalledWith(
      '/api/images/status',
      expect.objectContaining({ body: '{"ids":["a"]}' }),
    );
    const current = client.getQueryData<InfiniteData<LibraryPage>>(key)!;
    expect(current.pages.map((page) => page.total)).toEqual([2, 2]);
    expect(current.pages.map((page) => page.nextCursor)).toEqual([
      'after-a',
      'after-b',
    ]);
    expect(current.pageParams).toEqual([null, 'after-a']);
    client.clear();
  },
);

it('reads actual remaining album membership after removal, including failed and unknown items', async () => {
  const filters = parseLibraryLocation(new URLSearchParams()).filters;
  const client = new QueryClient();
  const key = libraryListKey(filters, 'more', 1);
  const cached = page(
    ['remaining', 'empty', 'failed', 'unknown'],
    'after-last',
    4,
  );
  cached.items = cached.items.map((item) => ({ ...item, hasAlbums: true }));
  client.setQueryData(key, { pages: [cached], pageParams: [null] });
  const statuses = [
    { ...item('remaining'), hasAlbums: true },
    item('empty'),
    { ...item('failed'), hasAlbums: true },
    item('unknown'),
  ];
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(Response.json({ items: statuses, missingIds: [] })),
  );
  await mount(client).onBatchCompleted(
    [
      { id: 'remaining', status: 'changed', inQuery: true, message: '已移除' },
      { id: 'empty', status: 'changed', inQuery: true, message: '已移除' },
      { id: 'failed', status: 'failed', inQuery: true, message: '保存失败' },
      { id: 'unknown', status: 'unknown', inQuery: true, message: '待核对' },
    ],
    { type: 'remove-albums', albumIds: ['album-one'] },
  );
  const refreshed = mount(client).items;
  expect(refreshed.map((item) => [item.id, item.hasAlbums])).toEqual([
    ['remaining', true],
    ['empty', false],
    ['failed', true],
    ['unknown', false],
  ]);
  expect(selectionBatchActions([refreshed[0]], false)).toContain(
    'remove-albums',
  );
  expect(selectionBatchActions([refreshed[1]], false)).not.toContain(
    'remove-albums',
  );
  const current = client.getQueryData<InfiniteData<LibraryPage>>(key)!;
  expect(current.pages[0].nextCursor).toBe('after-last');
  expect(current.pages[0].total).toBe(4);
  client.clear();
});

it.each([401, 503])(
  'album membership status HTTP %s propagates without guessing cached membership',
  async (status) => {
    const filters = parseLibraryLocation(new URLSearchParams()).filters;
    const client = new QueryClient();
    const key = libraryListKey(filters, 'more', 1);
    const cached = { pages: [page(['a'], 'after-a')], pageParams: [null] };
    client.setQueryData(key, cached);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ message: '无法读取图片状态' }, { status }),
        ),
    );
    await expect(
      mount(client).onBatchCompleted(
        [{ id: 'a', status: 'changed', inQuery: true, message: '已添加' }],
        { type: 'add-albums', albumIds: ['album-one'] },
      ),
    ).rejects.toMatchObject({ status });
    expect(client.getQueryData(key)).toEqual(cached);
    client.clear();
  },
);

it('rechecking an already removed item does not decrement loaded totals again', async () => {
  context.search = 'tagId=a&pageSize=20';
  const filters = parseLibraryLocation(
    new URLSearchParams(context.search),
  ).filters;
  const client = new QueryClient();
  const key = libraryListKey(filters, 'more', 1);
  client.setQueryData(key, {
    pages: [page(['removed', 'stay'], 'original-cursor', 2)],
    pageParams: [null],
  });
  const results = [
    {
      id: 'removed',
      status: 'unchanged' as const,
      inQuery: false,
      message: '核对成功',
    },
  ];
  await mount(client).onBatchCompleted(results, {
    type: 'remove-tags',
    tagIds: ['a'],
  });
  await mount(client).onBatchCompleted(results, {
    type: 'remove-tags',
    tagIds: ['a'],
  });
  const data = client.getQueryData<InfiniteData<LibraryPage>>(key)!;
  expect(data.pages[0].items.map((item) => item.id)).toEqual(['stay']);
  expect(data.pages[0].total).toBe(1);
  expect(data.pages[0].nextCursor).toBe('original-cursor');
  client.clear();
});

it.each(['succeeded', 'failed'] as const)(
  'reprocess %s reads affected cards while preserving all loaded cursor boundaries',
  async (status) => {
    context.search = 'q=photo&pageSize=20';
    const filters = parseLibraryLocation(
      new URLSearchParams(context.search),
    ).filters;
    const client = new QueryClient();
    const key = libraryListKey(filters, 'more', 1);
    client.setQueryData(key, {
      pages: [page(['a', 'b'], 'after-b', 5), page(['c', 'd'], 'after-d', 5)],
      pageParams: [null, 'after-b'],
    });
    const task = {
      id: 'task-c',
      status,
      scope: 'thumbnail' as const,
      step: 'thumbnail',
      error: status === 'failed' ? '磁盘不可写' : null,
      expectedVersions: ['thumbnail' as const],
      generatedVersions: status === 'succeeded' ? ['thumbnail' as const] : [],
    };
    const updated: LibraryItem = {
      ...item('c'),
      processingStatus: status === 'failed' ? 'failed' : 'ready',
      versions: { ...item('c').versions, thumbnail: status === 'succeeded' },
      thumbnailUrl: status === 'succeeded' ? '/i/c?type=thumbnail' : null,
      thumbnailDimensions:
        status === 'succeeded' ? { width: 200, height: 100 } : null,
      processingJob: task,
      latestFailedJob:
        status === 'failed' ? { ...task, status: 'failed' } : null,
    };
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ items: [updated], missingIds: [] }));
    vi.stubGlobal('fetch', fetcher);

    await mount(client).onBatchCompleted(
      [
        {
          id: 'c',
          status: 'accepted',
          inQuery: true,
          message: '已核对',
          taskId: task.id,
          task,
        },
      ],
      { type: 'reprocess', scope: 'thumbnail', taskIds: { c: task.id } },
    );

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      '/api/images/status',
      expect.objectContaining({ method: 'POST', body: '{"ids":["c"]}' }),
    );
    const current = client.getQueryData<InfiniteData<LibraryPage>>(key)!;
    expect(current.pageParams).toEqual([null, 'after-b']);
    expect(current.pages.map((page) => page.nextCursor)).toEqual([
      'after-b',
      'after-d',
    ]);
    expect(
      current.pages.flatMap((page) => page.items.map((item) => item.id)),
    ).toEqual(['a', 'b', 'c', 'd']);
    expect(current.pages[1].items[0]).toEqual(updated);
    client.clear();
  },
);

it.each([401, 503])(
  'reprocess status HTTP %s propagates while preserving loaded cards',
  async (status) => {
    const filters = parseLibraryLocation(new URLSearchParams()).filters;
    const client = new QueryClient();
    const key = libraryListKey(filters, 'more', 1);
    const cached = { pages: [page(['a'], 'after-a')], pageParams: [null] };
    client.setQueryData(key, cached);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { message: '暂时无法读取列表', code: 'LIBRARY_READ_FAILED' },
            { status },
          ),
        ),
    );
    await expect(
      mount(client).onBatchCompleted(
        [{ id: 'a', status: 'failed', inQuery: true, message: '当前任务冲突' }],
        { type: 'reprocess', scope: 'all', taskIds: { a: 'task-a' } },
      ),
    ).rejects.toMatchObject({
      status,
      message: `暂时无法读取列表（HTTP ${status}）`,
    });
    expect(client.getQueryData(key)).toEqual(cached);
    client.clear();
  },
);

it('reprocess status removes actually missing IDs without changing loaded cursor boundaries', async () => {
  const filters = parseLibraryLocation(new URLSearchParams()).filters;
  const client = new QueryClient();
  const key = libraryListKey(filters, 'more', 1);
  client.setQueryData(key, {
    pages: [page(['a', 'b'], 'after-b', 5), page(['c', 'd'], 'after-d', 5)],
    pageParams: [null, 'after-b'],
  });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json({ items: [], missingIds: ['b'] })),
  );
  await mount(client).onBatchCompleted(
    [{ id: 'b', status: 'failed', inQuery: true, message: '已核对' }],
    { type: 'reprocess', scope: 'all', taskIds: { b: 'task-b' } },
  );
  const current = client.getQueryData<InfiniteData<LibraryPage>>(key)!;
  expect(
    current.pages.map((page) => page.items.map((item) => item.id)),
  ).toEqual([['a'], ['c', 'd']]);
  expect(current.pages.map((page) => page.total)).toEqual([4, 4]);
  expect(current.pages.map((page) => page.nextCursor)).toEqual([
    'after-b',
    'after-d',
  ]);
  expect(current.pageParams).toEqual([null, 'after-b']);
  client.clear();
});

it('reprocess status aborts when its query client is cleared without restoring disposed cards', async () => {
  const filters = parseLibraryLocation(new URLSearchParams()).filters;
  const client = new QueryClient();
  const key = libraryListKey(filters, 'more', 1);
  client.setQueryData(key, {
    pages: [page(['a'], 'after-a')],
    pageParams: [null],
  });
  const fetcher = vi.fn().mockImplementation(
    (_url: string, options: RequestInit) =>
      new Promise((_resolve, reject) => {
        options.signal!.addEventListener(
          'abort',
          () => reject(options.signal!.reason),
          { once: true },
        );
      }),
  );
  vi.stubGlobal('fetch', fetcher);
  const pending = mount(client).onBatchCompleted(
    [{ id: 'a', status: 'failed', inQuery: true, message: '已核对' }],
    { type: 'reprocess', scope: 'all', taskIds: { a: 'task-a' } },
  );
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  client.clear();
  await expect(pending).rejects.toBeDefined();
  expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  expect(client.getQueryData(key)).toBeUndefined();
});

it.each([1, 81])(
  'reprocess status is cancelled together with subsequent library mutations for %i IDs',
  async (count) => {
    const filters = parseLibraryLocation(new URLSearchParams()).filters;
    const client = new QueryClient();
    const key = libraryListKey(filters, 'more', 1);
    const ids = Array.from({ length: count }, (_, index) => `image-${index}`);
    const cached = {
      pages: [page(ids, 'original-boundary')],
      pageParams: [null],
    };
    client.setQueryData(key, cached);
    const fetcher = vi
      .fn()
      .mockImplementation((_url: string, options: RequestInit) => {
        if (count > 80 && fetcher.mock.calls.length === 1) {
          const requested = JSON.parse(String(options.body)).ids as string[];
          return Promise.resolve(
            Response.json({
              items: requested.map((id) => ({
                ...item(id),
                versions: { ...item(id).versions, thumbnail: true },
              })),
              missingIds: [],
            }),
          );
        }
        return new Promise((_resolve, reject) => {
          options.signal!.addEventListener(
            'abort',
            () => reject(options.signal!.reason),
            { once: true },
          );
        });
      });
    vi.stubGlobal('fetch', fetcher);
    const pending = mount(client)
      .onBatchCompleted(
        ids.map((id) => ({
          id,
          status: 'failed' as const,
          inQuery: true,
          message: '已核对',
        })),
        {
          type: 'reprocess',
          scope: 'all',
          taskIds: Object.fromEntries(ids.map((id) => [id, `task-${id}`])),
        },
      )
      .catch((error: unknown) => error);
    try {
      await vi.waitFor(() =>
        expect(fetcher).toHaveBeenCalledTimes(count > 80 ? 2 : 1),
      );
      expect(client.getQueryData(key)).toEqual(cached);
      await client.cancelQueries({ queryKey: ['library'] });
      expect(
        fetcher.mock.calls.every(([, options]) => options.signal.aborted),
      ).toBe(true);
      expect(client.getQueryData(key)).toEqual(cached);
    } finally {
      client.clear();
      await pending;
    }
  },
);

it('reprocess removes items outside the query without replacing deleted cursor anchors', async () => {
  context.search = 'status=failed&pageSize=20';
  const filters = parseLibraryLocation(
    new URLSearchParams(context.search),
  ).filters;
  const client = new QueryClient();
  const key = libraryListKey(filters, 'more', 1);
  client.setQueryData(key, {
    pages: [page(['a', 'b'], 'after-b', 5), page(['c', 'd'], 'after-d', 5)],
    pageParams: [null, 'after-b'],
  });
  const updated = { ...item('c'), processingStatus: 'failed' as const };
  const fetcher = vi
    .fn()
    .mockResolvedValue(Response.json({ items: [updated], missingIds: [] }));
  vi.stubGlobal('fetch', fetcher);
  await mount(client).onBatchCompleted(
    [
      {
        id: 'b',
        status: 'failed',
        inQuery: false,
        message: '图片已离开当前查询',
      },
      { id: 'c', status: 'failed', inQuery: true, message: '本次任务失败' },
    ],
    { type: 'reprocess', scope: 'all', taskIds: { b: 'task-b', c: 'task-c' } },
  );
  expect(fetcher).toHaveBeenCalledWith(
    '/api/images/status',
    expect.objectContaining({ body: '{"ids":["c"]}' }),
  );
  const current = client.getQueryData<InfiniteData<LibraryPage>>(key)!;
  expect(
    current.pages.map((page) => page.items.map((item) => item.id)),
  ).toEqual([['a'], ['c', 'd']]);
  expect(current.pages.map((page) => page.nextCursor)).toEqual([
    'after-b',
    'after-d',
  ]);
  expect(current.pageParams).toEqual([null, 'after-b']);
  expect(current.pages.map((page) => page.total)).toEqual([4, 4]);
  expect(current.pages[1].items[0]).toEqual(updated);
  client.clear();
});

it('reprocess queues only affected loaded IDs in status batches of at most 80', async () => {
  const filters = parseLibraryLocation(new URLSearchParams()).filters;
  const client = new QueryClient();
  const key = libraryListKey(filters, 'more', 1);
  const ids = Array.from({ length: 81 }, (_, index) => `image-${index}`);
  client.setQueryData(key, {
    pages: [
      page(ids.slice(0, 40), 'first-boundary'),
      page([...ids.slice(40), 'untouched'], 'last-boundary'),
    ],
    pageParams: [null, 'first-boundary'],
  });
  let finishFirst!: () => void;
  const fetcher = vi
    .fn()
    .mockImplementation((_url: string, options?: RequestInit) => {
      const requested = JSON.parse(String(options?.body ?? '{"ids":[]}'))
        .ids as string[];
      const response = Response.json({
        items: requested.map((id) => ({
          ...item(id),
          versions: { ...item(id).versions, thumbnail: true },
        })),
        missingIds: [],
      });
      if (fetcher.mock.calls.length === 1)
        return new Promise<Response>((resolve) => {
          finishFirst = () => resolve(response);
        });
      return Promise.resolve(response);
    });
  vi.stubGlobal('fetch', fetcher);
  const pending = mount(client).onBatchCompleted(
    [...ids, 'not-loaded'].map((id) => ({
      id,
      status: 'failed' as const,
      inQuery: true,
      message: '已核对',
    })),
    {
      type: 'reprocess',
      scope: 'all',
      taskIds: Object.fromEntries(
        [...ids, 'not-loaded'].map((id) => [id, `task-${id}`]),
      ),
    },
  );
  try {
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalled());
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(
      client
        .getQueryData<InfiniteData<LibraryPage>>(key)
        ?.pages.flatMap((page) => page.items)
        .some((item) => item.versions.thumbnail),
    ).toBe(false);
  } finally {
    finishFirst();
    await pending;
  }
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[1][1].signal).toBe(fetcher.mock.calls[0][1].signal);
  expect(
    fetcher.mock.calls.map(
      ([, options]) => JSON.parse(String(options.body)).ids,
    ),
  ).toEqual([ids.slice(0, 80), ids.slice(80)]);
  const current = client.getQueryData<InfiniteData<LibraryPage>>(key)!;
  expect(
    current.pages
      .flatMap((page) => page.items)
      .filter((item) => item.versions.thumbnail)
      .map((item) => item.id),
  ).toEqual(ids);
  expect(current.pages[1].items.at(-1)?.versions.thumbnail).toBe(false);
  expect(current.pageParams).toEqual([null, 'first-boundary']);
  expect(current.pages.map((page) => page.nextCursor)).toEqual([
    'first-boundary',
    'last-boundary',
  ]);
  client.clear();
});
