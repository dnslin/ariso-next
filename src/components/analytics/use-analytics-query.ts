'use client';

import { useEffect } from 'react';
import {
  useQuery,
  type QueryClient,
  type QueryKey,
  type RefetchOptions,
  type UseQueryOptions,
} from '@tanstack/react-query';
import {
  overviewQueryOptions,
  usageQueryOptions,
  imageStatsQueryOptions,
  type ReportDays,
} from './read-analytics';

function useAnalyticsQuery<T, Key extends QueryKey>(
  client: QueryClient,
  options: UseQueryOptions<T, Error, T, Key>,
) {
  // Explicit clients need mounting to receive visibility changes. TanStack
  // reference-counts mounts, so page and image queries share one listener.
  useEffect(() => {
    client.mount();
    return () => client.unmount();
  }, [client]);
  const query = useQuery(options, client);
  return {
    ...query,
    refetch: (options?: RefetchOptions) =>
      query.refetch({ ...options, cancelRefetch: false }),
  };
}

export function useAnalyticsOverview(
  client: QueryClient,
  days: ReportDays,
  enabled = true,
) {
  return useAnalyticsQuery(client, overviewQueryOptions(days, enabled));
}

export function useAnalyticsUsage(client: QueryClient, enabled = true) {
  return useAnalyticsQuery(client, usageQueryOptions(enabled));
}

export function useImageAnalytics(
  client: QueryClient,
  imageId: string | null,
  enabled = true,
) {
  return useAnalyticsQuery(client, imageStatsQueryOptions(imageId, enabled));
}
