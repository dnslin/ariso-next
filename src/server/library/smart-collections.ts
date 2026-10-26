import { randomUUID } from 'node:crypto';
import { asc, desc, eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { z } from 'zod';
import { LibraryQueryError, parseLibraryQuery } from './query-schema.ts';
import { assertLibraryReferences } from './query-predicate.ts';
import { smartCollections } from './schema.ts';
import {
  normalizeSmartRules,
  resolveSmartRules,
  type SmartCollection,
} from './smart-rules.ts';

const nameSchema = z
  .string()
  .trim()
  .normalize()
  .refine(
    (value) =>
      [...value].length >= 1 &&
      [...value].length <= 100 &&
      !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(value),
    '集合名称须为 1–100 个字符，不能含换行或控制字符',
  );
const createSchema = z.strictObject({ name: nameSchema, rules: z.unknown() });
const updateSchema = z
  .strictObject({ name: nameSchema.optional(), rules: z.unknown().optional() })
  .refine(
    (value) => value.name !== undefined || value.rules !== undefined,
    '请提供名称或条件',
  );
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new LibraryQueryError(
      result.error.issues.map((issue) => issue.message).join('；'),
    );
  return result.data;
}
function serialize(row: typeof smartCollections.$inferSelect): SmartCollection {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
export function listSmartCollections(db: BetterSQLite3Database) {
  return db
    .select()
    .from(smartCollections)
    .orderBy(desc(smartCollections.createdAt), asc(smartCollections.id))
    .all()
    .map(serialize);
}
export function readSmartCollection(
  db: BetterSQLite3Database,
  id: string,
): SmartCollection {
  const row = db
    .select()
    .from(smartCollections)
    .where(eq(smartCollections.id, id))
    .get();
  if (!row)
    throw new LibraryQueryError(
      '智能集合不存在或已删除',
      'LIBRARY_COLLECTION_NOT_FOUND',
      404,
    );
  return serialize(row);
}
export function createSmartCollection(
  db: BetterSQLite3Database,
  input: unknown,
) {
  const value = parse(createSchema, input);
  const rules = normalizeSmartRules(value.rules);
  return db.transaction((tx) => {
    assertLibraryReferences(
      tx,
      parseLibraryQuery(new URLSearchParams(resolveSmartRules(rules))).filters,
    );
    const now = new Date();
    const row = {
      id: randomUUID(),
      name: value.name,
      rules,
      createdAt: now,
      updatedAt: now,
    };
    tx.insert(smartCollections).values(row).run();
    return serialize(row);
  });
}
export function updateSmartCollection(
  db: BetterSQLite3Database,
  id: string,
  input: unknown,
) {
  const value = parse(updateSchema, input);
  const rules =
    value.rules === undefined ? undefined : normalizeSmartRules(value.rules);
  return db.transaction((tx) => {
    readSmartCollection(tx, id);
    if (rules)
      assertLibraryReferences(
        tx,
        parseLibraryQuery(new URLSearchParams(resolveSmartRules(rules)))
          .filters,
      );
    tx.update(smartCollections)
      .set({
        ...(value.name !== undefined ? { name: value.name } : {}),
        ...(rules ? { rules } : {}),
        updatedAt: new Date(),
      })
      .where(eq(smartCollections.id, id))
      .run();
    return readSmartCollection(tx, id);
  });
}
export function deleteSmartCollection(db: BetterSQLite3Database, id: string) {
  return (
    db.delete(smartCollections).where(eq(smartCollections.id, id)).run()
      .changes > 0
  );
}
