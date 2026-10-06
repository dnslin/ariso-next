'use client';

import { Button } from '@heroui/react/button';
import { Spinner } from '@heroui/react/spinner';
import { Link2, LogIn, Settings2, Unlink } from 'lucide-react';
import {
  GithubBindingStatus,
  GithubSettingsStatus,
} from './github-account-status';
import { GithubSettingsEditor } from './github-settings-editor';
import { GithubSettingsSummary } from './github-settings-summary';
import { GithubUnlink } from './github-unlink';
import { useGithubAccountView } from './use-github-account-view';
import type { useGithubAccount } from './use-github-account';

const actionClass =
  'h-12 min-h-12 min-w-0 flex-1 gap-2 rounded-lg px-2 text-sm font-normal min-[768px]:w-48 min-[768px]:flex-none bg-background';

export function GithubAccount({
  account,
}: {
  account: ReturnType<typeof useGithubAccount>;
}) {
  const view = useGithubAccountView(account);
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
      className="grid min-w-0 gap-3"
    >
      <h2
        id="account-github-heading"
        tabIndex={-1}
        className="flex items-center gap-2.5 text-xl font-medium"
      >
        <LogIn className="size-6 shrink-0" aria-hidden />
        GitHub 登录
      </h2>
      <GithubSettingsStatus
        query={view.settings}
        unknown={view.settingsUnknown}
        editorOpen={view.editorOpen}
        onCheck={() => void view.checkSettings()}
      />
      {view.settingsResult === 'verified' ? (
        <p className="text-[13px] leading-normal text-muted">
          已核对当前配置，无法确认这次密钥修改结果。
        </p>
      ) : null}
      <GithubBindingStatus
        query={view.binding}
        unknown={view.unlinkUnknown}
        unlinkOpen={view.unlinkOpen}
        onCheck={() => void view.checkBinding()}
      />
      {view.settingsReady && view.settings.data?.pendingRestart ? (
        <GithubSettingsSummary settings={view.settings.data} />
      ) : null}
      {account.linkError || view.callbackFailed ? (
        <p role="alert" className="text-sm leading-normal text-danger">
          {account.linkError || 'GitHub 绑定未完成，请检查授权后重试。'}
        </p>
      ) : null}
      <div className="flex gap-3">
        {view.bound ? (
          <Button
            data-testid="account-github-unlink"
            variant="outline"
            className={actionClass}
            isDisabled={!view.bindingReady}
            onPress={view.openUnlink}
          >
            <Unlink className="size-4" aria-hidden />
            解绑 GitHub
          </Button>
        ) : (
          <Button
            data-testid="account-github-link"
            variant="outline"
            className={actionClass}
            isDisabled={!view.canLink || account.linking}
            onPress={() => void account.link()}
          >
            {account.linking ? (
              <Spinner size="sm" />
            ) : (
              <Link2 className="size-4" aria-hidden />
            )}
            {account.linking ? '正在前往…' : '绑定 GitHub'}
          </Button>
        )}
        <Button
          data-testid="account-github-config"
          variant="outline"
          className={actionClass}
          isDisabled={!view.settingsReady}
          onPress={view.openEditor}
        >
          <Settings2 className="size-4" aria-hidden />
          登录配置
        </Button>
      </div>
      {view.settingsReady &&
      !view.settings.data?.effective.enabled &&
      view.bindingReady &&
      !view.bound ? (
        <p className="text-[13px] leading-normal text-muted">
          先保存完整配置，并重启容器启用 GitHub 登录后，再绑定账号。
        </p>
      ) : null}
      <p className="text-[13px] leading-normal text-muted">
        只有已绑定账号可使用 GitHub 登录。本地邮箱与密码仍可使用。
      </p>
      {view.editorOpen && view.settings.data ? (
        <GithubSettingsEditor
          settings={view.settings.data}
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
