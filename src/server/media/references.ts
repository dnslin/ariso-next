import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import {
  mediaCleanupJobs,
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaVersions,
} from './schema.ts';
import { buildImagePath, buildTrashPreviewPath } from '../delivery/links.ts';

/** Indexed exact-key ownership check used immediately before orphan deletion. */
export function readMediaObjectReferences(
  db: BetterSQLite3Database,
  storageId: string,
  key: string,
) {
  return db
    .select({ key: mediaObjects.key })
    .from(mediaObjects)
    .where(
      and(
        eq(mediaObjects.storageId, storageId),
        eq(mediaObjects.key, key),
        ne(mediaObjects.status, 'deleted'),
      ),
    )
    .all();
}

/** The storage management caller owns the transaction and combines all providers. */
export function getStorageReferences(
  tx: BetterSQLite3Database,
  storageId: string,
) {
  return {
    storageId,
    images: tx
      .select({
        id: mediaImages.id,
        processingStatus: mediaImages.processingStatus,
        trashedAt: mediaImages.trashedAt,
        deletionStatus: mediaImages.deletionStatus,
      })
      .from(mediaImages)
      .where(eq(mediaImages.storageId, storageId))
      .all(),
    versions: tx
      .select({
        imageId: mediaVersions.imageId,
        kind: mediaVersions.kind,
        objectId: mediaVersions.objectId,
      })
      .from(mediaVersions)
      .innerJoin(mediaImages, eq(mediaImages.id, mediaVersions.imageId))
      .where(eq(mediaImages.storageId, storageId))
      .all(),
    objects: tx
      .select({
        id: mediaObjects.id,
        imageId: mediaObjects.imageId,
        jobId: mediaObjects.jobId,
        key: mediaObjects.key,
        purpose: mediaObjects.purpose,
        status: mediaObjects.status,
      })
      .from(mediaObjects)
      .where(
        and(
          eq(mediaObjects.storageId, storageId),
          ne(mediaObjects.status, 'deleted'),
        ),
      )
      .all(),
    jobs: tx
      .select({
        id: mediaJobs.id,
        imageId: mediaJobs.imageId,
        kind: mediaJobs.kind,
        status: mediaJobs.status,
      })
      .from(mediaJobs)
      .innerJoin(mediaImages, eq(mediaImages.id, mediaJobs.imageId))
      .where(
        and(
          eq(mediaImages.storageId, storageId),
          inArray(mediaJobs.status, ['queued', 'running']),
        ),
      )
      .all(),
    cleanupJobs: tx
      .select({
        id: mediaCleanupJobs.id,
        imageId: mediaCleanupJobs.imageId,
        status: mediaCleanupJobs.status,
      })
      .from(mediaCleanupJobs)
      .innerJoin(mediaImages, eq(mediaImages.id, mediaCleanupJobs.imageId))
      .where(
        and(
          eq(mediaImages.storageId, storageId),
          ne(mediaCleanupJobs.status, 'succeeded'),
        ),
      )
      .all(),
  };
}

/** Task identity is independent of the currently published image status. */
export function readMediaTaskReferences(
  db: BetterSQLite3Database,
  storageId: string,
) {
  const thumbnailExists =
    sql<boolean>`exists (select 1 from ${mediaVersions} where ${mediaVersions.imageId} = ${mediaImages.id} and ${mediaVersions.kind} = 'thumbnail')`.mapWith(
      Boolean,
    );
  const result = {
    jobs: db
      .select({
        id: mediaJobs.id,
        imageId: mediaJobs.imageId,
        displayName: mediaImages.displayName,
        kind: mediaJobs.kind,
        scope: mediaJobs.scope,
        status: mediaJobs.status,
        processingStatus: mediaImages.processingStatus,
        trashedAt: mediaImages.trashedAt,
        deletionStatus: mediaImages.deletionStatus,
        thumbnailExists,
      })
      .from(mediaJobs)
      .innerJoin(mediaImages, eq(mediaImages.id, mediaJobs.imageId))
      .where(
        and(
          eq(mediaImages.storageId, storageId),
          inArray(mediaJobs.status, ['queued', 'running']),
        ),
      )
      .orderBy(mediaJobs.createdAt, mediaJobs.id)
      .all(),
    cleanupJobs: db
      .select({
        id: mediaCleanupJobs.id,
        imageId: mediaCleanupJobs.imageId,
        displayName: mediaImages.displayName,
        status: mediaCleanupJobs.status,
        trashedAt: mediaImages.trashedAt,
        deletionStatus: mediaImages.deletionStatus,
        thumbnailExists,
      })
      .from(mediaCleanupJobs)
      .innerJoin(mediaImages, eq(mediaImages.id, mediaCleanupJobs.imageId))
      .where(
        and(
          eq(mediaImages.storageId, storageId),
          ne(mediaCleanupJobs.status, 'succeeded'),
        ),
      )
      .orderBy(mediaCleanupJobs.createdAt, mediaCleanupJobs.id)
      .all(),
  };
  const preview = <
    T extends {
      imageId: string;
      trashedAt: Date | null;
      deletionStatus: string | null;
      thumbnailExists: boolean;
    },
  >(
    task: T,
  ) => {
    const { thumbnailExists, deletionStatus, ...identity } = task;
    return {
      ...identity,
      thumbnailPath:
        thumbnailExists && !deletionStatus
          ? task.trashedAt
            ? buildTrashPreviewPath(task.imageId, 'thumbnail')
            : buildImagePath(task.imageId, 'thumbnail')
          : null,
    };
  };
  return {
    jobs: result.jobs.map(preview),
    cleanupJobs: result.cleanupJobs.map(preview),
  };
}
