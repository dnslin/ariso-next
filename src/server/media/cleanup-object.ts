import { eq } from 'drizzle-orm';
import type { StorageConfig } from '../storage/schema.ts';
import { deleteMediaObject, inspectMediaObject } from './storage.ts';
import { analyzeMediaError } from './errors.ts';
import type { MediaRuntime } from './process.ts';
import { mediaImages, mediaObjects } from './schema.ts';

/** Shared exact-key maintenance step; database settlement failures propagate to the scheduler. */
export async function cleanupMediaObject(
  runtime: MediaRuntime,
  storage: StorageConfig,
  object: typeof mediaObjects.$inferSelect,
  policy: { retryAt?: Date; adoptDeletion?: boolean } = {},
  signal?: AbortSignal,
) {
  let size = object.byteSize;
  let confirmedAt = object.byteSizeConfirmedAt;
  let failure: { error: unknown } | undefined;
  try {
    const facts = await inspectMediaObject(
      runtime,
      storage,
      object.key,
      signal,
    );
    size = facts?.size ?? 0;
    confirmedAt = new Date();
    if (facts !== null)
      await deleteMediaObject(runtime, storage, object.key, signal);
  } catch (error) {
    // Runtime shutdown leaves the persisted attempt for recovery, not a business failure.
    signal?.throwIfAborted();
    failure = { error };
  }
  const adopted =
    policy.adoptDeletion &&
    runtime.db
      .select({ deletionStatus: mediaImages.deletionStatus })
      .from(mediaImages)
      .where(eq(mediaImages.id, object.imageId))
      .get()?.deletionStatus;
  const retryAt = adopted ? new Date(Date.now() + 5000) : policy.retryAt;
  const retry =
    failure && retryAt && analyzeMediaError(failure.error).retryable;
  runtime.db
    .update(mediaObjects)
    .set({
      ...(adopted ? { cleanupAttempts: 1 } : {}),
      status: failure
        ? retry
          ? 'cleanup_pending'
          : 'cleanup_failed'
        : 'deleted',
      byteSize: failure ? size : 0,
      byteSizeConfirmedAt: confirmedAt,
      error: failure ? analyzeMediaError(failure.error).diagnostic : null,
      nextCleanupAt: retry ? retryAt : null,
      updatedAt: new Date(),
    })
    .where(eq(mediaObjects.id, object.id))
    .run();
  if (failure)
    runtime.logger.error(
      {
        err: failure.error,
        objectId: object.id,
        jobId: object.jobId,
        key: object.key,
      },
      'Media object cleanup failed',
    );
  return failure;
}
