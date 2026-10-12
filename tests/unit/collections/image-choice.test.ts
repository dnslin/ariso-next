import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { AlbumImageChoice } from '../../../src/app/albums/image-choice';
import type { LibraryItem } from '../../../src/server/library/types';

const item: LibraryItem = {
  id: 'image',
  displayName: '旅行照片.png',
  originalName: 'original.png',
  byteSize: 1048576,
  format: 'png',
  width: 640,
  height: 480,
  visibility: 'private',
  hasAlbums: true,
  processingStatus: 'processing',
  createdAt: '2026-10-11T00:00:00Z',
  storage: { id: 'local', name: '本地存储', enabled: true },
  versions: {
    original: true,
    compressed: false,
    thumbnail: true,
    watermark: false,
  },
  thumbnailUrl: '/i/image?type=thumbnail',
  thumbnailDimensions: { width: 640, height: 480 },
  activeJob: {
    id: 'job',
    status: 'running',
    scope: 'all',
    step: 'compressed',
    error: null,
  },
  latestFailedJob: null,
  metadataJob: null,
  processingJob: null,
  trashedAt: null,
  deletionStatus: null,
};
function render(patch: Partial<Parameters<typeof AlbumImageChoice>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(AlbumImageChoice, {
      item,
      existing: false,
      selected: false,
      disabled: false,
      onToggle: vi.fn(),
      ...patch,
    }),
  );
}

it('renders only a 4:3 thumbnail and name with an always-visible 44px selection target', () => {
  const html = render({ selected: true });
  expect(html).toContain('aspect-[4/3]');
  expect(html).toContain('rounded-lg border-2 border-accent');
  expect(html).toContain('旅行照片.png</span>');
  expect(html).toContain('src="/i/image?type=thumbnail"');
  expect(html).toContain('data-selected="true"');
  expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*checked=""/);
  expect(html).toContain('flex size-11 items-center justify-center rounded-lg');
  expect(html).not.toContain('opacity-0');
  expect(html).not.toContain('library-card');
  expect(html).not.toContain('rounded-2xl');
  for (const metadata of ['MiB', '私有', '处理中', '本地存储', '当前任务'])
    expect(html).not.toContain(metadata);
});

it('marks existing members at the top right and disables their only selection button', () => {
  const html = render({ existing: true });
  expect(html).toContain('data-existing="true"');
  expect(html).toContain('aria-label="已添加图片：旅行照片.png"');
  expect(html.match(/<button\b/g)).toHaveLength(1);
  expect(html).toMatch(/<button[^>]*disabled/);
  expect(html).toContain('absolute top-3 right-3');
  expect(html).toContain('已添加');
  expect(html).not.toContain('type="checkbox"');
});

it('locks both selection controls while pending or membership is being read', () => {
  const html = render({ disabled: true });
  expect(html).toMatch(/<button[^>]*disabled/);
  const checkbox = html.match(/<input\b[^>]*>/)?.[0];
  expect(checkbox).toContain('type="checkbox"');
  expect(checkbox).toContain('disabled=""');
});

it('does not request a disabled storage thumbnail or replace a missing thumbnail with an original', () => {
  const disabled = render({
    item: { ...item, storage: { ...item.storage, enabled: false } },
  });
  expect(disabled).toContain('存储已停用');
  expect(disabled).not.toContain('<img');
  const missing = render({ item: { ...item, thumbnailUrl: null } });
  expect(missing).toContain('暂无缩略图');
  expect(missing).not.toContain('<img');
});
