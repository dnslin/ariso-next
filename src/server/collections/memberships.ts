import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { z } from 'zod';
import { mediaImages } from '../media/schema.ts';
import { CollectionError } from './errors.ts';
import { getOrCreateTags } from './records.ts';
import { albums, albumImages, tags, imageTags } from './schema.ts';
import type { CollectionsTransaction, CollectionSelection } from './types.ts';

const ids = z.array(z.string().min(1)).default([]);
const selectionInput = z.object({
  albumIds: ids,
  tagIds: ids,
  tagNames: z.array(z.string()).default([]),
});
export type UploadSelectionInput = z.input<typeof selectionInput>;

function assertTargets(
  tx: CollectionsTransaction,
  selection: CollectionSelection,
  code: 'COLLECTION_TARGET_NOT_FOUND' | 'COLLECTION_TARGET_REMOVED',
) {
  for (const [table, values] of [
    [albums, selection.albumIds],
    [tags, selection.tagIds],
  ] as const) {
    const wanted = [...new Set(values)];
    if (!wanted.length) continue;
    const found = new Set(
      tx
        .select({ id: table.id })
        .from(table)
        .where(inArray(table.id, wanted))
        .all()
        .map((row) => row.id),
    );
    const missing = wanted.filter((id) => !found.has(id));
    if (missing.length)
      throw new CollectionError(code, `目标不存在: ${missing.join(', ')}`);
  }
}

/** Caller owns an IMMEDIATE transaction; a failed preparation must roll it back.
 * Successfully created empty records intentionally survive later upload cancellation.
 */
export function prepareUploadSelection(
  tx: CollectionsTransaction,
  input: UploadSelectionInput,
) {
  const parsed = selectionInput.safeParse(input);
  if (!parsed.success)
    throw new CollectionError('COLLECTION_INVALID_INPUT', parsed.error.message);
  const selection = {
    albumIds: [...new Set(parsed.data.albumIds)],
    tagIds: [...new Set(parsed.data.tagIds)],
  };
  assertTargets(tx, selection, 'COLLECTION_TARGET_NOT_FOUND');
  const created = getOrCreateTags(tx, parsed.data.tagNames);
  return Object.freeze({
    albumIds: Object.freeze(selection.albumIds),
    tagIds: Object.freeze([
      ...new Set([...selection.tagIds, ...created.map((tag) => tag.id)]),
    ]),
  });
}

function assertEditableImage(tx: CollectionsTransaction, imageId: string) {
  const image = tx
    .select({ id: mediaImages.id })
    .from(mediaImages)
    .where(
      and(
        eq(mediaImages.id, imageId),
        isNull(mediaImages.trashedAt),
        isNull(mediaImages.deletionStatus),
      ),
    )
    .get();
  if (!image)
    throw new CollectionError(
      'COLLECTION_IMAGE_UNAVAILABLE',
      `图片不存在、已回收或开始永久删除: ${imageId}`,
    );
}

function insertMemberships(
  tx: CollectionsTransaction,
  imageId: string,
  selection: CollectionSelection,
) {
  const joinedAt = new Date();
  const albumResults = [...new Set(selection.albumIds)].map((albumId) => ({
    id: albumId,
    status: tx
      .insert(albumImages)
      .values({ albumId, imageId, joinedAt })
      .onConflictDoNothing({
        target: [albumImages.albumId, albumImages.imageId],
      })
      .run().changes
      ? ('added' as const)
      : ('existing' as const),
  }));
  const tagResults = [...new Set(selection.tagIds)].map((tagId) => ({
    id: tagId,
    status: tx
      .insert(imageTags)
      .values({ imageId, tagId })
      .onConflictDoNothing({ target: [imageTags.imageId, imageTags.tagId] })
      .run().changes
      ? ('added' as const)
      : ('existing' as const),
  }));
  return { albums: albumResults, tags: tagResults };
}

/** Call after acceptOriginal inside the SAME synchronous acceptance transaction.
 * Propagate failures out of that transaction so image/object/job/relations roll back.
 * No file I/O, await, name resolution or independent commit is performed here.
 */
export function attachAcceptedImage(
  tx: CollectionsTransaction,
  imageId: string,
  selection: CollectionSelection,
) {
  assertTargets(tx, selection, 'COLLECTION_TARGET_REMOVED');
  assertEditableImage(tx, imageId);
  return insertMemberships(tx, imageId, selection);
}

function perImage<T>(
  db: BetterSQLite3Database,
  imageIds: readonly string[],
  operation: (tx: CollectionsTransaction, imageId: string) => T,
) {
  return [...new Set(imageIds)].map((imageId) => {
    try {
      const result = db.transaction((tx) => operation(tx, imageId), {
        behavior: 'immediate',
      });
      return { imageId, status: 'success' as const, ...result };
    } catch (error) {
      // Preserve each committed result even when another image hits a DB fault.
      // The caller receives the original cause for logging and HTTP error mapping.
      return {
        imageId,
        status: 'error' as const,
        code:
          error instanceof CollectionError
            ? error.code
            : ('COLLECTION_DATABASE_ERROR' as const),
        message: error instanceof Error ? error.message : String(error),
        cause: error,
      };
    }
  });
}

/** Explicit image IDs only. Each image succeeds or rolls back independently. */
export function addMemberships(
  db: BetterSQLite3Database,
  imageIds: readonly string[],
  selection: CollectionSelection,
) {
  return perImage(db, imageIds, (tx, imageId) => {
    assertTargets(tx, selection, 'COLLECTION_TARGET_NOT_FOUND');
    assertEditableImage(tx, imageId);
    return insertMemberships(tx, imageId, selection);
  });
}

export function removeMemberships(
  db: BetterSQLite3Database,
  imageIds: readonly string[],
  selection: CollectionSelection,
) {
  return perImage(db, imageIds, (tx, imageId) => {
    assertTargets(tx, selection, 'COLLECTION_TARGET_NOT_FOUND');
    assertEditableImage(tx, imageId);
    const albumResults = [...new Set(selection.albumIds)].map((albumId) => {
      const removed = tx
        .delete(albumImages)
        .where(
          and(
            eq(albumImages.albumId, albumId),
            eq(albumImages.imageId, imageId),
          ),
        )
        .run().changes;
      tx.update(albums)
        .set({ preferredCoverImageId: null })
        .where(
          and(
            eq(albums.id, albumId),
            eq(albums.preferredCoverImageId, imageId),
          ),
        )
        .run();
      return {
        id: albumId,
        status: removed ? ('removed' as const) : ('absent' as const),
      };
    });
    const tagResults = [...new Set(selection.tagIds)].map((tagId) => ({
      id: tagId,
      status: tx
        .delete(imageTags)
        .where(and(eq(imageTags.tagId, tagId), eq(imageTags.imageId, imageId)))
        .run().changes
        ? ('removed' as const)
        : ('absent' as const),
    }));
    return { albums: albumResults, tags: tagResults };
  });
}
