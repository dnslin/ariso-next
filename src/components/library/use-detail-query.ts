'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { QueryClient, useQuery } from '@tanstack/react-query';
import { useResetUpload } from '../upload/provider';
import { DetailReadError, readDetail } from './read-detail';
import { notifyLibraryChanged } from './library-changes';
import {
  detailStatusChanged,
  hasActiveDetailTask,
  readDetailStatus,
} from './read-detail-status';

export function useDetailQuery(
  client: QueryClient,
  imageId: string | null,
  returnTo: string,
  albumId?: string,
) {
  const resetUpload = useResetUpload();
  const [pendingImageId, setPendingImageId] = useState<string | null>(null);
  const mutationPending = imageId !== null && pendingImageId === imageId;
  const [availability, setAvailability] = useState<{
    imageId: string | null;
    status: 401 | 404;
  } | null>(null);
  const unavailable =
    availability?.imageId === imageId ? availability.status : null;
  const setUnavailable = useCallback(
    (status: 401 | 404) => setAvailability({ imageId, status }),
    [imageId],
  );
  const query = useQuery(
    {
      queryKey: ['library-detail', imageId, albumId],
      queryFn: ({ signal }) => readDetail(imageId!, signal, albumId),
      enabled: !!imageId && !mutationPending && !unavailable,
      retry: false,
      networkMode: 'always',
      staleTime: 0,
      refetchOnWindowFocus: true,
    },
    client,
  );
  const observedTask = useRef<{ imageId: string; state: string } | null>(null);
  const taskState = query.data
    ? JSON.stringify([
        query.data.processingStatus,
        query.data.processingJob?.id,
        query.data.processingJob?.status,
      ])
    : null;
  useEffect(() => {
    if (!imageId || taskState === null) return;
    const previous = observedTask.current;
    observedTask.current = { imageId, state: taskState };
    if (previous?.imageId === imageId && previous.state !== taskState)
      notifyLibraryChanged();
  }, [imageId, taskState]);
  const status = useQuery(
    {
      queryKey: ['library-detail-status', imageId],
      queryFn: ({ signal }) => readDetailStatus(imageId!, signal),
      enabled:
        !!imageId &&
        !!query.data &&
        hasActiveDetailTask(query.data) &&
        !mutationPending &&
        !unavailable &&
        !query.isError,
      retry: false,
      networkMode: 'always',
      refetchOnWindowFocus: false,
      refetchInterval: (state) =>
        state.state.error ||
        (state.state.data && !state.state.data.items.some(hasActiveDetailTask))
          ? false
          : 2000,
    },
    client,
  );
  const expired =
    unavailable === 401 ||
    [query.error, status.error].some(
      (error) => error instanceof DetailReadError && error.status === 401,
    );
  useEffect(() => {
    if (!expired) return;
    resetUpload();
    client.clear();
    window.location.replace(
      `/login?reason=expired&returnTo=${encodeURIComponent(returnTo)}`,
    );
  }, [client, expired, resetUpload, returnTo]);
  const statusData = status.data;
  const refetch = query.refetch;
  useEffect(() => {
    const record = client.getQueryData<Awaited<ReturnType<typeof readDetail>>>([
      'library-detail',
      imageId,
      albumId,
    ]);
    if (
      record &&
      statusData &&
      detailStatusChanged(
        record,
        statusData.items.find((item) => item.id === imageId),
      )
    )
      void refetch();
  }, [client, statusData, imageId, albumId, refetch]);
  useEffect(
    () => () => {
      if (!imageId) return;
      client.removeQueries({ queryKey: ['library-detail', imageId] });
      client.removeQueries({ queryKey: ['library-detail-status', imageId] });
    },
    [client, imageId],
  );
  const onMutationPending = useCallback(
    (pending: boolean) => {
      if (pending) {
        void client.cancelQueries({ queryKey: ['library-detail', imageId] });
        void client.cancelQueries({
          queryKey: ['library-detail-status', imageId],
        });
      }
      setPendingImageId((current) =>
        pending ? imageId : current === imageId ? null : current,
      );
    },
    [client, imageId],
  );
  return {
    ...query,
    expired,
    unavailable,
    setUnavailable,
    mutationPending,
    onMutationPending,
    statusError: status.error,
    retryStatus: status.refetch,
  };
}
