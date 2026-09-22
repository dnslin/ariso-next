import { and, eq, inArray } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { resolveUploadStorage } from '../storage/defaults.ts';
import { inspectImage } from './formats.ts';
import { analyzeMediaError, mediaError } from './errors.ts';
import { readObject, inspectObject, deleteObject } from '../storage/local.ts';
import type { MediaRuntime } from './process.ts';
import { startMediaTool } from './tools.ts';
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
  const storage = resolveUploadStorage(db, image.storageId);
  return { job, image, storage };
}

export function savedMediaVersion(
  db: BetterSQLite3Database,
  jobId: string,
  kind: DerivedVersionKind,
) {
  return db
    .select()
    .from(mediaVersions)
    .innerJoin(mediaObjects, eq(mediaObjects.id, mediaVersions.objectId))
    .where(
      and(
        eq(mediaObjects.jobId, jobId),
        eq(mediaVersions.kind, kind),
        eq(mediaObjects.status, 'stored'),
      ),
    )
    .get();
}

/** Publication and progress are committed together; recovery never publishes a saved step twice. */
export function publishMediaVersion(
  db: BetterSQLite3Database,
  jobId: string,
  kind: DerivedVersionKind,
  objectId: string,
  result: { size: number; width: number; height: number },
  temporaryObjectId?: string,
) {
  db.transaction((tx) => {
    const { job, image } = activeMediaJob(tx, jobId);
    const now = new Date();
    const details = {
      byteSize: result.size,
      format: 'WEBP',
      mime: 'image/webp',
    };
    tx.update(mediaObjects)
      .set({ ...details, status: 'stored', error: null, updatedAt: now })
      .where(eq(mediaObjects.id, objectId))
      .run();
    if (temporaryObjectId)
      tx.update(mediaObjects)
        .set({ status: 'deleted', byteSize: 0, updatedAt: now })
        .where(eq(mediaObjects.id, temporaryObjectId))
        .run();
    tx.insert(mediaVersions)
      .values({
        imageId: image.id,
        kind,
        objectId,
        ...details,
        width: result.width,
        height: result.height,
        createdAt: now,
      })
      .run();
    advanceMediaStep(
      tx,
      jobId,
      job.expectedVersions[job.expectedVersions.indexOf(kind) + 1] ??
        'complete',
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
  const { storage } = activeMediaJob(db, jobId);
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
      !savedMediaVersion(db, jobId, kind)
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
        if (facts.mime !== 'image/webp')
          throw mediaError(
            'MEDIA_OUTPUT_INVALID',
            'Recovered candidate is not WebP',
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
            'webp:-',
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
        publishMediaVersion(db, jobId, kind, candidate.id, {
          size: existing.size,
          width: verified.width,
          height: verified.height,
        });
        continue;
      }
    }
    try {
      await deleteObject(storageRoot, storage, candidate.key);
      db.update(mediaObjects)
        .set({ status: 'deleted', byteSize: 0, updatedAt: new Date() })
        .where(eq(mediaObjects.id, candidate.id))
        .run();
    } catch (err) {
      db.update(mediaObjects)
        .set({
          status: 'cleanup_failed',
          byteSize: existing?.size ?? 0,
          error: analyzeMediaError(err).diagnostic,
          updatedAt: new Date(),
        })
        .where(eq(mediaObjects.id, candidate.id))
        .run();
      throw err;
    }
  }
}
