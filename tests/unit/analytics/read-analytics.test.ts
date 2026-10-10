import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  QueryClient,
  QueryObserver,
  environmentManager,
  focusManager,
} from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  overviewQueryOptions,
  usageQueryOptions,
  imageStatsQueryOptions,
  readAnalyticsOverview,
  readAnalyticsUsage,
  readAnalyticsImage,
  type AnalyticsOverview,
  type ReportDays,
} from '../../../src/components/analytics/read-analytics';
import { useAnalyticsOverview } from '../../../src/components/analytics/use-analytics-query';

const clients: QueryClient[] = [];
const disposers: (() => void)[] = [];
const visibility = { visibilityState: 'visible' };
let browser: EventTarget;

beforeEach(() => {
  vi.useFakeTimers();
  environmentManager.setIsServer(() => false);
  browser = new EventTarget();
  visibility.visibilityState = 'visible';
  vi.stubGlobal('window', browser);
  vi.stubGlobal('document', visibility);
  focusManager.setFocused(undefined);
});

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  for (const client of clients.splice(0)) {
    client.unmount();
    client.clear();
  }
  environmentManager.setIsServer(() => true);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function client() {
  const value = new QueryClient();
  value.mount();
  clients.push(value);
  return value;
}

function setVisibility(value: 'visible' | 'hidden') {
  visibility.visibilityState = value;
  browser.dispatchEvent(new Event('visibilitychange'));
}

function overview(days: ReportDays, total: number = days): AnalyticsOverview {
  return {
    generatedAt: '2026-10-09T00:00:00.000Z',
    timezone: 'Asia/Shanghai',
    lastFlushedAt: null,
    approximate: true,
    health: {
      accepted: 0,
      flushed: 0,
      dropped: 0,
      incomplete: false,
      pendingKeys: 0,
      pendingEvents: 0,
      lastFlushedAt: null,
      lastError: null,
      nextRetryAt: 0,
      status: 'idle',
    },
    counts: {
      normalImages: 0,
      recycledImages: 0,
      initialProcessingFailures: 0,
      reprocessFailures: 0,
      albums: 0,
    },
    range: { days, startDate: '2026-10-03', endDate: '2026-10-09' },
    containsOldTimezone: false,
    today: total,
    cumulative: { total, original: total, compressed: 0, watermark: 0 },
    versions: { total, original: total, compressed: 0, watermark: 0 },
    trend: [],
    popular: [],
  };
}

it('reads all three owner endpoints without caching and forwards cancellation', async () => {
  const data = { generatedAt: '2026-10-09T00:00:00.000Z' };
  const fetcher = vi
    .fn()
    .mockImplementation(() => Promise.resolve(Response.json(data)));
  vi.stubGlobal('fetch', fetcher);
  const signal = new AbortController().signal;
  expect(await readAnalyticsOverview(30, signal)).toEqual(data);
  expect(await readAnalyticsUsage(signal)).toEqual(data);
  expect(await readAnalyticsImage('image/one', signal)).toEqual(data);
  expect(fetcher.mock.calls).toEqual([
    ['/api/analytics/overview?days=30', { signal, cache: 'no-store' }],
    ['/api/analytics/usage', { signal, cache: 'no-store' }],
    ['/api/analytics/images/image%2Fone', { signal, cache: 'no-store' }],
  ]);
});

it.each([401, 404, 500])(
  'preserves HTTP %s and the server diagnosis',
  async (status) => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { code: 'READ_ERROR', message: '读取失败' },
            { status },
          ),
        ),
    );
    await expect(
      readAnalyticsUsage(new AbortController().signal),
    ).rejects.toMatchObject({
      status,
      code: 'READ_ERROR',
      message: '读取失败',
    });
  },
);

it('preserves status and parse cause for a non-JSON HTTP failure', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('Bad gateway', { status: 502 })),
  );
  await expect(
    readAnalyticsUsage(new AbortController().signal),
  ).rejects.toMatchObject({
    status: 502,
    code: 'ANALYTICS_READ_FAILED',
    cause: expect.any(SyntaxError),
  });
});

