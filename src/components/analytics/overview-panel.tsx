'use client';

import { Button } from '@heroui/react/button';
import { RefreshCw } from 'lucide-react';
import type { ReportDays } from './read-analytics';
import type {
  useAnalyticsOverview,
  useAnalyticsUsage,
} from './use-analytics-query';
import {
  AnalyticsLoading,
  AnalyticsReadFailure,
  UsageUnavailable,
} from './query-state';
import { AnalyticsPeriods } from './period-controls';
import { AnalyticsMetadata, AnalyticsMetrics } from './overview-summary';
import {
  AnalyticsTrend,
  AnalyticsVersions,
  AnalyticsFailures,
  AnalyticsDaily,
} from './overview-content';
import { AnalyticsPopular } from './popular';
import { UsageSummary } from './usage-content';

export function AnalyticsOverviewPanel({
  overview,
  usage,
  days,
  dailyView,
  timeZone,
  url,
  onDays,
}: {
  overview: ReturnType<typeof useAnalyticsOverview>;
  usage: ReturnType<typeof useAnalyticsUsage>;
  days: ReportDays;
  dailyView: boolean;
  timeZone: string;
  url: (view: string) => string;
  onDays: (days: ReportDays) => void;
}) {
  return (
    <>
      {overview.error ? (
        <AnalyticsReadFailure
          scope="overview"
          error={overview.error}
          old={overview.data?.generatedAt}
          fetching={overview.isFetching}
          timeZone={overview.data?.timezone ?? timeZone}
          retry={() => void overview.refetch()}
        />
      ) : null}
      {overview.data ? (
        <section
          className="grid gap-5"
          data-testid="analytics-overview"
          aria-label="访问统计"
        >
          <div className="flex items-start justify-between gap-3">
            <AnalyticsMetadata data={overview.data} />
            <Button
              isIconOnly
              variant="ghost"
              aria-label="刷新访问统计"
              className="size-11 shrink-0 rounded-lg"
              isPending={overview.isFetching}
              onPress={() => void overview.refetch()}
            >
              <RefreshCw size={18} aria-hidden />
            </Button>
          </div>
          {overview.isFetching ? (
            <p
              role="status"
              className="text-[13px] text-muted"
              data-testid="overview-refreshing"
            >
              正在刷新，保留上次统计数字。
            </p>
          ) : null}
          {!dailyView ? <AnalyticsMetrics data={overview.data} /> : null}
          <AnalyticsPeriods days={days} onChange={onDays} />
          {dailyView ? (
            <AnalyticsDaily data={overview.data} />
          ) : (
            <>
              <AnalyticsTrend data={overview.data} dailyUrl={url('daily')} />
              <AnalyticsVersions data={overview.data} />
              <AnalyticsPopular data={overview.data} />
            </>
          )}
        </section>
      ) : !overview.error ? (
        <>
          <AnalyticsPeriods days={days} onChange={onDays} />
          <AnalyticsLoading scope="overview" />
        </>
      ) : null}
      {!dailyView ? (
        <>
          {usage.error ? (
            usage.data ? (
              <AnalyticsReadFailure
                scope="usage"
                error={usage.error}
                old={usage.data.generatedAt}
                fetching={usage.isFetching}
                timeZone={timeZone}
                retry={() => void usage.refetch()}
              />
            ) : (
              <UsageUnavailable
                error={usage.error}
                fetching={usage.isFetching}
                retry={() => void usage.refetch()}
              />
            )
          ) : null}
          {usage.data ? (
            <UsageSummary data={usage.data} usageUrl={url('usage')} />
          ) : !usage.error ? (
            <AnalyticsLoading scope="usage" />
          ) : null}
          {overview.data ? <AnalyticsFailures data={overview.data} /> : null}
        </>
      ) : null}
      <p className="text-xs text-muted">
        访问统计为近似值，异常退出可能丢失尚未保存的少量访问；S3
        成功签发不代表完整下载。
      </p>
    </>
  );
}
