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
import { useTrashBatch } from '../../../src/components/library/use-trash-batch';
import { useLibraryBatch } from '../../../src/components/library/use-library-batch';
import { toast } from '@heroui/react/toast';

function selection(ids = ['image']): LibrarySelection {
  const selected = new Map(
    ids.map((id) => [
      id,
      {
        id,
        displayName: id,
        visibility: 'private',
        hasAlbums: false,
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
    clearFailure: vi.fn(),
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
  vi.mocked(toast.success).mockClear();
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (fn: () => void) => setTimeout(fn, 0));
  vi.stubGlobal('cancelAnimationFrame', (id: ReturnType<typeof setTimeout>) =>
    clearTimeout(id),
  );
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

it('freezes only the images that need a visibility change and retains valid selection after success', async () => {
  const selected = selection(['already-public', 'needs-change']);
  selected.selected.set('already-public', {
    ...selected.selected.get('already-public')!,
    visibility: 'public',
  });
  const requests: { ids: string[]; command: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);
      requests.push(body);
      return Response.json({
        results: body.ids.map((id: string) => ({
          id,
          status: 'changed',
          message: '已公开',
          inQuery: true,
        })),
      });
    }),
  );
  let batch!: ReturnType<typeof useLibraryBatch>;
  hooks.mount(() => {
    batch = useLibraryBatch({
      selection: selected,
      query: 'scope=normal',
      onExpire: vi.fn(),
      onRefresh: async () => {},
    });
  });
  batch.open('public', { isConnected: false } as HTMLElement);
  await flush();
  expect(batch.workspace?.items.map((item) => item.id)).toEqual([
    'needs-change',
  ]);
  expect(batch.workspace?.currentCount).toBe(1);
  batch.submit();
  await flush();
  expect(requests).toEqual([
    {
      ids: ['needs-change'],
      query: 'scope=normal',
      command: { type: 'visibility', visibility: 'public' },
      mode: 'apply',
    },
  ]);
  expect([...selected.selected.keys()]).toEqual([
    'already-public',
    'needs-change',
  ]);
  expect(batch.visible).toBe(false);
  expect(selected.clearFailure).toHaveBeenCalledWith('needs-change');
});

it('limits album-context removal to the current album and retains failed or unknown items', async () => {
  const selected = selection(['removed', 'failed', 'unknown']);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        results: [
          {
            id: 'removed',
            status: 'changed',
            inQuery: false,
            message: '已移出',
          },
          {
            id: 'failed',
            status: 'failed',
            inQuery: true,
            message: '保存失败',
          },
          {
            id: 'unknown',
            status: 'unknown',
            inQuery: true,
            message: '待核对',
          },
        ],
      }),
    ),
  );
  let batch!: ReturnType<typeof useLibraryBatch>;
  hooks.mount(() => {
    batch = useLibraryBatch({
      selection: selected,
      query: 'scope=album&albumId=current',
      currentAlbumId: 'current',
      onExpire: vi.fn(),
      onRefresh: async () => {},
    });
  });
  batch.open('remove-albums', { isConnected: false } as HTMLElement);
  await flush();
  expect(batch.workspace).toMatchObject({
    phase: 'confirm',
    command: { type: 'remove-albums', albumIds: ['current'] },
  });
  batch.submit();
  await flush();
  expect([...selected.selected.keys()]).toEqual(['failed', 'unknown']);
  expect(selected.recordFailure).toHaveBeenCalledWith('failed', '保存失败');
  expect(batch.workspace?.unknownIds).toEqual(['unknown']);
  expect(batch.unresolved).toBe(true);
  expect(batch.visible).toBe(true);
});

