'use client';

import type { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@heroui/react/button';
import { Popover } from '@heroui/react/popover';
import { Spinner } from '@heroui/react/spinner';
import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  CircleAlert,
  Info,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react';
import { AnalyticsReadError, type AnalyticsImageStats } from './read-analytics';
import { number } from './presentation';

const PeriodChart = dynamic(() => import('./image-statistics-chart'), {
  ssr: false,
});
const versions = [
  ['original', '原图', 'bg-(--analytics-original)'],
  ['compressed', '压缩图', 'bg-(--analytics-compressed)'],
  ['watermark', '水印图', 'bg-(--analytics-watermark)'],
] as const;

export function ImageStatisticsTip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Popover>
      <Button
        isIconOnly
        variant="ghost"
        className="size-11 shrink-0 rounded-lg text-muted hover:text-foreground data-[hovered=true]:text-foreground [--button-bg-hover:transparent] [--button-bg-pressed:transparent] active:transform-none data-[pressed=true]:transform-none"
        aria-label={label}
      >
        <Info aria-hidden size={18} />
      </Button>
      <Popover.Content
        placement="bottom end"
        className="max-w-[min(290px,calc(100vw-32px))] rounded-xl border border-border bg-surface p-0"
      >
        <Popover.Dialog
          aria-label={label}
          className="grid max-h-[min(320px,calc(100dvh-64px))] gap-2 overflow-y-auto p-[18px] text-xs leading-[1.7] text-muted"
        >
          <Popover.Heading className="text-sm font-medium text-foreground">
            {label}
          </Popover.Heading>
          {children}
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}

