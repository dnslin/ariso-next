import { jsx } from 'react/jsx-runtime';
import {
  Children,
  isValidElement,
  type ReactNode,
  type ReactElement,
} from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { LibraryCard } from '../../../src/app/library/library-card';
import { LibraryLoading } from '../../../src/app/library/library-loading';
import type { LibraryItem } from '../../../src/server/library/types';

const runtime = vi.hoisted(() => ({
  cardState: null as { value: unknown } | null,
}));
vi.mock('react', async (original) => {
  const actual = await original<typeof import('react')>();
  return {
    ...actual,
    useState: (...args: Parameters<typeof actual.useState>) => {
      const cell = runtime.cardState;
      return cell
        ? [cell.value, (value: unknown) => (cell.value = value)]
        : actual.useState(...args);
    },
  };
});

function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(node).flatMap((child) =>
    isValidElement<Record<string, unknown>>(child)
      ? [child, ...elements(child.props.children as ReactNode)]
      : [],
  );
}

function thumbnailCard(initial: LibraryItem) {
  const state = { value: null as unknown };
  return (readRevision: number, record = initial) => {
    runtime.cardState = state;
    let tree: ReturnType<typeof LibraryCard>;
    try {
      tree = LibraryCard({ item: record, readRevision });
    } finally {
      runtime.cardState = null;
    }
    return {
      html: renderToStaticMarkup(tree),
      image: elements(tree).find((element) => element.type === 'img'),
    };
  };
}

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

it('retries a failed same-URL thumbnail only after a new real read and keeps successful retries through placeholder reads', () => {
  const render = thumbnailCard({
    ...item,
    thumbnailUrl: '/api/images/image/thumbnail',
  });
  const initial = render(1);
  expect(initial.image).toBeDefined();
  (initial.image!.props.onError as () => void)();
  expect(render(1).html).toContain('缩略图读取失败');
  expect(render(0).image).toBeUndefined();
  expect(render(1).image).toBeUndefined();

  const retried = render(2);
  expect(retried.image).toBeDefined();
  (retried.image!.props.onLoad as () => void)();
  expect(render(0).image).toBeDefined();
  expect(render(2).html).not.toContain('缩略图读取失败');

  (render(2).image!.props.onError as () => void)();
  expect(render(0).image).toBeUndefined();
  const nextRetry = render(3);
  expect(nextRetry.image).toBeDefined();
  (nextRetry.image!.props.onLoad as () => void)();
  expect(render(0).image).toBeDefined();
});

it('does not carry a thumbnail failure into a different URL', () => {
  const initial = { ...item, thumbnailUrl: '/api/images/image/thumbnail' };
  const render = thumbnailCard(initial);
  (render(1).image!.props.onError as () => void)();
  const replacement = render(1, {
    ...initial,
    thumbnailUrl: '/api/images/replaced/thumbnail',
  });
  expect(replacement.image?.props.src).toBe('/api/images/replaced/thumbnail');
  (replacement.image!.props.onLoad as () => void)();
  expect(render(0, initial).image).toBeDefined();
});

it('keeps the healthy image identity across real and placeholder read revisions', () => {
  const render = thumbnailCard({
    ...item,
    thumbnailUrl: '/api/images/image/thumbnail',
  });
  const initial = render(1).image!;
  for (const revision of [0, 1, 2, 0, 3]) {
    const retained = render(revision).image!;
    expect(retained.type).toBe(initial.type);
    expect(retained.key).toBe(initial.key);
    expect(retained.props.src).toBe(initial.props.src);
  }
});

it('loads real thumbnails in the card surface without adding skeleton tiles', () => {
  const html = renderToStaticMarkup(
    jsx(LibraryCard, {
      readRevision: 1,
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
        readRevision: 1,
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
      readRevision: 1,
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
  const html = renderToStaticMarkup(
    jsx(LibraryCard, { readRevision: 1, item }),
  );
  expect(html.match(/<button\b/g)).toHaveLength(1);
  expect(html).toContain('aria-label="查看图片：旅行"');
  expect(html).toContain('旅行</p>');
  expect(html).toContain('本地存储');
  expect(html).toContain('处理中');
});

it('names the full-card action according to the album picker action', () => {
  const html = renderToStaticMarkup(
    jsx(LibraryCard, { readRevision: 1, item, openLabel: '选择图片' }),
  );
  expect(html).toContain('aria-label="选择图片：旅行"');
  expect(html).not.toContain('aria-label="查看图片：旅行"');
});

it('keeps ready cards compact while retaining abnormal format and storage diagnostics', () => {
  const ready = { ...item, processingStatus: 'ready' as const };
  const html = renderToStaticMarkup(
    jsx(LibraryCard, { readRevision: 1, item: ready }),
  );
  expect(html).not.toContain('本地存储');
  expect(html).toContain('已就绪');
  expect(
    renderToStaticMarkup(
      jsx(LibraryCard, {
        readRevision: 1,
        item: { ...ready, format: 'unknown' },
      }),
    ),
  ).toContain('格式待识别');
  const disabledStorage = renderToStaticMarkup(
    jsx(LibraryCard, {
      readRevision: 1,
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
    jsx(LibraryCard, {
      readRevision: 1,
      item,
      isDisabled: true,
      imageHeight: 237,
    }),
  );
  expect(html).toMatch(/<button[^>]*disabled/);
  expect(html).toContain('height:237px');
});

it('exposes a named selected checkbox independently of the detail button', () => {
  const html = renderToStaticMarkup(
    jsx(LibraryCard, {
      readRevision: 1,
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
  const privateHtml = renderToStaticMarkup(
    jsx(LibraryCard, { readRevision: 1, item }),
  );
  const publicHtml = renderToStaticMarkup(
    jsx(LibraryCard, {
      readRevision: 1,
      item: { ...item, visibility: 'public' },
    }),
  );
  expect(privateHtml).toContain('data-visibility="private"');
  expect(privateHtml).toContain('bg-violet-100');
  expect(privateHtml).toContain('lucide-lock-keyhole');
  expect(publicHtml).toContain('data-visibility="public"');
  expect(publicHtml).toContain('bg-emerald-100');
  expect(publicHtml).toContain('lucide-globe');
  expect(
    renderToStaticMarkup(
      jsx(LibraryCard, { readRevision: 1, item, album: true }),
    ),
  ).not.toContain('min-[1200px]:pb-0');
  expect(privateHtml).toContain('pb-4');
  expect(publicHtml).toContain('pb-4');
});
