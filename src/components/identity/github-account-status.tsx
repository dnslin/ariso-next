'use client';

import { Spinner } from '@heroui/react/spinner';
import type { useGithubAccount } from './use-github-account';

type Account = ReturnType<typeof useGithubAccount>;

export function GithubSettingsStatus({
  query,
  unknown,
}: {
  query: Account['settings'];
  unknown: boolean;
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
      className="grid min-w-0 gap-1"
    >
      {unknown ? (
        <>
          {query.data ? (
            <p className="text-[13px] leading-normal text-muted">
              上次读取的生效状态：
              {query.data.effective.enabled ? '已启用' : '未启用'} GitHub 登录。
            </p>
          ) : null}
          <p role="alert" className="text-[13px] leading-normal text-danger">
            配置保存结果待核对。核对前不能再次编辑或提交配置。
          </p>
          {query.isError ? (
            <p role="alert" className="text-[13px] leading-normal text-danger">
              {query.error.message}
            </p>
          ) : null}
        </>
      ) : loading ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted">
          <Spinner size="sm" />
          正在读取登录配置…
        </p>
      ) : query.isError ? (
        <p role="alert" className="text-[13px] leading-normal text-danger">
          {query.error.message}
        </p>
      ) : query.data ? (
        <span>
          {query.data.pendingRestart ? '当前生效：' : ''}
          {query.data.effective.enabled
            ? '已启用'
            : query.data.pendingRestart ||
                (query.data.effective.clientId &&
                  query.data.effective.hasSecret)
              ? '未启用'
              : '尚未配置'}
        </span>
      ) : null}
    </div>
  );
}

export function GithubBindingStatus({
  query,
  unknown,
  disabledHint,
}: {
  query: Account['binding'];
  unknown: boolean;
  disabledHint?: string;
}) {
  const loading = !query.isFetchedAfterMount || query.isFetching;
  const bound = query.data;
  if (unknown)
    return (
      <div className="grid gap-1">
        <p className="text-[13px] leading-normal text-muted">
          上次读取：
          {bound
            ? bound.login
              ? `@${bound.login}`
              : '已绑定 GitHub 账号（用户名暂不可用）'
            : '尚未绑定'}
          。
        </p>
        <p role="alert" className="text-[13px] leading-normal text-danger">
          解绑结果待核对。不会自动重复解绑。
        </p>
        {query.isError ? (
          <p role="alert" className="text-[13px] leading-normal text-danger">
            {query.error.message}
          </p>
        ) : null}
      </div>
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
      <p role="alert" className="text-[13px] leading-normal text-danger">
        {query.error.message}
      </p>
    );
  return (
    <div className="grid min-w-0 gap-1">
      {bound ? (
        <span data-testid="account-github-login" className="wrap-anywhere">
          {bound.login ? `@${bound.login}` : 'GitHub 账号（用户名暂不可用）'}
        </span>
      ) : (
        <span>尚未绑定</span>
      )}
      {disabledHint ? (
        <p className="text-[13px] leading-normal text-muted">{disabledHint}</p>
      ) : null}
    </div>
  );
}
