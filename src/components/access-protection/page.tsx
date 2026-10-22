'use client';

import { useEffect, type ComponentProps } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Chip } from '@heroui/react/chip';
import { Link } from '@heroui/react/link';
import { ArrowLeft, Check, Save } from 'lucide-react';
import { OwnerShell } from '../shell/owner-shell';
import { StorageTip } from '../storage/storage-tip';
import { SiteLeaveDialog, useSiteNavigation } from '../site/site-navigation';
import { siteCardClass } from '../site/site-form';
import {
  accessProtectionRequest,
  accessProtectionQueryKey,
  AccessProtectionRequestError,
} from './api';
import { accessProtectionPath, protectionModeLabels } from './model';
import { useAccessProtection } from './use-access-protection';
import { AccessProtectionForm } from './form';

export function AccessProtectionPage(
  shell: Omit<ComponentProps<typeof OwnerShell>, 'children' | 'footer'>,
) {
  const query = useQuery({
    queryKey: accessProtectionQueryKey,
    queryFn: ({ signal }) => accessProtectionRequest({ signal }),
    retry: false,
    networkMode: 'always',
    refetchOnWindowFocus: false,
  });
  const unauthorized =
    query.error instanceof AccessProtectionRequestError &&
    query.error.status === 401;
  const editor = useAccessProtection(
    query.isFetchedAfterMount && query.isSuccess && !unauthorized
      ? query.data
      : null,
  );
  const expire = editor.expire;
  useEffect(() => {
    if (unauthorized) expire();
  }, [unauthorized, expire]);
  const sessionLost = editor.expired || unauthorized;
  const loading = !query.isFetchedAfterMount || query.isFetching;
  const navigation = useSiteNavigation(
    !sessionLost && (editor.dirty || editor.busy || editor.uncertain),
  );
  const disabled = editor.locked || sessionLost;
  return (
    <OwnerShell
      {...shell}
      returnTo={accessProtectionPath}
      onSessionExpire={expire}
      footer={
        <>
          <span className="mr-auto text-xs text-muted" role="status">
            {editor.dirty
              ? '有未保存的修改'
              : editor.saved
                ? `当前：${protectionModeLabels[editor.saved.mode]}`
                : ''}
          </span>
          <Button
            data-testid="access-protection-save"
            type="submit"
            form="access-protection-form"
            isDisabled={disabled || editor.ipBlocked}
            className="h-12 min-w-36 rounded-lg text-sm min-[1200px]:w-50"
          >
            <Save className="size-4" aria-hidden />
            {editor.phase === 'saving' && !sessionLost ? '正在保存…' : '保存'}
          </Button>
        </>
      }
    >
      <section
        data-testid="access-protection-settings"
        data-state={
          sessionLost
            ? 'expired'
            : editor.saved
              ? editor.phase
              : loading
                ? 'loading'
                : 'error'
        }
        className="grid min-w-0 max-w-[960px] gap-5 pb-8"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <h1 className="text-[28px] font-medium min-[1200px]:text-[30px]">
              访问防护
            </h1>
            {editor.saved ? (
              <Chip size="sm" variant="soft" className="shrink-0">
                {protectionModeLabels[editor.saved.mode]}
              </Chip>
            ) : null}
            <StorageTip label="防护范围">
              <p>
                仅限制匿名图片访问。已登录所有者免于此限频，原有访问权限和上传限制不变。
              </p>
              <p>
                S3
                保持直连；规则限制获取图片地址的请求，无法限制已签发地址的重复下载。
              </p>
            </StorageTip>
          </div>
          <Button
            variant="ghost"
            aria-label="返回基本设置"
            className="min-h-11 shrink-0 gap-2 rounded-lg px-3 text-sm"
            isDisabled={editor.busy}
            onPress={() => navigation.navigate('/settings/general')}
          >
            <ArrowLeft className="size-4" aria-hidden />
            返回
          </Button>
        </div>
        {sessionLost ? (
          <Card className={siteCardClass} role="alert">
            <h2 className="text-lg font-medium">会话已失效</h2>
            <p className="text-sm leading-6">
              当前输入已保留。重新登录后，可继续核对和保存设置。
            </p>
            <Link
              href={`/login?reason=expired&returnTo=${encodeURIComponent(accessProtectionPath)}`}
              className="flex min-h-11 w-fit items-center rounded-lg border border-border px-4 text-sm text-foreground no-underline"
            >
              重新登录
            </Link>
          </Card>
        ) : null}
        {!sessionLost && !editor.saved && !loading ? (
          <Card className={siteCardClass} role="alert">
            <h2 className="text-lg font-medium">访问防护读取失败</h2>
            <p className="text-sm leading-6 text-danger wrap-anywhere">
              {query.error?.message}
            </p>
            <Button
              variant="outline"
              className="h-11 w-fit rounded-lg"
              isDisabled={query.isFetching}
              onPress={() => void query.refetch()}
            >
              重新读取
            </Button>
          </Card>
        ) : null}
        {editor.saved ? (
          <>
            {!editor.saved.clientIp.ready && !sessionLost ? (
              <Card className={siteCardClass} role="alert">
                <h2 className="text-base font-medium">暂时无法启用拦截</h2>
                <p className="text-sm leading-6 wrap-anywhere">
                  {editor.saved.clientIp.message ??
                    '尚未确认真实访客 IP，请先核对代理配置。'}
                  仅观察和关闭仍可保存。
                </p>
              </Card>
            ) : null}
            <AccessProtectionForm editor={editor} disabled={disabled} />
            <p className="flex items-start gap-2 px-1 text-[13px] leading-6">
              <Check className="mt-1 size-4 shrink-0" aria-hidden />
              <span>已登录所有者免于此限频</span>
            </p>
          </>
        ) : null}
      </section>
      <SiteLeaveDialog
        navigation={{
          ...navigation,
          discard: () => {
            editor.discard();
            navigation.discard();
          },
        }}
        pending={editor.busy || editor.uncertain}
      />
    </OwnerShell>
  );
}
