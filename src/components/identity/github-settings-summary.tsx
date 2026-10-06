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

export function GithubSettingsSummary({
  settings,
  verified = false,
}: {
  settings: GithubSettings;
  verified?: boolean;
}) {
  return (
    <div
      data-testid={
        verified ? 'oauth-verified-summary' : 'oauth-pending-restart'
      }
      className="grid gap-2 rounded-xl border border-border p-3 text-[13px] leading-normal"
    >
      <p className="flex items-center gap-2 font-medium">
        <RefreshCw className="size-4 shrink-0" aria-hidden />
        {verified ? '已核对当前配置' : '等待重启生效'}
      </p>
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
      {settings.pendingRestart ? (
        <p className="text-muted">
          重启容器后使用已保存配置。保存不会自动重启。
        </p>
      ) : null}
    </div>
  );
}
