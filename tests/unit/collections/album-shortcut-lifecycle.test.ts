import {
  Children,
  createElement,
  isValidElement,
  type DependencyList,
  type EffectCallback,
  type ReactElement,
  type ReactNode,
} from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  QueryClient,
  QueryObserver,
  type QueryObserverOptions,
} from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AlbumsScreen } from '../../../src/app/albums/screen';
import { AlbumImagePicker } from '../../../src/app/albums/image-picker';
import { useAlbumImagePicker } from '../../../src/app/albums/use-image-picker';
import type { Album, AlbumPage } from '../../../src/app/albums/api';
import type { LibraryItem } from '../../../src/server/library/types';

// Model retained React hook cells; requests, cache, observations and picker mutations use real code.
type Cell = {
  value?: unknown;
  deps?: DependencyList;
  cleanup?: () => void;
};
type Lifetime = { cells: Cell[]; effects: (() => void)[]; cursor: number };
const runtime = vi.hoisted(() => ({ active: null as Lifetime | null }));
const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('react', async (original) => {
  const actual = await original<typeof import('react')>();
  const cell = () => {
    const scope = runtime.active!;
    return (scope.cells[scope.cursor++] ??= {});
  };
  return {
    ...actual,
    useState: (initial: unknown) => {
      if (!runtime.active) return actual.useState(initial);
      const current = cell();
      if (!('value' in current))
        current.value = typeof initial === 'function' ? initial() : initial;
      return [
        current.value,
        (value: unknown) => {
          current.value =
            typeof value === 'function' ? value(current.value) : value;
        },
      ];
    },
    useRef: (initial: unknown) => {
      if (!runtime.active) return actual.useRef(initial);
      return (cell().value ??= { current: initial });
    },
    useEffect: (effect: EffectCallback, deps: DependencyList) => {
      if (!runtime.active) return actual.useEffect(effect, deps);
      const scope = runtime.active;
      const current = cell();
      if (
        !current.deps ||
        deps.some((dep, index) => !Object.is(dep, current.deps![index]))
      ) {
        current.deps = deps;
        scope.effects.push(() => {
          current.cleanup?.();
          current.cleanup = effect() || undefined;
        });
      }
    },
  };
});
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof import('@tanstack/react-query')>()),
  useQuery: (options: QueryObserverOptions, client: QueryClient) => {
    const scope = runtime.active!;
    const cell = (scope.cells[scope.cursor++] ??= {});
    let observer = cell.value as QueryObserver | undefined;
    if (!observer) {
      observer = new QueryObserver(client, options);
      cell.value = observer;
      const unsubscribe = observer.subscribe(() => {});
      const owned = observer;
      cell.cleanup = () => {
        unsubscribe();
        owned.destroy();
      };
    } else observer.setOptions(options);
    return observer.getCurrentResult();
  },
}));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
vi.mock('../../../src/components/upload/provider', () => ({
  useResetUpload: () => vi.fn(),
}));
vi.mock('../../../src/components/shell/owner-shell', () => ({
  OwnerShell: ({ children }: { children: React.ReactNode }) =>
    createElement('main', null, children),
}));

