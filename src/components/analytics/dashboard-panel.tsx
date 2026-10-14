'use client';

import { Clock3, Folder, HardDrive, Images, Trash2 } from 'lucide-react';
import type { AnalyticsOverview, AnalyticsUsage } from './read-analytics';
import type {
  useAnalyticsOverview,
  useAnalyticsUsage,
} from './use-analytics-query';
import { AnalyticsMetric, AnalyticsMetadata } from './overview-summary';
import { AnalyticsFailures } from './overview-content';
import { AnalyticsReadFailure } from './query-state';
import { UsageSummary } from './usage-content';
import { bytes, number } from './presentation';

export function DashboardResources({
  data,
  usage,
}: {
  data: AnalyticsOverview;
  usage?: AnalyticsUsage;
}) {
  const knownBytes = usage?.storages.reduce(
    (sum, storage) => sum + storage.knownBytes,
    0,
  );
  const unknown =
    usage?.storages.reduce(
      (sum, storage) => sum + storage.unconfirmedObjects,
      0,
    ) ?? 0;
  return (
    <div
      className="grid grid-cols-2 gap-3 min-[1200px]:grid-cols-4 min-[1200px]:gap-4"
      data-testid="dashboard-metrics"
    >
      <AnalyticsMetric
        delay={0.055}
        label="图片"
        value={number(data.counts.normalImages)}
        icon={<Images size={19} aria-hidden />}
      />
      <AnalyticsMetric
        delay={0.11}
        label="相册"
        value={number(data.counts.albums)}
        icon={<Folder size={19} aria-hidden />}
      />
      <AnalyticsMetric
        delay={0.165}
        label="回收站"
        value={number(data.counts.recycledImages)}
        icon={<Trash2 size={19} aria-hidden />}
      />
      <AnalyticsMetric
        delay={0.165}
        label="已登记占用"
        value={knownBytes === undefined ? '未读取' : bytes(knownBytes)}
        icon={<HardDrive size={19} aria-hidden />}
      >
        {unknown ? (
          <span className="flex items-start gap-1.5 text-xs text-warning">
            <Clock3 size={13} className="shrink-0" aria-hidden />
            {number(unknown)} 个对象待核对
          </span>
        ) : null}
      </AnalyticsMetric>
    </div>
  );
}

export function DashboardPanel({
  overview,
  usage,
  timeZone,
}: {
  overview: Pick<
    ReturnType<typeof useAnalyticsOverview>,
    'data' | 'error' | 'isFetching' | 'refetch'
  >;
  usage: Pick<
    ReturnType<typeof useAnalyticsUsage>,
    'data' | 'error' | 'isFetching' | 'refetch'
  >;
  timeZone: string;
}) {
  return (
    <section
      className="grid min-w-0 gap-6"
      data-testid="dashboard-overview"
      aria-label="总览"
      aria-busy={overview.isFetching || usage.isFetching}
    >
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
        <>
          <div className="relative">
            <AnalyticsMetadata data={overview.data} />
            {overview.isFetching ? (
              <p
                role="status"
                className="absolute inset-x-0 top-full text-xs leading-4 text-muted"
                data-testid="overview-refreshing"
              >
                正在刷新，保留上次统计数字。
              </p>
            ) : null}
          </div>
          <DashboardResources data={overview.data} usage={usage.data} />
          <AnalyticsFailures data={overview.data} />
        </>
      ) : null}
      {usage.error ? (
        <AnalyticsReadFailure
          scope="usage"
          error={usage.error}
          old={usage.data?.generatedAt}
          fetching={usage.isFetching}
          timeZone={timeZone}
          retry={() => void usage.refetch()}
        />
      ) : null}
      {usage.data ? <UsageSummary data={usage.data} /> : null}
    </section>
  );
}
