'use client';

import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Spinner } from '@heroui/react/spinner';
import { Link2, LogIn, RefreshCw, Settings2 } from 'lucide-react';
import {
  AccountSettingRow,
  accountActionClass,
  accountSurfaceClass,
} from './account-setting-row';
import {
  GithubBindingStatus,
  GithubSettingsStatus,
} from './github-account-status';
import { GithubSettingsEditor } from './github-settings-editor';
import { GithubPendingSummary } from './github-settings-summary';
import { GithubUnlink } from './github-unlink';
import { useGithubAccountView } from './use-github-account-view';
import type { useGithubAccount } from './use-github-account';

export function GithubAccount({
  account,
}: {
  account: ReturnType<typeof useGithubAccount>;
}) {
  const view = useGithubAccountView(account);
  const settings = view.settings.data;
  const configured = Boolean(
    settings?.saved.clientId && settings.saved.hasSecret,
  );
  const secondaryConfig = configured || settings?.pendingRestart;
  const disabledHint =
    view.settingsReady && !settings?.effective.enabled
      ? view.bound
        ? '登录已停用，绑定保留'
        : settings?.pendingRestart && settings.saved.enabled
          ? '重启生效后可绑定'
          : configured
            ? '启用登录后可绑定'
            : '完成配置后可绑定'
      : undefined;
  const bindingAction = view.unlinkUnknown ? (
    !view.unlinkOpen ? (
      <Button
        data-testid="account-github-reload"
        className={`${accountActionClass} gap-2 bg-accent`}
        isDisabled={view.binding.isFetching}
        onPress={() => void view.checkBinding()}
      >
        {view.binding.isFetching ? (
          <Spinner size="sm" />
        ) : (
          <RefreshCw className="size-4" aria-hidden />
        )}
        {view.binding.isFetching ? '正在核对…' : '核对绑定'}
      </Button>
    ) : null
  ) : view.bindingLoading ? null : view.binding.isError ? (
    <Button
      data-testid="account-github-reload"
      variant="outline"
      className={`${accountActionClass} gap-2 bg-background`}
      onPress={() => void view.binding.refetch()}
    >
      <RefreshCw className="size-4" aria-hidden />
      重新读取绑定
    </Button>
  ) : view.bindingReady && view.bound ? (
    <Button
      data-testid="account-github-unlink"
      variant="outline"
      className={`${accountActionClass} bg-background`}
      onPress={view.openUnlink}
    >
      解绑账号
    </Button>
  ) : view.canLink || account.linking ? (
    <Button
      data-testid="account-github-link"
      className={`${accountActionClass} bg-accent`}
      isDisabled={!view.canLink || account.linking}
      onPress={() => void account.link()}
    >
      {account.linking ? <Spinner size="sm" /> : null}
      {account.linking ? '正在前往…' : '绑定 GitHub'}
    </Button>
  ) : null;
  const settingsAction = view.settingsUnknown ? (
    !view.editorOpen ? (
      <Button
        data-testid="oauth-settings-reload"
        className={`${accountActionClass} gap-2 bg-accent`}
        isDisabled={view.settings.isFetching}
        onPress={() => void view.checkSettings()}
      >
        {view.settings.isFetching ? (
          <Spinner size="sm" />
        ) : (
          <RefreshCw className="size-4" aria-hidden />
        )}
        {view.settings.isFetching ? '正在核对…' : '核对配置'}
      </Button>
    ) : null
  ) : !view.settings.isFetchedAfterMount ||
    view.settings.isFetching ? null : view.settings.isError ? (
    <Button
      data-testid="oauth-settings-reload"
      variant="outline"
      className={`${accountActionClass} gap-2 bg-background`}
      onPress={() => void view.settings.refetch()}
    >
      <RefreshCw className="size-4" aria-hidden />
      重新读取配置
    </Button>
  ) : view.settingsReady ? (
    <Button
      data-testid="account-github-config"
      variant={secondaryConfig ? 'outline' : 'primary'}
      className={`${accountActionClass} ${secondaryConfig ? 'bg-background' : 'bg-accent'}`}
      onPress={view.openEditor}
    >
      {secondaryConfig ? '登录配置' : '配置 GitHub'}
    </Button>
  ) : null;
  return (
    <section
      data-testid="account-github"
      data-state={
        account.sessionLost
          ? 'session'
          : view.unlinkUnknown
            ? 'unknown'
            : view.bindingLoading
              ? 'loading'
              : view.binding.isError
                ? 'error'
                : view.bound
                  ? 'bound'
                  : 'unbound'
      }
      aria-labelledby="account-github-heading"
      className="grid min-w-0 gap-3"
    >
      <h2
        id="account-github-heading"
        tabIndex={-1}
        className="flex items-center gap-2 text-lg font-medium"
      >
        <LogIn className="size-5 shrink-0" aria-hidden />
        GitHub 登录
      </h2>
      <Card className={accountSurfaceClass}>
        <AccountSettingRow
          label="GitHub 账号"
          icon={<Link2 className="size-4 shrink-0" aria-hidden />}
          action={bindingAction}
        >
          <GithubBindingStatus
            query={view.binding}
            unknown={view.unlinkUnknown}
            disabledHint={disabledHint}
          />
          {account.linkError || view.callbackFailed ? (
            <p
              role="alert"
              className="mt-1 text-[13px] leading-normal text-danger"
            >
              {account.linkError || 'GitHub 绑定未完成，请检查授权后重试。'}
            </p>
          ) : null}
        </AccountSettingRow>
        <AccountSettingRow
          label="站点登录配置"
          icon={<Settings2 className="size-4 shrink-0" aria-hidden />}
          action={settingsAction}
        >
          <GithubSettingsStatus
            query={view.settings}
            unknown={view.settingsUnknown}
          />
          {view.settingsResult === 'verified' ? (
            <p className="mt-1 text-[13px] leading-normal text-muted">
              已核对当前配置，无法确认这次密钥修改结果。
            </p>
          ) : null}
        </AccountSettingRow>
        {view.settingsReady && settings?.pendingRestart ? (
          <GithubPendingSummary settings={settings} />
        ) : null}
      </Card>
      {view.editorOpen && settings ? (
        <GithubSettingsEditor
          settings={settings}
          onClose={view.closeEditor}
          onUpdate={account.updateSettings}
          onSaved={view.saved}
          onUncertain={view.settingsUncertain}
          onVerified={view.settingsVerified}
          onSessionExpire={account.onSessionExpire}
        />
      ) : null}
      {view.unlinkOpen && view.bound ? (
        <GithubUnlink
          binding={view.bound}
          onClose={view.closeUnlink}
          onUpdate={account.updateBinding}
          onUnlinked={view.unlinked}
          onUncertain={view.unlinkUncertain}
          onVerified={view.unlinkVerified}
          onSessionExpire={account.onSessionExpire}
        />
      ) : null}
    </section>
  );
}
