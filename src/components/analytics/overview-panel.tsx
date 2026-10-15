'use client';

import type { ReportDays } from './read-analytics';
import { Button } from '@heroui/react/button';
import { RefreshCw } from 'lucide-react';
import type { useAnalyticsOverview } from './use-analytics-query';
import { AnalyticsReadFailure } from './query-state';
import { AnalyticsPeriods } from './period-controls';
import { AnalyticsMetadata, AnalyticsMetrics } from './overview-summary';
import {
  AnalyticsTrend,
  AnalyticsVersions,
  AnalyticsDaily,
} from './overview-content';
import { AnalyticsPopular } from './popular';
import { ComponentEntrance } from '../component-entrance';

export function AnalyticsOverviewPanel({
  overview,
  days,
  dailyView,
  timeZone,
  url,
  onDays,
  onStatistics,
}: {
  overview: Pick<
    ReturnType<typeof useAnalyticsOverview>,
    'data' | 'error' | 'isFetching' | 'refetch'
  >;
  days: ReportDays;
  dailyView: boolean;
  timeZone: string;
  url: (view: string, days?: ReportDays) => string;
  onDays: (days: ReportDays) => void;
  onStatistics: (imageId: string) => void;
}) {
  const displayed = overview.data;
  const changed = displayed && displayed.range.days !== days;
  const updated = displayed
    ? new Intl.DateTimeFormat('zh-CN', {
        timeZone: displayed.timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(displayed.generatedAt))
    : '';
  return (
    <>
      <ComponentEntrance
        className="grid gap-2"
        data-testid="analytics-period-controls"
        aria-busy={overview.isFetching}
        delay={0.055}
      >
        <AnalyticsPeriods days={days} onChange={onDays} />
        {displayed ? (
          <AnalyticsMetadata
            data={displayed}
            status={
              overview.isFetching ? (
                <p
                  role="status"
                  className="text-xs leading-4 text-muted"
                  data-testid="overview-refreshing"
                >
                  {changed
                    ? `正在读取 ${days} 天，暂示 ${displayed.range.days} 天（${updated}）`
                    : `正在刷新，保留 ${updated} 的统计`}
                </p>
              ) : overview.error ? (
                <>
                  <p
                    role="alert"
                    className="min-w-0 flex-1 text-xs leading-5 text-danger"
                    data-testid="overview-stale"
                  >
                    {changed
                      ? `${days} 天更新失败，当前显示 ${displayed.range.days} 天（${updated}）`
                      : `刷新失败，保留 ${updated} 的统计`}
                    <span className="block">{overview.error.message}</span>
                  </p>
                  <Button
                    variant="outline"
                    className="h-11 shrink-0 gap-2 rounded-lg px-3"
                    aria-label={`重试 ${days} 天访问统计`}
                    onPress={() => void overview.refetch()}
                  >
                    <RefreshCw size={17} aria-hidden />
                    重试
                  </Button>
                </>
              ) : undefined
            }
          />
        ) : (
          <div className="min-h-11" />
        )}
      </ComponentEntrance>
      {overview.error && !displayed ? (
        <AnalyticsReadFailure
          scope="overview"
          error={overview.error}
          fetching={overview.isFetching}
          timeZone={timeZone}
          retry={() => void overview.refetch()}
        />
      ) : null}
      {displayed ? (
        <section
          className="grid gap-6"
          data-testid="analytics-overview"
          data-requested-days={days}
          data-displayed-days={displayed.range.days}
          aria-label="访问统计"
          aria-busy={overview.isFetching}
        >
          {!dailyView ? <AnalyticsMetrics data={displayed} /> : null}
          {dailyView ? (
            <AnalyticsDaily data={displayed} />
          ) : (
            <>
              <AnalyticsTrend
                data={displayed}
                dailyUrl={url('daily', displayed.range.days)}
              />
              <div className="grid min-w-0 gap-8">
                <AnalyticsVersions data={displayed} />
                <AnalyticsPopular
                  data={displayed}
                  onStatistics={onStatistics}
                />
              </div>
            </>
          )}
        </section>
      ) : null}
      <p className="text-xs text-muted">访问次数为近似值</p>
    </>
  );
}
