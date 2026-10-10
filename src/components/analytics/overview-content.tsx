'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@heroui/react/skeleton';
import { CircleAlert, RefreshCw } from 'lucide-react';
import { Table } from '@heroui/react/table';
import type { AnalyticsOverview } from './read-analytics';
import {
  AnalyticsCard,
  AnalyticsLink,
  number,
  tableClass,
} from './presentation';

const TrendChart = dynamic(() => import('./trend-chart'), {
  ssr: false,
  loading: () => <Skeleton className="h-[180px] w-full rounded-lg" />,
});

export function AnalyticsTrend({
  data,
  dailyUrl,
}: {
  data: AnalyticsOverview;
  dailyUrl: string;
}) {
  return (
    <AnalyticsCard title="公开访问趋势" testId="analytics-trend">
      <p className="text-sm">
        {data.range.startDate}—{data.range.endDate} ·{' '}
        {number(data.versions.total)} 次
      </p>
      {data.versions.total === 0 ? (
        <p className="text-sm text-muted">
          {data.counts.normalImages === 0
            ? '图片库为空，当前周期暂无访问。'
            : '本周期暂无公开图片访问。'}
        </p>
      ) : null}
      <TrendChart trend={data.trend} />
      <p className="text-xs text-muted">
        单位：次 · 今日未结束 · 使用左右方向键或点击图表读取数值。
      </p>
      <AnalyticsLink href={dailyUrl}>查看每日数值</AnalyticsLink>
    </AnalyticsCard>
  );
}
export function AnalyticsVersions({ data }: { data: AnalyticsOverview }) {
  return (
    <AnalyticsCard
      title={`版本访问量 · 最近 ${data.range.days} 天`}
      testId="analytics-versions"
    >
      <dl>
        {(
          [
            ['original', '原图'],
            ['compressed', '压缩图'],
            ['watermark', '水印图'],
          ] as const
        ).map(([key, label]) => (
          <div
            key={key}
            className="flex min-h-[52px] items-center justify-between gap-3 text-sm"
          >
            <dt className="w-14 shrink-0">{label}</dt>
            <span
              className="mx-3 h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--analytics-grid)]"
              aria-hidden
            >
              <span
                className="block h-full origin-left rounded-full"
                style={{
                  background: `var(--analytics-${key})`,
                  transform: `scaleX(${data.versions[key] / Math.max(1, data.versions.original, data.versions.compressed, data.versions.watermark)})`,
                }}
              />
            </span>
            <dd className="tabular-nums">{number(data.versions[key])} 次</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted">
        合计 {number(data.versions.total)} 次，与同周期趋势一致。
      </p>
    </AnalyticsCard>
  );
}
export function AnalyticsFailures({ data }: { data: AnalyticsOverview }) {
  return (
    <AnalyticsCard title="当前处理异常" testId="analytics-failures">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-3">
          <p className="flex items-center gap-2 text-sm">
            <CircleAlert size={17} aria-hidden />
            初次处理失败 {number(data.counts.initialProcessingFailures)} 张
          </p>
          <AnalyticsLink href="/library?failure=initial">
            查看初次失败图片
          </AnalyticsLink>
        </div>
        <div className="grid gap-3">
          <p className="flex items-center gap-2 text-sm">
            <RefreshCw size={17} aria-hidden />
            重新处理失败 {number(data.counts.reprocessFailures)} 张
          </p>
          <AnalyticsLink href="/library?failure=reprocess">
            查看重处理失败图片
          </AnalyticsLink>
        </div>
      </div>
      <p className="text-xs text-muted">
        重新处理失败的图片仍可使用已保存版本。
      </p>
    </AnalyticsCard>
  );
}
export function AnalyticsDaily({ data }: { data: AnalyticsOverview }) {
  return (
    <AnalyticsCard
      title={`${data.range.startDate}—${data.range.endDate} · ${data.timezone}`}
      testId="analytics-daily"
    >
      <Table className={tableClass}>
        <Table.Content
          aria-label={`最近 ${data.range.days} 天每日访问数值`}
          className="w-full table-fixed"
        >
          <Table.Header>
            <Table.Column
              isRowHeader
              className="w-2/3 px-0 text-xs font-normal"
            >
              日期
            </Table.Column>
            <Table.Column className="px-0 text-right text-xs font-normal">
              访问量（次）
            </Table.Column>
          </Table.Header>
          <Table.Body>
            {data.trend.map((row) => (
              <Table.Row
                key={row.date}
                id={row.date}
                data-date={row.date}
                className="h-16"
              >
                <Table.Cell className="px-0 text-sm">
                  {row.date}
                  {row.isTodayPartial ? ' · 今日' : ''}
                </Table.Cell>
                <Table.Cell className="px-0 text-right text-sm tabular-nums">
                  {number(row.count)}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Content>
      </Table>
      <p className="text-sm">
        合计 {number(data.versions.total)} 次；今日截至本次统计更新。
      </p>
    </AnalyticsCard>
  );
}
