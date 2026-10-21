import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { ArchiveDialog } from '../../../src/components/library/archive-dialog';
import type { LibraryArchive } from '../../../src/components/library/use-library-archive';

vi.mock('@heroui/react/modal', () => {
  const pass = ({ children }: { children: ReactNode }) => children;
  return {
    Modal: Object.assign(pass, {
      Backdrop: pass,
      Container: pass,
      Dialog: pass,
      Header: pass,
      Heading: pass,
      Body: pass,
      Footer: pass,
    }),
  };
});

function state(): LibraryArchive {
  return {
    workspace: {
      items: [
        {
          id: 'local',
          displayName: '旅行照片.png',
          thumbnailUrl: '/i/local?type=thumbnail',
          storage: { id: 'disk', name: '本地存储', enabled: true },
          visibility: 'public',
          hasAlbums: false,
        },
        {
          id: 'remote',
          displayName: '旅行照片.png',
          thumbnailUrl: '/i/remote?type=thumbnail',
          storage: { id: 'r2', name: 'Cloudflare R2', enabled: true },
          visibility: 'private',
          hasAlbums: false,
        },
      ],
      currentCount: 1,
      query: '',
      version: 'original',
      excluded: [],
      phase: 'ready',
      error: null,
      result: {
        items: [
          {
            imageId: 'local',
            displayName: '旅行照片.png',
            filename: '旅行照片.png',
            byteSize: 1024,
          },
          {
            imageId: 'remote',
            displayName: '旅行照片.png',
            filename: '旅行照片 (2).png',
            byteSize: 2048,
          },
        ],
        unavailable: [],
        totalBytes: 3072,
        downloadUrl: '/api/images/archives/ticket',
        expiresAt: '2026-10-21T10:00:00Z',
      },
    },
    pending: false,
    open: vi.fn(),
    close: vi.fn(),
    recheck: vi.fn(),
    chooseVersion: vi.fn(),
    excludeUnavailable: vi.fn(),
    start: vi.fn(),
  };
}
const render = (archive: LibraryArchive) =>
  renderToStaticMarkup(createElement(ArchiveDialog, { archive }));

it('shows each download identity with a 48px thumbnail, visibility, storage and its actual filename and size', () => {
  const html = render(state());
  expect(html).toContain('src="/i/local?type=thumbnail"');
  expect(html).toContain('src="/i/remote?type=thumbnail"');
  expect(html.match(/width="48" height="48"/g)).toHaveLength(2);
  expect(html).toContain('本地存储');
  expect(html).toContain('Cloudflare R2');
  expect(html).toContain('公开');
  expect(html).toContain('私有');
  expect(html).toContain('旅行照片 (2).png');
  expect(html).toContain('1.0 KiB');
  expect(html).toContain('2.0 KiB');
});

it('keeps the source identity alongside a failed item without requesting disabled-storage thumbnails', () => {
  const archive = state();
  archive.workspace!.items[1].storage.enabled = false;
  archive.workspace!.result!.items.pop();
  archive.workspace!.result!.downloadUrl = null;
  archive.workspace!.result!.unavailable = [
    { imageId: 'remote', displayName: '旅行照片.png', reason: '存储已停用' },
  ];
  const html = render(archive);
  expect(html).toContain('Cloudflare R2');
  expect(html).toContain('存储已停用');
  expect(html).toContain('aria-label="暂无可读缩略图"');
  expect(html).not.toContain('src="/i/remote?type=thumbnail"');
  expect(html).toContain('从本次下载排除这 1 张');
  expect(html).toContain('data-slot="alert-root"');
  expect(html).toContain('data-slot="alert-indicator"');
  const alertContent = html.match(
    /data-slot="alert-content"[\s\S]*?<\/div>/,
  )?.[0];
  expect(alertContent).toContain('张图片不可下载');
  expect(alertContent).toContain('从本次下载排除这 1 张');
});

it('presents a download read failure in the same illustrated danger alert pattern and retains retry', () => {
  const archive = state();
  archive.workspace!.error = '无法读取 Cloudflare R2 文件，尚未开始下载。';
  archive.workspace!.result = null;
  const html = render(archive);
  expect(html).toContain('data-slot="alert-root"');
  expect(html).toContain('data-slot="alert-indicator"');
  expect(html).toContain('alert--danger');
  expect(html).toContain('无法读取 Cloudflare R2 文件，尚未开始下载。');
  expect(html).toContain('重新检查');
});

it('removes an explicitly excluded row while retaining the original gallery selection', () => {
  const archive = state();
  archive.workspace!.excluded = ['remote'];
  archive.workspace!.result!.items.pop();
  archive.workspace!.result!.totalBytes = 1024;
  const html = render(archive);
  expect(html).toContain('src="/i/local?type=thumbnail"');
  expect(html).not.toContain('Cloudflare R2');
  expect(html).not.toContain('src="/i/remote?type=thumbnail"');
  expect(html).toContain('图库选择未改变');
  expect(archive.workspace!.items).toHaveLength(2);
});
