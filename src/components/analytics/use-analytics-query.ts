'use client';

import { useEffect, useState } from 'react';
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
  AnalyticsReadError,
  type AnalyticsOverview,
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
  const query = useAnalyticsQuery(client, overviewQueryOptions(days, enabled));
  const [lastSuccess, setLastSuccess] = useState<AnalyticsOverview>();
  const unavailable =
    !enabled ||
    (query.error instanceof AnalyticsReadError && query.error.status === 401);
  // Query keys still own cancellation and retries. Retain the displayed report
  // separately because placeholderData disappears after a new-period failure.
  const data = unavailable ? undefined : (query.data ?? lastSuccess);
  if (data !== lastSuccess) setLastSuccess(data);
  return { ...query, data };
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
