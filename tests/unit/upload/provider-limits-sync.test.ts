import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createElement, type DependencyList, type EffectCallback } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  QueryClient,
  QueryObserver,
  type QueryObserverOptions,
} from '@tanstack/react-query';
import type { UploadSettings } from '../../../src/components/upload/settings';
import * as provider from '../../../src/components/upload/provider';

// Only React's retained hook state/effect delivery and browser listeners are
// modeled. Settings reads, cancellation, cache and admission use real code.
type Cell = {
  value?: unknown;
  deps?: DependencyList;
  cleanup?: () => void;
};
const runtime = vi.hoisted(() => ({
  rendering: false,
  cursor: 0,
  cells: [] as Cell[],
  effects: [] as (() => void)[],
  dirty: false,
  pathname: '/upload',
  observer: null as QueryObserver<UploadSettings> | null,
  unsubscribeQuery: null as (() => void) | null,
}));
vi.mock('next/navigation', () => ({
  usePathname: () => runtime.pathname,
}));
vi.mock('react', async (original) => {
  const actual = await original<typeof import('react')>();
  function cell() {
    return (runtime.cells[runtime.cursor++] ??= {});
  }
  function memo(value: () => unknown, deps: DependencyList) {
    const current = cell();
    if (
      !current.deps ||
      deps.some((dep, index) => !Object.is(dep, current.deps![index]))
    ) {
      current.value = value();
      current.deps = deps;
    }
    return current.value;
  }
  return {
    ...actual,
    useState: (initial: unknown) => {
      if (!runtime.rendering) return actual.useState(initial);
      const current = cell();
      if (!('value' in current))
        current.value = typeof initial === 'function' ? initial() : initial;
      return [
        current.value,
        (value: unknown) => {
          const next =
            typeof value === 'function' ? value(current.value) : value;
          if (!Object.is(next, current.value)) runtime.dirty = true;
          current.value = next;
        },
      ];
    },
    useRef: (initial: unknown) => {
      if (!runtime.rendering) return actual.useRef(initial);
      const current = cell();
      return (current.value ??= { current: initial });
    },
    useCallback: (
      callback: (...args: unknown[]) => unknown,
      deps: DependencyList,
    ) =>
      runtime.rendering
        ? memo(() => callback, deps)
        : actual.useCallback(callback, deps),
    useMemo: (value: () => unknown, deps: DependencyList) =>
      runtime.rendering ? memo(value, deps) : actual.useMemo(value, deps),
    useEffect: (effect: EffectCallback, deps: DependencyList) => {
      if (!runtime.rendering) return actual.useEffect(effect, deps);
      const current = cell();
      if (
        !current.deps ||
        deps.some((dep, index) => !Object.is(dep, current.deps![index]))
      ) {
        current.deps = deps;
        runtime.effects.push(() => {
          current.cleanup?.();
          current.cleanup = effect() || undefined;
        });
      }
    },
    useSyncExternalStore: (
      subscribe: (listener: () => void) => () => void,
      snapshot: () => unknown,
    ) => {
      const current = cell();
      if (current.value !== subscribe) {
        current.cleanup?.();
        current.value = subscribe;
        current.cleanup = subscribe(() => {
          runtime.dirty = true;
        });
      }
      return snapshot();
    },
  };
});
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof import('@tanstack/react-query')>()),
  useQuery: (
    options: QueryObserverOptions<UploadSettings>,
    client: QueryClient,
  ) => {
    if (!runtime.observer) {
      runtime.observer = new QueryObserver(client, options);
      runtime.unsubscribeQuery = runtime.observer.subscribe(() => {
        runtime.dirty = true;
      });
    } else runtime.observer.setOptions(options);
    return runtime.observer.getCurrentResult();
  },
}));
vi.mock('../../../src/components/upload/transport', () => ({
  createUploadTransport: () => ({ upload: vi.fn(), destroy: vi.fn() }),
}));

const mib = 1048576;
const limits = { maxFileBytes: 60 * mib, batchSize: 25, queueLimit: 100 };
const settings: UploadSettings = {
  maxFileBytes: 50 * mib,
  batchSize: 20,
  queueLimit: 500,
  defaultVisibility: 'private',
  defaultStorageId: 'local',
  storages: [{ id: 'local', name: 'Local', enabled: true }],
  albums: [{ id: 'album', name: 'Album' }],
  tags: [{ id: 'tag', displayName: 'Tag' }],
};
let queue: ReturnType<typeof provider.useUploadQueue>;
let sync: ReturnType<typeof provider.useUploadLimitsSync>;
let lifecycleValue: unknown;
let tree: ReturnType<typeof provider.UploadProvider>;

