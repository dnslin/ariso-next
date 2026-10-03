import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { LibrarySelection } from '../../../src/app/library/use-library-selection';
import type { SelectedLibraryItem } from '../../../src/server/library/selection-types';

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
vi.mock('@heroui/react/toast', () => ({ toast: { success: vi.fn() } }));
import { useBatchReprocess } from '../../../src/components/library/use-batch-reprocess';

function selection(ids = ['image']): LibrarySelection {
  const selected = new Map(
    ids.map((id) => [
      id,
      {
        id,
        displayName: id,
        processingStatus: 'ready',
        thumbnailUrl: null,
        storage: { id: 'local', name: '本地', enabled: true },
      } satisfies SelectedLibraryItem,
    ]),
  );
  return {
    selected,
    currentIds: new Set(ids),
    currentCount: ids.length,
    otherCount: 0,
    remove: (id) => {
      selected.delete(id);
    },
    recordFailure: vi.fn(),
    clear: () => selected.clear(),
    reconcile: vi.fn(),
    toggle: vi.fn(),
    selectIds: vi.fn(),
    selectCurrent: vi.fn(),
    deselectCurrent: vi.fn(),
  };
}
function response(status: 'running' | 'succeeded', taskId: string) {
  return Response.json({
    results: [
      {
        id: 'image',
        inQuery: true,
        status: 'accepted',
        message: '任务已受理',
        taskId,
        task: {
          id: taskId,
          scope: 'all',
          status,
          step: null,
          error: null,
          expectedVersions: ['thumbnail'],
          generatedVersions: ['thumbnail'],
        },
      },
    ],
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (fn: () => void) => fn());
  vi.stubGlobal('document', { querySelector: () => null });
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
});
afterEach(() => {
  hooks.unmount();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('retains a terminal list-refresh failure after polling cleanup and retries the list itself', async () => {
  const selected = selection();
  let rejectRefresh!: (error: Error) => void;
  const onRefresh = vi
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectRefresh = reject;
        }),
    )
    .mockResolvedValueOnce(undefined);
  let taskId = '';
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init) => {
      const request = JSON.parse(init.body);
      taskId = request.command.taskIds.image;
      return response(
        request.mode === 'apply' ? 'running' : 'succeeded',
        taskId,
      );
    }),
  );
  let batch!: ReturnType<typeof useBatchReprocess>;
  hooks.mount(() => {
    batch = useBatchReprocess({
      selection: selected,
      query: '',
      onExpire: vi.fn(),
      onRefresh,
    });
  });
  batch.open({ isConnected: false } as HTMLElement);
  await vi.advanceTimersByTimeAsync(0);
  batch.submit();
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(1010);
  expect(batch.workspace?.rows[0].outcome).toMatchObject({
    state: 'accepted',
    result: { task: { status: 'succeeded' } },
  });
  rejectRefresh(new Error('列表暂时离线'));
  await vi.advanceTimersByTimeAsync(0);
  expect(batch).toMatchObject({
    progressError: '',
    refreshError: '列表暂时离线',
  });
  batch.retryRefresh();
  await vi.advanceTimersByTimeAsync(0);
  expect(onRefresh).toHaveBeenCalledTimes(3);
  expect(batch).toMatchObject({ refreshError: '' });
});

