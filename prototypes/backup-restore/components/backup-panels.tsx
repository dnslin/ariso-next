'use client';

import { Button } from '@heroui/react/button';
import { ProgressBar } from '@heroui/react/progress-bar';
import { Link } from '@heroui/react/link';
import {
  Archive,
  ArchiveRestore,
  Check,
  CircleCheck,
  CircleX,
  Cloud,
  Download,
  HardDrive,
  LoaderCircle,
  Trash2,
} from 'lucide-react';
import { StorageTip } from '../../../src/components/storage/storage-tip';
import { downloadDemoBackup, usePrototype } from './prototype-state';

export function backupDate(value: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(value);
}

export function BackupScope() {
  const storages = [
    { name: '本地图库', count: '248', size: '1.2 GB', local: true },
    { name: '旅行照片', count: '680', size: '4.8 GB', local: false },
    { name: '作品归档', count: '320', size: '2.6 GB', local: false },
  ];
  return (
    <section className="rounded-2xl border border-border bg-surface p-4 sm:p-6">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-base font-medium">备份内容</h3>
        <StorageTip label="备份范围">
          包含全部本地与 S3
          图片、已保存版本、回收站图片，以及账号、相册、标签、分享、设置和站点素材。
        </StorageTip>
      </div>
      <ul className="divide-y divide-border">
        {storages.map(({ name, count, size, local }) => (
          <li key={name} className="flex items-center gap-3 py-3">
            {local ? (
              <HardDrive className="size-5 shrink-0" aria-hidden />
            ) : (
              <Cloud className="size-5 shrink-0" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm">{name}</p>
              <p className="mt-1 text-xs text-muted">
                {local ? '本地存储' : 'S3 存储'} · {count} 张图片
              </p>
            </div>
            <span className="shrink-0 text-sm tabular-nums">{size}</span>
            <Check
              className="size-4 shrink-0 text-muted"
              aria-label="包含在备份中"
            />
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2 border-t border-border pt-4">
        <p className="text-sm">
          共 <strong className="font-medium">1,248</strong> 张图片
        </p>
        <p className="text-sm">
          约 <strong className="font-medium">8.6 GB</strong>
        </p>
      </div>
      <p className="mt-3 text-xs leading-5 text-muted">
        服务器可用空间 42.6 GB，预计需要 9.1 GB。实际大小以生成结果为准。
      </p>
    </section>
  );
}

export function BackupProgress() {
  const { backup } = usePrototype();
  const preparing = backup.status === 'preparing';
  const ready = backup.status === 'ready';
  const failed = backup.status === 'failed';
  return (
    <section
      aria-label="当前备份任务"
      className="rounded-2xl border border-border bg-surface p-4 sm:p-6"
      data-testid="backup-task"
      data-state={backup.status}
    >
      <div className="flex items-start gap-3">
        {ready ? (
          <CircleCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
        ) : failed ? (
          <CircleX className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
        ) : (
          <LoaderCircle
            className="mt-0.5 size-5 shrink-0 motion-safe:animate-spin"
            aria-hidden
          />
        )}
        <div className="min-w-0 flex-1">
          <h3
            id="backup-task-heading"
            tabIndex={-1}
            className="text-base font-medium outline-none"
            aria-live="polite"
          >
            {ready
              ? '备份已生成'
              : failed
                ? '备份未完成'
                : preparing
                  ? '正在准备备份'
                  : '正在复制数据与图片'}
          </h3>
          <p className="mt-2 text-sm leading-6 text-muted">
            {ready
              ? '修改操作已恢复。请下载备份，保存到这台服务器以外的位置。'
              : failed
                ? '修改操作已恢复。本次没有生成完整备份，已有备份不受影响。'
                : preparing
                  ? '正在等待已开始的写入完成。你可以继续浏览图库。'
                  : '页面关闭后任务仍会继续，可稍后回来查看进度。'}
          </p>
        </div>
      </div>
      {!ready && !failed ? (
        <div className="mt-5 grid gap-3">
          <ProgressBar
            aria-label="整站备份进度"
            value={backup.progress}
            isIndeterminate={preparing}
          >
            {!preparing ? <ProgressBar.Output /> : null}
            <ProgressBar.Track className="h-2 rounded-full">
              <ProgressBar.Fill className="rounded-full bg-accent" />
            </ProgressBar.Track>
          </ProgressBar>
          <div className="flex flex-wrap justify-between gap-2 text-xs text-muted">
            <span>
              {preparing
                ? '等待正在进行的写入'
                : backup.progress < 85
                  ? '正在读取本地与 S3 文件'
                  : '正在检查并完成备份文件'}
            </span>
            <span>完整备份 · 3 个存储</span>
          </div>
          <Link
            href="/library"
            className="mt-2 min-h-11 w-fit gap-2 text-sm text-foreground"
          >
            前往图库继续浏览 <span aria-hidden>→</span>
          </Link>
        </div>
      ) : null}
      {failed ? (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-danger/5 p-3 text-sm leading-6 text-danger wrap-anywhere"
        >
          {backup.error ?? '读取 S3 文件失败，请检查存储连接后重新备份。'}
        </p>
      ) : null}
    </section>
  );
}

export function BackupHistory({
  onDelete,
}: {
  onDelete: (id: string) => void;
}) {
  const { completedBackups } = usePrototype();
  return (
    <section aria-labelledby="backup-history-heading">
      <h3
        id="backup-history-heading"
        className="mb-4 flex items-center gap-2 text-base font-medium"
      >
        备份记录{' '}
        <span className="text-sm font-normal text-muted">
          {completedBackups.length}
        </span>
      </h3>
      {completedBackups.length === 0 ? (
        <div className="grid justify-items-center gap-3 rounded-2xl border border-dashed border-border py-9 text-muted">
          <Archive className="size-9" aria-hidden />
          <p className="text-sm">暂无备份</p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-surface px-4 sm:px-6">
          {completedBackups.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4"
              data-testid="backup-history-item"
            >
              <Archive className="size-5 shrink-0" aria-hidden />
              <div className="min-w-0 flex-1 basis-40">
                <p className="text-sm font-medium">
                  {backupDate(item.createdAt)} 的整站备份
                </p>
                <p className="mt-1 text-xs leading-5 text-muted">
                  {item.size} · {item.imageCount.toLocaleString('zh-CN')} 张图片
                  · 密码保护
                </p>
              </div>
              <div className="flex shrink-0 gap-2 max-sm:ml-9">
                <Button
                  variant="outline"
                  className="h-11 rounded-lg px-3 text-sm"
                  onPress={() => downloadDemoBackup()}
                  aria-label={`下载备份，${backupDate(item.createdAt)}`}
                >
                  <Download className="size-4" aria-hidden />
                  下载
                </Button>
                <Button
                  variant="ghost"
                  isIconOnly
                  className="size-11 rounded-lg"
                  aria-label={`删除备份，${backupDate(item.createdAt)}`}
                  onPress={() => onDelete(item.id)}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function BackupRestoreEntry() {
  return (
    <section className="flex items-start gap-3 border-t border-border pt-6">
      <ArchiveRestore className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0">
        <h3 className="text-base font-medium">在新实例恢复</h3>
        <p className="mt-2 text-sm leading-6 text-muted">
          在空白实例的初始化页面导入备份。已有站点不支持覆盖恢复。
        </p>
        <Link
          href="/setup"
          className="mt-2 min-h-11 gap-2 text-sm text-foreground"
        >
          查看恢复流程 <span aria-hidden>→</span>
        </Link>
      </div>
    </section>
  );
}
