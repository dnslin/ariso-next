import { and, eq, inArray, ne } from 'drizzle-orm';
import type { MediaTransaction } from './images.ts';
import {
  mediaCleanupJobs,
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaVersions,
} from './schema.ts';

/** The storage management caller owns the transaction and combines all providers. */
export function getStorageReferences(tx: MediaTransaction, storageId: string) {
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
