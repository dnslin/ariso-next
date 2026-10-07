'use client';

import {
  createElement,
  useCallback,
  useState,
  type ComponentProps,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Link } from '@heroui/react/link';
import { Spinner } from '@heroui/react/spinner';
import { toast } from '@heroui/react/toast';
import {
  Check,
  CircleAlert,
  KeyRound,
  LogIn,
  Mail,
  RefreshCw,
  UserRound,
} from 'lucide-react';
import { OwnerShell } from '../shell/owner-shell';
import {
  SettingsCategories,
  SettingsHeading,
  settingsCategories,
} from '../shell/settings-categories';
import { AccountEditor } from './account-editor';
import {
  AccountSettingRow,
  accountActionClass,
  accountSurfaceClass,
} from './account-setting-row';
import { GithubAccount } from './github-account';
import { useGithubAccount } from './use-github-account';
import { AccountRequestError, readAccountEmail } from './account-request';

type ShellProps = Omit<
  ComponentProps<typeof OwnerShell>,
  'children' | 'footer'
>;
const queryKey = ['account-email'];
const login = '/login?reason=expired&returnTo=%2Fsettings%2Faccount';

export function AccountPage(shell: ShellProps) {
  const client = useQueryClient();
  const [kind, setKind] = useState<'email' | 'password' | null>(null);
  const [expired, setExpired] = useState(false);
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => readAccountEmail(signal),
    retry: false,
    networkMode: 'always',
    refetchOnWindowFocus: false,
  });
  const loading = !query.isFetchedAfterMount || query.isFetching;
  const email = query.data ?? shell.email;
  const expire = useCallback(() => {
    setExpired(true);
    setKind(null);
  }, []);
  const github = useGithubAccount(expire);
  const sessionLost =
    expired ||
    github.sessionLost ||
    (query.error instanceof AccountRequestError && query.error.status === 401);
  const changeEmail = useCallback(
    (value: string) => client.setQueryData(queryKey, value),
    [client],
  );
  const saved = useCallback((operation: 'email' | 'password') => {
    toast(operation === 'email' ? '登录邮箱已更新' : '密码已更新', {
      variant: 'default',
      indicator: createElement(Check, {
        className: 'size-5',
        'aria-hidden': true,
      }),
      description:
        operation === 'email'
          ? '下次登录请使用新邮箱，未使用的重置链接已撤销。'
          : '当前设备保持登录，其他设备已退出。',
    });
    setKind(null);
  }, []);
  return (
    <OwnerShell
      {...shell}
      email={email}
      returnTo="/settings/account"
      onSessionExpire={expire}
    >
      <section
        data-testid="account-page"
        data-state={
          sessionLost
            ? 'session'
            : loading
              ? 'loading'
              : query.isError
                ? 'error'
                : 'ready'
        }
        className="pb-10"
      >
        <SettingsHeading />
        <SettingsCategories items={settingsCategories}>
          {sessionLost || (!loading && query.isError) ? (
            <Card
              data-testid="account-load-error"
              className="gap-3 rounded-[20px] border border-border bg-surface p-4 shadow-none min-[1200px]:p-6"
            >
              <h2 className="flex items-center gap-2 text-xl font-medium">
                <CircleAlert className="size-5" aria-hidden />
                {sessionLost ? '会话已失效' : '无法读取账号'}
              </h2>
              <p role="alert" className="text-sm leading-normal text-danger">
                {sessionLost ? '请重新登录后管理账号。' : query.error?.message}
              </p>
              {sessionLost ? (
                <Link
                  href={login}
                  className="flex min-h-12 w-fit items-center gap-2 rounded-lg border border-border bg-background px-4 text-sm text-foreground no-underline"
                >
                  <LogIn className="size-4" aria-hidden />
                  重新登录
                </Link>
              ) : (
                <Button
                  variant="outline"
                  className="h-12 w-fit gap-2 rounded-lg bg-background"
                  onPress={() => void query.refetch()}
                >
                  <RefreshCw className="size-4" aria-hidden />
                  重新读取
                </Button>
              )}
            </Card>
          ) : loading ? (
            <Card
              data-testid="account-loading"
              role="status"
              aria-label="正在读取账号"
              className="min-h-72 gap-3 rounded-[20px] border border-border bg-surface p-4 shadow-none min-[1200px]:p-6"
            >
              <h2 className="flex items-center gap-2 text-xl font-medium">
                <Spinner size="sm" />
                正在读取账号
              </h2>
              <p className="text-[13px] leading-normal text-muted">
                取得当前邮箱后即可修改账号。
              </p>
            </Card>
          ) : (
            <div className="grid w-full min-w-0 max-w-240 gap-8">
              <section
                aria-labelledby="owner-account-heading"
                className="grid min-w-0 gap-3"
              >
                <h2
                  id="owner-account-heading"
                  className="flex items-center gap-2 text-lg font-medium"
                >
                  <UserRound className="size-5 shrink-0" aria-hidden />
                  所有者账号
                </h2>
                <Card className={accountSurfaceClass}>
                  <AccountSettingRow
                    label="登录邮箱"
                    icon={<Mail className="size-4 shrink-0" aria-hidden />}
                    action={
                      <Button
                        data-testid="account-change-email"
                        variant="outline"
                        className={`${accountActionClass} bg-background`}
                        onPress={() => setKind('email')}
                      >
                        修改邮箱
                      </Button>
                    }
                  >
                    <span data-testid="account-email" className="wrap-anywhere">
                      {email}
                    </span>
                  </AccountSettingRow>
                  <AccountSettingRow
                    label="登录密码"
                    icon={<KeyRound className="size-4 shrink-0" aria-hidden />}
                    action={
                      <Button
                        data-testid="account-change-password"
                        variant="outline"
                        className={`${accountActionClass} bg-background`}
                        onPress={() => setKind('password')}
                      >
                        修改密码
                      </Button>
                    }
                  >
                    <span
                      aria-label="已设置登录密码"
                      className="tracking-[3px]"
                    >
                      ••••••••
                    </span>
                  </AccountSettingRow>
                </Card>
              </section>
              <GithubAccount account={github} />
            </div>
          )}
        </SettingsCategories>
      </section>
      {kind && !sessionLost ? (
        <AccountEditor
          key={kind}
          kind={kind}
          email={email}
          onClose={() => setKind(null)}
          onEmailChange={changeEmail}
          onSuccess={saved}
          onSessionExpire={expire}
        />
      ) : null}
    </OwnerShell>
  );
}
