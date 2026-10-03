import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { parseLibraryLocation } from '../../../src/app/library/query-state';
import { readViewerNeighbors } from '../../../src/components/library/read-viewer-neighbors';
import { parseLibraryQuery } from '../../../src/server/library/query-schema';

const filters = parseLibraryLocation(
  new URLSearchParams('q=photo&tagId=b&tagId=a&sort=size_asc&page=3'),
).filters;
afterEach(() => vi.unstubAllGlobals());

it('reads adjacent IDs in the normalized context without page or cursor', async () => {
  const fetcher = vi.fn().mockResolvedValue(
    Response.json({
      previous: { id: 'previous' },
      next: { id: 'next' },
    }),
  );
  vi.stubGlobal('fetch', fetcher);
  const signal = new AbortController().signal;
  expect(await readViewerNeighbors('a/b', filters, signal)).toEqual({
    previous: 'previous',
    next: 'next',
  });
  const url = new URL(fetcher.mock.calls[0][0], 'https://example.test');
  expect(url.pathname).toBe('/api/images/a%2Fb/neighbors');
  expect(parseLibraryQuery(url.searchParams).filters).toEqual(filters);
  expect(url.searchParams.has('page')).toBe(false);
  expect(url.searchParams.has('cursor')).toBe(false);
  expect(fetcher).toHaveBeenCalledWith(expect.any(String), {
    cache: 'no-store',
    signal,
  });
});

it('preserves first and last boundaries without looping', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json({ previous: null, next: null })),
  );
  expect(
    await readViewerNeighbors('only', filters, new AbortController().signal),
  ).toEqual({ previous: null, next: null });
});

it.each([
  [401, '登录已失效'],
  [404, '图片不存在'],
  [409, '图片已不属于当前查询范围'],
])('retains HTTP %s for explicit recovery', async (status, message) => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json({ message }, { status })),
  );
  await expect(
    readViewerNeighbors('image', filters, new AbortController().signal),
  ).rejects.toMatchObject({ status, message: `${message}（HTTP ${status}）` });
});

it('keeps network failures observable and retains cancellation', async () => {
  const cause = new Error('offline');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(cause));
  await expect(
    readViewerNeighbors('image', filters, new AbortController().signal),
  ).rejects.toMatchObject({
    cause,
    message: expect.stringContaining('连接中断'),
  });
  const controller = new AbortController();
  controller.abort();
  await expect(
    readViewerNeighbors('image', filters, controller.signal),
  ).rejects.toBe(cause);
});

it('isolates canceled and late neighbor responses by current image identity', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  let releaseOld!: (response: Response) => void;
  let oldSignal: AbortSignal | undefined;
  const fetcher = vi.fn((url: string, init: RequestInit) => {
    if (url.includes('/old/')) {
      oldSignal = init.signal as AbortSignal;
      return new Promise<Response>((resolve) => (releaseOld = resolve));
    }
    return Promise.resolve(
      Response.json({ previous: { id: 'current-previous' }, next: null }),
    );
  });
  vi.stubGlobal('fetch', fetcher);
  const options = (imageId: string) => ({
    queryKey: ['viewer-neighbors', imageId, filters],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      readViewerNeighbors(imageId, filters, signal),
  });
  const observer = new QueryObserver(client, options('old'));
  const unsubscribe = observer.subscribe(() => {});
  observer.setOptions(options('current'));
  await vi.waitFor(() =>
    expect(observer.getCurrentResult().data?.previous).toBe('current-previous'),
  );
  expect(oldSignal?.aborted).toBe(true);
  releaseOld(Response.json({ previous: null, next: { id: 'old-next' } }));
  await Promise.resolve();
  expect(observer.getCurrentResult().data).toEqual({
    previous: 'current-previous',
    next: null,
  });
  unsubscribe();
  await vi.waitFor(() =>
    expect(client.getQueryCache().getAll()).toHaveLength(0),
  );
  client.clear();
});

it('keeps a known adjacent window when refreshing the deleted current fails', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ previous: { id: 'before' }, next: { id: 'after' } }),
      )
      .mockResolvedValueOnce(
        Response.json({ message: '图片不存在' }, { status: 404 }),
      ),
  );
  const observer = new QueryObserver(client, {
    queryKey: ['viewer-neighbors', 'image', filters],
    queryFn: ({ signal }) => readViewerNeighbors('image', filters, signal),
  });
  const unsubscribe = observer.subscribe(() => {});
  await vi.waitFor(() =>
    expect(observer.getCurrentResult().isSuccess).toBe(true),
  );
  await observer.refetch();
  expect(observer.getCurrentResult().error).toMatchObject({ status: 404 });
  expect(observer.getCurrentResult().data).toEqual({
    previous: 'before',
    next: 'after',
  });
  unsubscribe();
  client.clear();
});
