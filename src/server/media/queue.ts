import { setTimeout } from 'node:timers/promises';
import { rm } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { sep } from 'node:path';
import { terminateMediaTools } from './tools.ts';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { processMediaJob, type MediaRuntime } from './process.ts';
import { mediaImages, mediaJobs } from './schema.ts';
import { readMediaSettings } from './settings.ts';
import { recoverMediaJobs } from './recovery.ts';
import { mediaError } from './formats.ts';

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
  const active = new Set<Promise<void>>();
  let failure: unknown;
  async function consume() {
    try {
      recoverMediaJobs(runtime.db);
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
      while (!signal.aborted && runtime.db.$client.open) {
        const limit = readMediaSettings(runtime.db)?.concurrency ?? 1;
        while (!signal.aborted && active.size < limit) {
          const job = claimNextMediaJob(runtime.db);
          if (!job) break;
          const execution = processMediaJob(runtime, job.id, signal)
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
            .finally(() => active.delete(execution));
          active.add(execution);
        }
        await setTimeout(50, undefined, { signal, ref: active.size > 0 });
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
      await Promise.all(active);
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
