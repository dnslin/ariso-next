import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const siteSettings = sqliteTable(
  'site_settings',
  {
    id: integer('id').primaryKey().notNull().default(1),
    publicUrl: text('public_url').notNull(),
    timeZone: text('time_zone').notNull(),
    name: text('name').notNull().default('Ariso'),
    description: text('description').notNull().default(''),
    logoKey: text('logo_key'),
    logoMime: text('logo_mime'),
    faviconKey: text('favicon_key'),
    faviconMime: text('favicon_mime'),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    check('site_settings_singleton', sql`${table.id} = 1`),
    check(
      'site_settings_logo_pair',
      sql`(${table.logoKey} IS NULL) = (${table.logoMime} IS NULL)`,
    ),
    check(
      'site_settings_favicon_pair',
      sql`(${table.faviconKey} IS NULL) = (${table.faviconMime} IS NULL)`,
    ),
  ],
);

export type SiteSettings = typeof siteSettings.$inferSelect;
