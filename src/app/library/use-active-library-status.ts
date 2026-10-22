'use client';

import { useEffect, useEffectEvent, useMemo } from 'react';
import {
  hashKey,
  useQuery,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import type { LibraryItem } from '../../server/library/types';
import { hasActiveDetailTask } from '../../components/library/read-detail-status';
import { DetailReadError } from '../../components/library/read-detail';
import {
  applyActiveLibraryStatus,
  readActiveLibraryStatuses,
} from './active-library-status';

export function useActiveLibraryStatus(
  client: QueryClient,
  key: QueryKey,
  items: LibraryItem[],
  enabled: boolean,
  onSettled: () => Promise<void>,
) {
  const ids = useMemo(
    () =>
      items
        .filter(hasActiveDetailTask)
        .map((item) => item.id)
        .sort(),
    [items],
  );
  const identity = hashKey(key);
  const status = useQuery(
    {
      queryKey: ['library', 'active-status', ids],
      queryFn: ({ signal }) => readActiveLibraryStatuses(ids, signal),
      enabled: enabled && ids.length > 0,
      retry: false,
      networkMode: 'always',
      gcTime: 0,
      refetchOnWindowFocus: true,
      refetchInterval: (query) =>
        query.state.error ||
        (query.state.data && !query.state.data.items.some(hasActiveDetailTask))
          ? false
          : 2000,
    },
    client,
  );
  const apply = useEffectEvent(() => {
    if (status.data && applyActiveLibraryStatus(client, key, status.data))
      void onSettled();
  });
  useEffect(() => {
    if (enabled && status.data) apply();
  }, [enabled, status.data, identity]);
  return {
    error: status.error,
    expired:
      status.error instanceof DetailReadError && status.error.status === 401,
    retry: () => {
      void status.refetch();
    },
  };
}
