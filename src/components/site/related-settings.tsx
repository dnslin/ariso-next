'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@heroui/react/button';
import { Card } from '@heroui/react/card';
import { Link } from '@heroui/react/link';
import { ChevronRight } from 'lucide-react';
import {
  storageRequest,
  storageSettingsUrl,
  StorageRequestError,
  type StorageSettings,
  type StorageSummary,
} from '../storage/storage-api';
import {
  processingRequest,
  processingSettingsUrl,
  ProcessingRequestError,
  type SavedProcessingSettings,
} from '../processing/api';

const rowClass =
  'flex min-h-16 w-full items-center rounded-none px-4 py-3 text-left sm:min-h-14 min-[1200px]:px-6';
export function RelatedSetting({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  const content = (
    <span className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_20px] items-center gap-x-3 sm:grid-cols-[minmax(0,1fr)_auto_20px]">
      <span className="text-sm font-medium">{label}</span>
      <span className="col-start-1 row-start-2 mt-1 text-sm font-normal text-muted wrap-anywhere sm:col-start-2 sm:row-start-1 sm:mt-0 sm:text-right">
        {value}
      </span>
      {href ? (
        <ChevronRight
          aria-hidden
          className="col-start-2 row-span-2 row-start-1 size-4 sm:col-start-3 sm:row-span-1"
        />
      ) : null}
    </span>
  );
  return href ? (
    <Link href={href} className={`${rowClass} text-foreground no-underline`}>
      {content}
    </Link>
  ) : (
    <div className={rowClass}>{content}</div>
  );
}
export function defaultStorageLabel(
  settings: StorageSettings,
  storages: StorageSummary[],
) {
  if (settings.defaultStorageId === null) return '未设置';
  const storage = storages.find(
    (item) => item.id === settings.defaultStorageId,
  );
  if (!storage) return '默认存储不存在，请核对';
  return storage.enabled ? storage.name : `${storage.name}（已停用）`;
}

export function RelatedSettings({ onExpire }: { onExpire: () => void }) {
  const common = {
    retry: false,
    networkMode: 'always' as const,
    refetchOnWindowFocus: false,
  };
  const storageSettings = useQuery({
    ...common,
    queryKey: ['storage-settings'],
    queryFn: ({ signal }) =>
      storageRequest<StorageSettings>(storageSettingsUrl, { signal }),
  });
  const storages = useQuery({
    ...common,
    queryKey: ['storage-overview'],
    queryFn: ({ signal }) =>
      storageRequest<StorageSummary[]>('/api/storages', { signal }),
  });
  const media = useQuery({
    ...common,
    queryKey: ['processing-settings'],
    queryFn: ({ signal }) =>
      processingRequest<SavedProcessingSettings>(processingSettingsUrl, {
        signal,
      }),
  });
  const storageError = storageSettings.error ?? storages.error;
  const sessionLost =
    (storageSettings.error instanceof StorageRequestError &&
      storageSettings.error.status === 401) ||
    (storages.error instanceof StorageRequestError &&
      storages.error.status === 401) ||
    (media.error instanceof ProcessingRequestError &&
      media.error.status === 401);
  useEffect(() => {
    if (sessionLost) onExpire();
  }, [sessionLost, onExpire]);
  const storageValue = storageError
    ? '读取失败'
    : !storageSettings.data || !storages.data
      ? '正在读取…'
      : defaultStorageLabel(storageSettings.data, storages.data);
  const version = media.data?.defaultLinkVersion;
  const mediaValue = media.error
    ? '读取失败'
    : !media.data
      ? '正在读取…'
      : `${media.data.defaultVisibility === 'public' ? '默认公开' : '默认私有'} · ${version === 'original' ? '原图' : version === 'compressed' ? '压缩图' : version === 'watermark' ? '水印图' : '缩略图'}`;
  return (
    <Card className="min-w-0 gap-0 overflow-hidden rounded-[20px] border border-border bg-surface p-0 shadow-none">
      <div className="px-4 pt-4 pb-3 min-[1200px]:px-6">
        <h2 className="text-lg font-medium">关联设置</h2>
        <p className="mt-1 text-[13px] text-muted">
          各项独立管理，不随站点信息提交。
        </p>
      </div>
      <div className="divide-y divide-border border-t border-border">
        <RelatedSetting
          label="Logo 与 Favicon"
          value="独立更新"
          href="/settings/general/branding"
        />
        <div>
          <RelatedSetting
            label="默认存储"
            value={storageValue}
            href="/settings/storage"
          />
          {storageError ? (
            <div className="grid gap-2 px-4 pb-3 min-[1200px]:px-6">
              <p role="alert" className="text-sm text-danger wrap-anywhere">
                {storageError.message}
              </p>
              <Button
                type="button"
                variant="outline"
                isDisabled={storageSettings.isFetching || storages.isFetching}
                className="min-h-11 w-fit rounded-lg"
                onPress={() => {
                  void storageSettings.refetch();
                  void storages.refetch();
                }}
              >
                重新读取默认存储
              </Button>
            </div>
          ) : null}
        </div>
        <div>
          <RelatedSetting
            label="图片默认值与外链版本"
            value={mediaValue}
            href="/settings/processing"
          />
          {media.error ? (
            <div className="grid gap-2 px-4 pb-3 min-[1200px]:px-6">
              <p role="alert" className="text-sm text-danger wrap-anywhere">
                {media.error.message}
              </p>
              <Button
                type="button"
                variant="outline"
                isDisabled={media.isFetching}
                className="min-h-11 w-fit rounded-lg"
                onPress={() => void media.refetch()}
              >
                重新读取图片默认值
              </Button>
            </div>
          ) : null}
        </div>
        <RelatedSetting label="界面主题" value="后续独立设置" />
      </div>
    </Card>
  );
}
