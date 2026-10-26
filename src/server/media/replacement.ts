import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { finished } from 'node:stream/promises';
import { mkdir } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { normalizeOriginalName } from '../upload/validation.ts';
import {
  receiveMultipart,
  MultipartReceiveError,
} from '../upload/multipart.ts';
import { requireUploadSettings } from '../upload/settings.ts';
import { resolveUploadStorage } from '../storage/defaults.ts';
import { createMediaResources } from './resources.ts';
import { identifyImageFile } from './file-formats.ts';
import { discardMediaInput, retainMediaInput } from './input.ts';
import { mediaError, analyzeMediaError } from './errors.ts';
import {
  markUnpublishedMediaObjects,
  planDerivedObject,
  storeMediaObject,
} from './objects.ts';
import { createProcessingSnapshot } from './settings.ts';
import { MediaReprocessError } from './reprocess.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaVersions,
} from './schema.ts';
import { mediaReplacements } from './replacement-schema.ts';
import { publishedVersionSnapshot } from './version-snapshot.ts';
import { writeMediaObject } from './storage.ts';
import type { MediaRuntime } from './process.ts';

export function replacementAdmission(
  db: BetterSQLite3Database,
  imageId: string,
) {
  const image = db
    .select()
    .from(mediaImages)
    .where(eq(mediaImages.id, imageId))
    .get();
  if (!image)
    throw new MediaReprocessError('MEDIA_IMAGE_NOT_FOUND', 404, '图片不存在');
  if (
    image.trashedAt ||
    image.deletionStatus ||
    image.processingStatus !== 'ready'
  )
    throw new MediaReprocessError(
      'MEDIA_IMAGE_UNAVAILABLE',
      409,
      '仅可替换未回收且已就绪的图片',
    );
  let storage: ReturnType<typeof resolveUploadStorage>;
  try {
    storage = resolveUploadStorage(db, image.storageId);
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'STORAGE_DISABLED'
    )
      throw new MediaReprocessError(
        'STORAGE_DISABLED',
        409,
        '图片所属存储已停用',
      );
    throw error;
  }
  if (
    db
      .select()
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
    throw new MediaReprocessError(
      'MEDIA_JOB_CONFLICT',
      409,
      '图片已有活动内容任务',
    );
  const versions = db
    .select()
    .from(mediaVersions)
    .where(eq(mediaVersions.imageId, imageId))
    .all();
  const snapshots: typeof mediaReplacements.$inferInsert.snapshots = {};
  const kinds = ['compressed', 'thumbnail', 'watermark'] as const;
  for (const kind of kinds) {
    const version = versions.find((v) => v.kind === kind);
    if (version)
      snapshots[kind] = publishedVersionSnapshot(db, version.objectId, kind);
  }
  return {
    image,
    storage,
    snapshots,
    expectedVersions: kinds.filter((kind) => snapshots[kind] !== undefined),
  };
}

export function readImageReplacement(
  db: BetterSQLite3Database,
  imageId: string,
) {
  let unavailableReason: string | null = null;
  try {
    replacementAdmission(db, imageId);
  } catch (error) {
    if (!(error instanceof Error && 'status' in error)) throw error;
    if (error.status !== 409) throw error;
    unavailableReason = error.message;
  }
  const job = db
    .select()
    .from(mediaJobs)
    .where(and(eq(mediaJobs.imageId, imageId), eq(mediaJobs.kind, 'replace')))
    .orderBy(desc(mediaJobs.createdAt))
    .get();
  return {
    unavailableReason,
    job: job
      ? {
          id: job.id,
          status: job.status,
          step: job.step,
          error: job.error,
          finishedAt: job.finishedAt?.toISOString() ?? null,
        }
      : null,
  };
}

