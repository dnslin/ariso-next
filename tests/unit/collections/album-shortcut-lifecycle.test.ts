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
import { AlbumDialog } from '../../../src/app/albums/dialog';
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
const navigation = vi.hoisted(() => ({ push: vi.fn(), search: '' }));
const navigationCache = new QueryClient();
const session = vi.hoisted(() => ({ resetUpload: vi.fn() }));
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
  useQueryClient: () => navigationCache,
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
vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

vi.mock('../../../src/components/upload/provider', () => ({
  useResetUpload: () => session.resetUpload,
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
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(node).flatMap((child) =>
    isValidElement<Record<string, unknown>>(child)
      ? [child, ...elements(child.props.children as ReactNode)]
      : [],
  );
}
function refreshError(tree: ReturnType<typeof AlbumsScreen>) {
  const workspace = tree.props.renderWorkspace(null, null);
  return elements(workspace.props.afterToolbar).find(
    (element) => element.props['data-testid'] === 'albums-error',
  );
}
beforeEach(() => {
  navigation.push.mockReset();
  navigation.search = '';
  navigationCache.clear();
  session.resetUpload.mockReset();
  vi.stubGlobal('window', new EventTarget());
  const updateSearch = (_state: unknown, _unused: string, url: string) => {
    navigation.search = new URL(url, 'http://ariso.test').search;
  };
  Object.assign(window, {
    history: { pushState: updateSearch, replaceState: updateSearch },
  });
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => callback());
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
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

it('keeps real album cards while a search is pending and replaces them with the confirmed result', async () => {
  let finishSearch!: (response: Response) => void;
  vi.stubGlobal('fetch', async (url: string) => {
    if (new URL(url, 'http://ariso.test').searchParams.get('q'))
      return new Promise<Response>((resolve) => {
        finishSearch = resolve;
      });
    return Response.json({ items: [album], total: 1, page: 1, pageSize: 40 });
  });
  const render = lifetime(() => AlbumsScreen(props));
  render();
  await vi.waitFor(() =>
    expect(renderToStaticMarkup(render())).toContain('0 张图片'),
  );
  const search = elements(render()).find(
    (element) => element.props['aria-label'] === '搜索相册',
  )!;
  (search.props.onChange as (value: string) => void)('不存在');
  const pending = render();
  expect(renderToStaticMarkup(pending)).toContain('0 张图片');
  expect(
    elements(pending).find(
      (element) => element.props['data-testid'] === 'albums-list',
    )?.props['aria-busy'],
  ).toBe(true);
  expect(renderToStaticMarkup(pending)).not.toContain('正在读取相册');
  finishSearch(Response.json({ items: [], total: 0, page: 1, pageSize: 40 }));
  await vi.waitFor(() => {
    const html = renderToStaticMarkup(render());
    expect(html).toContain('未找到相册');
    expect(html).not.toContain('0 张图片');
  });
});

it('reads the list context from its URL and carries that exact source into album and share navigation', async () => {
  navigation.search = '?q=旅行&page=2&pageSize=20';
  const fetcher = vi.fn(async (url: string) => {
    expect(url).toBe('/api/albums?q=%E6%97%85%E8%A1%8C&page=2&pageSize=20');
    return Response.json({ items: [album], total: 41, page: 2, pageSize: 20 });
  });
  vi.stubGlobal('fetch', fetcher);
  const main = Object.assign(new EventTarget(), {
    scrollTop: 340,
    scrollTo: vi.fn(),
    querySelectorAll: () => [],
    querySelector: () => null,
  });
  const opener = {
    dataset: { collectionReturnFocus: 'album-menu-album' },
  } as unknown as HTMLElement;
  vi.stubGlobal('document', {
    getElementById: () => main,
    activeElement: opener,
  });
  const render = lifetime(() => AlbumsScreen(props));
  render();
  await vi.waitFor(() =>
    expect(
      elements(render()).find(
        (element) => typeof element.props.onShare === 'function',
      ),
    ).toBeDefined(),
  );
  expect(fetcher).toHaveBeenCalled();
  const source = '/albums?q=%E6%97%85%E8%A1%8C&page=2&pageSize=20';
  const card = elements(render()).find(
    (element) => typeof element.props.onShare === 'function',
  )!;
  expect(
    new URL(card.props.href as string, 'http://ariso.test').searchParams.get(
      'returnTo',
    ),
  ).toBe(source);
  (card.props.onShare as (element: HTMLElement) => void)(opener);
  const share = new URL(navigation.push.mock.calls[0][0], 'http://ariso.test');
  expect(share.pathname).toBe('/shares/album');
  expect(share.searchParams.get('returnTo')).toBe(source);
  const returned = lifetime(() => AlbumsScreen(props));
  const search = elements(returned()).find(
    (element) => element.props['aria-label'] === '搜索相册',
  )!;
  expect(search.props.value).toBe('旅行');
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

it('shows a failed cached-detail refresh beside retained content and retries without replacing the workspace', async () => {
  let status: 'initial' | 'failed' | 'retry' = 'initial';
  let finishRetry!: (response: Response) => void;
  const fetcher = vi.fn(async () => {
    if (status === 'failed')
      return Response.json({ message: '详情回读失败' }, { status: 500 });
    if (status === 'retry')
      return new Promise<Response>((resolve) => {
        finishRetry = resolve;
      });
    return Response.json({ album });
  });
  vi.stubGlobal('fetch', fetcher);
  const render = lifetime(() => AlbumsScreen({ ...props, albumId: album.id }));
  render();
  await vi.waitFor(() => expect(pickerElement(render())).toBeDefined());
  const original = render();
  status = 'failed';
  original.props.renderWorkspace(null, null).props.onRefresh();
  await vi.waitFor(() => {
    const current = render();
    const error = refreshError(current);
    expect(error, 'A cached album must surface a failed refresh').toBeDefined();
    expect(renderToStaticMarkup(error)).toContain('详情回读失败');
    expect(renderToStaticMarkup(error)).toContain('相册刷新失败');
    expect(current.type).toBe(original.type);
    expect(pickerElement(current)?.props.album).toEqual(album);
    expect(
      renderToStaticMarkup(
        current.props.renderWorkspace(null, null).props.header,
      ),
    ).toContain('0 张图片');
  });

  const retry = elements(refreshError(render())).find(
    (element) => typeof element.props.onPress === 'function',
  )!;
  status = 'retry';
  (retry.props.onPress as () => void)();
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
  const duringRetry = render();
  expect(duringRetry.type).toBe(original.type);
  expect(pickerElement(duringRetry)?.props.album).toEqual(album);
  const pendingRetry = elements(refreshError(duringRetry)).find(
    (element) => typeof element.props.onPress === 'function',
  )!;
  expect(pendingRetry.props.isDisabled).toBe(true);
  expect(renderToStaticMarkup(refreshError(duringRetry))).toContain(
    '详情回读失败',
  );

  finishRetry(Response.json({ album: { ...album, imageCount: 1 } }));
  await vi.waitFor(() => {
    const current = render();
    expect(refreshError(current)).toBeUndefined();
    expect(pickerElement(current)?.props.album.imageCount).toBe(1);
    expect(current.type).toBe(original.type);
  });
});

it('replaces a cached album with the missing state after a 404 refresh and removes its old actions', async () => {
  let missing = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      missing
        ? Response.json({ message: '相册不存在' }, { status: 404 })
        : Response.json({ album }),
    ),
  );
  const render = lifetime(() => AlbumsScreen({ ...props, albumId: album.id }));
  render();
  await vi.waitFor(() => expect(pickerElement(render())).toBeDefined());
  const workspace = render().props.renderWorkspace(null, null);
  const edit = elements(workspace.props.toolbarActions).find(
    (element) => element.props.label === '编辑相册',
  )!;
  vi.stubGlobal('document', { activeElement: null });
  (edit.props.onPress as () => void)();
  vi.stubGlobal('document', undefined);
  missing = true;
  workspace.props.onRefresh();
  await vi.waitFor(() => {
    const current = render();
    expect(pickerElement(current)).toBeUndefined();
    expect('renderWorkspace' in current.props).toBe(false);
    expect(
      elements(current.props.children).find(
        (element) => element.type === AlbumDialog,
      ),
    ).toBeUndefined();
    const html = renderToStaticMarkup(current);
    expect(html).toContain('相册已不存在');
    expect(html).not.toContain('编辑相册');
    expect(html).not.toContain('添加图片');
  });
});

it('expires the session and stops exposing cached album actions after a 401 refresh', async () => {
  let expired = false;
  const replace = vi.fn();
  Object.assign(window, {
    location: { pathname: '/albums/album', search: '?page=2', replace },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      expired
        ? Response.json({ message: '会话已失效' }, { status: 401 })
        : Response.json({ album }),
    ),
  );
  const render = lifetime(() => AlbumsScreen({ ...props, albumId: album.id }));
  render();
  await vi.waitFor(() => expect(pickerElement(render())).toBeDefined());
  expired = true;
  render().props.renderWorkspace(null, null).props.onRefresh();
  await vi.waitFor(() => {
    const current = render();
    expect(pickerElement(current)).toBeUndefined();
    expect(replace).toHaveBeenCalledWith(
      '/login?reason=expired&returnTo=%2Falbums%2Falbum%3Fpage%3D2',
    );
    expect(session.resetUpload).toHaveBeenCalled();
  });
});
