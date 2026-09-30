import { asc, inArray, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { z } from 'zod';
import { albums, tags } from '../collections/schema.ts';
import { storageConfigs } from '../storage/schema.ts';
import { LibraryQueryError } from './query-schema.ts';
import type { LibraryFilterOptions } from './filter-options-types.ts';

const schema = z.strictObject({
  kind: z.enum(['tags', 'albums', 'storages']),
  q: z.string().trim().default(''),
  page: z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .refine((page) => Number.isSafeInteger((page - 1) * 40))
    .default(1),
  selectedId: z.array(z.string().min(1)).default([]),
});

/** Small, owner-only projections of provider records; no configuration or credentials. */
export function readLibraryFilterOptions(
  db: BetterSQLite3Database,
  params: URLSearchParams,
): LibraryFilterOptions {
  const input: Record<string, unknown> = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    if (key !== 'selectedId' && values.length > 1)
      throw new LibraryQueryError(`查询参数 ${key} 不能重复`);
    input[key] = key === 'selectedId' ? values : values[0];
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new LibraryQueryError(
      parsed.error.issues.map((issue) => issue.message).join('；'),
    );
  const { kind, q, page, selectedId } = parsed.data;
  const table =
    kind === 'tags' ? tags : kind === 'albums' ? albums : storageConfigs;
  const name =
    kind === 'tags'
      ? tags.displayName
      : kind === 'albums'
        ? albums.name
        : storageConfigs.name;
  const fields = {
    id: table.id,
    name,
    enabled: kind === 'storages' ? storageConfigs.enabled : sql<null>`null`,
  };
  const option = (row: {
    id: string;
    name: string;
    enabled: boolean | null;
  }) =>
    row.enabled === null
      ? { id: row.id, name: row.name }
      : { id: row.id, name: row.name, enabled: row.enabled };
  return db.transaction((tx) => {
    const rows = tx
      .select(fields)
      .from(table)
      .where(q ? sql`instr(lower(${name}), lower(${q})) > 0` : undefined)
      .orderBy(asc(name), asc(table.id))
      .limit(41)
      .offset((page - 1) * 40)
      .all();
    const selected = selectedId.length
      ? tx.select(fields).from(table).where(inArray(table.id, selectedId)).all()
      : [];
    const existing = new Set(selected.map((item) => item.id));
    return {
      items: rows.slice(0, 40).map(option),
      selected: selected.map(option),
      missingIds: [...new Set(selectedId)].filter((id) => !existing.has(id)),
      page,
      hasMore: rows.length > 40,
    };
  });
}
