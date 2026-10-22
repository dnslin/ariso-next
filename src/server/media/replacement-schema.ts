import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
  type DerivedVersionKind,
} from './schema.ts';
import type { inspectImageFile } from './file-formats.ts';
import type { GroupedMetadata, PhotographyFields } from './metadata-values.ts';
import type { ProcessingSnapshot } from './validation.ts';

export type ReplacementMetadata = {
  data: GroupedMetadata;
  photography: PhotographyFields;
  readAt: number;
};
export const mediaReplacements = sqliteTable('media_replacements', {
  jobId: text('job_id')
    .primaryKey()
    .notNull()
    .references(() => mediaJobs.id, { onDelete: 'cascade' }),
  imageId: text('image_id')
    .notNull()
    .references(() => mediaImages.id),
  originalName: text('original_name').notNull(),
  originalObjectId: text('original_object_id').references(
    () => mediaObjects.id,
  ),
  snapshots: text('snapshots', { mode: 'json' })
    .$type<Partial<Record<DerivedVersionKind, ProcessingSnapshot>>>()
    .notNull(),
  facts: text('facts', { mode: 'json' }).$type<
    Awaited<ReturnType<typeof inspectImageFile>>
  >(),
  metadata: text('metadata', { mode: 'json' }).$type<ReplacementMetadata>(),
});
