import { and, eq, inArray } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { resolveLocalUploadStorage } from '../storage/defaults.ts';
import { inspectImage } from './formats.ts';
import { analyzeMediaError, mediaError } from './errors.ts';
import { readObject, inspectObject, deleteObject } from '../storage/local.ts';
import type { MediaRuntime } from './process.ts';
import { startMediaTool } from './tools.ts';
import { markUnpublishedMediaObjects } from './objects.ts';
import { mediaJobSteps } from './reprocess.ts';
import { advanceMediaStep } from './recovery.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaVersions,
  type DerivedVersionKind,
} from './schema.ts';

export function activeMediaJob(db: BetterSQLite3Database, jobId: string) {
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
  const storage = resolveLocalUploadStorage(db, image.storageId);
  return { job, image, storage };
}

export function savedMediaCandidate(
  db: BetterSQLite3Database,
  jobId: string,
  kind: DerivedVersionKind,
) {
  return db
    .select()
    .from(mediaObjects)
    .where(
      and(
        eq(mediaObjects.jobId, jobId),
        eq(mediaObjects.purpose, kind),
        eq(mediaObjects.status, 'stored'),
      ),
    )
    .get();
}

/** Persist candidate facts and progress together; ready images publish only on completion. */
export function saveMediaCandidate(
  db: BetterSQLite3Database,
  jobId: string,
  kind: DerivedVersionKind,
  objectId: string,
  result: {
    size: number;
    width: number;
    height: number;
    format: string;
    mime: string;
  },
  temporaryObjectId?: string,
) {
  db.transaction((tx) => {
    const { job, image } = activeMediaJob(tx, jobId);
    const now = new Date();
    const details = {
      byteSize: result.size,
      width: result.width,
      height: result.height,
      format: result.format,
      mime: result.mime,
    };
    tx.update(mediaObjects)
      .set({
        ...details,
        status: 'stored',
        byteSizeConfirmedAt: now,
        error: null,
        updatedAt: now,
      })
      .where(eq(mediaObjects.id, objectId))
      .run();
    if (temporaryObjectId)
      tx.update(mediaObjects)
        .set({
          status: 'deleted',
          byteSize: 0,
          byteSizeConfirmedAt: now,
          updatedAt: now,
        })
        .where(eq(mediaObjects.id, temporaryObjectId))
        .run();
    if (
      image.processingStatus !== 'ready' &&
      job.expectedVersions.includes(kind)
    )
      replaceMediaVersion(tx, image.id, kind, objectId, details, now);
    const steps = mediaJobSteps(job);
    advanceMediaStep(tx, jobId, steps[steps.indexOf(kind) + 1] ?? 'complete');
  });
}

/** Current references and cleanup ownership switch in the caller's short transaction. */
export function replaceMediaVersion(
  db: BetterSQLite3Database,
  imageId: string,
  kind: DerivedVersionKind,
  objectId: string,
  details: {
    byteSize: number;
    width: number | null;
    height: number | null;
    format: string;
    mime: string;
  },
  now: Date,
) {
  const previous = db
    .select()
    .from(mediaVersions)
    .where(
      and(eq(mediaVersions.imageId, imageId), eq(mediaVersions.kind, kind)),
    )
    .get();
  db.insert(mediaVersions)
    .values({ imageId, kind, objectId, ...details, createdAt: now })
    .onConflictDoUpdate({
      target: [mediaVersions.imageId, mediaVersions.kind],
      set: { objectId, ...details, createdAt: now },
    })
    .run();
  if (previous && previous.objectId !== objectId)
    markMediaCandidates(
      db,
      [previous.objectId],
      'Replaced by a newly published version',
    );
}

export function completeMediaJob(db: BetterSQLite3Database, jobId: string) {
  db.transaction((tx) => {
    const { job, image } = activeMediaJob(tx, jobId);
    const candidates = job.expectedVersions.map((kind) => ({
      kind,
      object: savedMediaCandidate(tx, jobId, kind),
    }));
    if (candidates.some(({ object }) => !object))
      throw mediaError(
        'MEDIA_VERSIONS_MISSING',
        `Missing saved versions for ${jobId}`,
      );
    const now = new Date();
    if (image.processingStatus === 'ready')
      for (const { kind, object } of candidates) {
        replaceMediaVersion(
          tx,
          image.id,
          kind,
          object!.id,
          {
            byteSize: object!.byteSize!,
            width: object!.width,
            height: object!.height,
            format: object!.format!,
            mime: object!.mime!,
          },
          now,
        );
      }
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
    tx.update(mediaImages)
      .set({ processingStatus: 'ready', updatedAt: now })
      .where(eq(mediaImages.id, image.id))
      .run();
    markUnpublishedMediaObjects(
      tx,
      jobId,
      'Unpublished processing intermediate',
    );
  });
}

