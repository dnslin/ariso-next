import { Children, createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import type {
  UploadItem,
  UploadRelation,
} from '../../../src/components/upload/types';
import type { UploadSettings } from '../../../src/components/upload/settings';
import { UploadScreen } from '../../../src/components/upload/screen';
import { UploadDraftSummary } from '../../../src/components/upload/draft-summary';

const state = vi.hoisted(() => ({
  items: [] as UploadItem[],
  storageId: undefined as string | undefined,
  visibility: undefined as 'public' | 'private' | undefined,
  albums: [] as UploadRelation[],
  tags: [] as UploadRelation[],
  start: vi.fn(),
  paused: false,
}));
const settings: UploadSettings = {
  maxFileBytes: 50 * 1048576,
  queueLimit: 500,
  batchSize: 20,
  defaultStorageId: 'local',
  defaultVisibility: 'private',
  storages: [
    { id: 'local', name: '本地存储', enabled: true },
    { id: 'travel', name: '旅行照片 · S3', enabled: true },
    { id: 'disabled', name: '归档存储', enabled: false },
    {
      id: 'long',
      name: '旅行照片与日常记录的长期归档存储'.repeat(8),
      enabled: true,
    },
  ],
  albums: [{ id: 'forest', name: '森林漫步' }],
  tags: [{ id: 'nature', displayName: '自然' }],
};
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../../../src/components/upload/provider', () => ({
  useUploadQueue: () => ({
    settings,
    items: state.items,
    client: {},
    query: {},
    controller: { start: state.start },
    refreshSettings: vi.fn(),
  }),
  useUploadDraft: () => ({
    chosenStorageId: state.storageId,
    chosenVisibility: state.visibility,
    chosenAlbums: state.albums,
    chosenTags: state.tags,
    setStorageId: vi.fn(),
    setVisibility: vi.fn(),
  }),
  uploadTerminalStates: new Set([
    'ready',
    'upload-failed',
    'processing-failed',
    'cancelled',
  ]),
}));
vi.mock('../../../src/components/shell/owner-shell', () => ({
  OwnerShell: ({
    children,
    footer,
  }: {
    children: ReactNode;
    footer: ReactNode;
  }) =>
    createElement(
      'main',
      null,
      children,
      createElement('footer', null, footer),
    ),
}));
vi.mock('../../../src/components/upload/input-controls', () => ({
  useUploadInput: () => ({
    controls: null,
    zoneProps: {},
    chooseFiles: vi.fn(),
    chooseDirectory: vi.fn(),
  }),
  UploadInputDialog: () => null,
}));
vi.mock('../../../src/components/upload/item', () => ({
  UploadQueueItem: ({ item }: { item: UploadItem }) =>
    createElement('div', { 'data-testid': 'upload-item' }, item.name),
}));
vi.mock('../../../src/components/upload/settings', () => ({
  UploadSettingsFields: () =>
    createElement('section', { 'aria-label': '完整上传设置' }),
}));
vi.mock('../../../src/components/library/detail', () => ({
  LibraryDetail: () => null,
}));
vi.mock('../../../src/components/library/use-detail-query', () => ({
  useDetailQuery: () => ({}),
}));
vi.mock('../../../src/components/component-entrance', () => ({
  ComponentEntrance: ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => createElement('div', { className }, children),
}));
const props = {
  name: 'Ariso',
  description: '',
  email: 'owner@example.test',
  ownerName: 'Owner',
  initialSidebarCollapsed: false,
};
function render() {
  return renderToStaticMarkup(createElement(UploadScreen, props));
}
function queue(count: number) {
  return Array.from({ length: count }, (_, index): UploadItem => ({
    id: `file-${index}`,
    name: `${'秋日旅行照片'.repeat(12)}-${index}.jpg`,
    size: 2000,
    previewUrl: null,
    state: 'queued',
    progress: 0,
  }));
}
function draftMarkup(html: string) {
  const start = html.indexOf('data-testid="upload-draft-summary"');
  expect(start).toBeGreaterThanOrEqual(0);
  const end = html.indexOf('data-testid="upload-queue"', start);
  return html.slice(start, end);
}
beforeEach(() => {
  vi.clearAllMocks();
  state.paused = false;
  state.items = queue(1);
  state.storageId = undefined;
  state.visibility = undefined;
  state.albums = [];
  state.tags = [];
});

it.each([1, 12, 20])(
  'shows the current settings before a %i-file queue without starting upload',
  (count) => {
    state.items = queue(count);
    const html = render();
    const summary = draftMarkup(html);
    expect(summary).toContain('本次设置');
    expect(summary).toContain('本地存储');
    expect(summary).toContain('私有');
    expect(summary).toContain('0 个相册');
    expect(summary).toContain('0 个标签');
    expect(summary).toContain('修改上传设置');
    expect(html.match(/data-testid="upload-item"/g)).toHaveLength(count);
    expect(html.indexOf('data-testid="upload-draft-summary"')).toBeLessThan(
      html.indexOf('data-testid="upload-queue"'),
    );
    expect(state.start).not.toHaveBeenCalled();
  },
);

