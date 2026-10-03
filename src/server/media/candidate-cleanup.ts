import { and, eq, sql } from 'drizzle-orm';
import { storageConfigs } from '../storage/schema.ts';
import { cleanupMediaObject } from './cleanup-object.ts';
import type { MediaRuntime } from './process.ts';
import { mediaObjects } from './schema.ts';

const unreferenced = sql`not exists (select 1 from media_versions where object_id = ${mediaObjects.id})`;
const settled = sql`not exists (select 1 from media_jobs where id = ${mediaObjects.jobId} and status in ('queued', 'running'))`;
const notDeleting = sql`not exists (select 1 from media_images where id = ${mediaObjects.imageId} and deletion_status is not null)`;

/** One retry per startup; cleanup failures remain visible until the next recovery. */
export function recoverMediaCandidateCleanup(db: MediaRuntime['db']) {
  db.update(mediaObjects)
    .set({ status: 'cleanup_pending', updatedAt: new Date() })
    .where(
      and(
        eq(mediaObjects.status, 'cleanup_failed'),
        unreferenced,
        settled,
        notDeleting,
      ),
    )
    .run();
}

/** Cleanup is independent of content success and can run on disabled storage. */
export async function cleanupMediaCandidates(
  runtime: MediaRuntime,
  signal?: AbortSignal,
) {
  const { db } = runtime;
  const objects = db
    .select({ object: mediaObjects, storage: storageConfigs })
    .from(mediaObjects)
    .innerJoin(storageConfigs, eq(storageConfigs.id, mediaObjects.storageId))
    .where(
      and(
        eq(mediaObjects.status, 'cleanup_pending'),
        unreferenced,
        settled,
        notDeleting,
      ),
    )
    .limit(20)
    .all();
  for (const { object, storage } of objects) {
    if (signal?.aborted) break;
    await cleanupMediaObject(
      runtime,
      storage,
      object,
      { adoptDeletion: true },
      signal,
    );
  }
}
