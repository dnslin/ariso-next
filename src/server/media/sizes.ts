import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { z } from 'zod';
import { storageConfigs } from '../storage/schema.ts';
import { getImageAccessState } from './images.ts';
import { mediaJobs, mediaObjects } from './schema.ts';
import { mediaSizeRequests, mediaSizeVersions } from './size-schema.ts';
import { createProcessingSnapshot } from './settings.ts';
import {
  sizePresets,
  type ImageSizeInput,
  type ImageSizeState,
} from './size-types.ts';

export class ImageSizeError extends Error {
  readonly code: string;
  readonly status: 400 | 404 | 409;

  constructor(code: string, status: 400 | 404 | 409, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
const inputSchema = z.strictObject({
  version: z.enum(['compressed', 'watermark']),
  preset: z.enum(['small', 'medium', 'large']),
});
export function parseImageSizeInput(input: unknown): ImageSizeInput {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success)
    throw new ImageSizeError(
      'MEDIA_SIZE_INVALID',
      400,
      '请选择压缩图或水印图，以及有效的尺寸预设',
    );
  return parsed.data;
}

export function requireSizeSource(
  db: BetterSQLite3Database,
  imageId: string,
  input: ImageSizeInput,
) {
  const state = getImageAccessState(db, imageId);
  if (!state)
    throw new ImageSizeError('MEDIA_IMAGE_NOT_FOUND', 404, '图片不存在');
  const { image } = state;
  if (image.trashedAt || image.deletionStatus)
    throw new ImageSizeError(
      'MEDIA_IMAGE_UNAVAILABLE',
      409,
      '图片已回收或正在删除',
    );
  if (image.processingStatus !== 'ready' || image.classification !== 'static')
    throw new ImageSizeError(
      'MEDIA_SIZE_NOT_APPLICABLE',
      409,
      '尺寸预设仅用于已就绪的静态压缩图或水印图',
    );
  const storage = db
    .select()
    .from(storageConfigs)
    .where(eq(storageConfigs.id, image.storageId))
    .get();
  if (!storage?.enabled)
    throw new ImageSizeError('STORAGE_DISABLED', 409, '图片所属存储已停用');
  const source = state.versions.find(
    (version) => version.kind === input.version,
  )?.saved;
  if (!source)
    throw new ImageSizeError(
      'MEDIA_SIZE_SOURCE_MISSING',
      409,
      '所选版本尚未生成，请先生成该版本',
    );
  return { image, storage, source };
}

export function readImageSize(
  db: BetterSQLite3Database,
  imageId: string,
  value: unknown,
): ImageSizeState {
  const input = parseImageSizeInput(value);
  const { source } = requireSizeSource(db, imageId, input);
  const saved = db
    .select({ size: mediaSizeVersions, object: mediaObjects })
    .from(mediaSizeVersions)
    .innerJoin(mediaObjects, eq(mediaObjects.id, mediaSizeVersions.objectId))
    .where(
      and(
        eq(mediaSizeVersions.imageId, imageId),
        eq(mediaSizeVersions.sourceVersion, input.version),
        eq(mediaSizeVersions.preset, input.preset),
        eq(mediaSizeVersions.sourceObjectId, source.object.id),
        eq(mediaObjects.status, 'stored'),
      ),
    )
    .get();
  if (saved)
    return {
      ...input,
      status: 'ready',
      jobId: saved.object.jobId,
      width: saved.object.width,
      height: saved.object.height,
      byteSize: saved.object.byteSize,
      format: saved.object.format,
      error: null,
    };
  const task = db
    .select({ job: mediaJobs })
    .from(mediaSizeRequests)
    .innerJoin(mediaJobs, eq(mediaJobs.id, mediaSizeRequests.jobId))
    .where(
      and(
        eq(mediaJobs.imageId, imageId),
        eq(mediaSizeRequests.sourceVersion, input.version),
        eq(mediaSizeRequests.preset, input.preset),
        eq(mediaSizeRequests.sourceObjectId, source.object.id),
      ),
    )
    .orderBy(desc(mediaJobs.createdAt), desc(mediaJobs.id))
    .get()?.job;
  const edge = sizePresets[input.preset];
  const scale =
    source.version.width && source.version.height
      ? Math.min(
          1,
          edge / Math.max(source.version.width, source.version.height),
        )
      : null;
  return {
    ...input,
    status: !task || task.status === 'succeeded' ? 'missing' : task.status,
    jobId: task?.id ?? null,
    width:
      scale && source.version.width
        ? Math.max(1, Math.round(source.version.width * scale))
        : null,
    height:
      scale && source.version.height
        ? Math.max(1, Math.round(source.version.height * scale))
        : null,
    byteSize: null,
    format: source.version.format,
    error: task?.error ?? null,
  };
}

export function requestImageSize(
  db: BetterSQLite3Database,
  imageId: string,
  value: unknown,
): ImageSizeState {
  const input = parseImageSizeInput(value);
  return db.transaction(
    (tx) => {
      const result = readImageSize(tx, imageId, input);
      if (['ready', 'queued', 'running'].includes(result.status)) return result;
      if (
        tx
          .select({ id: mediaJobs.id })
          .from(mediaJobs)
          .where(
            and(
              eq(mediaJobs.imageId, imageId),
              ne(mediaJobs.kind, 'fingerprint'),
              inArray(mediaJobs.status, ['queued', 'running']),
            ),
          )
          .get()
      )
        throw new ImageSizeError(
          'MEDIA_JOB_CONFLICT',
          409,
          '图片已有活动内容任务，请完成后再生成尺寸',
        );
      const { source } = requireSizeSource(tx, imageId, input);
      const jobId = randomUUID();
      const now = new Date();
      tx.insert(mediaJobs)
        .values({
          id: jobId,
          imageId,
          kind: 'size',
          scope: input.version,
          snapshot: createProcessingSnapshot(tx),
          expectedVersions: [],
          status: 'queued',
          step: 'size',
          createdAt: now,
          updatedAt: now,
        })
        .run();
      tx.insert(mediaSizeRequests)
        .values({
          jobId,
          sourceVersion: input.version,
          preset: input.preset,
          sourceObjectId: source.object.id,
        })
        .run();
      return { ...result, status: 'queued', jobId, error: null };
    },
    { behavior: 'immediate' },
  );
}
