import { and, eq, ne } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { markUnpublishedMediaObjects } from './objects.ts';
import { analyzeMediaError } from './errors.ts';
import { mediaImages, mediaJobs, mediaMetadata } from './schema.ts';

export function settleMediaFailure(
  db: BetterSQLite3Database,
  jobId: string,
  step: string,
  error: unknown,
) {
  const analysis = analyzeMediaError(error);
  const diagnostic = `${step}: ${analysis.diagnostic}`;
  db.transaction((tx) => {
    const job = tx
      .select()
      .from(mediaJobs)
      .where(eq(mediaJobs.id, jobId))
      .get();
    if (!job || job.status !== 'running') return;
    const deleting = tx
      .select({ deletionStatus: mediaImages.deletionStatus })
      .from(mediaImages)
      .where(eq(mediaImages.id, job.imageId))
      .get()?.deletionStatus;
    const retry = !deleting && job.retryCount < 1 && analysis.retryable;
    const now = new Date();
    tx.update(mediaJobs)
      .set({
        status: deleting ? 'cancelled' : retry ? 'queued' : 'failed',
        error: diagnostic,
        retryCount: job.retryCount + (retry ? 1 : 0),
        nextAttemptAt: retry ? new Date(now.getTime() + 5000) : null,
        finishedAt: retry ? null : now,
        updatedAt: now,
      })
      .where(eq(mediaJobs.id, jobId))
      .run();
    if (job.kind === 'metadata')
      tx.update(mediaMetadata)
        .set({
          status: retry ? 'queued' : 'failed',
          error: diagnostic,
          attemptedAt: now,
        })
        .where(eq(mediaMetadata.imageId, job.imageId))
        .run();
    if (job.kind === 'process')
      tx.update(mediaMetadata)
        .set({ status: 'failed', error: diagnostic })
        .where(
          and(
            eq(mediaMetadata.imageId, job.imageId),
            eq(mediaMetadata.status, 'running'),
          ),
        )
        .run();
    if (job.kind === 'process' && !deleting)
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
        const image = tx
          .select({ deletionStatus: mediaImages.deletionStatus })
          .from(mediaImages)
          .where(eq(mediaImages.id, job.imageId))
          .get();
        if (image?.deletionStatus) {
          const now = new Date();
          tx.update(mediaJobs)
            .set({
              status: 'cancelled',
              nextAttemptAt: null,
              error: 'MEDIA_IMAGE_DELETING: 永久删除已受理',
              finishedAt: now,
              updatedAt: now,
            })
            .where(eq(mediaJobs.id, job.id))
            .run();
          continue;
        }
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
          markUnpublishedMediaObjects(
            tx,
            job.id,
            `${job.step}: MEDIA_RECOVERY_EXHAUSTED`,
          );
        if (job.kind === 'metadata')
          tx.update(mediaMetadata)
            .set({
              status: exhausted ? 'failed' : 'queued',
              error: exhausted
                ? 'metadata: MEDIA_RECOVERY_EXHAUSTED: Interrupted without progress; manually reread metadata'
                : 'metadata: MEDIA_INTERRUPTED: Resuming the saved task',
              attemptedAt: now,
            })
            .where(eq(mediaMetadata.imageId, job.imageId))
            .run();
        if (exhausted && job.kind === 'process')
          tx.update(mediaMetadata)
            .set({
              status: 'failed',
              error:
                'metadata: MEDIA_RECOVERY_EXHAUSTED: Interrupted without progress',
            })
            .where(
              and(
                eq(mediaMetadata.imageId, job.imageId),
                eq(mediaMetadata.status, 'running'),
              ),
            )
            .run();
        if (exhausted && job.kind === 'process')
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