it('reflects current draft choices while leaving an earlier frozen submission intact', () => {
  const frozen: NonNullable<UploadItem['frozenSubmission']> = {
    id: 'old',
    number: 1,
    count: 1,
    groups: [1],
    storageName: '本地存储',
    visibility: 'private',
    albums: [{ id: 'forest', name: '森林漫步' }],
    tags: [{ id: 'nature', name: '自然' }],
  };
  state.items = [
    ...queue(1),
    {
      ...queue(1)[0],
      id: 'completed',
      state: 'ready',
      frozenSubmission: frozen,
    },
  ];
  const previous = draftMarkup(render());
  expect(previous).toContain('本地存储');
  expect(previous).toContain('私有');
  state.storageId = 'travel';
  state.visibility = 'public';
  state.albums = [
    { id: 'forest', name: '森林漫步' },
    { id: 'other', name: '山野' },
  ];
  state.tags = [{ id: 'nature', name: '自然' }];
  const html = render();
  const summary = draftMarkup(html);
  expect(summary).toContain('下一次设置');
  expect(summary).toContain('旅行照片 · S3');
  expect(summary).toContain('公开');
  expect(summary).toContain('2 个相册');
  expect(summary).toContain('1 个标签');
  expect(html).toContain('存储：本地存储');
  expect(html).toContain(
    '本次上传沿用开始时的设置，所有上传合计最多同时传输 3 张。',
  );
  expect(html).not.toContain('个传输名额');
  expect(frozen).toEqual({
    id: 'old',
    number: 1,
    count: 1,
    groups: [1],
    storageName: '本地存储',
    visibility: 'private',
    albums: [{ id: 'forest', name: '森林漫步' }],
    tags: [{ id: 'nature', name: '自然' }],
  });
});

it('identifies a disabled selection instead of presenting it as available', () => {
  state.storageId = 'disabled';
  const summary = draftMarkup(render());
  expect(summary).toContain('归档存储');
  expect(summary).toContain('已停用');
});

it('keeps a long storage name complete in the compact summary', () => {
  state.storageId = 'long';
  expect(draftMarkup(render())).toContain(settings.storages[3].name);
});

it('does not claim a storage selection when the configured default is missing', () => {
  state.storageId = 'missing';
  expect(draftMarkup(render())).toContain('未选择可用存储');
});

it('does not silently choose an enabled default after storage recovery cleared the unavailable choice', () => {
  state.storageId = '';
  const html = render();
  expect(draftMarkup(html)).toContain('未选择可用存储');
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>开始上传<\/button>/);
  expect(state.start).not.toHaveBeenCalled();
});

it('does not add a redundant compact summary to the empty picker', () => {
  state.items = [];
  expect(render()).not.toContain('data-testid="upload-draft-summary"');
});

function action(node: ReactNode): (() => void) | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement(child)) continue;
    const props = child.props as {
      'aria-label'?: string;
      onPress?: () => void;
      children?: ReactNode;
    };
    if (props['aria-label'] === '修改上传设置') return props.onPress!;
    const nested = action(props.children);
    if (nested) return nested;
  }
}

it('modifying settings immediately scrolls and focuses the original selector for the next action', () => {
  const selector = { focus: vi.fn() };
  const section = {
    scrollIntoView: vi.fn(),
    querySelector: vi.fn(() => selector),
    focus: vi.fn(),
  };
  const summary = UploadDraftSummary({
    storage: settings.storages[0],
    visibility: 'private',
    albumCount: 0,
    tagCount: 0,
    started: false,
    settingsRef: { current: section as unknown as HTMLDivElement },
  });
  action(summary)!();
  expect(section.scrollIntoView).toHaveBeenCalledWith({
    block: 'start',
    behavior: 'instant',
  });
  expect(selector.focus).toHaveBeenCalledWith({ preventScroll: true });
  expect(section.focus).not.toHaveBeenCalled();
  expect(state.start).not.toHaveBeenCalled();
});

it('focuses the settings section when no selector can be operated', () => {
  const section = {
    scrollIntoView: vi.fn(),
    querySelector: vi.fn(() => null),
    focus: vi.fn(),
  };
  const summary = UploadDraftSummary({
    storage: undefined,
    visibility: 'private',
    albumCount: 0,
    tagCount: 0,
    started: false,
    settingsRef: { current: section as unknown as HTMLDivElement },
  });
  action(summary)!();
  expect(section.focus).toHaveBeenCalledWith({ preventScroll: true });
});

vi.mock('../../../src/components/backup/use-backup-activity', () => ({
  useBackupActivity: () => ({ paused: state.paused }),
}));

it('retains the upload draft but disables starting it during a backup', () => {
  state.paused = true;
  const html = render();
  expect(html).toMatch(/<button[^>]*disabled[^>]*>开始上传<\/button>/);
  expect(html).toContain('本地存储');
  expect(state.start).not.toHaveBeenCalled();
});
