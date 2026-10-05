import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core';
import { albums } from '../collections/schema.ts';

export const albumShares = sqliteTable(
  'album_shares',
  {
    id: text('id').primaryKey().notNull(),
    albumId: text('album_id')
      .notNull()
      .references(() => albums.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull(),
    passwordHash: text('password_hash'),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
    layout: text('layout', { enum: ['grid', 'masonry'] }).notNull(),
    showName: integer('show_name', { mode: 'boolean' }).notNull(),
    authRevision: integer('auth_revision').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    unique('album_shares_album').on(table.albumId),
    unique('album_shares_token').on(table.token),
    check('album_shares_layout', sql`${table.layout} IN ('grid', 'masonry')`),
  ],
);

export const shareGrants = sqliteTable(
  'share_grants',
  {
    shareId: text('share_id')
      .notNull()
      .references(() => albumShares.id, { onDelete: 'cascade' }),
    grantSecretHash: text('grant_secret_hash').notNull(),
    authRevision: integer('auth_revision').notNull(),
    verifiedAt: integer('verified_at', { mode: 'timestamp_ms' }).notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.shareId, table.grantSecretHash] }),
    index('share_grants_expiry').on(table.expiresAt),
  ],
);

export type ShareRecord = typeof albumShares.$inferSelect;
