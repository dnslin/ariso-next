import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core';
import { storageConfigs } from '../storage/schema.ts';
import type { GroupedMetadata, PhotographyFields } from './metadata-values.ts';
import { watermarkPositions, type ProcessingSnapshot } from './validation.ts';

export const versionKinds = [
  'original',
  'compressed',
  'thumbnail',
  'watermark',
] as const;
export type VersionKind = (typeof versionKinds)[number];
export type DerivedVersionKind = Exclude<VersionKind, 'original'>;

export const mediaWatermarkAssets = sqliteTable('media_watermark_assets', {
  id: text('id').primaryKey().notNull(),
  path: text('path').notNull().unique(),
  format: text('format', { enum: ['PNG', 'WEBP', 'SVG'] }),
  mime: text('mime'),
  width: integer('width'),
  height: integer('height'),
  byteSize: integer('byte_size').notNull(),
  status: text('status', {
    enum: ['writing', 'ready', 'cleanup_pending', 'cleanup_failed', 'deleted'],
  }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
  error: text('error'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

// Preview owns release after work has settled, including cancellation and recovery.
export const mediaWatermarkPreviewRefs = sqliteTable(
  'media_watermark_preview_refs',
  {
    previewId: text('preview_id').primaryKey().notNull(),
    assetId: text('asset_id')
      .notNull()
      .references(() => mediaWatermarkAssets.id),
  },
);

export const mediaSettings = sqliteTable(
  'media_settings',
  {
    id: integer('id').primaryKey().notNull().default(1),
    compressionEnabled: integer('compression_enabled', {
      mode: 'boolean',
    }).notNull(),
    outputFormat: text('output_format', {
      enum: ['jpeg', 'webp', 'avif'],
    }).notNull(),
    quality: integer('quality').notNull(),
    maxEdge: integer('max_edge'),
    jpegBackground: text('jpeg_background').notNull(),
    watermarkMode: text('watermark_mode', {
      enum: ['off', 'text', 'image'],
    }).notNull(),
    watermarkAssetId: text('watermark_asset_id').references(
      () => mediaWatermarkAssets.id,
    ),
    watermarkText: text('watermark_text').notNull().default(''),
    watermarkFont: text('watermark_font', { enum: ['chinese', 'latin'] })
      .notNull()
      .default('chinese'),
    watermarkFontSize: real('watermark_font_size').notNull().default(3),
    watermarkColor: text('watermark_color').notNull().default('#FFFFFF'),
    watermarkStrokeColor: text('watermark_stroke_color')
      .notNull()
      .default('#000000'),
    watermarkStrokeWidth: real('watermark_stroke_width').notNull().default(0),
    watermarkOpacity: real('watermark_opacity').notNull().default(50),
    watermarkPosition: text('watermark_position', { enum: watermarkPositions })
      .notNull()
      .default('bottom-right'),
    watermarkMargin: real('watermark_margin').notNull().default(2),
    watermarkWidth: real('watermark_width').notNull().default(20),
    defaultLinkVersion: text('default_link_version', {
      enum: ['original', 'compressed', 'watermark'],
    }).notNull(),
    defaultVisibility: text('default_visibility', {
      enum: ['public', 'private'],
    }).notNull(),
    concurrency: integer('concurrency').notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [check('media_settings_singleton', sql`${t.id} = 1`)],
);

export const mediaImages = sqliteTable(
  'media_images',
  {
    id: text('id').primaryKey().notNull(),
    storageId: text('storage_id')
      .notNull()
      .references(() => storageConfigs.id),
    originalName: text('original_name').notNull(),
    displayName: text('display_name').notNull(),
    visibility: text('visibility', { enum: ['public', 'private'] }).notNull(),
    format: text('format').notNull(),
    mime: text('mime').notNull(),
    width: integer('width'),
    height: integer('height'),
    byteSize: integer('byte_size').notNull(),
    animated: integer('animated', { mode: 'boolean' }),
    pageCount: integer('page_count'),
    classification: text('classification', {
      enum: ['static', 'animated', 'preview_only'],
    }),
    processingStatus: text('processing_status', {
      enum: ['pending', 'processing', 'ready', 'failed'],
    }).notNull(),
    trashedAt: integer('trashed_at', { mode: 'timestamp_ms' }),
    deletionStatus: text('deletion_status', {
      enum: ['deleting', 'cleanup_failed'],
    }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    unique('media_images_storage_identity').on(t.id, t.storageId),
    check(
      'media_images_visibility',
      sql`${t.visibility} in ('public', 'private')`,
    ),
    check(
      'media_images_processing_status',
      sql`${t.processingStatus} in ('pending', 'processing', 'ready', 'failed')`,
    ),
    check(
      'media_images_deletion_status',
      sql`${t.deletionStatus} in ('deleting', 'cleanup_failed')`,
    ),
  ],
);

export const mediaJobs = sqliteTable(
  'media_jobs',
  {
    id: text('id').primaryKey().notNull(),
    imageId: text('image_id')
      .notNull()
      .references(() => mediaImages.id),
    kind: text('kind', { enum: ['process', 'metadata'] }).notNull(),
    scope: text('scope', {
      enum: ['all', 'compressed', 'thumbnail', 'watermark'],
    }).notNull(),
    snapshot: text('snapshot', { mode: 'json' })
      .$type<ProcessingSnapshot>()
      .notNull(),
    expectedVersions: text('expected_versions', { mode: 'json' })
      .$type<DerivedVersionKind[]>()
      .notNull(),
    status: text('status', {
      enum: ['queued', 'running', 'succeeded', 'failed', 'cancelled'],
    }).notNull(),
    error: text('error'),
    step: text('step').notNull().default('identify'),
    retryCount: integer('retry_count').notNull().default(0),
    recoveryCount: integer('recovery_count').notNull().default(0),
    nextAttemptAt: integer('next_attempt_at', { mode: 'timestamp_ms' }),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }),
    finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    unique('media_jobs_image_identity').on(t.id, t.imageId),
    index('media_jobs_image_created').on(t.imageId, t.createdAt),
    check(
      'media_jobs_status',
      sql`${t.status} in ('queued', 'running', 'succeeded', 'failed', 'cancelled')`,
    ),
  ],
);

export const mediaObjects = sqliteTable(
  'media_objects',
  {
    id: text('id').primaryKey().notNull(),
    imageId: text('image_id').notNull(),
    jobId: text('job_id'),
    storageId: text('storage_id').notNull(),
    key: text('key').notNull(),
    purpose: text('purpose', {
      enum: [...versionKinds, 'temporary'],
    }).notNull(),
    status: text('status', {
      enum: [
        'planned',
        'writing',
        'stored',
        'cleanup_pending',
        'cleanup_failed',
        'deleted',
      ],
    }).notNull(),
    byteSize: integer('byte_size'),
    width: integer('width'),
    height: integer('height'),
    format: text('format'),
    mime: text('mime'),
    error: text('error'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    unique('media_objects_storage_key').on(t.storageId, t.key),
    unique('media_objects_version_identity').on(t.imageId, t.id, t.purpose),
    foreignKey({
      columns: [t.imageId, t.storageId],
      foreignColumns: [mediaImages.id, mediaImages.storageId],
    }),
    foreignKey({
      columns: [t.jobId, t.imageId],
      foreignColumns: [mediaJobs.id, mediaJobs.imageId],
    }),
    check(
      'media_objects_status',
      sql`${t.status} in ('planned', 'writing', 'stored', 'cleanup_pending', 'cleanup_failed', 'deleted')`,
    ),
  ],
);

export const mediaVersions = sqliteTable(
  'media_versions',
  {
    imageId: text('image_id')
      .notNull()
      .references(() => mediaImages.id),
    kind: text('kind', { enum: versionKinds }).notNull(),
    objectId: text('object_id').notNull(),
    width: integer('width'),
    height: integer('height'),
    byteSize: integer('byte_size').notNull(),
    format: text('format').notNull(),
    mime: text('mime').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.imageId, t.kind] }),
    foreignKey({
      columns: [t.imageId, t.objectId, t.kind],
      foreignColumns: [
        mediaObjects.imageId,
        mediaObjects.id,
        mediaObjects.purpose,
      ],
    }),
    check(
      'media_versions_kind',
      sql`${t.kind} in ('original', 'compressed', 'thumbnail', 'watermark')`,
    ),
  ],
);

/** One latest attempt and one last successful result per image. */
export const mediaMetadata = sqliteTable('media_metadata', {
  imageId: text('image_id')
    .primaryKey()
    .notNull()
    .references(() => mediaImages.id),
  status: text('status', {
    enum: ['queued', 'running', 'succeeded', 'failed'],
  }).notNull(),
  data: text('data', { mode: 'json' }).$type<GroupedMetadata>(),
  photography: text('photography', { mode: 'json' }).$type<PhotographyFields>(),
  readAt: integer('read_at', { mode: 'timestamp_ms' }),
  attemptedAt: integer('attempted_at', { mode: 'timestamp_ms' }),
  error: text('error'),
});
