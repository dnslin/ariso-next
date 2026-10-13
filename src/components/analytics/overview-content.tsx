'use client';

import dynamic from 'next/dynamic';
import { ArrowRight, CheckCircle2, CircleAlert, RefreshCw } from 'lucide-react';
import { Link } from '@heroui/react/link';
import { Table } from '@heroui/react/table';
import type { AnalyticsOverview } from './read-analytics';
import {
  AnalyticsSection,
  AnalyticsLink,
  number,
  tableClass,
} from './presentation';

const TrendChart = dynamic(() => import('./trend-chart'), {
  ssr: false,
  loading: () => (
    <p
      role="status"
      className="grid h-[220px] place-items-center text-sm text-muted sm:h-[252px]"
    >
      正在读取趋势图…
    </p>
  ),
});

export function AnalyticsTrend({
  data,
  dailyUrl,
}: {
  data: AnalyticsOverview;
  dailyUrl: string;
}) {
  return (
    <AnalyticsSection title="访问趋势" testId="analytics-trend">
      <p className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>
          {data.range.startDate}—{data.range.endDate} ·{' '}
          {number(data.versions.total)} 次
        </span>
        <span>访问量（次）</span>
      </p>
      {data.versions.total === 0 ? (
        <p className="text-sm text-muted">
          {data.counts.normalImages === 0
            ? '图片库为空，当前周期暂无访问。'
            : '本周期暂无公开图片访问。'}
        </p>
      ) : null}
      <TrendChart trend={data.trend} />
      <AnalyticsLink href={dailyUrl}>查看每日数值</AnalyticsLink>
    </AnalyticsSection>
  );
}
export function AnalyticsVersions({ data }: { data: AnalyticsOverview }) {
  return (
    <AnalyticsSection
      title={`版本分布 · 最近 ${data.range.days} 天`}
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
    </AnalyticsSection>
  );
}
export function AnalyticsFailures({ data }: { data: AnalyticsOverview }) {
  const failures = [
    {
      label: '初次处理失败',
      count: data.counts.initialProcessingFailures,
      href: '/library?failure=initial',
      action: '查看初次失败图片',
      icon: <CircleAlert size={19} className="text-danger" aria-hidden />,
    },
    {
      label: '重新处理失败',
      count: data.counts.reprocessFailures,
      href: '/library?failure=reprocess',
      action: '查看重处理失败图片',
      icon: <RefreshCw size={19} className="text-warning" aria-hidden />,
    },
  ].filter((item) => item.count > 0);
  return (
    <AnalyticsSection title="待处理" testId="analytics-failures">
      {failures.length ? (
        <div className="grid">
          {failures.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.action}
              className="flex min-h-16 items-center gap-3 rounded-lg border-b border-border px-2 py-3 text-sm text-foreground hover:bg-default focus-visible:outline-2 focus-visible:outline-focus"
            >
              {item.icon}
              <span className="min-w-0 flex-1">{item.label}</span>
              <span className="shrink-0 tabular-nums">
                {number(item.count)} 张
              </span>
              <ArrowRight size={17} aria-hidden />
            </Link>
          ))}
        </div>
      ) : (
        <p className="flex min-h-20 items-center gap-3 border-b border-border text-sm">
          <CheckCircle2 size={21} className="text-success" aria-hidden />
          没有待处理事项
        </p>
      )}
    </AnalyticsSection>
  );
}
export function AnalyticsDaily({ data }: { data: AnalyticsOverview }) {
  return (
    <AnalyticsSection
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
    </AnalyticsSection>
  );
}
