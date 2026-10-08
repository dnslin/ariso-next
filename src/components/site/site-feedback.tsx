'use client';

import { Button } from '@heroui/react/button';
import { siteFieldLabels } from './model';
import type { useSiteSettings } from './use-site-settings';
import type { SiteSettingsResponse } from './api';

export function SiteFeedback({
  settings,
}: {
  settings: ReturnType<typeof useSiteSettings> & {
    saved: SiteSettingsResponse;
  };
}) {
  const { phase, message, input, saved } = settings;
  const title =
    phase === 'unknown'
      ? '保存结果尚未确认'
      : phase === 'checking'
        ? '正在核对已保存设置'
        : phase === 'check-error'
          ? '无法核对保存结果'
          : phase === 'different'
            ? '已保存值与本次提交不同'
            : phase === 'confirmed'
              ? '已确认上次保存'
              : '';
  if (!title && !message) return null;
  return (
    <div
      id="site-feedback"
      tabIndex={-1}
      role={phase === 'checking' || phase === 'confirmed' ? 'status' : 'alert'}
      className="grid min-w-0 gap-3 rounded-lg border border-border p-4 outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      {title ? <h3 className="text-sm font-medium">{title}</h3> : null}
      {phase === 'unknown' || phase === 'check-error' ? (
        <p className="text-sm leading-6">
          当前输入已保留。先核对服务器配置，再决定是否重新保存。
        </p>
      ) : null}
      {message ? (
        <p className="text-sm leading-6 wrap-anywhere">{message}</p>
      ) : null}
      {phase === 'different' ? (
        <>
          <dl className="grid min-w-0 gap-3">
            {(Object.keys(siteFieldLabels) as (keyof typeof siteFieldLabels)[])
              .filter((field) => input[field] !== saved[field])
              .map((field) => (
                <div key={field} className="grid min-w-0 gap-1 text-sm">
                  <dt className="font-medium">{siteFieldLabels[field]}</dt>
                  <dd className="select-text wrap-anywhere">
                    服务器：{saved[field] === '' ? '（空）' : saved[field]}
                  </dd>
                  <dd className="select-text text-muted wrap-anywhere">
                    当前输入：{input[field] === '' ? '（空）' : input[field]}
                  </dd>
                </div>
              ))}
          </dl>
          <div className="flex flex-wrap gap-3">
            <Button
              id="site-use-saved"
              type="button"
              variant="outline"
              className="min-h-11 rounded-lg"
              onPress={() => settings.chooseSaved(true)}
            >
              使用服务器设置
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 rounded-lg"
              onPress={() => settings.chooseSaved(false)}
            >
              保留输入继续编辑
            </Button>
          </div>
        </>
      ) : ['unknown', 'checking', 'check-error'].includes(phase) ? (
        <Button
          id="site-reconcile"
          type="button"
          variant="outline"
          isDisabled={phase === 'checking'}
          className="min-h-11 w-fit rounded-lg"
          onPress={() => void settings.reconcile()}
        >
          {phase === 'checking' ? '正在核对…' : '核对已保存设置'}
        </Button>
      ) : null}
    </div>
  );
}
