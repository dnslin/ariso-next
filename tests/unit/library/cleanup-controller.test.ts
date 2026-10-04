import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { LibraryDetail } from '../../../src/server/library/detail-types';
// A hook scheduler exercises the controller and effect cleanup in Node without
// replacing its request, state-transition or polling implementation. DOM/focus
// and React's actual scheduler remain covered by the real browser suite.
const hooks = vi.hoisted(() => {
  let index = 0;
  let render: () => void;
  let queued = false;
  let mounted = true;
  const cells: unknown[] = [];
  const effects = new Map<number, { deps: unknown[]; cleanup?: () => void }>();
  const pending: (() => void)[] = [];
  function schedule() {
    if (queued || !mounted) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (mounted) render();
    });
  }
  return {
    useState(initial: unknown) {
      const slot = index++;
      if (!(slot in cells))
        cells[slot] = typeof initial === 'function' ? initial() : initial;
      return [
        cells[slot],
        (value: unknown) => {
          cells[slot] =
            typeof value === 'function' ? value(cells[slot]) : value;
          schedule();
        },
      ];
    },
    useRef(initial: unknown) {
      const slot = index++;
      if (!(slot in cells)) cells[slot] = { current: initial };
      return cells[slot];
    },
    useEffectEvent(fn: (...args: unknown[]) => unknown) {
      const slot = index++;
      cells[slot] = fn;
      return (...args: unknown[]) => (cells[slot] as typeof fn)(...args);
    },
    useEffect(fn: () => (() => void) | void, deps: unknown[]) {
      const slot = index++;
      const previous = effects.get(slot);
      if (
        previous &&
        deps.every((value, i) => Object.is(value, previous.deps[i]))
      )
        return;
      pending.push(() => {
        previous?.cleanup?.();
        effects.set(slot, { deps, cleanup: fn() || undefined });
      });
    },
    mount(fn: () => void) {
      mounted = true;
      cells.length = 0;
      effects.clear();
      render = () => {
        index = 0;
        fn();
        pending.splice(0).forEach((run) => run());
      };
      render();
    },
    unmount() {
      mounted = false;
      effects.forEach((effect) => effect.cleanup?.());
    },
  };
});
vi.mock('react', () => hooks);

vi.mock('../../../src/components/library/library-changes', () => ({
  notifyLibraryChanged: vi.fn(),
}));
import { useCleanup } from '../../../src/components/library/use-cleanup';

const record = {
  id: 'image',
  displayName: 'image.jpg',
  trashedAt: '2026-10-01',
  deletionStatus: null,
} as LibraryDetail;
function result(
  status: 'queued' | 'failed' | 'succeeded',
  cycle = 1,
  waitingForWrites = false,
) {
  return Response.json({
    jobId: 'job',
    imageId: 'image',
    status,
    waitingForWrites,
    cycle,
    error: status === 'failed' ? 'AccessDenied' : null,
    finishedAt: null,
    remaining:
      status === 'succeeded'
        ? []
        : [
            {
              objectId: 'o',
              key: 'image.webp',
              purpose: 'watermark',
              status: 'cleanup_failed',
              byteSize: null,
              attempts: 2,
              nextAttemptAt: null,
              error: 'AccessDenied',
            },
          ],
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (fn: () => void) => fn());
});
afterEach(() => {
  hooks.unmount();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function mount(
  deletionStatus: LibraryDetail['deletionStatus'] = null,
  onRefresh = vi.fn().mockResolvedValue(undefined),
  onExpire = vi.fn(),
) {
  let cleanup!: ReturnType<typeof useCleanup>;
  hooks.mount(() => {
    cleanup = useCleanup({
      record: { ...record, deletionStatus },
      onRefresh,
      onExpire,
    });
  });
  return () => cleanup;
}
const flush = () => vi.advanceTimersByTimeAsync(10);
it('reads a lost delete response, preserves the 404 uncertainty and never repeats DELETE', async () => {
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(new Error('connection lost'))
    .mockResolvedValue(
      Response.json(
        { code: 'MEDIA_CLEANUP_NOT_FOUND', message: '永久删除任务不存在' },
        { status: 404 },
      ),
    );
  vi.stubGlobal('fetch', fetch);
  const get = mount();
  get().open();
  await flush();
  await get().submit();
  await flush();
  expect(get()).toMatchObject({
    unknown: true,
    task: null,
    confirmation: false,
  });
  expect(get().error).toContain('HTTP 404');
  await get().submit();
  await flush();
  expect(fetch.mock.calls.map(([, init]) => init.method)).toEqual([
    'DELETE',
    'GET',
  ]);
  await get().check();
  await flush();
  expect(fetch.mock.calls.map(([, init]) => init.method)).toEqual([
    'DELETE',
    'GET',
    'GET',
  ]);
});
it('does not confirm a lost retry using the same already failed cycle', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(result('failed', 2))
    .mockRejectedValueOnce(new Error('connection lost'))
    .mockResolvedValueOnce(result('failed', 2))
    .mockResolvedValueOnce(result('failed', 3));
  vi.stubGlobal('fetch', fetch);
  const get = mount('cleanup_failed');
  get().open();
  await flush();
  await get().retry();
  await flush();
  expect(get()).toMatchObject({
    unknown: true,
    task: { cycle: 2, status: 'failed' },
  });
  await get().retry();
  await flush();
  expect(fetch).toHaveBeenCalledTimes(3);
  await get().check();
  await flush();
  expect(get()).toMatchObject({
    unknown: false,
    error: '',
    task: { cycle: 3, status: 'failed' },
  });
});
it('keeps queued acceptance visible and waits for actual success before showing completion', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(result('queued', 1, true))
      .mockResolvedValueOnce(result('succeeded')),
  );
  const onRefresh = vi.fn().mockResolvedValue(undefined);
  const get = mount(null, onRefresh);
  get().open();
  await flush();
  await get().submit();
  await flush();
  expect(get()).toMatchObject({
    visible: true,
    confirmation: false,
    task: { status: 'queued', waitingForWrites: true },
  });
  await vi.advanceTimersByTimeAsync(1000);
  expect(get()).toMatchObject({
    visible: true,
    task: { status: 'succeeded', waitingForWrites: false },
  });
  expect(onRefresh).toHaveBeenCalledTimes(2);
});
it.each(['close', 'unmount'] as const)(
  'stops a live cleanup read on %s without cancelling or replaying server work',
  async (action) => {
    let signal!: AbortSignal;
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(result('queued'))
      .mockImplementationOnce((_url, init) => {
        signal = init.signal;
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        });
      });
    vi.stubGlobal('fetch', fetch);
    const get = mount();
    get().open();
    await flush();
    await get().submit();
    await flush();
    await vi.advanceTimersByTimeAsync(1000);
    expect(signal.aborted).toBe(false);
    if (action === 'close') get().close();
    else hooks.unmount();
    await flush();
    expect(signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetch).toHaveBeenCalledTimes(2);
  },
);
it('preserves cleanup task facts when a poll fails and exposes a manual read', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(result('queued'))
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(result('succeeded'));
  vi.stubGlobal('fetch', fetch);
  const get = mount();
  get().open();
  await flush();
  await get().submit();
  await flush();
  await vi.advanceTimersByTimeAsync(1000);
  expect(get()).toMatchObject({ task: { status: 'queued' }, error: 'offline' });
  await vi.advanceTimersByTimeAsync(2000);
  expect(fetch).toHaveBeenCalledTimes(2);
  await get().check();
  await flush();
  expect(get().task?.status).toBe('succeeded');
});
