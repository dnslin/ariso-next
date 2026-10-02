import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { planLocalWrite } from '../storage/local.ts';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { MediaTransaction } from './images.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
  type DerivedVersionKind,
} from './schema.ts';

/** Commit the returned plan before storage I/O. Both final and partial keys have owners. */
export function planDerivedObject(
  tx: MediaTransaction,
  jobId: string,
  purpose: DerivedVersionKind,
) {
  const job = tx.select().from(mediaJobs).where(eq(mediaJobs.id, jobId)).get();
  if (!job) throw new Error(`Media job not found: ${jobId}`);
  const image = tx
    .select()
    .from(mediaImages)
    .where(eq(mediaImages.id, job.imageId))
    .get()!;
  const write = planLocalWrite(`images/${image.id}/${purpose}`);
  const objectId = randomUUID();
  const temporaryObjectId = randomUUID();
  const now = new Date();
  tx.insert(mediaObjects)
    .values(
      [
        { id: objectId, key: write.key, purpose },
        {
          id: temporaryObjectId,
          key: write.temporaryKey,
          purpose: 'temporary' as const,
        },
      ].map((object) => ({
        ...object,
        imageId: image.id,
        jobId,
        storageId: image.storageId,
        status: 'planned' as const,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .run();
  return { objectId, temporaryObjectId, storageId: image.storageId, ...write };
}

/** Stored results for the supplied jobs; this does not imply publication in media_versions. */
export function readGeneratedMediaVersions(
  db: BetterSQLite3Database,
  jobs: Pick<typeof mediaJobs.$inferSelect, 'id' | 'expectedVersions'>[],
) {
  if (!jobs.length) return new Map<string, DerivedVersionKind[]>();
  const objects = db
    .select({ jobId: mediaObjects.jobId, purpose: mediaObjects.purpose })
    .from(mediaObjects)
    .where(
      and(
        inArray(
          mediaObjects.jobId,
          jobs.map((job) => job.id),
        ),
        inArray(mediaObjects.purpose, ['compressed', 'thumbnail', 'watermark']),
        eq(mediaObjects.status, 'stored'),
      ),
    )
    .all();
  return new Map(
    jobs.map((job) => [
      job.id,
      job.expectedVersions.filter((kind) =>
        objects.some(
          (object) => object.jobId === job.id && object.purpose === kind,
        ),
      ),
    ]),
  );
}

/** Preserve current versions; terminal failures release every other owned object. */
export function markUnpublishedMediaObjects(
  db: BetterSQLite3Database,
  jobId: string,
  diagnostic: string,
) {
  db.update(mediaObjects)
    .set({
      status: 'cleanup_pending',
      error: diagnostic,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(mediaObjects.jobId, jobId),
        inArray(mediaObjects.status, ['planned', 'writing', 'stored']),
        sql`not exists (select 1 from media_versions where object_id = ${mediaObjects.id})`,
      ),
    )
    .run();
}
