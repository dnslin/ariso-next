import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { Button, Dropdown, Form, Modal } from '@heroui/react';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { SmartCollectionToolbar } from '../../../src/app/library/smart-collection-toolbar';
import { ScreenshotTemplateDialog } from '../../../src/app/library/screenshot-template-dialog';
import { LibraryFilterOptionsField } from '../../../src/app/library/library-filter-options';
import { SmartCollectionRequestError } from '../../../src/app/library/smart-collection-client';
import { smartCollectionTemplate } from '../../../src/app/library/smart-collection-templates';
import { parseLibraryQuery } from '../../../src/server/library/query-schema';

// Exercise real component handlers and state in Node. HeroUI's DOM, focus and
// keyboard implementation remain covered by the real browser suite.
const hooks = vi.hoisted(() => {
  type Scope = { cells: unknown[]; index: number };
  const scopes = new Map<string, Scope>();
  let current: Scope;
  let render: () => void;
  let scheduled = false;
  let mounted = false;
  function schedule() {
    if (scheduled || !mounted) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      if (mounted) render();
    });
  }
  return {
    useState(initial: unknown) {
      const scope = current;
      const slot = scope.index++;
      if (!(slot in scope.cells))
        scope.cells[slot] = typeof initial === 'function' ? initial() : initial;
      return [
        scope.cells[slot],
        (value: unknown) => {
          scope.cells[slot] =
            typeof value === 'function' ? value(scope.cells[slot]) : value;
          schedule();
        },
      ];
    },
    useRef(initial: unknown) {
      const slot = current.index++;
      if (!(slot in current.cells)) current.cells[slot] = { current: initial };
      return current.cells[slot];
    },
    scope<T>(name: string, run: () => T): T {
      const scope = scopes.get(name) ?? { cells: [], index: 0 };
      scopes.set(name, scope);
      scope.index = 0;
      current = scope;
      return run();
    },
    remove(name: string) {
      scopes.delete(name);
    },
    mount(run: () => void) {
      scopes.clear();
      mounted = true;
      render = run;
      run();
    },
    unmount() {
      mounted = false;
    },
  };
});
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: hooks.useState,
  useRef: hooks.useRef,
  useEffect: () => {},
  useImperativeHandle: () => {},
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/library',
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: { items: [] }, refetch: vi.fn() }),
}));

type ViewProps = {
  children?: ReactNode;
  onPress?: () => void;
  onAction?: (key: string) => void;
  onSubmit?: (event: { preventDefault: () => void }) => void;
  onOpenChange?: (open: boolean) => void;
  onChange?: (ids: string[]) => void;
  isOpen?: boolean;
  isDisabled?: boolean;
  selectedIds?: string[];
  disabled?: boolean;
  isKeyboardDismissDisabled?: boolean;
  'aria-label'?: string;
  role?: string;
};
function nodes(node: ReactNode): ReactElement<ViewProps>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<ViewProps>(node)) return [];
  return [node, ...nodes(node.props.children)];
}
function text(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join('');
  return isValidElement<ViewProps>(node) ? text(node.props.children) : '';
}
function mount(
  onApply = vi.fn().mockResolvedValue(new URLSearchParams('tagId=known')),
) {
  const client = new QueryClient();
  const expire = vi.fn();
  let tree: ReactNode;
  let dialogTree: ReactNode;
  hooks.mount(() => {
    tree = hooks.scope('toolbar', () =>
      SmartCollectionToolbar({
        filters: parseLibraryQuery(new URLSearchParams()).filters,
        client,
        onApply,
        onSessionExpired: expire,
        onReplaceQuery: vi.fn(),
        getQueryRevision: () => 0,
      }),
    );
    const owned = nodes(tree).find(
      (node) => node.type === ScreenshotTemplateDialog,
    ) as
      ReactElement<Parameters<typeof ScreenshotTemplateDialog>[0]> | undefined;
    if (owned) {
      dialogTree = hooks.scope('screenshot', () =>
        ScreenshotTemplateDialog(owned.props),
      );
    } else {
      hooks.remove('screenshot');
      dialogTree = tree;
    }
  });
  const dialog = () =>
    nodes(dialogTree).find((node) => node.type === Modal && node.props.isOpen);
  const button = (label: string) => {
    const item = nodes(dialog()?.props.children).find(
      (node) => node.type === Button && text(node.props.children) === label,
    );
    expect(item, `button ${label}`).toBeDefined();
    return item!;
  };
  const picker = () => {
    const item = nodes(dialog()?.props.children).find(
      (node) => node.type === LibraryFilterOptionsField,
    );
    expect(item).toBeDefined();
    return item!;
  };
  return {
    client,
    expire,
    onApply,
    dialog,
    button,
    picker,
    async open() {
      nodes(tree).find(
        (node) =>
          node.type === Dropdown.Menu &&
          node.props['aria-label'] === '智能集合',
      )!.props.onAction!('template-screenshot');
      await vi.waitFor(() => expect(picker()).toBeDefined());
    },
    async select(ids: string[]) {
      picker().props.onChange!(ids);
      await vi.waitFor(() => expect(picker().props.selectedIds).toEqual(ids));
    },
    submit() {
      nodes(dialog()?.props.children).find((node) => node.type === Form)!.props
        .onSubmit!({ preventDefault() {} });
    },
    errors: () =>
      nodes(dialog()?.props.children)
        .filter((node) => node.props.role === 'alert')
        .map((node) => text(node.props.children))
        .join(' '),
  };
}
afterEach(() => {
  hooks.unmount();
  vi.unstubAllGlobals();
});

