'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useSearchParams } from 'next/navigation';
import { parseAsNativeArrayOf, parseAsString, useQueryStates } from 'nuqs';
import {
  useInfiniteQuery,
  useQuery,
  type QueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import type { LibraryPage } from '../../server/library/types';
import type { LibraryFilters } from '../../server/library/query-schema';
import {
  libraryListKey,
  libraryRequestParams,
  parseLibraryLocation,
  type LibraryLayout,
  type LibraryLoadingMode,
  type LibraryQueryPatch,
} from './query-state';
import {
  defaultLibraryPreferences,
  getLibraryPreferences,
  serverLibraryPreferences,
  setLibraryPreferences,
  subscribeLibraryPreferences,
} from './library-preferences';

const parsers = {
  q: parseAsString,
  albumId: parseAsString,
  tagId: parseAsNativeArrayOf(parseAsString),
  uploadedFrom: parseAsString,
  uploadedBefore: parseAsString,
  format: parseAsString,
  storageId: parseAsString,
  visibility: parseAsString,
  status: parseAsString,
  sort: parseAsString,
  pageSize: parseAsString,
  page: parseAsString,
  image: parseAsString,
};

export class LibraryReadError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

export async function readLibraryResult(
  filters: LibraryFilters,
  position: { page?: number; cursor?: string | null },
  signal: AbortSignal,
): Promise<LibraryPage> {
  let response: Response;
  try {
    response = await fetch(
      `/api/images?${libraryRequestParams(filters, position)}`,
      {
        signal,
        cache: 'no-store',
      },
    );
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error('连接中断，无法读取图片列表，请检查网络后重试。', {
      cause: error,
    });
  }
  if (!response.ok) {
    const result = (await response.json()) as {
      message?: string;
      code?: string;
    };
    throw new LibraryReadError(
      result.message ?? `图片列表读取失败（HTTP ${response.status}），请重试。`,
      response.status,
      result.code ?? 'LIBRARY_READ_FAILED',
    );
  }
  return response.json();
}

const cacheOptions = {
  retry: false,
  networkMode: 'always' as const,
  staleTime: Infinity,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
};

export function useLibraryQuery(
  client: QueryClient,
  { albumId }: { albumId?: string } = {},
) {
  const params = useSearchParams();
  const [, setParams] = useQueryStates(parsers, {
    history: 'push',
    shallow: true,
    scroll: false,
  });
  const preferences = useSyncExternalStore(
    subscribeLibraryPreferences,
    getLibraryPreferences,
    serverLibraryPreferences,
  );
  const { layout, loadingMode: preferredLoadingMode } =
    preferences ?? defaultLibraryPreferences;
  let filters: LibraryFilters | null = null;
  let page = 1;
  let queryError: Error | null = null;
  try {
    ({ filters, page } = parseLibraryLocation(
      new URLSearchParams(params.toString()),
      albumId,
    ));
  } catch (error) {
    queryError = error instanceof Error ? error : new Error(String(error));
  }
  // A page in a copied link is navigation state, so it takes precedence over a
  // different browser's loading preference, including a return to page one.
  const loadingMode =
    !queryError && params.has('page') ? 'pages' : preferredLoadingMode;
  const queryKey = libraryListKey(filters, loadingMode, page);
  const enabled = preferences !== null && filters !== null;
  const paged = useQuery(
    {
      ...cacheOptions,
      queryKey: libraryListKey(filters, 'pages', page),
      enabled: enabled && loadingMode === 'pages',
      queryFn: ({ signal }) => readLibraryResult(filters!, { page }, signal),
    },
    client,
  );
  const infinite = useInfiniteQuery(
    {
      ...cacheOptions,
      queryKey: libraryListKey(filters, 'more', 1),
      enabled: enabled && loadingMode === 'more',
      queryFn: ({ pageParam, signal }) =>
        readLibraryResult(filters!, { cursor: pageParam }, signal),
      initialPageParam: null as string | null,
      getNextPageParam: (result) =>
        result.hasMore ? result.nextCursor : undefined,
    },
    client,
  );
  const active = loadingMode === 'pages' ? paged : infinite;
  const expired =
    active.error instanceof LibraryReadError && active.error.status === 401;
  const pages =
    !enabled || expired
      ? []
      : loadingMode === 'pages'
        ? paged.data
          ? [paged.data]
          : []
        : (infinite.data?.pages ?? []);
  const items = [
    ...new Map(
      pages.flatMap((entry) => entry.items).map((item) => [item.id, item]),
    ).values(),
  ];
  const [refreshAvailable, setRefreshAvailable] = useState(false);
  useEffect(() => {
    const changed = () => setRefreshAvailable(true);
    window.addEventListener('focus', changed);
    window.addEventListener('ariso:library-changed', changed);
    return () => {
      window.removeEventListener('focus', changed);
      window.removeEventListener('ariso:library-changed', changed);
    };
  }, []);

  // History restores cached pages and their scroll without replaying cursor requests.
  const scrollPositions = useRef(new Map<string, number>());
  const identity = JSON.stringify(queryKey);
  const scrollReady = enabled && !active.isPending;
  useLayoutEffect(() => {
    if (!scrollReady) return;
    const container = document.querySelector<HTMLElement>('.shell-content');
    if (!container) return;
    const positions = scrollPositions.current;
    const target = positions.get(identity) ?? 0;
    let scroll = target;
    const save = () => {
      scroll = container.scrollTop;
    };
    const frame = requestAnimationFrame(() => {
      container.scrollTo(0, target);
      scroll = container.scrollTop;
      // Begin observing after restoration: shorter pages can emit a late
      // scroll-to-zero event while this destination is being mounted.
      container.addEventListener('scroll', save, { passive: true });
    });
    return () => {
      cancelAnimationFrame(frame);
      positions.set(identity, scroll);
      container.removeEventListener('scroll', save);
    };
  }, [identity, scrollReady]);

  async function applyQuery(patch: LibraryQueryPatch) {
    const { pageSize, ...values } = patch;
    const update = {
      ...values,
      pageSize: String(pageSize ?? filters?.pageSize ?? 40),
      page: loadingMode === 'pages' ? '1' : null,
      image: null,
    };
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(update)) {
      next.delete(key);
      if (Array.isArray(value)) {
        for (const id of value) next.append(key, id);
      } else if (value !== null) next.set(key, value);
    }
    // Applying filters starts at the beginning; browser Back restores the untouched old cache.
    let target: LibraryFilters | null = null;
    try {
      target = parseLibraryLocation(next, albumId).filters;
    } catch {
      // Keep invalid values in the URL so the page can show the schema error and reset action.
    }
    if (target && JSON.stringify(target) !== JSON.stringify(filters)) {
      const key = libraryListKey(target, loadingMode, 1);
      await client.cancelQueries({ queryKey: key, exact: true });
      client.removeQueries({ queryKey: key, exact: true });
    }
    return setParams(update);
  }
  async function setLoadingMode(mode: LibraryLoadingMode) {
    if (mode === loadingMode) return;
    // A mode switch starts a new first batch; old mode history remains cacheable.
    await client.cancelQueries({
      queryKey: libraryListKey(filters, mode, 1),
      exact: true,
    });
    client.removeQueries({
      queryKey: libraryListKey(filters, mode, 1),
      exact: true,
    });
    await setParams({ page: mode === 'pages' ? '1' : null, image: null });
    setLibraryPreferences({ loadingMode: mode });
  }
  function resetQuery() {
    const url = new URL(window.location.href);
    url.search =
      loadingMode === 'pages' ? '?page=1&pageSize=40' : '?pageSize=40';
    window.history.pushState(null, '', url);
  }
  async function refresh() {
    setRefreshAvailable(false);
    if (!enabled) return;
    await client.resetQueries({ queryKey, exact: true });
  }
  async function onItemRemoved(id: string) {
    await client.cancelQueries({ queryKey: ['library'] });
    client.setQueriesData<InfiniteData<LibraryPage>>(
      { queryKey: ['library', 'more'] },
      (data) => {
        if (
          !data?.pages.some((page) => page.items.some((item) => item.id === id))
        )
          return data;
        return {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.filter((item) => item.id !== id),
            total: Math.max(0, page.total - 1),
          })),
        };
      },
    );
    // Offset pages shift after deletion; reload the current one, and mark any
    // cached previous pages stale for their next visit.
    await client.invalidateQueries({
      queryKey: ['library', 'pages'],
      refetchType: 'none',
    });
    if (loadingMode === 'pages' && enabled) await paged.refetch();
  }
  return {
    filters,
    queryError,
    layout,
    loadingMode,
    page,
    setLayout: (value: LibraryLayout) =>
      setLibraryPreferences({ layout: value }),
    setLoadingMode,
    applyQuery,
    resetQuery,
    setPage: (value: number) => setParams({ page: String(value), image: null }),
    items,
    total: pages.at(-1)?.total,
    pages,
    hasMore: loadingMode === 'more' && infinite.hasNextPage,
    isPending: !queryError && active.isPending,
    isFetching: active.isFetching,
    isFetchingNextPage: loadingMode === 'more' && infinite.isFetchingNextPage,
    isFetchNextPageError:
      loadingMode === 'more' && infinite.isFetchNextPageError,
    error: queryError ?? active.error,
    expired,
    canOperate:
      enabled &&
      !expired &&
      !active.isPending &&
      (!active.isFetching ||
        (loadingMode === 'more' && infinite.isFetchingNextPage)),
    loadMore: () => {
      if (
        loadingMode === 'more' &&
        !infinite.isFetching &&
        infinite.hasNextPage
      )
        return infinite.fetchNextPage({ cancelRefetch: false });
    },
    refresh,
    refreshAvailable,
    onItemRemoved,
  };
}
