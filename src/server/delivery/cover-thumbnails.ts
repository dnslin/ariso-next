import { and, eq, exists, inArray } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { mediaImages, mediaObjects, mediaVersions } from '../media/schema.ts';
import { storageConfigs } from '../storage/schema.ts';
import { buildImagePath } from './links.ts';

type CoverThumbnail = {
  displayName: string;
  status: 'processing' | 'failed' | 'disabled' | 'missing' | 'ready';
  thumbnailUrl: string | null;
};

/** Display facts only; collections selects eligible cover IDs in the same transaction. */
export function readCoverThumbnails(
  db: BetterSQLite3Database,
  imageIds: readonly string[],
): Map<string, CoverThumbnail> {
  const ids = [...new Set(imageIds)];
  if (!ids.length) return new Map();
  const rows = db
    .select({
      id: mediaImages.id,
      displayName: mediaImages.displayName,
      processingStatus: mediaImages.processingStatus,
      storageEnabled: storageConfigs.enabled,
      hasThumbnail: exists(
        db
          .select({ imageId: mediaVersions.imageId })
          .from(mediaVersions)
          .innerJoin(mediaObjects, eq(mediaVersions.objectId, mediaObjects.id))
          .where(
            and(
              eq(mediaVersions.imageId, mediaImages.id),
              eq(mediaVersions.kind, 'thumbnail'),
              eq(mediaObjects.status, 'stored'),
            ),
          ),
      ).mapWith(Boolean),
    })
    .from(mediaImages)
    .innerJoin(storageConfigs, eq(mediaImages.storageId, storageConfigs.id))
    .where(inArray(mediaImages.id, ids))
    .all();
  return new Map(
    rows.map((image) => {
      const status: CoverThumbnail['status'] =
        image.processingStatus === 'pending' ||
        image.processingStatus === 'processing'
          ? 'processing'
          : image.processingStatus === 'failed'
            ? 'failed'
            : !image.storageEnabled
              ? 'disabled'
              : !image.hasThumbnail
                ? 'missing'
                : 'ready';
      return [
        image.id,
        {
          displayName: image.displayName,
          status,
          thumbnailUrl:
            status === 'ready' ? buildImagePath(image.id, 'thumbnail') : null,
        },
      ];
    }),
  );
}
