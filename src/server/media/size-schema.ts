import {
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';
import { mediaImages, mediaJobs, mediaObjects } from './schema.ts';

export {
  sizePresets,
  type SizePreset,
  type SizeVersion,
} from './size-types.ts';

export const mediaSizeVersions = sqliteTable(
  'media_size_versions',
  {
    imageId: text('image_id')
      .notNull()
      .references(() => mediaImages.id),
    sourceVersion: text('source_version', {
      enum: ['compressed', 'watermark'],
    }).notNull(),
    preset: text('preset', { enum: ['small', 'medium', 'large'] }).notNull(),
    sourceObjectId: text('source_object_id')
      .notNull()
      .references(() => mediaObjects.id),
    objectId: text('object_id')
      .notNull()
      .references(() => mediaObjects.id),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.imageId, t.sourceVersion, t.preset] })],
);

export const mediaSizeRequests = sqliteTable('media_size_requests', {
  jobId: text('job_id')
    .primaryKey()
    .notNull()
    .references(() => mediaJobs.id, { onDelete: 'cascade' }),
  sourceVersion: text('source_version', {
    enum: ['compressed', 'watermark'],
  }).notNull(),
  preset: text('preset', { enum: ['small', 'medium', 'large'] }).notNull(),
  sourceObjectId: text('source_object_id')
    .notNull()
    .references(() => mediaObjects.id),
});

export const mediaSizeCandidates = sqliteTable(
  'media_size_candidates',
  {
    jobId: text('job_id')
      .notNull()
      .references(() => mediaJobs.id, { onDelete: 'cascade' }),
    sourceVersion: text('source_version', {
      enum: ['compressed', 'watermark'],
    }).notNull(),
    preset: text('preset', { enum: ['small', 'medium', 'large'] }).notNull(),
    sourceObjectId: text('source_object_id')
      .notNull()
      .references(() => mediaObjects.id),
    objectId: text('object_id')
      .notNull()
      .references(() => mediaObjects.id),
  },
  (t) => [primaryKey({ columns: [t.jobId, t.sourceVersion, t.preset] })],
);
