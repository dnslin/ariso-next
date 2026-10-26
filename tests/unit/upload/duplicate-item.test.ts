import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { UploadQueueItem } from '../../../src/components/upload/item';
import type { UploadController } from '../../../src/components/upload/controller';
import type { UploadItem } from '../../../src/components/upload/types';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
const existing = vi.hoisted(() => ({
  trashedAt: null as string | null,
  enabled: false,
}));
vi.mock('../../../src/components/upload/provider', () => ({
  useResetUpload: () => vi.fn(),
}));
vi.mock('../../../src/components/upload/result', () => ({
  useUploadResult: () => ({
    data: {
      trashedAt: existing.trashedAt,
      processingStatus: 'failed',
      visibility: 'private',
      versions: [],
      storage: { enabled: existing.enabled },
    },
  }),
  UploadResult: () => null,
}));
const item: UploadItem = {
  id: 'queue',
  name: 'renamed.png',
  size: 42,
  previewUrl: null,
  state: 'duplicate',
  progress: 100,
  existingImageId: 'old-image',
  existingImageTrashed: false,
  visibility: 'public',
  canRetry: false,
};
function render() {
  return renderToStaticMarkup(
    createElement(UploadQueueItem, {
      item,
      controller: {} as UploadController,
      client: new QueryClient(),
      onOpen: vi.fn(),
    }),
  );
}
beforeEach(() => {
  existing.trashedAt = null;
  existing.enabled = false;
});
it('shows a duplicate as skipped with the existing visibility and processing state', () => {
  const html = render();
  expect(html).toContain('重复跳过');
  expect(html).toContain('图片已存在，未新增');
  expect(html).toContain('本次设置没有修改已有图片');
  expect(html).toContain('查看已有图片');
  expect(html).toContain('私有');
  expect(html).toContain('存储已停用');
  expect(html).not.toContain('公开');
  expect(html).not.toContain('重试上传');
  expect(html).not.toContain('请求取消');
});
it('uses the current recycle state instead of a stale duplicate snapshot', () => {
  existing.trashedAt = '2026-10-24T00:00:00.000Z';
  const html = render();
  expect(html).toContain('回收站已有相同图片');
  expect(html).toContain('查看回收记录');
});