it.each(['trash', 'restore'] as const)(
  'closes completed %s with Toast after refreshing instead of showing a result workspace',
  async (action) => {
    const selected = selection(['one']);
    const refresh = vi.fn(async () => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          results: [
            { id: 'one', status: 'changed', inQuery: false, message: '完成' },
          ],
        }),
      ),
    );
    let batch!: ReturnType<typeof useLibraryBatch>;
    hooks.mount(() => {
      batch = useLibraryBatch({
        selection: selected,
        query: '',
        onExpire: vi.fn(),
        onRefresh: refresh,
      });
    });
    batch.open(action, { isConnected: false } as HTMLElement);
    await flush();
    expect(batch.workspace?.phase).toBe('confirm');
    batch.submit();
    await flush();
    expect(refresh).toHaveBeenCalledOnce();
    expect(batch.visible).toBe(false);
    expect(batch.workspace).toBeNull();
    expect(selected.selected.size).toBe(0);
    expect(toast.success).toHaveBeenCalledWith(
      action === 'trash' ? '图片已移入回收站' : '图片已恢复',
      {
        description:
          action === 'trash'
            ? '1张已回收 · 0张无需修改'
            : '1张已恢复 · 0张无需修改',
      },
    );
  },
);

it('keeps failed recycle items selected in a recoverable result without a success Toast', async () => {
  const selected = selection(['done', 'failed']);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        results: [
          { id: 'done', status: 'changed', inQuery: false, message: '完成' },
          { id: 'failed', status: 'failed', inQuery: true, message: '失败' },
        ],
      }),
    ),
  );
  let batch!: ReturnType<typeof useLibraryBatch>;
  hooks.mount(() => {
    batch = useLibraryBatch({
      selection: selected,
      query: '',
      onExpire: vi.fn(),
      onRefresh: async () => {},
    });
  });
  batch.open('trash', { isConnected: false } as HTMLElement);
  await flush();
  batch.submit();
  await flush();
  expect(batch.visible).toBe(true);
  expect(batch.workspace?.phase).toBe('result');
  expect([...selected.selected.keys()]).toEqual(['failed']);
  expect(batch.failedIds).toEqual(['failed']);
  expect(toast.success).not.toHaveBeenCalled();
});

function watchFocusSource() {
  let disabled = true;
  const source = {
    isConnected: true,
    matches: vi.fn(() => disabled),
    focus: vi.fn(),
  } as unknown as HTMLElement;
  const observers: {
    deliver: () => void;
    observe: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }[] = [];
  vi.stubGlobal(
    'MutationObserver',
    class {
      observe = vi.fn();
      disconnect = vi.fn(() => {
        this.connected = false;
      });
      connected = true;
      constructor(callback: () => void) {
        observers.push({
          observe: this.observe,
          disconnect: this.disconnect,
          deliver: () => {
            if (this.connected) callback();
          },
        });
      }
    },
  );
  return {
    source,
    observers,
    enable() {
      disabled = false;
      observers.forEach((observer) => observer.deliver());
    },
  };
}

function mountLibraryBatch() {
  let batch!: ReturnType<typeof useLibraryBatch>;
  hooks.mount(() => {
    batch = useLibraryBatch({
      selection: selection(),
      query: 'scope=normal',
      onExpire: vi.fn(),
      onRefresh: async () => {},
    });
  });
  return () => batch;
}

it.each([false, true])(
  'restores the source only after selection reconciliation enables it following tag success (retried=%s)',
  async (retry) => {
    const focus = watchFocusSource();
    let requests = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          results: [
            {
              id: 'image',
              status: retry && requests++ === 0 ? 'failed' : 'changed',
              inQuery: true,
              message: '标签结果',
            },
          ],
        }),
      ),
    );
    const get = mountLibraryBatch();
    get().open('add-tags', focus.source);
    await flush();
    get().choose({ type: 'add-tags', tagIds: ['tag'] });
    await flush();
    get().submit();
    await flush();
    if (retry) {
      expect(get().failedIds).toEqual(['image']);
      get().retry();
      await flush();
    }
    expect(get()).toMatchObject({
      visible: false,
      pending: false,
      workspace: null,
    });
    expect(toast.success).toHaveBeenCalledOnce();
    expect(focus.source.focus).not.toHaveBeenCalled();
    expect(focus.observers).toHaveLength(1);
    expect(focus.observers[0].observe).toHaveBeenCalledWith(focus.source, {
      attributes: true,
      attributeFilter: ['disabled'],
    });
    focus.enable();
    expect(focus.source.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(focus.observers[0].disconnect).toHaveBeenCalledOnce();
    focus.enable();
    expect(focus.source.focus).toHaveBeenCalledOnce();
  },
);

