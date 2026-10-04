import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import {
  MediaCleanupError,
  readMediaCleanup,
  requestPermanentDelete,
  retryMediaCleanup,
} from '../media/cleanup.ts';
import { mediaCleanupJobs } from '../media/schema.ts';
import type {
  BatchItemResult,
  CleanupCommand,
  LibraryCleanupTask,
} from './batch-types.ts';

function serializeCleanup(
  cleanup: ReturnType<typeof readMediaCleanup>,
): LibraryCleanupTask {
  return {
    ...cleanup,
    finishedAt: cleanup.finishedAt?.toISOString() ?? null,
    remaining: cleanup.remaining.map((object) => ({
      ...object,
      nextAttemptAt: object.nextAttemptAt?.toISOString() ?? null,
    })),
  };
}

/** Observe durable cleanup facts, including a successful job after its image is gone. */
export function cleanupBatchResult(
  db: BetterSQLite3Database,
  id: string,
  command: CleanupCommand,
  mode: 'apply' | 'check',
  inQuery: boolean,
): BatchItemResult {
  const existing = db
    .select()
    .from(mediaCleanupJobs)
    .where(eq(mediaCleanupJobs.imageId, id))
    .get();
  if (mode === 'check' && !existing)
    return {
      id,
      status: 'unknown',
      code: 'LIBRARY_BATCH_TASK_UNCONFIRMED',
      message: '尚未查到永久删除任务，请稍后继续核对；不要重复提交',
      inQuery,
    };
  if (command.type === 'retry-cleanup') {
    if (!existing)
      throw new MediaCleanupError(
        'MEDIA_CLEANUP_NOT_FOUND',
        404,
        '永久删除任务不存在',
      );
    const attempt = command.attempts[id];
    if (existing.id !== attempt.taskId)
      throw new MediaCleanupError(
        'MEDIA_CLEANUP_TASK_CONFLICT',
        409,
        '清理任务 ID 已变化，请重新读取任务',
      );
    if (existing.cycle < attempt.cycle || existing.cycle > attempt.cycle + 1)
      throw new MediaCleanupError(
        'MEDIA_CLEANUP_CYCLE_CHANGED',
        409,
        '清理周期已变化，不能确认本次重试，请重新读取任务',
      );
    if (existing.cycle === attempt.cycle) {
      if (mode === 'check')
        return {
          id,
          status: 'unknown',
          code: 'LIBRARY_BATCH_TASK_UNCONFIRMED',
          message: '清理任务仍处于提交前的周期，本次重试尚未核实；不要重复提交',
          inQuery,
        };
      if (existing.status !== 'failed')
        throw new MediaCleanupError(
          'MEDIA_CLEANUP_NOT_FAILED',
          409,
          '只有失败的清理周期可以手动重试',
        );
    }
  }
  const alreadyRequested = Boolean(
    existing &&
    (command.type === 'delete-permanent' ||
      existing.cycle === command.attempts[id].cycle + 1),
  );
  const cleanup = serializeCleanup(
    mode === 'check' || alreadyRequested
      ? readMediaCleanup(db, id)
      : command.type === 'retry-cleanup'
        ? retryMediaCleanup(db, id)
        : requestPermanentDelete(db, id),
  );
  return {
    id,
    status: mode === 'apply' && alreadyRequested ? 'unchanged' : 'accepted',
    ...(mode === 'apply' && alreadyRequested
      ? { code: 'MEDIA_CLEANUP_ALREADY_REQUESTED' }
      : {}),
    message:
      mode === 'check'
        ? '已核对本次清理任务，请查看实际执行结果'
        : alreadyRequested
          ? '清理任务已存在，请查看实际执行结果'
          : '清理任务已受理，全部对象清完后才会移除记录',
    inQuery,
    taskId: cleanup.jobId,
    cleanup,
  };
}
