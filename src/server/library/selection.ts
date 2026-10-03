import { and, eq, exists, inArray } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { z } from 'zod';
import { buildImagePath, buildTrashPreviewPath } from '../delivery/links.ts';
import { mediaImages, mediaObjects, mediaVersions } from '../media/schema.ts';
import { storageConfigs } from '../storage/schema.ts';
import {
  assertLibraryReferences,
  libraryPredicate,
} from './query-predicate.ts';
import { LibraryQueryError, parseLibraryQuery } from './query-schema.ts';
import type { LibrarySelection } from './selection-types.ts';

const selectionSchema = z.strictObject({
  ids: z.array(z.string().min(1)).min(1).max(200),
  query: z.string(),
});

/** Recheck only explicit selections against the current query, with no media I/O. */
export function readLibrarySelection(
  db: BetterSQLite3Database,
  input: unknown,
): LibrarySelection {
  const parsed = selectionSchema.safeParse(input);
  if (!parsed.success)
    throw new LibraryQueryError('已选清单需要 1–200 个非空图片 ID 和查询条件');
  const query = parseLibraryQuery(new URLSearchParams(parsed.data.query));
  if (query.page !== null || query.cursor !== null)
    throw new LibraryQueryError('已选清单仅接受筛选条件，不接受页码或游标');
  const ids = [...new Set(parsed.data.ids)];
  return db.transaction((tx) => {
    assertLibraryReferences(tx, query.filters);
    const rows = tx
      .select({
        id: mediaImages.id,
        displayName: mediaImages.displayName,
        byteSize: mediaImages.byteSize,
        processingStatus: mediaImages.processingStatus,
        deletionStatus: mediaImages.deletionStatus,
        storage: {
          id: storageConfigs.id,
          name: storageConfigs.name,
          enabled: storageConfigs.enabled,
        },
        hasThumbnail: exists(
          tx
            .select({ imageId: mediaVersions.imageId })
            .from(mediaVersions)
            .innerJoin(
              mediaObjects,
              eq(mediaVersions.objectId, mediaObjects.id),
            )
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
      .where(
        and(inArray(mediaImages.id, ids), libraryPredicate(tx, query.filters)),
      )
      .all();
    const byId = new Map(
      rows.map((row) => [
        row.id,
        {
          id: row.id,
          displayName: row.displayName,
          byteSize: row.byteSize,
          processingStatus: row.processingStatus,
          storage: row.storage,
          thumbnailUrl:
            row.storage.enabled &&
            row.hasThumbnail &&
            row.deletionStatus === null
              ? query.filters.scope === 'trash'
                ? buildTrashPreviewPath(row.id, 'thumbnail')
                : buildImagePath(row.id, 'thumbnail')
              : null,
        },
      ]),
    );
    return {
      items: ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])),
    };
  });
}
