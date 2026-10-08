'use client';

import { useState, type ComponentProps } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { OwnerShell } from '../shell/owner-shell';
import { useResetUpload } from '../upload/provider';
import {
  SettingsCategories,
  SettingsHeading,
  settingsCategories,
} from '../shell/settings-categories';
import {
  uploadLimitsRequest,
  UploadLimitsRequestError,
  type SavedUploadLimits,
} from './api';
import { UploadLimitsForm } from './form';
import { UploadLimitsSessionLink } from './feedback';
import { useUploadLimits } from './use-upload-limits';

type ShellProps = Omit<
  ComponentProps<typeof OwnerShell>,
  'children' | 'footer'
>;
const actionClass =
  'h-12 w-full rounded-lg px-6 text-sm font-medium min-[1200px]:w-50';

export function UploadLimitsPage(shell: ShellProps) {
  const [initial, setInitial] = useState<SavedUploadLimits | null>(null);
  const resetUpload = useResetUpload();
  const query = useQuery({
    queryKey: ['upload-limits'],
    queryFn: async ({ signal }) => {
      try {
        return await uploadLimitsRequest({ signal });
      } catch (error) {
        if (error instanceof UploadLimitsRequestError && error.status === 401)
          resetUpload();
        throw error;
      }
    },
    enabled: initial === null,
    retry: false,
    networkMode: 'always',
    refetchOnWindowFocus: false,
  });
  if (!initial && query.isFetchedAfterMount && query.isSuccess)
    setInitial(query.data);
  if (initial) return <UploadLimitsEditor {...shell} initial={initial} />;
  const loading = !query.isFetchedAfterMount || query.isFetching;
  const error = query.error;
  const expired =
    error instanceof UploadLimitsRequestError && error.status === 401;
  const uninitialized =
    error instanceof UploadLimitsRequestError &&
    error.code === 'UPLOAD_NOT_INITIALIZED';
  return (
    <OwnerShell
      {...shell}
      footer={
        <Button isDisabled className={actionClass}>
          保存上传限制
        </Button>
      }
    >
      <section
        data-testid="upload-limits-editor"
        data-state={
          loading
            ? 'loading'
            : expired
              ? 'session'
              : uninitialized
                ? 'uninitialized'
                : 'error'
        }
        className="grid gap-5 pb-10"
      >
        <SettingsHeading />
        <SettingsCategories items={settingsCategories}>
          <Card className="min-w-0 gap-5 rounded-[20px] border border-border bg-surface p-4 shadow-none min-[1200px]:px-6 min-[1200px]:py-5">
            <h2 className="text-lg font-medium">
              {loading
                ? '正在读取上传限制'
                : expired
                  ? '会话已失效'
                  : uninitialized
                    ? '上传设置尚未初始化'
                    : '无法读取上传限制'}
            </h2>
            {loading ? (
              <p role="status" className="text-[13px] leading-5 text-muted">
                请稍候，取得已保存设置后再编辑。
              </p>
            ) : (
              <>
                <p role="alert" className="text-sm text-danger wrap-anywhere">
                  {error?.message}
                </p>
                {expired ? (
                  <UploadLimitsSessionLink />
                ) : (
                  <Button
                    data-testid="upload-limits-retry"
                    variant="outline"
                    className="min-h-11 w-fit rounded-lg"
                    onPress={() => void query.refetch()}
                  >
                    重新读取设置
                  </Button>
                )}
              </>
            )}
          </Card>
        </SettingsCategories>
      </section>
    </OwnerShell>
  );
}

function UploadLimitsEditor({
  initial,
  ...shell
}: ShellProps & { initial: SavedUploadLimits }) {
  const settings = useUploadLimits(initial);
  return (
    <OwnerShell
      {...shell}
      onSessionExpire={settings.expire}
      footer={
        <Button
          data-testid="upload-limits-save"
          type="submit"
          form="upload-limits-form"
          className={actionClass}
          isDisabled={settings.busy || settings.unknown || settings.expired}
        >
          {settings.busy ? '正在保存…' : '保存上传限制'}
        </Button>
      }
    >
      <section
        data-testid="upload-limits-editor"
        data-state={settings.expired ? 'session' : 'ready'}
        data-saving={settings.busy}
        data-unknown={settings.unknown}
        data-different={settings.different}
        className="grid gap-5 pb-10"
      >
        <SettingsHeading />
        <SettingsCategories items={settingsCategories}>
          <UploadLimitsForm settings={settings} />
        </SettingsCategories>
      </section>
    </OwnerShell>
  );
}
