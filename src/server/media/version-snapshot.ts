import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import {
  mediaJobs,
  mediaObjects,
  mediaWatermarkAssets,
  type DerivedVersionKind,
} from './schema.ts';
import { mediaReplacements } from './replacement-schema.ts';
import { MediaReprocessError } from './reprocess.ts';

/** A current derived version retains the recipe that produced its visible content. */
export function publishedVersionSnapshot(
  db: BetterSQLite3Database,
  objectId: string,
  kind: DerivedVersionKind,
) {
  const row = db
    .select({ job: mediaJobs })
    .from(mediaObjects)
    .innerJoin(mediaJobs, eq(mediaJobs.id, mediaObjects.jobId))
    .where(eq(mediaObjects.id, objectId))
    .get();
  if (!row)
    throw new MediaReprocessError(
      'MEDIA_REPLACEMENT_RECIPE_MISSING',
      409,
      '当前版本缺少处理记录，不能在保留外链的同时重建',
    );
  if (row.job.kind === 'replace') {
    const recipe = db
      .select()
      .from(mediaReplacements)
      .where(eq(mediaReplacements.jobId, row.job.id))
      .get()?.snapshots[kind];
    if (!recipe)
      throw new MediaReprocessError(
        'MEDIA_REPLACEMENT_RECIPE_MISSING',
        409,
        '当前版本缺少替换处理记录',
      );
    if (kind === 'watermark') requireWatermarkAsset(db, recipe);
    return recipe;
  }
  if (kind === 'watermark') requireWatermarkAsset(db, row.job.snapshot);
  return row.job.snapshot;
}

function requireWatermarkAsset(
  db: BetterSQLite3Database,
  recipe: typeof mediaJobs.$inferSelect.snapshot,
) {
  if (recipe.watermarkMode !== 'image' || !recipe.watermarkAsset) return;
  const asset = db
    .select()
    .from(mediaWatermarkAssets)
    .where(eq(mediaWatermarkAssets.id, recipe.watermarkAsset.id))
    .get();
  if (asset?.status !== 'ready')
    throw new MediaReprocessError(
      'MEDIA_REPLACEMENT_WATERMARK_MISSING',
      409,
      '当前水印版本的素材已不可用，无法重建；请将新内容上传为新图片',
    );
}
