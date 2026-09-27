import { and, asc, count, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { mediaImages, mediaObjects, mediaVersions } from '../media/schema.ts';
import { storageConfigs } from '../storage/schema.ts';
import { buildTrashPreviewPath } from '../delivery/links.ts';
import type { TrashPage } from './trash-types.ts';

export class TrashQueryError extends Error {
  readonly code = 'TRASH_INVALID_QUERY';
  readonly status = 400;
}

export function parseTrashQuery(params: URLSearchParams): number {
  const value = params.get('page');
  const page = value === null ? 1 : Number(value);
  if (
    [...params.keys()].some((key) => key !== 'page') ||
    params.getAll('page').length > 1 ||
    (value !== null && !/^[1-9]\d*$/.test(value)) ||
    !Number.isSafeInteger(page) ||
    !Number.isSafeInteger(page * 40)
  )
    throw new TrashQueryError('回收站页码无效，请重新加载');
  return page;
}

/** Owner metadata includes only saved previews; delivery checks the current session and state. */
export function readTrashPage(db: BetterSQLite3Database, page = 1): TrashPage {
  return db.transaction((tx) => {
    const trashed = isNotNull(mediaImages.trashedAt);
    const total = tx
      .select({ value: count() })
      .from(mediaImages)
      .where(trashed)
      .get()!.value;
    const rows = tx
      .select({
        id: mediaImages.id,
        displayName: mediaImages.displayName,
        originalName: mediaImages.originalName,
        byteSize: mediaImages.byteSize,
        format: mediaImages.format,
        visibility: mediaImages.visibility,
        processingStatus: mediaImages.processingStatus,
        trashedAt: mediaImages.trashedAt,
        deletionStatus: mediaImages.deletionStatus,
        storage: {
          id: storageConfigs.id,
          name: storageConfigs.name,
          enabled: storageConfigs.enabled,
        },
      })
      .from(mediaImages)
      .innerJoin(storageConfigs, eq(mediaImages.storageId, storageConfigs.id))
      .where(trashed)
      .orderBy(desc(mediaImages.trashedAt), asc(mediaImages.id))
      .limit(40)
      .offset((page - 1) * 40)
      .all();
    const thumbnails = rows.length
      ? tx
          .select({ imageId: mediaVersions.imageId })
          .from(mediaVersions)
          .innerJoin(mediaObjects, eq(mediaVersions.objectId, mediaObjects.id))
          .where(
            and(
              inArray(
                mediaVersions.imageId,
                rows.map((row) => row.id),
              ),
              eq(mediaVersions.kind, 'thumbnail'),
              eq(mediaObjects.status, 'stored'),
            ),
          )
          .all()
      : [];
    const thumbnailIds = new Set(thumbnails.map((row) => row.imageId));
    return {
      items: rows.map((row) => ({
        ...row,
        thumbnailPath:
          row.storage.enabled && !row.deletionStatus && thumbnailIds.has(row.id)
            ? buildTrashPreviewPath(row.id, 'thumbnail')
            : null,
        trashedAt: row.trashedAt!.toISOString(),
      })),
      total,
      page,
      pageSize: 40,
      hasMore: page * 40 < total,
    };
  });
}
