import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { planLocalWrite } from '../storage/local.ts';
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
