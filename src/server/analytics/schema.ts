import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';

export const analyticsDaily = sqliteTable(
  'analytics_daily',
  {
    date: text('date').notNull(),
    timezone: text('timezone').notNull(),
    version: text('version', {
      enum: ['original', 'compressed', 'watermark'],
    }).notNull(),
    count: integer('count').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.date, table.timezone, table.version] }),
    check(
      'analytics_daily_version',
      sql`${table.version} IN ('original', 'compressed', 'watermark')`,
    ),
  ],
);

// Historical image IDs deliberately have no media foreign key.
export const analyticsImageDaily = sqliteTable(
  'analytics_image_daily',
  {
    imageId: text('image_id').notNull(),
    date: text('date').notNull(),
    timezone: text('timezone').notNull(),
    count: integer('count').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.imageId, table.date, table.timezone] }),
    index('analytics_image_daily_date_image_idx').on(table.date, table.imageId),
  ],
);

export const analyticsImageTotals = sqliteTable('analytics_image_totals', {
  imageId: text('image_id').primaryKey().notNull(),
  originalCount: integer('original_count').notNull().default(0),
  compressedCount: integer('compressed_count').notNull().default(0),
  watermarkCount: integer('watermark_count').notNull().default(0),
});
