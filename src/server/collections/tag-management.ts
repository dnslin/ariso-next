import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { z } from 'zod';
import { mediaImages } from '../media/schema.ts';
import { CollectionError } from './errors.ts';
import { getOrCreateTags } from './records.ts';
import { imageTags, tags } from './schema.ts';
import type { parseTagQuery } from './tag-query.ts';
import type { CollectionsTransaction } from './types.ts';
import { tagNameSchema } from './validation.ts';

const inputSchema = z.strictObject({ name: tagNameSchema });
function parseInput(input: unknown) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success)
    throw new CollectionError(
      'COLLECTION_INVALID_INPUT',
      parsed.error.issues.map((issue) => issue.message).join('；'),
    );
  return parsed.data.name;
}

function serializeTags(
  tx: CollectionsTransaction,
  rows: (typeof tags.$inferSelect)[],
) {
  if (!rows.length) return [];
  const counts = tx
    .select({ id: imageTags.tagId, value: count() })
    .from(imageTags)
    .innerJoin(mediaImages, eq(imageTags.imageId, mediaImages.id))
    .where(
      and(
        inArray(
          imageTags.tagId,
          rows.map((row) => row.id),
        ),
        isNull(mediaImages.trashedAt),
        isNull(mediaImages.deletionStatus),
      ),
    )
    .groupBy(imageTags.tagId)
    .all();
  const byId = new Map(counts.map((row) => [row.id, row.value]));
  return rows.map(({ id, displayName, createdAt, updatedAt }) => ({
    id,
    displayName,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
    imageCount: byId.get(id) ?? 0,
  }));
}

export function readTag(tx: CollectionsTransaction, id: string) {
  const row = tx.select().from(tags).where(eq(tags.id, id)).get();
  if (!row)
    throw new CollectionError(
      'COLLECTION_TARGET_NOT_FOUND',
      '标签不存在或已被删除',
    );
  return serializeTags(tx, [row])[0];
}

export function listTags(
  db: BetterSQLite3Database,
  query: ReturnType<typeof parseTagQuery>,
) {
  return db.transaction((tx) => {
    const { q, page, pageSize } = query;
    // Literal matching: percent and underscore are not wildcard characters.
    const filter = q ? sql`instr(${tags.normalizedKey}, ${q}) > 0` : undefined;
    const total = tx.select({ value: count() }).from(tags).where(filter).get()!
      .value;
    const rows = tx
      .select()
      .from(tags)
      .where(filter)
      .orderBy(desc(tags.createdAt), asc(tags.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .all();
    return { items: serializeTags(tx, rows), total, page, pageSize };
  });
}

/** Caller owns a short write transaction; creation shares upload's Unicode matching. */
export function createTag(tx: CollectionsTransaction, input: unknown) {
  const name = parseInput(input);
  const reused = !!tx
    .select({ id: tags.id })
    .from(tags)
    .where(eq(tags.normalizedKey, name.normalizedKey))
    .get();
  const [row] = getOrCreateTags(tx, [name.displayName]);
  return { tag: readTag(tx, row.id), reused };
}

export function renameTag(
  tx: CollectionsTransaction,
  id: string,
  input: unknown,
) {
  const name = parseInput(input);
  const row = tx.select().from(tags).where(eq(tags.id, id)).get();
  if (!row)
    throw new CollectionError(
      'COLLECTION_TARGET_NOT_FOUND',
      '标签不存在或已被删除',
    );
  if (row.normalizedKey === name.normalizedKey)
    return { tag: readTag(tx, id), changed: false };
  const occupied = tx
    .select({ id: tags.id })
    .from(tags)
    .where(eq(tags.normalizedKey, name.normalizedKey))
    .get();
  if (occupied)
    throw new CollectionError(
      'COLLECTION_TAG_CONFLICT',
      '已有同名标签，请使用其他名称',
    );
  tx.update(tags)
    .set({ ...name, updatedAt: new Date() })
    .where(eq(tags.id, id))
    .run();
  return { tag: readTag(tx, id), changed: true };
}
