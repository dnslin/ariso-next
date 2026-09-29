import {
  and,
  asc,
  desc,
  eq,
  exists,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { albums, albumImages, tags, imageTags } from '../collections/schema.ts';
import { mediaImages } from '../media/schema.ts';
import { storageConfigs } from '../storage/schema.ts';
import {
  LibraryQueryError,
  type LibraryCursor,
  type LibraryFilters,
} from './query-schema.ts';

export function assertLibraryReferences(
  db: BetterSQLite3Database,
  filters: LibraryFilters,
) {
  const missing: string[] = [];
  if (
    filters.albumId &&
    !db
      .select({ id: albums.id })
      .from(albums)
      .where(eq(albums.id, filters.albumId))
      .get()
  )
    missing.push(`相册 ${filters.albumId}`);
  if (
    filters.storageId &&
    !db
      .select({ id: storageConfigs.id })
      .from(storageConfigs)
      .where(eq(storageConfigs.id, filters.storageId))
      .get()
  )
    missing.push(`存储 ${filters.storageId}`);
  if (filters.tagIds.length) {
    const found = new Set(
      db
        .select({ id: tags.id })
        .from(tags)
        .where(inArray(tags.id, filters.tagIds))
        .all()
        .map((row) => row.id),
    );
    for (const id of filters.tagIds)
      if (!found.has(id)) missing.push(`标签 ${id}`);
  }
  if (missing.length)
    throw new LibraryQueryError(
      `筛选引用已失效：${missing.join('、')}，请移除失效条件`,
      'LIBRARY_STALE_REFERENCE',
      409,
    );
}

export function libraryPredicate(
  db: BetterSQLite3Database,
  filters: LibraryFilters,
) {
  const conditions = [
    filters.scope === 'trash'
      ? isNotNull(mediaImages.trashedAt)
      : and(isNull(mediaImages.trashedAt), isNull(mediaImages.deletionStatus)),
  ];
  if (filters.albumId)
    conditions.push(
      exists(
        db
          .select({ id: albumImages.imageId })
          .from(albumImages)
          .where(
            and(
              eq(albumImages.imageId, mediaImages.id),
              eq(albumImages.albumId, filters.albumId),
            ),
          ),
      ),
    );
  if (filters.tagIds.length)
    conditions.push(
      exists(
        db
          .select({ id: imageTags.imageId })
          .from(imageTags)
          .where(
            and(
              eq(imageTags.imageId, mediaImages.id),
              inArray(imageTags.tagId, filters.tagIds),
            ),
          ),
      ),
    );
  if (filters.q) {
    const literal = `%${filters.q.replace(/[!%_]/g, '!$&')}%`;
    conditions.push(
      sql`(${mediaImages.displayName} like ${literal} escape '!' or ${mediaImages.originalName} like ${literal} escape '!')`,
    );
  }
  if (filters.uploadedFrom)
    conditions.push(gte(mediaImages.createdAt, new Date(filters.uploadedFrom)));
  if (filters.uploadedBefore)
    conditions.push(
      lt(mediaImages.createdAt, new Date(filters.uploadedBefore)),
    );
  if (filters.format)
    conditions.push(
      eq(
        mediaImages.format,
        filters.format === 'heif' ? 'HEIC' : filters.format.toUpperCase(),
      ),
    );
  if (filters.storageId)
    conditions.push(eq(mediaImages.storageId, filters.storageId));
  if (filters.visibility)
    conditions.push(eq(mediaImages.visibility, filters.visibility));
  if (filters.status)
    conditions.push(eq(mediaImages.processingStatus, filters.status));
  if (filters.deletionStatus)
    conditions.push(
      filters.deletionStatus === 'none'
        ? isNull(mediaImages.deletionStatus)
        : eq(mediaImages.deletionStatus, filters.deletionStatus),
    );
  return and(...conditions)!;
}

export function libraryOrder(filters: LibraryFilters) {
  const column = filters.sort.startsWith('size')
    ? mediaImages.byteSize
    : filters.scope === 'album'
      ? albumImages.joinedAt
      : filters.scope === 'trash'
        ? mediaImages.trashedAt
        : mediaImages.createdAt;
  // Raw numeric values keep the same boundary for timestamp and byte-size ordering.
  const value = sql<number>`${column}`;
  const descending = filters.sort.endsWith('desc');
  return {
    value,
    terms: [descending ? desc(column) : asc(column), asc(mediaImages.id)],
    reverseTerms: [
      descending ? asc(column) : desc(column),
      desc(mediaImages.id),
    ],
    boundary(cursor: Pick<LibraryCursor, 'value' | 'id'>, previous = false) {
      return or(
        (descending !== previous ? lt : gt)(value, cursor.value),
        and(
          eq(value, cursor.value),
          (previous ? lt : gt)(mediaImages.id, cursor.id),
        ),
      )!;
    },
  };
}
