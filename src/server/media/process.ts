import { and, eq, inArray } from 'drizzle-orm';
import { mkdir, rm } from 'node:fs/promises';
import { sep } from 'node:path';
import { createMediaResources } from './resources.ts';
import { terminateMediaTools } from './tools.ts';
import type { Logger } from 'pino';
import type { openRuntimeDatabase } from '../runtime/db.ts';
import type { createSecretCrypto } from '../runtime/crypto.ts';
import { mediaSourcePath } from './storage.ts';
import { discardMediaInput, readMediaInput } from './input.ts';
import { extractMetadata, readAndStoreMetadata } from './metadata.ts';
import { inspectImageFile } from './file-formats.ts';
import { prepareProcessingInput } from './processing.ts';
import { writeEncodedCandidate } from './encoded-candidate.ts';
import { analyzeMediaError, mediaError } from './errors.ts';
import { planDerivedObject, markUnpublishedMediaObjects } from './objects.ts';
import {
  activeMediaJob,
  saveMediaCandidate,
  completeMediaJob,
  savedMediaCandidate,
  markMediaCandidates,
  reconcileMediaObjects,
} from './steps.ts';
import { mediaJobSteps, reprocessVersions } from './reprocess.ts';
import { mediaReplacements } from './replacement-schema.ts';
import { replacementCompression } from './replacement-render.ts';
import { prepareImageSizes } from './size-process.ts';
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
  watermarksRoot?: string;
  secretCrypto?: ReturnType<typeof createSecretCrypto>;
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
  const inputDirectory = `${temporaryRoot}${sep}media-input-${jobId}`;
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
    if (storage.type === 's3') await mkdir(inputDirectory, { recursive: true });
    const beginStep = () =>
      resources.beginStep({
        temporaryDirectory: workspace,
        storageDirectory:
          storage.type === 'local'
            ? `${storageRoot}${sep}${storage.localPath}`
            : inputDirectory,
      });
    const { snapshot } = job;
    const replacement =
      job.kind === 'replace'
        ? db
            .select()
            .from(mediaReplacements)
            .where(eq(mediaReplacements.jobId, jobId))
            .get()
        : undefined;
    if (job.kind === 'replace' && !replacement?.originalObjectId)
      throw mediaError('MEDIA_REPLACEMENT_INCOMPLETE', '替换原图尚未保存');
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
    const sourceObject = replacement
      ? db
          .select()
          .from(mediaObjects)
          .where(eq(mediaObjects.id, replacement.originalObjectId!))
          .get()!
      : original.media_objects;
    budget = beginStep();
    let stepSignal = AbortSignal.any([signal, budget.signal]);
    const input = await readMediaInput(temporaryRoot, jobId);
    const { storage: sourceStorage } = activeMediaJob(db, jobId);
    const sourcePath =
      input?.path ??
      (await mediaSourcePath(
        runtime,
        sourceStorage,
        sourceObject,
        `${inputDirectory}${sep}original`,
        stepSignal,
      ));
    activeMediaJob(db, jobId);
    const facts = await inspectImageFile(
      sourcePath,
      workspace,
      stepSignal,
      budget.diskLimitBytes,
      input?.facts,
    );
    const generatedPaths = new Map<string, string>();
    if (
      replacement &&
      facts.classification !== 'static' &&
      job.expectedVersions.some(
        (kind) => kind === 'compressed' || kind === 'watermark',
      )
    )
      throw mediaError(
        'MEDIA_REPLACEMENT_NOT_APPLICABLE',
        '新图片无法生成已有的压缩图或水印图，请使用静态图片或上传为新图片',
      );
    if (!replacement)
      job.expectedVersions = reprocessVersions(
        job.scope,
        facts.classification,
        snapshot,
      );
    const workVersions = mediaJobSteps(job);
    db.transaction((tx) => {
      activeMediaJob(tx, jobId);
      const details = {
        format: facts.format,
        mime: facts.mime,
        width: facts.width,
        height: facts.height,
      };
      if (replacement) {
        tx.update(mediaReplacements)
          .set({ facts })
          .where(eq(mediaReplacements.jobId, jobId))
          .run();
        tx.update(mediaObjects)
          .set({ ...details, updatedAt: new Date() })
          .where(eq(mediaObjects.id, sourceObject.id))
          .run();
      } else {
        tx.update(mediaImages)
          .set({
            ...details,
            animated: facts.animated,
            pageCount: facts.pageCount,
            classification: facts.classification,
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
          .set({
            format: facts.format,
            mime: facts.mime,
            updatedAt: new Date(),
          })
          .where(eq(mediaObjects.id, original.media_objects.id))
          .run();
      }
      tx.update(mediaJobs)
        .set({ expectedVersions: job.expectedVersions })
        .where(eq(mediaJobs.id, jobId))
        .run();
      if (job.step === 'identify')
        advanceMediaStep(tx, jobId, workVersions[0] ?? 'complete');
    });

    step = 'metadata';
    if (replacement) {
      const metadata = await extractMetadata(sourcePath, workspace, signal);
      db.update(mediaReplacements)
        .set({ metadata })
        .where(eq(mediaReplacements.jobId, jobId))
        .run();
    } else
      await readAndStoreMetadata(runtime, jobId, sourcePath, workspace, signal);
    step = 'identify';

    const prepared = await prepareProcessingInput({
      sourcePath,
      facts,
      workspace,
      signal: stepSignal,
      diskLimitBytes: budget.diskLimitBytes,
    });
    facts.width = prepared.width;
    facts.height = prepared.height;

    if (replacement)
      db.update(mediaReplacements)
        .set({ facts })
        .where(eq(mediaReplacements.jobId, jobId))
        .run();
    if (!replacement && facts.format === 'SVG')
      db.transaction((tx) => {
        activeMediaJob(tx, jobId);
        const dimensions = { width: facts.width, height: facts.height };
        tx.update(mediaImages)
          .set(dimensions)
          .where(eq(mediaImages.id, image.id))
          .run();
        tx.update(mediaVersions)
          .set(dimensions)
          .where(
            and(
              eq(mediaVersions.imageId, image.id),
              eq(mediaVersions.kind, 'original'),
            ),
          )
          .run();
      });
    budget.close();
    budget = undefined;

    for (const kind of workVersions) {
      const snapshot = replacement?.snapshots[kind] ?? job.snapshot;
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
      if (savedMediaCandidate(db, jobId, kind)) {
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
              ...(candidate.temporaryObjectId
                ? [candidate.temporaryObjectId]
                : []),
            ]),
          )
          .run();
        return candidate;
      });
      activeMediaJob(db, jobId);
      let compressedPath: string | undefined;
      if (replacement && kind === 'watermark' && snapshot.compressionEnabled) {
        compressedPath = await replacementCompression(
          {
            input: prepared.input,
            facts,
            snapshot,
            workspace,
            signal: stepSignal,
            diskLimitBytes: budget.diskLimitBytes,
          },
          (source) => budget!.countOutput(source),
        );
      } else if (kind === 'watermark' && snapshot.compressionEnabled) {
        const compressed = savedMediaCandidate(db, jobId, 'compressed');
        if (!compressed)
          throw mediaError(
            'MEDIA_VERSIONS_MISSING',
            '本次任务压缩结果尚未生成',
          );
        const { storage } = activeMediaJob(db, jobId);
        compressedPath =
          generatedPaths.get(compressed.key) ??
          (await mediaSourcePath(
            runtime,
            storage,
            compressed,
            `${inputDirectory}${sep}compressed-source`,
            stepSignal,
          ));
      }
      const { saved, facts: result } = await writeEncodedCandidate(
        runtime,
        jobId,
        plan,
        {
          input: prepared.input,
          facts,
          kind,
          snapshot,
          compressedPath,
          watermarksRoot: runtime.watermarksRoot,
          workspace,
          signal: stepSignal,
          diskLimitBytes: budget.diskLimitBytes,
        },
        `${inputDirectory}${sep}derived-${plan.objectId}`,
        (source) => budget!.countOutput(source),
      );
      if (saved.path) generatedPaths.set(saved.key, saved.path);
      saveMediaCandidate(
        db,
        jobId,
        kind,
        plan.objectId,
        {
          size: saved.size,
          width: result.width,
          height: result.height,
          format: result.format,
          mime: result.mime,
        },
        plan.temporaryObjectId,
      );
      plan = undefined;
      budget.close();
      budget = undefined;
    }

    step = 'sizes';
    const versionCandidates = new Map(
      job.expectedVersions.map(
        (kind) => [kind, savedMediaCandidate(db, jobId, kind)!] as const,
      ),
    );
    await prepareImageSizes(runtime, jobId, versionCandidates, signal);
    step = 'complete';
    signal.throwIfAborted();
    completeMediaJob(db, jobId);
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
      diagnostic = `${step}: ${analyzeMediaError(signal.reason).diagnostic}`;
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
            [
              plan.objectId,
              ...(plan.temporaryObjectId ? [plan.temporaryObjectId] : []),
            ],
            failure,
          );
        const terminal = tx
          .select()
          .from(mediaJobs)
          .where(eq(mediaJobs.id, jobId))
          .get();
        if (terminal?.status === 'failed' || terminal?.status === 'cancelled')
          markUnpublishedMediaObjects(tx, jobId, failure);
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
    const settled = db
      .select({ status: mediaJobs.status })
      .from(mediaJobs)
      .where(eq(mediaJobs.id, jobId))
      .get();
    if (
      settled &&
      !['queued', 'running'].includes(settled.status) &&
      !toolCleanupFailed
    )
      await discardMediaInput(temporaryRoot, jobId);
  }
}
