import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ImageShareDialog } from '../../../src/components/sharing/image-share-dialog';
import { DetailImageShare } from '../../../src/components/library/detail-image-share';
import type {
  LibraryDetail,
  LibraryDetailVersion,
} from '../../../src/server/library/detail-types';
import type { OwnerImageShareSettings } from '../../../src/server/sharing/image-configuration';

const { state, query } = vi.hoisted(() => ({
  state: {
    settings: null as OwnerImageShareSettings | null,
    pending: null as 'read' | null,
  },
  query: vi.fn(),
}));
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof import('@tanstack/react-query')>()),
  useQuery: query,
}));
vi.mock('../../../src/components/sharing/image-share-session', () => ({
  ImageShareSession: class {
    getSnapshot = () => ({ ...state, error: '', message: '', unknown: false });
    subscribe = () => () => {};
    start = vi.fn();
    stop = vi.fn();
    read = vi.fn();
    create = vi.fn();
    revoke = vi.fn();
  },
}));
vi.mock('@heroui/react/modal', () => {
  const pass = ({ children }: { children: ReactNode }) => children;
  return {
    Modal: Object.assign(pass, {
      Backdrop: pass,
      Container: pass,
      Dialog: ({ children }: { children: ReactNode }) =>
        createElement('div', { 'data-mocked-dialog': true }, children),
      Header: pass,
      Heading: pass,
      Body: ({ children, ...props }: { children: ReactNode }) =>
        createElement('div', props, children),
      Footer: pass,
    }),
  };
});

function version(kind: LibraryDetailVersion['kind']): LibraryDetailVersion {
  return {
    kind,
    contentId: `${kind}-content`,
    applicable: true,
    saved: true,
    status: 'saved',
    format: kind === 'original' ? 'JPEG' : 'WEBP',
    mime: kind === 'original' ? 'image/jpeg' : 'image/webp',
    width: 1200,
    height: 800,
    byteSize: 1024,
    previewPath: `/i/secret?type=${kind}`,
    downloadPath: null,
    links: null,
    unavailableReason: null,
  };
}
const detail: LibraryDetail = {
  id: 'secret',
  displayName: '私有旅行照片.jpg',
  originalName: 'original.jpg',
  format: 'JPEG',
  mime: 'image/jpeg',
  width: 3600,
  height: 2400,
  byteSize: 4096,
  animated: false,
  pageCount: 1,
  classification: 'static',
  visibility: 'private',
  processingStatus: 'ready',
  createdAt: '2026-10-21T00:00:00Z',
  trashedAt: null,
  deletionStatus: null,
  storage: { id: 'local', name: '本地存储', enabled: true },
  albums: [],
  tags: [],
  versions: [version('original'), version('compressed'), version('thumbnail')],
  defaultVersion: 'compressed',
  defaultLink: {
    actualVersion: 'compressed',
    links: null,
    downloadPath: null,
    unavailableReason: null,
  },
  activeJob: null,
  latestFailedJob: null,
  metadataJob: null,
  processingJob: null,
  reprocess: {
    scopes: { all: null, compressed: null, thumbnail: null, watermark: null },
    expectedVersions: ['compressed', 'thumbnail'],
    compressionEnabled: true,
    watermarkEnabled: false,
  },
  actions: {
    editUnavailableReason: null,
    reprocessUnavailableReason: null,
    metadataReadUnavailableReason: null,
  },
};
beforeEach(() => {
  query.mockReset();
  query.mockReturnValue({
    data: detail,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  });
  state.settings = {
    share: null,
    sourceVersion: 'compressed',
    unavailableReason: null,
    timeZone: 'Asia/Shanghai',
  };
  state.pending = null;
});
afterEach(() => vi.unstubAllGlobals());
const renderDialog = () =>
  renderToStaticMarkup(
    createElement(ImageShareDialog, {
      imageId: detail.id,
      displayName: detail.displayName,
      onClose: vi.fn(),
    }),
  );

