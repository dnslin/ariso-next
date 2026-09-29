import { and, count, eq, inArray } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { albumImages } from '../collections/schema.ts';
import { mediaImages } from '../media/schema.ts';
import { storageConfigs } from '../storage/schema.ts';
import { libraryColumns, readLibraryItems } from './query-items.ts';
import {
  assertLibraryReferences,
  libraryOrder,
  libraryPredicate,
} from './query-predicate.ts';
import {
  encodeLibraryCursor,
  LibraryQueryError,
  libraryStatusSchema,
  parseLibraryQuery,
  type LibraryFilters,
  type LibraryQuery,
} from './query-schema.ts';
import type { LibraryPage } from './types.ts';

function libraryRows(db: BetterSQLite3Database, filters: LibraryFilters) {
  const query = db
    .select({ ...libraryColumns, sortValue: libraryOrder(filters).value })
    .from(mediaImages)
    .innerJoin(storageConfigs, eq(mediaImages.storageId, storageConfigs.id))
    .$dynamic();
  return filters.scope === 'album'
    ? query.innerJoin(
        albumImages,
        and(
          eq(albumImages.imageId, mediaImages.id),
          eq(albumImages.albumId, filters.albumId!),
        ),
      )
    : query;
}

/** All page facts and total share a short SQLite read transaction; no file or object-store I/O. */
export function readLibraryPage(
  db: BetterSQLite3Database,
  query: LibraryQuery = parseLibraryQuery(new URLSearchParams()),
): LibraryPage {
  return db.transaction((tx) => {
    const { filters, page, cursor } = query;
    assertLibraryReferences(tx, filters);
    const predicate = libraryPredicate(tx, filters);
    const order = libraryOrder(filters);
    const total = tx
      .select({ value: count() })
      .from(mediaImages)
      .where(predicate)
      .get()!.value;
    const rows = libraryRows(tx, filters)
      .where(and(predicate, cursor ? order.boundary(cursor) : undefined))
      .orderBy(...order.terms)
      .limit(filters.pageSize + 1)
      .offset(page === null ? 0 : (page - 1) * filters.pageSize)
      .all();
    const hasMore = rows.length > filters.pageSize;
    const selected = rows.slice(0, filters.pageSize);
    const last = selected.at(-1);
    return {
      items: readLibraryItems(tx, selected),
      total,
      hasMore,
      nextCursor:
        page === null && hasMore && last
          ? encodeLibraryCursor(filters, last.sortValue, last.id)
          : null,
      ...(page === null ? {} : { page, pageSize: filters.pageSize }),
    };
  });
}

export function readLibraryNeighbors(
  db: BetterSQLite3Database,
  imageId: string,
  query: LibraryQuery,
) {
  if (
    query.page !== null ||
    query.cursor !== null ||
    query.filters.scope === 'trash'
  )
    throw new LibraryQueryError(
      '邻居查询仅接受正常图库或相册的筛选上下文，不接受页码或游标',
    );
  return db.transaction((tx) => {
    const { filters } = query;
    assertLibraryReferences(tx, filters);
    const predicate = libraryPredicate(tx, filters);
    const current = libraryRows(tx, filters)
      .where(and(predicate, eq(mediaImages.id, imageId)))
      .get();
    if (!current) {
      const exists = tx
        .select({ id: mediaImages.id })
        .from(mediaImages)
        .where(eq(mediaImages.id, imageId))
        .get();
      throw new LibraryQueryError(
        exists ? '图片已不属于当前查询范围' : '图片不存在',
        exists ? 'LIBRARY_OUTSIDE_QUERY' : 'IMAGE_NOT_FOUND',
        exists ? 409 : 404,
      );
    }
    const order = libraryOrder(filters);
    const boundary = { value: current.sortValue, id: imageId };
    const previous = libraryRows(tx, filters)
      .where(and(predicate, order.boundary(boundary, true)))
      .orderBy(...order.reverseTerms)
      .limit(1)
      .get();
    const next = libraryRows(tx, filters)
      .where(and(predicate, order.boundary(boundary)))
      .orderBy(...order.terms)
      .limit(1)
      .get();
    const items = readLibraryItems(
      tx,
      [previous, next].filter((row) => row !== undefined),
    );
    return {
      previous: items.find((item) => item.id === previous?.id) ?? null,
      next: items.find((item) => item.id === next?.id) ?? null,
    };
  });
}

export function readLibraryStatus(db: BetterSQLite3Database, input: unknown) {
  const parsed = libraryStatusSchema.safeParse(input);
  if (!parsed.success)
    throw new LibraryQueryError('状态批读需要 1–80 个非空图片 ID');
  return db.transaction((tx) => {
    const rows = tx
      .select(libraryColumns)
      .from(mediaImages)
      .innerJoin(storageConfigs, eq(mediaImages.storageId, storageConfigs.id))
      .where(inArray(mediaImages.id, parsed.data.ids))
      .all();
    const byId = new Map(
      readLibraryItems(tx, rows).map((item) => [item.id, item]),
    );
    return {
      items: parsed.data.ids.flatMap((id) =>
        byId.has(id) ? [byId.get(id)!] : [],
      ),
      missingIds: parsed.data.ids.filter((id) => !byId.has(id)),
    };
  });
}
