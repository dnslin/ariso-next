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
import { BatchTargetsContent } from '../../../src/components/library/batch-targets';
import { BatchWorkspaceContent } from '../../../src/components/library/batch-workspace';
import { TagTargetCreate } from '../../../src/components/library/tag-target-create';
import type { LibraryBatch } from '../../../src/components/library/use-library-batch';

const runtime = vi.hoisted(() => ({
  current: null as HookState | null,
  queryKey: [] as unknown[],
  queryEnabled: true,
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => runtime.current!.state(initial),
  useRef: (initial: unknown) => runtime.current!.ref(initial),
  useEffect: (effect: EffectCallback, deps?: DependencyList) =>
    runtime.current!.effect(effect, deps),
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: ({
    queryKey,
    enabled,
  }: {
    queryKey: unknown[];
    enabled: boolean;
  }) => {
    runtime.queryKey = queryKey;
    runtime.queryEnabled = enabled;
    return {
      data: {
        items: [{ id: 'target', displayName: '已有标签', imageCount: 0 }],
        total: 40,
        page: 1,
        pageSize: 20,
      },
      isSuccess: true,
      isFetching: false,
      error: null,
    };
  },
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
class HookState {
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
  unmount() {
    for (const cleanup of this.cleanups.values()) cleanup();
  }
}
class Harness extends HookState {
  workspaceHooks = new HookState();
  targetHooks = new HookState();
  drawer() {
    this.workspaceHooks.cursor = 0;
    runtime.current = this.workspaceHooks;
    const content = BatchWorkspaceContent({
      batch,
      client: {} as QueryClient,
    });
    if (!isValidElement(content)) {
      super.unmount();
      this.cells = [];
      return null;
    }
    this.cursor = 0;
    runtime.current = this;
    return BatchTagDrawer(
      content.props as Parameters<typeof BatchTagDrawer>[0],
    );
  }
  render() {
    const drawer = this.drawer() as Element;
    const target = find(
      drawer,
      (element) => element.type === BatchTargetsContent,
    )!;
    this.targetHooks.cursor = 0;
    runtime.current = this.targetHooks;
    const targets = (
      target.type as (props: Record<string, unknown>) => ReactNode
    )(target.props);
    const createProps = find(
      targets,
      (element) => element.type === TagTargetCreate,
    )!.props as Parameters<typeof TagTargetCreate>[0];
    return {
      drawer,
      targets,
      create: createProps.create,
      form: TagTargetCreate(createProps),
    };
  }
  settled() {
    this.render();
    return this.render();
  }
  hide() {
    batch.visible = false;
    const drawer = this.drawer();
    // HeroUI's closed ModalOverlay removes the portal and its content subtree.
    this.targetHooks.unmount();
    this.targetHooks = new HookState();
    return drawer;
  }
  unmount() {
    super.unmount();
    this.workspaceHooks.unmount();
    this.targetHooks.unmount();
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
      albumTargets: [],
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
    choose: vi.fn((command) => {
      batch.workspace!.command = command;
    }),
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
  if (!blocked) {
    const close = find(
      drawer,
      (element) => element.props['data-testid'] === 'batch-return',
    )!;
    (close.props.onPress as () => void)();
    expect(batch.close).toHaveBeenCalledTimes(2);
  }
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

it.each(['add-tags', 'remove-tags'] as const)(
  'allows dismissal of unknown %s outcomes while preserving their read-only check',
  (action) => {
    batch.workspace!.action = action;
    batch.workspace!.command = { type: action, tagIds: ['existing'] };
    batch.unresolved = true;
    batch.workspace!.phase = 'result';
    batch.workspace!.unknownIds = ['image'];
    const unknown = harness.drawer() as Element;
    assertDismissBlocked(unknown, false);
    const check = find(
      unknown,
      (element) => element.props['data-testid'] === 'batch-check',
    )!;
    expect(check.props.isDisabled).toBe(false);
    (check.props.onPress as () => void)();
    expect(batch.check).toHaveBeenCalledTimes(1);
    batch.unresolved = false;
    batch.workspace!.unknownIds = [];
    batch.failedIds = ['image'];
    vi.mocked(batch.close).mockClear();
    const failed = harness.drawer() as Element;
    assertDismissBlocked(failed, false);
    expect(
      find(failed, (element) => element.props['data-testid'] === 'batch-retry')!
        .props.isDisabled,
    ).toBe(false);
  },
);

it('blocks every dismissal route while a relation write or read-back is in flight', () => {
  batch.pending = true;
  batch.unresolved = true;
  batch.workspace!.phase = 'result';
  batch.workspace!.unknownIds = ['image'];
  assertDismissBlocked(harness.settled().drawer, true);
});

it('connects the standalone drawer X to closing an unknown relation result', () => {
  batch.unresolved = true;
  batch.workspace!.phase = 'result';
  batch.workspace!.unknownIds = ['image'];
  const close = find(
    harness.settled().drawer,
    (element) => element.props['aria-label'] === '关闭批量操作',
  )!;
  expect(close.props.isDisabled).toBe(false);
  expect(close.props.onPress).toBeTypeOf('function');
  (close.props.onPress as () => void)();
  expect(batch.close).toHaveBeenCalledTimes(1);
});

it('preserves search, target page, selection and a failed creation draft after hiding an unknown relation result', async () => {
  const initial = harness.settled();
  const search = find(
    initial.targets,
    (element) => element.props['aria-label'] === '搜索目标标签',
  )!;
  (search.props.onChange as (event: { target: { value: string } }) => void)({
    target: { value: '保留搜索' },
  });
  const nextPage = find(
    harness.settled().targets,
    (element) => element.props.children === '下一页目标',
  )!;
  (nextPage.props.onPress as () => void)();
  const target = find(
    harness.settled().targets,
    (element) => element.props['data-target-id'] === 'target',
  )!;
  (target.props.onChange as (selected: boolean) => void)(true);
  harness.settled().create.change('不可丢失的新建草稿');
  fetcher.mockResolvedValueOnce(
    Response.json({ message: '名称暂不可用' }, { status: 400 }),
  );
  await harness.settled().create.create();
  expect(harness.settled().create.error).toBe('名称暂不可用');

  batch.unresolved = true;
  batch.workspace!.phase = 'result';
  batch.workspace!.unknownIds = ['image'];
  batch.workspace!.checkFailed = true;
  const hidden = harness.hide();
  expect(hidden).not.toBeNull();
  expect((hidden as Element).props.isOpen).toBe(false);
  expect(runtime.queryEnabled).toBe(false);

  batch.visible = true;
  const reopened = harness.settled();
  expect(runtime.queryEnabled).toBe(true);
  expect(runtime.queryKey).toEqual(['batch-targets', false, '保留搜索', 2]);
  expect(reopened.create).toMatchObject({
    name: '不可丢失的新建草稿',
    error: '名称暂不可用',
    unknown: false,
  });
  const retainedTarget = find(
    reopened.targets,
    (element) => element.props['data-target-id'] === 'target',
  )!;
  expect(retainedTarget.props.isSelected).toBe(true);
  expect(retainedTarget.props.isDisabled).toBe(true);
  expect(
    find(
      reopened.drawer,
      (element) => element.props['data-testid'] === 'batch-check',
    )!.props.children,
  ).toBe('再次核对');
  expect(
    find(
      reopened.drawer,
      (element) => element.props['data-testid'] === 'batch-submit',
    ),
  ).toBeUndefined();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