it.each(['unmount', 'open'] as const)(
  'cleans up a disabled source focus wait on %s without focusing it later',
  async (action) => {
    const focus = watchFocusSource();
    const get = mountLibraryBatch();
    get().open('add-tags', focus.source);
    await flush();
    get().close();
    await flush();
    expect(focus.observers).toHaveLength(1);
    if (action === 'unmount') hooks.unmount();
    else get().open('add-tags', { isConnected: false } as HTMLElement);
    expect(focus.observers[0].disconnect).toHaveBeenCalledOnce();
    focus.enable();
    expect(focus.source.focus).not.toHaveBeenCalled();
  },
);

it('cancels a scheduled source focus frame on unmount', async () => {
  const focus = watchFocusSource();
  const get = mountLibraryBatch();
  get().open('add-tags', focus.source);
  await flush();
  get().close();
  hooks.unmount();
  await flush();
  expect(focus.observers).toHaveLength(0);
  expect(focus.source.focus).not.toHaveBeenCalled();
});
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

function mountTrash(
  selected: LibrarySelection,
  onRefresh: Parameters<typeof useTrashBatch>[0]['onRefresh'] = vi.fn(
    async () => {},
  ),
) {
  let batch!: ReturnType<typeof useTrashBatch>;
  hooks.mount(() => {
    batch = useTrashBatch({
      selection: selected,
      query: 'scope=trash',
      onExpire: vi.fn(),
      onRefresh,
    });
  });
  return () => batch;
}
function cleanupResponse(
  ids: string[],
  status: 'queued' | 'running' | 'succeeded' | 'failed',
  cycle = 1,
  already = false,
) {
  return Response.json({
    results: ids.map((id) => ({
      id,
      status: already ? 'unchanged' : 'accepted',
      inQuery: true,
      message: '任务已受理',
      taskId: `cleanup-${id}`,
      cleanup: {
        jobId: `cleanup-${id}`,
        imageId: id,
        status,
        waitingForWrites: false,
        cycle,
        error: status === 'failed' ? '对象删除失败' : null,
        finishedAt: null,
        remaining: [],
        totalObjects: null,
        deletedObjects: null,
        deletedPurposes: null,
      },
    })),
  });
}
it('keeps trash acceptance distinct from actual cleanup, including existing tasks', async () => {
  const selected = selection(['first', 'existing', 'rejected']);
  selected.currentIds = new Set(['first']);
  selected.currentCount = 1;
  const onRefresh = vi
    .fn<Parameters<typeof useTrashBatch>[0]['onRefresh']>()
    .mockResolvedValue(undefined);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      const first = await cleanupResponse(['first'], 'queued').json();
      const existing = await cleanupResponse(
        ['existing'],
        'running',
        1,
        true,
      ).json();
      return Response.json({
        results: [
          ...first.results,
          ...existing.results,
          {
            id: 'rejected',
            status: 'failed',
            inQuery: true,
            message: '已离开可删除状态',
          },
        ],
      });
    }),
  );
  const get = mountTrash(selected, onRefresh);
  get().open({ isConnected: false } as HTMLElement);
  await flush();
  get().submit();
  await flush();
  expect(get().workspace?.currentCount).toBe(1);
  expect(get().workspace?.rows.map((row) => row.state)).toEqual([
    'task',
    'task',
    'rejected',
  ]);
  expect([...selected.selected.keys()]).toEqual(['rejected']);
  expect(get().failedIds).toEqual(['rejected']);
  expect(onRefresh).toHaveBeenCalledTimes(1);
  expect(onRefresh.mock.calls[0][0]).toHaveLength(3);
});
it('checks lost cleanup responses without replay and waits for an explicit continuation', async () => {
  const requests: { ids: string[]; mode: string; command: { type: string } }[] =
    [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init) => {
      const request = JSON.parse(init.body);
      requests.push(request);
      if (requests.length === 1) throw new Error('lost');
      return cleanupResponse(request.ids, 'succeeded');
    }),
  );
  const get = mountTrash(
    selection(Array.from({ length: 201 }, (_, i) => `image-${i}`)),
  );
  get().open({ isConnected: false } as HTMLElement);
  await flush();
  get().submit();
  await flush();
  expect(get().unknownIds).toHaveLength(200);
  expect(get().unsentIds).toEqual(['image-200']);
  get().retryItem('image-200');
  await flush();
  expect(requests).toHaveLength(1);
  get().check();
  await flush();
  expect(requests[1]).toMatchObject({
    mode: 'check',
    command: { type: 'delete-permanent' },
  });
  expect(get().unknownIds).toEqual([]);
  expect(get().unsentIds).toEqual(['image-200']);
  await vi.advanceTimersByTimeAsync(1500);
  expect(requests).toHaveLength(2);
  get().retryItem('image-200');
  await flush();
  expect(requests[2].ids).toEqual(['image-200']);
});
it('does not mistake the old failed cycle for a retry result and preserves its retry baseline during checks', async () => {
  const requests: {
    ids: string[];
    mode: string;
    command: { type: string; attempts?: unknown };
  }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init) => {
      const request = JSON.parse(init.body);
      requests.push(request);
      if (requests.length === 1)
        return cleanupResponse(request.ids, 'failed', 2);
      if (requests.length === 2) throw new Error('retry response lost');
      if (requests.length === 3)
        return Response.json({
          results: [
            {
              id: 'image',
              status: 'unknown',
              inQuery: true,
              message: '仍是旧失败周期',
            },
          ],
        });
      return cleanupResponse(request.ids, 'succeeded', 3);
    }),
  );
  const get = mountTrash(selection());
  get().open({ isConnected: false } as HTMLElement);
  await flush();
  get().submit();
  await flush();
  get().retryTask('image');
  await flush();
  expect(requests[1]).toMatchObject({
    mode: 'apply',
    command: {
      type: 'retry-cleanup',
      attempts: { image: { taskId: 'cleanup-image', cycle: 2 } },
    },
  });
  expect(get().workspace?.rows[0].state).toBe('unknown');
  expect(get().workspace?.rows[0].result).toBeUndefined();
  get().check();
  await flush();
  expect(get().unknownIds).toEqual(['image']);
  expect(get().workspace?.rows[0].result?.message).toBe('仍是旧失败周期');
  expect(get().workspace?.rows[0].result?.cleanup).toBeUndefined();
  expect(requests[2].command).toEqual(requests[1].command);
  get().check();
  await flush();
  expect(get().workspace?.rows[0].result?.cleanup).toMatchObject({
    status: 'succeeded',
    cycle: 3,
  });
});
it('closing a submitting trash snapshot stops unsent requests and preserves sent identities for checking', async () => {
  const ids = Array.from({ length: 201 }, (_, i) => `image-${i}`);
  let active!: AbortSignal;
  const fetch = vi.fn(async (_url, init) => {
    active = init.signal;
    return new Promise<Response>((_resolve, reject) =>
      active.addEventListener('abort', () => reject(new Error('aborted'))),
    );
  });
  vi.stubGlobal('fetch', fetch);
  const get = mountTrash(selection(ids));
  get().open({ isConnected: false } as HTMLElement);
  await flush();
  get().submit();
  await flush();
  get().close();
  await flush();
  expect(active.aborted).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(get().unknownIds).toEqual(ids.slice(0, 200));
  expect(get().unsentIds).toEqual([ids[200]]);
  expect(get().pending).toBe(false);
  get().reopen();
  await flush();
  expect(get().visible).toBe(true);
});
it('retains the last cleanup progress and a recoverable refresh failure', async () => {
  let count = 0;
  const onRefresh = vi
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error('列表读取失败'))
    .mockResolvedValueOnce(undefined);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init) => {
      const request = JSON.parse(init.body);
      count++;
      if (count === 2) throw new Error('progress offline');
      return cleanupResponse(
        request.ids,
        count === 1 ? 'running' : 'succeeded',
      );
    }),
  );
  const get = mountTrash(selection(), onRefresh);
  get().open({ isConnected: false } as HTMLElement);
  await flush();
  get().submit();
  await flush();
  await vi.advanceTimersByTimeAsync(1010);
  expect(get().progressError).not.toBe('');
  expect(get().workspace?.rows[0].result?.cleanup?.status).toBe('running');
  await vi.advanceTimersByTimeAsync(2000);
  expect(count).toBe(2);
  get().checkProgress();
  await flush();
  await vi.advanceTimersByTimeAsync(1010);
  expect(get().workspace?.rows[0].result?.cleanup?.status).toBe('succeeded');
  expect(get().refreshError).toBe('列表读取失败');
  get().retryRefresh();
  await flush();
  expect(get().refreshError).toBe('');
});

