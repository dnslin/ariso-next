import { Button } from '@heroui/react/button';
import { Chip } from '@heroui/react/chip';
import { ImageOff } from 'lucide-react';
import { bytesLabel, versionLabels } from './detail-labels';
import type { TrashBatchRow } from './trash-batch-state';
import type { TrashBatch } from './use-trash-batch';
import type { BatchSnapshotItem } from './use-library-batch';
import { BatchThumbnail } from './batch-targets';

export function trashRowStatus(row: TrashBatchRow) {
  if (row.state === 'task') {
    switch (row.result.cleanup.status) {
      case 'succeeded':
        return { label: '已清理', color: 'success' } as const;
      case 'failed':
        return { label: '清理失败', color: 'danger' } as const;
      case 'queued':
        return {
          label: row.result.cleanup.waitingForWrites
            ? '等待写入结束'
            : '排队中',
          color: 'default',
        } as const;
      case 'running':
        return { label: '清理中', color: 'accent' } as const;
    }
  }
  switch (row.state) {
    case 'rejected':
      return { label: '未受理', color: 'danger' } as const;
    case 'unknown':
      return { label: '待核对', color: 'warning' } as const;
    case 'waiting':
      return { label: '提交中', color: 'default' } as const;
    default:
      return { label: '未提交', color: 'default' } as const;
  }
}

export function TrashBatchRowStatus({ row }: { row: TrashBatchRow }) {
  const status = trashRowStatus(row);
  return (
    <Chip
      size="sm"
      variant="soft"
      color={status.color}
      className="shrink-0 whitespace-nowrap font-normal"
      data-testid="trash-batch-item-status"
    >
      <Chip.Label>{status.label}</Chip.Label>
    </Chip>
  );
}

export function TrashBatchFileIcon({
  row,
  item,
}: {
  row: TrashBatchRow;
  item: BatchSnapshotItem;
}) {
  const readable =
    item.storage.enabled &&
    (row.state === 'unsent' ||
      (row.state === 'rejected' && row.result.inQuery));
  return readable && item.thumbnailUrl ? (
    <BatchThumbnail
      key={item.thumbnailUrl}
      url={item.thumbnailUrl}
      className="size-10 rounded-md"
    />
  ) : (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-default text-foreground">
      <ImageOff
        size={20}
        aria-label={
          row.state === 'task'
            ? '永久删除任务已受理，不能预览'
            : row.state === 'unknown'
              ? '结果待核对，不能预览'
              : !item.storage.enabled
                ? '存储已停用'
                : '暂无可读缩略图'
        }
      />
    </span>
  );
}

export function TrashBatchRowDetails({
  row,
  batch,
}: {
  row: TrashBatchRow;
  batch: TrashBatch;
}) {
  const task = row.result?.cleanup;
  const rejected = row.state === 'rejected';
  const unknown = row.state === 'unknown';
  const unsent = row.state === 'unsent';
  const canRetry = batch.failedIds.includes(row.id);
  const canRetryTask = batch.failedTaskIds.includes(row.id);
  const retry = task?.status === 'failed';
  const action = unknown
    ? '核对结果'
    : unsent
      ? '继续提交'
      : rejected
        ? '重新提交'
        : retry
          ? '重试剩余对象'
          : '';
  const error = task?.error || (rejected ? row.result?.message : null);
  const disabledReason =
    !unknown && action
      ? batch.unresolved
        ? '请先核对未决结果。'
        : rejected && !canRetry
          ? '已离开本次查询，不能重新提交。'
          : retry && !canRetryTask
            ? '已离开本次查询，不能重试清理。'
            : ''
      : '';
  const progress =
    task?.deletedObjects != null && task.totalObjects != null
      ? `已清理 ${task.deletedObjects} / ${task.totalObjects} 个对象`
      : task
        ? '清理数量待核对'
        : '';
  return (
    <div
      data-testid="trash-batch-item-details"
      className="grid min-w-0 gap-3 text-[13px] leading-normal [overflow-wrap:anywhere]"
    >
      {error ? (
        <p className="whitespace-pre-wrap text-[#9e3542] dark:text-[#ff858a]">
          {error}
          {rejected && row.result?.code ? ` · ${row.result.code}` : ''}
        </p>
      ) : (
        <p>
          {task?.status === 'succeeded'
            ? '已全部清理，记录已移除。'
            : task?.waitingForWrites
              ? '等待活动写入结束。'
              : progress ||
                row.result?.message ||
                (unknown
                  ? '未收到结果，请核对原任务。'
                  : unsent
                    ? '尚未发送。'
                    : '正在提交。')}
        </p>
      )}
      {task ? (
        <dl className="grid gap-2">
          <div className="grid grid-cols-[60px_minmax(0,1fr)] gap-2">
            <dt className="text-muted">任务</dt>
            <dd>{task.jobId}</dd>
          </div>
          <div className="grid grid-cols-[60px_minmax(0,1fr)] gap-2">
            <dt className="text-muted">周期</dt>
            <dd>{task.cycle}</dd>
          </div>
          {task.deletedPurposes?.length ? (
            <div className="grid grid-cols-[60px_minmax(0,1fr)] gap-2">
              <dt className="text-muted">已清理</dt>
              <dd>
                {task.deletedPurposes
                  .map((purpose) =>
                    purpose === 'temporary'
                      ? '候选文件'
                      : versionLabels[purpose],
                  )
                  .join('、')}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      {task?.remaining.length ? (
        <div className="grid gap-3" data-testid="trash-batch-item-objects">
          <p className="text-muted">剩余对象 · {task.remaining.length}个</p>
          {task.remaining.map((object) => (
            <div key={object.objectId} className="grid gap-1">
              <p>
                {object.purpose === 'temporary'
                  ? '候选文件'
                  : versionLabels[object.purpose]}{' '}
                ·{' '}
                {object.byteSize === null
                  ? '大小待核对'
                  : bytesLabel(object.byteSize)}
              </p>
              <p>{object.key}</p>
              {object.error ? (
                <p className="whitespace-pre-wrap text-[#9e3542] dark:text-[#ff858a]">
                  {object.error}
                </p>
              ) : null}
              <p className="text-muted">
                本轮尝试 {object.attempts} 次
                {object.nextAttemptAt
                  ? ` · 下次尝试 ${new Date(object.nextAttemptAt).toLocaleString('zh-CN')}`
                  : ''}
              </p>
            </div>
          ))}
        </div>
      ) : null}
      {action ? (
        <div className="grid justify-items-start gap-2">
          <Button
            size="sm"
            variant="outline"
            className="min-h-11 rounded-full font-normal"
            data-testid={
              unknown
                ? 'trash-batch-item-check'
                : retry
                  ? 'trash-batch-item-retry-cleanup'
                  : 'trash-batch-item-retry'
            }
            data-image-id={row.id}
            isDisabled={batch.pending || !!disabledReason}
            onPress={() => {
              if (unknown) batch.checkItem(row.id);
              else if (retry) batch.retryTask(row.id);
              else batch.retryItem(row.id);
            }}
          >
            {action}
          </Button>
          {disabledReason ? (
            <p className="text-xs text-muted">{disabledReason}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