it('applies selected existing tag IDs without creating or matching tags by name', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const screen = mount();
  await screen.open();
  await screen.select(['real-tag-1', 'real-tag-2']);
  screen.submit();
  await vi.waitFor(() => expect(screen.dialog()).toBeUndefined());
  expect(screen.onApply).toHaveBeenCalledExactlyOnceWith(
    smartCollectionTemplate('screenshot', ['real-tag-1', 'real-tag-2']),
  );
  expect(fetcher).not.toHaveBeenCalled();
  screen.client.clear();
});

it('creates the real screenshot tag once, then applies the returned ID only when submitted', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      Response.json(
        { tag: { id: 'created-tag', displayName: '截图' } },
        { status: 201 },
      ),
    );
  vi.stubGlobal('fetch', fetcher);
  const screen = mount();
  await screen.open();
  screen.button('创建“截图”标签').props.onPress!();
  await vi.waitFor(() =>
    expect(screen.picker().props.selectedIds).toEqual(['created-tag']),
  );
  expect(fetcher).toHaveBeenCalledOnce();
  expect(fetcher.mock.calls[0][0]).toBe('/api/tags');
  expect(fetcher.mock.calls[0][1].method).toBe('POST');
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ name: '截图' });
  expect(screen.onApply).not.toHaveBeenCalled();
  screen.submit();
  await vi.waitFor(() => expect(screen.dialog()).toBeUndefined());
  expect(screen.onApply).toHaveBeenCalledWith(
    smartCollectionTemplate('screenshot', ['created-tag']),
  );
  screen.client.clear();
});

it('blocks repeat creation, application and keyboard dismissal while creating a tag', async () => {
  let resolve!: (response: Response) => void;
  const fetcher = vi.fn(
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  );
  vi.stubGlobal('fetch', fetcher);
  const screen = mount();
  await screen.open();
  await screen.select(['retained-tag']);
  const create = screen.button('创建“截图”标签').props.onPress!;
  create();
  create();
  screen.submit();
  await vi.waitFor(() =>
    expect(screen.button('取消').props.isDisabled).toBe(true),
  );
  expect(screen.picker().props.disabled).toBe(true);
  expect(
    nodes(screen.dialog()).find((node) => node.type === Modal.Backdrop)?.props
      .isKeyboardDismissDisabled,
  ).toBe(true);
  screen.dialog()!.props.onOpenChange!(false);
  await Promise.resolve();
  expect(screen.dialog()).toBeDefined();
  expect(fetcher).toHaveBeenCalledOnce();
  expect(screen.onApply).not.toHaveBeenCalled();
  resolve(Response.json({ tag: { id: 'created-tag' } }, { status: 201 }));
  await vi.waitFor(() =>
    expect(screen.picker().props.selectedIds).toEqual(['created-tag']),
  );
  expect(screen.button('取消').props.isDisabled).toBe(false);
  screen.client.clear();
});

it('does not apply an empty selection and permits normal keyboard closing when idle', async () => {
  const screen = mount();
  await screen.open();
  expect(screen.button('应用模板').props.isDisabled).toBe(true);
  screen.submit();
  expect(screen.onApply).not.toHaveBeenCalled();
  expect(
    nodes(screen.dialog()).find((node) => node.type === Modal.Backdrop)?.props
      .isKeyboardDismissDisabled,
  ).toBe(false);
  screen.dialog()!.props.onOpenChange!(false);
  await vi.waitFor(() => expect(screen.dialog()).toBeUndefined());
  await screen.open();
  expect(screen.picker().props.selectedIds).toEqual([]);
  expect(screen.errors()).toBe('');
  screen.client.clear();
});

