import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { inspectMediaObject } from './storage.ts';
import { storageConfigs } from '../storage/schema.ts';
import { cleanupMediaObject } from './cleanup-object.ts';
import { analyzeMediaError } from './errors.ts';
import type { MediaRuntime } from './process.ts';
import {
  mediaCleanupJobs,
  mediaImages,
  mediaJobs,
  mediaMetadata,
  mediaObjects,
  mediaVersions,
} from './schema.ts';

export class MediaCleanupError extends Error {
  readonly code: string;
  readonly status: 404 | 409;
  constructor(code: string, status: 404 | 409, message: string) {
    super(message);
    this.name = 'MediaCleanupError';
    this.code = code;
    this.status = status;
  }
}

export function readMediaCleanup(db: BetterSQLite3Database, imageId: string) {
  const job = db
    .select()
    .from(mediaCleanupJobs)
    .where(eq(mediaCleanupJobs.imageId, imageId))
    .get();
  if (!job)
    throw new MediaCleanupError(
      'MEDIA_CLEANUP_NOT_FOUND',
      404,
      '永久删除任务不存在',
    );
  const remaining = db
    .select({
      objectId: mediaObjects.id,
      key: mediaObjects.key,
      purpose: mediaObjects.purpose,
      status: mediaObjects.status,
      byteSize: mediaObjects.byteSize,
      attempts: mediaObjects.cleanupAttempts,
      nextAttemptAt: mediaObjects.nextCleanupAt,
      error: mediaObjects.error,
    })
    .from(mediaObjects)
    .where(
      and(
        eq(mediaObjects.imageId, imageId),
        ne(mediaObjects.status, 'deleted'),
      ),
    )
    .orderBy(asc(mediaObjects.key))
    .all();
  // The live ledger includes already cleared objects until the whole task succeeds.
  // Success removes the ledger, so historical totals are no longer available.
  const deleted =
    job.status === 'succeeded'
      ? null
      : db
          .select({ purpose: mediaObjects.purpose })
          .from(mediaObjects)
          .where(
            and(
              eq(mediaObjects.imageId, imageId),
              eq(mediaObjects.status, 'deleted'),
            ),
          )
          .all();
  return {
    jobId: job.id,
    imageId,
    status: job.status,
    waitingForWrites: job.status !== 'succeeded' && hasActiveJob(db, imageId),
    cycle: job.cycle,
    error: job.error,
    finishedAt: job.finishedAt,
    totalObjects: deleted === null ? null : remaining.length + deleted.length,
    deletedObjects: deleted === null ? null : deleted.length,
    deletedPurposes:
      deleted === null
        ? null
        : [...new Set(deleted.map((object) => object.purpose))],
    remaining,
  };
}