it('closing between chunks retains received tasks and leaves only the later chunk unsent', async () => {
  const ids = Array.from({ length: 201 }, (_, i) => `image-${i}`);
  const selected = selection(ids);
  const fetch = vi.fn(async (_url, init) =>
    cleanupResponse(JSON.parse(init.body).ids, 'queued'),
  );
  vi.stubGlobal('fetch', fetch);
  const get = mountTrash(selected);
  const remove = selected.remove;
  selected.remove = (id) => {
    remove(id);
    if (id === ids[199]) get().close();
  };
  get().open({ isConnected: false } as HTMLElement);
  await flush();
  get().submit();
  await flush();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(get().unknownIds).toEqual([]);
  expect(get().unsentIds).toEqual([ids[200]]);
  expect(
    get().workspace?.rows.filter((row) => row.state === 'task'),
  ).toHaveLength(200);
  expect(get().workspace?.message).toBe(
    '已停止未发送的请求。已受理的清理任务继续执行。',
  );
});

it('checks only the requested unknown item and does not submit unsent items until all unknown results are resolved', async () => {
  const requests: { ids: string[]; mode: string }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init) => {
      const request = JSON.parse(init.body);
      requests.push(request);
      if (requests.length === 1) throw new Error('lost response');
      return cleanupResponse(request.ids, 'succeeded');
    }),
  );
  const get = mountTrash(
    selection(Array.from({ length: 202 }, (_, i) => `image-${i}`)),
  );
  get().open({ isConnected: false } as HTMLElement);
  await flush();
  get().submit();
  await flush();
  get().checkItem('image-3');
  await flush();
  expect(requests[1]).toMatchObject({ ids: ['image-3'], mode: 'check' });
  expect(get().unknownIds).toHaveLength(199);
  get().retryItem('image-200');
  await flush();
  expect(requests).toHaveLength(2);
  get().check();
  await flush();
  expect(get().unknownIds).toEqual([]);
  expect(get().unsentIds).toEqual(['image-200', 'image-201']);
  get().retryItem('image-200');
  await flush();
  expect(requests[3]).toMatchObject({ ids: ['image-200'], mode: 'apply' });
  expect(get().unsentIds).toEqual(['image-201']);
  await vi.advanceTimersByTimeAsync(1500);
  expect(requests).toHaveLength(4);
});

