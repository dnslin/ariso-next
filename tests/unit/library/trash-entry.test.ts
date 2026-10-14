import {
  Children,
  createElement,
  isValidElement,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { TrashScreen } from '../../../src/app/trash/trash-screen';
import { TrashThumbnail } from '../../../src/app/trash/trash-thumbnail';
import type { TrashItem } from '../../../src/server/library/trash-types';
import * as entrances from '../../../src/components/component-entrance';

const runtime = vi.hoisted(() => ({
  pending: false,
  fetching: false,
  placeholder: false,
  readRevision: 1,
  thumbnailState: null as { value: number | null } | null,
  items: [] as TrashItem[],
}));
vi.mock('react', async (original) => {
  const actual = await original<typeof import('react')>();
  return {
    ...actual,
    useState: (...args: Parameters<typeof actual.useState>) => {
      const cell = runtime.thumbnailState;
      return cell
        ? [cell.value, (value: number | null) => (cell.value = value)]
        : actual.useState(...args);
    },
  };
});
const thumbnailMotion = vi.hoisted(() => ({ animate: vi.fn() }));
vi.mock('motion/react', async (original) => ({
  ...(await original<typeof import('motion/react')>()),
  useAnimate: () => [{ current: {} }, thumbnailMotion.animate],
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ isPending: true, data: undefined, error: null }),
}));
vi.mock('../../../src/app/trash/use-trash-query', () => ({
  useTrashQuery: () => ({
    data: runtime.pending
      ? undefined
      : { items: runtime.items, total: runtime.items.length },
    isPending: runtime.pending,
    isFetching: runtime.fetching,
    isPlaceholderData: runtime.placeholder,
    isSuccess: !runtime.pending,
    dataUpdatedAt: runtime.readRevision,
    error: null,
    filters: {
      scope: 'trash',
      pageSize: 40,
      q: '',
      storageId: null,
      status: null,
      deletionStatus: null,
    },
    query: 'scope=trash',
    page: 1,
    setPage: vi.fn(),
    applyQuery: vi.fn(),
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
  }) =>
    createElement(
      'main',
      null,
      children,
      createElement('footer', null, footer),
    ),
}));
vi.mock('../../../src/components/upload/provider', () => ({
  useResetUpload: () => vi.fn(),
}));
const shell = {
  name: 'Ariso',
  description: '',
  ownerName: 'Owner',
  email: 'owner@example.test',
  initialSidebarCollapsed: false,
};
const item: TrashItem = {
  id: 'image',
  displayName: '真实回收图片',
  originalName: 'photo.png',
  byteSize: 10,
  format: 'png',
  visibility: 'private',
  hasAlbums: false,
  processingStatus: 'ready',
  trashedAt: '2026-10-12T00:00:00Z',
  deletionStatus: null,
  storage: { id: 'local', name: '本地', enabled: true },
  thumbnailPath: null,
};
beforeEach(() => {
  runtime.pending = false;
  runtime.fetching = false;
  runtime.placeholder = false;
  runtime.readRevision = 1;
  runtime.thumbnailState = null;
  runtime.items = [item];
});

it('the real record enters as an li, with title, toolbar and filters separate from its fixed footer', () => {
  const html = renderToStaticMarkup(createElement(TrashScreen, shell));
  expect(html).toContain('真实回收图片');
  expect(html).toMatch(/<header[^>]*data-component-entry/);
  expect(html).toMatch(
    /data-testid="library-toolbar"[^>]*data-component-entry/,
  );
  expect(html).toMatch(/data-testid="trash-filters"[^>]*data-component-entry/);
  expect(html).toMatch(
    /<ul[^>]*data-testid="trash-list"[^>]*><li[^>]*data-trash-image-id="image"[^>]*data-component-entry/,
  );
  expect(html).not.toMatch(/<ul[^>]*data-testid="trash-list"[^>]*><div/);
  expect(html.match(/<footer>([\s\S]*)<\/footer>/)?.[1]).not.toContain(
    'data-component-entry',
  );
});

it('retained old records remain readable but cannot open or mutate while a changed query is pending', () => {
  runtime.fetching = true;
  runtime.placeholder = true;
  const html = renderToStaticMarkup(createElement(TrashScreen, shell));
  expect(html).toContain('真实回收图片');
  expect(html).toMatch(/<ul[^>]*data-testid="trash-list"[^>]*aria-busy="true"/);
  const open = html.match(
    /<button\b[^>]*data-testid="trash-record-image"[^>]*>/,
  )?.[0];
  expect(open).toContain('disabled');
  const action = html.match(
    /<button\b[^>]*aria-label="图片操作：真实回收图片"[^>]*>/,
  )?.[0];
  expect(action).toContain('disabled');
  expect(html).not.toContain('正在读取回收记录');
});

it('keeps the first read silent and distinct from the real empty state', () => {
  runtime.pending = true;
  runtime.fetching = true;
  const loading = renderToStaticMarkup(createElement(TrashScreen, shell));
  expect(loading).toContain('aria-busy="true"');
  expect(loading).toMatch(/<header[^>]*data-component-entry/);
  expect(loading).not.toContain('正在读取回收记录');
  expect(loading).not.toContain('data-slot="spinner"');
  expect(loading).not.toContain('data-testid="trash-empty"');
  runtime.pending = false;
  runtime.fetching = false;
  runtime.items = [];
  const empty = renderToStaticMarkup(createElement(TrashScreen, shell));
  expect(empty).toContain('回收站为空');
  expect(empty).toMatch(/data-testid="trash-empty"[^>]*data-component-entry/);
});

