import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const accessProtectionSettings = sqliteTable(
  'access_protection_settings',
  {
    id: integer('id').primaryKey().notNull().default(1),
    mode: text('mode', { enum: ['off', 'observe', 'enforce'] })
      .notNull()
      .default('observe'),
    rate: integer('rate').notNull().default(10),
    burst: integer('burst').notNull().default(200),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    check('access_protection_singleton', sql`${table.id} = 1`),
    check(
      'access_protection_mode',
      sql`${table.mode} IN ('off', 'observe', 'enforce')`,
    ),
    check(
      'access_protection_rate',
      sql`typeof(${table.rate}) = 'integer' AND ${table.rate} BETWEEN 1 AND 9007199254740991`,
    ),
    check(
      'access_protection_burst',
      sql`typeof(${table.burst}) = 'integer' AND ${table.burst} BETWEEN 1 AND 9007199254740991`,
    ),
  ],
);
