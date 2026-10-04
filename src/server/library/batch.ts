import { setImmediate } from 'node:timers/promises';
import { and, eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { z } from 'zod';
import { CollectionError } from '../collections/errors.ts';
import {
  addMemberships,
  readMemberships,
  removeMemberships,
} from '../collections/memberships.ts';
import {
  MediaImageFieldsError,
  updateImageFields,
} from '../media/image-fields.ts';
import { MediaCleanupError } from '../media/cleanup.ts';
import { readGeneratedMediaVersions } from '../media/objects.ts';
import { MediaReprocessError, requestReprocess } from '../media/reprocess.ts';
import { mediaImages, mediaJobs } from '../media/schema.ts';
import { MediaTrashError, restoreImage, trashImage } from '../media/trash.ts';
import type {
  BatchCommand,
  BatchItemResult,
  LibraryBatchResponse,
} from './batch-types.ts';
import { cleanupBatchResult } from './batch-cleanup.ts';
import {
  assertLibraryReferences,
  libraryPredicate,
} from './query-predicate.ts';
import {
  LibraryQueryError,
  parseLibraryQuery,
  type LibraryFilters,
} from './query-schema.ts';

const targetIds = z
  .array(z.string().min(1))
  .min(1)
  .transform((ids) => [...new Set(ids)]);
export const batchCommandSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('add-albums'), albumIds: targetIds }),
  z.strictObject({ type: z.literal('remove-albums'), albumIds: targetIds }),
  z.strictObject({ type: z.literal('add-tags'), tagIds: targetIds }),
  z.strictObject({ type: z.literal('remove-tags'), tagIds: targetIds }),
  z.strictObject({
    type: z.literal('visibility'),
    visibility: z.enum(['public', 'private']),
  }),
  z.strictObject({ type: z.literal('trash') }),
  z.strictObject({ type: z.literal('restore') }),
  z.strictObject({ type: z.literal('delete-permanent') }),
  z.strictObject({
    type: z.literal('retry-cleanup'),
    attempts: z.record(
      z.string().min(1),
      z.strictObject({
        taskId: z.string().min(1),
        cycle: z.number().int().positive(),
      }),
    ),
  }),
  z.strictObject({
    type: z.literal('reprocess'),
    scope: z.enum(['all', 'compressed', 'thumbnail', 'watermark']),
    taskIds: z.record(z.string().min(1), z.uuid()),
  }),
]);
export const libraryBatchSchema = z.strictObject({
  ids: z
    .array(z.string().min(1))
    .min(1)
    .max(200)
    .transform((ids) => [...new Set(ids)]),
  query: z.string(),
  command: batchCommandSchema,
  mode: z.enum(['apply', 'check']),
});

export function parseLibraryBatch(input: unknown) {
  const parsed = libraryBatchSchema.safeParse(input);
  if (!parsed.success)
    throw new LibraryQueryError(
      parsed.error.issues.map((issue) => issue.message).join('；'),
      'LIBRARY_INVALID_BATCH',
    );
  if (parsed.data.command.type === 'reprocess') {
    const { taskIds } = parsed.data.command;
    if (
      Object.keys(taskIds).length !== parsed.data.ids.length ||
      parsed.data.ids.some((id) => !Object.hasOwn(taskIds, id)) ||
      new Set(Object.values(taskIds)).size !== parsed.data.ids.length
    )
      throw new LibraryQueryError(
        '每张选中图片必须对应一个独立的本次任务 ID',
        'LIBRARY_INVALID_BATCH',
      );
  }
  if (parsed.data.command.type === 'retry-cleanup') {
    const { attempts } = parsed.data.command;
    if (
      Object.keys(attempts).length !== parsed.data.ids.length ||
      parsed.data.ids.some((id) => !Object.hasOwn(attempts, id))
    )
      throw new LibraryQueryError(
        '每张选中图片必须携带提交前的清理任务 ID 和周期',
        'LIBRARY_INVALID_BATCH',
      );
  }
  const query = parseLibraryQuery(new URLSearchParams(parsed.data.query));
  if (query.page !== null || query.cursor !== null)
    throw new LibraryQueryError(
      '批量操作仅接受筛选条件，不接受页码或游标',
      'LIBRARY_INVALID_BATCH',
    );
  if (
    (parsed.data.command.type === 'restore' ||
      parsed.data.command.type === 'delete-permanent' ||
      parsed.data.command.type === 'retry-cleanup') !==
    (query.filters.scope === 'trash')
  )
    throw new LibraryQueryError(
      '恢复、永久删除和重试清理仅用于回收站；其他操作仅用于正常图库或相册',
      'LIBRARY_INVALID_BATCH',
    );
  return { ...parsed.data, filters: query.filters };
}

