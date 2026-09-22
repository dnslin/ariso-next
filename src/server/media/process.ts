import { and, eq, inArray } from 'drizzle-orm';
import { mkdir, rm } from 'node:fs/promises';
import { sep } from 'node:path';
import { createMediaResources } from './resources.ts';
import { startMediaTool, terminateMediaTools } from './tools.ts';
import type { Logger } from 'pino';
import type { openRuntimeDatabase } from '../runtime/db.ts';
import { readObject, writeObject } from '../storage/local.ts';
import {
  describeProcessingError,
  inspectImage,
  mediaError,
  requireFirstImageFormat,
} from './formats.ts';
import { planDerivedObject } from './objects.ts';
import {
  activeMediaJob,
  publishMediaVersion,
  savedMediaVersion,
  markMediaCandidates,
  reconcileMediaObjects,
} from './steps.ts';
import { advanceMediaStep, settleMediaFailure } from './recovery.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaVersions,
} from './schema.ts';

export type MediaRuntime = {
  db: ReturnType<typeof openRuntimeDatabase>['db'];
  storageRoot: string;
  temporaryRoot: string;
  logger: Pick<Logger, 'info' | 'error'>;
  resources?: ReturnType<typeof createMediaResources>;
};

/** Each I/O step gets current storage state; processing always uses the saved job snapshot. */
export async function processMediaJob(
  runtime: MediaRuntime,
  jobId: string,
  externalSignal?: AbortSignal,
) {
  const { db, storageRoot, temporaryRoot, logger } = runtime;
  let plan: ReturnType<typeof planDerivedObject> | undefined;
  let step = 'identify';
  const deadline = new AbortController();
  const timer = setTimeout(
    () =>
      deadline.abort(
        mediaError(
          'MEDIA_JOB_TIMEOUT',
          'Content processing exceeded 600 seconds',
        ),
      ),
    600_000,
  );
  timer.unref();
  const signal = externalSignal
    ? AbortSignal.any([externalSignal, deadline.signal])
    : deadline.signal;
  const workspace = `${temporaryRoot}${sep}media-${jobId}`;
  const resources = (runtime.resources ??= createMediaResources());
  let budget: ReturnType<typeof resources.beginStep> | undefined;
  let workspaceReady = false;
  let toolCleanupFailed = false;
  try {
    const { job, image, storage } = activeMediaJob(db, jobId);
    await terminateMediaTools(workspace);
    await rm(workspace, { recursive: true, force: true });
    await mkdir(workspace, { recursive: true });
    workspaceReady = true;
    const beginStep = () =>
      resources.beginStep({
        temporaryDirectory: workspace,
        storageDirectory: `${storageRoot}${sep}${storage.localPath}`,
      });
    const { snapshot } = job;
    if (
      job.scope !== 'all' ||
      snapshot.watermarkMode !== 'off' ||
      (snapshot.compressionEnabled && snapshot.outputFormat !== 'webp')
    ) {
      throw mediaError(
        'MEDIA_SETTINGS_UNSUPPORTED',
        'First-image processing supports WebP compression and no watermark',
      );
    }
    const expected = snapshot.compressionEnabled
      ? ['compressed', 'thumbnail']
      : ['thumbnail'];
    if (
      job.expectedVersions.length !== expected.length ||
      expected.some(
        (kind) =>
          !job.expectedVersions.includes(kind as 'compressed' | 'thumbnail'),
      )
    ) {
      throw mediaError(
        'MEDIA_PLAN_INVALID',
        'Expected versions do not match the processing snapshot',
      );
    }
    const original = db
      .select()
      .from(mediaObjects)
      .innerJoin(mediaVersions, eq(mediaVersions.objectId, mediaObjects.id))
      .where(
        and(
          eq(mediaVersions.imageId, image.id),
          eq(mediaVersions.kind, 'original'),
        ),
      )
      .get()!;
    const openOriginal = async () => {
      signal?.throwIfAborted();
      const { storage } = activeMediaJob(db, jobId);
      return readObject(
        storageRoot,
        storage,
        original.media_objects.key,
        original.media_objects.mime!,
        signal,
      );
    };
    budget = beginStep();
    let stepSignal = AbortSignal.any([signal, budget.signal]);
    const source = await openOriginal();
    const facts = await inspectImage(source.stream, stepSignal, workspace);
    budget.close();
    budget = undefined;
    const coder = requireFirstImageFormat(facts);
    db.transaction((tx) => {
      activeMediaJob(tx, jobId);
      const details = {
        format: facts.format,
        mime: facts.mime,
        width: facts.width,
        height: facts.height,
      };
      tx.update(mediaImages)
        .set({
          ...details,
          animated: false,
          pageCount: 1,
          classification: 'static',
          updatedAt: new Date(),
        })
        .where(eq(mediaImages.id, image.id))
        .run();
      tx.update(mediaVersions)
        .set(details)
        .where(
          and(
            eq(mediaVersions.imageId, image.id),
            eq(mediaVersions.kind, 'original'),
          ),
        )
        .run();
      tx.update(mediaObjects)
        .set({ format: facts.format, mime: facts.mime, updatedAt: new Date() })
        .where(eq(mediaObjects.id, original.media_objects.id))
        .run();
      if (job.step === 'identify')
        advanceMediaStep(tx, jobId, job.expectedVersions[0] ?? 'complete');
    });

    for (const kind of job.expectedVersions) {
      step = kind;
      signal.throwIfAborted();
      budget = beginStep();
      stepSignal = AbortSignal.any([signal, budget.signal]);
      await reconcileMediaObjects(
        runtime,
        jobId,
        kind,
        workspace,
        budget.diskLimitBytes,
        stepSignal,
      );
      if (savedMediaVersion(db, jobId, kind)) {
        budget.close();
        budget = undefined;
        continue;
      }
      plan = db.transaction((tx) => {
        activeMediaJob(tx, jobId);
        const candidate = planDerivedObject(tx, jobId, kind);
        tx.update(mediaObjects)
          .set({ status: 'writing', updatedAt: new Date() })
          .where(
            inArray(mediaObjects.id, [
              candidate.objectId,
              candidate.temporaryObjectId,
            ]),
          )
          .run();
        return candidate;
      });
      const input = await openOriginal();
      const controller = new AbortController();
      const cancelSignal = AbortSignal.any([stepSignal, controller.signal]);
      const edge = kind === 'thumbnail' ? 640 : snapshot.maxEdge;
      const { child, settled } = startMediaTool(
        'magick',
        [
          '-limit',
          'memory',
          '256MiB',
          '-limit',
          'map',
          '0',
          '-limit',
          'disk',
          String(Math.floor(budget.diskLimitBytes)),
          '-limit',
          'thread',
          '1',
          `${coder}:-`,
          '-auto-orient',
          '-colorspace',
          'sRGB',
          ...(edge === null ? [] : ['-resize', `${edge}x${edge}>`]),
          '-strip',
          '-quality',
          String(kind === 'thumbnail' ? 80 : snapshot.quality),
          'webp:-',
        ],
        {
          input: input.stream,
          buffer: { stdout: false, stderr: true },
          workspace,
          env: { MAGICK_TEMPORARY_PATH: workspace },
          timeout: 120_000,
          forceKillAfterDelay: 1000,
          cancelSignal,
        },
      );
      let saved;
      try {
        const { storage } = activeMediaJob(db, jobId);
        saved = await writeObject(
          storageRoot,
          storage,
          plan,
          budget.countOutput(child.readable()),
          cancelSignal,
        );
      } catch (error) {
        controller.abort();
        const toolError = await settled;
        if (
          (toolError as (Error & { code?: string }) | undefined)?.code ===
          'MEDIA_TOOL_SHUTDOWN_FAILED'
        )
          throw toolError;
        // Cancellation here is cleanup, not the cause of a storage failure.
        if (stepSignal.aborted) throw stepSignal.reason;
        let cause = error;
        while (cause instanceof Error && cause.cause instanceof Error)
          cause = cause.cause;
        const code = (cause as NodeJS.ErrnoException)?.code;
        if (
          toolError &&
          !(toolError as Error & { isCanceled?: boolean }).isCanceled &&
          (code === 'ERR_STREAM_PREMATURE_CLOSE' || code === 'EPIPE')
        )
          throw toolError;
        throw error;
      }
      const toolError = await settled;
      if (toolError) throw toolError;
      const { storage } = activeMediaJob(db, jobId);
      const output = await readObject(
        storageRoot,
        storage,
        saved.key,
        'image/webp',
        signal,
      );
      const result = await inspectImage(output.stream, stepSignal, workspace);
      if (
        result.mime !== 'image/webp' ||
        !['WEBP', 'Extended WEBP'].includes(result.format)
      )
        throw mediaError(
          'MEDIA_OUTPUT_INVALID',
          `Unexpected derived encoding: ${result.format}`,
        );
      publishMediaVersion(
        db,
        jobId,
        kind,
        plan.objectId,
        { size: saved.size, width: result.width, height: result.height },
        plan.temporaryObjectId,
      );
      plan = undefined;
      budget.close();
      budget = undefined;
    }

    step = 'complete';
    db.transaction((tx) => {
      activeMediaJob(tx, jobId);
      const saved = tx
        .select({ kind: mediaVersions.kind })
        .from(mediaVersions)
        .innerJoin(mediaObjects, eq(mediaObjects.id, mediaVersions.objectId))
        .where(
          and(eq(mediaObjects.jobId, jobId), eq(mediaObjects.status, 'stored')),
        )
        .all();
      if (
        job.expectedVersions.some(
          (kind) => !saved.some((version) => version.kind === kind),
        )
      )
        throw mediaError(
          'MEDIA_VERSIONS_MISSING',
          `Missing saved versions for ${jobId}`,
        );
      const now = new Date();
      tx.update(mediaJobs)
        .set({
          status: 'succeeded',
          error: null,
          finishedAt: now,
          updatedAt: now,
        })
        .where(eq(mediaJobs.id, jobId))
        .run();
      tx.update(mediaImages)
        .set({ processingStatus: 'ready', updatedAt: now })
        .where(eq(mediaImages.id, image.id))
        .run();
    });
    logger.info({ jobId, imageId: image.id }, 'Media processing completed');
  } catch (error) {
    toolCleanupFailed =
      (error as { code?: string } | null)?.code ===
      'MEDIA_TOOL_SHUTDOWN_FAILED';
    const interrupted =
      !toolCleanupFailed &&
      signal?.aborted &&
      (signal.reason as { code?: string })?.code === 'MEDIA_INTERRUPTED';
    let diagnostic: string;
    if (interrupted) {
      diagnostic = `${step}: ${describeProcessingError(signal.reason)}`;
      db.update(mediaJobs)
        .set({ error: diagnostic, updatedAt: new Date() })
        .where(and(eq(mediaJobs.id, jobId), eq(mediaJobs.status, 'running')))
        .run();
    } else {
      // A terminal job and its remaining candidate cleanup must commit together.
      diagnostic = db.transaction((tx) => {
        const failure = settleMediaFailure(
          tx,
          jobId,
          step,
          toolCleanupFailed
            ? error
            : signal.aborted
              ? signal.reason
              : budget?.signal.aborted
                ? budget.signal.reason
                : error,
        );
        if (plan)
          markMediaCandidates(
            tx,
            [plan.objectId, plan.temporaryObjectId],
            failure,
          );
        return failure;
      });
    }
    logger.error(
      { err: error, jobId, step, diagnostic },
      'Media processing interrupted or failed',
    );
    if (toolCleanupFailed) throw error;
  } finally {
    clearTimeout(timer);
    budget?.close();
    if (workspaceReady && !toolCleanupFailed)
      await rm(workspace, { recursive: true, force: true });
  }
}