const scopes = new Set<Lifetime>();
function lifetime<T>(render: () => T) {
  const scope: Lifetime = { cells: [], effects: [], cursor: 0 };
  scopes.add(scope);
  return () => {
    const previous = runtime.active;
    scope.cursor = 0;
    runtime.active = scope;
    let result: T;
    try {
      result = render();
    } finally {
      runtime.active = previous;
    }
    scope.effects.splice(0).forEach((effect) => effect());
    return result;
  };
}
const album: Album = {
  id: 'album',
  name: '相册',
  description: '',
  createdAt: '2026-10-11T00:00:00Z',
  updatedAt: '2026-10-11T00:00:00Z',
  imageCount: 0,
  publicImageCount: 0,
  cover: {
    imageId: null,
    mode: 'empty',
    preferredCoverImageId: null,
    temporaryFallback: false,
    displayName: null,
    status: 'empty',
    thumbnailUrl: null,
  },
};
const props = {
  name: 'Ariso',
  description: '',
  email: 'owner@example.test',
  ownerName: 'Owner',
  initialSidebarCollapsed: false,
  timeZone: 'Asia/Shanghai',
};
function image(id: string): LibraryItem {
  return {
    id,
    displayName: `${id}.png`,
    originalName: `${id}.png`,
    byteSize: 1000,
    format: 'png',
    width: 640,
    height: 480,
    visibility: 'private',
    hasAlbums: false,
    processingStatus: 'ready',
    createdAt: album.createdAt,
    storage: { id: 'local', name: '本地', enabled: true },
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
}
function pickerElement(tree: ReturnType<typeof AlbumsScreen>) {
  if (!('renderWorkspace' in tree.props)) return undefined;
  const workspace = tree.props.renderWorkspace(null, null);
  return workspace.props.children.find(
    (child: React.ReactElement) => child?.type === AlbumImagePicker,
  ) as React.ReactElement<Parameters<typeof AlbumImagePicker>[0]>;
}
beforeEach(() => {
  navigation.push.mockReset();
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => callback());
});

it('keeps Return beside the title and album actions in the query toolbar, preserving full-page Upload context', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ album })),
  );
  Object.assign(window, {
    location: { pathname: '/albums/album', search: '?page=2&layout=masonry' },
  });
  const render = lifetime(() => AlbumsScreen({ ...props, albumId: album.id }));
  render();
  await vi.waitFor(() => expect(pickerElement(render())).toBeDefined());
  const workspace = render().props.renderWorkspace(null, null);
  function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
    return Children.toArray(node).flatMap((child) =>
      isValidElement<Record<string, unknown>>(child)
        ? [child, ...elements(child.props.children as ReactNode)]
        : [],
    );
  }
  const header = elements(workspace.props.header);
  expect(renderToStaticMarkup(workspace.props.header)).not.toContain('相册 #');
  const titleRow = header.find((element) =>
    Children.toArray(element.props.children as ReactNode).some(
      (child) =>
        isValidElement<Record<string, unknown>>(child) &&
        child.props.id === 'library-title',
    ),
  )!;
  expect(
    elements(titleRow).find((element) => element.props.href === '/albums')
      ?.props['aria-label'],
  ).toBe('返回相册列表');
  expect(
    header.find((element) => element.props['aria-label'] === '相册操作'),
  ).toBeUndefined();
  const toolbar = elements(workspace.props.toolbarActions);
  expect(
    toolbar.find((element) => element.props['aria-label'] === '相册操作'),
  ).toBeDefined();
  const addMenu = toolbar.find(
    (element) => element.props['aria-label'] === '添加相册图片',
  )!;
  (addMenu.props.onAction as (key: string) => void)('upload');
  const target = new URL(navigation.push.mock.calls[0][0], 'http://ariso.test');
  expect(target.pathname).toBe('/upload');
  expect(target.searchParams.get('albumId')).toBe(album.id);
  expect(target.searchParams.get('returnTo')).toBe(
    '/albums/album?page=2&layout=masonry',
  );
});
afterEach(() => {
  for (const scope of scopes) for (const cell of scope.cells) cell.cleanup?.();
  scopes.clear();
  runtime.active = null;
  vi.unstubAllGlobals();
});

it('refreshes the current album list count and cover only for uploads with actual album relations', async () => {
  let current = album;
  const fetcher = vi.fn(async () =>
    Response.json({
      items: [current],
      total: 1,
      page: 1,
      pageSize: 40,
    } satisfies AlbumPage),
  );
  vi.stubGlobal('fetch', fetcher);
  const render = lifetime(() => AlbumsScreen(props));
  render();
  await vi.waitFor(() =>
    expect(renderToStaticMarkup(render())).toContain('0 张图片'),
  );
  const reads = fetcher.mock.calls.length;
  window.dispatchEvent(
    new CustomEvent('ariso:upload-albums-changed', {
      detail: { albumIds: [] },
    }),
  );
  expect(fetcher).toHaveBeenCalledTimes(reads);
  current = {
    ...album,
    imageCount: 1,
    cover: {
      ...album.cover,
      imageId: 'added',
      mode: 'automatic',
      status: 'ready',
      thumbnailUrl: '/i/added?type=thumbnail',
    },
  };
  window.dispatchEvent(
    new CustomEvent('ariso:upload-albums-changed', {
      detail: { albumIds: ['album'] },
    }),
  );
  await vi.waitFor(() => {
    const html = renderToStaticMarkup(render());
    expect(html).toContain('1 张图片');
    expect(html).toContain('src="/i/added?type=thumbnail"');
  });
  expect(fetcher).toHaveBeenCalledTimes(reads + 1);
});

