/* eslint-disable @next/next/no-img-element -- Standalone prototype uses local sample assets. */
import { useEffect, useRef, useState } from 'react';
import { Button } from '@heroui/react/button';
import { Table } from '@heroui/react/table';
import { CalendarDays, RefreshCw } from 'lucide-react';
import { AnalyticsPeriods } from '../../../src/components/analytics/period-controls';
import { AnalyticsMetrics } from '../../../src/components/analytics/overview-summary';
import TrendChart from '../../../src/components/analytics/trend-chart';
import {
  number,
  tableClass,
  timestamp,
} from '../../../src/components/analytics/presentation';
import type {
  AnalyticsOverview,
  ReportDays,
} from '../../../src/components/analytics/read-analytics';
import {
  ActionIconButton,
  buttonClass,
  Dialog,
  Header,
  Help,
  useApp,
} from './ui';

const samples = [
  {
    id: 'forest',
    name: '林间晨光.jpg',
    src: '/samples/forest.jpg',
    share: 0.32,
  },
  {
    id: 'mountain',
    name: '雪山与湖泊.jpg',
    src: '/samples/mountain.jpg',
    share: 0.24,
  },
];

function sampleReport(
  days: ReportDays,
  empty: boolean,
  generatedAt = '2026-10-11T01:35:00.000Z',
): AnalyticsOverview {
  const lastWeek = [472, 620, 551, 753, 682, 916, 734];
  const trend = Array.from({ length: days }, (_, index) => {
    const offset = days - index - 1;
    const date = new Date(Date.UTC(2026, 9, 11 - offset));
    return {
      date: date.toISOString().slice(0, 10),
      count: empty
        ? 0
        : offset < 7
          ? lastWeek[6 - offset]
          : 300 + ((offset * 83) % 490),
      isTodayPartial: offset === 0,
    };
  });
  const total = trend.reduce((sum, point) => sum + point.count, 0);
  const original = Math.round(total * 0.21);
  const watermark = Math.round(total * 0.12);
  return {
    generatedAt,
    timezone: 'Asia/Shanghai',
    approximate: true,
    lastFlushedAt: null,
    health: {
      accepted: 0,
      flushed: 0,
      dropped: 0,
      incomplete: false,
      pendingKeys: 0,
      pendingEvents: 0,
      lastFlushedAt: null,
      lastError: null,
      nextRetryAt: 0,
      status: 'idle',
    },
    counts: {
      normalImages: empty ? 0 : 2,
      recycledImages: 0,
      initialProcessingFailures: 0,
      reprocessFailures: 0,
      albums: empty ? 0 : 2,
    },
    range: {
      days,
      startDate: trend[0].date,
      endDate: trend[trend.length - 1].date,
    },
    containsOldTimezone: false,
    today: empty ? 0 : 734,
    cumulative: {
      total: empty ? 0 : 84629,
      original: empty ? 0 : 17772,
      compressed: empty ? 0 : 56702,
      watermark: empty ? 0 : 10155,
    },
    versions: {
      total,
      original,
      compressed: total - original - watermark,
      watermark,
    },
    trend,
    popular: empty
      ? []
      : samples.map((sample) => ({
          imageId: sample.id,
          shortId: sample.id,
          displayName: sample.name,
          state: 'normal' as const,
          count: Math.round(total * sample.share),
          thumbnailUrl: sample.src,
          managementUrl: `/library?image=${sample.id}`,
        })),
  };
}

function initialPeriod(): ReportDays {
  const value = new URLSearchParams(window.location.search).get('days');
  return value === '30' ? 30 : value === '90' ? 90 : 7;
}

