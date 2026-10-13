import { createElement, type EffectCallback } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  QueryClient,
  type QueryObserver,
  type QueryObserverOptions,
} from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { useTrashQuery } from '../../../src/app/trash/use-trash-query';
import { parseTrashLocation } from '../../../src/app/trash/query-state';
import type {
  LibraryItem,
  LibraryPage,
} from '../../../src/server/library/types';

const context = vi.hoisted(() => ({
  search: '',
  captureLayouts: false,
  layouts: [] as EffectCallback[],
  observer: null as QueryObserver<LibraryPage> | null,
  unsubscribe: null as (() => void) | null,
}));
vi.mock('react', async (original) => {
  const actual = await original<typeof import('react')>();
  return {
    ...actual,
    useLayoutEffect: (
      effect: EffectCallback,
      deps?: import('react').DependencyList,
    ) => {
      if (context.captureLayouts) context.layouts.push(effect);
      else actual.useLayoutEffect(effect, deps);
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
vi.mock('@tanstack/react-query', async (original) => {
  const actual = await original<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    // SSR supplies the React hook boundary; a live, real observer exercises
    // the production options, queryFn and cache across URL navigation.
    useQuery: (
      options: QueryObserverOptions<LibraryPage>,
      client: QueryClient,
    ) => {
      if (!context.observer) {
        context.observer = new actual.QueryObserver(client, options);
        context.unsubscribe = context.observer.subscribe(() => {});
      } else context.observer.setOptions(options);
      return context.observer.getCurrentResult();
    },
  };
});

const clients: QueryClient[] = [];
function mount(client: QueryClient) {
  let result!: ReturnType<typeof useTrashQuery>;
  function Probe() {
    result = useTrashQuery(client);
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  return result;
}
function client() {
  const value = new QueryClient();
  clients.push(value);
  return value;
}
function key(search: string, page = 1) {
  return [
    'trash',
    parseTrashLocation(new URLSearchParams(search)).filters,
    page,
  ];
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
  trashedAt: '2026-10-01T00:00:00Z',
  deletionStatus: null,
});
const page = (ids: string[]): LibraryPage => ({
  items: ids.map(item),
  total: ids.length,
  nextCursor: null,
  hasMore: false,
});
afterEach(() => {
  context.unsubscribe?.();
  context.observer?.destroy();
  context.unsubscribe = null;
  context.observer = null;
  context.search = '';
  context.captureLayouts = false;
  context.layouts = [];
  clients.splice(0).forEach((value) => value.clear());
  vi.unstubAllGlobals();
});

it('explicit A → B → A filtering reads changed records while Back preserves untouched query history', async () => {
  const queryClient = client();
  const records = new Map([
    ['a', ['a-old']],
    ['b', ['b-old']],
  ]);
  const fetcher = vi.fn((url: string) => {
    const q = new URL(url, 'https://example.test').searchParams.get('q')!;
    return Promise.resolve(Response.json(page(records.get(q)!)));
  });
  vi.stubGlobal('fetch', fetcher);
  queryClient.setQueryData(key('q=unrelated'), page(['untouched']));
  context.search = 'q=a&page=1&pageSize=40';
  await vi.waitFor(() =>
    expect(mount(queryClient).data?.items.map((value) => value.id)).toEqual([
      'a-old',
    ]),
  );
  await mount(queryClient).applyQuery({ q: 'b' });
  const bUrl = context.search;
  await vi.waitFor(() =>
    expect(mount(queryClient).data?.items.map((value) => value.id)).toEqual([
      'b-old',
    ]),
  );
  records.set('a', ['a-new']);
  records.set('b', ['b-new']);
  await mount(queryClient).applyQuery({ q: 'a' });
  await vi.waitFor(() =>
    expect(mount(queryClient).data?.items.map((value) => value.id)).toEqual([
      'a-new',
    ]),
  );
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(queryClient.getQueryData(key('q=unrelated'))).toEqual(
    page(['untouched']),
  );
  context.search = bUrl; // Browser Back publishes the earlier URL without applyQuery.
  expect(mount(queryClient).data?.items.map((value) => value.id)).toEqual([
    'b-old',
  ]);
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it('applying an empty search clears detail identity, resets page and retains the selected page size', async () => {
  const queryClient = client();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(page([]))));
  context.search = 'q=a&page=3&pageSize=80&image=old-detail';
  await mount(queryClient).applyQuery({ q: '' });
  const params = new URLSearchParams(context.search);
  expect(params.has('q')).toBe(false);
  expect(params.has('image')).toBe(false);
  expect(params.get('page')).toBe('1');
  expect(mount(queryClient)).toMatchObject({
    page: 1,
    filters: { scope: 'trash', q: '', pageSize: 80 },
  });
});

it('keeps invalid URL filters visible without requesting a replacement query or clearing other cache', async () => {
  const queryClient = client();
  const cached = page(['untouched']);
  queryClient.setQueryData(key('q=unrelated'), cached);
  queryClient.setQueryData(key('', 2), page([]));
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  context.search = 'page=2&pageSize=40';
  await mount(queryClient).applyQuery({ status: 'invalid' as 'failed' });
  const query = mount(queryClient);
  expect(query.queryError?.message).toBe('回收查询参数无效，请重置查询');
  expect(new URLSearchParams(context.search).get('status')).toBe('invalid');
  expect(query.filters).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
  expect(queryClient.getQueryData(key('q=unrelated'))).toEqual(cached);
});

it.each(['filter', 'page'] as const)(
  'keeps actual old rows visible while a changed %s request is pending, without treating them as the new cache or restoring its scroll',
  async (change) => {
    const queryClient = client();
    context.search = 'q=a&page=1&pageSize=40';
    queryClient.setQueryData(key('q=a'), page(['old-row']));
    let finish!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      ),
    );
    expect(mount(queryClient).data?.items[0]?.id).toBe('old-row');
    if (change === 'filter') await mount(queryClient).applyQuery({ q: 'b' });
    else await mount(queryClient).setPage(2);
    const scrollTo = vi.fn();
    vi.stubGlobal('document', {
      querySelector: () => ({
        scrollTop: 70,
        scrollTo,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
      callback();
      return 1;
    });
    context.captureLayouts = true;
    const pending = mount(queryClient);
    context.layouts.splice(0).forEach((effect) => effect());
    expect(pending).toMatchObject({
      isPending: false,
      isFetching: true,
      isPlaceholderData: true,
    });
    expect(pending.data?.items[0]?.id).toBe('old-row');
    expect(scrollTo).not.toHaveBeenCalled();
    const target = key(
      change === 'filter' ? 'q=b' : 'q=a',
      change === 'page' ? 2 : 1,
    );
    expect(queryClient.getQueryData(target)).toBeUndefined();
    finish(Response.json(page(['new-row'])));
    await vi.waitFor(() => {
      const ready = mount(queryClient);
      expect(ready.isPlaceholderData).toBe(false);
      expect(ready.data?.items[0]?.id).toBe('new-row');
    });
    context.layouts.splice(0).forEach((effect) => effect());
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
    expect(queryClient.getQueryData(target)).toEqual(page(['new-row']));
    expect(queryClient.getQueryData(key('q=a'))).toEqual(page(['old-row']));
  },
);

it('a failed replacement request drops retained old rows and exposes the actual error', async () => {
  const queryClient = client();
  context.search = 'q=a&page=1&pageSize=40';
  queryClient.setQueryData(key('q=a'), page(['old-row']));
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { message: '真实读取失败', code: 'LIBRARY_READ_FAILED' },
          { status: 500 },
        ),
      ),
  );
  mount(queryClient);
  await mount(queryClient).applyQuery({ q: 'b' });
  await vi.waitFor(() => expect(mount(queryClient).isError).toBe(true));
  const failed = mount(queryClient);
  expect(failed.data).toBeUndefined();
  expect(failed.error?.message).toBe('真实读取失败');
  expect(failed.isPlaceholderData).toBe(false);
});