it('retains selected tags and the server error after a rejected creation', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ message: '标签创建被拒绝' }, { status: 400 }),
      ),
  );
  const screen = mount();
  await screen.open();
  await screen.select(['retained-tag']);
  screen.button('创建“截图”标签').props.onPress!();
  await vi.waitFor(() => expect(screen.errors()).toContain('标签创建被拒绝'));
  expect(screen.picker().props.selectedIds).toEqual(['retained-tag']);
  expect(screen.button('创建“截图”标签').props.isDisabled).toBe(false);
  expect(screen.onApply).not.toHaveBeenCalled();
  screen.client.clear();
});

it('delegates an expired owner session instead of applying unconfirmed tags', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ message: '请先登录' }, { status: 401 }),
      ),
  );
  const screen = mount();
  await screen.open();
  await screen.select(['retained-tag']);
  screen.button('创建“截图”标签').props.onPress!();
  await vi.waitFor(() => expect(screen.expire).toHaveBeenCalledOnce());
  expect(screen.picker().props.selectedIds).toEqual(['retained-tag']);
  expect(screen.onApply).not.toHaveBeenCalled();
  screen.client.clear();
});

it('prevents blind creation retries after losing the creation response', async () => {
  const fetcher = vi.fn().mockRejectedValue(new Error('connection lost'));
  vi.stubGlobal('fetch', fetcher);
  const screen = mount();
  await screen.open();
  await screen.select(['retained-tag']);
  screen.button('创建“截图”标签').props.onPress!();
  await vi.waitFor(() => expect(screen.errors()).toContain('尚未确认'));
  expect(screen.button('创建“截图”标签').props.isDisabled).toBe(true);
  screen.button('创建“截图”标签').props.onPress!();
  await Promise.resolve();
  expect(fetcher).toHaveBeenCalledOnce();
  expect(screen.picker().props.selectedIds).toEqual(['retained-tag']);
  screen.client.clear();
});

it.each([
  () => Response.json({ message: '服务端暂时不可用' }, { status: 500 }),
  () => new Response('{', { status: 201 }),
])(
  'does not treat an unconfirmed creation response as safe to blindly repeat',
  async (response) => {
    const fetcher = vi.fn().mockImplementation(async () => response());
    vi.stubGlobal('fetch', fetcher);
    const screen = mount();
    await screen.open();
    await screen.select(['retained-tag']);
    screen.button('创建“截图”标签').props.onPress!();
    await vi.waitFor(() => expect(screen.errors()).toContain('尚未确认'));
    expect(screen.button('创建“截图”标签').props.isDisabled).toBe(true);
    screen.button('创建“截图”标签').props.onPress!();
    await Promise.resolve();
    expect(fetcher).toHaveBeenCalledOnce();
    expect(screen.picker().props.selectedIds).toEqual(['retained-tag']);
    screen.client.clear();
  },
);

it('keeps the chosen tags and dialog open when the library did not accept the filter change', async () => {
  const screen = mount(vi.fn().mockResolvedValue(undefined));
  await screen.open();
  await screen.select(['retained-tag']);
  screen.submit();
  await vi.waitFor(() => expect(screen.onApply).toHaveBeenCalledOnce());
  await vi.waitFor(() => expect(screen.errors()).toContain('未能应用'));
  expect(screen.picker().props.selectedIds).toEqual(['retained-tag']);
  expect(screen.button('应用模板').props.isDisabled).toBe(false);
  screen.client.clear();
});

it('blocks duplicate apply and closing only while application is pending', async () => {
  let resolve!: (value: URLSearchParams) => void;
  const screen = mount(
    vi.fn(
      () =>
        new Promise<URLSearchParams>((done) => {
          resolve = done;
        }),
    ),
  );
  await screen.open();
  await screen.select(['tag']);
  screen.submit();
  screen.submit();
  await vi.waitFor(() =>
    expect(screen.button('取消').props.isDisabled).toBe(true),
  );
  screen.dialog()!.props.onOpenChange!(false);
  await Promise.resolve();
  expect(screen.dialog()).toBeDefined();
  expect(screen.onApply).toHaveBeenCalledOnce();
  resolve(new URLSearchParams('tagId=tag'));
  await vi.waitFor(() => expect(screen.dialog()).toBeUndefined());
  screen.client.clear();
});

it('preserves the selection on an application error and invokes session expiry when needed', async () => {
  const screen = mount(
    vi
      .fn()
      .mockRejectedValue(new SmartCollectionRequestError('会话已过期', 401)),
  );
  await screen.open();
  await screen.select(['tag']);
  screen.submit();
  await vi.waitFor(() => expect(screen.expire).toHaveBeenCalledOnce());
  expect(screen.picker().props.selectedIds).toEqual(['tag']);
  expect(screen.errors()).toContain('会话已过期');
  screen.client.clear();
});
