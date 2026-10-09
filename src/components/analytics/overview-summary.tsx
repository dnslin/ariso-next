'use client';

import { Card } from '@heroui/react/card';
import type { AnalyticsOverview } from './read-analytics';
import { number, timestamp } from './presentation';

export function AnalyticsMetadata({ data }: { data: AnalyticsOverview }) {
  return (
    <div
      className="grid gap-2 text-[13px] text-muted"
      data-testid="analytics-metadata"
    >
      <p>
        {data.timezone} · 更新于 {timestamp(data.generatedAt, data.timezone)}
        。今日截至本次统计更新。
      </p>
      <p data-testid="analytics-last-flushed">
        {data.lastFlushedAt
          ? `最近写入于 ${timestamp(data.lastFlushedAt, data.timezone)}`
          : '本进程尚无已提交的访问批次'}
        。
      </p>
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
  const metrics = [
    [
      '图片数量',
      data.counts.normalImages,
      `回收站 ${number(data.counts.recycledImages)} 张`,
    ],
    ['相册数量', data.counts.albums, '包含空相册'],
    ['今日访问', data.today, '截至本次统计更新'],
    ['累计访问', data.cumulative.total, '历史累计访问'],
  ] as const;
  return (
    <div
      className="grid grid-cols-2 gap-3 min-[1200px]:grid-cols-4"
      data-testid="analytics-metrics"
    >
      {metrics.map(([label, value, note]) => (
        <Card
          key={label}
          className="min-h-32 min-w-0 gap-2 rounded-[20px] border border-border bg-surface px-3 py-4 shadow-none min-[1200px]:min-h-[140px] min-[1200px]:gap-2.5 min-[1200px]:px-[22px] min-[1200px]:py-5"
        >
          <p className="text-[13px]">{label}</p>
          <p className="text-[28px] leading-[42px] tabular-nums wrap-anywhere min-[1200px]:text-[32px]">
            {number(value)}
          </p>
          <p className="text-xs">{note}</p>
        </Card>
      ))}
    </div>
  );
}
