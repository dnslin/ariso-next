import { setTimeout } from 'node:timers/promises';
import { rm } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { sep } from 'node:path';
import { terminateMediaTools } from './tools.ts';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { processMediaJob, type MediaRuntime } from './process.ts';
import { processMetadataJob } from './metadata-job.ts';
import { mediaImages, mediaJobs } from './schema.ts';
import { readMediaSettings } from './settings.ts';
import { recoverMediaJobs } from './recovery.ts';
import {
  cleanupMediaCandidates,
  recoverMediaCandidateCleanup,
} from './candidate-cleanup.ts';
import { mediaError } from './errors.ts';
import { discardMediaInput } from './input.ts';
import { cleanupPermanentDeletes } from './cleanup.ts';

/** Claim and persist ownership before any asynchronous storage or tool work. */
export function claimNextMediaJob(db: BetterSQLite3Database) {
  return db.transaction(
    (tx) => {
      const job = tx
        .select()
        .from(mediaJobs)
        .where(
          and(
            eq(mediaJobs.status, 'queued'),
            sql`exists (select 1 from media_images where id = ${mediaJobs.imageId} and deletion_status is null)`,
            sql`(${mediaJobs.nextAttemptAt} is null or ${mediaJobs.nextAttemptAt} <= ${Date.now()})`,
            sql`not exists (select 1 from media_jobs active where active.image_id = ${mediaJobs.imageId} and (active.status = 'running' or (active.status = 'queued' and active.rowid < ${mediaJobs}.rowid)))`,
          ),
        )
        .orderBy(asc(mediaJobs.createdAt), asc(sql`${mediaJobs}.rowid`))
        .get();
      if (!job) return null;
      const now = new Date();
      const claimed = tx
        .update(mediaJobs)
        .set({
          status: 'running',
          startedAt: now,
          nextAttemptAt: null,
          updatedAt: now,
        })
        .where(and(eq(mediaJobs.id, job.id), eq(mediaJobs.status, 'queued')))
        .returning()
        .get();
      if (!claimed) return null;
      if (job.kind === 'process')
        tx.update(mediaImages)
          .set({ processingStatus: 'processing', updatedAt: now })
          .where(
            and(
              eq(mediaImages.id, job.imageId),
              ne(mediaImages.processingStatus, 'ready'),
            ),
          )
          .run();
      return claimed;
    },
    { behavior: 'immediate' },
  );
}

/** One scheduler per Web runtime; a reduced limit only affects new claims. */
export function startMediaQueue(runtime: MediaRuntime) {
  const controller = new AbortController();
  const { signal } = controller;
  const active = new Map<
    string,
    { imageId: string; controller: AbortController; execution: Promise<void> }
  >();
  let failure: unknown;
  let maintenance: Promise<void> | undefined;
  async function consume() {
    try {
      recoverMediaJobs(runtime.db);
      recoverMediaCandidateCleanup(runtime.db);
      // A previous recovery may have persisted failure just before the process
      // was killed. Discover owned workspaces independently of task status.
      let entries: string[];
      try {
        entries = readdirSync(runtime.temporaryRoot);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        entries = [];
      }
      for (const entry of entries) {
        if (signal.aborted) break;
        if (entry.startsWith('media-input-')) {
          const jobId = entry.slice('media-input-'.length);
          const job = runtime.db
            .select({ status: mediaJobs.status })
            .from(mediaJobs)
            .where(eq(mediaJobs.id, jobId))
            .get();
          if (job && !['queued', 'running'].includes(job.status))
            await discardMediaInput(runtime.temporaryRoot, jobId);
          continue;
        }
        if (!entry.startsWith('media-')) continue;
        const job = runtime.db
          .select({ id: mediaJobs.id })
          .from(mediaJobs)
          .where(eq(mediaJobs.id, entry.slice('media-'.length)))
          .get();
        if (!job) continue;
        const workspace = `${runtime.temporaryRoot}${sep}${entry}`;
        await terminateMediaTools(workspace);
        await rm(workspace, { recursive: true, force: true });
      }
      let nextCleanupAt = 0;
      while (!signal.aborted && runtime.db.$client.open) {
        for (const { imageId, controller } of active.values()) {
          const image = runtime.db
            .select({ deletionStatus: mediaImages.deletionStatus })
            .from(mediaImages)
            .where(eq(mediaImages.id, imageId))
            .get();
          if (image?.deletionStatus)
            controller.abort(
              mediaError(
                'MEDIA_IMAGE_DELETING',
                `Image is being deleted: ${imageId}`,
              ),
            );
        }
        const limit = readMediaSettings(runtime.db)?.concurrency ?? 1;
        while (!signal.aborted && active.size < limit) {
          const job = claimNextMediaJob(runtime.db);
          if (!job) break;
          const run =
            job.kind === 'metadata' ? processMetadataJob : processMediaJob;
          const jobController = new AbortController();
          const execution = run(
            runtime,
            job.id,
            AbortSignal.any([signal, jobController.signal]),
          )
            .catch((err: unknown) => {
              failure ??= err;
              runtime.logger.error(
                { err, jobId: job.id },
                'Media job settlement failed',
              );
              controller.abort(
                mediaError('MEDIA_INTERRUPTED', 'Media queue failed', err),
              );
            })
            .finally(() => active.delete(job.id));
          active.set(job.id, {
            imageId: job.imageId,
            controller: jobController,
            execution,
          });
        }
        if (!maintenance && Date.now() >= nextCleanupAt) {
          // One maintenance batch at a time; remote I/O never blocks claims or cancellation.
          maintenance = (async () => {
            await cleanupPermanentDeletes(
              runtime,
              new Set([...active.values()].map(({ imageId }) => imageId)),
              signal,
            );
            if (runtime.db.$client.open && !signal.aborted)
              await cleanupMediaCandidates(runtime, signal);
          })()
            .catch((err: unknown) => {
              if (
                signal.aborted &&
                (err === signal.reason ||
                  (err instanceof Error && err.name === 'AbortError'))
              )
                return;
              failure ??= err;
              runtime.logger.error(
                { err },
                'Media maintenance settlement failed',
              );
              controller.abort(
                mediaError('MEDIA_INTERRUPTED', 'Media queue failed', err),
              );
            })
            .finally(() => {
              maintenance = undefined;
              nextCleanupAt = Date.now() + 1000;
            });
        }
        await setTimeout(50, undefined, {
          signal,
          ref: active.size > 0 || maintenance !== undefined,
        });
      }
    } catch (err) {
      if (!(
        signal.aborted &&
        err instanceof Error &&
        err.name === 'AbortError'
      )) {
        failure ??= err;
        runtime.logger.error({ err }, 'Media queue stopped after an error');
        controller.abort(
          mediaError('MEDIA_INTERRUPTED', 'Media queue failed', err),
        );
      }
    } finally {
      await Promise.all([
        maintenance,
        ...[...active.values()].map(({ execution }) => execution),
      ]);
    }
  }
  const completion = consume();
  return {
    async stop() {
      controller.abort(
        mediaError('MEDIA_INTERRUPTED', 'Web runtime is stopping'),
      );
      await completion;
      if (failure) throw failure;
    },
  };
}