it('preserves network cause and propagates cancellation unchanged', async () => {
  const failure = new Error('socket closed');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(failure));
  await expect(
    readAnalyticsUsage(new AbortController().signal),
  ).rejects.toMatchObject({ cause: failure });
  const controller = new AbortController();
  controller.abort();
  await expect(readAnalyticsUsage(controller.signal)).rejects.toBe(failure);
});

it('polls visible pages every ten seconds, pauses hidden pages, and fetches immediately on visibility restore', async () => {
  const fetcher = vi
    .fn()
    .mockImplementation(() => Promise.resolve(Response.json(overview(7))));
  vi.stubGlobal('fetch', fetcher);
  const observer = new QueryObserver(client(), overviewQueryOptions(7));
  disposers.push(observer.subscribe(() => {}));
  await vi.advanceTimersByTimeAsync(0);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(9_999);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(fetcher).toHaveBeenCalledTimes(2);
  setVisibility('hidden');
  await vi.advanceTimersByTimeAsync(30_000);
  expect(fetcher).toHaveBeenCalledTimes(2);
  setVisibility('visible');
  await vi.advanceTimersByTimeAsync(0);
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it('shares in-flight requests across observers, poll ticks and restored visibility without aborting', async () => {
  let release!: (response: Response) => void;
  const fetcher = vi.fn().mockImplementation(
    () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
  );
  vi.stubGlobal('fetch', fetcher);
  const sharedClient = client();
  sharedClient.setQueryData(overviewQueryOptions(7).queryKey, overview(7, 1));
  const first = new QueryObserver(sharedClient, overviewQueryOptions(7));
  const second = new QueryObserver(sharedClient, overviewQueryOptions(7));
  disposers.push(
    first.subscribe(() => {}),
    second.subscribe(() => {}),
  );
  await vi.advanceTimersByTimeAsync(30_000);
  setVisibility('hidden');
  setVisibility('visible');
  await vi.advanceTimersByTimeAsync(0);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][1].signal.aborted).toBe(false);
  expect(first.getCurrentResult().data?.today).toBe(1);
  release(Response.json(overview(7, 100)));
  await vi.advanceTimersByTimeAsync(0);
  expect(first.getCurrentResult().data?.today).toBe(100);
  expect(second.getCurrentResult().data?.today).toBe(100);
});

it('switching periods aborts the old query and never labels its late response as the new period', async () => {
  let releaseOld!: (response: Response) => void;
  const fetcher = vi.fn().mockImplementation((url: string) =>
    url.endsWith('=7')
      ? new Promise<Response>((resolve) => {
          releaseOld = resolve;
        })
      : Promise.resolve(Response.json(overview(30))),
  );
  vi.stubGlobal('fetch', fetcher);
  const observer = new QueryObserver(client(), overviewQueryOptions(7));
  disposers.push(observer.subscribe(() => {}));
  observer.setOptions(overviewQueryOptions(30));
  expect(observer.getCurrentResult().data).toBeUndefined();
  expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(0);
  releaseOld(Response.json(overview(7)));
  await vi.advanceTimersByTimeAsync(0);
  expect(observer.getCurrentResult().data?.range.days).toBe(30);
});

it('retains same-period data and its original read time after refresh failure but exposes a new-period failure without old numbers', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json(overview(7)))
    .mockImplementation(() =>
      Promise.resolve(
        Response.json({ message: '数据库读取失败' }, { status: 500 }),
      ),
    );
  vi.stubGlobal('fetch', fetcher);
  const observer = new QueryObserver(client(), overviewQueryOptions(7));
  disposers.push(observer.subscribe(() => {}));
  await vi.advanceTimersByTimeAsync(0);
  const updatedAt = observer.getCurrentResult().dataUpdatedAt;
  await vi.advanceTimersByTimeAsync(10_000);
  expect(observer.getCurrentResult()).toMatchObject({
    isError: true,
    dataUpdatedAt: updatedAt,
    data: { range: { days: 7 } },
    error: { status: 500 },
  });
  observer.setOptions(overviewQueryOptions(90));
  expect(observer.getCurrentResult().data).toBeUndefined();
  await vi.advanceTimersByTimeAsync(0);
  expect(observer.getCurrentResult()).toMatchObject({
    isError: true,
    data: undefined,
  });
});