it('retries only the chosen failed cleanup task with its own cycle and refuses tasks outside the frozen query', async () => {
  const requests: {
    ids: string[];
    mode: string;
    command: unknown;
  }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init) => {
      const request = JSON.parse(init.body);
      requests.push(request);
      if (requests.length === 1) {
        const response = await cleanupResponse(request.ids, 'failed', 4).json();
        response.results[2].inQuery = false;
        return Response.json(response);
      }
      return cleanupResponse(request.ids, 'succeeded', 5);
    }),
  );
  const get = mountTrash(selection(['first', 'second', 'outside']));
  get().open({ isConnected: false } as HTMLElement);
  await flush();
  get().submit();
  await flush();
  get().retryTask('outside');
  await flush();
  expect(requests).toHaveLength(1);
  get().retryTask('second');
  await flush();
  expect(requests[1]).toEqual({
    ids: ['second'],
    query: 'scope=trash',
    mode: 'apply',
    command: {
      type: 'retry-cleanup',
      attempts: { second: { taskId: 'cleanup-second', cycle: 4 } },
    },
  });
  expect(get().workspace?.rows[0].result?.cleanup?.status).toBe('failed');
  expect(get().workspace?.rows[1].result?.cleanup?.status).toBe('succeeded');
  expect(get().workspace?.rows[2].result?.cleanup?.status).toBe('failed');
});

