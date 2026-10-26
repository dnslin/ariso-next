'use client';

import { storageReferenceReturn } from '../../components/storage/reference-navigation';
import type { SmartCollection } from '../../server/library/smart-rules';
import {
  resolveCollectionRules,
  SmartCollectionRequestError,
} from './smart-collection-client';

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useSearchParams } from 'next/navigation';
import { parseAsNativeArrayOf, parseAsString, useQueryStates } from 'nuqs';
import {
  hashKey,
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  type QueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import type { LibraryItem, LibraryPage } from '../../server/library/types';
import type { LibraryFilters } from '../../server/library/query-schema';
import type {
  BatchCommand,
  BatchItemResult,
} from '../../server/library/batch-types';
import { subscribeLibraryChanges } from '../../components/library/library-changes';
import { readLibraryStatuses } from '../../components/library/read-detail-status';
import { useActiveLibraryStatus } from './use-active-library-status';
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
  scope: parseAsString,
  q: parseAsString,
  albumId: parseAsString,
  tagId: parseAsNativeArrayOf(parseAsString),
  tagState: parseAsString,
  sizeGreaterThan: parseAsString,
  sizeLessThan: parseAsString,
  recentDays: parseAsString,
  relativeTo: parseAsString,
  uploadedFrom: parseAsString,
  uploadedBefore: parseAsString,
  format: parseAsString,
  storageId: parseAsString,
  visibility: parseAsString,
  status: parseAsString,
  failure: parseAsString,
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
  {
    albumId,
    collection,
    initialQuery,
  }: {
    albumId?: string;
    collection?: SmartCollection;
    initialQuery?: string;
  } = {},
  activeSession = true,
) {
  const params = useSearchParams();
  const [, setParams] = useQueryStates(parsers, {
    history: 'push',
    shallow: true,
    scroll: false,
  });
  const collectionReady = !collection || params.get('scope') === 'normal';
  const collectionStarted = useRef(false);
  const queryChange = useRef(0);
  const [actionError, setActionError] = useState<Error | null>(null);
  const [resolving, setResolving] = useState(false);
  useEffect(() => {
    const invalidate = () => {
      queryChange.current++;
    };
    const onHistory = () => {
      invalidate();
      setResolving(false);
    };
    window.addEventListener('popstate', onHistory);
    return () => {
      invalidate();
      window.removeEventListener('popstate', onHistory);
    };
  }, []);
  useEffect(() => {
    if (collectionStarted.current || !collection || !initialQuery) return;
    collectionStarted.current = true;
    const url = new URL(window.location.href);
    const saved = new URLSearchParams(initialQuery);
    const hasDraft = [...url.searchParams.keys()].some(
      (key) =>
        !['page', 'pageSize', 'image', 'detailView', 'preview'].includes(key),
    );
    if (!hasDraft) {
      for (const key of ['page', 'pageSize', 'image', 'detailView', 'preview'])
        for (const value of url.searchParams.getAll(key)) saved.set(key, value);
      url.search = saved.toString();
    } else if (url.searchParams.has('recentDays')) {
      // The server supplies the opening instant; data refreshes retain it afterward.
      url.searchParams.set(
        'relativeTo',
        new URLSearchParams(initialQuery).get('relativeTo') ??
          new Date().toISOString(),
      );
    }
    url.searchParams.set('scope', 'normal');
    const update = Object.fromEntries(
      Object.keys(parsers).map((key) => [
        key,
        key === 'tagId'
          ? url.searchParams.getAll(key)
          : url.searchParams.get(key),
      ]),
    );
    // Nuqs publishes the new search state even during the router's first hydration.
    void setParams(update, { history: 'replace' }).catch((error: unknown) => {
      setActionError(error instanceof Error ? error : new Error(String(error)));
    });
  }, [collection, initialQuery, setParams]);
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
  const [initializing, setInitializing] = useState(true);
  const hasPage = params.has('page');
  // Resolve the saved preference once, using the existing page encoding. Later
  // history entries must not be reinterpreted when that preference changes.
  useEffect(() => {
    if (!initializing || preferences === null) return;
    if (!queryError && !hasPage && preferredLoadingMode === 'pages') {
      // Commit initialization directly: navigation can cancel nuqs' queued update.
      const url = new URL(window.location.href);
      url.searchParams.set('page', '1');
      window.history.replaceState(null, '', url);
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Finish URL initialization after the navigation adapter has published it.
    setInitializing(false);
  }, [initializing, preferences, queryError, hasPage, preferredLoadingMode]);
  const loadingMode: LibraryLoadingMode = hasPage ? 'pages' : 'more';
  const queryKey = libraryListKey(filters, loadingMode, page);
  const enabled =
    collectionReady &&
    activeSession &&
    preferences !== null &&
    filters !== null &&
    !(initializing && !hasPage && preferredLoadingMode === 'pages');
  const paged = useQuery(
    {
      ...cacheOptions,
      queryKey: libraryListKey(filters, 'pages', page),
      placeholderData: keepPreviousData,
      enabled: enabled && loadingMode === 'pages',
      queryFn: ({ signal }) => readLibraryResult(filters!, { page }, signal),
    },
    client,
  );
  const infinite = useInfiniteQuery(
    {
      ...cacheOptions,
      queryKey: libraryListKey(filters, 'more', 1),
      placeholderData: keepPreviousData,
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
    (active.error instanceof LibraryReadError && active.error.status === 401) ||
    (actionError instanceof SmartCollectionRequestError &&
      actionError.status === 401);
  const pages = useMemo(
    () =>
      !enabled || expired
        ? []
        : loadingMode === 'pages'
          ? paged.data
            ? [paged.data]
            : []
          : (infinite.data?.pages ?? []),
    [enabled, expired, loadingMode, paged.data, infinite.data],
  );
  const items = useMemo(
    () => [
      ...new Map(
        pages.flatMap((entry) => entry.items).map((item) => [item.id, item]),
      ).values(),
    ],
    [pages],
  );
  const [refreshAvailable, setRefreshAvailable] = useState(false);
  const activity = useActiveLibraryStatus(
    client,
    queryKey,
    items,
    enabled && !expired,
    refreshCurrent,
  );
  useEffect(() => subscribeLibraryChanges(() => setRefreshAvailable(true)), []);

  // History restores cached pages and their scroll without replaying cursor requests.
  const scrollPositions = useRef(new Map<string, number>());
  const identity = JSON.stringify(queryKey);
  const scrollReady = enabled && !active.isPending && !active.isPlaceholderData;
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

  async function applyQuery(
    patch: LibraryQueryPatch,
    resolvedRelativeTo?: string | null,
  ) {
    const change = ++queryChange.current;
    setActionError(null);
    if (!patch.recentDays) setResolving(false);
    const { pageSize, ...values } = patch;
    const update: Record<string, string | string[] | null> = {
      ...values,
      pageSize: String(pageSize ?? filters?.pageSize ?? 40),
      page: loadingMode === 'pages' ? '1' : null,
      image: null,
    };
    if (patch.recentDays) {
      update.uploadedFrom = null;
      update.uploadedBefore = null;
      update.relativeTo = null;
    }
    if (patch.recentDays === null) update.relativeTo = null;
    if (
      (patch.uploadedFrom !== undefined && patch.uploadedFrom !== null) ||
      (patch.uploadedBefore !== undefined && patch.uploadedBefore !== null)
    ) {
      update.recentDays = null;
      update.relativeTo = null;
    }
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(update)) {
      next.delete(key);
      if (Array.isArray(value)) {
        for (const id of value) next.append(key, id);
      } else if (value !== null) next.set(key, value);
    }
    if (patch.recentDays && resolvedRelativeTo) {
      update.relativeTo = resolvedRelativeTo;
      next.set('relativeTo', resolvedRelativeTo);
    } else if (patch.recentDays) {
      setResolving(true);
      try {
        const rules = Object.fromEntries(
          [...new Set(next.keys())]
            .filter(
              (key) =>
                ![
                  'scope',
                  'page',
                  'pageSize',
                  'image',
                  'detailView',
                  'preview',
                  'relativeTo',
                  'analyticsReturn',
                  'storageReturn',
                  'returnTo',
                ].includes(key),
            )
            .map((key) => [
              key,
              key === 'tagId' ? next.getAll(key) : next.get(key)!,
            ]),
        );
        const resolved = await resolveCollectionRules(rules);
        if (change !== queryChange.current) return;
        update.relativeTo = new URLSearchParams(resolved.query).get(
          'relativeTo',
        );
        next.set('relativeTo', update.relativeTo!);
      } catch (error) {
        if (change === queryChange.current)
          setActionError(
            error instanceof Error ? error : new Error(String(error)),
          );
        return;
      } finally {
        if (change === queryChange.current) setResolving(false);
      }
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
      if (change !== queryChange.current) return;
      client.removeQueries({ queryKey: key, exact: true });
    }
    if (change !== queryChange.current) return;
    return setParams(update);
  }
  async function replaceQuery(value: string, expectedChange?: number) {
    if (expectedChange !== undefined && expectedChange !== queryChange.current)
      return false;
    const next = new URLSearchParams(value);
    next.set('pageSize', String(filters?.pageSize ?? 40));
    const target = parseLibraryLocation(next, albumId).filters;
    if (JSON.stringify(target) === JSON.stringify(filters)) {
      const revision = queryChange.current;
      await refreshCurrent();
      return revision === queryChange.current;
    }
    const patch = Object.fromEntries(
      Object.keys(parsers)
        .filter((key) => !['scope', 'page', 'pageSize', 'image'].includes(key))
        .map((key) => [
          key,
          key === 'tagId' ? next.getAll(key) : next.get(key),
        ]),
    ) as LibraryQueryPatch;
    const applied = await applyQuery(patch, next.get('relativeTo'));
    if (!applied) return false;
    return true;
  }
  async function setLoadingMode(mode: LibraryLoadingMode) {
    queryChange.current++;
    setResolving(false);
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
    queryChange.current++;
    setResolving(false);
    const url = new URL(window.location.href);
    const storageSource = storageReferenceReturn(
      url.searchParams.get('storageReturn'),
    );
    const albumSource = albumId ? url.searchParams.get('returnTo') : null;
    url.search =
      loadingMode === 'pages' ? '?page=1&pageSize=40' : '?pageSize=40';
    if (collection) url.searchParams.set('scope', 'normal');
    if (storageSource) url.searchParams.set('storageReturn', storageSource);
    if (albumSource) url.searchParams.set('returnTo', albumSource);
    window.history.pushState(null, '', url);
  }
  async function refresh() {
    setRefreshAvailable(false);
    if (!enabled) return;
    if (filters?.recentDays !== undefined) {
      await applyQuery({ recentDays: String(filters.recentDays) });
      return;
    }
    if (loadingMode === 'more') {
      // Refresh starts from the first batch, keeping its real cards visible.
      const dataUpdatedAt = client.getQueryState(queryKey)?.dataUpdatedAt;
      client.setQueryData<InfiniteData<LibraryPage>>(
        queryKey,
        (data) =>
          data ? { pages: data.pages.slice(0, 1), pageParams: [null] } : data,
        { updatedAt: dataUpdatedAt },
      );
    }
    await active.refetch();
  }
  async function refreshCurrent() {
    setRefreshAvailable(false);
    if (enabled) await active.refetch();
  }
  async function onBatchCompleted(
    results: BatchItemResult[],
    command: BatchCommand,
  ) {
    if (!enabled || !filters || !results.length) return;
    await client.cancelQueries({ queryKey: ['library'] });
    const filterKey = hashKey([filters]);
    const byId = new Map(results.map((result) => [result.id, result]));
    const cached = client.getQueryCache().findAll({
      queryKey: ['library'],
      predicate: (query) => hashKey([query.queryKey[2]]) === filterKey,
    });
    const removed = new Set<string>();
    for (const query of cached) {
      const data = query.state.data as
        LibraryPage | InfiniteData<LibraryPage> | undefined;
      if (!data) continue;
      for (const entry of 'pages' in data ? data.pages : [data])
        for (const item of entry.items)
          if (byId.get(item.id)?.inQuery === false) removed.add(item.id);
    }
    const update = (entry: LibraryPage): LibraryPage => ({
      ...entry,
      total: Math.max(0, entry.total - removed.size),
      items: entry.items.flatMap((item) => {
        const result = byId.get(item.id);
        if (!result) return [item];
        if (!result.inQuery) return [];
        return [
          command.type === 'visibility' && result.status !== 'failed'
            ? { ...item, visibility: command.visibility }
            : item,
        ];
      }),
    });
    for (const query of cached) {
      const data = query.state.data as
        LibraryPage | InfiniteData<LibraryPage> | undefined;
      if (data)
        client.setQueryData(
          query.queryKey,
          'pages' in data
            ? { ...data, pages: data.pages.map(update) }
            : update(data),
        );
    }
    // Offset positions may shift; other query histories must reread their membership.
    // This query's loaded pages retain the server cursor values, including deleted anchors.
    await client.invalidateQueries({
      queryKey: ['library'],
      predicate: (query) =>
        query.queryKey[1] === 'pages' ||
        hashKey([query.queryKey[2]]) !== filterKey,
      refetchType: 'none',
    });
    setRefreshAvailable(false);
    if (loadingMode === 'pages') await paged.refetch({ throwOnError: true });
    else if (
      command.type === 'reprocess' ||
      command.type === 'add-albums' ||
      command.type === 'remove-albums'
    ) {
      const ids = items
        .filter((item) => byId.get(item.id)?.inQuery === true)
        .map((item) => item.id);
      const statuses = await client.fetchQuery({
        queryKey: ['library', 'batch-status', ids],
        queryFn: async ({ signal }) => {
          const batches = [];
          for (let offset = 0; offset < ids.length; offset += 80)
            batches.push(
              await readLibraryStatuses(ids.slice(offset, offset + 80), signal),
            );
          return batches;
        },
        staleTime: 0,
        gcTime: 0,
        retry: false,
        networkMode: 'always',
      });
      const updated = new Map<string, LibraryItem>(
        statuses.flatMap((status) =>
          status.items.map((item) => [item.id, item]),
        ),
      );
      const missing = new Set(statuses.flatMap((status) => status.missingIds));
      client.setQueryData<InfiniteData<LibraryPage>>(queryKey, (data) => {
        if (!data) return data;
        const removed = new Set(
          data.pages.flatMap((page) =>
            page.items
              .filter((item) => missing.has(item.id))
              .map((item) => item.id),
          ),
        );
        return {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            total: Math.max(0, page.total - removed.size),
            items: page.items.flatMap((item) =>
              missing.has(item.id) ? [] : [updated.get(item.id) ?? item],
            ),
          })),
        };
      });
    }
  }
  function onSelectionInvalid(ids: string[]) {
    if (!ids.length || !filters) return;
    const filterKey = hashKey([filters]);
    const invalid = new Set(ids);
    const prune = (page: LibraryPage) => ({
      ...page,
      items: page.items.filter((item) => !invalid.has(item.id)),
    });
    for (const mode of ['pages', 'more'] as const) {
      for (const cached of client.getQueryCache().findAll({
        queryKey: ['library', mode],
        predicate: (cached) => hashKey([cached.queryKey[2]]) === filterKey,
      })) {
        const data = cached.state.data as
          LibraryPage | InfiniteData<LibraryPage> | undefined;
        if (!data) continue;
        const updated =
          'pages' in data
            ? { ...data, pages: data.pages.map(prune) }
            : prune(data);
        // Preserve the last server-read timestamp: pruning is not a new list response.
        // Total and ordering remain the last query snapshot until explicit refresh.
        client.setQueryData(cached.queryKey, updated, {
          updatedAt: cached.state.dataUpdatedAt,
        });
      }
    }
    setRefreshAvailable(true);
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
    dataUpdatedAt: active.dataUpdatedAt,
    queryError,
    layout,
    loadingMode,
    page,
    setLayout: (value: LibraryLayout) =>
      setLibraryPreferences({ layout: value }),
    setLoadingMode,
    applyQuery,
    replaceQuery,
    getQueryRevision: () => queryChange.current,
    resetQuery,
    setPage: (value: number) => {
      queryChange.current++;
      setResolving(false);
      return setParams({ page: String(value), image: null });
    },
    items,
    total: pages.at(-1)?.total,
    pages,
    hasMore: loadingMode === 'more' && infinite.hasNextPage,
    isPending: !queryError && active.isPending,
    isFetching: active.isFetching,
    isFetchingNextPage: loadingMode === 'more' && infinite.isFetchingNextPage,
    isFetchNextPageError:
      loadingMode === 'more' && infinite.isFetchNextPageError,
    error: queryError ?? actionError ?? active.error,
    expired: expired || activity.expired,
    statusError: activity.error,
    retryStatus: activity.retry,
    canOperate:
      enabled &&
      !resolving &&
      !expired &&
      !activity.expired &&
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
    refreshCurrent,
    onBatchCompleted,
    refreshAvailable,
    onItemRemoved,
    onSelectionInvalid,
  };
}
