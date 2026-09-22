import { and, eq, ne, inArray } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { describeProcessingError } from './formats.ts';
import { mediaImages, mediaJobs, mediaObjects } from './schema.ts';

/** Only explicitly transient I/O errors spend the one automatic retry. */
export function isTemporaryMediaError(error: unknown): boolean {
  let current = error;
  let temporary = false;
  while (current instanceof Error) {
    const detail = current as Error & { code?: string; timedOut?: boolean };
    if (detail.timedOut || detail.name === 'AbortError') return false;
    if (
      detail.code &&
      ['ENOSPC', 'EACCES', 'EPERM', 'INSUFFICIENT_DISK_SPACE'].includes(
        detail.code,
      )
    )
      return false;
    if (
      detail.code &&
      [
        'EAGAIN',
        'EBUSY',
        'EMFILE',
        'ENFILE',
        'EIO',
        'ECONNRESET',
        'ETIMEDOUT',
        'EPIPE',
      ].includes(detail.code)
    )
      temporary = true;
    current = detail.cause;
  }
  return temporary;
}

export function settleMediaFailure(
  db: BetterSQLite3Database,
  jobId: string,
  step: string,
  error: unknown,
) {
  const diagnostic = `${step}: ${describeProcessingError(error)}`;
  db.transaction((tx) => {
    const job = tx
      .select()
      .from(mediaJobs)
      .where(eq(mediaJobs.id, jobId))
      .get();
    if (!job || job.status !== 'running') return;
    const retry = job.retryCount < 1 && isTemporaryMediaError(error);
    const now = new Date();
    tx.update(mediaJobs)
      .set({
        status: retry ? 'queued' : 'failed',
        error: diagnostic,
        retryCount: job.retryCount + (retry ? 1 : 0),
        nextAttemptAt: retry ? new Date(now.getTime() + 5000) : null,
        finishedAt: retry ? null : now,
        updatedAt: now,
      })
      .where(eq(mediaJobs.id, jobId))
      .run();
    tx.update(mediaImages)
      .set({
        processingStatus: retry ? 'processing' : 'failed',
        updatedAt: now,
      })
      .where(
        and(
          eq(mediaImages.id, job.imageId),
          ne(mediaImages.processingStatus, 'ready'),
        ),
      )
      .run();
  });
  return diagnostic;
}

/** Persist the budget before any recovery I/O; restarting recovery cannot reset it. */
export function recoverMediaJobs(db: BetterSQLite3Database) {
  return db.transaction(
    (tx) => {
      const interrupted = tx
        .select()
        .from(mediaJobs)
        .where(eq(mediaJobs.status, 'running'))
        .all();
      for (const job of interrupted) {
        const exhausted = job.recoveryCount >= 2;
        const now = new Date();
        tx.update(mediaJobs)
          .set({
            status: exhausted ? 'failed' : 'queued',
            recoveryCount: job.recoveryCount + (exhausted ? 0 : 1),
            nextAttemptAt: null,
            error: exhausted
              ? `${job.step}: MEDIA_RECOVERY_EXHAUSTED: Interrupted without progress; manually reprocess this image`
              : `${job.step}: MEDIA_INTERRUPTED: Resuming the saved task`,
            finishedAt: exhausted ? now : null,
            updatedAt: now,
          })
          .where(eq(mediaJobs.id, job.id))
          .run();
        if (exhausted)
          tx.update(mediaObjects)
            .set({
              status: 'cleanup_pending',
              error: `${job.step}: MEDIA_RECOVERY_EXHAUSTED`,
              updatedAt: now,
            })
            .where(
              and(
                eq(mediaObjects.jobId, job.id),
                inArray(mediaObjects.status, ['planned', 'writing']),
              ),
            )
            .run();
        if (exhausted)
          tx.update(mediaImages)
            .set({ processingStatus: 'failed', updatedAt: now })
            .where(
              and(
                eq(mediaImages.id, job.imageId),
                ne(mediaImages.processingStatus, 'ready'),
              ),
            )
            .run();
      }
      return interrupted.map((job) => job.id);
    },
    { behavior: 'immediate' },
  );
}

/** Call in the same transaction that durably completes a step. */
export function advanceMediaStep(
  db: BetterSQLite3Database,
  jobId: string,
  step: string,
) {
  db.update(mediaJobs)
    .set({ step, recoveryCount: 0, updatedAt: new Date() })
    .where(and(eq(mediaJobs.id, jobId), ne(mediaJobs.step, step)))
    .run();
}
