import { randomUUID } from 'node:crypto';
import { and, eq, inArray, ne } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { z } from 'zod';
import {
  hasImageEdits,
  imageEditRecipeSchema,
} from '../../shared/image-editing.ts';
import { albumImages, imageTags } from '../collections/schema.ts';
import { resolveUploadStorage } from '../storage/defaults.ts';
import { mediaEditRequests } from './editing-schema.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaVersions,
} from './schema.ts';
import { mediaReplacements } from './replacement-schema.ts';
import { replacementAdmission } from './replacement.ts';
import { MediaReprocessError, reprocessVersions } from './reprocess.ts';
import { createProcessingSnapshot, requireMediaSettings } from './settings.ts';
import {
  adoptWatermarkAsset,
  getWatermarkAsset,
  watermarkAssetSnapshot,
} from './watermark-assets.ts';

export const imageEditRequestInputSchema = z.strictObject({
  requestId: z.string().uuid(),
  sourceObjectId: z.string().uuid(),
  mode: z.enum(['copy', 'overwrite']).default('copy'),
  recipe: imageEditRecipeSchema.refine(hasImageEdits, '请先添加打码区域或水印'),
});

function requireImage(db: BetterSQLite3Database, imageId: string) {
  const image = db
    .select()
    .from(mediaImages)
    .where(eq(mediaImages.id, imageId))
    .get();
  if (!image)
    throw new MediaReprocessError('MEDIA_IMAGE_NOT_FOUND', 404, '图片不存在');
  return image;
}
function currentOriginal(db: BetterSQLite3Database, imageId: string) {
  return db
    .select({ object: mediaObjects })
    .from(mediaVersions)
    .innerJoin(mediaObjects, eq(mediaObjects.id, mediaVersions.objectId))
    .where(
      and(
        eq(mediaVersions.imageId, imageId),
        eq(mediaVersions.kind, 'original'),
      ),
    )
    .get()?.object;
}
function activeContentJob(
  db: BetterSQLite3Database,
  imageId: string,
  exceptJobId?: string,
) {
  return db
    .select({ id: mediaJobs.id })
    .from(mediaJobs)
    .where(
      and(
        eq(mediaJobs.imageId, imageId),
        ne(mediaJobs.kind, 'fingerprint'),
        inArray(mediaJobs.status, ['queued', 'running']),
        exceptJobId ? ne(mediaJobs.id, exceptJobId) : undefined,
      ),
    )
    .get();
}

function editStorage(db: BetterSQLite3Database, storageId: string) {
  try {
    return resolveUploadStorage(db, storageId);
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'STORAGE_DISABLED'
    ) {
      throw new MediaReprocessError(
        'STORAGE_DISABLED',
        409,
        '图片所属存储已停用',
      );
    }
    throw error;
  }
}

/** Copy admission does not need the old derived versions' watermark recipes. */
export function requireEditSource(db: BetterSQLite3Database, imageId: string) {
  const image = requireImage(db, imageId);
  if (
    image.trashedAt ||
    image.deletionStatus ||
    image.processingStatus !== 'ready'
  ) {
    throw new MediaReprocessError(
      'MEDIA_IMAGE_UNAVAILABLE',
      409,
      '仅可编辑未回收且已就绪的图片',
    );
  }
  if (
    image.classification !== 'static' ||
    !['JPEG', 'PNG', 'WEBP'].includes(image.format)
  ) {
    throw new MediaReprocessError(
      'MEDIA_EDIT_FORMAT_UNSUPPORTED',
      409,
      '当前仅支持 JPEG、PNG 和静态 WebP 图片编辑',
    );
  }
  const storage = editStorage(db, image.storageId);
  if (activeContentJob(db, imageId))
    throw new MediaReprocessError(
      'MEDIA_JOB_CONFLICT',
      409,
      '图片已有活动内容任务',
    );
  const original = currentOriginal(db, imageId);
  if (!original || original.status !== 'stored')
    throw new MediaReprocessError(
      'MEDIA_EDIT_SOURCE_UNAVAILABLE',
      409,
      '当前原图尚不可用',
    );
  return { image, original, storage };
}

export function readImageEditContext(
  db: BetterSQLite3Database,
  imageId: string,
) {
  const image = requireImage(db, imageId);
  let unavailableReason: string | null = null;
  let sourceObjectId: string | null = null;
  try {
    sourceObjectId = requireEditSource(db, imageId).original.id;
  } catch (error) {
    if (!(error instanceof MediaReprocessError) || error.status !== 409)
      throw error;
    unavailableReason = error.message;
  }
  return {
    imageId,
    name: image.displayName,
    format: image.format,
    mime: image.mime,
    width: image.width,
    height: image.height,
    sourceObjectId,
    sourceUrl: sourceObjectId
      ? `/api/images/${imageId}/edit/source?objectId=${encodeURIComponent(sourceObjectId)}`
      : null,
    watermarkPreview: {
      copy:
        sourceObjectId !== null &&
        requireMediaSettings(db).watermarkMode !== 'off',
      overwrite:
        sourceObjectId !== null &&
        db
          .select({ id: mediaVersions.objectId })
          .from(mediaVersions)
          .where(
            and(
              eq(mediaVersions.imageId, imageId),
              eq(mediaVersions.kind, 'watermark'),
            ),
          )
          .get() !== undefined,
    },
    unavailableReason,
  };
}

