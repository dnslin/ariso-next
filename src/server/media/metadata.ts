import { randomUUID } from 'node:crypto';
import { ExecaError } from 'execa';
import { and, eq, inArray } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { mediaImages, mediaJobs, mediaMetadata } from './schema.ts';
import { storageConfigs } from '../storage/schema.ts';
import { createProcessingSnapshot } from './settings.ts';
import { activeMediaJob } from './steps.ts';
import { analyzeMediaError, mediaError } from './errors.ts';
import { parseMetadata, photographyFields } from './metadata-values.ts';
import { startMediaTool } from './tools.ts';
import type { MediaRuntime } from './process.ts';

export class MediaMetadataError extends Error {
  readonly code: string;
  readonly status: 404 | 409 | 422;

  constructor(code: string, status: 404 | 409 | 422, message: string) {
    super(message);
    this.name = 'MediaMetadataError';
    this.code = code;
    this.status = status;
  }
}

/** Owner-facing callers authorize access before reading these private fields. */
export function readMediaMetadata(db: BetterSQLite3Database, imageId: string) {
  const row = db
    .select()
    .from(mediaMetadata)
    .where(eq(mediaMetadata.imageId, imageId))
    .get();
  return row
    ? { ...row, historical: row.data !== null && row.status !== 'succeeded' }
    : null;
}

export function requestMetadataRead(
  db: BetterSQLite3Database,
  imageId: string,
) {
  return db.transaction(
    (tx) => {
      const image = tx
        .select()
        .from(mediaImages)
        .where(eq(mediaImages.id, imageId))
        .get();
      if (!image)
        throw new MediaMetadataError(
          'MEDIA_IMAGE_NOT_FOUND',
          404,
          `图片不存在：${imageId}`,
        );
      if (image.trashedAt || image.deletionStatus)
        throw new MediaMetadataError(
          'MEDIA_IMAGE_UNAVAILABLE',
          409,
          '请先恢复图片；正在永久删除的图片不能重读元数据',
        );
      const storage = tx
        .select()
        .from(storageConfigs)
        .where(eq(storageConfigs.id, image.storageId))
        .get()!;
      if (!storage.enabled)
        throw new MediaMetadataError(
          'STORAGE_DISABLED',
          409,
          `存储已停用：${storage.id}`,
        );
      const active = tx
        .select()
        .from(mediaJobs)
        .where(
          and(
            eq(mediaJobs.imageId, imageId),
            inArray(mediaJobs.status, ['queued', 'running']),
          ),
        )
        .get();
      if (active) {
        if (active.kind === 'metadata')
          return { jobId: active.id, status: active.status };
        throw new MediaMetadataError(
          'MEDIA_JOB_CONFLICT',
          409,
          '图片已有活动处理任务',
        );
      }
      const now = new Date();
      const jobId = randomUUID();
      tx.insert(mediaJobs)
        .values({
          id: jobId,
          imageId,
          kind: 'metadata',
          scope: 'all',
          snapshot: createProcessingSnapshot(tx),
          expectedVersions: [],
          step: 'metadata',
          status: 'queued',
          createdAt: now,
          updatedAt: now,
        })
        .run();
      tx.insert(mediaMetadata)
        .values({ imageId, status: 'queued' })
        .onConflictDoUpdate({
          target: mediaMetadata.imageId,
          set: { status: 'queued', error: null },
        })
        .run();
      return { jobId, status: 'queued' as const };
    },
    { behavior: 'immediate' },
  );
}

