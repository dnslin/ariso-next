import { and, eq, inArray, sql } from 'drizzle-orm';
import { deleteMediaObject, inspectMediaObject } from './storage.ts';
import { storageConfigs } from '../storage/schema.ts';
import { analyzeMediaError } from './errors.ts';
import type { MediaRuntime } from './process.ts';
import { mediaObjects } from './schema.ts';

const unreferenced = sql`not exists (select 1 from media_versions where object_id = ${mediaObjects.id})`;
const settled = sql`not exists (select 1 from media_jobs where id = ${mediaObjects.jobId} and status in ('queued', 'running'))`;

/** One retry per startup; cleanup failures remain visible until the next recovery. */
export function recoverMediaCandidateCleanup(db: MediaRuntime['db']) {
  db.update(mediaObjects)
    .set({ status: 'cleanup_pending', updatedAt: new Date() })
    .where(
      and(eq(mediaObjects.status, 'cleanup_failed'), unreferenced, settled),
    )
    .run();
}

/** Cleanup is independent of content success and can run on disabled storage. */
export async function cleanupMediaCandidates(
  runtime: MediaRuntime,
  signal?: AbortSignal,
) {
  const { db, logger } = runtime;
  const objects = db
    .select({ object: mediaObjects, storage: storageConfigs })
    .from(mediaObjects)
    .innerJoin(storageConfigs, eq(storageConfigs.id, mediaObjects.storageId))
    .where(
      and(eq(mediaObjects.status, 'cleanup_pending'), unreferenced, settled),
    )
    .limit(20)
    .all();
  for (const { object, storage } of objects) {
    if (signal?.aborted) break;
    let size = object.byteSize;
    try {
      size =
        (await inspectMediaObject(runtime, storage, object.key, signal))
          ?.size ?? 0;
      await deleteMediaObject(runtime, storage, object.key, signal);
      db.update(mediaObjects)
        .set({
          status: 'deleted',
          byteSize: 0,
          error: null,
          updatedAt: new Date(),
        })
        .where(eq(mediaObjects.id, object.id))
        .run();
    } catch (err) {
      db.update(mediaObjects)
        .set({
          status: 'cleanup_failed',
          byteSize: size,
          error: analyzeMediaError(err).diagnostic,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(mediaObjects.id, object.id),
            inArray(mediaObjects.status, ['cleanup_pending', 'cleanup_failed']),
          ),
        )
        .run();
      logger.error(
        { err, objectId: object.id, jobId: object.jobId, key: object.key },
        'Media candidate cleanup failed',
      );
    }
  }
}