function Consumer() {
  queue = provider.useUploadQueue();
  sync = provider.useUploadLimitsSync();
  return null;
}
function render() {
  do {
    runtime.cursor = 0;
    runtime.dirty = false;
    runtime.rendering = true;
    try {
      tree = provider.UploadProvider({ children: createElement(Consumer) });
    } finally {
      runtime.rendering = false;
    }
    lifecycleValue = tree.props.value;
    runtime.effects.splice(0).forEach((effect) => effect());
  } while (runtime.dirty);
  renderToStaticMarkup(tree);
}
async function started() {
  render();
  await vi.waitFor(() => {
    render();
    expect(queue.controller).not.toBeNull();
  });
}
function smallFile() {
  return new File(['image'], 'image.png', { type: 'image/png' });
}
beforeEach(() => {
  runtime.cells = [];
  runtime.effects = [];
  runtime.pathname = '/upload';
  vi.stubGlobal('window', {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    location: { replace: vi.fn() },
  });
  vi.stubGlobal('document', { hidden: false });
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async () => Response.json(settings)),
  );
});
afterEach(() => {
  runtime.unsubscribeQuery?.();
  runtime.observer?.destroy();
  runtime.observer = null;
  runtime.unsubscribeQuery = null;
  runtime.cells.forEach((current) => current.cleanup?.());
  runtime.rendering = false;
  vi.unstubAllGlobals();
});

it('keeps narrow lifecycle actions stable across real queue emissions and owner navigation', async () => {
  await started();
  const controller = queue.controller!;
  const actions = sync;
  const lifecycle = lifecycleValue;
  const originalItems = queue.items;
  runtime.pathname = '/settings/general';
  render();
  for (let index = 0; index < 3; index++) {
    expect(controller.add(smallFile())).toBeNull();
    expect(runtime.dirty).toBe(true);
    render();
    expect(sync.publishLimits).toBe(actions.publishLimits);
    expect(sync.refreshSettings).toBe(actions.refreshSettings);
    expect(lifecycleValue).toBe(lifecycle);
    expect(queue.controller).toBe(controller);
  }
  expect(queue.items).not.toBe(originalItems);
  expect(queue.items).toHaveLength(3);
  expect(Object.keys(sync).sort()).toEqual([
    'publishLimits',
    'refreshSettings',
  ]);
});

it('synchronously cancels an old GET, preserves complete settings and admits against published limits', async () => {
  await started();
  const controller = queue.controller!;
  controller.add(smallFile());
  const existingId = controller.snapshot[0].id;
  const oldRead = Promise.withResolvers<Response>();
  let signal: AbortSignal | undefined;
  vi.mocked(fetch).mockImplementationOnce(async (_url, init) => {
    signal = init?.signal as AbortSignal;
    return oldRead.promise;
  });
  const pending = runtime.observer!.refetch();
  expect(signal?.aborted).toBe(false);
  sync.publishLimits(limits);
  // No await or React render separates publish from a new admission.
  expect(signal?.aborted).toBe(true);
  expect(queue.client.getQueryData(['upload-settings'])).toEqual({
    ...settings,
    ...limits,
  });
  expect(
    controller.add(
      new File([new Uint8Array(55 * mib)], 'allowed.png', {
        type: 'image/png',
      }),
    ),
  ).toBeNull();
  for (let index = 2; index < limits.queueLimit; index++)
    expect(controller.add(smallFile())).toBeNull();
  expect(controller.add(smallFile())?.reason).toBe('capacity');
  oldRead.resolve(Response.json(settings));
  await pending;
  render();
  expect(queue.client.getQueryData(['upload-settings'])).toEqual({
    ...settings,
    ...limits,
  });
  expect(queue.controller).toBe(controller);
  expect(controller.snapshot[0].id).toBe(existingId);
  expect(controller.snapshot).toHaveLength(limits.queueLimit);
});

it('refreshes the current settings through a real GET without replacing the live controller', async () => {
  await started();
  const controller = queue.controller!;
  controller.add(smallFile());
  const ids = controller.snapshot.map(({ id }) => id);
  vi.mocked(fetch).mockResolvedValueOnce(
    Response.json({ ...settings, ...limits }),
  );
  await sync.refreshSettings();
  render();
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(queue.client.getQueryData(['upload-settings'])).toEqual({
    ...settings,
    ...limits,
  });
  expect(queue.controller).toBe(controller);
  expect(controller.snapshot.map(({ id }) => id)).toEqual(ids);
  expect(
    controller.add(
      new File([new Uint8Array(55 * mib)], 'allowed.png', {
        type: 'image/png',
      }),
    ),
  ).toBeNull();
});

it('does not invent a complete cache before upload starts or restore a cleared session queue', async () => {
  runtime.pathname = '/settings/general';
  render();
  sync.publishLimits(limits);
  await sync.refreshSettings();
  render();
  expect(fetch).not.toHaveBeenCalled();
  expect(queue.client.getQueryData(['upload-settings'])).toBeUndefined();
  expect(queue.controller).toBeNull();
  vi.mocked(fetch).mockResolvedValueOnce(
    Response.json({ ...settings, ...limits }),
  );
  runtime.pathname = '/upload';
  await started();
  const controller = queue.controller!;
  controller.add(smallFile());
  const retained = sync;
  queue.reset();
  retained.publishLimits(limits);
  expect(queue.client.getQueryData(['upload-settings'])).toBeUndefined();
  expect(controller.snapshot).toEqual([]);
  expect(controller.add(smallFile())?.reason).toBe('closed');
  runtime.pathname = '/settings/general';
  render();
  expect(queue.controller).toBeNull();
});
