import {
  Children,
  isValidElement,
  type ComponentProps,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StorageEditor } from '../../../src/components/storage/storage-editor';
import { StorageForm } from '../../../src/components/storage/storage-form';
import { StorageReferenceView } from '../../../src/components/storage/storage-reference-view';
import { StorageConnectionResult } from '../../../src/components/storage/storage-connection-result';
import { StorageLeaveConfirmation } from '../../../src/components/storage/storage-leave-confirmation';
import type { StorageDetail } from '../../../src/components/storage/storage-api';

const hooks = vi.hoisted(() => ({ cells: [] as unknown[], cursor: 0 }));
const requests = vi.hoisted(() => ({ push: vi.fn(), storage: vi.fn() }));
const returnFocus = vi.fn();
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.cells))
      hooks.cells[index] = typeof initial === 'function' ? initial() : initial;
    return [
      hooks.cells[index],
      (next: unknown) => {
        hooks.cells[index] =
          typeof next === 'function' ? next(hooks.cells[index]) : next;
      },
    ];
  },
  useRef: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.cells)) hooks.cells[index] = { current: initial };
    return hooks.cells[index];
  },
  useEffect: () => {},
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: requests.push }),
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: { storage, settings: { defaultStorageId: storage.id } },
    error: null,
    refetch: vi.fn(),
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('../../../src/components/upload/provider', () => ({
  useResetUpload: () => vi.fn(),
  useUploadQueue: () => ({ client: { invalidateQueries: vi.fn() } }),
}));
vi.mock('../../../src/components/storage/storage-api', async (original) => ({
  ...(await original<
    typeof import('../../../src/components/storage/storage-api')
  >()),
  storageRequest: requests.storage,
}));

const storage: StorageDetail = {
  id: 'actual-storage',
  name: '实际存储',
  type: 's3',
  enabled: false,
  localPath: null,
  endpoint: 'https://s3.example.test',
  region: 'auto',
  bucket: 'archive',
  pathPrefix: '',
  forcePathStyle: false,
  hasAccessKey: true,
  hasSecretKey: true,
  configRevision: 1,
  connectionStatus: 'untested',
  connectionRevision: null,
  connectionReport: null,
  connectionTestedAt: null,
  corsStatus: 'untested',
  corsReport: null,
  corsRevision: null,
  corsOrigin: null,
  corsTestedAt: null,
  createdAt: '2026-10-04T00:00:00.000Z',
  updatedAt: '2026-10-04T00:00:00.000Z',
  probes: [],
  references: { counts: { images: 2, uploads: 1, jobs: 1 }, activeWrites: 0 },
  scan: null,
  orphans: { storageId: 'actual-storage', knownBytes: 0, objects: [] },
};
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(node).flatMap((child) => {
    if (!isValidElement<Record<string, unknown>>(child)) return [];
    return [
      child,
      ...elements(
        child.type === StorageLeaveConfirmation
          ? StorageLeaveConfirmation(
              child.props as ComponentProps<typeof StorageLeaveConfirmation>,
            )
          : (child.props.children as ReactNode),
      ),
      ...elements(child.props.footer as ReactNode),
    ];
  });
}
function render() {
  hooks.cursor = 0;
  const ready = StorageEditor({
    storageId: storage.id,
    storageRoot: '/actual/storage',
    name: 'Ariso',
    description: '',
    email: 'owner@example.test',
    ownerName: 'Owner',
  }) as ReactElement<Record<string, unknown>>;
  return (ready.type as (props: Record<string, unknown>) => ReactNode)(
    ready.props,
  );
}
function form(tree: ReactNode) {
  return elements(tree).find((element) => element.type === StorageForm)!
    .props as ComponentProps<typeof StorageForm>;
}
function button(tree: ReactNode, label: string) {
  return elements(tree).find(
    (element) =>
      Children.toArray(element.props.children as ReactNode).includes(label) &&
      typeof element.props.onPress === 'function',
  )!;
}
function press(tree: ReactNode, label: string) {
  (button(tree, label).props.onPress as () => void)();
}
function references(tree: ReactNode) {
  const button = elements(tree).find(
    (element) => element.props['data-testid'] === 'storage-open-cleanup',
  )!;
  (button.props.onPress as () => void)();
  return render();
}
function clickReference(
  tree: ReactNode,
  href: string,
  overrides: Record<string, unknown> = {},
) {
  const view = elements(tree).find(
    (element) => element.type === StorageReferenceView,
  )!;
  const links = elements(
    StorageReferenceView(
      view.props as ComponentProps<typeof StorageReferenceView>,
    ),
  );
  const link = links.find((element) => element.props.href === href)!;
  const event = {
    button: 0,
    defaultPrevented: false,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    currentTarget: { getAttribute: () => '', focus: vi.fn() },
    preventDefault: vi.fn(),
    ...overrides,
  };
  (link.props.onClick as (event: MouseEvent<HTMLAnchorElement>) => void)(
    event as unknown as MouseEvent<HTMLAnchorElement>,
  );
  return event;
}
function dialog(tree: ReactNode) {
  return elements(tree).find(
    (element) => 'isKeyboardDismissDisabled' in element.props,
  )!;
}
beforeEach(() => {
  hooks.cells = [];
  requests.push.mockReset();
  requests.storage.mockReset();
  returnFocus.mockReset();
  vi.stubGlobal('document', { activeElement: { focus: returnFocus } });
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
    callback();
    return 0;
  });
});
afterEach(() => vi.unstubAllGlobals());