/** Acceptance is synchronous and idempotent; retries alone open a new finite cycle. */
export function requestPermanentDelete(
  db: BetterSQLite3Database,
  imageId: string,
  retry = false,
) {
  return db.transaction(
    (tx) => {
      const existing = tx
        .select()
        .from(mediaCleanupJobs)
        .where(eq(mediaCleanupJobs.imageId, imageId))
        .get();
      if (existing && (!retry || existing.status !== 'failed'))
        return readMediaCleanup(tx, imageId);
      const image = tx
        .select()
        .from(mediaImages)
        .where(eq(mediaImages.id, imageId))
        .get();
      if (!image)
        throw new MediaCleanupError('MEDIA_IMAGE_NOT_FOUND', 404, '图片不存在');
      if (!image.trashedAt)
        throw new MediaCleanupError(
          'MEDIA_NOT_TRASHED',
          409,
          '只能永久删除回收站中的图片',
        );
      if (retry && !existing)
        throw new MediaCleanupError(
          'MEDIA_CLEANUP_NOT_FOUND',
          404,
          '永久删除任务不存在',
        );
      const now = new Date();
      tx.update(mediaImages)
        .set({ deletionStatus: 'deleting', updatedAt: now })
        .where(eq(mediaImages.id, imageId))
        .run();
      tx.update(mediaJobs)
        .set({
          status: 'cancelled',
          error: 'MEDIA_IMAGE_DELETING: 永久删除已受理',
          nextAttemptAt: null,
          finishedAt: now,
          updatedAt: now,
        })
        .where(
          and(eq(mediaJobs.imageId, imageId), eq(mediaJobs.status, 'queued')),
        )
        .run();
      tx.update(mediaObjects)
        .set({
          status: 'cleanup_pending',
          byteSize: sql`case when ${mediaObjects.status} in ('planned', 'writing') then null else ${mediaObjects.byteSize} end`,
          byteSizeConfirmedAt: sql`case when ${mediaObjects.status} in ('planned', 'writing') then null else ${mediaObjects.byteSizeConfirmedAt} end`,
          cleanupAttempts: 0,
          nextCleanupAt: null,
          error: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(mediaObjects.imageId, imageId),
            ne(mediaObjects.status, 'deleted'),
          ),
        )
        .run();
      if (existing)
        tx.update(mediaCleanupJobs)
          .set({
            status: 'queued',
            cycle: existing.cycle + 1,
            error: null,
            finishedAt: null,
            updatedAt: now,
          })
          .where(eq(mediaCleanupJobs.id, existing.id))
          .run();
      else
        tx.insert(mediaCleanupJobs)
          .values({
            id: randomUUID(),
            imageId,
            status: 'queued',
            createdAt: now,
            updatedAt: now,
          })
          .run();
      return readMediaCleanup(tx, imageId);
    },
    { behavior: 'immediate' },
  );
}

export function retryMediaCleanup(db: BetterSQLite3Database, imageId: string) {
  return requestPermanentDelete(db, imageId, true);
}

function hasActiveJob(db: BetterSQLite3Database, imageId: string) {
  return (
    db
      .select({ id: mediaJobs.id })
      .from(mediaJobs)
      .where(
        and(
          eq(mediaJobs.imageId, imageId),
          inArray(mediaJobs.status, ['queued', 'running']),
        ),
      )
      .get() !== undefined
  );
}

