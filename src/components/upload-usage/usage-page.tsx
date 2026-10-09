'use client';

import { useCallback, useRef, useState, type ComponentProps } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@heroui/react/button';
import { Link } from '@heroui/react/link';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { OwnerShell } from '../shell/owner-shell';
import {
  siteRequest,
  SiteRequestError,
  type SiteSettingsResponse,
} from '../site/api';
import {
  uploadLimitsRequest,
  UploadLimitsRequestError,
} from '../upload-limits/api';
import { CurlExample } from './curl-example';
import { UsageDetails } from './usage-details';
import { UsageTips } from './usage-tips';

type ShellProps = Omit<
  ComponentProps<typeof OwnerShell>,
  'children' | 'footer'
>;

export function UploadUsagePage(shell: ShellProps) {
  const [expired, setExpired] = useState(false);
  const headingRef = useRef<HTMLDivElement>(null);
  const expire = useCallback(() => setExpired(true), []);
  const site = useQuery({
    queryKey: ['site-settings'],
    queryFn: ({ signal }) => siteRequest<SiteSettingsResponse>({ signal }),
    retry: false,
    enabled: !expired,
    networkMode: 'always',
    refetchOnWindowFocus: false,
  });
  const limits = useQuery({
    queryKey: ['upload-limits'],
    queryFn: ({ signal }) => uploadLimitsRequest({ signal }),
    retry: false,
    enabled: !expired,
    networkMode: 'always',
    refetchOnWindowFocus: false,
  });
  const sessionLost =
    expired ||
    (site.error instanceof SiteRequestError && site.error.status === 401) ||
    (limits.error instanceof UploadLimitsRequestError &&
      limits.error.status === 401);
  const loading =
    !site.isFetchedAfterMount ||
    !limits.isFetchedAfterMount ||
    site.isFetching ||
    limits.isFetching;
  const error = site.error ?? limits.error;
  const ready =
    !sessionLost && !loading && !error && !!site.data && !!limits.data;

  return (
    <OwnerShell
      {...shell}
      returnTo="/settings/api/usage"
      onSessionExpire={expire}
    >
      <section
        data-testid="upload-usage-page"
        data-state={
          sessionLost
            ? 'session'
            : loading
              ? 'loading'
              : ready
                ? 'ready'
                : 'error'
        }
        className="grid min-w-0 max-w-[840px] gap-4 pb-8"
      >
        <Link
          href="/settings/api"
          data-testid="upload-usage-back"
          className="flex min-h-11 w-fit items-center gap-1 text-sm font-normal text-foreground no-underline"
        >
          <ArrowLeft className="size-4" aria-hidden />
          返回 Token 列表
        </Link>
        <div ref={headingRef} className="mb-1 flex items-center gap-2">
          <h1 className="text-[26px] font-medium leading-normal min-[1200px]:text-[32px]">
            上传 API 用法
          </h1>
          <UsageTips anchorRef={headingRef} />
        </div>
        {sessionLost ? (
          <div className="grid gap-3">
            <p role="alert" className="text-sm text-danger">
              会话已失效，请重新登录后查看上传用法。
            </p>
            <Link
              href="/login?reason=expired&returnTo=%2Fsettings%2Fapi%2Fusage"
              className="flex min-h-11 w-fit items-center rounded-lg border border-border px-4 text-sm text-foreground no-underline"
            >
              重新登录
            </Link>
          </div>
        ) : loading ? (
          <p role="status" className="text-sm text-muted">
            正在读取站点地址和上传限制…
          </p>
        ) : ready ? (
          <>
            <CurlExample publicUrl={site.data!.publicUrl} />
            <p
              data-testid="upload-usage-limit"
              className="text-xs leading-relaxed text-muted"
            >
              当前站点单文件上限：{limits.data!.maxFileMiB} MiB。规范默认值为 50
              MiB，站点可调整；接口每次只接收一个文件。
            </p>
          </>
        ) : (
          <div className="grid gap-3">
            <p role="alert" className="text-sm">
              暂时无法读取站点地址和上传限制。请重试。{error?.message}
            </p>
            <Button
              data-testid="upload-usage-retry"
              variant="outline"
              className="h-11 w-fit rounded-lg bg-surface px-4 text-sm font-normal"
              onPress={() => {
                void Promise.all([site.refetch(), limits.refetch()]);
              }}
            >
              重新加载
            </Button>
          </div>
        )}
        <Link
          href="/api/openapi.json"
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-11 w-fit items-center gap-1 text-sm font-normal text-foreground underline underline-offset-4"
        >
          查看 OpenAPI 3.0 规范
          <ArrowUpRight className="size-4" aria-hidden />
        </Link>
        <UsageDetails />
      </section>
    </OwnerShell>
  );
}
