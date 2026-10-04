import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { z } from 'zod';
import { storageConfigs } from '../storage/schema.ts';
import { mediaImages, mediaJobs, type DerivedVersionKind } from './schema.ts';
import { createProcessingSnapshot, requireMediaSettings } from './settings.ts';
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

/** Shared by the command and owner detail; describes current rules without creating a task. */
export function reprocessUnavailableError(
  image: Pick<
    typeof mediaImages.$inferSelect,
    'trashedAt' | 'deletionStatus' | 'processingStatus' | 'classification'
  >,
  storage: Pick<typeof storageConfigs.$inferSelect, 'id' | 'enabled' | 'type'>,
  hasActiveJob: boolean,
  settings: Pick<ProcessingSnapshot, 'compressionEnabled' | 'watermarkMode'>,
  scope: ReprocessScope,
): MediaReprocessError | null {
  if (image.trashedAt || image.deletionStatus)
    return new MediaReprocessError(
      'MEDIA_IMAGE_UNAVAILABLE',
      409,
      '请先恢复图片；正在永久删除的图片不能重新处理',
    );
  if (!storage.enabled)
    return new MediaReprocessError(
      'STORAGE_DISABLED',
      409,
      `存储已停用：${storage.id}`,
    );
  if (hasActiveJob)
    return new MediaReprocessError(
      'MEDIA_JOB_CONFLICT',
      409,
      '图片已有活动内容任务',
    );
  if (image.processingStatus !== 'ready' && image.processingStatus !== 'failed')
    return new MediaReprocessError(
      'MEDIA_IMAGE_UNAVAILABLE',
      409,
      '图片尚未完成首次处理',
    );
  if (image.processingStatus === 'failed' && scope !== 'all')
    return new MediaReprocessError(
      'MEDIA_REPROCESS_SCOPE',
      409,
      '失败图片只接受全部派生重试',
    );
  if (
    (scope === 'compressed' && !settings.compressionEnabled) ||
    (scope === 'watermark' && settings.watermarkMode === 'off')
  )
    return new MediaReprocessError(
      'MEDIA_REPROCESS_DISABLED',
      409,
      '对应处理开关已关闭',
    );
  if (
    (scope === 'compressed' || scope === 'watermark') &&
    image.classification !== 'static'
  )
    return new MediaReprocessError(
      'MEDIA_REPROCESS_NOT_APPLICABLE',
      409,
      '当前图片格式不适用所选范围',
    );
  return null;
}

/** Accept only a new immutable snapshot, in the same transaction as lifecycle checks. */
export function requestReprocess(
  db: BetterSQLite3Database,
  imageId: string,
  input: unknown = {},
  jobId: string = randomUUID(),
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
      const storage = tx
        .select()
        .from(storageConfigs)
        .where(eq(storageConfigs.id, image.storageId))
        .get()!;
      const active = tx
        .select({ id: mediaJobs.id })
        .from(mediaJobs)
        .where(
          and(
            eq(mediaJobs.imageId, imageId),
            inArray(mediaJobs.status, ['queued', 'running']),
          ),
        )
        .get();
      const unavailable = reprocessUnavailableError(
        image,
        storage,
        active !== undefined,
        requireMediaSettings(tx),
        scope,
      );
      if (unavailable) throw unavailable;
      const snapshot = createProcessingSnapshot(tx);
      const expectedVersions = reprocessVersions(
        scope,
        image.classification,
        snapshot,
      );
      const now = new Date();
      tx.insert(mediaJobs)
        .values({
          id: jobId,
          imageId,
          kind: 'process',
          scope,
          snapshot,
          expectedVersions,
          status: 'queued',
          createdAt: now,
          updatedAt: now,
        })
        .run();
      return { jobId, status: 'queued' as const, scope, expectedVersions };
    },
    { behavior: 'immediate' },
  );
}
