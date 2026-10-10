'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { QueryClient, useQuery } from '@tanstack/react-query';
import { useResetUpload } from '../upload/provider';
import { DetailReadError, detailQueryOptions } from './read-detail';
import { notifyLibraryChanged } from './library-changes';
import { hasActiveDetailTask } from './read-detail-status';
import { useDetailStatus } from './use-detail-status';

export function useDetailQuery(
  client: QueryClient,
  imageId: string | null,
  returnTo: string,
  albumId?: string,
  enabled = true,
) {
  const resetUpload = useResetUpload();
  const [pendingImageId, setPendingImageId] = useState<string | null>(null);
  const mutationPending = imageId !== null && pendingImageId === imageId;
  const [pausedImageId, setPausedImageId] = useState<string | null>(null);
  const observationPaused = imageId !== null && pausedImageId === imageId;
  const setObservationPaused = useCallback(
    (paused: boolean) => setPausedImageId(paused ? imageId : null),
    [imageId],
  );
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
      ...detailQueryOptions(imageId, albumId),
      enabled:
        enabled &&
        !!imageId &&
        !mutationPending &&
        !unavailable &&
        !observationPaused,
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
    if (!imageId || observationPaused || taskState === null) return;
    const previous = observedTask.current;
    observedTask.current = { imageId, state: taskState };
    if (previous?.imageId === imageId && previous.state !== taskState)
      notifyLibraryChanged();
  }, [imageId, observationPaused, taskState]);
  const status = useDetailStatus({
    client,
    imageId,
    detail: query.data,
    refetch: query.refetch,
    enabled:
      enabled &&
      !!imageId &&
      !!query.data &&
      hasActiveDetailTask(query.data) &&
      !mutationPending &&
      !unavailable &&
      !query.isError &&
      !observationPaused,
  });
  const expired =
    unavailable === 401 ||
    [query.error, status.error].some(
      (error) => error instanceof DetailReadError && error.status === 401,
    );
  useEffect(() => {
    if (!expired || !enabled) return;
    resetUpload();
    client.clear();
    window.location.replace(
      `/login?reason=expired&returnTo=${encodeURIComponent(returnTo)}`,
    );
  }, [client, enabled, expired, resetUpload, returnTo]);
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
    setObservationPaused,
    statusError: status.error,
    retryStatus: status.refetch,
  };
}