export function ImageStatisticsContent({
  data,
  error,
  pending,
  fetching,
  onRetry,
  onClose,
  returnLabel,
}: {
  data?: AnalyticsImageStats;
  error: Error | null;
  pending: boolean;
  fetching: boolean;
  onRetry: () => void;
  onClose: () => void;
  returnLabel: string;
}) {
  const status = error instanceof AnalyticsReadError ? error.status : undefined;
  if (status === 401 || status === 404 || (!data && error))
    return (
      <div
        className="grid min-h-[280px] content-center justify-items-center gap-4 text-center"
        role="alert"
        data-testid={`image-statistics-${status === 404 ? 'missing' : status === 401 ? 'expired' : 'error'}`}
      >
        <CircleAlert aria-hidden size={30} />
        <h2 className="text-lg font-medium">
          {status === 404
            ? '图片记录已不存在'
            : status === 401
              ? '登录已失效'
              : '统计暂时无法读取'}
        </h2>
        {status !== 404 && status !== 401 ? (
          <>
            <p className="text-xs text-muted">{error?.message}</p>
            <Button
              variant="outline"
              className="h-11 rounded-lg"
              isPending={fetching}
              onPress={onRetry}
            >
              <RefreshCw aria-hidden size={16} />
              重试统计
            </Button>
          </>
        ) : status === 404 ? (
          <Button
            variant="outline"
            className="h-11 rounded-lg"
            onPress={onClose}
          >
            <ArrowLeft aria-hidden size={16} />
            {returnLabel}
          </Button>
        ) : (
          <p className="text-xs text-muted">正在返回登录。</p>
        )}
      </div>
    );
  if (!data || pending)
    return (
      <div
        className="grid min-h-[280px] content-center justify-items-center gap-4"
        role="status"
        aria-busy="true"
        data-testid="image-statistics-loading"
      >
        <Spinner size="lg" />
        <h2 className="text-lg font-medium">正在读取统计</h2>
      </div>
    );
  const maximum = Math.max(1, ...versions.map(([key]) => data.cumulative[key]));
  return (
    <>
      {error ? (
        <div
          className="flex items-center gap-2 text-xs text-muted"
          role="status"
          data-testid="image-statistics-stale"
        >
          <TriangleAlert aria-hidden size={17} className="shrink-0" />
          <span className="min-w-0 flex-1">刷新失败 · 保留上次统计</span>
          <Button
            isIconOnly
            variant="ghost"
            className="size-11 shrink-0 rounded-lg text-muted hover:text-foreground data-[hovered=true]:text-foreground [--button-bg-hover:transparent] [--button-bg-pressed:transparent] active:transform-none data-[pressed=true]:transform-none"
            aria-label="重试统计"
            isPending={fetching}
            onPress={onRetry}
          >
            <RefreshCw aria-hidden size={16} />
          </Button>
        </div>
      ) : null}
      {data.health.status === 'waiting' ? (
        <p
          className="text-xs text-muted"
          role="status"
          data-testid="image-statistics-waiting"
        >
          有访问等待写入，当前数字尚未包含这些访问。
        </p>
      ) : null}
      {data.health.status === 'backlogged' ? (
        <p
          className="flex items-start gap-2 text-xs text-muted"
          role="status"
          data-testid="image-statistics-backlogged"
        >
          <TriangleAlert aria-hidden size={17} className="shrink-0" />
          写入延迟 · 部分访问尚未计入
        </p>
      ) : null}
      {data.health.incomplete ? (
        <p
          className="flex items-start gap-2 text-xs text-muted"
          role="status"
          data-testid="image-statistics-incomplete"
        >
          <TriangleAlert aria-hidden size={17} className="shrink-0" />
          统计有漏计 · 已丢失的访问不会补回
        </p>
      ) : null}
      <section className="min-w-0" data-testid="image-statistics-versions">
        <h2 className="flex items-center gap-2.5 text-sm font-medium text-muted md:text-base">
          <BarChart3 aria-hidden size={18} />
          访问版本
        </h2>
        <dl className="mt-5 grid gap-[18px]">
          {versions.map(([key, label, color]) => (
            <div key={key} className="flex items-center gap-3 md:gap-4">
              <dt className="flex w-[59px] shrink-0 items-center gap-1.5 text-[11px] md:w-16 md:gap-2 md:text-xs">
                <i
                  aria-hidden
                  className={`size-[7px] rounded-[3px] ${color}`}
                />
                {label}
              </dt>
              <dd
                aria-hidden
                className="h-2 min-w-0 flex-1 overflow-hidden rounded-[5px] bg-(--analytics-grid) md:h-2.5"
              >
                <div
                  className={`size-full origin-left rounded-[5px] ${color}`}
                  style={{
                    transform: `scaleX(${data.cumulative[key] / maximum})`,
                  }}
                />
              </dd>
              <dd className="min-w-[49px] shrink-0 text-right text-xs font-medium tabular-nums md:min-w-[62px] md:text-sm">
                {number(data.cumulative[key])}
                <small className="ml-1 text-[10px] font-normal md:text-xs">
                  次
                </small>
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <section
        className="min-w-0 border-t border-(--analytics-grid) pt-5"
        data-testid="image-statistics-periods"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2.5 text-sm font-medium text-muted md:text-base">
            <CalendarDays aria-hidden size={18} />
            近期访问
          </h2>
          <ImageStatisticsTip label="周期范围">
            {data.periods.map((period) => (
              <p key={period.days}>
                近{period.days}天：{period.startDate}–{period.endDate}。
              </p>
            ))}
            <p>
              各周期均包含今日，相互包含，不能相加；三个点表示周期合计，不是逐日趋势。
            </p>
          </ImageStatisticsTip>
        </div>
        <div
          className="mt-1 h-[174px] min-w-0 text-xs md:h-[190px]"
          role="group"
          aria-label={data.periods
            .map((period) => `近${period.days}天 ${number(period.total)}次`)
            .join('，')}
          data-testid="image-statistics-chart"
        >
          <PeriodChart periods={data.periods} />
        </div>
        {data.cumulative.total === 0 ? (
          <p
            className="mt-3 text-center text-xs text-muted"
            data-testid="image-statistics-zero"
          >
            暂无公开访问
          </p>
        ) : null}
        {data.periods.some((period) => period.containsOldTimezone) ? (
          <p
            className="mt-3 text-xs text-muted"
            data-testid="image-statistics-old-timezone"
          >
            含按旧时区归档的数据；历史日期不按新时区重算。
          </p>
        ) : null}
      </section>
    </>
  );
}
