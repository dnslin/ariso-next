import { queryOptions } from '@tanstack/react-query';
import type {
  readOverview,
  readImageStats,
  ReportDays,
} from '../../server/analytics/queries';
import type { readUsage } from '../../server/analytics/usage';

type JsonValue<T> = T extends Date
  ? string
  : T extends object
    ? { [Key in keyof T]: JsonValue<T[Key]> }
    : T;

export type AnalyticsOverview = JsonValue<ReturnType<typeof readOverview>>;
export type AnalyticsUsage = JsonValue<ReturnType<typeof readUsage>>;
export type AnalyticsImageStats = JsonValue<ReturnType<typeof readImageStats>>;
export type { ReportDays };

export class AnalyticsReadError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

async function readAnalytics<T>(url: string, signal: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { signal, cache: 'no-store' });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error('连接中断，无法读取统计，请检查网络后重试。', {
      cause: error,
    });
  }
  if (!response.ok) {
    const message = `统计读取失败（HTTP ${response.status}），请重试。`;
    let result: { message?: string; code?: string };
    try {
      result = await response.json();
    } catch (error) {
      throw new AnalyticsReadError(
        message,
        response.status,
        'ANALYTICS_READ_FAILED',
        { cause: error },
      );
    }
    throw new AnalyticsReadError(
      result.message ?? message,
      response.status,
      result.code ?? 'ANALYTICS_READ_FAILED',
    );
  }
  return response.json();
}

export function readAnalyticsOverview(days: ReportDays, signal: AbortSignal) {
  return readAnalytics<AnalyticsOverview>(
    `/api/analytics/overview?days=${days}`,
    signal,
  );
}

export function readAnalyticsUsage(signal: AbortSignal) {
  return readAnalytics<AnalyticsUsage>('/api/analytics/usage', signal);
}

export function readAnalyticsImage(imageId: string, signal: AbortSignal) {
  return readAnalytics<AnalyticsImageStats>(
    `/api/analytics/images/${encodeURIComponent(imageId)}`,
    signal,
  );
}

const observationOptions = {
  retry: false,
  networkMode: 'always' as const,
  staleTime: 0,
  refetchInterval: 10_000,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: 'always' as const,
  refetchOnReconnect: false,
};

export function overviewQueryOptions(days: ReportDays, enabled = true) {
  return queryOptions({
    ...observationOptions,
    queryKey: ['analytics', 'overview', days],
    queryFn: ({ signal }) => readAnalyticsOverview(days, signal),
    enabled,
  });
}

export function usageQueryOptions(enabled = true) {
  return queryOptions({
    ...observationOptions,
    queryKey: ['analytics', 'usage'],
    queryFn: ({ signal }) => readAnalyticsUsage(signal),
    enabled,
  });
}

export function imageStatsQueryOptions(imageId: string | null, enabled = true) {
  return queryOptions({
    ...observationOptions,
    queryKey: ['analytics', 'image', imageId],
    queryFn: ({ signal }) => readAnalyticsImage(imageId!, signal),
    enabled: enabled && imageId !== null,
  });
}