it.each(['返回', '取消'])(
  'returns directly to the storage list through %s when the draft is unchanged',
  (label) => {
    press(render(), label);
    expect(requests.push).toHaveBeenCalledExactlyOnceWith('/settings/storage');
    expect(dialog(render()).props.isOpen).toBe(false);
    expect(requests.storage).not.toHaveBeenCalled();
  },
);

it.each(['返回', '取消'])(
  'confirms a dirty editor exit through %s and restores the opener when continuing',
  (label) => {
    const current = form(render());
    current.onChange({ ...current.value, name: '未保存名称' });
    press(render(), label);
    expect(dialog(render()).props.isOpen).toBe(true);
    expect(requests.push).not.toHaveBeenCalled();

    press(render(), '继续编辑');
    expect(dialog(render()).props.isOpen).toBe(false);
    expect(returnFocus).toHaveBeenCalledOnce();
    expect(form(render()).value.name).toBe('未保存名称');

    press(render(), label);
    press(render(), '放弃修改');
    expect(requests.push).toHaveBeenCalledExactlyOnceWith('/settings/storage');
    expect(requests.storage).not.toHaveBeenCalled();
  },
);

it('keeps the S3 draft when returning from its connection result', () => {
  const current = form(render());
  current.onChange({ ...current.value, name: '未保存名称' });
  press(render(), '连接测试结果');
  const result = elements(render()).find(
    (element) => element.type === StorageConnectionResult,
  )!;
  (result.props.onReturn as () => void)();
  expect(form(render()).value.name).toBe('未保存名称');
  expect(requests.push).not.toHaveBeenCalled();
  expect(requests.storage).not.toHaveBeenCalled();
});

it.each(['/library', '/upload', '/trash'])(
  'confirms dirty reference navigation to %s and can continue without losing the draft',
  (href) => {
    let tree = render();
    const current = form(tree);
    current.onChange({ ...current.value, name: '未保存名称' });
    tree = references(render());
    const click = clickReference(tree, href);
    expect(click.preventDefault).toHaveBeenCalledOnce();
    expect(requests.push).not.toHaveBeenCalled();
    tree = render();
    expect(dialog(tree).props.isOpen).toBe(true);
    press(tree, '继续编辑');
    expect(dialog(render()).props.isOpen).toBe(false);
    expect(click.currentTarget.focus).toHaveBeenCalledOnce();
    const view = elements(render()).find(
      (element) => element.type === StorageReferenceView,
    )!;
    (view.props.onReturn as () => void)();
    expect(form(render()).value.name).toBe('未保存名称');

    tree = references(render());
    clickReference(tree, href);
    press(render(), '放弃修改');
    expect(requests.push).toHaveBeenCalledExactlyOnceWith(href);
    expect(requests.storage).not.toHaveBeenCalled();
  },
);

