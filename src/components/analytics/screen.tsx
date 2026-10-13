'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { QueryClient } from '@tanstack/react-query';
import { Link } from '@heroui/react/link';
import { Button, buttonVariants } from '@heroui/react/button';
import { Tooltip } from '@heroui/react/tooltip';
import { ArrowLeft, HardDrive, Info, RefreshCw, Upload } from 'lucide-react';
import { OwnerShell } from '../shell/owner-shell';
import { useResetUpload } from '../upload/provider';
import { AnalyticsReadError, type ReportDays } from './read-analytics';
import { useAnalyticsOverview, useAnalyticsUsage } from './use-analytics-query';
import { ImageStatisticsDialog } from './image-statistics';
import {
  analyticsReturnKey,
  managementFromAnalytics,
  restoreAnalyticsReturn,
} from './navigation';
import { AnalyticsScopeDialog } from './scope-dialog';
import { AnalyticsLink } from './presentation';
import { AnalyticsLoading, AnalyticsReadFailure } from './query-state';
import { AnalyticsOverviewPanel } from './overview-panel';
import { UsageContent } from './usage-content';
import { DashboardPanel } from './dashboard-panel';
import { ImageStatisticsTip } from './image-statistics-content';
import { ComponentEntrance } from '../component-entrance';

