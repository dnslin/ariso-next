import { randomBytes, randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { asc, count, desc, eq, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { z } from 'zod';
import { albums } from '../collections/schema.ts';
import { requireSiteSettings } from '../site/settings.ts';
import { buildSiteUrl } from '../site/urls.ts';
import { SharingError } from './errors.ts';
import { albumShares, shareGrants, type ShareRecord } from './schema.ts';
import type { SharingTransaction } from './types.ts';
import {
  createShareInputSchema,
  updateShareInputSchema,
} from './validation.ts';

const token = () => randomBytes(32).toString('base64url');

function parseInput<T>(schema: z.ZodType<T>, input: unknown) {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new SharingError(
      'SHARING_INVALID_INPUT',
      parsed.error.issues.map((issue) => issue.message).join('；'),
    );
  return parsed.data;
}

function requireAlbum(tx: SharingTransaction, albumId: string) {
  const album = tx
    .select({ id: albums.id, name: albums.name })
    .from(albums)
    .where(eq(albums.id, albumId))
    .get();
  if (!album)
    throw new SharingError(
      'SHARING_ALBUM_NOT_FOUND',
      '相册不存在或已被删除',
      404,
    );
  return album;
}

function serializeShare(
  row: ShareRecord,
  albumName: string,
  settings: { publicUrl: string },
  now: Date,
) {
  return {
    id: row.id,
    albumId: row.albumId,
    albumName,
    token: row.token,
    url: buildSiteUrl(settings, `/s/${row.token}`),
    enabled: row.enabled,
    hasPassword: row.passwordHash !== null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    layout: row.layout,
    showName: row.showName,
    state: !row.enabled
      ? ('disabled' as const)
      : row.expiresAt !== null && now >= row.expiresAt
        ? ('expired' as const)
        : ('enabled' as const),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function readShare(tx: SharingTransaction, albumId: string) {
  return tx
    .select()
    .from(albumShares)
    .where(eq(albumShares.albumId, albumId))
    .get();
}

function requireShare(tx: SharingTransaction, albumId: string) {
  const row = readShare(tx, albumId);
  if (!row)
    throw new SharingError('SHARING_NOT_FOUND', '相册尚未创建分享', 404);
  return row;
}

function savedExpiry(value: string | null | undefined, now: Date) {
  if (value === undefined || value === null) return value;
  const deadline = new Date(value);
  if (deadline <= now)
    throw new SharingError(
      'SHARING_INVALID_INPUT',
      '新的截止时间必须晚于保存时刻',
    );
  return deadline;
}

export function readOwnerShare(db: BetterSQLite3Database, albumId: string) {
  return db.transaction((tx) => {
    const album = requireAlbum(tx, albumId);
    const row = readShare(tx, albumId);
    return row
      ? serializeShare(row, album.name, requireSiteSettings(tx), new Date())
      : null;
  });
}

export async function createShare(
  db: BetterSQLite3Database,
  albumId: string,
  input: unknown = {},
) {
  const parsed = parseInput(createShareInputSchema, input);
  const existing = readOwnerShare(db, albumId);
  if (existing) return existing;
  const passwordHash =
    parsed.password?.action === 'set'
      ? await hashPassword(parsed.password.value)
      : null;
  return db.transaction(
    (tx) => {
      const album = requireAlbum(tx, albumId);
      // Another request may have created it while the password was hashing.
      const current = readShare(tx, albumId);
      if (current)
        return serializeShare(
          current,
          album.name,
          requireSiteSettings(tx),
          new Date(),
        );
      const now = new Date();
      const row = tx
        .insert(albumShares)
        .values({
          id: randomUUID(),
          albumId,
          token: token(),
          enabled: true,
          passwordHash,
          expiresAt: savedExpiry(parsed.expiresAt, now) ?? null,
          layout: parsed.layout ?? 'grid',
          showName: parsed.showName ?? false,
          authRevision: 1,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      return serializeShare(row, album.name, requireSiteSettings(tx), now);
    },
    { behavior: 'immediate' },
  );
}

export async function updateShare(
  db: BetterSQLite3Database,
  albumId: string,
  input: unknown,
) {
  const parsed = parseInput(updateShareInputSchema, input);
  const passwordHash =
    parsed.password?.action === 'set'
      ? await hashPassword(parsed.password.value)
      : null;
  return db.transaction(
    (tx) => {
      const album = requireAlbum(tx, albumId);
      const current = requireShare(tx, albumId);
      const now = new Date();
      const expiresAt =
        parsed.expiresAt === undefined
          ? current.expiresAt
          : savedExpiry(parsed.expiresAt, now);
      if (
        parsed.enabled === true &&
        expiresAt !== null &&
        expiresAt !== undefined &&
        expiresAt <= now
      )
        throw new SharingError(
          'SHARING_INVALID_INPUT',
          '启用已过期分享时，请同时延期或移除截止时间',
        );
      const passwordChanged =
        parsed.password !== undefined && parsed.password.action !== 'keep';
      const revoke =
        parsed.enabled === false ||
        passwordChanged ||
        (current.expiresAt !== null && current.expiresAt <= now);
      const changes: Partial<typeof albumShares.$inferInsert> = {
        authRevision: current.authRevision + Number(revoke),
        updatedAt: now,
      };
      if (parsed.enabled !== undefined) changes.enabled = parsed.enabled;
      if (parsed.layout !== undefined) changes.layout = parsed.layout;
      if (parsed.showName !== undefined) changes.showName = parsed.showName;
      if (parsed.expiresAt !== undefined) changes.expiresAt = expiresAt;
      if (passwordChanged) changes.passwordHash = passwordHash;
      const row = tx
        .update(albumShares)
        .set(changes)
        .where(eq(albumShares.id, current.id))
        .returning()
        .get();
      if (revoke)
        tx.delete(shareGrants).where(eq(shareGrants.shareId, current.id)).run();
      return serializeShare(row, album.name, requireSiteSettings(tx), now);
    },
    { behavior: 'immediate' },
  );
}

export function rotateShare(db: BetterSQLite3Database, albumId: string) {
  return db.transaction(
    (tx) => {
      const album = requireAlbum(tx, albumId);
      const current = requireShare(tx, albumId);
      const now = new Date();
      const row = tx
        .update(albumShares)
        .set({
          token: token(),
          authRevision: current.authRevision + 1,
          updatedAt: now,
        })
        .where(eq(albumShares.id, current.id))
        .returning()
        .get();
      tx.delete(shareGrants).where(eq(shareGrants.shareId, current.id)).run();
      return serializeShare(row, album.name, requireSiteSettings(tx), now);
    },
    { behavior: 'immediate' },
  );
}

const querySchema = z.strictObject({
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

export function parseShareQuery(params: URLSearchParams) {
  if ([...params.keys()].some((key) => params.getAll(key).length > 1))
    throw new SharingError('SHARING_INVALID_INPUT', '分享查询参数无效');
  return parseInput(querySchema, Object.fromEntries(params));
}

export function listShares(
  db: BetterSQLite3Database,
  query: ReturnType<typeof parseShareQuery>,
) {
  return db.transaction((tx) => {
    const { q, page, pageSize } = query;
    const filter = q ? sql`instr(${albums.name}, ${q}) > 0` : undefined;
    const total = tx
      .select({ value: count() })
      .from(albumShares)
      .innerJoin(albums, eq(albums.id, albumShares.albumId))
      .where(filter)
      .get()!.value;
    const rows = tx
      .select({ share: albumShares, albumName: albums.name })
      .from(albumShares)
      .innerJoin(albums, eq(albums.id, albumShares.albumId))
      .where(filter)
      .orderBy(desc(albumShares.createdAt), asc(albumShares.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .all();
    const settings = requireSiteSettings(tx);
    const now = new Date();
    return {
      items: rows.map(({ share, albumName }) =>
        serializeShare(share, albumName, settings, now),
      ),
      total,
      page,
      pageSize,
    };
  });
}