it('a real thumbnail keeps its image and error fallback without a skeleton tile', () => {
  const image = renderToStaticMarkup(
    createElement(TrashThumbnail, {
      item: { ...item, thumbnailPath: '/api/images/image/thumbnail' },
      readRevision: 1,
      seen: { current: new Set<string>() },
    }),
  );
  expect(image).toContain('data-testid="trash-thumbnail"');
  expect(image).toContain('src="/api/images/image/thumbnail"');
  expect(image).not.toContain('skeleton');
  const missing = renderToStaticMarkup(
    createElement(TrashThumbnail, {
      item,
      readRevision: 1,
      seen: { current: new Set<string>() },
    }),
  );
  expect(missing).toContain('暂无缩略图');
  expect(missing).not.toContain('<img');
});

it('a successful thumbnail fades in once per URL and skips replay when the same URL returns', () => {
  thumbnailMotion.animate.mockClear();
  const seen = { current: new Set<string>() };
  const thumbnail = { ...item, thumbnailPath: '/api/images/image/thumbnail' };
  const loadEvents: (() => void)[] = [];
  function Probe() {
    const tree = TrashThumbnail({ item: thumbnail, readRevision: 1, seen });
    const image = Children.toArray(tree.props.children).find(
      (child) => isValidElement(child) && child.type === 'img',
    );
    if (!isValidElement<{ onLoad: () => void }>(image))
      throw new Error('Expected the actual thumbnail image');
    loadEvents.push(image.props.onLoad);
    return tree;
  }
  renderToStaticMarkup(createElement(Probe));
  expect(seen.current.size).toBe(0); // An uncompleted or failed read is still eligible on retry.
  loadEvents[0]();
  expect(thumbnailMotion.animate).toHaveBeenCalledTimes(1);
  expect(thumbnailMotion.animate.mock.calls[0][1]).toEqual({ opacity: [0, 1] });
  expect(seen.current.has(thumbnail.thumbnailPath)).toBe(true);
  renderToStaticMarkup(createElement(Probe));
  loadEvents[1]();
  expect(thumbnailMotion.animate).toHaveBeenCalledTimes(1);
});

it('a successful refresh preserves the thumbnail identity and updates only its retry revision', () => {
  runtime.items = [{ ...item, thumbnailPath: '/api/images/image/thumbnail' }];
  const thumbnails: ReactElement<ComponentProps<typeof TrashThumbnail>>[] = [];
  function visit(node: ReactNode) {
    Children.forEach(node, (child) => {
      if (!isValidElement<{ children?: ReactNode }>(child)) return;
      if (child.type === TrashThumbnail)
        thumbnails.push(
          child as ReactElement<ComponentProps<typeof TrashThumbnail>>,
        );
      else visit(child.props.children);
    });
  }
  const original = entrances.ComponentEntrance;
  const entrance = vi
    .spyOn(entrances, 'ComponentEntrance')
    .mockImplementation((props) => {
      if (props.as === 'li') visit(props.children as ReactNode);
      return original(props);
    });
  try {
    renderToStaticMarkup(createElement(TrashScreen, shell));
    runtime.readRevision = 2;
    renderToStaticMarkup(createElement(TrashScreen, shell));
    expect(thumbnails).toHaveLength(2);
    expect(thumbnails[0].key).toBe(runtime.items[0].thumbnailPath);
    expect(thumbnails[1].key).toBe(thumbnails[0].key);
    expect(thumbnails.map((thumbnail) => thumbnail.props.readRevision)).toEqual(
      [1, 2],
    );
  } finally {
    entrance.mockRestore();
  }
});

it('a failed thumbnail retries only after a new real read and stays failed through placeholder revision zero', () => {
  const cell = { value: null as number | null };
  const seen = { current: new Set<string>() };
  let readRevision = 1;
  let fail!: () => void;
  let load!: () => void;
  function Probe() {
    runtime.thumbnailState = cell;
    let tree: ReturnType<typeof TrashThumbnail>;
    try {
      tree = TrashThumbnail({
        item: { ...item, thumbnailPath: '/api/images/image/thumbnail' },
        readRevision,
        seen,
      });
    } finally {
      runtime.thumbnailState = null;
    }
    const image = Children.toArray(tree.props.children).find(
      (child) => isValidElement(child) && child.type === 'img',
    );
    if (isValidElement<{ onError: () => void; onLoad: () => void }>(image)) {
      fail = image.props.onError;
      load = image.props.onLoad;
    }
    return tree;
  }
  const render = () => renderToStaticMarkup(createElement(Probe));
  expect(render()).toContain('<img');
  fail();
  expect(render()).toContain('预览读取失败');
  readRevision = 0;
  expect(render()).toContain('预览读取失败');
  expect(render()).not.toContain('<img');
  readRevision = 1;
  expect(render()).toContain('预览读取失败');
  readRevision = 2;
  expect(render()).toContain('<img');
  load();
  readRevision = 0;
  expect(render()).toContain('<img');
  expect(render()).not.toContain('预览读取失败');
  readRevision = 2;
  expect(render()).toContain('<img');
  fail();
  expect(render()).toContain('预览读取失败');
  readRevision = 3;
  expect(render()).toContain('<img');
  load(); // A previously seen URL also clears its new failure before skipping motion.
  readRevision = 0;
  expect(render()).toContain('<img');
  expect(render()).not.toContain('预览读取失败');
});
