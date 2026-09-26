import { jsx } from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { LibraryCard } from '../../../src/app/library/library-card';
import type { LibraryItem } from '../../../src/server/library/types';

const item: LibraryItem = {
  id: 'image',
  displayName: '旅行',
  originalName: 'travel.png',
  byteSize: 1024,
  format: 'png',
  width: 640,
  height: 480,
  visibility: 'private',
  processingStatus: 'processing',
  createdAt: '2026-09-25T00:00:00Z',
  storage: { id: 'local', name: '本地存储', enabled: true },
  versions: {
    original: true,
    compressed: false,
    thumbnail: false,
    watermark: false,
  },
  thumbnailUrl: null,
  activeJob: null,
  latestFailedJob: null,
  trashedAt: null,
  deletionStatus: null,
};
it.each([
  ['identify', '识别图片'],
  ['original', '保存原图'],
  ['compressed', '生成压缩图'],
  ['thumbnail', '生成缩略图'],
  ['watermark', '生成水印图'],
  ['complete', '处理完成'],
])(
  'renders readable task step %s for active and failed jobs',
  (step, label) => {
    const job = { id: 'job', scope: 'all' as const, step, error: null };
    const html = renderToStaticMarkup(
      jsx(LibraryCard, {
        item: {
          ...item,
          activeJob: { ...job, status: 'running' },
          latestFailedJob: { ...job, id: 'prior-job', status: 'failed' },
        },
      }),
    );
    expect(html).toContain(`当前任务：执行中 · ${label}`);
    expect(html).toContain(`最近任务失败 · ${label}`);
    expect(html).not.toContain(` · ${step}`);
  },
);

it('keeps an unrecognized stored step visible for diagnosis', () => {
  const html = renderToStaticMarkup(
    jsx(LibraryCard, {
      item: {
        ...item,
        latestFailedJob: {
          id: 'older-job',
          status: 'failed',
          scope: 'all',
          step: 'unexpected-stage',
          error: 'Processing failed',
        },
      },
    }),
  );
  expect(html).toContain('最近任务失败 · unexpected-stage');
  expect(html).not.toContain('处理完成');
});

it('offers one named full-card action while retaining readable image diagnostics', () => {
  const html = renderToStaticMarkup(jsx(LibraryCard, { item }));
  expect(html.match(/<button\b/g)).toHaveLength(1);
  expect(html).toContain('aria-label="查看图片：旅行"');
  expect(html).toContain('旅行</p>');
  expect(html).toContain('本地存储');
  expect(html).toContain('处理中');
});