it('preserves clean links and modified or new-tab clicks without intercepting their href', () => {
  const clean = references(render());
  expect(
    clickReference(clean, '/library').preventDefault,
  ).not.toHaveBeenCalled();
  const view = elements(clean).find(
    (element) => element.type === StorageReferenceView,
  )!;
  (view.props.onReturn as () => void)();
  const current = form(render());
  current.onChange({ ...current.value, name: '未保存名称' });
  const dirty = references(render());
  for (const modifier of [
    { ctrlKey: true },
    { metaKey: true },
    { shiftKey: true },
    { altKey: true },
    { button: 1 },
    { button: 2 },
    { defaultPrevented: true },
    { currentTarget: { getAttribute: () => '_blank', focus: vi.fn() } },
  ])
    expect(
      clickReference(dirty, '/library', modifier).preventDefault,
    ).not.toHaveBeenCalled();
  expect(dialog(render()).props.isOpen).toBe(false);
  expect(requests.push).not.toHaveBeenCalled();
});

it('keeps an open leave confirmation and blocks editor exits while saving', async () => {
  let reject!: (reason: Error) => void;
  requests.storage.mockImplementationOnce(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  requests.storage.mockRejectedValue(new Error('readback unavailable'));
  const current = form(render());
  current.onChange({ ...current.value, name: '未保存名称' });
  press(render(), '返回');
  form(render()).onSubmit();
  const tree = render();
  expect(dialog(tree).props.isKeyboardDismissDisabled).toBe(true);
  expect(button(tree, '继续编辑').props.isDisabled).toBe(true);
  expect(button(tree, '放弃修改').props.isDisabled).toBe(true);
  (dialog(tree).props.onOpenChange as (open: boolean) => void)(false);
  press(tree, '返回');
  press(tree, '取消');
  expect(dialog(render()).props.isOpen).toBe(true);
  expect(returnFocus).not.toHaveBeenCalled();
  expect(requests.push).not.toHaveBeenCalled();
  reject(new Error('save response unavailable'));
  for (let i = 0; i < 5; i++) await Promise.resolve();
});

it.each(['reference', 'return'])(
  'blocks reference exits while saving and confirms an unknown %s exit even after restoring the draft',
  async (exit) => {
    let reject!: (reason: Error) => void;
    requests.storage.mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    requests.storage.mockRejectedValue(new Error('readback unavailable'));
    let tree = render();
    const current = form(tree);
    current.onChange({ ...current.value, name: '未保存名称' });
    form(render()).onSubmit();
    tree = references(render());
    expect(
      clickReference(tree, '/upload').preventDefault,
    ).toHaveBeenCalledOnce();
    expect(dialog(render()).props.isOpen).toBe(false);
    reject(new Error('save response unavailable'));
    for (let i = 0; i < 5; i++) await Promise.resolve();
    const view = elements(render()).find(
      (element) => element.type === StorageReferenceView,
    )!;
    (view.props.onReturn as () => void)();
    const failedForm = form(render());
    failedForm.onChange({ ...failedForm.value, name: storage.name });
    if (exit === 'reference') {
      tree = references(render());
      clickReference(tree, '/upload');
    } else press(render(), '返回');
    tree = render();
    expect(dialog(tree).props.isOpen).toBe(true);
    expect(
      elements(tree).some(
        (element) =>
          element.props.children ===
          '本次保存结果尚未确认。离开后请核对已保存配置。',
      ),
    ).toBe(true);
    press(tree, '放弃修改');
    expect(requests.push).toHaveBeenCalledExactlyOnceWith(
      exit === 'reference' ? '/upload' : '/settings/storage',
    );
  },
);
