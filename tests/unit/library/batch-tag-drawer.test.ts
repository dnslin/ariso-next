import {
  isValidElement,
  type DependencyList,
  type EffectCallback,
  type ReactElement,
  type ReactNode,
} from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BatchTagDrawer } from '../../../src/components/library/batch-tag-drawer';
import { BatchTargets } from '../../../src/components/library/batch-targets';
import { TagTargetCreate } from '../../../src/components/library/tag-target-create';
import type { LibraryBatch } from '../../../src/components/library/use-library-batch';

const runtime = vi.hoisted(() => ({ current: null as Harness | null }));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => runtime.current!.state(initial),
  useRef: (initial: unknown) => runtime.current!.ref(initial),
  useEffect: (effect: EffectCallback, deps?: DependencyList) =>
    runtime.current!.effect(effect, deps),
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: { items: [], total: 0, page: 1, pageSize: 20 },
    isSuccess: true,
    isFetching: false,
    error: null,
  }),
}));

type Element = ReactElement<Record<string, unknown> & { children?: ReactNode }>;
function find(
  node: ReactNode,
  match: (element: Element) => boolean,
): Element | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = find(child, match);
      if (found) return found;
    }
  }
  if (!isValidElement(node)) return;
  const element = node as Element;
  return match(element) ? element : find(element.props.children, match);
}
class Harness {
  cells: unknown[] = [];
  cursor = 0;
  cleanups = new Map<number, () => void>();
  state(initial: unknown) {
    const index = this.cursor++;
    if (!(index in this.cells))
      this.cells[index] = typeof initial === 'function' ? initial() : initial;
    return [
      this.cells[index],
      (value: unknown) => {
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
      !previous ||
      !deps ||
      deps.some((value, i) => !Object.is(value, previous[i]))
    ) {
      this.cells[index] = deps;
      this.cleanups.get(index)?.();
      const cleanup = effect();
      if (cleanup) this.cleanups.set(index, cleanup);
    }
  }
  render() {
    this.cursor = 0;
    runtime.current = this;
    const drawer = BatchTagDrawer({
      batch,
      client: {} as QueryClient,
    }) as Element;
    const targetProps = find(
      drawer,
      (element) => element.type === BatchTargets,
    )!.props;
    const targets = BatchTargets(
      targetProps as Parameters<typeof BatchTargets>[0],
    );
    const createProps = find(
      targets,
      (element) => element.type === TagTargetCreate,
    )!.props as Parameters<typeof TagTargetCreate>[0];
    return {
      drawer,
      create: createProps.create,
      form: TagTargetCreate(createProps),
    };
  }
  settled() {
    this.render();
    return this.render();
  }
  unmount() {
    for (const cleanup of this.cleanups.values()) cleanup();
  }
}
let harness: Harness;
let batch: LibraryBatch;
const fetcher = vi.fn();
beforeEach(() => {
  harness = new Harness();
  batch = {
    workspace: {
      action: 'add-tags',
      items: [],
      command: { type: 'add-tags', tagIds: ['existing'] },
      phase: 'choose',
      results: [],
      unknownIds: [],
      unsentIds: [],
      message: '',
      checkFailed: false,
    },
    visible: true,
    pending: false,
    unresolved: false,
    targetReady: true,
    setTargetReady: vi.fn(),
    failedIds: [],
    close: vi.fn(),
    submit: vi.fn(),
    check: vi.fn(),
    retry: vi.fn(),
    onExpire: vi.fn(),
  } as unknown as LibraryBatch;
  fetcher.mockReset();
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => {
  harness.unmount();
  vi.unstubAllGlobals();
});

function assertDismissBlocked(drawer: Element, blocked: boolean) {
  expect(drawer.props.isDismissable).toBe(!blocked);
  expect(drawer.props.isKeyboardDismissDisabled).toBe(blocked);
  expect(
    find(drawer, (element) => element.props['aria-label'] === '关闭批量操作')!
      .props.isDisabled,
  ).toBe(blocked);
  expect(
    find(drawer, (element) => element.props['data-testid'] === 'batch-return')!
      .props.isDisabled,
  ).toBe(blocked);
  (drawer.props.onOpenChange as (open: boolean) => void)(false);
  expect(batch.close).toHaveBeenCalledTimes(blocked ? 0 : 1);
}

it('exposes pending state on the drawer content rather than the filtered dialog props', () => {
  batch.pending = true;
  const { drawer } = harness.render();
  expect(
    find(drawer, (element) => element.props['aria-busy'] === true),
  ).toBeDefined();
  batch.pending = false;
  expect(
    find(
      harness.render().drawer,
      (element) => element.props['aria-busy'] === false,
    ),
  ).toBeDefined();
});

it('keeps image count in the header and selected tags beside the compact footer action', () => {
  const { drawer } = harness.render();
  const images = find(
    drawer,
    (element) => element.props['data-testid'] === 'batch-tag-image-count',
  )!;
  const tags = find(
    drawer,
    (element) => element.props['data-testid'] === 'batch-tag-count',
  )!;
  const submit = find(
    drawer,
    (element) => element.props['data-testid'] === 'batch-submit',
  )!;
  expect(images.props.children).toEqual(['已选 ', 0, ' 张图片']);
  expect(tags.props.children).toEqual(['已选 ', 1, ' 个标签']);
  expect(submit.props.children).toBe('添加');
});

it('keeps an uncertain tag creation mounted and permits GET confirmation before dismissal is unlocked', async () => {
  harness.settled().create.change('不可丢失的新建草稿');
  fetcher
    .mockRejectedValueOnce(new Error('POST response lost'))
    .mockRejectedValueOnce(new Error('GET failed'));
  await harness.settled().create.create();
  const uncertain = harness.settled();
  expect(uncertain.create).toMatchObject({
    unknown: true,
    pending: false,
    name: '不可丢失的新建草稿',
  });
  assertDismissBlocked(uncertain.drawer, true);
  const check = find(
    uncertain.form,
    (element) => element.props.children === '核对新建结果',
  )!;
  expect(check.props.isDisabled).toBe(false);
  await uncertain.create.create();
  expect(fetcher).toHaveBeenCalledTimes(2);
  fetcher.mockResolvedValueOnce(
    Response.json({ items: [], total: 0, page: 1, pageSize: 80 }),
  );
  (check.props.onPress as () => void)();
  await vi.waitFor(() => expect(harness.settled().create.unknown).toBe(false));
  const confirmed = harness.settled();
  expect(confirmed.create).toMatchObject({
    unknown: false,
    pending: false,
    name: '不可丢失的新建草稿',
  });
  expect(fetcher.mock.calls.map(([, init]) => init.method ?? 'GET')).toEqual([
    'POST',
    'GET',
    'GET',
  ]);
  assertDismissBlocked(confirmed.drawer, false);
});

it('blocks dismissal of unknown image-tag outcomes without disabling their read-only check, but known failures may close', () => {
  batch.unresolved = true;
  batch.workspace!.phase = 'result';
  batch.workspace!.unknownIds = ['image'];
  const unknown = harness.settled();
  assertDismissBlocked(unknown.drawer, true);
  const check = find(
    unknown.drawer,
    (element) => element.props['data-testid'] === 'batch-check',
  )!;
  expect(check.props.isDisabled).toBe(false);
  (check.props.onPress as () => void)();
  expect(batch.check).toHaveBeenCalledTimes(1);
  batch.unresolved = false;
  batch.workspace!.unknownIds = [];
  batch.failedIds = ['image'];
  const failed = harness.settled();
  assertDismissBlocked(failed.drawer, false);
  expect(
    find(
      failed.drawer,
      (element) => element.props['data-testid'] === 'batch-retry',
    )!.props.isDisabled,
  ).toBe(false);
});
