import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { z } from 'zod';
import { storageConfigs } from '../storage/schema.ts';
import { mediaImages, mediaJobs, type DerivedVersionKind } from './schema.ts';
import { createProcessingSnapshot } from './settings.ts';
import type { ProcessingSnapshot } from './validation.ts';

export const reprocessInputSchema = z.strictObject({
  scope: z.enum(['all', 'compressed', 'thumbnail', 'watermark']).default('all'),
});
export type ReprocessScope = z.infer<typeof reprocessInputSchema>['scope'];

export class MediaReprocessError extends Error {
  readonly code: string;
  readonly status: 404 | 409;

  constructor(code: string, status: 404 | 409, message: string) {
    super(message);
    this.name = 'MediaReprocessError';
    this.code = code;
    this.status = status;
  }
}

export function reprocessVersions(
  scope: ReprocessScope,
  classification: (typeof mediaImages.$inferSelect)['classification'],
  snapshot: Pick<ProcessingSnapshot, 'compressionEnabled' | 'watermarkMode'>,
): DerivedVersionKind[] {
  if (scope !== 'all') return [scope];
  return [
    ...(classification === 'static' && snapshot.compressionEnabled
      ? ['compressed' as const]
      : []),
    'thumbnail',
    ...(classification === 'static' && snapshot.watermarkMode !== 'off'
      ? ['watermark' as const]
      : []),
  ];
}

/** Execution includes an unpublished compression step for watermark-only work. */
export function mediaJobSteps(
  job: Pick<
    typeof mediaJobs.$inferSelect,
    'scope' | 'snapshot' | 'expectedVersions'
  >,
): DerivedVersionKind[] {
  return job.scope === 'watermark' && job.snapshot.compressionEnabled
    ? ['compressed', ...job.expectedVersions]
    : job.expectedVersions;
}

/** Accept only a new immutable snapshot, in the same transaction as lifecycle checks. */
export function requestReprocess(
  db: BetterSQLite3Database,
  imageId: string,
  input: unknown = {},
) {
  const { scope } = reprocessInputSchema.parse(input);
  return db.transaction(
    (tx) => {
      const image = tx
        .select()
        .from(mediaImages)
        .where(eq(mediaImages.id, imageId))
        .get();
      if (!image)
        throw new MediaReprocessError(
          'MEDIA_IMAGE_NOT_FOUND',
          404,
          `图片不存在：${imageId}`,
        );
      if (image.trashedAt || image.deletionStatus)
        throw new MediaReprocessError(
          'MEDIA_IMAGE_UNAVAILABLE',
          409,
          '请先恢复图片；正在永久删除的图片不能重新处理',
        );
      const storage = tx
        .select()
        .from(storageConfigs)
        .where(eq(storageConfigs.id, image.storageId))
        .get()!;
      if (!storage.enabled)
        throw new MediaReprocessError(
          'STORAGE_DISABLED',
          409,
          `存储已停用：${storage.id}`,
        );
      if (storage.type !== 'local')
        throw new MediaReprocessError(
          'STORAGE_TYPE_UNSUPPORTED',
          409,
          '当前重处理仅支持本地存储',
        );
      if (
        tx
          .select()
          .from(mediaJobs)
          .where(
            and(
              eq(mediaJobs.imageId, imageId),
              inArray(mediaJobs.status, ['queued', 'running']),
            ),
          )
          .get()
      )
        throw new MediaReprocessError(
          'MEDIA_JOB_CONFLICT',
          409,
          '图片已有活动内容任务',
        );
      if (
        image.processingStatus !== 'ready' &&
        image.processingStatus !== 'failed'
      )
        throw new MediaReprocessError(
          'MEDIA_IMAGE_UNAVAILABLE',
          409,
          '图片尚未完成首次处理',
        );
      if (image.processingStatus === 'failed' && scope !== 'all')
        throw new MediaReprocessError(
          'MEDIA_REPROCESS_SCOPE',
          409,
          '失败图片只接受全部派生重试',
        );
      const snapshot = createProcessingSnapshot(tx);
      if (
        (scope === 'compressed' && !snapshot.compressionEnabled) ||
        (scope === 'watermark' && snapshot.watermarkMode === 'off')
      )
        throw new MediaReprocessError(
          'MEDIA_REPROCESS_DISABLED',
          409,
          '对应处理开关已关闭',
        );
      if (
        (scope === 'compressed' || scope === 'watermark') &&
        image.classification !== 'static'
      )
        throw new MediaReprocessError(
          'MEDIA_REPROCESS_NOT_APPLICABLE',
          409,
          '当前图片格式不适用所选范围',
        );
      const now = new Date();
      const jobId = randomUUID();
      tx.insert(mediaJobs)
        .values({
          id: jobId,
          imageId,
          kind: 'process',
          scope,
          snapshot,
          expectedVersions: reprocessVersions(
            scope,
            image.classification,
            snapshot,
          ),
          status: 'queued',
          createdAt: now,
          updatedAt: now,
        })
        .run();
      return { jobId, status: 'queued' as const };
    },
    { behavior: 'immediate' },
  );
}
