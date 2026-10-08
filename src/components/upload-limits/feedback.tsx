'use client';

import { Button } from '@heroui/react/button';
import { Link } from '@heroui/react/link';
import { uploadLimitFields } from './model';
import type { useUploadLimits } from './use-upload-limits';

export function UploadLimitsSessionLink() {
  return (
    <Link
      href="/login?reason=expired&returnTo=%2Fsettings%2Fgeneral"
      className="flex min-h-11 w-fit items-center rounded-lg border border-border px-4 text-sm text-foreground no-underline"
    >
      重新登录
    </Link>
  );
}

export function UploadLimitsFeedback({
  settings,
}: {
  settings: ReturnType<typeof useUploadLimits>;
}) {
  if (!settings.message) return null;
  return (
    <div className="grid gap-3 text-sm">
      <p
        id="upload-limits-errors"
        tabIndex={-1}
        role="alert"
        className="text-danger whitespace-normal wrap-anywhere"
      >
        {settings.message}
      </p>
      {settings.expired ? <UploadLimitsSessionLink /> : null}
      {settings.unknown && !settings.different && !settings.expired ? (
        <Button
          data-testid="upload-limits-reconcile"
          className="min-h-11 w-fit rounded-lg"
          variant="outline"
          isDisabled={settings.busy}
          onPress={() => void settings.reconcile()}
        >
          {settings.busy ? '正在核对…' : '重新核对当前设置'}
        </Button>
      ) : null}
      {settings.different && !settings.expired ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs leading-5">
              <thead>
                <tr>
                  <th className="p-2">字段</th>
                  <th className="p-2">已保存</th>
                  <th className="p-2">当前输入</th>
                </tr>
              </thead>
              <tbody>
                {uploadLimitFields
                  .filter(
                    ({ name }) => settings.saved[name] !== settings.input[name],
                  )
                  .map(({ name, label }) => (
                    <tr key={name}>
                      <th className="border-t border-border p-2 font-normal">
                        {label}
                      </th>
                      <td className="border-t border-border p-2 wrap-anywhere">
                        {settings.saved[name]}
                      </td>
                      <td className="border-t border-border p-2 wrap-anywhere">
                        {settings.input[name]}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              data-testid="upload-limits-keep-input"
              variant="outline"
              className="min-h-11 rounded-lg"
              isDisabled={settings.busy}
              onPress={() => settings.chooseSaved(false)}
            >
              保留当前输入
            </Button>
            <Button
              data-testid="upload-limits-use-saved"
              className="min-h-11 rounded-lg"
              isDisabled={settings.busy}
              onPress={() => settings.chooseSaved(true)}
            >
              使用已保存设置
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
