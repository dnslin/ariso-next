'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Link } from '@heroui/react/link';
import { KeyRound, Plus } from 'lucide-react';
import { OwnerShell } from '../shell/owner-shell';
import {
  SettingsCategories,
  SettingsHeading,
  settingsCategories,
} from '../shell/settings-categories';
import { TokenCreateDialog } from './token-create-dialog';
import { TokenActionDialog } from './token-action-dialog';
import { TokenList } from './token-list';
import { TokenTimeInfo, TokenUsageInfo } from './token-help';
import {
  readTokens,
  TokenRequestError,
  type TokenRecord,
} from './token-request';
import { useTokenAction } from './token-use-action';

type Props = Omit<ComponentProps<typeof OwnerShell>, 'children' | 'footer'> & {
  timeZone: string;
};
const queryKey = ['upload-tokens'];

export function TokensPage({ timeZone, ...shell }: Props) {
  const client = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [expired, setExpired] = useState(false);
  const pendingFocus = useRef(false);
  const createButton = useRef<HTMLButtonElement>(null);
  const retryButton = useRef<HTMLButtonElement>(null);
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => readTokens(signal),
    retry: false,
    networkMode: 'always',
    refetchOnWindowFocus: false,
  });
  const loading = !query.isFetchedAfterMount || query.isFetching;
  const sessionLost =
    expired ||
    (query.error instanceof TokenRequestError && query.error.status === 401);
  function refreshAndRestoreFocus() {
    pendingFocus.current = true;
    void query.refetch();
  }
  useEffect(() => {
    if (!pendingFocus.current || loading) return;
    pendingFocus.current = false;
    if (sessionLost) return;
    const frame = requestAnimationFrame(() => {
      (query.isError ? retryButton.current : createButton.current)?.focus({
        preventScroll: true,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [loading, query.isError, sessionLost]);
  const expire = useCallback(() => {
    setExpired(true);
    setCreating(false);
  }, []);
  const changeRecords = useCallback(
    (tokens: TokenRecord[]) => {
      client.setQueryData(queryKey, tokens);
    },
    [client],
  );
  const changeRecord = useCallback(
    (token: TokenRecord) => {
      client.setQueryData<TokenRecord[]>(queryKey, (tokens = []) =>
        tokens.some(({ id }) => id === token.id)
          ? tokens.map((item) => (item.id === token.id ? token : item))
          : [token, ...tokens],
      );
    },
    [client],
  );
  const removeRecord = useCallback(
    (id: string) => {
      client.setQueryData<TokenRecord[]>(queryKey, (tokens = []) =>
        tokens.filter((token) => token.id !== id),
      );
    },
    [client],
  );
  const actions = useTokenAction({
    onRecord: changeRecord,
    onRecords: changeRecords,
    onRemoved: removeRecord,
    onSessionExpire: expire,
    onUncertainClose: refreshAndRestoreFocus,
  });
  const tokens = query.data ?? [];

  return (
    <OwnerShell {...shell} returnTo="/settings/api" onSessionExpire={expire}>
      <section
        data-testid="api-page"
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
          <Card className="grid min-w-0 gap-5 rounded-[20px] border border-border bg-surface px-4 py-6 shadow-none min-[1200px]:p-6">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1">
                <h2 className="flex items-center gap-2 whitespace-nowrap text-xl font-medium">
                  <KeyRound className="size-6 shrink-0" aria-hidden />
                  上传 Token
                </h2>
                <TokenTimeInfo timeZone={timeZone} />
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="hidden sm:block">
                  <TokenUsageInfo />
                </span>
                <Button
                  ref={createButton}
                  data-testid="api-create-open"
                  className="h-12 min-h-12 w-25 shrink-0 rounded-lg text-sm font-normal"
                  isDisabled={
                    loading || sessionLost || query.isError || !!actions.action
                  }
                  onPress={() => setCreating(true)}
                >
                  <Plus className="size-4" aria-hidden />
                  创建
                </Button>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <p className="text-sm leading-normal text-muted">
                让脚本上传图片。Token 不能登录后台、浏览或管理图库。
              </p>
              <span className="shrink-0 sm:hidden">
                <TokenUsageInfo />
              </span>
            </div>
            {sessionLost ? (
              <div className="grid gap-3">
                <p role="alert" className="text-sm text-danger">
                  会话已失效，请重新登录后管理 Token。
                </p>
                <Link
                  href="/login?reason=expired&returnTo=%2Fsettings%2Fapi"
                  className="flex min-h-12 w-fit items-center rounded-lg border border-border bg-background px-4 text-sm text-foreground no-underline"
                >
                  重新登录
                </Link>
              </div>
            ) : loading ? (
              <div
                data-testid="api-loading"
                role="status"
                aria-label="正在读取 Token 列表"
                className="text-base leading-normal text-foreground"
              >
                正在读取 Token…
              </div>
            ) : query.isError ? (
              <div data-testid="api-load-error" className="grid gap-4">
                <p
                  role="alert"
                  className="text-base leading-normal text-foreground"
                >
                  暂时无法读取 Token。请重试；这不代表列表为空。
                  {query.error.message}
                </p>
                <Button
                  ref={retryButton}
                  data-testid="api-load-retry"
                  variant="outline"
                  className="h-12 w-full rounded-lg bg-background text-sm font-normal sm:w-40"
                  onPress={refreshAndRestoreFocus}
                >
                  重新加载
                </Button>
              </div>
            ) : tokens.length ? (
              <TokenList
                tokens={tokens}
                timeZone={timeZone}
                actions={actions}
              />
            ) : (
              <div
                data-testid="api-empty"
                className="grid justify-items-center gap-3 py-6 text-center"
              >
                <KeyRound className="size-8 text-muted" aria-hidden />
                <h3 className="text-base font-medium">暂无上传 Token</h3>
                <p className="text-sm text-muted">创建用于脚本上传的 Token。</p>
              </div>
            )}
          </Card>
        </SettingsCategories>
      </section>
      {creating && !sessionLost ? (
        <TokenCreateDialog
          tokens={tokens}
          timeZone={timeZone}
          onRecord={changeRecord}
          onRecords={changeRecords}
          onClose={() => setCreating(false)}
          onUncertainClose={refreshAndRestoreFocus}
          onSessionExpire={expire}
        />
      ) : null}
      {!sessionLost ? (
        <TokenActionDialog controller={actions} timeZone={timeZone} />
      ) : null}
    </OwnerShell>
  );
}
