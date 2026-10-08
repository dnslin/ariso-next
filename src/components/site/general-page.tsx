'use client';

import {
  useCallback,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Link } from '@heroui/react/link';
import { OwnerShell } from '../shell/owner-shell';
import {
  SettingsCategories,
  SettingsHeading,
  settingsCategories,
} from '../shell/settings-categories';
import {
  siteRequest,
  SiteRequestError,
  type SiteSettingsResponse,
} from './api';
import { useSiteSettings } from './use-site-settings';
import { SiteForm, siteCardClass } from './site-form';
import { RelatedSettings } from './related-settings';
import { hasUnsavedSiteChanges } from './model';
import { useSiteNavigation, SiteLeaveDialog } from './site-navigation';

type ShellProps = Omit<
  ComponentProps<typeof OwnerShell>,
  'children' | 'footer'
>;
const saveClass = 'h-12 w-full rounded-lg min-[1200px]:w-50';

export function GeneralPage(shell: ShellProps) {
  const [initial, setInitial] = useState<SiteSettingsResponse | null>(null);
  const [expired, setExpired] = useState(false);
  const expire = useCallback(() => setExpired(true), []);
  const query = useQuery({
    queryKey: ['site-settings'],
    queryFn: ({ signal }) => siteRequest<SiteSettingsResponse>({ signal }),
    retry: false,
    enabled: initial === null && !expired,
    networkMode: 'always',
    refetchOnWindowFocus: false,
  });
  const sessionLost =
    expired ||
    (query.error instanceof SiteRequestError && query.error.status === 401);
  if (!sessionLost && !initial && query.isFetchedAfterMount && query.isSuccess)
    setInitial(query.data);
  if (!sessionLost && initial)
    return <SiteEditor {...shell} initial={initial} />;
  const loading =
    !sessionLost && (!query.isFetchedAfterMount || query.isFetching);
  const uninitialized =
    query.error instanceof SiteRequestError &&
    query.error.code === 'SITE_NOT_INITIALIZED';
  return (
    <GeneralFrame
      shell={{ ...shell, onSessionExpire: expire }}
      phase={
        sessionLost
          ? 'session'
          : loading
            ? 'loading'
            : uninitialized
              ? 'uninitialized'
              : 'error'
      }
      footer={
        <Button id="site-save" className={saveClass} isDisabled>
          保存站点信息
        </Button>
      }
      onExpire={expire}
    >
      <Card className={siteCardClass} role={loading ? 'status' : 'alert'}>
        <h2 className="text-lg font-medium">
          {sessionLost
            ? '会话已失效'
            : loading
              ? '正在读取站点信息'
              : uninitialized
                ? '站点尚未初始化'
                : '无法读取站点信息'}
        </h2>
        <p className="text-sm leading-6 wrap-anywhere">
          {sessionLost
            ? '请重新登录后编辑站点信息。'
            : loading
              ? '取得服务器已保存设置后即可编辑。'
              : query.error?.message}
        </p>
        {sessionLost ? (
          <SessionLink />
        ) : uninitialized ? (
          <Link
            href="/setup"
            className="flex min-h-11 w-fit items-center rounded-lg border border-border px-4 text-sm text-foreground no-underline"
          >
            完成初始化
          </Link>
        ) : !loading ? (
          <Button
            variant="outline"
            className="min-h-11 w-fit rounded-lg"
            onPress={() => void query.refetch()}
          >
            重新读取站点信息
          </Button>
        ) : null}
      </Card>
    </GeneralFrame>
  );
}

function GeneralFrame({
  shell,
  phase,
  children,
  footer,
  onExpire,
  onNavigate,
}: {
  shell: ShellProps;
  phase: string;
  children: ReactNode;
  footer: ReactNode;
  onExpire: () => void;
  onNavigate?: (href: string) => void;
}) {
  return (
    <OwnerShell {...shell} returnTo="/settings/general" footer={footer}>
      <section data-testid="site-general" data-state={phase} className="pb-10">
        <SettingsHeading />
        <SettingsCategories items={settingsCategories} onNavigate={onNavigate}>
          <div className="grid min-w-0 gap-5">
            <p className="text-[13px] leading-5 text-muted">
              站点信息独立保存；其他设置由所属模块管理。
            </p>
            {children}
            <RelatedSettings onExpire={onExpire} />
          </div>
        </SettingsCategories>
      </section>
    </OwnerShell>
  );
}

function SiteEditor({
  initial,
  ...shell
}: ShellProps & { initial: SiteSettingsResponse }) {
  const settings = useSiteSettings(initial);
  const navigation = useSiteNavigation(
    !settings.expired &&
      hasUnsavedSiteChanges(settings.input, settings.saved, settings.phase),
  );
  return (
    <GeneralFrame
      shell={{
        ...shell,
        name: settings.saved.name,
        description: settings.saved.description,
        onSessionExpire: settings.expire,
      }}
      phase={settings.expired ? 'session' : settings.phase}
      onExpire={settings.expire}
      onNavigate={navigation.navigate}
      footer={
        <Button
          id="site-save"
          type="submit"
          form="site-settings-form"
          className={saveClass}
          isDisabled={settings.locked}
        >
          {settings.phase === 'saving' && !settings.expired
            ? '正在保存…'
            : '保存站点信息'}
        </Button>
      }
    >
      {settings.expired ? (
        <Card className={siteCardClass} role="alert">
          <h2 className="text-lg font-medium">会话已失效</h2>
          <p className="text-sm leading-6">
            当前输入已保留，请重新登录后核对服务器设置。
          </p>
          <SessionLink />
        </Card>
      ) : null}
      <SiteForm settings={settings} />
      <SiteLeaveDialog
        navigation={navigation}
        pending={settings.locked && !settings.expired}
      />
    </GeneralFrame>
  );
}
function SessionLink() {
  return (
    <Link
      href="/login?reason=expired&returnTo=%2Fsettings%2Fgeneral"
      className="flex min-h-11 w-fit items-center rounded-lg border border-border bg-background px-4 text-sm text-foreground no-underline"
    >
      重新登录
    </Link>
  );
}
