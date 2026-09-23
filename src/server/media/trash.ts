import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { mediaImages } from './schema.ts';

export class MediaTrashError extends Error {
  constructor(
    public readonly code: 'MEDIA_IMAGE_NOT_FOUND' | 'MEDIA_DELETION_STARTED',
    public readonly status: 404 | 409,
    message: string,
  ) {
    super(message);
    this.name = 'MediaTrashError';
  }
}

function setTrashed(
  db: BetterSQLite3Database,
  imageId: string,
  trashed: boolean,
) {
  // Serialize the state check and write with permanent-deletion acceptance.
  return db.transaction(
    (tx) => {
      const image = tx
        .select()
        .from(mediaImages)
        .where(eq(mediaImages.id, imageId))
        .get();
      if (!image)
        throw new MediaTrashError(
          'MEDIA_IMAGE_NOT_FOUND',
          404,
          `图片不存在：${imageId}`,
        );
      if (image.deletionStatus !== null)
        throw new MediaTrashError(
          'MEDIA_DELETION_STARTED',
          409,
          `图片已开始永久删除，不能回收或恢复：${imageId}`,
        );

      let trashedAt = image.trashedAt;
      if ((trashedAt !== null) !== trashed) {
        trashedAt = trashed ? new Date() : null;
        tx.update(mediaImages)
          .set({ trashedAt })
          .where(eq(mediaImages.id, imageId))
          .run();
      }
      return { imageId, trashedAt };
    },
    { behavior: 'immediate' },
  );
}

/** Record-only mutation: retain content, jobs, relationships and their timestamps. */
export function trashImage(db: BetterSQLite3Database, imageId: string) {
  return setTrashed(db, imageId, true);
}

/** Disabled storage does not prevent restoring the record; delivery owns access. */
export function restoreImage(db: BetterSQLite3Database, imageId: string) {
  return setTrashed(db, imageId, false);
}