export function markMediaCandidates(
  db: BetterSQLite3Database,
  ids: string[],
  diagnostic: string,
) {
  db.update(mediaObjects)
    .set({
      status: 'cleanup_pending',
      error: diagnostic,
      updatedAt: new Date(),
    })
    .where(inArray(mediaObjects.id, ids))
    .run();
}

/** Only the exact objects of this job are reconciled; partial files never establish success. */
export async function reconcileMediaObjects(
  runtime: MediaRuntime,
  jobId: string,
  kind: DerivedVersionKind,
  workspace: string,
  diskLimitBytes: number,
  signal: AbortSignal,
) {
  const { db, storageRoot, logger } = runtime;
  const { storage, job } = activeMediaJob(db, jobId);
  const outputFormat =
    kind === 'thumbnail' ? 'webp' : job.snapshot.outputFormat;
  const candidates = db
    .select()
    .from(mediaObjects)
    .where(
      and(
        eq(mediaObjects.jobId, jobId),
        inArray(mediaObjects.status, [
          'planned',
          'writing',
          'cleanup_pending',
          'cleanup_failed',
        ]),
      ),
    )
    .all();
  for (const candidate of candidates) {
    if (candidate.purpose !== kind && candidate.purpose !== 'temporary')
      continue;
    signal.throwIfAborted();
    const existing = await inspectObject(storageRoot, storage, candidate.key);
    if (
      existing &&
      candidate.purpose === kind &&
      candidate.status === 'writing' &&
      !savedMediaCandidate(db, jobId, kind)
    ) {
      let verified: Awaited<ReturnType<typeof inspectImage>> | undefined;
      try {
        const data = await readObject(
          storageRoot,
          storage,
          candidate.key,
          'image/webp',
          signal,
        );
        const facts = await inspectImage(data.stream, workspace, signal);
        if (facts.mime !== `image/${outputFormat}`)
          throw mediaError(
            'MEDIA_OUTPUT_INVALID',
            'Recovered candidate has unexpected encoding',
          );
        const full = await readObject(
          storageRoot,
          storage,
          candidate.key,
          'image/webp',
          signal,
        );
        const tool = startMediaTool(
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
            String(Math.floor(diskLimitBytes)),
            '-limit',
            'thread',
            '1',
            `${outputFormat}:-`,
            'null:',
          ],
          {
            workspace,
            input: full.stream,
            cancelSignal: signal,
            timeout: 120_000,
            forceKillAfterDelay: 1000,
          },
        );
        const error = await tool.settled;
        if (error) throw error;
        verified = facts;
      } catch (err) {
        if (
          (err as { code?: string } | null)?.code ===
          'MEDIA_TOOL_SHUTDOWN_FAILED'
        )
          throw err;
        signal.throwIfAborted();
        const analysis = analyzeMediaError(err);
        if (analysis.preserveCandidate) throw err;
        // A bounded check could not establish a complete result. Its owned candidate
        // is discarded and regenerated; original and committed versions stay intact.
        logger.info(
          { err, jobId, objectId: candidate.id },
          'Discarding unverified recovery candidate',
        );
        markMediaCandidates(db, [candidate.id], analysis.diagnostic);
      }
      if (verified) {
        saveMediaCandidate(db, jobId, kind, candidate.id, {
          size: existing.size,
          width: verified.width,
          height: verified.height,
          format: verified.format,
          mime: verified.mime,
        });
        continue;
      }
    }
    try {
      await deleteObject(storageRoot, storage, candidate.key);
      db.update(mediaObjects)
        .set({
          status: 'deleted',
          byteSize: 0,
          byteSizeConfirmedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(mediaObjects.id, candidate.id))
        .run();
    } catch (err) {
      db.update(mediaObjects)
        .set({
          status: 'cleanup_failed',
          byteSize: existing?.size ?? 0,
          byteSizeConfirmedAt: new Date(),
          error: analyzeMediaError(err).diagnostic,
          updatedAt: new Date(),
        })
        .where(eq(mediaObjects.id, candidate.id))
        .run();
      throw err;
    }
  }
}
