import type Database from 'better-sqlite3';
import { z } from 'zod';

export type Sort = 'uploaded_desc' | 'uploaded_asc' | 'size_desc' | 'size_asc';
export type Query = {
  scope?: 'library' | 'album' | 'trash';
  albumId?: string;
  tagIds?: string[];
  q?: string;
  uploadedFrom?: number;
  uploadedBefore?: number;
  format?: string;
  storageId?: string;
  visibility?: 'private' | 'public';
  status?: 'pending' | 'processing' | 'ready' | 'failed';
  sort?: Sort;
  pageSize?: 20 | 40 | 80;
};
export type Item = {
  id: string;
  display_name: string;
  original_name: string;
  byte_size: number;
  created_at: number;
  processing_status: string;
  visibility: string;
  storage_id: string;
  enabled: number;
  sort_value: number;
};
type Parameters = (string | number)[];
const cursorSchema = z
  .object({ query: z.string(), value: z.number().int(), id: z.string().min(1) })
  .strict();

export function normalizeQuery(input: Query) {
  const scope = input.scope ?? 'library';
  if (scope === 'album' && !input.albumId)
    throw new Error('Album scope requires albumId');
  if (scope !== 'library' && input.sort)
    throw new Error('Scope has a fixed ordering rule');
  if (
    input.uploadedFrom !== undefined &&
    input.uploadedBefore !== undefined &&
    input.uploadedFrom >= input.uploadedBefore
  )
    throw new Error('Invalid upload interval');
  return {
    scope,
    albumId: input.albumId ?? null,
    tagIds: [...new Set(input.tagIds ?? [])].sort(),
    q: input.q?.trim() || null,
    uploadedFrom: input.uploadedFrom ?? null,
    uploadedBefore: input.uploadedBefore ?? null,
    format: input.format ?? null,
    storageId: input.storageId ?? null,
    visibility: input.visibility ?? null,
    status: input.status ?? null,
    sort:
      scope === 'album'
        ? 'added_desc'
        : scope === 'trash'
          ? 'trashed_desc'
          : (input.sort ?? 'uploaded_desc'),
    pageSize: input.pageSize ?? 40,
  };
}

// Experiment query only. Production HTTP validation and stale-reference UX are T-LIB work.
export function compileQuery(
  input: Query,
  options: { cursor?: string; page?: number } = {},
) {
  const query = normalizeQuery(input);
  const identity = JSON.stringify(query);
  const parameters: Parameters = [];
  const where = [
    query.scope === 'trash'
      ? 'i.trashed_at IS NOT NULL'
      : 'i.trashed_at IS NULL',
  ];
  let join = '';
  let column = query.sort.startsWith('size')
    ? 'i.byte_size'
    : query.sort === 'trashed_desc'
      ? 'i.trashed_at'
      : 'i.created_at';
  if (query.scope === 'album') {
    join = 'JOIN experiment_image_albums a ON a.image_id = i.id';
    where.push('a.album_id = ?');
    parameters.push(query.albumId!);
    column = 'a.added_at';
  } else if (query.albumId) {
    where.push(
      'EXISTS (SELECT 1 FROM experiment_image_albums a WHERE a.image_id = i.id AND a.album_id = ?)',
    );
    parameters.push(query.albumId);
  }
  if (query.tagIds.length) {
    where.push(
      `EXISTS (SELECT 1 FROM experiment_image_tags t WHERE t.image_id = i.id AND t.tag_id IN (${query.tagIds.map(() => '?').join(', ')}))`,
    );
    parameters.push(...query.tagIds);
  }
  if (query.q) {
    // SQLite LIKE provides ASCII case-insensitivity; escape all LIKE metacharacters.
    where.push(
      "(i.display_name LIKE ? ESCAPE '\\' OR i.original_name LIKE ? ESCAPE '\\')",
    );
    const literal = `%${query.q.replace(/[\\%_]/g, '\\$&')}%`;
    parameters.push(literal, literal);
  }
  for (const [field, value] of [
    ['format', query.format],
    ['storage_id', query.storageId],
    ['visibility', query.visibility],
    ['processing_status', query.status],
  ] as const) {
    if (value !== null) {
      where.push(`i.${field} = ?`);
      parameters.push(value);
    }
  }
  if (query.uploadedFrom !== null) {
    where.push('i.created_at >= ?');
    parameters.push(query.uploadedFrom);
  }
  if (query.uploadedBefore !== null) {
    where.push('i.created_at < ?');
    parameters.push(query.uploadedBefore);
  }
  const from = `FROM media_images i JOIN storage_configs s ON s.id = i.storage_id ${join}`;
  const countSql = `SELECT count(*) AS total ${from} WHERE ${where.join(' AND ')}`;
  const countParameters = [...parameters];
  const descending = query.sort.endsWith('desc');
  if (options.cursor) {
    const cursor = cursorSchema.parse(
      JSON.parse(Buffer.from(options.cursor, 'base64url').toString('utf8')),
    );
    if (cursor.query !== identity)
      throw new Error('Cursor does not belong to this query and scope');
    where.push(
      `(${column} ${descending ? '<' : '>'} ? OR (${column} = ? AND i.id > ?))`,
    );
    parameters.push(cursor.value, cursor.value, cursor.id);
  }
  const page = options.page ?? 1;
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger((page - 1) * query.pageSize)
  )
    throw new Error('Invalid page');
  if (options.cursor && options.page !== undefined)
    throw new Error('Cursor and page cannot be combined');
  const offset = (page - 1) * query.pageSize;
  const sql = `SELECT i.id, i.display_name, i.original_name, i.byte_size, i.created_at,
    i.processing_status, i.visibility, i.storage_id, s.enabled, ${column} AS sort_value
    ${from} WHERE ${where.join(' AND ')}
    ORDER BY ${column} ${descending ? 'DESC' : 'ASC'}, i.id ASC LIMIT ? OFFSET ?`;
  return {
    sql,
    parameters: [...parameters, query.pageSize + 1, offset],
    countSql,
    countParameters,
    identity,
    pageSize: query.pageSize,
  };
}

export function executeQuery(
  db: Database.Database,
  query: Query,
  options: { cursor?: string; page?: number } = {},
) {
  const compiled = compileQuery(query, options);
  return db.transaction(() => {
    const rows = db
      .prepare<Parameters, Item>(compiled.sql)
      .all(...compiled.parameters);
    const { total } = db
      .prepare<Parameters, { total: number }>(compiled.countSql)
      .get(...compiled.countParameters)!;
    const items = rows.slice(0, compiled.pageSize);
    const last = items.at(-1);
    const hasMore = rows.length > compiled.pageSize;
    return {
      items,
      total,
      hasMore,
      nextCursor:
        hasMore && last
          ? Buffer.from(
              JSON.stringify({
                query: compiled.identity,
                value: last.sort_value,
                id: last.id,
              }),
            ).toString('base64url')
          : null,
    };
  })();
}
