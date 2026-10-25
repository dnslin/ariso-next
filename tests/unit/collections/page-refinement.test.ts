vi.mock('../../../src/components/upload/fingerprint-coverage', () => ({
  UploadFingerprintCoverage: () => null,
}));
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { AlbumsScreen } from '../../../src/app/albums/screen';
import { TagsScreen } from '../../../src/app/tags/screen';
import { SharesScreen } from '../../../src/app/shares/list-screen';
import { SettingsHeading } from '../../../src/components/shell/settings-categories';
import { UploadSettingsFields } from '../../../src/components/upload/settings';
import { UploadScreen } from '../../../src/components/upload/screen';

const runtime = vi.hoisted(() => ({
  total: 0,
  error: null as Error | null,
  started: false,
  items: [] as { id: string; state: string; draftKey?: string }[],
  albums: [] as { id: string; name: string }[],
}));
const navigationCache = new QueryClient();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/settings/general',
}));
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => navigationCache,
  useQuery: () => ({
    data: { items: [], total: runtime.total },
    error: runtime.error,
    isError: !!runtime.error,
    isPending: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));
vi.mock('../../../src/components/shell/owner-shell', () => ({
  OwnerShell: ({
    children,
    footer,
  }: {
    children: ReactNode;
    footer?: ReactNode;
  }) => createElement('main', null, children, footer),
}));
vi.mock('../../../src/app/library/library-screen', () => ({
  LibraryScreen: () => null,
}));
vi.mock('../../../src/components/upload/provider', () => ({
  useResetUpload: () => vi.fn(),
  useUploadDraft: () => ({
    chosenAlbums: [],
    chosenTags: [],
    setAlbums: vi.fn(),
    setTags: vi.fn(),
    setStorageId: vi.fn(),
    setVisibility: vi.fn(),
  }),
  uploadTerminalStates: new Set([
    'ready',
    'upload-failed',
    'processing-failed',
    'cancelled',
  ]),
  useUploadQueue: () => ({
    controller: { hasStarted: runtime.started },
    query: { refetch: vi.fn(), isFetching: false, error: null },
    client: {},
    chosenAlbums: [],
    chosenTags: [],
    setAlbums: vi.fn(),
    setTags: vi.fn(),
    expire: vi.fn(),
    items: runtime.items,
    settings: {
      maxFileBytes: 50 * 1048576,
      queueLimit: 500,
      batchSize: 20,
      defaultVisibility: 'public',
      defaultStorageId: 'local',
      storages: [{ id: 'local', name: '默认本地存储', enabled: true }],
      albums: runtime.albums,
      tags: [],
    },
    setStorageId: vi.fn(),
    setVisibility: vi.fn(),
  }),
}));
vi.mock('../../../src/components/library/use-detail-query', () => ({
  useDetailQuery: () => ({}),
}));
vi.mock('../../../src/components/upload/input-controls', () => ({
  useUploadInput: () => ({
    controls: null,
    zoneProps: {},
    dragging: false,
    chooseFiles: vi.fn(),
    chooseDirectory: vi.fn(),
  }),
  UploadInputDialog: () => null,
}));
vi.mock('../../../src/components/upload/item', () => ({
  UploadQueueItem: () => null,
}));
vi.mock('../../../src/components/upload/submission-summary', () => ({
  UploadSubmissionSummaries: () => null,
}));

const shell = {
  name: 'Ariso',
  description: '',
  ownerName: 'Owner',
  email: 'owner@example.test',
  initialSidebarCollapsed: false,
  timeZone: 'Asia/Shanghai',
};

beforeEach(() => {
  runtime.total = 0;
  runtime.error = null;
  runtime.started = false;
  runtime.items = [];
  runtime.albums = [];
});

it('keeps exactly one album creation action in the toolbar of the empty list', () => {
  const html = renderToStaticMarkup(createElement(AlbumsScreen, shell));
  expect(html.match(/新建相册/g)).toHaveLength(1);
  expect(html).toContain('暂无相册');
  expect(html).not.toContain('创建第一本相册');
  expect(html).not.toContain('创建一本相册，开始整理图片');
  expect(html).not.toContain('用相册整理图片');
});

