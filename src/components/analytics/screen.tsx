'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { QueryClient } from '@tanstack/react-query';
import { Link } from '@heroui/react/link';
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
  const source = `${pathname}?days=${days}`;
  useEffect(() => {
    if (!overview.data) return;
    return restoreAnalyticsReturn(source, statisticsId !== null);
  }, [overview.data, source, statisticsId]);
  const title = usageView
    ? '当前存储占用'
    : dailyView
      ? `每日访问明细 · ${days} 天`
      : props.dashboard
        ? '工作台'
        : '访问统计';
  const footer = usageView ? (
    <>
      <AnalyticsLink href={url('scope', days, 'usage')} footer>
        占用说明
      </AnalyticsLink>
      <AnalyticsLink href={url('overview')} footer>
        返回统计
      </AnalyticsLink>
    </>
  ) : props.dashboard && !dailyView ? (
    <>
      <AnalyticsLink href="/upload" footer>
        上传图片
      </AnalyticsLink>
      <AnalyticsLink href={`/analytics?days=${days}`} footer>
        查看访问统计
      </AnalyticsLink>
    </>
  ) : (
    <>
      <AnalyticsLink
        href={url('scope', days, dailyView ? 'daily' : 'overview')}
        footer
      >
        统计口径
      </AnalyticsLink>
      <AnalyticsLink href={url('usage')} primary footer>
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
        className="grid min-w-0 gap-5 pb-4"
      >
        {usageView || dailyView ? (
          <Link
            href={url('overview')}
            className="inline-flex min-h-11 w-fit items-center gap-2 text-sm text-muted"
          >
            ← 返回{props.dashboard ? '工作台' : '访问统计'}
          </Link>
        ) : null}
        <div className="grid gap-5">
          <h1>{title}</h1>
          {!usageView ? (
            <p className="text-[13px]">
              {dailyView
                ? '访问量是内容请求计数，不代表独立访客人数。'
                : props.dashboard
                  ? '每一张图片，都有自己的位置。'
                  : '公开图片访问与当前对象占用。'}
            </p>
          ) : null}
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
        ) : (
          <AnalyticsOverviewPanel
            overview={overview}
            usage={usage}
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
