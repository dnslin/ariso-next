import { and, eq, inArray, ne } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { execa } from 'execa';
import type { Logger } from 'pino';
import type { openRuntimeDatabase } from '../runtime/db.ts';
import { readObject, writeObject } from '../storage/local.ts';
import { resolveUploadStorage } from '../storage/defaults.ts';
import {
  describeProcessingError,
  inspectImage,
  mediaError,
  requireFirstImageFormat,
} from './formats.ts';
import { planDerivedObject } from './objects.ts';
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
};

function activeJob(db: BetterSQLite3Database, jobId: string) {
  const job = db.select().from(mediaJobs).where(eq(mediaJobs.id, jobId)).get();
  if (!job || job.status !== 'running')
    throw mediaError(
      'MEDIA_JOB_INACTIVE',
      `Media job is not running: ${jobId}`,
    );
  const image = db
    .select()
    .from(mediaImages)
    .where(eq(mediaImages.id, job.imageId))
    .get()!;
  if (image.deletionStatus)
    throw mediaError(
      'MEDIA_IMAGE_DELETING',
      `Image is being deleted: ${image.id}`,
    );
  const storage = resolveUploadStorage(db, image.storageId);
  return { job, image, storage };
}

/** Each I/O step gets current storage state; processing always uses the saved job snapshot. */
export async function processMediaJob(
  runtime: MediaRuntime,
  jobId: string,
  signal?: AbortSignal,
) {
  const { db, storageRoot, temporaryRoot, logger } = runtime;
  let plan: ReturnType<typeof planDerivedObject> | undefined;
  let step = 'identify';
  try {
    const { job, image } = activeJob(db, jobId);
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
      const { storage } = activeJob(db, jobId);
      return readObject(
        storageRoot,
        storage,
        original.media_objects.key,
        original.media_objects.mime!,
        signal,
      );
    };
    const source = await openOriginal();
    const facts = await inspectImage(source.stream, signal);
    const coder = requireFirstImageFormat(facts);
    db.transaction((tx) => {
      activeJob(tx, jobId);
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
    });

    for (const kind of job.expectedVersions) {
      step = kind;
      signal?.throwIfAborted();
      plan = db.transaction((tx) => {
        activeJob(tx, jobId);
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
      const cancelSignal = signal
        ? AbortSignal.any([signal, controller.signal])
        : controller.signal;
      const edge = kind === 'thumbnail' ? 640 : snapshot.maxEdge;
      const child = execa(
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
          '512MiB',
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
          env: { MAGICK_TEMPORARY_PATH: temporaryRoot },
          timeout: 120_000,
          forceKillAfterDelay: 1000,
          cancelSignal,
        },
      );
      // Attach immediately: even a storage validation failure must reap the process.
      const settled = child.then(
        () => undefined,
        (error) => error as Error,
      );
      let saved;
      try {
        const { storage } = activeJob(db, jobId);
        saved = await writeObject(
          storageRoot,
          storage,
          plan,
          child.readable(),
          cancelSignal,
        );
      } catch (error) {
        controller.abort();
        await settled;
        throw error;
      }
      const toolError = await settled;
      if (toolError) throw toolError;
      const { storage } = activeJob(db, jobId);
      const output = await readObject(
        storageRoot,
        storage,
        saved.key,
        'image/webp',
        signal,
      );
      const result = await inspectImage(output.stream, signal);
      if (
        result.mime !== 'image/webp' ||
        !['WEBP', 'Extended WEBP'].includes(result.format)
      )
        throw mediaError(
          'MEDIA_OUTPUT_INVALID',
          `Unexpected derived encoding: ${result.format}`,
        );
      const completed = plan;
      db.transaction((tx) => {
        activeJob(tx, jobId);
        const now = new Date();
        const details = {
          byteSize: saved.size,
          format: 'WEBP',
          mime: 'image/webp',
        };
        tx.update(mediaObjects)
          .set({ ...details, status: 'stored', updatedAt: now })
          .where(eq(mediaObjects.id, completed.objectId))
          .run();
        tx.update(mediaObjects)
          .set({ status: 'deleted', byteSize: 0, updatedAt: now })
          .where(eq(mediaObjects.id, completed.temporaryObjectId))
          .run();
        tx.insert(mediaVersions)
          .values({
            imageId: image.id,
            kind,
            objectId: completed.objectId,
            ...details,
            width: result.width,
            height: result.height,
            createdAt: now,
          })
          .run();
      });
      plan = undefined;
    }

    step = 'complete';
    db.transaction((tx) => {
      activeJob(tx, jobId);
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
    const diagnostic = `${step}: ${describeProcessingError(error)}`;
    db.transaction((tx) => {
      const now = new Date();
      if (plan)
        tx.update(mediaObjects)
          .set({ status: 'cleanup_pending', error: diagnostic, updatedAt: now })
          .where(
            inArray(mediaObjects.id, [plan.objectId, plan.temporaryObjectId]),
          )
          .run();
      const job = tx
        .update(mediaJobs)
        .set({
          status: 'failed',
          error: diagnostic,
          finishedAt: now,
          updatedAt: now,
        })
        .where(and(eq(mediaJobs.id, jobId), eq(mediaJobs.status, 'running')))
        .returning()
        .get();
      if (job)
        tx.update(mediaImages)
          .set({ processingStatus: 'failed', updatedAt: now })
          .where(
            and(
              eq(mediaImages.id, job.imageId),
              ne(mediaImages.processingStatus, 'ready'),
            ),
          )
          .run();
    });
    logger.error(
      { err: error, jobId, step, diagnostic },
      'Media processing failed',
    );
  }
}
