import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const storageConfigs = sqliteTable('storage_configs', {
  id: text('id').primaryKey().notNull(),
  name: text('name').notNull(),
  type: text('type', { enum: ['local'] }).notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull(),
  localPath: text('local_path').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const storageSettings = sqliteTable(
  'storage_settings',
  {
    id: integer('id').primaryKey().notNull().default(1),
    defaultStorageId: text('default_storage_id').references(
      () => storageConfigs.id,
    ),
  },
  (table) => [check('storage_settings_singleton', sql`${table.id} = 1`)],
);

export type StorageConfig = typeof storageConfigs.$inferSelect;
