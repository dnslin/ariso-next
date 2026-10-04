'use client';

import type { ComponentProps } from 'react';
import { Button } from '@heroui/react/button';
import { Link } from '@heroui/react/link';
import { HardDrive } from 'lucide-react';
import { OwnerShell } from '../shell/owner-shell';
import { CorsRows } from './cors-report';
import type { StorageSummary } from './storage-api';

const actionClass =
  'flex h-12 min-w-0 flex-1 items-center justify-center rounded-lg px-2 text-sm font-normal no-underline min-[1200px]:w-50 min-[1200px]:flex-none';

export function StorageUnavailableView({
  shell,
  storages,
  defaultStorageId,
  onReturn,
}: {
  shell: Omit<ComponentProps<typeof OwnerShell>, 'children' | 'footer'>;
  storages: StorageSummary[];
  defaultStorageId: string | null;
  onReturn: () => void;
}) {
  const empty = storages.length === 0;
  const nameCounts = new Map<string, number>();
  for (const storage of storages)
    nameCounts.set(storage.name, (nameCounts.get(storage.name) ?? 0) + 1);
  const footer = empty ? undefined : storages.length <= 2 ? (
    storages.map((storage, index) => (
      <Link
        key={storage.id}
        href={`/settings/storage/${encodeURIComponent(storage.id)}`}
        className={`${actionClass} ${index === storages.length - 1 ? 'bg-accent text-accent-foreground' : 'border border-border bg-background text-foreground'}`}
      >
        管理{storage.name}
      </Link>
    ))
  ) : (
    <>
      <Button variant="outline" className={actionClass} onPress={onReturn}>
        返回存储列表
      </Button>
      <Link
        data-testid="storage-create"
        href="/settings/storage/new"
        className={`${actionClass} bg-accent text-accent-foreground`}
      >
        添加存储
      </Link>
    </>
  );
  return (
    <OwnerShell {...shell} footer={footer}>
      <section
        data-testid="storage-list"
        data-state={empty ? 'empty' : 'ready'}
        className="grid gap-5 pb-10 [overflow-wrap:anywhere]"
      >
        {empty ? (
          <div className="flex min-h-[calc(100dvh-160px)] flex-col items-center justify-center gap-5 text-center">
            <HardDrive size={48} aria-hidden className="text-muted" />
            <h1 className="text-[28px] font-medium leading-normal min-[1200px]:text-[30px]">
              还没有存储
            </h1>
            <p className="text-[13px] leading-normal">所有存储配置均已删除</p>
            <p className="max-w-120 rounded-lg bg-default p-3 text-[13px] leading-normal">
              没有可用存储，请先创建存储。系统不会在重启后重新创建已删除的默认配置。
            </p>
            <div className="flex w-full max-w-120 flex-wrap justify-center gap-3">
              <Link
                href="/settings/storage/new?type=local"
                className="flex min-h-12 min-w-0 flex-1 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm text-foreground no-underline"
              >
                添加本地存储
              </Link>
              <Link
                data-testid="storage-create"
                href="/settings/storage/new?type=s3"
                className="flex min-h-12 min-w-0 flex-1 items-center justify-center rounded-lg bg-accent px-4 text-sm text-accent-foreground no-underline"
              >
                添加 S3 存储
              </Link>
            </div>
          </div>
        ) : (
          <>
            <Button
              variant="ghost"
              className="-my-[13px] min-h-11 w-fit justify-start rounded-none p-0 text-xs font-normal leading-normal text-muted"
              onPress={onReturn}
            >
              ← 返回存储管理
            </Button>
            <h1 className="text-[28px] font-medium leading-normal min-[1200px]:text-[30px]">
              所有存储均已停用
            </h1>
            <p className="min-h-[22px] text-[13px] leading-normal">
              没有可用存储，请先启用或创建存储
            </p>
            <p className="rounded-lg bg-default p-3 text-[13px] leading-normal">
              Web 上传入口不可开始上传；API
              指定停用存储会返回明确错误。图片记录仍可管理。
            </p>
            <CorsRows
              rows={storages.map((storage) => ({
                label:
                  nameCounts.get(storage.name) === 1
                    ? storage.name
                    : `${storage.name} · ${storage.id}`,
                value:
                  storage.id === defaultStorageId ? '默认 · 已停用' : '已停用',
                detail:
                  storage.id === defaultStorageId
                    ? '不会自动切换默认'
                    : storage.type === 'local'
                      ? '目录和记录保留'
                      : '配置和记录保留',
              }))}
            />
          </>
        )}
      </section>
    </OwnerShell>
  );
}