it('removes the idle upload subtitle while keeping the actual file limit', () => {
  const html = renderToStaticMarkup(createElement(UploadScreen, shell));
  expect(html).toContain('上传图片');
  expect(html).not.toContain('选择图片，确认本次设置后开始上传');
  expect(html).toContain('单文件最大 50.0 MiB');
});

it('keeps real upload outcome counts and the clear-result consequence visible', () => {
  runtime.items = [
    { id: 'ready', state: 'ready' },
    { id: 'failed', state: 'upload-failed' },
    { id: 'cancelled', state: 'cancelled' },
  ];
  const html = renderToStaticMarkup(createElement(UploadScreen, shell));
  expect(html).toContain('本次上传结果');
  expect(html).toContain(
    '新增成功 1 张 · 重复跳过 0 张 · 失败 1 张 · 取消 1 张',
  );
  expect(html).toContain('清空结果不会删除图片');
});

it('shows the actual source album and an explicit completed-upload return to the same album query', () => {
  runtime.albums = [{ id: 'album', name: '服务端相册名称' }];
  runtime.items = [{ id: 'ready', state: 'ready', draftKey: 'album:album' }];
  const html = renderToStaticMarkup(
    createElement(UploadScreen, {
      ...shell,
      albumId: 'album',
      returnTo: '/albums/album?page=2',
    }),
  );
  expect(html).toContain('服务端相册名称');
  expect(html).toContain('href="/albums/album?page=2"');
  expect(html).toContain('返回相册</a>');
  expect(html).toContain('成功 1 张');
});

it('keeps the tag count policy behind a closed help button', () => {
  const html = renderToStaticMarkup(createElement(TagsScreen, shell));
  expect(html).toContain('aria-label="标签数量说明"');
  expect(html).toContain('aria-expanded="false"');
  expect(html).not.toContain('图片数量不含回收站');
  expect(html).toContain('暂无标签');
  expect(html.match(/新建标签/g)).toHaveLength(1);
});

it('retains tag read failure text instead of rendering a normal empty result', () => {
  runtime.error = new Error('标签读取断开');
  const html = renderToStaticMarkup(createElement(TagsScreen, shell));
  expect(html).toContain('暂时无法读取标签列表');
  expect(html).toContain('标签读取断开');
  expect(html).not.toContain('暂无标签');
});

it('removes settings and share title repetition without removing the album destination', () => {
  const heading = renderToStaticMarkup(createElement(SettingsHeading));
  expect(heading).toContain('站点设置');
  expect(heading).not.toContain('管理站点、图片处理与账号偏好');
  const share = renderToStaticMarkup(createElement(SharesScreen, shell));
  expect(share).toContain('分享');
  expect(share).not.toContain('分享相册中的公开图片，控制密码与有效期');
  expect(share).toContain('href="/albums"');
});

it.each([false, true])(
  'hides upload setting policy while retaining choices and visible storage errors; started=%s',
  (started) => {
    runtime.started = started;
    const html = renderToStaticMarkup(
      createElement(UploadSettingsFields, {
        settings: {
          maxFileBytes: 50 * 1048576,
          queueLimit: 500,
          batchSize: 20,
          defaultVisibility: 'private',
          defaultStorageId: 'local',
          storages: [{ id: 'local', name: '默认本地存储', enabled: false }],
          albums: [],
          tags: [],
        },
        storageId: 'local',
        visibility: 'private',
        disabled: false,
        onStorage: vi.fn(),
        onVisibility: vi.fn(),
      }),
    );
    expect(html).toContain(started ? '下一次上传设置' : '本次上传设置');
    expect(html).toContain('aria-label="上传设置说明"');
    expect(html).not.toContain('开始上传时固定本次设置');
    expect(html).not.toContain('已提交的批次沿用冻结设置');
    expect(html).toContain('暂无可用存储，请先配置并启用存储');
    expect(html).toContain('选择相册（可多选）');
    expect(html).toContain('选择标签（可多选）');
  },
);