export function AnalyticsPage() {
  const { scenario } = useApp();
  const [requested, setRequested] = useState<ReportDays>(initialPeriod);
  const [displayed, setDisplayed] = useState(() =>
    sampleReport(requested, scenario === 'empty'),
  );
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [dailyOpen, setDailyOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sequence = useRef(0);
  const rejectedOnce = useRef(false);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      sequence.current += 1;
    },
    [],
  );

  function read(days: ReportDays, retry = false) {
    clearTimeout(timer.current);
    const current = ++sequence.current;
    const shouldFail =
      scenario === 'error' &&
      !rejectedOnce.current &&
      !retry &&
      days !== displayed.range.days;
    setRequested(days);
    setPending(true);
    setFailed(false);
    const url = new URL(window.location.href);
    url.searchParams.set('days', String(days));
    window.history.replaceState(window.history.state, '', url);
    timer.current = setTimeout(
      () => {
        if (current !== sequence.current) return;
        if (shouldFail) {
          rejectedOnce.current = true;
          setFailed(true);
        } else {
          setDisplayed(
            sampleReport(days, scenario === 'empty', new Date().toISOString()),
          );
        }
        setPending(false);
      },
      scenario === 'slow' ? 1500 : 400,
    );
  }

  const updated = new Intl.DateTimeFormat('zh-CN', {
    timeZone: displayed.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(displayed.generatedAt));
  const changed = requested !== displayed.range.days;
  const status = pending
    ? changed
      ? `正在读取 ${requested} 天，暂示 ${displayed.range.days} 天（${updated}）`
      : `正在刷新，保留 ${updated} 的统计`
    : failed
      ? `${requested} 天读取失败，仍显示 ${displayed.range.days} 天（${updated}）`
      : `更新于 ${updated}`;
  const versionRows = [
    {
      label: '原图',
      value: displayed.versions.original,
      color: 'var(--analytics-original)',
    },
    {
      label: '压缩图',
      value: displayed.versions.compressed,
      color: 'var(--analytics-compressed)',
    },
    {
      label: '水印图',
      value: displayed.versions.watermark,
      color: 'var(--analytics-watermark)',
    },
  ];
  const maximum = Math.max(1, ...versionRows.map((row) => row.value));

  return (
    <div
      className="grid min-w-0 gap-6 pb-6"
      data-testid="clarity-analytics"
      data-requested-days={requested}
      data-displayed-days={displayed.range.days}
      data-phase={pending ? 'loading' : failed ? 'error' : 'ready'}
    >
      <Header
        title="访问统计"
        help={
          <Help label="统计口径">
            <p>统计公开图片的内容访问，不代表独立访客。访问次数为近似值。</p>
            <p>趋势、版本和排行使用同一周期。今日和累计访问保持自身含义。</p>
            <p>
              {timestamp(displayed.generatedAt, displayed.timezone)} ·{' '}
              {displayed.timezone}
            </p>
          </Help>
        }
      >
        <ActionIconButton
          label="刷新"
          variant="ghost"
          onPress={() => read(requested, failed)}
          isDisabled={pending}
        >
          <RefreshCw size={18} aria-hidden />
        </ActionIconButton>
      </Header>

      <div className="grid gap-2" data-testid="analytics-period-controls">
        <AnalyticsPeriods
          days={requested}
          onChange={(days) => {
            if (days !== requested) read(days);
          }}
        />
        <div className="flex min-h-11 min-w-0 items-center justify-between gap-2">
          <p
            className={`min-w-0 text-xs leading-5 ${failed ? 'text-danger' : 'text-muted'}`}
            role={failed ? 'alert' : 'status'}
            aria-live="polite"
            data-testid="analytics-request-status"
          >
            {status}
          </p>
          {failed ? (
            <Button
              className={buttonClass}
              variant="outline"
              onPress={() => read(requested, true)}
            >
              <RefreshCw size={17} aria-hidden />
              重试
            </Button>
          ) : null}
        </div>
      </div>

      <section
        className="grid min-w-0 gap-6"
        aria-label="访问统计结果"
        aria-busy={pending}
        data-testid="analytics-overview"
      >
        <AnalyticsMetrics data={displayed} />
        <section
          className="grid min-w-0 gap-4 pt-2"
          data-testid="analytics-trend"
        >
          <div className="flex min-w-0 items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">访问趋势</h2>
            <Button
              variant="ghost"
              className={buttonClass}
              onPress={() => setDailyOpen(true)}
            >
              <CalendarDays size={16} aria-hidden />
              每日数值
            </Button>
          </div>
          <p className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <span>
              {displayed.range.startDate}—{displayed.range.endDate} ·{' '}
              {number(displayed.versions.total)} 次
            </span>
            <span>访问量（次）</span>
          </p>
          <TrendChart trend={displayed.trend} />
          {displayed.versions.total === 0 ? (
            <p className="text-sm text-muted">本周期暂无访问。</p>
          ) : null}
        </section>
        <div className="grid min-w-0 gap-8 min-[1000px]:grid-cols-[0.8fr_1.2fr]">
          <section
            className="grid min-w-0 content-start gap-4 pt-2"
            data-testid="analytics-versions"
          >
            <h2 className="text-lg font-semibold">
              版本分布 · 最近 {displayed.range.days} 天
            </h2>
            <dl>
              {versionRows.map((row) => (
                <div
                  key={row.label}
                  className="flex min-h-[52px] items-center gap-3 text-sm"
                >
                  <dt className="w-14 shrink-0">{row.label}</dt>
                  <span
                    className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--analytics-grid)]"
                    aria-hidden
                  >
                    <span
                      className="block h-full origin-left rounded-full"
                      style={{
                        background: row.color,
                        transform: `scaleX(${row.value / maximum})`,
                      }}
                    />
                  </span>
                  <dd className="shrink-0 tabular-nums">
                    {number(row.value)} 次
                  </dd>
                </div>
              ))}
            </dl>
          </section>
          <section
            className="grid min-w-0 content-start gap-4 pt-2"
            data-testid="analytics-popular"
          >
            <h2 className="text-lg font-semibold">
              热门图片 · 最近 {displayed.range.days} 天
            </h2>
            {displayed.popular.length ? (
              <ol>
                {displayed.popular.map((image, index) => (
                  <li
                    key={image.imageId}
                    className="flex min-h-[84px] min-w-0 items-center gap-3 border-b border-border py-3 last:border-b-0"
                  >
                    <span className="w-5 shrink-0 text-xs tabular-nums text-muted">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <img
                      src={image.thumbnailUrl ?? ''}
                      alt=""
                      className="size-12 shrink-0 rounded-lg object-cover"
                    />
                    <span className="min-w-0 flex-1 break-words text-sm">
                      {image.displayName}
                    </span>
                    <span className="shrink-0 text-sm tabular-nums">
                      {number(image.count)}{' '}
                      <span className="text-xs text-muted">次</span>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="py-6 text-sm text-muted">本周期暂无热门图片。</p>
            )}
          </section>
        </div>
      </section>
      <p className="text-xs text-muted">访问次数为近似值</p>

      {dailyOpen ? (
        <Dialog
          title={`每日访问 · ${displayed.range.days} 天`}
          onClose={() => setDailyOpen(false)}
        >
          <div className="grid gap-4">
            <p className="text-xs text-muted">
              {displayed.range.startDate}—{displayed.range.endDate} ·{' '}
              {displayed.timezone}
            </p>
            <Table className={tableClass}>
              <Table.Content
                aria-label={`最近 ${displayed.range.days} 天每日访问数值`}
                className="w-full table-fixed"
              >
                <Table.Header>
                  <Table.Column
                    isRowHeader
                    className="w-2/3 px-0 text-xs font-medium"
                  >
                    日期
                  </Table.Column>
                  <Table.Column className="px-0 text-right text-xs font-medium">
                    访问量（次）
                  </Table.Column>
                </Table.Header>
                <Table.Body>
                  {displayed.trend.map((row) => (
                    <Table.Row key={row.date} id={row.date} className="h-12">
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
              合计 {number(displayed.versions.total)} 次
            </p>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
