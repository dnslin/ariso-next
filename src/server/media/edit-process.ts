import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { join, sep } from 'node:path';
import { finished } from 'node:stream/promises';
import { and, eq, inArray } from 'drizzle-orm';
import type { MediaRuntime } from './process.ts';
import { mediaEditRequests } from './editing-schema.ts';
import { mediaImages, mediaObjects, mediaVersions } from './schema.ts';
import { mediaReplacements } from './replacement-schema.ts';
import { activeMediaJob, replaceMediaVersion } from './steps.ts';
import { advanceMediaStep } from './recovery.ts';
import { createMediaResources } from './resources.ts';
import { mediaSourcePath, writeMediaObject } from './storage.ts';
import { planDerivedObject, storeMediaObject } from './objects.ts';
import { identifyImageFile } from './file-formats.ts';
import { retainMediaInput } from './input.ts';
import { mediaError } from './errors.ts';
import { renderEditedFile } from './edit-render.ts';

/** Render one accepted recipe before the existing process/replacement pipeline. */
export async function prepareEditedOriginal(
  runtime: MediaRuntime,
  jobId: string,
  workspace: string,
  signal: AbortSignal,
) {
  const { db } = runtime;
  const request = db
    .select()
    .from(mediaEditRequests)
    .where(eq(mediaEditRequests.jobId, jobId))
    .get();
  if (!request) return;
  const { image, storage } = activeMediaJob(db, jobId);
  const existing = request.renderedObjectId
    ? db
        .select()
        .from(mediaObjects)
        .where(eq(mediaObjects.id, request.renderedObjectId))
        .get()
    : undefined;
  if (existing?.status === 'stored') {
    if (request.mode === 'copy') {
      const original = db
        .select()
        .from(mediaVersions)
        .where(
          and(
            eq(mediaVersions.imageId, image.id),
            eq(mediaVersions.kind, 'original'),
          ),
        )
        .get();
      if (original?.objectId !== existing.id)
        throw mediaError(
          'MEDIA_EDIT_RESULT_CHANGED',
          '编辑结果已被其他操作修改，请重新打开图片',
        );
    } else {
      db.update(mediaReplacements)
        .set({ originalObjectId: existing.id })
        .where(eq(mediaReplacements.jobId, jobId))
        .run();
    }
    return;
  }
  const source = db
    .select()
    .from(mediaObjects)
    .where(eq(mediaObjects.id, request.sourceObjectId))
    .get();
  if (
    !source ||
    source.imageId !== request.sourceImageId ||
    ['planned', 'writing', 'deleted'].includes(source.status) ||
    !source.format ||
    !['JPEG', 'PNG', 'WEBP'].includes(source.format)
  ) {
    throw mediaError(
      'MEDIA_EDIT_SOURCE_UNAVAILABLE',
      '编辑所需原图已经不可用，请重新选择图片',
    );
  }
  db.transaction((tx) => {
    activeMediaJob(tx, jobId);
    // A pre-publication write interrupted before settlement is regenerated, never trusted as a complete input.
    tx.update(mediaObjects)
      .set({
        status: 'cleanup_pending',
        error: 'Regenerated interrupted image edit input',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(mediaObjects.jobId, jobId),
          eq(mediaObjects.purpose, 'original'),
          inArray(mediaObjects.status, ['planned', 'writing', 'stored']),
        ),
      )
      .run();
    tx.update(mediaEditRequests)
      .set({ renderedObjectId: null })
      .where(eq(mediaEditRequests.id, request.id))
      .run();
    if (request.mode === 'overwrite')
      tx.update(mediaReplacements)
        .set({ originalObjectId: null })
        .where(eq(mediaReplacements.jobId, jobId))
        .run();
  });
  const resources = (runtime.resources ??= createMediaResources());
  const inputDirectory = join(runtime.temporaryRoot, `media-input-${jobId}`);
  const budget = resources.beginStep({
    temporaryDirectory: workspace,
    storageDirectory:
      storage.type === 'local'
        ? `${runtime.storageRoot}${sep}${storage.localPath}`
        : inputDirectory,
  });
  const stepSignal = AbortSignal.any([signal, budget.signal]);
  try {
    // Independent copies may read the same immutable object concurrently. Their transfer reservations are per reader.
    const sourcePath = await mediaSourcePath(
      runtime,
      storage,
      { ...source, id: `edit-source-${jobId}` },
      join(inputDirectory, 'edit-source'),
      stepSignal,
    );
    const format = source.format as 'JPEG' | 'PNG' | 'WEBP';
    const outputPath = join(
      workspace,
      `edited-original.${format.toLowerCase()}`,
    );
    const rendered = await renderEditedFile({
      sourcePath,
      format,
      recipe: request.recipe,
      watermarkAsset: request.watermarkAsset ?? undefined,
      watermarksRoot: runtime.watermarksRoot,
      workspace,
      outputPath,
      signal: stepSignal,
      diskLimitBytes: budget.diskLimitBytes,
    });
    const facts = await identifyImageFile(rendered.path, workspace, stepSignal);
    const retained = await retainMediaInput(
      runtime.temporaryRoot,
      jobId,
      rendered.path,
      facts,
    );
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(retained, {
      signal: stepSignal,
    }))
      hash.update(chunk);
    const contentSha256 = hash.digest('hex');
    const plan = db.transaction((tx) => {
      activeMediaJob(tx, jobId);
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
      return candidate;
    });
    const sourceStream = budget.countOutput(
      createReadStream(retained, { signal: stepSignal }),
    );
    const settled = finished(sourceStream, { cleanup: true }).catch(
      () => undefined,
    );
    let saved: Awaited<ReturnType<typeof writeMediaObject>>;
    try {
      saved = await writeMediaObject(
        runtime,
        storage,
        plan,
        sourceStream,
        rendered.mime,
        join(inputDirectory, `edit-write-${plan.objectId}`),
        stepSignal,
      );
    } finally {
      sourceStream.destroy();
      await settled;
    }
    db.transaction((tx) => {
      activeMediaJob(tx, jobId);
      stepSignal.throwIfAborted();
      const now = new Date();
      const details = {
        byteSize: saved.size,
        width: rendered.width,
        height: rendered.height,
        format: rendered.format,
        mime: rendered.mime,
      };
      storeMediaObject(tx, plan.objectId, details, plan.temporaryObjectId, now);
      tx.update(mediaObjects)
        .set({ contentSha256 })
        .where(eq(mediaObjects.id, plan.objectId))
        .run();
      tx.update(mediaEditRequests)
        .set({ renderedObjectId: plan.objectId })
        .where(eq(mediaEditRequests.id, request.id))
        .run();
      if (request.mode === 'copy') {
        replaceMediaVersion(
          tx,
          image.id,
          'original',
          plan.objectId,
          details,
          now,
        );
        tx.update(mediaImages)
          .set({
            ...details,
            animated: false,
            pageCount: 1,
            classification: 'static',
            updatedAt: now,
          })
          .where(eq(mediaImages.id, image.id))
          .run();
      } else {
        tx.update(mediaReplacements)
          .set({ originalObjectId: plan.objectId })
          .where(eq(mediaReplacements.jobId, jobId))
          .run();
      }
      advanceMediaStep(tx, jobId, 'identify');
    });
  } finally {
    budget.close();
  }
}
