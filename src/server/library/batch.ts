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
import { mediaImages } from '../media/schema.ts';
import { MediaTrashError, restoreImage, trashImage } from '../media/trash.ts';
import type {
  BatchCommand,
  BatchItemResult,
  LibraryBatchResponse,
} from './batch-types.ts';
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
  const query = parseLibraryQuery(new URLSearchParams(parsed.data.query));
  if (query.page !== null || query.cursor !== null)
    throw new LibraryQueryError(
      '批量操作仅接受筛选条件，不接受页码或游标',
      'LIBRARY_INVALID_BATCH',
    );
  if (
    (parsed.data.command.type === 'restore') !==
    (query.filters.scope === 'trash')
  )
    throw new LibraryQueryError(
      '恢复仅用于回收站；相册、标签、可见性和回收操作仅用于正常图库或相册',
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
  command: BatchCommand,
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
  command: BatchCommand,
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
                  .get()
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
