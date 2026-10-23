'use client';
import { Button } from '@heroui/react/button';
import { ProgressBar } from '@heroui/react/progress-bar';
import {
  CircleAlert,
  CircleCheck,
  Clock3,
  LoaderCircle,
  RefreshCw,
} from 'lucide-react';
import type { RestoreJob } from '../../server/backup/types';
import { bytesLabel } from '../library/detail-labels';

export function RestoreOutcome({
  job,
  busy,
  onRetry,
  onCancel,
  onRefresh,
}: {
  job: RestoreJob;
  busy: boolean;
  onRetry: () => void;
  onCancel: () => void;
  onRefresh: () => void;
}) {
  if (job.cleanupPending)
    return (
      <div className="grid gap-5" data-testid="restore-cleanup-pending">
        <CircleAlert className="size-7 text-danger" aria-hidden />
        <h2 className="text-xl font-medium">恢复已停止或正在停止</h2>
        <p className="text-sm leading-6 text-muted">
          临时文件尚未清理完成。
          {job.targets?.some((target) => target.cleanupPending)
            ? '本次写入的 S3 文件也需要清理；目标位置与失败原因保留在下方。'
            : ''}
          请继续停止并清理，完成后才能重新导入备份。
        </p>
        {job.failure ? (
          <p
            role="alert"
            className="text-sm leading-6 text-danger wrap-anywhere"
          >
            {job.failure.message}
          </p>
        ) : null}
        <Button
          className="h-12 w-fit rounded-lg"
          isDisabled={busy}
          onPress={onCancel}
        >
          继续停止并清理
        </Button>
      </div>
    );
  if (job.status === 'ready' || job.status === 'activating')
    return (
      <div className="grid gap-5" data-testid="restore-ready">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-default">
          <Clock3 className="size-7" aria-hidden />
        </div>
        <div>
          <h2 className="text-xl font-medium">数据已恢复，等待重启</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            全部图片与配置已准备好。请重启新实例以启用恢复的数据，然后使用原账号登录。
          </p>
        </div>
        <div className="grid gap-3 rounded-xl border border-border p-4 text-sm">
          <p className="flex items-center gap-2">
            <CircleCheck className="size-4 shrink-0" aria-hidden />
            {job.summary?.images.toLocaleString('zh-CN')} 张图片与全部版本已恢复
          </p>
          <p className="flex items-center gap-2">
            <CircleCheck className="size-4 shrink-0" aria-hidden />
            账号、相册、标签及站点配置已恢复
          </p>
          <p className="flex items-center gap-2">
            <Clock3 className="size-4 shrink-0" aria-hidden />
            新站点尚未启用
          </p>
        </div>
        <p className="text-xs leading-relaxed text-muted">
          继续使用原域名时，请将域名指向新服务器。重启启用期间页面可能暂时无法访问；若未能启动，请查看新实例的部署日志。
        </p>
        <Button
          variant="outline"
          className="h-11 w-fit rounded-lg"
          isDisabled={busy}
          onPress={onRefresh}
        >
          <RefreshCw className="size-4" aria-hidden />
          检查启用状态
        </Button>
      </div>
    );
  const failed = job.status === 'failed' || job.status === 'interrupted';
  const decrypting = job.status === 'decrypting';
  const percent = job.progress?.bytesTotal
    ? Math.min(
        100,
        Math.floor((job.progress.bytesDone / job.progress.bytesTotal) * 100),
      )
    : 0;
  const checking =
    job.status === 'restoring' &&
    !!job.progress?.bytesTotal &&
    job.progress.bytesDone >= job.progress.bytesTotal;
  return (
    <div
      className="grid gap-6"
      data-testid="restore-outcome"
      data-state={job.status}
    >
      <div className="flex items-center gap-3">
        {failed ? (
          <CircleAlert className="size-6 text-danger" aria-hidden />
        ) : (
          <LoaderCircle
            className="size-6 motion-safe:animate-spin"
            aria-hidden
          />
        )}
        <div>
          <h2 className="text-xl font-medium">
            {failed
              ? job.status === 'interrupted'
                ? '恢复已中断'
                : '恢复未完成'
              : decrypting
                ? '正在解密并检查备份'
                : checking
                  ? '正在校验恢复结果'
                  : '正在恢复站点'}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {failed
              ? '新实例尚未启用，原站数据不受影响。'
              : '关闭页面后任务仍会继续，刷新后可重新输入初始化码查看。'}
          </p>
        </div>
      </div>
      {job.failure ? (
        <p role="alert" className="text-sm leading-6 text-danger wrap-anywhere">
          {job.failure.message}
        </p>
      ) : null}
      <ProgressBar
        aria-label={decrypting ? '解密检查进度' : '恢复进度'}
        value={percent}
        isIndeterminate={
          !failed && (decrypting || checking || !job.progress?.bytesTotal)
        }
      >
        {job.progress?.bytesTotal && !checking ? <ProgressBar.Output /> : null}
        <ProgressBar.Track className="h-2 rounded-full bg-default">
          <ProgressBar.Fill className="rounded-full bg-accent" />
        </ProgressBar.Track>
      </ProgressBar>
      <div className="flex flex-wrap justify-between gap-2 text-sm text-muted">
        <span>
          {job.progress
            ? `${bytesLabel(job.progress.bytesDone)} / ${bytesLabel(job.progress.bytesTotal)}`
            : decrypting
              ? '完整验证后才显示备份摘要'
              : '正在准备恢复数据'}
        </span>
        <span>新站点尚未启用</span>
      </div>
      <div className="rounded-xl border border-border p-4 text-sm leading-6">
        {decrypting
          ? '正在完整解密文件，并核对备份版本与数据库。'
          : checking
            ? '正在校验并准备启用数据，请等待。只有准备完成后，才可重启启用。'
            : job.summary?.storages.some((storage) => storage.type === 's3')
              ? '正在从备份恢复本地文件、站点素材和 S3 图片，完成后检查数据完整性。'
              : '正在复制本地图片与站点素材，完成后检查数据完整性。'}
      </div>
      {failed && job.targets?.length ? (
        <p className="text-xs leading-6 text-muted">
          重试会继续使用已确认的 S3
          恢复位置。需要更换位置时，请先放弃本次恢复并完成清理。
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {failed ? (
          <Button
            className="h-12 rounded-lg"
            isDisabled={busy}
            onPress={onRetry}
          >
            重试恢复
          </Button>
        ) : null}
        <Button
          variant="outline"
          className="h-12 rounded-lg"
          isDisabled={busy}
          onPress={onCancel}
        >
          {failed ? '放弃本次恢复' : '停止恢复'}
        </Button>
      </div>
    </div>
  );
}
