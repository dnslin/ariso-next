import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DependencyList, EffectCallback } from 'react';
import {
  UploadLimitsRequestError,
  type SavedUploadLimits,
} from '../../../src/components/upload-limits/api';
import { useUploadLimits } from '../../../src/components/upload-limits/use-upload-limits';

// Retain hook state between renders, including the one-time initial snapshot.
// Real query/queue lifetime behavior is covered by limits-lifetime.test.ts.
const runtime = vi.hoisted(() => ({ current: null as Harness | null }));
const actions = vi.hoisted(() => ({
  fetch: vi.fn(),
  toast: vi.fn(),
  close: vi.fn(),
  reset: vi.fn(),
  cache: vi.fn(),
  cancel: vi.fn(),
  invalidate: vi.fn(),
  query: vi.fn(),
  publish: vi.fn(),
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => runtime.current!.state(initial),
  useRef: (initial: unknown) => runtime.current!.ref(initial),
  useEffect: (effect: EffectCallback, deps?: DependencyList) =>
    runtime.current!.effect(effect, deps),
  useCallback: (callback: unknown) => callback,
}));
vi.mock('@heroui/react/toast', () => ({
  toast: Object.assign(actions.toast, { close: actions.close }),
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: actions.query,
  useQueryClient: () => ({
    setQueryData: actions.cache,
    invalidateQueries: actions.invalidate,
  }),
}));
vi.mock('../../../src/components/upload/provider', () => ({
  useUploadLimitsSync: () => ({
    publishLimits: actions.publish,
    refreshSettings: actions.invalidate,
  }),
  useResetUpload: () => actions.reset,
}));

function UploadLimitsHarness(sessionLost = false) {
  return useUploadLimits(sessionLost);
}
class Harness {
  private cells: unknown[] = [];
  private cursor = 0;
  private dirty = false;
  private pending: (() => void)[] = [];
  private cleanups = new Map<number, () => void>();
  state(initial: unknown) {
    const index = this.cursor++;
    if (!(index in this.cells))
      this.cells[index] = typeof initial === 'function' ? initial() : initial;
    return [
      this.cells[index],
      (value: unknown) => {
        this.dirty = true;
        this.cells[index] =
          typeof value === 'function' ? value(this.cells[index]) : value;
      },
    ];
  }
  ref(initial: unknown) {
    const index = this.cursor++;
    if (!(index in this.cells)) this.cells[index] = { current: initial };
    return this.cells[index];
  }
  effect(effect: EffectCallback, deps?: DependencyList) {
    const index = this.cursor++;
    const previous = this.cells[index] as DependencyList | undefined;
    if (
      !deps ||
      !previous ||
      deps.some((value, i) => !Object.is(value, previous[i]))
    ) {
      this.cells[index] = deps;
      this.pending.push(() => {
        this.cleanups.get(index)?.();
        const cleanup = effect();
        if (cleanup) this.cleanups.set(index, cleanup);
      });
    }
  }
  render(
    initial: SavedUploadLimits | null,
    options: { fresh?: boolean; sessionLost?: boolean; error?: Error } = {},
  ) {
    actions.query.mockReturnValue({
      data: initial,
      isFetchedAfterMount: options.fresh ?? initial !== null,
      isFetching: initial === null && !options.error,
      isSuccess: initial !== null && !options.error,
      error: options.error ?? null,
      refetch: vi.fn(),
    });
    runtime.current = this;
    let value: ReturnType<typeof useUploadLimits>;
    do {
      this.dirty = false;
      this.cursor = 0;
      value = UploadLimitsHarness(options.sessionLost);
      for (const effect of this.pending.splice(0)) effect();
    } while (this.dirty);
    return value;
  }
  unmount() {
    for (const cleanup of this.cleanups.values()) cleanup();
    this.cleanups.clear();
  }
}

const initial: SavedUploadLimits = {
  maxFileMiB: 50,
  maxFileBytes: 50 * 1048576,
  batchSize: 20,
  queueLimit: 500,
};
const unreadInput = {
  maxFileMiB: Number.NaN,
  batchSize: Number.NaN,
  queueLimit: Number.NaN,
};
let harness: Harness;
const frame = vi.fn();
beforeEach(() => {
  harness = new Harness();
  for (const action of Object.values(actions)) action.mockReset();
  frame.mockReset();
  vi.stubGlobal('fetch', actions.fetch);
  vi.stubGlobal('requestAnimationFrame', frame);
  vi.stubGlobal('document', { activeElement: null });
});
afterEach(() => {
  harness.unmount();
  vi.unstubAllGlobals();
});

it('does not invent limits or request save/read-back/selection before the first actual read', async () => {
  expect(harness.render(null)).toMatchObject({
    saved: null,
    input: unreadInput,
  });
  await harness.render(null).save();
  await harness.render(null).reconcile();
  harness.render(null).chooseSaved(true);
  harness.render(null).chooseSaved(false);
  harness.render(null).change('maxFileMiB', 60);
  expect(harness.render(null)).toMatchObject({
    saved: null,
    input: unreadInput,
  });
  expect(actions.fetch).not.toHaveBeenCalled();
  expect(actions.toast).not.toHaveBeenCalled();
  expect(frame).not.toHaveBeenCalled();
});

