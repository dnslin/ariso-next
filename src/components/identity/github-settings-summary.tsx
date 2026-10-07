import { Accordion } from '@heroui/react/accordion';
import { RefreshCw } from 'lucide-react';
import type { GithubSettings } from './github-request';

function ConfigurationSummary({ value }: { value: GithubSettings['saved'] }) {
  return (
    <>
      {value.enabled ? '启用' : '停用'} · Client ID：
      {value.clientId || '未设置'} · {value.hasSecret ? '密钥已设置' : '无密钥'}
    </>
  );
}

function ConfigurationDetails({ settings }: { settings: GithubSettings }) {
  return (
    <dl className="grid gap-1.5">
      <div className="grid gap-0.5 sm:grid-cols-[72px_1fr]">
        <dt className="text-muted">已保存</dt>
        <dd className="min-w-0 wrap-anywhere">
          <ConfigurationSummary value={settings.saved} />
        </dd>
      </div>
      <div className="grid gap-0.5 sm:grid-cols-[72px_1fr]">
        <dt className="text-muted">当前生效</dt>
        <dd className="min-w-0 wrap-anywhere">
          <ConfigurationSummary value={settings.effective} />
        </dd>
      </div>
    </dl>
  );
}

function ConfigurationSnapshot({
  title,
  value,
}: {
  title: string;
  value: GithubSettings['saved'];
}) {
  return (
    <div data-testid="oauth-config-snapshot" className="grid gap-1">
      <p className="font-medium">
        {title} · {value.enabled ? '启用' : '停用'}
      </p>
      <p className="wrap-anywhere text-muted">
        Client ID：{value.clientId || '未设置'}
      </p>
      <p className="text-muted">密钥{value.hasSecret ? '已设置' : '未设置'}</p>
    </div>
  );
}

export function GithubPendingSummary({
  settings,
}: {
  settings: GithubSettings;
}) {
  return (
    <div
      data-testid="oauth-pending-restart"
      className="grid gap-1 border-t border-border px-4 py-3 sm:px-5"
    >
      <p className="text-[13px] leading-normal">
        已保存：{settings.saved.enabled ? '启用' : '停用'}
        <span className="mx-2 text-muted">·</span>当前生效：
        {settings.effective.enabled ? '启用' : '停用'}
      </p>
      <p className="text-[13px] text-muted">
        重启容器后使用已保存配置。保存不会自动重启。
      </p>
      <Accordion hideSeparator>
        <Accordion.Item id="oauth-configuration-difference">
          <Accordion.Heading>
            <Accordion.Trigger
              data-testid="oauth-config-difference"
              className="min-h-11 py-2 text-[13px] font-normal text-muted"
            >
              查看配置差异
              <Accordion.Indicator className="size-4" />
            </Accordion.Trigger>
          </Accordion.Heading>
          <Accordion.Panel>
            <Accordion.Body className="grid gap-3 pb-2 pt-1 text-[13px]">
              <ConfigurationSnapshot title="已保存" value={settings.saved} />
              <ConfigurationSnapshot
                title="当前生效"
                value={settings.effective}
              />
            </Accordion.Body>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </div>
  );
}

export function GithubSettingsSummary({
  settings,
}: {
  settings: GithubSettings;
}) {
  return (
    <div
      data-testid="oauth-verified-summary"
      className="grid gap-2 rounded-xl border border-border p-3 text-[13px] leading-normal"
    >
      <p className="flex items-center gap-2 font-medium">
        <RefreshCw className="size-4 shrink-0" aria-hidden />
        已核对当前配置
      </p>
      <ConfigurationDetails settings={settings} />
      {settings.pendingRestart ? (
        <p className="text-muted">
          重启容器后使用已保存配置。保存不会自动重启。
        </p>
      ) : null}
    </div>
  );
}