export function AnalyticsScreen(props: {
  name: string;
  logoUrl?: string | null;
  description: string;
  email: string;
  ownerName: string;
  initialSidebarCollapsed: boolean;
  timeZone: string;
  dashboard: boolean;
}) {
  const [client] = useState(() => new QueryClient());
  const [sessionEnded, setSessionEnded] = useState(false);
  const [statisticsId, setStatisticsId] = useState<string | null>(null);
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const rawDays = params.get('days');
  const validDays =
    params.getAll('days').length <= 1 &&
    (rawDays === null || ['7', '30', '90'].includes(rawDays));
  const days = (
    validDays && rawDays !== null ? Number(rawDays) : 7
  ) as ReportDays;
  const view = params.get('view') ?? 'overview';
  const validView =
    params.getAll('view').length <= 1 &&
    ['overview', 'usage', 'daily', 'scope'].includes(view);
  const backgroundView =
    view === 'scope' ? (params.get('scope') ?? 'overview') : view;
  const usageView = backgroundView === 'usage';
  const dailyView = backgroundView === 'daily';
  const overview = useAnalyticsOverview(client, days, !sessionEnded);
  const usage = useAnalyticsUsage(client, !sessionEnded);
  const resetUpload = useResetUpload();
  const returnTo = `${pathname}${params.size ? `?${params}` : ''}`;
  const expire = useCallback(() => setSessionEnded(true), []);
  const unauthorized = [overview.error, usage.error].some(
    (error) => error instanceof AnalyticsReadError && error.status === 401,
  );
  const expired = sessionEnded || unauthorized;
  if (unauthorized && !sessionEnded) setSessionEnded(true);
  useEffect(() => {
    if (!sessionEnded) return;
    client.clear();
    resetUpload();
    window.location.replace(
      `/login?reason=expired&returnTo=${encodeURIComponent(returnTo)}`,
    );
  }, [client, resetUpload, returnTo, sessionEnded]);
  useEffect(() => () => client.clear(), [client]);
  const url = (nextView: string, nextDays = days, scope?: string) => {
    const next = new URLSearchParams({ days: String(nextDays) });
    if (nextView !== 'overview') next.set('view', nextView);
    if (scope) next.set('scope', scope);
    return `${pathname}?${next}`;
  };
  const popularImage = overview.data?.popular.find(
    (item) => item.imageId === statisticsId,
  );
  const displayedDays = overview.data?.range.days ?? days;
  const source = `${pathname}?days=${displayedDays}`;
  useEffect(() => {
    if (!overview.data) return;
    return restoreAnalyticsReturn(source, statisticsId !== null);
  }, [overview.data, source, statisticsId]);
  const title = usageView
    ? '当前存储占用'
    : dailyView
      ? `每日访问明细 · ${displayedDays} 天`
      : props.dashboard
        ? '总览'
        : '访问统计';
  const footer = usageView ? undefined : props.dashboard && !dailyView ? (
    <>
      <AnalyticsLink href={`/analytics?days=${days}`} footer>
        查看访问统计
      </AnalyticsLink>
      <AnalyticsLink href={url('usage')} footer>
        <HardDrive size={17} aria-hidden />
        占用明细
      </AnalyticsLink>
    </>
  ) : (
    <>
      <AnalyticsLink href={url('usage')} footer>
        <HardDrive size={17} aria-hidden />
        当前存储占用
      </AnalyticsLink>
    </>
  );
  return (
    <OwnerShell
      {...props}
      returnTo={returnTo}
      onSessionExpire={expire}
      footer={footer}
    >
      <div
        data-testid="analytics-page"
        data-page={props.dashboard ? 'dashboard' : 'analytics'}
        data-view={view}
        className="grid min-w-0 gap-6 pb-4"
      >
        {usageView || dailyView ? (
          <Link
            href={url('overview')}
            className="inline-flex min-h-11 w-fit items-center gap-2 text-sm text-muted"
          >
            <ArrowLeft size={17} aria-hidden />
            返回
          </Link>
        ) : null}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <ComponentEntrance className="flex min-w-0 items-center gap-1">
            <h1>{title}</h1>
            {props.dashboard && !usageView && !dailyView ? (
              <ImageStatisticsTip label="资源与占用说明">
                <p>图片数量不含回收站，相册数量包含空相册。</p>
                <p>
                  已登记占用按 Ariso
                  对象记录计算，不是整机磁盘容量。有对象待核对时，总占用尚未确认。
                </p>
                <p>重新处理失败的图片仍可使用已保存版本。</p>
              </ImageStatisticsTip>
            ) : (
              <Tooltip>
                <Link
                  href={url(
                    'scope',
                    days,
                    usageView ? 'usage' : dailyView ? 'daily' : 'overview',
                  )}
                  aria-label={usageView ? '占用说明' : '统计口径'}
                  className={buttonVariants({
                    variant: 'ghost',
                    isIconOnly: true,
                    className: 'size-11 shrink-0 rounded-lg text-muted',
                  })}
                >
                  <Info size={18} aria-hidden />
                </Link>
                <Tooltip.Content>
                  {usageView ? '占用说明' : '统计口径'}
                </Tooltip.Content>
              </Tooltip>
            )}
          </ComponentEntrance>
          <ComponentEntrance className="flex items-center gap-2" delay={0.055}>
            <Tooltip>
              <Button
                isIconOnly
                variant="ghost"
                aria-label={
                  usageView
                    ? '刷新存储占用'
                    : props.dashboard && !dailyView
                      ? '刷新总览'
                      : '刷新访问统计'
                }
                className="size-11 shrink-0 rounded-lg"
                isPending={
                  usageView
                    ? usage.isFetching
                    : overview.isFetching ||
                      (props.dashboard && usage.isFetching)
                }
                onPress={() => {
                  if (usageView) void usage.refetch();
                  else {
                    void overview.refetch();
                    if (props.dashboard) void usage.refetch();
                  }
                }}
              >
                <RefreshCw size={18} aria-hidden />
              </Button>
              <Tooltip.Content>刷新</Tooltip.Content>
            </Tooltip>
            {props.dashboard && !usageView && !dailyView ? (
              <Link
                href="/upload"
                className={buttonVariants({
                  variant: 'primary',
                  className: 'h-12 gap-2 rounded-lg px-4 text-sm',
                })}
              >
                <Upload size={18} aria-hidden />
                上传
              </Link>
            ) : null}
          </ComponentEntrance>
        </div>
        {!validDays || !validView ? (
          <div role="alert" className="grid gap-3">
            <p>查询参数无效，请选择 7、30 或 90 天及有效统计视图。</p>
            <AnalyticsLink href={pathname}>重置统计查询</AnalyticsLink>
          </div>
        ) : expired ? (
          <p role="status">会话已失效，正在返回登录。</p>
        ) : usageView ? (
          <>
            {usage.error ? (
              <AnalyticsReadFailure
                scope="usage"
                error={usage.error}
                old={usage.data?.generatedAt}
                fetching={usage.isFetching}
                timeZone={props.timeZone}
                retry={() => void usage.refetch()}
              />
            ) : null}
            {usage.isFetching && usage.data ? (
              <p role="status" className="text-[13px] text-muted">
                正在刷新，保留上次存储占用。
              </p>
            ) : null}
            {usage.data ? (
              <UsageContent data={usage.data} timeZone={props.timeZone} />
            ) : !usage.error ? (
              <AnalyticsLoading scope="usage" />
            ) : null}
          </>
        ) : props.dashboard && !dailyView ? (
          <DashboardPanel
            overview={overview}
            usage={usage}
            timeZone={props.timeZone}
          />
        ) : (
          <AnalyticsOverviewPanel
            overview={overview}
            days={days}
            dailyView={dailyView}
            timeZone={props.timeZone}
            url={url}
            onStatistics={setStatisticsId}
            onDays={(next) =>
              router.push(url(backgroundView, next), { scroll: false })
            }
          />
        )}
      </div>
      {statisticsId && !expired ? (
        <ImageStatisticsDialog
          key={statisticsId}
          imageId={statisticsId}
          client={client}
          identity={
            popularImage
              ? {
                  displayName:
                    popularImage.state === 'recycled'
                      ? `已回收图片 · ${popularImage.shortId}`
                      : (popularImage.displayName ?? undefined),
                  recycled: popularImage.state === 'recycled',
                  thumbnailUrl: popularImage.thumbnailUrl,
                }
              : undefined
          }
          onClose={() => setStatisticsId(null)}
          onSessionExpired={expire}
          managementUrl={
            popularImage
              ? managementFromAnalytics(popularImage.managementUrl, source)
              : undefined
          }
          onManage={() =>
            sessionStorage.setItem(
              analyticsReturnKey,
              JSON.stringify({
                source,
                imageId: statisticsId,
                scrollTop:
                  document.getElementById('main-content')?.scrollTop ?? 0,
              }),
            )
          }
        />
      ) : null}
      <AnalyticsScopeDialog
        open={view === 'scope' && validView}
        usage={usageView}
        onClose={() => router.replace(url(backgroundView), { scroll: false })}
      />
    </OwnerShell>
  );
}
