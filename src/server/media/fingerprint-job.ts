import { createHash } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { MediaRuntime } from './process.ts';
import { activeMediaJob } from './steps.ts';
import { readMediaObject } from './storage.ts';
import { mediaJobs, mediaObjects, mediaVersions } from './schema.ts';
import { settleMediaFailure } from './recovery.ts';
import { analyzeMediaError } from './errors.ts';

/** Stream the immutable original once. No decoding, derived versions, metadata tools or temporary file. */
export async function processFingerprintJob(
  runtime: MediaRuntime,
  jobId: string,
  signal = new AbortController().signal,
) {
  const { db } = runtime;
  try {
    const { image, storage } = activeMediaJob(db, jobId);
    const object = db
      .select({ object: mediaObjects })
      .from(mediaVersions)
      .innerJoin(mediaObjects, eq(mediaObjects.id, mediaVersions.objectId))
      .where(
        and(
          eq(mediaVersions.imageId, image.id),
          eq(mediaVersions.kind, 'original'),
        ),
      )
      .get()?.object;
    if (object && object.contentSha256 === null) {
      const source = await readMediaObject(
        runtime,
        storage,
        object.key,
        object.mime!,
        signal,
      );
      const hash = createHash('sha256');
      try {
        for await (const chunk of source.stream) {
          signal.throwIfAborted();
          hash.update(chunk);
        }
        signal.throwIfAborted();
      } finally {
        source.stream.destroy();
      }
      const sha256 = hash.digest('hex');
      db.transaction((tx) => {
        activeMediaJob(tx, jobId);
        tx.update(mediaObjects)
          .set({ contentSha256: sha256 })
          .where(
            and(
              eq(mediaObjects.id, object.id),
              isNull(mediaObjects.contentSha256),
              sql`exists(select 1 from media_versions v where v.image_id=${image.id} and v.kind='original' and v.object_id=${object.id})`,
            ),
          )
          .run();
      });
    }
    const now = new Date();
    db.update(mediaJobs)
      .set({
        status: 'succeeded',
        step: 'complete',
        error: null,
        finishedAt: now,
        updatedAt: now,
      })
      .where(and(eq(mediaJobs.id, jobId), eq(mediaJobs.status, 'running')))
      .run();
  } catch (error) {
    const interrupted =
      signal.aborted &&
      (signal.reason as { code?: string })?.code === 'MEDIA_INTERRUPTED';
    if (!interrupted && analyzeMediaError(error).code === 'STORAGE_DISABLED') {
      const paused = db
        .update(mediaJobs)
        .set({ status: 'queued', startedAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(mediaJobs.id, jobId),
            eq(mediaJobs.status, 'running'),
            sql`exists(select 1 from media_images where id=${mediaJobs.imageId} and deletion_status is null)`,
          ),
        )
        .run();
      if (paused.changes) {
        runtime.logger.info(
          { err: error, jobId },
          'Original fingerprint paused because storage is disabled',
        );
        return;
      }
    }
    if (!interrupted) settleMediaFailure(db, jobId, 'fingerprint', error);
    runtime.logger.error(
      { err: error, jobId },
      'Original fingerprint interrupted or failed',
    );
  }
}
