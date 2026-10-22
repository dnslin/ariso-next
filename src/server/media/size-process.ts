import { mkdir, rm } from 'node:fs/promises';
import { sep } from 'node:path';
import { and, eq, inArray } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { MediaRuntime } from './process.ts';
import {
  mediaJobs,
  mediaObjects,
  mediaVersions,
  type DerivedVersionKind,
} from './schema.ts';
import {
  mediaSizeCandidates,
  mediaSizeRequests,
  mediaSizeVersions,
} from './size-schema.ts';
import { ImageSizeError, requireSizeSource } from './sizes.ts';
import { renderSizeCandidate } from './size-render.ts';
import { activeMediaJob, markMediaCandidates } from './steps.ts';
import { markUnpublishedMediaObjects } from './objects.ts';
import { settleMediaFailure } from './recovery.ts';
import { terminateMediaTools } from './tools.ts';

export async function prepareImageSizes(
  runtime: MediaRuntime,
  jobId: string,
  sources: ReadonlyMap<DerivedVersionKind, typeof mediaObjects.$inferSelect>,
  signal: AbortSignal,
) {
  const { job } = activeMediaJob(runtime.db, jobId);
  const sizes = runtime.db
    .select()
    .from(mediaSizeVersions)
    .where(eq(mediaSizeVersions.imageId, job.imageId))
    .all();
  for (const size of sizes) {
    const source = sources.get(size.sourceVersion);
    if (source)
      await renderSizeCandidate(
        runtime,
        jobId,
        { version: size.sourceVersion, preset: size.preset },
        source,
        signal,
      );
  }
}

/** The base-version publisher calls this inside its same short transaction. */
export function publishImageSizes(tx: BetterSQLite3Database, jobId: string) {
  const { image } = activeMediaJob(tx, jobId);
  const candidates = tx
    .select({ candidate: mediaSizeCandidates, object: mediaObjects })
    .from(mediaSizeCandidates)
    .innerJoin(mediaObjects, eq(mediaObjects.id, mediaSizeCandidates.objectId))
    .where(eq(mediaSizeCandidates.jobId, jobId))
    .all();
  if (!candidates.length) return;
  if (image.trashedAt)
    throw new ImageSizeError('MEDIA_IMAGE_UNAVAILABLE', 409, '图片已回收');
  for (const { candidate, object } of candidates) {
    const source = tx
      .select()
      .from(mediaVersions)
      .where(
        and(
          eq(mediaVersions.imageId, image.id),
          eq(mediaVersions.kind, candidate.sourceVersion),
        ),
      )
      .get();
    if (
      source?.objectId !== candidate.sourceObjectId ||
      object.status !== 'stored'
    )
      throw new ImageSizeError(
        'MEDIA_SIZE_STALE',
        409,
        '源版本已变化，请重新生成尺寸',
      );
  }
  const now = new Date();
  for (const { candidate } of candidates) {
    const previous = tx
      .select()
      .from(mediaSizeVersions)
      .where(
        and(
          eq(mediaSizeVersions.imageId, image.id),
          eq(mediaSizeVersions.sourceVersion, candidate.sourceVersion),
          eq(mediaSizeVersions.preset, candidate.preset),
        ),
      )
      .get();
    tx.insert(mediaSizeVersions)
      .values({
        imageId: image.id,
        sourceVersion: candidate.sourceVersion,
        preset: candidate.preset,
        sourceObjectId: candidate.sourceObjectId,
        objectId: candidate.objectId,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: [
          mediaSizeVersions.imageId,
          mediaSizeVersions.sourceVersion,
          mediaSizeVersions.preset,
        ],
        set: {
          sourceObjectId: candidate.sourceObjectId,
          objectId: candidate.objectId,
          createdAt: now,
        },
      })
      .run();
    if (previous && previous.objectId !== candidate.objectId)
      markMediaCandidates(
        tx,
        [previous.objectId],
        'Replaced by a newly published size',
      );
  }
}

export async function processImageSizeJob(
  runtime: MediaRuntime,
  jobId: string,
  externalSignal?: AbortSignal,
) {
  const deadline = new AbortController();
  const timer = setTimeout(
    () => deadline.abort(new Error('尺寸生成超过 600 秒')),
    600_000,
  );
  timer.unref();
  const signal = externalSignal
    ? AbortSignal.any([externalSignal, deadline.signal])
    : deadline.signal;
  const workspace = `${runtime.temporaryRoot}${sep}media-${jobId}`;
  let workspaceReady = false;
  let toolCleanupFailed = false;
  try {
    const { job } = activeMediaJob(runtime.db, jobId);
    const request = runtime.db
      .select()
      .from(mediaSizeRequests)
      .where(eq(mediaSizeRequests.jobId, jobId))
      .get();
    if (!request || job.kind !== 'size')
      throw new Error(`Missing size request: ${jobId}`);
    const input = { version: request.sourceVersion, preset: request.preset };
    const { source } = requireSizeSource(runtime.db, job.imageId, input);
    if (source.object.id !== request.sourceObjectId)
      throw new ImageSizeError(
        'MEDIA_SIZE_STALE',
        409,
        '源版本已变化，请重新生成尺寸',
      );
    await terminateMediaTools(workspace);
    await rm(workspace, { recursive: true, force: true });
    await mkdir(workspace, { recursive: true });
    workspaceReady = true;
    await renderSizeCandidate(runtime, jobId, input, source.object, signal);
    signal.throwIfAborted();
    runtime.db.transaction((tx) => {
      publishImageSizes(tx, jobId);
      tx.update(mediaJobs)
        .set({
          status: 'succeeded',
          step: 'complete',
          error: null,
          finishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(mediaJobs.id, jobId))
        .run();
      markUnpublishedMediaObjects(tx, jobId, 'Unpublished size intermediate');
    });
  } catch (error) {
    toolCleanupFailed =
      (error as { code?: string })?.code === 'MEDIA_TOOL_SHUTDOWN_FAILED';
    const interrupted =
      !toolCleanupFailed &&
      signal.aborted &&
      (signal.reason as { code?: string })?.code === 'MEDIA_INTERRUPTED';
    if (interrupted)
      runtime.db
        .update(mediaJobs)
        .set({ error: `size: ${String(signal.reason)}`, updatedAt: new Date() })
        .where(and(eq(mediaJobs.id, jobId), eq(mediaJobs.status, 'running')))
        .run();
    else
      runtime.db.transaction((tx) => {
        const diagnostic =
          settleMediaFailure(
            tx,
            jobId,
            'size',
            toolCleanupFailed ? error : signal.aborted ? signal.reason : error,
          ) ?? String(error);
        const terminal = tx
          .select()
          .from(mediaJobs)
          .where(
            and(
              eq(mediaJobs.id, jobId),
              inArray(mediaJobs.status, ['failed', 'cancelled']),
            ),
          )
          .get();
        if (terminal) markUnpublishedMediaObjects(tx, jobId, diagnostic);
      });
    if (interrupted)
      runtime.logger.info(
        { err: signal.reason, jobId },
        'Size processing interrupted',
      );
    else runtime.logger.error({ err: error, jobId }, 'Size processing failed');
    if (toolCleanupFailed) throw error;
  } finally {
    clearTimeout(timer);
    if (workspaceReady && !toolCleanupFailed)
      await rm(workspace, { recursive: true, force: true });
  }
}
