import { createReadStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { sep } from 'node:path';
import { finished } from 'node:stream/promises';
import { and, eq } from 'drizzle-orm';
import type { MediaRuntime } from './process.ts';
import { mediaObjects } from './schema.ts';
import { mediaSizeCandidates } from './size-schema.ts';
import { sizePresets, type ImageSizeInput } from './size-types.ts';
import { ImageSizeError } from './sizes.ts';
import { activeMediaJob } from './steps.ts';
import { markMediaCandidates } from './steps.ts';
import { planDerivedObject } from './objects.ts';
import { createMediaResources } from './resources.ts';
import {
  mediaSourcePath,
  readMediaObject,
  writeMediaObject,
} from './storage.ts';
import { startDerivedEncoding } from './processing.ts';
import { inspectImage } from './formats.ts';
import { mediaError } from './errors.ts';

export async function renderSizeCandidate(
  runtime: MediaRuntime,
  jobId: string,
  input: ImageSizeInput,
  source: typeof mediaObjects.$inferSelect,
  signal: AbortSignal,
) {
  const { db } = runtime;
  const previous = db
    .select({ candidate: mediaSizeCandidates, object: mediaObjects })
    .from(mediaSizeCandidates)
    .innerJoin(mediaObjects, eq(mediaObjects.id, mediaSizeCandidates.objectId))
    .where(
      and(
        eq(mediaSizeCandidates.jobId, jobId),
        eq(mediaSizeCandidates.sourceVersion, input.version),
        eq(mediaSizeCandidates.preset, input.preset),
      ),
    )
    .get();
  if (
    previous?.candidate.sourceObjectId === source.id &&
    previous.object.status === 'stored'
  )
    return;
  // Native tools retain the job's recovery marker; only this size's I/O is isolated.
  const workspace = `${runtime.temporaryRoot}${sep}media-${jobId}`;
  const inputDirectory = `${workspace}${sep}size-${input.version}-${input.preset}`;
  const resources = (runtime.resources ??= createMediaResources());
  let budget: ReturnType<typeof resources.beginStep> | undefined;
  let toolCleanupFailed = false;
  try {
    const { job, image, storage } = activeMediaJob(db, jobId);
    if (image.trashedAt)
      throw new ImageSizeError('MEDIA_IMAGE_UNAVAILABLE', 409, '图片已回收');
    await rm(inputDirectory, { recursive: true, force: true });
    await mkdir(inputDirectory, { recursive: true });
    budget = resources.beginStep({
      temporaryDirectory: workspace,
      storageDirectory:
        storage.type === 'local'
          ? `${runtime.storageRoot}${sep}${storage.localPath}`
          : inputDirectory,
    });
    const stepSignal = AbortSignal.any([signal, budget.signal]);
    const sourcePath = await mediaSourcePath(
      runtime,
      storage,
      source,
      `${inputDirectory}${sep}source`,
      stepSignal,
    );
    const outputFormat = source.mime?.slice('image/'.length);
    if (
      outputFormat !== 'jpeg' &&
      outputFormat !== 'webp' &&
      outputFormat !== 'avif'
    )
      throw mediaError(
        'MEDIA_OUTPUT_INVALID',
        `Unsupported size source MIME: ${source.mime}`,
      );
    const plan = db.transaction((tx) => {
      const current = activeMediaJob(tx, jobId);
      if (current.image.trashedAt)
        throw new ImageSizeError('MEDIA_IMAGE_UNAVAILABLE', 409, '图片已回收');
      if (previous) {
        const partial = tx
          .select({ id: mediaObjects.id })
          .from(mediaObjects)
          .where(
            and(
              eq(mediaObjects.jobId, jobId),
              eq(mediaObjects.key, `${previous.object.key}.partial`),
            ),
          )
          .get();
        markMediaCandidates(
          tx,
          [previous.object.id, ...(partial ? [partial.id] : [])],
          'Incomplete or superseded size candidate',
        );
      }
      const next = planDerivedObject(tx, jobId, input.version);
      tx.insert(mediaSizeCandidates)
        .values({
          jobId,
          sourceVersion: input.version,
          preset: input.preset,
          sourceObjectId: source.id,
          objectId: next.objectId,
        })
        .onConflictDoUpdate({
          target: [
            mediaSizeCandidates.jobId,
            mediaSizeCandidates.sourceVersion,
            mediaSizeCandidates.preset,
          ],
          set: { sourceObjectId: source.id, objectId: next.objectId },
        })
        .run();
      tx.update(mediaObjects)
        .set({ status: 'writing', updatedAt: new Date() })
        .where(eq(mediaObjects.id, next.objectId))
        .run();
      if (next.temporaryObjectId)
        tx.update(mediaObjects)
          .set({ status: 'writing', updatedAt: new Date() })
          .where(eq(mediaObjects.id, next.temporaryObjectId))
          .run();
      return next;
    });
    const controller = new AbortController();
    const cancelSignal = AbortSignal.any([stepSignal, controller.signal]);
    const tool = await startDerivedEncoding({
      input: `${outputFormat}:${sourcePath}`,
      facts: {
        format: ({ jpeg: 'JPEG', webp: 'WEBP', avif: 'AVIF' } as const)[
          outputFormat
        ],
        animated: false,
      },
      kind: 'compressed',
      snapshot: {
        ...job.snapshot,
        outputFormat,
        maxEdge: sizePresets[input.preset],
        watermarkMode: 'off',
      },
      workspace,
      signal: cancelSignal,
      diskLimitBytes: budget.diskLimitBytes,
    });
    const encoded = budget.countOutput(tool.child.readable());
    // The writer may reject before it consumes the stream; preserve its error,
    // and observe disposal after abort instead of leaving an unhandled event.
    const encodedClosed = finished(encoded, { cleanup: true }).catch(
      () => undefined,
    );
    let saved: Awaited<ReturnType<typeof writeMediaObject>>;
    try {
      const current = activeMediaJob(db, jobId);
      saved = await writeMediaObject(
        runtime,
        current.storage,
        plan,
        encoded,
        `image/${outputFormat}`,
        `${inputDirectory}${sep}result`,
        cancelSignal,
      );
    } catch (error) {
      controller.abort(error);
      encoded.destroy();
      await encodedClosed;
      const toolError = await tool.settled;
      if (
        (toolError as { code?: string })?.code === 'MEDIA_TOOL_SHUTDOWN_FAILED'
      )
        throw toolError;
      throw stepSignal.aborted ? stepSignal.reason : error;
    }
    const toolError = await tool.settled;
    if (toolError) throw toolError;
    const { storage: currentStorage } = activeMediaJob(db, jobId);
    const output = saved.path
      ? { stream: createReadStream(saved.path) }
      : await readMediaObject(
          runtime,
          currentStorage,
          saved.key,
          `image/${outputFormat}`,
          stepSignal,
        );
    const facts = await inspectImage(output.stream, workspace, stepSignal);
    if (facts.mime !== `image/${outputFormat}` || facts.animated)
      throw mediaError('MEDIA_OUTPUT_INVALID', '尺寸图片编码与预期不一致');
    db.transaction((tx) => {
      const current = activeMediaJob(tx, jobId);
      if (current.image.trashedAt)
        throw new ImageSizeError('MEDIA_IMAGE_UNAVAILABLE', 409, '图片已回收');
      const now = new Date();
      tx.update(mediaObjects)
        .set({
          status: 'stored',
          byteSize: saved.size,
          byteSizeConfirmedAt: now,
          width: facts.width,
          height: facts.height,
          format: facts.format,
          mime: facts.mime,
          updatedAt: now,
        })
        .where(eq(mediaObjects.id, plan.objectId))
        .run();
      if (plan.temporaryObjectId)
        tx.update(mediaObjects)
          .set({
            status: 'deleted',
            byteSize: 0,
            byteSizeConfirmedAt: now,
            updatedAt: now,
          })
          .where(eq(mediaObjects.id, plan.temporaryObjectId))
          .run();
    });
  } catch (error) {
    toolCleanupFailed =
      (error as { code?: string })?.code === 'MEDIA_TOOL_SHUTDOWN_FAILED';
    throw error;
  } finally {
    budget?.close();
    if (!toolCleanupFailed)
      await rm(inputDirectory, { recursive: true, force: true });
  }
}
