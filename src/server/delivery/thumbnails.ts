import { and, eq, inArray } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { mediaImages, mediaObjects, mediaVersions } from '../media/schema.ts';
import { storageConfigs } from '../storage/schema.ts';
import { buildImagePath } from './links.ts';
import { selectPreviewVersion } from './preview-presentation.ts';
import {
  thumbnailPresentation,
  type ThumbnailPresentation,
} from './thumbnail-presentation.ts';

export interface AnonymousThumbnail extends ThumbnailPresentation {
  imageId: string;
  aspectRatio: number;
  displayName?: string;
  previewUrl: string | null;
}

/** Caller has selected current public identities in its shared read transaction.
 * Read saved thumbnail/preview state in batches, with no per-image query or storage I/O.
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
      format: mediaImages.format,
      animated: mediaImages.animated,
      classification: mediaImages.classification,
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
  const versions = db
    .select({
      imageId: mediaVersions.imageId,
      kind: mediaVersions.kind,
      mime: mediaVersions.mime,
    })
    .from(mediaVersions)
    .innerJoin(mediaObjects, eq(mediaObjects.id, mediaVersions.objectId))
    .where(
      and(
        inArray(mediaVersions.imageId, [...imageIds]),
        inArray(mediaVersions.kind, ['original', 'compressed', 'thumbnail']),
        eq(mediaObjects.status, 'stored'),
      ),
    )
    .all();
  const versionsById = new Map<string, typeof versions>();
  for (const version of versions) {
    const saved = versionsById.get(version.imageId) ?? [];
    saved.push(version);
    versionsById.set(version.imageId, saved);
  }
  const byId = new Map(rows.map((row) => [row.imageId, row]));
  return imageIds.map((imageId) => {
    const row = byId.get(imageId);
    if (!row)
      throw new Error(`Missing public image delivery state: ${imageId}`);
    const width = row.thumbnailWidth ?? row.width;
    const height = row.thumbnailHeight ?? row.height;
    const previewVersion =
      row.processingStatus === 'ready' && row.storageEnabled
        ? selectPreviewVersion(row, versionsById.get(imageId) ?? [])
        : null;
    return {
      imageId,
      aspectRatio:
        width !== null && height !== null && width > 0 && height > 0
          ? width / height
          : 1,
      ...thumbnailPresentation({
        imageId,
        processingStatus: row.processingStatus,
        storageEnabled: row.storageEnabled,
        hasThumbnail: row.thumbnailObjectId !== null,
      }),
      previewUrl:
        previewVersion === null
          ? null
          : buildImagePath(imageId, previewVersion),
      ...(showName ? { displayName: row.displayName! } : {}),
    };
  });
}
