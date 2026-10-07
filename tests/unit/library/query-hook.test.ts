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

it('reprocess status is cancelled together with subsequent library mutations', async () => {
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
  const pending = mount(client)
    .onBatchCompleted(
      [{ id: 'a', status: 'failed', inQuery: true, message: '已核对' }],
      { type: 'reprocess', scope: 'all', taskIds: { a: 'task-a' } },
    )
    .catch((error: unknown) => error);
  try {
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    await client.cancelQueries({ queryKey: ['library'] });
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
    expect(
      client.getQueryData<InfiniteData<LibraryPage>>(key)?.pages[0].items[0],
    ).toEqual(item('a'));
  } finally {
    client.clear();
    await pending;
  }
});

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