/** The old asset remains published throughout receiving and processing. */
export async function receiveImageReplacement(
  runtime: MediaRuntime,
  imageId: string,
  request: Request,
  externalSignal?: AbortSignal,
) {
  const { db } = runtime;
  const limits = requireUploadSettings(db);
  const jobId = randomUUID();
  const admitted = db.transaction(
    (tx) => {
      const current = replacementAdmission(tx, imageId);
      const now = new Date();
      tx.insert(mediaJobs)
        .values({
          id: jobId,
          imageId,
          kind: 'replace',
          scope: 'all',
          snapshot:
            current.snapshots.watermark ??
            current.snapshots.compressed ??
            current.snapshots.thumbnail ??
            createProcessingSnapshot(tx),
          expectedVersions: [...current.expectedVersions],
          status: 'running',
          step: 'receiving',
          createdAt: now,
          updatedAt: now,
        })
        .run();
      tx.insert(mediaReplacements)
        .values({
          jobId,
          imageId,
          originalName: '待上传图片',
          snapshots: current.snapshots,
        })
        .run();
      return current;
    },
    { behavior: 'immediate' },
  );
  const signal = externalSignal
    ? AbortSignal.any([request.signal, externalSignal])
    : request.signal;
  const directory = join(runtime.temporaryRoot, 'media-input-' + jobId);
  const source = join(directory, 'source');
  const resources = (runtime.resources ??= createMediaResources());
  let budget: ReturnType<typeof resources.beginStep> | undefined;
  try {
    await mkdir(directory, { recursive: true });
    const { byteSize, sha256 } = await receiveMultipart(request, {
      path: source,
      resources,
      maxBytes: limits.maxFileBytes,
      signal,
      onField() {
        throw new MultipartReceiveError(
          'MEDIA_REPLACEMENT_INPUT',
          400,
          '替换请求只接受一个图片文件',
        );
      },
      onFile(info) {
        db.update(mediaReplacements)
          .set({ originalName: normalizeOriginalName(info.filename) })
          .where(eq(mediaReplacements.jobId, jobId))
          .run();
      },
    });
    const facts = await identifyImageFile(source, directory, signal);
    const path = await retainMediaInput(
      runtime.temporaryRoot,
      jobId,
      source,
      facts,
    );
    const plan = db.transaction((tx) => {
      const job = tx
        .select()
        .from(mediaJobs)
        .where(eq(mediaJobs.id, jobId))
        .get();
      const image = tx
        .select()
        .from(mediaImages)
        .where(eq(mediaImages.id, imageId))
        .get();
      if (
        job?.status !== 'running' ||
        image?.trashedAt ||
        image?.deletionStatus
      )
        throw mediaError('MEDIA_IMAGE_UNAVAILABLE', '图片状态已变化');
      const candidate = planDerivedObject(tx, jobId, 'original');
      tx.update(mediaObjects)
        .set({ status: 'writing', updatedAt: new Date() })
        .where(
          inArray(mediaObjects.id, [
            candidate.objectId,
            ...(candidate.temporaryObjectId
              ? [candidate.temporaryObjectId]
              : []),
          ]),
        )
        .run();
      tx.update(mediaReplacements)
        .set({ originalObjectId: candidate.objectId })
        .where(eq(mediaReplacements.jobId, jobId))
        .run();
      return candidate;
    });
    budget = resources.beginStep({
      temporaryDirectory: directory,
      storageDirectory:
        admitted.storage.type === 'local'
          ? `${runtime.storageRoot}${sep}${admitted.storage.localPath}`
          : directory,
    });
    const writeSignal = AbortSignal.any([signal, budget.signal]);
    const encoded = budget.countOutput(
      createReadStream(path, { signal: writeSignal }),
    );
    const encodedClosed = finished(encoded, { cleanup: true }).catch(
      () => undefined,
    );
    let saved: Awaited<ReturnType<typeof writeMediaObject>>;
    try {
      saved = await writeMediaObject(
        runtime,
        admitted.storage,
        plan,
        encoded,
        facts.mime,
        join(directory, 'remote-original'),
        writeSignal,
      );
    } finally {
      encoded.destroy();
      await encodedClosed;
    }
    db.transaction((tx) => {
      const image = tx
        .select()
        .from(mediaImages)
        .where(eq(mediaImages.id, imageId))
        .get();
      if (image?.trashedAt || image?.deletionStatus)
        throw mediaError('MEDIA_IMAGE_UNAVAILABLE', '图片状态已变化');
      signal.throwIfAborted();
      const now = new Date();
      storeMediaObject(
        tx,
        plan.objectId,
        { byteSize: saved.size, format: facts.format, mime: facts.mime },
        plan.temporaryObjectId,
        now,
      );
      tx.update(mediaObjects)
        .set({ contentSha256: sha256 })
        .where(eq(mediaObjects.id, plan.objectId))
        .run();
      tx.update(mediaJobs)
        .set({
          status: 'queued',
          step: 'identify',
          startedAt: null,
          updatedAt: now,
        })
        .where(eq(mediaJobs.id, jobId))
        .run();
    });
    return { imageId, jobId, status: 'queued' as const, byteSize };
  } catch (error) {
    const cancelled =
      signal.aborted &&
      (error === signal.reason ||
        (error instanceof MultipartReceiveError &&
          error.code === 'UPLOAD_CANCELLED') ||
        (error instanceof Error &&
          error.cause === signal.reason &&
          (error.name === 'AbortError' ||
            ('isCanceled' in error && error.isCanceled === true))));
    db.transaction((tx) => {
      const now = new Date();
      tx.update(mediaJobs)
        .set({
          status: cancelled ? 'cancelled' : 'failed',
          error: analyzeMediaError(error).diagnostic,
          finishedAt: now,
          updatedAt: now,
        })
        .where(eq(mediaJobs.id, jobId))
        .run();
      markUnpublishedMediaObjects(tx, jobId, 'Replacement reception failed');
    });
    if (cancelled)
      runtime.logger.info(
        { imageId, jobId },
        'Image replacement reception cancelled',
      );
    else
      runtime.logger.error(
        { err: error, imageId, jobId },
        'Image replacement reception failed',
      );
    await discardMediaInput(runtime.temporaryRoot, jobId);
    throw error;
  } finally {
    budget?.close();
  }
}

export function createReplacementService(runtime: MediaRuntime) {
  const controller = new AbortController();
  const active = new Map<
    string,
    { storageId: string; promise: Promise<unknown> }
  >();
  return {
    async receive(imageId: string, request: Request) {
      controller.signal.throwIfAborted();
      const image = runtime.db
        .select()
        .from(mediaImages)
        .where(eq(mediaImages.id, imageId))
        .get();
      if (!image)
        throw new MediaReprocessError(
          'MEDIA_IMAGE_NOT_FOUND',
          404,
          '图片不存在',
        );
      const id = randomUUID();
      const promise = receiveImageReplacement(
        runtime,
        imageId,
        request,
        controller.signal,
      );
      active.set(id, { storageId: image.storageId, promise });
      try {
        return await promise;
      } finally {
        active.delete(id);
      }
    },
    activeWrites(storageId: string) {
      return [...active.values()].filter((item) => item.storageId === storageId)
        .length;
    },
    async close() {
      controller.abort(
        mediaError('MEDIA_INTERRUPTED', 'Web runtime is stopping'),
      );
      await Promise.allSettled(
        [...active.values()].map((item) => item.promise),
      );
    },
  };
}