function inQuery(
  db: BetterSQLite3Database,
  id: string,
  filters: LibraryFilters,
) {
  return Boolean(
    db
      .select({ id: mediaImages.id })
      .from(mediaImages)
      .where(and(eq(mediaImages.id, id), libraryPredicate(db, filters)))
      .get(),
  );
}

function applyCommand(
  db: Parameters<typeof updateImageFields>[0],
  id: string,
  command: Exclude<
    BatchCommand,
    { type: 'reprocess' | 'delete-permanent' | 'retry-cleanup' }
  >,
) {
  if (command.type === 'visibility')
    return updateImageFields(db, id, { visibility: command.visibility })
      .changed;
  if (command.type === 'trash' || command.type === 'restore') {
    const before = db
      .select({ trashedAt: mediaImages.trashedAt })
      .from(mediaImages)
      .where(eq(mediaImages.id, id))
      .get()!;
    const result =
      command.type === 'trash' ? trashImage(db, id) : restoreImage(db, id);
    return (before.trashedAt !== null) !== (result.trashedAt !== null);
  }
  const selection = {
    albumIds: 'albumIds' in command ? command.albumIds : [],
    tagIds: 'tagIds' in command ? command.tagIds : [],
  };
  const result = (
    command.type.startsWith('add-') ? addMemberships : removeMemberships
  )(db, [id], selection)[0];
  if (result.status === 'error') throw result.cause;
  return [...result.albums, ...result.tags].some(
    (target) => target.status === 'added' || target.status === 'removed',
  );
}

function checkCommand(
  db: BetterSQLite3Database,
  id: string,
  command: Exclude<
    BatchCommand,
    { type: 'reprocess' | 'delete-permanent' | 'retry-cleanup' }
  >,
) {
  const image = db
    .select()
    .from(mediaImages)
    .where(eq(mediaImages.id, id))
    .get()!;
  if (image.deletionStatus !== null)
    throw new MediaTrashError(
      'MEDIA_DELETION_STARTED',
      409,
      `图片已开始永久删除，不能核对为成功：${id}`,
    );
  if (command.type === 'visibility')
    return image.visibility === command.visibility;
  if (command.type === 'trash') return image.trashedAt !== null;
  if (command.type === 'restore') return image.trashedAt === null;
  const selection = {
    albumIds: 'albumIds' in command ? command.albumIds : [],
    tagIds: 'tagIds' in command ? command.tagIds : [],
  };
  const current = readMemberships(db, id, selection);
  const present = [...current.albums, ...current.tags];
  return command.type.startsWith('add-')
    ? present.every((target) => target.present)
    : present.every((target) => !target.present);
}

function reprocessResult(
  db: BetterSQLite3Database,
  id: string,
  command: Extract<BatchCommand, { type: 'reprocess' }>,
  mode: 'apply' | 'check',
  inQuery: boolean,
): BatchItemResult {
  const taskId = command.taskIds[id];
  let task = db.select().from(mediaJobs).where(eq(mediaJobs.id, taskId)).get();
  if (
    task &&
    (task.imageId !== id ||
      task.kind !== 'process' ||
      task.scope !== command.scope)
  )
    throw new MediaReprocessError(
      'MEDIA_REPROCESS_TASK_CONFLICT',
      409,
      '本次任务 ID 已用于其他图片或处理范围',
    );
  if (!task && mode === 'apply') {
    requestReprocess(db, id, { scope: command.scope }, taskId);
    task = db.select().from(mediaJobs).where(eq(mediaJobs.id, taskId)).get()!;
  }
  if (!task)
    return {
      id,
      status: 'unknown',
      code: 'LIBRARY_BATCH_TASK_UNCONFIRMED',
      message: '尚未查到本次任务，请稍后继续核对；不要重复提交',
      inQuery,
    };
  return {
    id,
    status: 'accepted',
    message: '本次重处理任务已受理，可查看任务处理结果',
    inQuery,
    taskId,
    task: {
      id: task.id,
      status: task.status,
      scope: task.scope,
      step: task.step,
      error: task.error,
      expectedVersions: task.expectedVersions,
      generatedVersions: readGeneratedMediaVersions(db, [task]).get(task.id)!,
    },
  };
}

