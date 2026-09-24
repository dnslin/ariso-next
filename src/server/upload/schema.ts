import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core';
import type { ProcessingSnapshot } from '../media/validation.ts';
import { storageConfigs } from '../storage/schema.ts';

export const uploadSettings = sqliteTable(
  'upload_settings',
  {
    id: integer('id').primaryKey().notNull().default(1),
    maxFileBytes: integer('max_file_bytes').notNull(),
    batchSize: integer('batch_size').notNull(),
    queueLimit: integer('queue_limit').notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [check('upload_settings_singleton', sql`${t.id} = 1`)],
);

export const uploadSubmissions = sqliteTable('upload_submissions', {
  id: text('id').primaryKey().notNull(),
  requestId: text('request_id').notNull().unique(),
  requestInput: text('request_input').notNull(),
  source: text('source', { enum: ['web'] }).notNull(),
  storageId: text('storage_id')
    .notNull()
    .references(() => storageConfigs.id),
  visibility: text('visibility', { enum: ['public', 'private'] }).notNull(),
  snapshot: text('snapshot', { mode: 'json' })
    .$type<ProcessingSnapshot>()
    .notNull(),
  albumIds: text('album_ids', { mode: 'json' }).$type<string[]>().notNull(),
  tagIds: text('tag_ids', { mode: 'json' }).$type<string[]>().notNull(),
  maxFileBytes: integer('max_file_bytes').notNull(),
  batchSize: integer('batch_size').notNull(),
  queueLimit: integer('queue_limit').notNull(),
  lastActivityAt: integer('last_activity_at', {
    mode: 'timestamp_ms',
  }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const sessionStates = [
  'queued',
  'receiving',
  'validating',
  'finalizing',
  'accepted',
  'cancelled',
  'failed',
  'expired',
] as const;
export const uploadSessions = sqliteTable(
  'upload_sessions',
  {
    id: text('id').primaryKey().notNull(),
    submissionId: text('submission_id')
      .notNull()
      .references(() => uploadSubmissions.id),
    queueItemId: text('queue_item_id').notNull(),
    groupIndex: integer('group_index').notNull(),
    originalName: text('original_name').notNull(),
    declaredSize: integer('declared_size').notNull(),
    declaredMime: text('declared_mime'),
    storageId: text('storage_id')
      .notNull()
      .references(() => storageConfigs.id),
    state: text('state', { enum: sessionStates }).notNull(),
    candidateImageId: text('candidate_image_id').notNull(),
    temporaryKey: text('temporary_key'),
    finalKey: text('final_key'),
    byteSize: integer('byte_size'),
    // Historical result identifiers deliberately do not reference mutable media rows.
    imageId: text('image_id'),
    jobId: text('job_id'),
    errorCode: text('error_code'),
    error: text('error'),
    cleanupStatus: text('cleanup_status', {
      enum: ['none', 'pending', 'failed'],
    })
      .notNull()
      .default('none'),
    cleanupAttempts: integer('cleanup_attempts').notNull().default(0),
    nextCleanupAt: integer('next_cleanup_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    unique('upload_sessions_queue_item').on(t.submissionId, t.queueItemId),
    index('upload_sessions_cleanup').on(t.cleanupStatus, t.nextCleanupAt),
    check(
      'upload_sessions_state',
      sql`${t.state} in ('queued', 'receiving', 'validating', 'finalizing', 'accepted', 'cancelled', 'failed', 'expired')`,
    ),
  ],
);
export type UploadSession = typeof uploadSessions.$inferSelect;
export type UploadSubmission = typeof uploadSubmissions.$inferSelect;
