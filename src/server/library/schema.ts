import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { SmartCollectionRules } from './smart-rules.ts';

export const smartCollections = sqliteTable('smart_collections', {
  id: text('id').primaryKey().notNull(),
  name: text('name').notNull(),
  rules: text('rules', { mode: 'json' })
    .$type<SmartCollectionRules>()
    .notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
