import { and, eq, inArray } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { mediaImages, mediaObjects, mediaVersions } from '../media/schema.ts';
import { storageConfigs } from '../storage/schema.ts';
import { buildImagePath } from './links.ts';

export interface AnonymousThumbnail {
  imageId: string;
  aspectRatio: number;
  status: 'ready' | 'processing' | 'failed' | 'disabled' | 'missing';
  thumbnailUrl: string | null;
  displayName?: string;
}

/** Caller has selected current public identities in its shared read transaction.
 * Only saved thumbnail state is read, with no per-image query or storage I/O.
 */
export function readAnonymousThumbnails(
  db: BetterSQLite3Database,
  imageIds: readonly string[],
  showName: boolean,
): AnonymousThumbnail[] {
  if (!imageIds.length) return [];
  const rows = db
    .select({
      imageId: mediaImages.id,
      ...(showName ? { displayName: mediaImages.displayName } : {}),
      width: mediaImages.width,
      height: mediaImages.height,
      processingStatus: mediaImages.processingStatus,
      storageEnabled: storageConfigs.enabled,
      thumbnailWidth: mediaVersions.width,
      thumbnailHeight: mediaVersions.height,
      thumbnailObjectId: mediaObjects.id,
    })
    .from(mediaImages)
    .innerJoin(storageConfigs, eq(mediaImages.storageId, storageConfigs.id))
    .leftJoin(
      mediaVersions,
      and(
        eq(mediaVersions.imageId, mediaImages.id),
        eq(mediaVersions.kind, 'thumbnail'),
      ),
    )
    .leftJoin(
      mediaObjects,
      and(
        eq(mediaObjects.id, mediaVersions.objectId),
        eq(mediaObjects.status, 'stored'),
      ),
    )
    .where(inArray(mediaImages.id, [...imageIds]))
    .all();
  const byId = new Map(rows.map((row) => [row.imageId, row]));
  return imageIds.map((imageId) => {
    const row = byId.get(imageId);
    if (!row)
      throw new Error(`Missing public image delivery state: ${imageId}`);
    const status: AnonymousThumbnail['status'] =
      row.processingStatus === 'pending' ||
      row.processingStatus === 'processing'
        ? 'processing'
        : row.processingStatus === 'failed'
          ? 'failed'
          : !row.storageEnabled
            ? 'disabled'
            : row.thumbnailObjectId === null
              ? 'missing'
              : 'ready';
    const width = row.thumbnailWidth ?? row.width;
    const height = row.thumbnailHeight ?? row.height;
    return {
      imageId,
      aspectRatio:
        width !== null && height !== null && width > 0 && height > 0
          ? width / height
          : 1,
      status,
      thumbnailUrl:
        status === 'ready' ? buildImagePath(imageId, 'thumbnail') : null,
      ...(showName ? { displayName: row.displayName! } : {}),
    };
  });
}
