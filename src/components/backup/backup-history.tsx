'use client';
import { Button } from '@heroui/react/button';
import { Archive, Download, Trash2 } from 'lucide-react';
import type { BackupJob } from '../../server/backup/types';
import { bytesLabel } from '../library/detail-labels';
import { isBackupActive } from './use-backups';

export function backupDate(value: number, timeZone: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(value);
}
const states: Record<BackupJob['status'], string> = {
  preparing: '正在准备',
  copying: '正在复制',
  finalizing: '正在收尾',
  ready: '已生成',
  failed: '未完成',
  interrupted: '已中断',
  cancelled: '已取消',
};
/** Native anchors keep encrypted file downloads out of the client-side router. */
export function BackupHistory({
  items,
  timeZone,
  busy,
  onDelete,
}: {
  items: BackupJob[];
  timeZone: string;
  busy: boolean;
  onDelete: (id: string) => void;
}) {
  return (
    <section aria-labelledby="backup-history-heading">
      <h3
        id="backup-history-heading"
        className="mb-4 flex items-center gap-2 text-base font-medium"
      >
        备份记录{' '}
        <span className="text-sm font-normal text-muted">
          本页 {items.length} 条
        </span>
      </h3>
      {!items.length ? (
        <div className="grid justify-items-center gap-3 rounded-2xl border border-dashed border-border py-9 text-muted">
          <Archive className="size-9" aria-hidden />
          <p className="text-sm">暂无备份</p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-surface px-4 sm:px-6">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4"
              data-testid="backup-history-item"
              data-job-id={item.id}
            >
              <Archive className="size-5 shrink-0" aria-hidden />
              <div className="min-w-0 flex-1 basis-40">
                <p className="text-sm font-medium">
                  {backupDate(item.createdAt, timeZone)} 的整站备份
                </p>
                <p className="mt-1 text-xs leading-5 text-muted">
                  {states[item.status]}
                  {item.fileBytes !== undefined
                    ? ` · ${bytesLabel(item.fileBytes)}`
                    : ''}
                  {item.summary
                    ? ` · ${item.summary.images.toLocaleString('zh-CN')} 张图片`
                    : ''}{' '}
                  · 密码保护
                </p>
              </div>
              <div className="flex shrink-0 gap-2 max-sm:ml-9">
                {item.status === 'ready' ? (
                  <a
                    href={`/api/backups/${encodeURIComponent(item.id)}/file`}
                    className="inline-flex h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm text-foreground no-underline"
                    aria-label={`下载备份，${backupDate(item.createdAt, timeZone)}`}
                  >
                    <Download className="size-4" aria-hidden />
                    下载
                  </a>
                ) : null}
                {!isBackupActive(item) ? (
                  <Button
                    variant="ghost"
                    isIconOnly
                    className="size-11 rounded-lg"
                    isDisabled={busy}
                    aria-label={`删除备份，${backupDate(item.createdAt, timeZone)}`}
                    onPress={() => onDelete(item.id)}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
