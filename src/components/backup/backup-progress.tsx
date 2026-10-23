'use client';
import { ProgressBar } from '@heroui/react/progress-bar';
import { Link } from '@heroui/react/link';
import { CircleCheck, CircleX, LoaderCircle } from 'lucide-react';
import type { BackupJob } from '../../server/backup/types';
import { bytesLabel } from '../library/detail-labels';
import { isBackupActive } from './use-backups';

export function BackupProgress({ job }: { job: BackupJob }) {
  const active = isBackupActive(job);
  const ready = job.status === 'ready';
  const preparing = job.status === 'preparing';
  const finalizing = job.status === 'finalizing';
  const percent =
    job.progress && job.progress.bytesTotal > 0
      ? Math.min(
          100,
          Math.floor((job.progress.bytesDone / job.progress.bytesTotal) * 100),
        )
      : 0;
  const title = ready
    ? '备份已生成'
    : job.status === 'cancelled'
      ? '备份已取消'
      : job.status === 'interrupted'
        ? '备份已中断'
        : preparing
          ? '正在准备备份'
          : finalizing
            ? '正在完成备份文件'
            : active
              ? '正在复制数据与图片'
              : '备份未完成';
  return (
    <section
      className="rounded-2xl border border-border bg-surface p-4 sm:p-6"
      data-testid="backup-task"
      data-job-id={job.id}
      data-state={job.status}
    >
      <div className="flex items-start gap-3">
        {ready ? (
          <CircleCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
        ) : active ? (
          <LoaderCircle
            className="mt-0.5 size-5 shrink-0 motion-safe:animate-spin"
            aria-hidden
          />
        ) : (
          <CircleX className="mt-0.5 size-5 shrink-0" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <h3
            id="backup-task-heading"
            tabIndex={-1}
            className="text-base font-medium outline-none"
            aria-live="polite"
          >
            {title}
          </h3>
          <p className="mt-2 text-sm leading-6 text-muted">
            {ready
              ? '修改操作已恢复。请下载备份，保存到这台服务器以外的位置。'
              : preparing
                ? '正在等待已开始的写入完成。你可以继续浏览图库。'
                : active
                  ? '关闭页面后任务仍会继续，可稍后回来查看进度。'
                  : '修改操作已恢复。本次没有生成完整备份，已有备份不受影响。'}
          </p>
        </div>
      </div>
      {active ? (
        <div className="mt-5 grid gap-3">
          <ProgressBar
            aria-label="整站备份进度"
            value={percent}
            isIndeterminate={
              preparing || finalizing || !job.progress?.bytesTotal
            }
          >
            {!preparing && !finalizing && job.progress?.bytesTotal ? (
              <ProgressBar.Output />
            ) : null}
            <ProgressBar.Track className="h-2 rounded-full">
              <ProgressBar.Fill className="rounded-full bg-accent" />
            </ProgressBar.Track>
          </ProgressBar>
          <div className="flex flex-wrap justify-between gap-2 text-xs text-muted">
            <span>
              {preparing
                ? '等待正在进行的写入'
                : finalizing
                  ? '正在检查并完成备份文件'
                  : '正在读取本地文件'}
            </span>
            {job.progress ? (
              <span>
                {bytesLabel(job.progress.bytesDone)} /{' '}
                {bytesLabel(job.progress.bytesTotal)}
              </span>
            ) : null}
          </div>
          <Link
            href="/library"
            className="mt-2 min-h-11 w-fit gap-2 text-sm text-foreground"
          >
            前往图库继续浏览 <span aria-hidden>→</span>
          </Link>
        </div>
      ) : null}
      {job.failure ? (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-danger/5 p-3 text-sm leading-6 text-danger wrap-anywhere"
        >
          {job.failure.message}
        </p>
      ) : null}
    </section>
  );
}