/** Invoked by the single scheduler only after content promises and their tool shutdown have settled. */
export async function cleanupPermanentDeletes(
  runtime: MediaRuntime,
  activeImages: ReadonlySet<string>,
  signal?: AbortSignal,
) {
  const { db } = runtime;
  const jobs = db
    .select({ job: mediaCleanupJobs, storage: storageConfigs })
    .from(mediaCleanupJobs)
    .innerJoin(mediaImages, eq(mediaImages.id, mediaCleanupJobs.imageId))
    .innerJoin(storageConfigs, eq(storageConfigs.id, mediaImages.storageId))
    .where(inArray(mediaCleanupJobs.status, ['queued', 'running']))
    .orderBy(asc(mediaCleanupJobs.createdAt))
    .limit(20)
    .all();
  for (const { job, storage } of jobs) {
    if (signal?.aborted) break;
    if (activeImages.has(job.imageId) || hasActiveJob(db, job.imageId))
      continue;
    db.update(mediaCleanupJobs)
      .set({ status: 'running', updatedAt: new Date() })
      .where(eq(mediaCleanupJobs.id, job.id))
      .run();
    // A settling writer may have saved facts after acceptance. Its objects still belong to deletion.
    db.update(mediaObjects)
      .set({
        status: 'cleanup_pending',
        byteSize: sql`case when ${mediaObjects.status} in ('planned', 'writing') then null else ${mediaObjects.byteSize} end`,
        byteSizeConfirmedAt: sql`case when ${mediaObjects.status} in ('planned', 'writing') then null else ${mediaObjects.byteSizeConfirmedAt} end`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(mediaObjects.imageId, job.imageId),
          inArray(mediaObjects.status, ['planned', 'writing', 'stored']),
        ),
      )
      .run();
    const objects = db
      .select()
      .from(mediaObjects)
      .where(
        and(
          eq(mediaObjects.imageId, job.imageId),
          eq(mediaObjects.status, 'cleanup_pending'),
          sql`(${mediaObjects.nextCleanupAt} is null or ${mediaObjects.nextCleanupAt} <= ${Date.now()})`,
        ),
      )
      .orderBy(asc(mediaObjects.key))
      .limit(20)
      .all();
    for (const object of objects) {
      if (signal?.aborted) break;
      if (object.cleanupAttempts >= 2) {
        // A crash after DELETE may leave an exhausted intent. Reconcile absence without another DELETE.
        let error =
          'MEDIA_CLEANUP_EXHAUSTED: 删除尝试被中断，有限次数已用尽，请手动重试';
        let size = object.byteSize;
        let confirmedAt = object.byteSizeConfirmedAt;
        let absent = false;
        try {
          const facts = await inspectMediaObject(
            runtime,
            storage,
            object.key,
            signal,
          );
          absent = facts === null;
          size = facts?.size ?? 0;
          confirmedAt = new Date();
        } catch (err) {
          signal?.throwIfAborted();
          error = analyzeMediaError(err).diagnostic;
        }
        db.update(mediaObjects)
          .set({
            status: absent ? 'deleted' : 'cleanup_failed',
            byteSize: size,
            byteSizeConfirmedAt: confirmedAt,
            error: absent ? null : error,
            nextCleanupAt: null,
            updatedAt: new Date(),
          })
          .where(eq(mediaObjects.id, object.id))
          .run();
        continue;
      }
      // Persist the budget before I/O. Restart never resets it.
      const attempts = object.cleanupAttempts + 1;
      db.update(mediaObjects)
        .set({
          cleanupAttempts: attempts,
          nextCleanupAt: null,
          updatedAt: new Date(),
        })
        .where(eq(mediaObjects.id, object.id))
        .run();
      await cleanupMediaObject(
        runtime,
        storage,
        object,
        { retryAt: attempts < 2 ? new Date(Date.now() + 5000) : undefined },
        signal,
      );
    }
    if (signal?.aborted) break;
    db.transaction(
      (tx) => {
        if (hasActiveJob(tx, job.imageId)) return;
        const remaining = tx
          .select()
          .from(mediaObjects)
          .where(
            and(
              eq(mediaObjects.imageId, job.imageId),
              ne(mediaObjects.status, 'deleted'),
            ),
          )
          .all();
        if (remaining.some((object) => object.status !== 'cleanup_failed'))
          return;
        const now = new Date();
        if (remaining.length) {
          tx.update(mediaImages)
            .set({ deletionStatus: 'cleanup_failed', updatedAt: now })
            .where(eq(mediaImages.id, job.imageId))
            .run();
          tx.update(mediaCleanupJobs)
            .set({
              status: 'failed',
              error: 'MEDIA_CLEANUP_FAILED: 部分对象未能清理，请核对剩余清单',
              finishedAt: now,
              updatedAt: now,
            })
            .where(eq(mediaCleanupJobs.id, job.id))
            .run();
          return;
        }
        tx.delete(mediaVersions)
          .where(eq(mediaVersions.imageId, job.imageId))
          .run();
        tx.delete(mediaMetadata)
          .where(eq(mediaMetadata.imageId, job.imageId))
          .run();
        tx.delete(mediaObjects)
          .where(eq(mediaObjects.imageId, job.imageId))
          .run();
        tx.delete(mediaJobs).where(eq(mediaJobs.imageId, job.imageId)).run();
        // collections relationships cascade; analytics and upload retain historical identities.
        tx.delete(mediaImages).where(eq(mediaImages.id, job.imageId)).run();
        tx.update(mediaCleanupJobs)
          .set({
            status: 'succeeded',
            error: null,
            finishedAt: now,
            updatedAt: now,
          })
          .where(eq(mediaCleanupJobs.id, job.id))
          .run();
      },
      { behavior: 'immediate' },
    );
  }
}