it('uses the disclosed source role for the main preview and 80px identity photo instead of guessing the original', () => {
  const html = renderDialog();
  expect(html).toMatch(
    /data-testid="detail-preview"[^>]*src="\/i\/secret\?type=compressed"/,
  );
  expect(html).toContain('size-20');
  expect(html.match(/src="\/i\/secret\?type=compressed"/g)).toHaveLength(2);
  expect(html).not.toContain('src="/i/secret?type=original"');
  expect(html).toContain('私有旅行照片.jpg');
  expect(html).toContain('分享压缩图');
});
it('keeps original-file disclosure and preview aligned with the server-selected original role', () => {
  state.settings!.sourceVersion = 'original';
  const html = renderDialog();
  expect(html).toMatch(
    /data-testid="detail-preview"[^>]*src="\/i\/secret\?type=original"/,
  );
  expect(html).toContain('GPS');
  expect(html).toContain('访客可以保存原文件');
  expect(html).toContain('alert--danger');
  expect(html).toContain('data-slot="alert-indicator"');
});
it('groups the create-state privacy and save consequences in the illustrated informational notice', () => {
  const html = renderDialog();
  expect(html).toContain('alert--accent');
  expect(html).toContain('data-slot="alert-indicator"');
  const notice = html.match(/data-slot="alert-content"[\s\S]*?<\/div>/)?.[0];
  expect(notice).toContain('图片保持私有，普通图片外链仍需登录');
  expect(notice).toContain('可以查看并保存已显示的图片');
});
it('groups active-share revocation and saved-image consequences in the same notice pattern', () => {
  state.settings!.share = {
    imageId: detail.id,
    token: 'temporary-secret-token',
    sourceVersion: 'compressed',
    url: 'https://ariso.test/s/image/temporary-secret-token',
    expiresAt: '2026-10-22T00:00:00Z',
    revokedAt: null,
    createdAt: '2026-10-21T00:00:00Z',
    state: 'active',
  };
  const html = renderDialog();
  expect(html).toContain('分享已创建');
  expect(html).toContain('alert--accent');
  expect(html).toContain('data-slot="alert-indicator"');
  const notice = html.match(/data-slot="alert-content"[\s\S]*?<\/div>/)?.[0];
  expect(notice).toContain('替换原图、回收或改为公开会永久撤销此地址');
  expect(notice).toContain('已经显示或保存的图片无法收回');
  expect(html).toContain('复制地址');
  expect(html).toContain('预览访客页');
  expect(html).toContain('撤销分享');
});
it('embeds the shared body inside the existing detail shell without another dialog', () => {
  const html = renderToStaticMarkup(
    createElement(DetailImageShare, { detail, onClose: vi.fn() }),
  );
  expect(html).not.toContain('data-mocked-dialog');
  expect(html).toContain('返回图片详情');
  expect(html).toContain('data-testid="image-share-body"');
  expect(html).toContain('data-testid="detail-preview"');
});
it('does not render a guessed image before its share role has been read', () => {
  state.settings = null;
  state.pending = 'read';
  const html = renderDialog();
  expect(html).not.toContain('data-testid="detail-preview"');
  expect(html).not.toContain('src="/i/secret?type=original"');
  expect(html).toContain('正在核对');
});
it('loads the actual owner-only image detail for the management dialog through the existing query', async () => {
  renderDialog();
  const options = query.mock.calls[0]?.[0];
  expect(options?.queryFn).toBeTypeOf('function');
  const fetcher = vi.fn().mockResolvedValue(Response.json(detail));
  vi.stubGlobal('fetch', fetcher);
  const signal = new AbortController().signal;
  expect(await options.queryFn({ signal })).toEqual(detail);
  expect(fetcher).toHaveBeenCalledWith(
    '/api/images/secret',
    expect.objectContaining({ signal, cache: 'no-store' }),
  );
});
