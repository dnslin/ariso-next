import { randomUUID } from 'node:crypto';
import { count, eq } from 'drizzle-orm';
import { CollectionError } from './errors.ts';
import { albums, tags } from './schema.ts';
import type { CollectionsTransaction } from './types.ts';
import { albumInputSchema, tagNamesSchema } from './validation.ts';

export function createAlbum(
  tx: CollectionsTransaction,
  input: { name: string; description?: string },
) {
  const parsed = albumInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new CollectionError('COLLECTION_INVALID_INPUT', parsed.error.message);
  }
  const now = new Date();
  return tx
    .insert(albums)
    .values({
      id: randomUUID(),
      ...parsed.data,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
}

/** Caller owns the write transaction. Only normalized-key conflicts are matches. */
export function getOrCreateTags(tx: CollectionsTransaction, names: string[]) {
  const parsed = tagNamesSchema.safeParse(names);
  if (!parsed.success) {
    throw new CollectionError('COLLECTION_INVALID_INPUT', parsed.error.message);
  }
  const rows: (typeof tags.$inferSelect)[] = [];
  const seen = new Set<string>();
  for (const name of parsed.data) {
    if (seen.has(name.normalizedKey)) continue;
    seen.add(name.normalizedKey);
    const now = new Date();
    tx.insert(tags)
      .values({ id: randomUUID(), ...name, createdAt: now, updatedAt: now })
      .onConflictDoNothing({ target: tags.normalizedKey })
      .run();
    const row = tx
      .select()
      .from(tags)
      .where(eq(tags.normalizedKey, name.normalizedKey))
      .get();
    if (!row)
      throw new Error(`创建或匹配标签后未找到记录：${name.normalizedKey}`);
    rows.push(row);
  }
  return rows;
}

/** Foreign keys remove organization relations; media assets remain untouched. */
export function deleteAlbum(tx: CollectionsTransaction, id: string) {
  return tx.delete(albums).where(eq(albums.id, id)).run().changes > 0;
}

export function deleteTag(tx: CollectionsTransaction, id: string) {
  return tx.delete(tags).where(eq(tags.id, id)).run().changes > 0;
}

export function countAlbums(tx: CollectionsTransaction) {
  return tx.select({ count: count() }).from(albums).get()!.count;
}