/** Each explicit image commits independently. check only observes the desired state.
 * The original query does not gate check: applying a command may have moved the image out.
 */
export async function runLibraryBatch(
  db: BetterSQLite3Database,
  request: ReturnType<typeof parseLibraryBatch>,
  onFailure: (error: unknown, imageId: string) => void,
): Promise<LibraryBatchResponse> {
  const { ids, filters, command, mode } = request;
  const results: BatchItemResult[] = [];
  for (const id of ids) {
    results.push(
      db.transaction(
        (tx) => {
          const currentInQuery = inQuery(tx, id, filters);
          try {
            // A savepoint rolls the entire image back even if reading its result fails.
            return tx.transaction((operation) => {
              if (
                !operation
                  .select({ id: mediaImages.id })
                  .from(mediaImages)
                  .where(eq(mediaImages.id, id))
                  .get() &&
                !(
                  mode === 'check' &&
                  (command.type === 'delete-permanent' ||
                    command.type === 'retry-cleanup')
                )
              )
                throw new MediaTrashError(
                  'MEDIA_IMAGE_NOT_FOUND',
                  404,
                  `图片不存在：${id}`,
                );
              if (mode === 'apply') {
                assertLibraryReferences(operation, filters);
                if (!currentInQuery)
                  throw new LibraryQueryError(
                    '图片已不属于本次查询，请刷新后重新选择',
                    'LIBRARY_IMAGE_OUTSIDE_QUERY',
                    409,
                  );
              }
              if (
                command.type === 'delete-permanent' ||
                command.type === 'retry-cleanup'
              )
                return {
                  ...cleanupBatchResult(
                    operation,
                    id,
                    command,
                    mode,
                    currentInQuery,
                  ),
                  inQuery:
                    mode === 'apply'
                      ? inQuery(operation, id, filters)
                      : currentInQuery,
                };
              if (mode === 'apply') {
                if (command.type === 'reprocess')
                  return reprocessResult(
                    operation,
                    id,
                    command,
                    mode,
                    currentInQuery,
                  );
                const changed = applyCommand(operation, id, command);
                return {
                  id,
                  status: changed
                    ? ('changed' as const)
                    : ('unchanged' as const),
                  message: changed ? '操作已完成' : '已是目标状态，无需更改',
                  inQuery: inQuery(operation, id, filters),
                };
              }
              if (command.type === 'reprocess')
                return reprocessResult(
                  operation,
                  id,
                  command,
                  mode,
                  currentInQuery,
                );
              const confirmed = checkCommand(operation, id, command);
              return {
                id,
                status: confirmed
                  ? ('unchanged' as const)
                  : ('failed' as const),
                message: confirmed
                  ? '核对成功，当前已是目标状态'
                  : '核对发现操作尚未完成，可重新执行',
                ...(confirmed ? {} : { code: 'LIBRARY_BATCH_NOT_APPLIED' }),
                inQuery: currentInQuery,
              };
            });
          } catch (error) {
            const expected =
              error instanceof CollectionError ||
              error instanceof MediaImageFieldsError ||
              error instanceof MediaTrashError ||
              error instanceof MediaReprocessError ||
              error instanceof MediaCleanupError ||
              error instanceof LibraryQueryError;
            if (!expected) onFailure(error, id);
            return {
              id,
              status: 'failed' as const,
              code: expected ? error.code : 'INTERNAL_SERVER_ERROR',
              message: expected ? error.message : '图片操作失败，请重试',
              inQuery: currentInQuery,
            };
          }
        },
        { behavior: mode === 'apply' ? 'immediate' : 'deferred' },
      ),
    );
    if (results.length < ids.length) await setImmediate();
  }
  return { results };
}
