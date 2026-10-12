'use client';

import type { ReactNode } from 'react';
import { Card } from '@heroui/react/card';
import { BarChart3, CalendarDays, Images } from 'lucide-react';
import type { AnalyticsOverview } from './read-analytics';
import { ImageStatisticsTip } from './image-statistics-content';
import { number, timestamp } from './presentation';

export function AnalyticsMetadata({
  data,
  status,
}: {
  data: AnalyticsOverview;
  status?: ReactNode;
}) {
  const updated = new Intl.DateTimeFormat('zh-CN', {
    timeZone: data.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(data.generatedAt));
  return (
    <div
      className="grid gap-2 text-xs text-muted"
      data-testid="analytics-metadata"
    >
      <div className="flex min-h-11 items-center gap-1">
        {status ?? <p>更新于 {updated}</p>}
        <ImageStatisticsTip label="统计更新时间">
          <p>
            {timestamp(data.generatedAt, data.timezone)} · {data.timezone}
          </p>
          <p>今日访问截至本次统计更新，今天尚未结束。</p>
          {data.lastFlushedAt ? (
            <p data-testid="analytics-last-flushed">
              最近写入于 {timestamp(data.lastFlushedAt, data.timezone)}。
            </p>
          ) : null}
        </ImageStatisticsTip>
      </div>
      {data.containsOldTimezone ? (
        <p data-testid="analytics-old-timezone">
          含按旧时区归档的数据；历史日期不按新时区重算。
        </p>
      ) : null}
      {data.health.status === 'waiting' ? (
        <p data-testid="analytics-waiting">
          有访问等待写入，统计通常延迟数秒。
        </p>
      ) : null}
      {data.health.status === 'backlogged' ? (
        <p role="status" data-testid="analytics-backlogged">
          统计写入延迟，仍有访问等待保存；当前数字尚未包含这些访问。
        </p>
      ) : null}
      {data.health.incomplete ? (
        <p role="status" data-testid="analytics-incomplete">
          已发生访问漏计，统计不完整；后续更新不会补回已丢失的访问。
        </p>
      ) : null}
      {data.health.incomplete && data.health.lastError ? (
        <p>写入尚未恢复，仍有访问等待保存。</p>
      ) : null}
    </div>
  );
}
export function AnalyticsMetrics({ data }: { data: AnalyticsOverview }) {
  return (
    <div
      className="grid grid-cols-3 gap-3 min-[1200px]:gap-4"
      data-testid="analytics-metrics"
    >
      <AnalyticsMetric
        label={`最近 ${data.range.days} 天`}
        value={number(data.versions.total)}
        icon={<CalendarDays size={19} aria-hidden />}
      />
      <AnalyticsMetric
        label="今日访问"
        value={number(data.today)}
        icon={<BarChart3 size={19} aria-hidden />}
      />
      <AnalyticsMetric
        label="累计访问"
        value={number(data.cumulative.total)}
        icon={<Images size={19} aria-hidden />}
      />
    </div>
  );
}

export function AnalyticsMetric({
  label,
  value,
  icon,
  children,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Card className="grid min-h-28 min-w-0 content-start gap-3 rounded-lg border border-border bg-surface p-4 shadow-none max-[479px]:p-3 min-[1200px]:min-h-32 min-[1200px]:gap-4 min-[1200px]:p-5">
      <p className="flex items-center justify-between gap-2 text-xs min-[480px]:text-sm">
        <span className="min-w-0">{label}</span>
        <span className="shrink-0 text-muted max-[479px]:hidden">{icon}</span>
      </p>
      <p className="text-xl font-semibold leading-tight tabular-nums wrap-anywhere min-[480px]:text-2xl min-[1200px]:text-[30px]">
        {value}
      </p>
      {children}
    </Card>
  );
}
