'use client';

import { useEffect, useEffectEvent } from 'react';
import { useQuery, type QueryClient } from '@tanstack/react-query';
import type { LibraryDetail } from '../../server/library/detail-types';
import {
  detailStatusChanged,
  hasActiveDetailTask,
  readDetailStatus,
} from './read-detail-status';

export function useDetailStatus({
  client,
  imageId,
  detail,
  enabled,
  refetch,
}: {
  client: QueryClient;
  imageId: string | null;
  detail: LibraryDetail | undefined;
  enabled: boolean;
  refetch: () => void;
}) {
  const status = useQuery(
    {
      queryKey: ['library-detail-status', imageId],
      queryFn: ({ signal }) => readDetailStatus(imageId!, signal),
      enabled,
      retry: false,
      networkMode: 'always',
      refetchOnWindowFocus: false,
      refetchInterval: (query) =>
        query.state.error ||
        (query.state.data && !query.state.data.items.some(hasActiveDetailTask))
          ? false
          : 2000,
    },
    client,
  );
  const refreshChangedDetail = useEffectEvent(() => {
    if (
      detail &&
      status.data &&
      detailStatusChanged(
        detail,
        status.data.items.find((item) => item.id === imageId),
      )
    )
      void refetch();
  });
  useEffect(() => {
    if (enabled) refreshChangedDetail();
  }, [enabled, imageId, status.data]);
  return status;
}