it('initializes once from actual values and preserves the draft when a later snapshot arrives or disappears', () => {
  harness.render(null);
  harness.render(initial);
  expect(harness.render(initial)).toMatchObject({
    saved: initial,
    input: { maxFileMiB: 50, batchSize: 20, queueLimit: 500 },
  });
  harness.render(initial).change('maxFileMiB', 60);
  const later = { ...initial, maxFileMiB: 70, maxFileBytes: 70 * 1048576 };
  expect(harness.render(later)).toMatchObject({
    saved: initial,
    input: { maxFileMiB: 60 },
  });
  expect(harness.render(null)).toMatchObject({
    saved: initial,
    input: { maxFileMiB: 60 },
  });
  expect(actions.fetch).not.toHaveBeenCalled();
});

it('does not initialize or unlock an expired unread editor when its initial snapshot returns late', async () => {
  harness.render(null).expire();
  harness.render(initial);
  expect(harness.render(initial)).toMatchObject({
    saved: null,
    input: unreadInput,
    expired: true,
  });
  await harness.render(initial).save();
  await harness.render(initial).reconcile();
  harness.render(initial).chooseSaved(true);
  expect(actions.fetch).not.toHaveBeenCalled();
  expect(actions.reset).toHaveBeenCalledTimes(1);
  expect(actions.toast).not.toHaveBeenCalled();
});

it('waits for a fresh successful read instead of initializing from cached success or a failed read', () => {
  harness.render(initial, { fresh: false });
  expect(harness.render(initial, { fresh: false }).saved).toBeNull();
  harness.render(initial, {
    error: new UploadLimitsRequestError(503, 'UNAVAILABLE', 'read failed'),
  });
  expect(harness.render(initial, { fresh: false }).saved).toBeNull();
  harness.render(initial);
  expect(harness.render(initial).saved).toEqual(initial);
  expect(actions.query.mock.lastCall?.[0].enabled).toBe(false);
});

it.each(['elsewhere', 'upload'] as const)(
  'blocks fresh initialization after %s loses the session',
  (source) => {
    const options =
      source === 'elsewhere'
        ? { sessionLost: true }
        : {
            error: new UploadLimitsRequestError(
              401,
              'UNAUTHORIZED',
              'session expired',
            ),
          };
    harness.render(initial, options);
    expect(harness.render(initial, options)).toMatchObject({
      saved: null,
      input: unreadInput,
      sessionLost: true,
    });
    expect(actions.publish).not.toHaveBeenCalled();
  },
);

it('keeps an uncertain save locked through retry and only unlocks after a matching actual read', async () => {
  harness.render(initial);
  harness.render(initial).change('maxFileMiB', 60);
  actions.fetch.mockRejectedValueOnce(new Error('lost PATCH response'));
  actions.fetch.mockRejectedValueOnce(new Error('read unavailable'));
  await harness.render(initial).save();
  expect(harness.render(initial)).toMatchObject({
    input: { maxFileMiB: 60 },
    saved: initial,
    busy: false,
    unknown: true,
    different: false,
  });
  const held = Promise.withResolvers<Response>();
  actions.fetch.mockReturnValueOnce(held.promise);
  const checking = harness.render(initial).reconcile();
  expect(harness.render(initial)).toMatchObject({
    busy: true,
    unknown: true,
    different: false,
  });
  await harness.render(initial).save();
  await harness.render(initial).reconcile();
  expect(actions.fetch).toHaveBeenCalledTimes(3);
  const confirmed = { ...initial, maxFileMiB: 60, maxFileBytes: 60 * 1048576 };
  held.resolve(Response.json(confirmed));
  await checking;
  expect(harness.render(initial)).toMatchObject({
    input: { maxFileMiB: 60 },
    saved: confirmed,
    busy: false,
    unknown: false,
    different: false,
  });
  expect(
    actions.fetch.mock.calls.map(([, init]) => init?.method ?? 'GET'),
  ).toEqual(['PATCH', 'GET', 'GET']);
  expect(actions.publish).toHaveBeenCalledExactlyOnceWith(confirmed);
});

it.each([false, true])(
  'unlocks a differing read only after choosing useSaved=%s and retains the chosen values',
  async (useSaved) => {
    harness.render(initial);
    harness.render(initial).change('maxFileMiB', 60);
    const actual = { ...initial, maxFileMiB: 70, maxFileBytes: 70 * 1048576 };
    actions.fetch.mockRejectedValueOnce(new Error('lost PATCH response'));
    actions.fetch.mockResolvedValueOnce(Response.json(actual));
    await harness.render(initial).save();
    expect(harness.render(initial)).toMatchObject({
      saved: actual,
      input: { maxFileMiB: 60 },
      busy: false,
      unknown: true,
      different: true,
    });
    await harness.render(initial).save();
    expect(actions.fetch).toHaveBeenCalledTimes(2);
    harness.render(initial).chooseSaved(useSaved);
    expect(harness.render(initial)).toMatchObject({
      saved: actual,
      input: { maxFileMiB: useSaved ? 70 : 60 },
      busy: false,
      unknown: false,
      different: false,
    });
    expect(actions.fetch).toHaveBeenCalledTimes(2);
  },
);

it('retains initialized input on expiry and rejects late changes, choices and requests', async () => {
  harness.render(initial).change('maxFileMiB', 60);
  harness.render(initial).expire();
  const later = { ...initial, maxFileMiB: 70, maxFileBytes: 70 * 1048576 };
  const editor = harness.render(later);
  editor.chooseSaved(true);
  editor.change('maxFileMiB', 80);
  await editor.save();
  await editor.reconcile();
  expect(harness.render(later)).toMatchObject({
    saved: initial,
    input: { maxFileMiB: 60 },
    expired: true,
  });
  expect(actions.fetch).not.toHaveBeenCalled();
  expect(actions.toast).not.toHaveBeenCalled();
  expect(frame).not.toHaveBeenCalled();
});
