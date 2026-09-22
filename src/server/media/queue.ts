import { setTimeout } from 'node:timers/promises';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { processMediaJob, type MediaRuntime } from './process.ts';
import { mediaImages, mediaJobs } from './schema.ts';

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
            sql`not exists (select 1 from media_jobs active where active.image_id = ${mediaJobs.imageId} and active.status = 'running')`,
          ),
        )
        .orderBy(asc(mediaJobs.createdAt), asc(sql`${mediaJobs}.rowid`))
        .get();
      if (!job) return null;
      const now = new Date();
      const claimed = tx
        .update(mediaJobs)
        .set({ status: 'running', startedAt: now, updatedAt: now })
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

/** One serial consumer per Web runtime. Recovery and configurable concurrency are T-MED-04. */
export function startMediaQueue(runtime: MediaRuntime) {
  const controller = new AbortController();
  const { signal } = controller;
  async function consume() {
    let jobId: string | undefined;
    try {
      while (!signal.aborted && runtime.db.$client.open) {
        const job = claimNextMediaJob(runtime.db);
        jobId = job?.id;
        if (job) {
          await processMediaJob(runtime, job.id, signal);
        } else {
          await setTimeout(250, undefined, { signal, ref: false });
        }
      }
    } catch (err) {
      if (!(
        signal.aborted &&
        err instanceof Error &&
        err.name === 'AbortError'
      )) {
        runtime.logger.error(
          { err, jobId },
          'Media queue stopped after an error',
        );
      }
    }
  }
  const completion = consume();
  return {
    async stop() {
      controller.abort();
      await completion;
    },
  };
}
