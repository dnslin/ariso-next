import type { ConnectionReport } from './probe-types.ts';
import { sql } from 'drizzle-orm';
import {
  check,
  integer,
  sqliteTable,
  text,
  index,
} from 'drizzle-orm/sqlite-core';

export const storageConfigs = sqliteTable('storage_configs', {
  id: text('id').primaryKey().notNull(),
  name: text('name').notNull(),
  type: text('type', { enum: ['local', 's3'] }).notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull(),
  localPath: text('local_path'),
  endpoint: text('endpoint'),
  region: text('region'),
  bucket: text('bucket'),
  pathPrefix: text('path_prefix'),
  forcePathStyle: integer('force_path_style', { mode: 'boolean' }),
  accessKeyEncrypted: text('access_key_encrypted'),
  secretKeyEncrypted: text('secret_key_encrypted'),
  configRevision: integer('config_revision').notNull().default(1),
  connectionStatus: text('connection_status', {
    enum: ['untested', 'passed', 'failed'],
  })
    .notNull()
    .default('untested'),
  connectionRevision: integer('connection_revision'),
  connectionReport: text('connection_report', {
    mode: 'json',
  }).$type<ConnectionReport>(),
  connectionTestedAt: integer('connection_tested_at', { mode: 'timestamp_ms' }),
  corsStatus: text('cors_status', {
    enum: ['untested', 'passed', 'failed', 'invalidated'],
  })
    .notNull()
    .default('untested'),
  corsRevision: integer('cors_revision'),
  corsOrigin: text('cors_origin'),
  corsTestedAt: integer('cors_tested_at', { mode: 'timestamp_ms' }),
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

export const storageProbes = sqliteTable(
  'storage_probes',
  {
    id: text('id').primaryKey().notNull(),
    storageId: text('storage_id')
      .notNull()
      .references(() => storageConfigs.id),
    purpose: text('purpose', { enum: ['connection', 'cors'] }).notNull(),
    configRevision: integer('config_revision').notNull(),
    key: text('key').notNull(),
    state: text('state', { enum: ['running', 'cleanup'] }).notNull(),
    stage: text('stage').notNull(),
    objectState: text('object_state', {
      enum: ['planned', 'writing', 'stored'],
    }).notNull(),
    byteSize: integer('byte_size'),
    confirmedAt: integer('confirmed_at', { mode: 'timestamp_ms' }),
    cleanupAttempts: integer('cleanup_attempts').notNull().default(0),
    nextCleanupAt: integer('next_cleanup_at', { mode: 'timestamp_ms' }),
    error: text('error'),
    report: text('report', { mode: 'json' })
      .$type<ConnectionReport>()
      .notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('storage_probes_storage').on(table.storageId)],
);
export type StorageProbe = typeof storageProbes.$inferSelect;