it('clearing the shared client aborts active image reads and prevents late data restoring the cache', async () => {
  let release!: (response: Response) => void;
  const fetcher = vi.fn().mockImplementation(
    () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
  );
  vi.stubGlobal('fetch', fetcher);
  const sharedClient = client();
  const observer = new QueryObserver(
    sharedClient,
    imageStatsQueryOptions('image-one'),
  );
  disposers.push(observer.subscribe(() => {}));
  sharedClient.clear();
  expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  release(Response.json({ imageId: 'image-one' }));
  await vi.advanceTimersByTimeAsync(0);
  expect(
    sharedClient.getQueryData(imageStatsQueryOptions('image-one').queryKey),
  ).toBeUndefined();
});

it('does not request single-image statistics until a detail is open', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const observer = new QueryObserver(client(), imageStatsQueryOptions(null));
  disposers.push(observer.subscribe(() => {}));
  await vi.advanceTimersByTimeAsync(30_000);
  setVisibility('hidden');
  setVisibility('visible');
  await vi.advanceTimersByTimeAsync(0);
  expect(fetcher).not.toHaveBeenCalled();
  expect(usageQueryOptions().queryKey).toEqual(['analytics', 'usage']);
});

it('ending a session disables every observer before clearing, so hidden/visible ticks cannot restart reads and late responses cannot repopulate cache', async () => {
  let releaseUsage!: (response: Response) => void;
  const fetcher = vi.fn().mockImplementation((url: string) =>
    url.includes('/overview')
      ? Promise.resolve(
          Response.json(
            { code: 'UNAUTHORIZED', message: '会话已失效' },
            { status: 401 },
          ),
        )
      : new Promise<Response>((resolve) => {
          releaseUsage = resolve;
        }),
  );
  vi.stubGlobal('fetch', fetcher);
  const sharedClient = client();
  const overviewObserver = new QueryObserver(
    sharedClient,
    overviewQueryOptions(7),
  );
  const usageObserver = new QueryObserver(sharedClient, usageQueryOptions());
  disposers.push(
    overviewObserver.subscribe(() => {}),
    usageObserver.subscribe(() => {}),
  );
  await vi.advanceTimersByTimeAsync(0);
  expect(overviewObserver.getCurrentResult().error).toMatchObject({
    status: 401,
  });
  overviewObserver.setOptions(overviewQueryOptions(7, false));
  usageObserver.setOptions(usageQueryOptions(false));
  sharedClient.clear();
  expect(fetcher.mock.calls[1][1].signal.aborted).toBe(true);
  setVisibility('hidden');
  await vi.advanceTimersByTimeAsync(30_000);
  setVisibility('visible');
  await vi.advanceTimersByTimeAsync(0);
  expect(fetcher).toHaveBeenCalledTimes(2);
  releaseUsage(
    Response.json({ generatedAt: '2026-10-09T00:00:00.000Z', storages: [] }),
  );
  await vi.advanceTimersByTimeAsync(30_000);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(sharedClient.getQueryCache().getAll()).toEqual([]);
  expect(imageStatsQueryOptions('image-one', false).enabled).toBe(false);
});

it('manual hook refreshes join the current refresh even when the caller asks to cancel it', async () => {
  let release!: (response: Response) => void;
  const fetcher = vi.fn().mockImplementation(
    () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
  );
  vi.stubGlobal('fetch', fetcher);
  const sharedClient = client();
  sharedClient.setQueryData(overviewQueryOptions(7).queryKey, overview(7));
  let query!: ReturnType<typeof useAnalyticsOverview>;
  function Probe() {
    query = useAnalyticsOverview(sharedClient, 7);
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  const first = query.refetch();
  const second = query.refetch({ cancelRefetch: true });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][1].signal.aborted).toBe(false);
  release(Response.json(overview(7, 100)));
  expect((await first).data?.today).toBe(100);
  expect((await second).data?.today).toBe(100);
});