export function readImageEditRequest(
  db: BetterSQLite3Database,
  requestId: string,
) {
  const row = db
    .select({ request: mediaEditRequests, job: mediaJobs })
    .from(mediaEditRequests)
    .innerJoin(mediaJobs, eq(mediaJobs.id, mediaEditRequests.jobId))
    .where(eq(mediaEditRequests.id, requestId))
    .get();
  if (!row)
    throw new MediaReprocessError(
      'MEDIA_EDIT_NOT_FOUND',
      404,
      '图片编辑任务不存在',
    );
  return {
    requestId: row.request.id,
    jobId: row.job.id,
    sourceImageId: row.request.sourceImageId,
    resultImageId: row.job.imageId,
    mode: row.request.mode,
    status: row.job.status,
    step: row.job.step,
    error: row.job.error,
    finishedAt: row.job.finishedAt?.toISOString() ?? null,
  };
}

export function requestImageEdit(
  db: BetterSQLite3Database,
  imageId: string,
  input: unknown,
) {
  const parsed = imageEditRequestInputSchema.parse(input);
  return db.transaction(
    (tx) => {
      const previous = tx
        .select()
        .from(mediaEditRequests)
        .where(eq(mediaEditRequests.id, parsed.requestId))
        .get();
      if (previous) {
        if (
          previous.sourceImageId !== imageId ||
          previous.sourceObjectId !== parsed.sourceObjectId ||
          previous.mode !== parsed.mode ||
          JSON.stringify(previous.recipe) !== JSON.stringify(parsed.recipe)
        ) {
          throw new MediaReprocessError(
            'MEDIA_EDIT_REQUEST_CONFLICT',
            409,
            '同一请求标识不能用于不同图片编辑内容',
          );
        }
        return readImageEditRequest(tx, previous.id);
      }
      const { image, original } = requireEditSource(tx, imageId);
      if (original.id !== parsed.sourceObjectId)
        throw new MediaReprocessError(
          'MEDIA_EDIT_SOURCE_CHANGED',
          409,
          '原图已经变化，请重新打开编辑器',
        );
      const overwrite =
        parsed.mode === 'overwrite' ? replacementAdmission(tx, imageId) : null;
      const snapshot = overwrite
        ? (overwrite.snapshots.watermark ??
          overwrite.snapshots.compressed ??
          overwrite.snapshots.thumbnail ??
          createProcessingSnapshot(tx))
        : createProcessingSnapshot(tx);
      const watermark = parsed.recipe.watermark;
      const watermarkAsset =
        watermark.enabled && watermark.kind === 'image'
          ? watermarkAssetSnapshot(tx, watermark.assetId!)
          : null;
      if (watermarkAsset) adoptWatermarkAsset(tx, watermarkAsset.id);
      const now = new Date();
      const jobId = randomUUID();
      const resultImageId = overwrite ? imageId : randomUUID();
      if (!overwrite) {
        const suffix =
          image.format === 'JPEG' ? 'jpg' : image.format.toLowerCase();
        tx.insert(mediaImages)
          .values({
            id: resultImageId,
            storageId: image.storageId,
            originalName: `${image.displayName}-编辑.${suffix}`,
            displayName: `${image.displayName}-编辑`,
            visibility: image.visibility,
            format: image.format,
            mime: image.mime,
            width: image.width,
            height: image.height,
            byteSize: 0,
            animated: false,
            pageCount: 1,
            classification: 'static',
            processingStatus: 'pending',
            createdAt: now,
            updatedAt: now,
          })
          .run();
        const albumRows = tx
          .select({ albumId: albumImages.albumId })
          .from(albumImages)
          .where(eq(albumImages.imageId, imageId))
          .all();
        if (albumRows.length)
          tx.insert(albumImages)
            .values(
              albumRows.map(({ albumId }) => ({
                albumId,
                imageId: resultImageId,
                joinedAt: now,
              })),
            )
            .run();
        const tagRows = tx
          .select({ tagId: imageTags.tagId })
          .from(imageTags)
          .where(eq(imageTags.imageId, imageId))
          .all();
        if (tagRows.length)
          tx.insert(imageTags)
            .values(
              tagRows.map(({ tagId }) => ({ tagId, imageId: resultImageId })),
            )
            .run();
      }
      tx.insert(mediaJobs)
        .values({
          id: jobId,
          imageId: resultImageId,
          kind: overwrite ? 'replace' : 'process',
          scope: 'all',
          snapshot,
          expectedVersions: overwrite
            ? overwrite.expectedVersions
            : reprocessVersions('all', 'static', snapshot),
          status: 'queued',
          step: 'editing',
          createdAt: now,
          updatedAt: now,
        })
        .run();
      if (overwrite)
        tx.insert(mediaReplacements)
          .values({
            jobId,
            imageId,
            originalName: image.originalName,
            snapshots: overwrite.snapshots,
          })
          .run();
      tx.insert(mediaEditRequests)
        .values({
          id: parsed.requestId,
          jobId,
          sourceImageId: imageId,
          sourceObjectId: original.id,
          mode: parsed.mode,
          recipe: parsed.recipe,
          watermarkAsset,
          createdAt: now,
        })
        .run();
      return readImageEditRequest(tx, parsed.requestId);
    },
    { behavior: 'immediate' },
  );
}

