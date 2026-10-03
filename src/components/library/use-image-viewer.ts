'use client';

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react';
import { isCancelledError, QueryClient, useQuery } from '@tanstack/react-query';
import type { LibraryDetail } from '../../server/library/detail-types';
import type { LibraryFilters } from '../../server/library/query-schema';
import type { VersionKind } from '../../server/media/schema';
import { subscribeLibraryChanges } from './library-changes';
import { DetailReadError, detailQueryOptions } from './read-detail';
import { useDetailStatus } from './use-detail-status';
import { readViewerNeighbors } from './read-viewer-neighbors';
import {
  initialViewerVersion,
  isViewerPreview,
  readViewerPreview,
  viewerVersionReason,
  type ViewerDirection,
  type ViewerNeighbors,
} from './viewer-model';

export interface ViewerNeighbor {
  id: string;
  detail: LibraryDetail | null;
}

export function useImageViewer({
  initial,
  filters,
  albumId,
  initialVersion,
  onSessionExpired,
}: {
  initial: LibraryDetail;
  filters?: LibraryFilters;
  albumId?: string;
  initialVersion?: VersionKind;
  onSessionExpired: () => void;
}) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, gcTime: 0, networkMode: 'always' },
        },
      }),
  );
  const [seed, setSeed] = useState<{
    detail: LibraryDetail;
    kind: VersionKind;
    neighbors?: ViewerNeighbors;
  }>(() => ({
    detail: initial,
    kind: initialVersion ?? initialViewerVersion(initial),
  }));
  const [pendingDirection, setPendingDirection] =
    useState<ViewerDirection | null>(null);
  const [navigationError, setNavigationError] = useState<{
    direction: ViewerDirection;
    message: string;
  } | null>(null);
  const navigation = useRef<{
    id: string;
    controller: AbortController;
  } | null>(null);
  const imageId = seed.detail.id;
  const detailQuery = useQuery(
    { ...detailQueryOptions(imageId, albumId), initialData: seed.detail },
    client,
  );
  const current = detailQuery.data;
  const neighbors = useQuery(
    {
      queryKey: ['viewer-neighbors', imageId, filters],
      queryFn: ({ signal }) => readViewerNeighbors(imageId, filters!, signal),
      enabled: !!filters,
      initialData: seed.neighbors,
      staleTime: 0,
      refetchOnWindowFocus: false,
    },
    client,
  );
  const previousId = filters ? (neighbors.data?.previous ?? null) : null;
  const nextId = filters ? (neighbors.data?.next ?? null) : null;
  const previousQuery = useQuery(
    detailQueryOptions(previousId, albumId),
    client,
  );
  const nextQuery = useQuery(detailQueryOptions(nextId, albumId), client);
  const status = useDetailStatus({
    client,
    imageId,
    detail: current,
    refetch: detailQuery.refetch,
    enabled: true,
  });
  const currentStatus = status.data?.items.find((item) => item.id === imageId);
  const unavailableDetail = currentStatus
    ? {
        ...current,
        storage: currentStatus.storage,
        trashedAt: currentStatus.trashedAt,
        deletionStatus: currentStatus.deletionStatus,
      }
    : current;
  const selectedVersion = seed.kind;
  const selected = current.versions.find(
    (version) => version.kind === selectedVersion,
  );
  const unavailableReason =
    status.data?.missingIds.includes(imageId) ||
    (detailQuery.error instanceof DetailReadError &&
      detailQuery.error.status === 404)
      ? '图片已不存在，无法继续查看。'
      : viewerVersionReason(unavailableDetail, selected);
  const expired = [
    detailQuery.error,
    neighbors.error,
    previousQuery.error,
    nextQuery.error,
    status.error,
  ].some((error) => error instanceof DetailReadError && error.status === 401);
  const expireSession = useEffectEvent(onSessionExpired);
  useEffect(() => {
    if (!expired) return;
    navigation.current?.controller.abort();
    client.clear();
    expireSession();
  }, [client, expired]);
  const refreshDetail = detailQuery.refetch;
  const refreshNeighbors = neighbors.refetch;
  const refreshStatus = status.refetch;
  const refresh = useCallback(() => {
    void refreshDetail();
    void refreshStatus();
    if (filters) void refreshNeighbors();
  }, [filters, refreshDetail, refreshNeighbors, refreshStatus]);
  useEffect(() => {
    const unsubscribe = subscribeLibraryChanges(refresh);
    window.addEventListener('focus', refresh);
    return () => {
      unsubscribe();
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);
  useEffect(
    () => () => {
      navigation.current?.controller.abort();
      client.clear();
    },
    [client],
  );

  async function navigate(direction: ViewerDirection) {
    const targetId = direction === 'previous' ? previousId : nextId;
    if (!targetId) return;
    const previousRequest = navigation.current;
    previousRequest?.controller.abort();
    if (previousRequest)
      void client.cancelQueries({
        queryKey: ['library-detail', previousRequest.id, albumId],
      });
    const request = { id: targetId, controller: new AbortController() };
    navigation.current = request;
    setPendingDirection(direction);
    setNavigationError(null);
    try {
      const target = await client.fetchQuery({
        ...detailQueryOptions(targetId, albumId),
        staleTime: 0,
      });
      await readViewerPreview(target, request.controller.signal);
      if (navigation.current !== request || request.controller.signal.aborted)
        return;
      setSeed({
        detail: target,
        kind: initialViewerVersion(target),
        neighbors: {
          previous: direction === 'next' ? imageId : null,
          next: direction === 'previous' ? imageId : null,
        },
      });
    } catch (error) {
      if (
        navigation.current !== request ||
        request.controller.signal.aborted ||
        isCancelledError(error)
      )
        return;
      if (error instanceof DetailReadError && error.status === 401) {
        client.clear();
        onSessionExpired();
      } else
        setNavigationError({
          direction,
          message:
            error instanceof Error ? error.message : '相邻图片读取失败。',
        });
    } finally {
      if (navigation.current === request) {
        navigation.current = null;
        setPendingDirection(null);
      }
    }
  }

  const neighbor = (
    id: string | null,
    query: typeof previousQuery,
  ): ViewerNeighbor | null =>
    id
      ? {
          id,
          detail: query.data ?? null,
        }
      : null;
  return {
    current,
    previous: neighbor(previousId, previousQuery),
    next: neighbor(nextId, nextQuery),
    selectedVersion,
    isPreview: isViewerPreview(current, selectedVersion),
    unavailableReason,
    pendingDirection,
    navigationError,
    neighborsError: neighbors.error,
    statusError: detailQuery.error ?? status.error,
    navigate,
    dismissNavigationError: () => setNavigationError(null),
    refresh,
  };
}