/** Shares the bounded read; standalone rereads publish data and task success together. */
export async function readAndStoreMetadata(
  runtime: MediaRuntime,
  jobId: string,
  sourcePath: string,
  workspace: string,
  signal: AbortSignal,
) {
  const { db, logger } = runtime;
  const { image } = activeMediaJob(db, jobId);
  db.insert(mediaMetadata)
    .values({ imageId: image.id, status: 'running', attemptedAt: new Date() })
    .onConflictDoUpdate({
      target: mediaMetadata.imageId,
      set: { status: 'running', attemptedAt: new Date(), error: null },
    })
    .run();
  let data;
  try {
    signal.throwIfAborted();
    const tool = startMediaTool(
      'exiftool',
      [
        '-json',
        '-a',
        '-G1:3:4',
        '-struct',
        '-api',
        'structformat=jsonq',
        sourcePath,
      ],
      {
        workspace,
        cancelSignal: signal,
        timeout: 30_000,
        maxBuffer: 32 * 1024 * 1024,
        encoding: 'buffer',
      },
    );
    const error = await tool.settled;
    if (error) {
      if (!(error instanceof ExecaError)) throw error;
      // Execa's full message embeds partial stdout, which may contain private GPS/EXIF.
      const diagnostics = [
        error.shortMessage,
        Buffer.from(error.stderr ?? '')
          .toString('utf8')
          .trim(),
      ];
      // An ordinary exit can report its cause only in a complete JSON Error tag.
      // Never parse stdout truncated by timeout, cancellation or the output limit.
      if (
        error.exitCode !== undefined &&
        !error.isMaxBuffer &&
        !error.timedOut &&
        !error.isCanceled
      ) {
        try {
          parseMetadata(Buffer.from(error.stdout ?? '').toString('utf8'));
        } catch (diagnostic) {
          if (!(diagnostic instanceof Error)) throw diagnostic;
          diagnostics.push(diagnostic.message);
        }
      }
      throw mediaError(
        error.isMaxBuffer
          ? 'MEDIA_METADATA_OUTPUT_LIMIT'
          : error.timedOut
            ? 'MEDIA_TOOL_TIMEOUT'
            : (error.code ?? 'MEDIA_METADATA_READ_FAILED'),
        diagnostics.filter(Boolean).join('\n'),
      );
    }
    data = parseMetadata(
      Buffer.from((await tool.child).stdout).toString('utf8'),
    );
  } catch (error) {
    // Shutdown and runtime cancellation belong to job recovery, not a successful processing result.
    if (
      signal.aborted ||
      (error as { code?: string })?.code === 'MEDIA_TOOL_SHUTDOWN_FAILED'
    )
      throw error;
    const diagnostic = `metadata: ${analyzeMediaError(error).diagnostic}`;
    db.transaction((tx) => {
      activeMediaJob(tx, jobId);
      tx.update(mediaMetadata)
        .set({ status: 'failed', error: diagnostic })
        .where(eq(mediaMetadata.imageId, image.id))
        .run();
      tx.update(mediaJobs)
        .set({ metadataWarning: diagnostic })
        .where(eq(mediaJobs.id, jobId))
        .run();
    });
    logger.error(
      { err: error, imageId: image.id, jobId, step: 'metadata', diagnostic },
      'Metadata read failed',
    );
    return { error };
  }
  // Database/storage validity failures are not extraction failures and must remain visible to the job runner.
  db.transaction((tx) => {
    const { job } = activeMediaJob(tx, jobId);
    tx.update(mediaJobs)
      .set({ metadataWarning: null })
      .where(eq(mediaJobs.id, jobId))
      .run();
    const now = new Date();
    tx.update(mediaMetadata)
      .set({
        status: 'succeeded',
        data,
        photography: photographyFields(data),
        readAt: now,
        error: null,
      })
      .where(eq(mediaMetadata.imageId, image.id))
      .run();
    if (job.kind === 'metadata')
      tx.update(mediaJobs)
        .set({
          status: 'succeeded',
          step: 'complete',
          error: null,
          finishedAt: now,
          updatedAt: now,
        })
        .where(eq(mediaJobs.id, jobId))
        .run();
  });
  logger.info(
    { imageId: image.id, jobId, step: 'metadata' },
    'Metadata read completed',
  );
  return { error: null };
}