function mountBatch(selected: LibrarySelection) {
  let batch!: ReturnType<typeof useBatchReprocess>;
  hooks.mount(() => {
    batch = useBatchReprocess({
      selection: selected,
      query: 'scope=normal',
      onExpire: vi.fn(),
      onRefresh: async () => {},
    });
  });
  return () => batch;
}
const flush = () => vi.advanceTimersByTimeAsync(10);
function accepted(
  request: {
    ids: string[];
    command: { scope: string; taskIds: Record<string, string> };
  },
  status = 'failed',
) {
  return Response.json({
    results: request.ids.map((id) => ({
      id,
      status: 'accepted',
      inQuery: true,
      message: '任务已受理',
      taskId: request.command.taskIds[id],
      task: {
        id: request.command.taskIds[id],
        scope: request.command.scope,
        status,
        step: null,
        error: status === 'failed' ? '处理失败' : null,
        expectedVersions: ['thumbnail'],
        generatedVersions: [],
      },
    })),
  });
}
it('keeps failed task attempts in their own scopes after another item explicitly retries all derived files', async () => {
  const requests: {
    ids: string[];
    command: { scope: string; taskIds: Record<string, string> };
  }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init) => {
      const request = JSON.parse(init.body);
      requests.push(request);
      if (requests.length === 1) {
        const response = await accepted({
          ...request,
          ids: ['watermark'],
        }).json();
        return Response.json({
          results: [
            ...response.results,
            {
              id: 'first',
              status: 'failed',
              inQuery: true,
              message: '首次失败仅支持全部派生',
            },
          ],
        });
      }
      return accepted(request);
    }),
  );
  const get = mountBatch(selection(['watermark', 'first']));
  get().open({ isConnected: false } as HTMLElement);
  await flush();
  get().choose('watermark');
  await flush();
  get().submit();
  await flush();
  const originalWatermark = get().workspace!.rows[0].attempt;
  get().retryFailuresAll();
  await flush();
  expect(get().workspace!.rows[0].attempt).toEqual(originalWatermark);
  expect(get().workspace!.rows[1].attempt.scope).toBe('all');
  get().retryTasks('watermark');
  await flush();
  expect(requests[2].ids).toEqual(['watermark']);
  expect(requests[2].command.scope).toBe('watermark');
  expect(requests[2].command.taskIds.watermark).not.toBe(
    originalWatermark.taskId,
  );
  expect(get().workspace!.rows[1].attempt.scope).toBe('all');
});
it('checks a lost first chunk by its original task IDs and continues only the 201st unsent item after an explicit click', async () => {
  const requests: {
    ids: string[];
    mode: string;
    command: { scope: string; taskIds: Record<string, string> };
  }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init) => {
      const request = JSON.parse(init.body);
      requests.push(request);
      if (requests.length === 1) throw new Error('lost response');
      return accepted(request, 'succeeded');
    }),
  );
  const get = mountBatch(
    selection(Array.from({ length: 201 }, (_, index) => `image-${index}`)),
  );
  get().open({ isConnected: false } as HTMLElement);
  await flush();
  get().choose('watermark');
  await flush();
  get().submit();
  await flush();
  expect(requests).toHaveLength(1);
  expect(get().unknownIds).toHaveLength(200);
  expect(get().unsentIds).toEqual(['image-200']);
  const lastAttempt = get().workspace!.rows[200].attempt;
  get().retryFailuresAll();
  await flush();
  expect(requests).toHaveLength(1);
  get().check();
  await flush();
  expect(requests[1].mode).toBe('check');
  expect(requests[1].command).toEqual(requests[0].command);
  expect(get().unknownIds).toEqual([]);
  expect(get().unsentIds).toEqual(['image-200']);
  await vi.advanceTimersByTimeAsync(1500);
  expect(requests).toHaveLength(2);
  get().retry();
  await flush();
  expect(requests[2]).toMatchObject({
    ids: ['image-200'],
    mode: 'apply',
    command: {
      scope: 'watermark',
      taskIds: { 'image-200': lastAttempt.taskId },
    },
  });
  expect(get().unsentIds).toEqual([]);
});
it('preserves the last known running task on a progress-read failure and only rereads on request', async () => {
  let count = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init) => {
      const request = JSON.parse(init.body);
      count++;
      if (count === 2) throw new Error('offline');
      return accepted(request, count === 1 ? 'running' : 'succeeded');
    }),
  );
  const get = mountBatch(selection());
  get().open({ isConnected: false } as HTMLElement);
  await flush();
  get().submit();
  await flush();
  const attempt = get().workspace!.rows[0].attempt;
  await vi.advanceTimersByTimeAsync(1010);
  expect(get().progressError).not.toBe('');
  expect(get().workspace!.rows[0]).toMatchObject({
    attempt,
    outcome: { state: 'accepted', result: { task: { status: 'running' } } },
  });
  await vi.advanceTimersByTimeAsync(2000);
  expect(count).toBe(2);
  get().checkProgress();
  await flush();
  await vi.advanceTimersByTimeAsync(1010);
  expect(count).toBe(3);
  expect(get().workspace!.rows[0]).toMatchObject({
    attempt,
    outcome: { state: 'accepted', result: { task: { status: 'succeeded' } } },
  });
});
it.each(['close', 'unmount'] as const)(
  'aborts a live progress read on %s without resubmitting or cancelling server work',
  async (action) => {
    let count = 0;
    let signal!: AbortSignal;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init) => {
        count++;
        if (count === 1) return accepted(JSON.parse(init.body), 'running');
        signal = init.signal;
        return new Promise<Response>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        });
      }),
    );
    const get = mountBatch(selection());
    get().open({ isConnected: false } as HTMLElement);
    await flush();
    get().submit();
    await flush();
    await vi.advanceTimersByTimeAsync(1010);
    expect(signal.aborted).toBe(false);
    if (action === 'close') get().close();
    else hooks.unmount();
    await flush();
    expect(signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(count).toBe(2);
  },
);
