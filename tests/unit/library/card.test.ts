import { jsx } from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { LibraryCard } from '../../../src/app/library/library-card';
import { LibraryLoading } from '../../../src/app/library/library-loading';
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
  hasAlbums: false,
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
  thumbnailDimensions: null,
  activeJob: null,
  latestFailedJob: null,
  metadataJob: null,
  processingJob: null,
  trashedAt: null,
  deletionStatus: null,
};

it('loads real thumbnails in the card surface without adding skeleton tiles', () => {
  const html = renderToStaticMarkup(
    jsx(LibraryCard, {
      item: { ...item, thumbnailUrl: '/i/image?type=thumbnail' },
    }),
  );
  expect(html).toContain('<img');
  expect(html).toContain('alt="旅行"');
  expect(html).not.toContain('skeleton');
  const loading = renderToStaticMarkup(jsx(LibraryLoading, {}));
  expect(loading).toContain('正在加载图片');
  expect(loading).toContain('role="status"');
  expect(loading).not.toContain('skeleton');
  expect(loading).not.toContain('grid-cols');
});
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

it('names the full-card action according to the album picker action', () => {
  const html = renderToStaticMarkup(
    jsx(LibraryCard, { item, openLabel: '选择图片' }),
  );
  expect(html).toContain('aria-label="选择图片：旅行"');
  expect(html).not.toContain('aria-label="查看图片：旅行"');
});

it('keeps ready cards compact while retaining abnormal format and storage diagnostics', () => {
  const ready = { ...item, processingStatus: 'ready' as const };
  const html = renderToStaticMarkup(jsx(LibraryCard, { item: ready }));
  expect(html).not.toContain('本地存储');
  expect(html).toContain('已就绪');
  expect(
    renderToStaticMarkup(
      jsx(LibraryCard, { item: { ...ready, format: 'unknown' } }),
    ),
  ).toContain('格式待识别');
  const disabledStorage = renderToStaticMarkup(
    jsx(LibraryCard, {
      item: {
        ...ready,
        storage: { ...ready.storage, enabled: false },
        thumbnailUrl: '/i/image?type=thumbnail',
      },
    }),
  );
  expect(disabledStorage).toContain('存储已停用');
  expect(disabledStorage).not.toContain('<img');
});

it('disables old query cards and reserves their supplied image height', () => {
  const html = renderToStaticMarkup(
    jsx(LibraryCard, { item, isDisabled: true, imageHeight: 237 }),
  );
  expect(html).toMatch(/<button[^>]*disabled/);
  expect(html).toContain('height:237px');
});

it('exposes a named selected checkbox independently of the detail button', () => {
  const html = renderToStaticMarkup(
    jsx(LibraryCard, {
      item,
      isSelected: true,
      onToggle: () => undefined,
    }),
  );
  expect(html).toContain('aria-label="选择图片：旅行"');
  expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*checked=""/);
  expect(html).toContain('aria-label="查看图片：旅行"');
  expect(html).not.toMatch(/<button\b[^>]*>(?:(?!<\/button>)[\s\S])*<button\b/);
});

it('distinguishes public and private badges with color, text and icons', () => {
  const privateHtml = renderToStaticMarkup(jsx(LibraryCard, { item }));
  const publicHtml = renderToStaticMarkup(
    jsx(LibraryCard, { item: { ...item, visibility: 'public' } }),
  );
  expect(privateHtml).toContain('data-visibility="private"');
  expect(privateHtml).toContain('bg-violet-100');
  expect(privateHtml).toContain('lucide-lock-keyhole');
  expect(publicHtml).toContain('data-visibility="public"');
  expect(publicHtml).toContain('bg-emerald-100');
  expect(publicHtml).toContain('lucide-globe');
  expect(
    renderToStaticMarkup(jsx(LibraryCard, { item, album: true })),
  ).not.toContain('min-[1200px]:pb-0');
  expect(privateHtml).toContain('pb-4');
  expect(publicHtml).toContain('pb-4');
});
