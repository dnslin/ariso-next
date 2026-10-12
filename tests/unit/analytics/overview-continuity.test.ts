import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  overviewQueryOptions,
  type AnalyticsOverview,
  type ReportDays,
} from '../../../src/components/analytics/read-analytics';
import { useAnalyticsOverview } from '../../../src/components/analytics/use-analytics-query';

// The observer uses the real request/cache/cancellation code. This small hook
// scheduler covers retained state in Node; actual DOM identity is tested in E2E.
const hooks = vi.hoisted(() => {
  const cells: unknown[] = [];
  let index = 0;
  return {
    query: undefined as unknown,
    changed: false,
    start() {
      index = 0;
      this.changed = false;
    },
    reset() {
      cells.length = 0;
    },
    useState(initial: unknown) {
      const slot = index++;
      if (!(slot in cells)) cells[slot] = initial;
      return [
        cells[slot],
        (value: unknown) => {
          cells[slot] = value;
          hooks.changed = true;
        },
      ];
    },
  };
});
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: hooks.useState,
  useEffect: () => {},
}));
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof import('@tanstack/react-query')>()),
  useQuery: () => hooks.query,
}));

function report(days: ReportDays, today: number = days): AnalyticsOverview {
  return {
    generatedAt: '2026-10-11T01:35:00.000Z',
    timezone: 'Asia/Shanghai',
    approximate: true,
    lastFlushedAt: null,
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
      normalImages: 1,
      recycledImages: 0,
      initialProcessingFailures: 0,
      reprocessFailures: 0,
      albums: 1,
    },
    range: { days, startDate: '2026-10-05', endDate: '2026-10-11' },
    containsOldTimezone: false,
    today,
    cumulative: { total: 100, original: 100, compressed: 0, watermark: 0 },
    versions: { total: days, original: days, compressed: 0, watermark: 0 },
    trend: [],
    popular: [],
  };
}

let client: QueryClient;
let observer: ReturnType<typeof createObserver>;
let dispose: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  hooks.reset();
  client = new QueryClient();
});
afterEach(() => {
  dispose?.();
  client.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function createObserver(days: ReportDays) {
  return new QueryObserver(client, overviewQueryOptions(days));
}

function observe(days: ReportDays = 7) {
  observer = createObserver(days);
  dispose = observer.subscribe(() => {});
}

function render(days: ReportDays, enabled = true) {
  hooks.query = observer.getCurrentResult();
  let value!: ReturnType<typeof useAnalyticsOverview>;
  function Probe() {
    return useAnalyticsOverview(client, days, enabled);
  }
  do {
    hooks.start();
    value = Probe();
  } while (hooks.changed);
  return value;
}

it('retains a complete last-success report through new-period pending, error and retry without caching it under that period', async () => {
  let release!: (value: Response) => void;
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json(report(7)))
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    )
    .mockResolvedValueOnce(Response.json(report(30)));
  vi.stubGlobal('fetch', fetcher);
  observe();
  expect(render(7).data).toBeUndefined();
  await vi.advanceTimersByTimeAsync(0);
  const last = render(7).data;
  expect(last?.range.days).toBe(7);
  observer.setOptions(overviewQueryOptions(30));
  expect(render(30)).toMatchObject({ data: last, isFetching: true });
  expect(
    client.getQueryData(overviewQueryOptions(30).queryKey),
  ).toBeUndefined();
  release(Response.json({ message: '数据库读取失败' }, { status: 500 }));
  await vi.advanceTimersByTimeAsync(0);
  const failed = render(30);
  expect(failed.data).toBe(last);
  expect(failed.error).toMatchObject({
    status: 500,
    message: '数据库读取失败',
  });
  expect(failed.isFetching).toBe(false);
  expect(
    client.getQueryData(overviewQueryOptions(30).queryKey),
  ).toBeUndefined();
  await failed.refetch();
  expect(render(30).data?.range.days).toBe(30);
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
    '/api/analytics/overview?days=7',
    '/api/analytics/overview?days=30',
    '/api/analytics/overview?days=30',
  ]);
});

it('keeps the latest 90-day display after a cancelled 30-day response returns late', async () => {
  let release!: (value: Response) => void;
  const fetcher = vi.fn().mockImplementation((url: string) =>
    url.endsWith('=30')
      ? new Promise<Response>((resolve) => {
          release = resolve;
        })
      : Promise.resolve(Response.json(report(url.endsWith('=90') ? 90 : 7))),
  );
  vi.stubGlobal('fetch', fetcher);
  observe();
  await vi.advanceTimersByTimeAsync(0);
  expect(render(7).data?.range.days).toBe(7);
  observer.setOptions(overviewQueryOptions(30));
  expect(render(30).data?.range.days).toBe(7);
  observer.setOptions(overviewQueryOptions(90));
  expect(render(90).data?.range.days).toBe(7);
  expect(fetcher.mock.calls[1][1].signal.aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(0);
  const latest = render(90).data;
  expect(latest?.range.days).toBe(90);
  release(Response.json(report(30, 999)));
  await vi.advanceTimersByTimeAsync(0);
  expect(render(90).data).toBe(latest);
  expect(
    client.getQueryData(overviewQueryOptions(30).queryKey),
  ).toBeUndefined();
});

it.each(['unauthorized', 'session-ended'] as const)(
  'clears retained numbers immediately when %s and never restores them after cache clearing',
  async (reason) => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ message: '会话已失效' }, { status: 401 }),
        ),
    );
    client.setQueryData(overviewQueryOptions(7).queryKey, report(7));
    observe();
    expect(render(7).data?.range.days).toBe(7);
    if (reason === 'unauthorized') {
      await vi.advanceTimersByTimeAsync(0);
      expect(render(7).error).toMatchObject({ status: 401 });
      expect(render(7).data).toBeUndefined();
    } else {
      expect(render(7, false).data).toBeUndefined();
    }
    observer.setOptions(overviewQueryOptions(7, false));
    client.clear();
    expect(render(7, false).data).toBeUndefined();
    observer.setOptions(overviewQueryOptions(30));
    expect(render(30).data).toBeUndefined();
  },
);

it('does not invent previous results when the first requested period fails', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ message: '连接中断' }, { status: 500 }),
      ),
  );
  observe(90);
  expect(render(90).data).toBeUndefined();
  await vi.advanceTimersByTimeAsync(0);
  expect(render(90)).toMatchObject({ data: undefined, isError: true });
  observer.setOptions(overviewQueryOptions(30));
  expect(render(30).data).toBeUndefined();
});
