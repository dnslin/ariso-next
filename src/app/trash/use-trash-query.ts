'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { parseAsString, useQueryStates } from 'nuqs';
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { libraryRequestParams } from '../library/query-state';
import {
  LibraryReadError,
  readLibraryResult,
} from '../library/use-library-query';
import type { TrashItem } from '../../server/library/trash-types';
import type { LibraryFilters } from '../../server/library/query-schema';
import { parseTrashLocation, type TrashQueryPatch } from './query-state';

const parsers = {
  q: parseAsString,
  storageId: parseAsString,
  status: parseAsString,
  deletionStatus: parseAsString,
  pageSize: parseAsString,
  page: parseAsString,
  image: parseAsString,
};

export function useTrashQuery(client: QueryClient, enabled = true) {
  const params = useSearchParams();
  const [, setParams] = useQueryStates(parsers, {
    history: 'push',
    shallow: true,
    scroll: false,
  });
  let filters: LibraryFilters | null = null;
  let page = 1;
  let queryError: Error | null = null;
  try {
    ({ filters, page } = parseTrashLocation(
      new URLSearchParams(params.toString()),
    ));
  } catch (error) {
    queryError = error instanceof Error ? error : new Error(String(error));
  }
  const query = filters
    ? libraryRequestParams(filters, {}).toString()
    : params.toString();
  const list = useQuery(
    {
      queryKey: ['trash', filters, page],
      enabled: enabled && !!filters,
      queryFn: ({ signal }) => readLibraryResult(filters!, { page }, signal),
      retry: false,
      networkMode: 'always',
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
    client,
  );
  const expired =
    list.error instanceof LibraryReadError && list.error.status === 401;
  const data =
    enabled && filters && !expired && !list.isError ? list.data : undefined;
  const items: TrashItem[] = useMemo(
    () =>
      data?.items.map((item) => ({
        ...item,
        thumbnailPath: item.thumbnailUrl,
        trashedAt: item.trashedAt!,
      })) ?? [],
    [data],
  );
  const identity = JSON.stringify(['trash', filters, page]);
  const scrollPositions = useRef(new Map<string, number>());
  const scrollReady = !!data && !params.has('image');
  useLayoutEffect(() => {
    if (!scrollReady) return;
    const container = document.querySelector<HTMLElement>('.shell-content');
    if (!container) return;
    const positions = scrollPositions.current;
    let scroll = positions.get(identity) ?? 0;
    const save = () => {
      scroll = container.scrollTop;
    };
    const frame = requestAnimationFrame(() => {
      container.scrollTo(0, scroll);
      container.addEventListener('scroll', save, { passive: true });
    });
    return () => {
      cancelAnimationFrame(frame);
      positions.set(identity, scroll);
      container.removeEventListener('scroll', save);
    };
  }, [identity, scrollReady]);

  async function applyQuery(patch: Partial<TrashQueryPatch>) {
    const update = {
      ...patch,
      ...(patch.q === '' ? { q: null } : {}),
      pageSize: String(patch.pageSize ?? filters?.pageSize ?? 40),
      page: '1',
      image: null,
    };
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(update)) {
      next.delete(key);
      if (value !== null) next.set(key, String(value));
    }
    let target: LibraryFilters | null = null;
    try {
      target = parseTrashLocation(next).filters;
    } catch {
      // Invalid values remain in the URL for the existing error and reset UI.
    }
    if (target && JSON.stringify(target) !== JSON.stringify(filters)) {
      // Applying a filter reads a new first page; Back retains the other caches.
      const queryKey = ['trash', target, 1];
      await client.cancelQueries({ queryKey, exact: true });
      client.removeQueries({ queryKey, exact: true });
    }
    return setParams(update);
  }
  function resetQuery() {
    const url = new URL(window.location.href);
    url.search = '?page=1&pageSize=40';
    window.history.pushState(null, '', url);
  }
  return {
    ...list,
    data: data ? { ...data, items } : undefined,
    error: queryError ?? list.error,
    isPending: !queryError && list.isPending,
    filters,
    query,
    page,
    expired,
    queryError,
    applyQuery,
    resetQuery,
    setPage: (value: number) => setParams({ page: String(value), image: null }),
  };
}
