'use client';

import { Button } from '@heroui/react/button';
import { Spinner } from '@heroui/react/spinner';
import { RefreshCw } from 'lucide-react';
import type { useGithubAccount } from './use-github-account';

type Account = ReturnType<typeof useGithubAccount>;
const retryClass =
  'min-h-11 w-fit gap-2 rounded-lg bg-background text-sm font-normal';

export function GithubSettingsStatus({
  query,
  unknown,
  editorOpen,
  onCheck,
}: {
  query: Account['settings'];
  unknown: boolean;
  editorOpen: boolean;
  onCheck: () => void;
}) {
  const loading = !query.isFetchedAfterMount || query.isFetching;
  return (
    <div
      data-testid="oauth-settings"
      data-state={
        unknown
          ? 'unknown'
          : loading
            ? 'loading'
            : query.isError
              ? 'error'
              : 'ready'
      }
      className="grid min-w-0 gap-3"
    >
      {unknown ? (
        <>
          <p role="alert" className="text-sm leading-normal text-danger">
            配置保存结果待核对。核对前不能再次编辑或提交配置。
          </p>
          {query.data ? (
            <p className="text-[13px] leading-normal text-muted">
              上次读取的生效状态：
              {query.data.effective.enabled ? '已启用' : '未启用'} GitHub 登录。
            </p>
          ) : null}
          {query.isError ? (
            <p role="alert" className="text-sm leading-normal text-danger">
              {query.error.message}
            </p>
          ) : null}
          {!editorOpen ? (
            <Button
              data-testid="oauth-settings-reload"
              variant="outline"
              className={retryClass}
              isDisabled={query.isFetching}
              onPress={onCheck}
            >
              {query.isFetching ? (
                <Spinner size="sm" />
              ) : (
                <RefreshCw className="size-4" aria-hidden />
              )}
              {query.isFetching ? '正在核对…' : '重新核对配置'}
            </Button>
          ) : null}
        </>
      ) : loading ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted">
          <Spinner size="sm" />
          正在读取登录配置…
        </p>
      ) : query.isError ? (
        <>
          <p role="alert" className="text-sm leading-normal text-danger">
            {query.error.message}
          </p>
          <Button
            data-testid="oauth-settings-reload"
            variant="outline"
            className={retryClass}
            onPress={() => void query.refetch()}
          >
            <RefreshCw className="size-4" aria-hidden />
            重新读取配置
          </Button>
        </>
      ) : query.data ? (
        <dl className="grid gap-x-5 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-muted">当前生效</dt>
          <dd>
            {query.data.effective.enabled
              ? '已启用 GitHub 登录'
              : '未启用 GitHub 登录'}
          </dd>
        </dl>
      ) : null}
    </div>
  );
}

export function GithubBindingStatus({
  query,
  unknown,
  unlinkOpen,
  onCheck,
}: {
  query: Account['binding'];
  unknown: boolean;
  unlinkOpen: boolean;
  onCheck: () => void;
}) {
  const loading = !query.isFetchedAfterMount || query.isFetching;
  const bound = query.data;
  if (unknown)
    return (
      <>
        <p role="alert" className="text-sm leading-normal text-danger">
          解绑结果待核对。连接中断不代表解绑失败，不会自动重复解绑。
        </p>
        <p className="text-[13px] leading-normal text-muted">
          上次读取：
          {bound
            ? bound.login
              ? `已绑定 @${bound.login}`
              : '已绑定 GitHub 账号（用户名暂不可用）'
            : '尚未绑定 GitHub 账号'}
          。
        </p>
        {query.isError ? (
          <p role="alert" className="text-sm leading-normal text-danger">
            {query.error.message}
          </p>
        ) : null}
        {!unlinkOpen ? (
          <Button
            data-testid="account-github-reload"
            variant="outline"
            className={retryClass}
            isDisabled={query.isFetching}
            onPress={onCheck}
          >
            {query.isFetching ? (
              <Spinner size="sm" />
            ) : (
              <RefreshCw className="size-4" aria-hidden />
            )}
            {query.isFetching ? '正在核对…' : '核对绑定状态'}
          </Button>
        ) : null}
      </>
    );
  if (loading)
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted">
        <Spinner size="sm" />
        正在读取绑定状态…
      </p>
    );
  if (query.isError)
    return (
      <>
        <p role="alert" className="text-sm leading-normal text-danger">
          {query.error.message}
        </p>
        <Button
          data-testid="account-github-reload"
          variant="outline"
          className={retryClass}
          onPress={() => void query.refetch()}
        >
          <RefreshCw className="size-4" aria-hidden />
          重新读取绑定
        </Button>
      </>
    );
  return (
    <dl className="grid gap-x-5 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
      <dt className="text-muted">绑定状态</dt>
      <dd>
        {bound ? (
          <span>
            已绑定{' '}
            <span
              data-testid="account-github-login"
              className="font-medium wrap-anywhere"
            >
              {bound.login
                ? `@${bound.login}`
                : 'GitHub 账号（用户名暂不可用）'}
            </span>
          </span>
        ) : (
          '尚未绑定 GitHub 账号'
        )}
      </dd>
    </dl>
  );
}
