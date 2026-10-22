import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { mediaImages } from '../media/schema.ts';

/** One current private-image link. Recreating replaces the token, never its history. */
export const imageShares = sqliteTable(
  'image_shares',
  {
    imageId: text('image_id')
      .primaryKey()
      .notNull()
      .references(() => mediaImages.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    sourceVersion: text('source_version', {
      enum: ['original', 'compressed', 'thumbnail'],
    }).notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    check(
      'image_shares_source_version',
      sql`${table.sourceVersion} IN ('original', 'compressed', 'thumbnail')`,
    ),
  ],
);

export type ImageShareRecord = typeof imageShares.$inferSelect;