/** Retry the accepted intent; never create another result image. */
export function retryImageEdit(db: BetterSQLite3Database, requestId: string) {
  return db.transaction(
    (tx) => {
      const result = readImageEditRequest(tx, requestId);
      if (['queued', 'running', 'succeeded'].includes(result.status))
        return result;
      const request = tx
        .select()
        .from(mediaEditRequests)
        .where(eq(mediaEditRequests.id, requestId))
        .get()!;
      const image = requireImage(tx, result.resultImageId);
      if (image.trashedAt || image.deletionStatus)
        throw new MediaReprocessError(
          'MEDIA_IMAGE_UNAVAILABLE',
          409,
          '请先恢复图片，正在永久删除的图片不能重试编辑',
        );
      const published = currentOriginal(tx, image.id);
      if (
        (request.mode === 'overwrite' &&
          published?.id !== request.sourceObjectId) ||
        (request.mode === 'copy' &&
          published &&
          published.id !== request.renderedObjectId)
      ) {
        throw new MediaReprocessError(
          'MEDIA_EDIT_RESULT_CHANGED',
          409,
          '图片已被其他操作修改，请重新打开编辑器',
        );
      }
      editStorage(tx, image.storageId);
      if (activeContentJob(tx, image.id, result.jobId))
        throw new MediaReprocessError(
          'MEDIA_JOB_CONFLICT',
          409,
          '图片已有活动内容任务',
        );
      const rendered = request.renderedObjectId
        ? tx
            .select()
            .from(mediaObjects)
            .where(eq(mediaObjects.id, request.renderedObjectId))
            .get()
        : undefined;
      const reusable =
        rendered?.status === 'stored' &&
        (request.mode === 'overwrite' ||
          currentOriginal(tx, image.id)?.id === rendered.id);
      if (!reusable) {
        const source = tx
          .select()
          .from(mediaObjects)
          .where(eq(mediaObjects.id, request.sourceObjectId))
          .get();
        const sourceImage = tx
          .select({ deletionStatus: mediaImages.deletionStatus })
          .from(mediaImages)
          .where(eq(mediaImages.id, request.sourceImageId))
          .get();
        if (
          !source ||
          source.status !== 'stored' ||
          !sourceImage ||
          sourceImage.deletionStatus ||
          currentOriginal(tx, request.sourceImageId)?.id !==
            request.sourceObjectId
        )
          throw new MediaReprocessError(
            'MEDIA_EDIT_SOURCE_UNAVAILABLE',
            409,
            '编辑所需原图已不可用，请重新选择图片',
          );
        if (
          request.watermarkAsset &&
          getWatermarkAsset(tx, request.watermarkAsset.id)?.status !== 'ready'
        )
          throw new MediaReprocessError(
            'MEDIA_WATERMARK_UNAVAILABLE',
            409,
            '编辑所需水印素材已不可用，请重新选择素材',
          );
      }
      const now = new Date();
      tx.update(mediaJobs)
        .set({
          status: 'queued',
          step: reusable ? 'identify' : 'editing',
          error: null,
          metadataWarning: null,
          retryCount: 0,
          recoveryCount: 0,
          nextAttemptAt: null,
          startedAt: null,
          finishedAt: null,
          updatedAt: now,
        })
        .where(eq(mediaJobs.id, result.jobId))
        .run();
      if (image.processingStatus !== 'ready')
        tx.update(mediaImages)
          .set({ processingStatus: 'pending', updatedAt: now })
          .where(eq(mediaImages.id, image.id))
          .run();
      return readImageEditRequest(tx, requestId);
    },
    { behavior: 'immediate' },
  );
}