it('resubmits only a retained rejected item and refuses one that left the query', async () => {
  const requests: { ids: string[]; mode: string }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init) => {
      const request = JSON.parse(init.body);
      requests.push(request);
      if (requests.length === 1)
        return Response.json({
          results: request.ids.map((id: string) => ({
            id,
            status: 'failed',
            inQuery: id !== 'outside',
            message: '不能受理',
          })),
        });
      return cleanupResponse(request.ids, 'succeeded');
    }),
  );
  const get = mountTrash(selection(['first', 'second', 'outside']));
  get().open({ isConnected: false } as HTMLElement);
  await flush();
  get().submit();
  await flush();
  get().retryItem('outside');
  await flush();
  expect(requests).toHaveLength(1);
  get().retryItem('second');
  await flush();
  expect(requests[1]).toMatchObject({ ids: ['second'], mode: 'apply' });
  expect(get().failedIds).toEqual(['first']);
});

it('reads an accepted retry as current cleanup facts after another window advances its cycle', async () => {
  const requests: { mode: string; command: { type: string } }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init) => {
      const request = JSON.parse(init.body);
      requests.push(request);
      if (requests.length === 1) return cleanupResponse(['image'], 'failed', 1);
      if (requests.length === 2)
        return cleanupResponse(['image'], 'running', 2);
      if (request.command.type === 'retry-cleanup')
        return Response.json({
          results: [
            {
              id: 'image',
              status: 'failed',
              inQuery: true,
              code: 'MEDIA_CLEANUP_CYCLE_CHANGED',
              message: '清理周期已变化，请重新读取任务',
            },
          ],
        });
      return cleanupResponse(['image'], 'succeeded', 4);
    }),
  );
  const get = mountTrash(selection());
  get().open({ isConnected: false } as HTMLElement);
  await flush();
  get().submit();
  await flush();
  get().retryTask('image');
  await flush();
  await vi.advanceTimersByTimeAsync(1010);
  expect(requests[2]).toMatchObject({
    mode: 'check',
    command: { type: 'delete-permanent' },
  });
  expect(get().workspace?.rows[0].result?.cleanup).toMatchObject({
    status: 'succeeded',
    cycle: 4,
  });
  expect(get().progressError).toBe('');
});

it.each(['failed', 'unknown'] as const)(
  'surfaces a per-item %s without cleanup and stops polling until a requested reread',
  async (status) => {
    const requests: { mode: string; command: { type: string } }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init) => {
        const request = JSON.parse(init.body);
        requests.push(request);
        if (requests.length === 1)
          return cleanupResponse(['image'], 'running', 2);
        if (requests.length === 2)
          return Response.json({
            results: [
              {
                id: 'image',
                status,
                inQuery: true,
                code: 'MEDIA_CLEANUP_TASK_CONFLICT',
                message: '清理任务已变化，请重新读取',
              },
            ],
          });
        return cleanupResponse(['image'], 'succeeded', 3);
      }),
    );
    const get = mountTrash(selection());
    get().open({ isConnected: false } as HTMLElement);
    await flush();
    get().submit();
    await flush();
    await vi.advanceTimersByTimeAsync(1010);
    expect(get().progressError).toContain('清理任务已变化，请重新读取');
    expect(get().workspace?.rows[0].result?.cleanup?.status).toBe('running');
    await vi.advanceTimersByTimeAsync(3000);
    expect(requests).toHaveLength(2);
    get().checkProgress();
    await flush();
    await vi.advanceTimersByTimeAsync(1010);
    expect(requests).toHaveLength(3);
    expect(requests[2]).toMatchObject({
      mode: 'check',
      command: { type: 'delete-permanent' },
    });
    expect(get().progressError).toBe('');
    expect(get().workspace?.rows[0].result?.cleanup?.status).toBe('succeeded');
  },
);