it('refreshes an open album detail only when the confirmed upload targets that album', async () => {
  const fetcher = vi.fn(async () => Response.json({ album }));
  vi.stubGlobal('fetch', fetcher);
  const render = lifetime(() => AlbumsScreen({ ...props, albumId: album.id }));
  render();
  await vi.waitFor(() => expect(pickerElement(render())).toBeDefined());
  const reads = fetcher.mock.calls.length;
  window.dispatchEvent(
    new CustomEvent('ariso:upload-albums-changed', {
      detail: { albumIds: ['another-album'] },
    }),
  );
  expect(fetcher).toHaveBeenCalledTimes(reads);
  window.dispatchEvent(
    new CustomEvent('ariso:upload-albums-changed', {
      detail: { albumIds: [album.id] },
    }),
  );
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(reads + 1));
});

it('keeps the picker and failed selection after a partial join and failed detail refresh', async () => {
  const images = [image('joined'), image('failed')];
  let applied = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('/api/albums/album'))
        return applied
          ? Response.json({ message: '详情回读失败' }, { status: 500 })
          : Response.json({ album });
      if (url.startsWith('/api/images?'))
        return Response.json({
          items: images,
          total: 2,
          page: 1,
          pageSize: 40,
          nextCursor: null,
          hasMore: false,
        });
      if (url === '/api/images/selection')
        return Response.json({ items: applied ? [{ id: 'joined' }] : [] });
      if (url === '/api/images/batch') {
        expect(JSON.parse(init!.body as string).ids).toEqual([
          'joined',
          'failed',
        ]);
        applied = true;
        return Response.json({
          results: [
            {
              id: 'joined',
              status: 'changed',
              inQuery: true,
              message: '已添加',
            },
            {
              id: 'failed',
              status: 'failed',
              inQuery: true,
              message: '添加失败',
            },
          ],
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    }),
  );
  const renderScreen = lifetime(() =>
    AlbumsScreen({ ...props, albumId: album.id }),
  );
  renderScreen();
  await vi.waitFor(() => expect(pickerElement(renderScreen())).toBeDefined());
  const renderPicker = lifetime(() => {
    const element = pickerElement(renderScreen());
    expect(
      element,
      'A cached detail must keep the picker mounted',
    ).toBeDefined();
    return useAlbumImagePicker({
      ...element!.props,
      albumId: album.id,
      isOpen: true,
    });
  });
  renderPicker();
  await vi.waitFor(() =>
    expect(renderPicker().list.data?.items).toHaveLength(2),
  );
  renderPicker().toggle(images[0]);
  renderPicker().toggle(images[1]);
  renderPicker().submit();
  await vi.waitFor(() => {
    const picker = renderPicker();
    expect(picker.pending).toBe(false);
    expect([...picker.selected.keys()]).toEqual(['failed']);
    expect(picker.error).toContain('图片已添加，相册刷新失败：详情回读失败');
    expect(picker.failures).toMatchObject([
      { id: 'failed', message: '添加失败' },
    ]);
  });
  expect(pickerElement(renderScreen())?.props.album.id).toBe(album.id);
});

it('retains the existing error page for a first detail read without cached data', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({ message: '首次读取失败' }, { status: 500 }),
    ),
  );
  const render = lifetime(() => AlbumsScreen({ ...props, albumId: album.id }));
  render();
  await vi.waitFor(() => {
    const tree = render();
    expect(pickerElement(tree)).toBeUndefined();
    expect(renderToStaticMarkup(tree)).toContain('首次读取失败');
  });
});
