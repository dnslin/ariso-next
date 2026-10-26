import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import type { ImageEditRecipe } from '../../shared/image-editing.ts';
import type { WatermarkAssetSnapshot } from './validation.ts';
import { mediaJobs, mediaObjects, mediaWatermarkAssets } from './schema.ts';

export const mediaEditTemplates = sqliteTable(
  'media_edit_templates',
  {
    id: text('id').primaryKey().notNull(),
    name: text('name').notNull(),
    recipe: text('recipe', { mode: 'json' }).$type<ImageEditRecipe>().notNull(),
    watermarkAssetId: text('watermark_asset_id').references(
      () => mediaWatermarkAssets.id,
    ),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('media_edit_templates_asset').on(table.watermarkAssetId)],
);

export const mediaEditRequests = sqliteTable(
  'media_edit_requests',
  {
    id: text('id').primaryKey().notNull(),
    jobId: text('job_id')
      .notNull()
      .references(() => mediaJobs.id, { onDelete: 'cascade' }),
    // Source identity is a historical value. Only active jobs retain its bytes.
    sourceImageId: text('source_image_id').notNull(),
    sourceObjectId: text('source_object_id').notNull(),
    mode: text('mode', { enum: ['copy', 'overwrite'] }).notNull(),
    recipe: text('recipe', { mode: 'json' }).$type<ImageEditRecipe>().notNull(),
    watermarkAsset: text('watermark_asset', {
      mode: 'json',
    }).$type<WatermarkAssetSnapshot>(),
    renderedObjectId: text('rendered_object_id').references(
      () => mediaObjects.id,
      { onDelete: 'set null' },
    ),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('media_edit_requests_job').on(table.jobId),
    index('media_edit_requests_source').on(table.sourceObjectId),
    index('media_edit_requests_source_image').on(table.sourceImageId),
  ],
);
