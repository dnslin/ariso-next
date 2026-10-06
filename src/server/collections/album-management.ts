import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { z } from 'zod';
import { mediaImages } from '../media/schema.ts';
import { CollectionError } from './errors.ts';
import { albums, albumImages } from './schema.ts';
import { resolveAlbumCovers, type AlbumCoverIdentity } from './cover.ts';
import type { CollectionsTransaction } from './types.ts';

const querySchema = z.object({
  q: z
    .string()
    .transform((value) => value.trim().normalize('NFC'))
    .default(''),
  page: z.coerce
    .number()
    .int()
    .min(1)
    .max(Number.MAX_SAFE_INTEGER / 80)
    .default(1),
  pageSize: z.coerce
    .number()
    .pipe(z.union([z.literal(20), z.literal(40), z.literal(80)]))
    .default(40),
});

export function parseAlbumQuery(params: URLSearchParams) {
  if (
    [...params.keys()].some(
      (key) =>
        !['q', 'page', 'pageSize'].includes(key) ||
        params.getAll(key).length > 1,
    )
  )
    throw new CollectionError('COLLECTION_INVALID_INPUT', '相册查询参数无效');
  const result = querySchema.safeParse(Object.fromEntries(params));
  if (!result.success)
    throw new CollectionError('COLLECTION_INVALID_INPUT', '相册查询参数无效');
  return result.data;
}

export type AlbumSummary = {
  imageCount: number;
  publicImageCount: number;
  cover: AlbumCoverIdentity;
};

/** Counts and cover identities for explicit albums in the caller's read transaction. */
export function readAlbumSummaries(
  tx: CollectionsTransaction,
  albumIds: readonly string[],
): Map<string, AlbumSummary> {
  const ids = [...new Set(albumIds)];
  if (!ids.length) return new Map();
  const counts = tx
    .select({
      id: albumImages.albumId,
      value: count(),
      publicCount: sql<number>`sum(case when ${mediaImages.visibility} = 'public' then 1 else 0 end)`,
    })
    .from(albumImages)
    .innerJoin(mediaImages, eq(albumImages.imageId, mediaImages.id))
    .where(
      and(
        inArray(albumImages.albumId, ids),
        isNull(mediaImages.trashedAt),
        isNull(mediaImages.deletionStatus),
      ),
    )
    .groupBy(albumImages.albumId)
    .all();
  const byId = new Map(counts.map((row) => [row.id, row]));
  const covers = resolveAlbumCovers(tx, ids);
  return new Map(
    ids.map((id) => [
      id,
      {
        imageCount: byId.get(id)?.value ?? 0,
        publicImageCount: byId.get(id)?.publicCount ?? 0,
        cover: covers.get(id)!,
      },
    ]),
  );
}

function serializeAlbums(
  tx: CollectionsTransaction,
  rows: (typeof albums.$inferSelect)[],
) {
  const summaries = readAlbumSummaries(
    tx,
    rows.map((row) => row.id),
  );
  return rows.map(({ id, name, description, createdAt, updatedAt }) => ({
    id,
    name,
    description,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
    ...summaries.get(id)!,
  }));
}

export function readAlbum(tx: CollectionsTransaction, id: string) {
  const row = tx.select().from(albums).where(eq(albums.id, id)).get();
  if (!row)
    throw new CollectionError(
      'COLLECTION_TARGET_NOT_FOUND',
      '相册不存在或已被删除',
    );
  return serializeAlbums(tx, [row])[0];
}

export function listAlbums(
  db: BetterSQLite3Database,
  query: ReturnType<typeof parseAlbumQuery>,
) {
  return db.transaction((tx) => {
    const { q, page, pageSize } = query;
    // instr uses literal substring matching; % and _ are ordinary characters.
    const filter = q ? sql`instr(${albums.name}, ${q}) > 0` : undefined;
    const total = tx
      .select({ value: count() })
      .from(albums)
      .where(filter)
      .get()!.value;
    const rows = tx
      .select()
      .from(albums)
      .where(filter)
      .orderBy(desc(albums.createdAt), asc(albums.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .all();
    return { items: serializeAlbums(tx, rows), total, page, pageSize };
  });
}
