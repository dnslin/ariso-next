import { mkdir, rm } from 'node:fs/promises';
import { sep } from 'node:path';
import { and, eq } from 'drizzle-orm';
import type { MediaRuntime } from './process.ts';
import { mediaObjects } from './schema.ts';
import { mediaSizeCandidates } from './size-schema.ts';
import { sizePresets, type ImageSizeInput } from './size-types.ts';
import { ImageSizeError } from './sizes.ts';
import { activeMediaJob } from './steps.ts';
import { markMediaCandidates } from './steps.ts';
import { planDerivedObject, storeMediaObject } from './objects.ts';
import { createMediaResources } from './resources.ts';
import { mediaSourcePath } from './storage.ts';
import { writeEncodedCandidate } from './encoded-candidate.ts';
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
    const { saved, facts } = await writeEncodedCandidate(
      runtime,
      jobId,
      plan,
      {
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
        signal: stepSignal,
        diskLimitBytes: budget.diskLimitBytes,
      },
      `${inputDirectory}${sep}result`,
      (source) => budget!.countOutput(source),
    );
    if (facts.animated)
      throw mediaError('MEDIA_OUTPUT_INVALID', '尺寸图片编码与预期不一致');
    db.transaction((tx) => {
      const current = activeMediaJob(tx, jobId);
      if (current.image.trashedAt)
        throw new ImageSizeError('MEDIA_IMAGE_UNAVAILABLE', 409, '图片已回收');
      const now = new Date();
      storeMediaObject(
        tx,
        plan.objectId,
        {
          byteSize: saved.size,
          width: facts.width,
          height: facts.height,
          format: facts.format,
          mime: facts.mime,
        },
        plan.temporaryObjectId,
        now,
      );
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
