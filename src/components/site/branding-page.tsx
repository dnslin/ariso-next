'use client';

import { useEffect, useRef, type ComponentProps } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Link } from '@heroui/react/link';
import { Skeleton } from '@heroui/react/skeleton';
import { ArrowLeft } from 'lucide-react';
import { OwnerShell } from '../shell/owner-shell';
import {
  brandAccept,
  brandLabels,
  brandAsset,
  readBrandSettings,
  type BrandKind,
} from './branding-api';
import { SiteRequestError } from './api';
import { useBranding } from './use-branding';
import { BrandingRow } from './branding-row';
import { BrandingPreview } from './branding-preview';
import { BrandingRemoval } from './branding-removal';
import { SiteLeaveDialog, useSiteNavigation } from './site-navigation';
import { siteCardClass } from './site-form';

export function BrandingPage(
  shell: Omit<ComponentProps<typeof OwnerShell>, 'children' | 'footer'>,
) {
  const query = useQuery({
    queryKey: ['site-branding'],
    queryFn: ({ signal }) => readBrandSettings(signal),
    retry: false,
    networkMode: 'always',
    refetchOnWindowFocus: false,
  });
  const editor = useBranding(
    query.isFetchedAfterMount && query.isSuccess ? query.data : null,
  );
  const unauthorized =
    query.error instanceof SiteRequestError && query.error.status === 401;
  const expire = editor.expire;
  useEffect(() => {
    if (unauthorized) expire();
  }, [unauthorized, expire]);
  const sessionLost = editor.expired || unauthorized;
  const inputs = useRef<Partial<Record<BrandKind, HTMLInputElement>>>({});
  const navigation = useSiteNavigation(editor.operation !== null);
  const operation = editor.operation;
  const previousKind = useRef<BrandKind | null>(null);
  useEffect(() => {
    if (operation) previousKind.current = operation.kind;
    else if (previousKind.current) {
      document
        .querySelector<HTMLButtonElement>(
          `[data-testid="branding-${previousKind.current}-choose"]`,
        )
        ?.focus({ preventScroll: true });
      previousKind.current = null;
    }
  }, [operation]);
  const preview = Boolean(operation?.file);
  const loading = !query.isFetchedAfterMount || query.isFetching;
  const buttonClass = 'min-h-12 rounded-lg px-5 text-sm';
  return (
    <OwnerShell
      {...shell}
      name={editor.saved?.name ?? shell.name}
      description={editor.saved?.description ?? shell.description}
      logoUrl={editor.saved ? editor.saved.logoUrl : shell.logoUrl}
      onSessionExpire={expire}
      returnTo="/settings/general/branding"
      footer={
        preview ? (
          <div className="flex w-full gap-3 min-[1200px]:w-auto">
            <Button
              variant="outline"
              className={`${buttonClass} flex-1 min-[1200px]:w-28`}
              isDisabled={editor.locked}
              onPress={editor.cancel}
            >
              取消
            </Button>
            <Button
              data-testid={`branding-${operation!.kind}-save`}
              className={`${buttonClass} flex-1 min-[1200px]:w-50`}
              isDisabled={editor.locked}
              onPress={() => void editor.save()}
            >
              {editor.phase === 'saving'
                ? '正在上传…'
                : `上传并替换 ${brandLabels[operation!.kind]}`}
            </Button>
          </div>
        ) : undefined
      }
    >
      <section
        data-testid="site-branding"
        data-state={
          sessionLost
            ? 'expired'
            : editor.saved
              ? 'ready'
              : loading
                ? 'loading'
                : 'error'
        }
        data-phase={operation ? editor.phase : 'ready'}
        data-kind={operation?.kind}
        className="grid min-w-0 max-w-[960px] gap-4 pb-8"
      >
        <Button
          variant="ghost"
          className="min-h-11 w-fit justify-start gap-1 px-0 text-xs"
          isDisabled={editor.locked}
          onPress={() => {
            if (preview) editor.cancel();
            else navigation.navigate('/settings/general');
          }}
        >
          <ArrowLeft aria-hidden className="size-4" />
          返回基本设置
        </Button>
        <h1 className="text-[28px] font-medium min-[1200px]:text-[30px]">
          {preview ? '品牌展示预览' : 'Logo 与 Favicon'}
        </h1>
        <p className="text-[13px] text-muted">分别更新，选择文件后预览。</p>
        {sessionLost ? (
          <Card className={siteCardClass} role="alert">
            <h2 className="text-lg font-medium">会话已失效</h2>
            <p className="text-sm">
              当前选择已保留，请重新登录后核对服务器素材。
            </p>
            <Link
              href="/login?reason=expired&returnTo=%2Fsettings%2Fgeneral%2Fbranding"
              className="min-h-11 w-fit"
            >
              重新登录
            </Link>
          </Card>
        ) : null}
        {editor.saved ? (
          preview ? (
            <BrandingPreview editor={editor} />
          ) : (
            <Card className="min-w-0 gap-0 overflow-hidden rounded-[20px] border border-border bg-surface p-0 shadow-none">
              <Card.Content className="divide-y divide-border p-0">
                {(['logo', 'favicon'] as const).map((kind) => (
                  <BrandingRow
                    key={kind}
                    kind={kind}
                    url={brandAsset(editor.saved!, kind).url}
                    disabled={editor.locked || operation !== null}
                    onSelect={() => inputs.current[kind]?.click()}
                    onRemove={() => editor.select(kind, null)}
                  />
                ))}
              </Card.Content>
            </Card>
          )
        ) : !sessionLost ? (
          <Card className={siteCardClass} role={loading ? 'status' : 'alert'}>
            {loading ? (
              <div className="grid gap-4">
                <span className="sr-only">正在读取品牌设置…</span>
                <Skeleton className="h-24 rounded-xl" />
                <Skeleton className="h-24 rounded-xl" />
              </div>
            ) : (
              <>
                <h2 className="text-lg font-medium">品牌设置读取失败</h2>
                <p className="text-sm text-danger">{query.error?.message}</p>
                <Button
                  data-testid="branding-reload"
                  variant="outline"
                  className={`${buttonClass} w-fit`}
                  onPress={() => void query.refetch()}
                >
                  重新读取
                </Button>
              </>
            )}
          </Card>
        ) : null}
        {(['logo', 'favicon'] as const).map((kind) => (
          <input
            key={kind}
            type="file"
            data-testid={`branding-${kind}-file`}
            aria-label={`选择 ${brandLabels[kind]} 文件`}
            className="hidden"
            ref={(node) => {
              if (node) inputs.current[kind] = node;
              else delete inputs.current[kind];
            }}
            disabled={editor.locked || operation !== null || !editor.saved}
            accept={brandAccept[kind]}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) editor.select(kind, file);
              event.target.value = '';
            }}
          />
        ))}
      </section>
      {operation && !operation.file ? (
        <BrandingRemoval editor={editor} />
      ) : null}
      {editor.saved && query.error && !sessionLost ? (
        <Card className={siteCardClass} role="alert">
          <p className="text-sm text-danger">
            品牌信息刷新失败：{query.error.message}
          </p>
          <Button
            data-testid="branding-reload"
            variant="outline"
            className={`${buttonClass} w-fit`}
            isDisabled={query.isFetching}
            onPress={() => void query.refetch()}
          >
            重新读取
          </Button>
        </Card>
      ) : null}
      <SiteLeaveDialog
        navigation={navigation}
        pending={editor.busy || editor.uncertain}
      />
    </OwnerShell>
  );
}
