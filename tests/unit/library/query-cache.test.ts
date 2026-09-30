import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import {
  libraryListKey,
  parseLibraryLocation,
} from '../../../src/app/library/query-state';
import {
  readLibraryResult,
  LibraryReadError,
} from '../../../src/app/library/use-library-query';
import type { LibraryPage } from '../../../src/server/library/types';

const filters = (q: string) =>
  parseLibraryLocation(new URLSearchParams({ q })).filters;
const result = (total: number): LibraryPage => ({
  items: [],
  total,
  hasMore: false,
  nextCursor: null,
});
afterEach(() => vi.unstubAllGlobals());

it('a late response from the previous query cannot replace the current page', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  let releaseOld!: (response: Response) => void;
  let oldSignal: AbortSignal | undefined;
  const fetcher = vi.fn((url: string, init: RequestInit) => {
    if (url.includes('q=old')) {
      oldSignal = init.signal as AbortSignal;
      return new Promise<Response>((resolve) => {
        releaseOld = resolve;
      });
    }
    return Promise.resolve(Response.json(result(2)));
  });
  vi.stubGlobal('fetch', fetcher);
  const options = (q: string, page = 1) => ({
    queryKey: libraryListKey(filters(q), 'pages', page),
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      readLibraryResult(filters(q), { page }, signal),
    staleTime: Infinity,
  });
  const observer = new QueryObserver(client, options('old'));
  const values: number[] = [];
  const unsubscribe = observer.subscribe((value) => {
    if (value.data) values.push(value.data.total);
  });
  observer.setOptions(options('new'));
  await vi.waitFor(() =>
    expect(observer.getCurrentResult().data?.total).toBe(2),
  );
  expect(oldSignal?.aborted).toBe(true);
  releaseOld(Response.json(result(1)));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(observer.getCurrentResult().data?.total).toBe(2);
  expect(values).not.toContain(1);
  // Returning to a still-cached page does not repeat a request.
  observer.setOptions(options('new', 2));
  await vi.waitFor(() =>
    expect(observer.getCurrentResult().isSuccess).toBe(true),
  );
  const requestCount = fetcher.mock.calls.length;
  observer.setOptions(options('new', 1));
  expect(observer.getCurrentResult().data?.total).toBe(2);
  expect(fetcher).toHaveBeenCalledTimes(requestCount);
  unsubscribe();
  client.clear();
});

it('keeps expired-reference and cursor failures explicit for recovery', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      Response.json(
        {
          code: 'LIBRARY_INVALID_QUERY',
          message: '加载位置无效，请从首批重新加载',
        },
        { status: 400 },
      ),
    ),
  );
  await expect(
    readLibraryResult(
      filters('photo'),
      { cursor: 'old' },
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({
    status: 400,
    code: 'LIBRARY_INVALID_QUERY',
    message: '加载位置无效，请从首批重新加载',
  });
  expect(
    new LibraryReadError('失效筛选', 409, 'LIBRARY_FILTER_NOT_FOUND').message,
  ).toBe('失效筛选');
});

it('retains request context on network failure and consumes cancellation', async () => {
  const network = new Error('connection refused');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(network));
  await expect(
    readLibraryResult(filters('photo'), {}, new AbortController().signal),
  ).rejects.toMatchObject({ cause: network });
  const controller = new AbortController();
  controller.abort();
  await expect(
    readLibraryResult(filters('photo'), {}, controller.signal),
  ).rejects.toBe(network);
});
