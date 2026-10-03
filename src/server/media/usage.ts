import { and, asc, eq, notInArray, sql } from 'drizzle-orm';
import type { MediaTransaction } from './images.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaVersions,
} from './schema.ts';

type MediaUsageGroup = 'recycle' | 'original' | 'derived' | 'pending';
export type MediaStorageUsage = {
  storageId: string;
  normalImages: number;
  recycledImages: number;
  initialProcessingFailures: number;
  reprocessFailures: number;
  knownBytes: number;
  unconfirmedObjects: number;
  groups: Record<MediaUsageGroup, number>;
  /** Oldest size confirmation; null if an occupied known-size object's time is unknown. */
  confirmedAt: Date | null;
};

/** Read only persisted observations, in the combining caller's SQLite snapshot. */
export function readMediaUsage(tx: MediaTransaction): MediaStorageUsage[] {
  const latestProcessJobs = tx
    .select({
      imageId: mediaJobs.imageId,
      status: mediaJobs.status,
      rank: sql<number>`row_number() over (partition by ${mediaJobs.imageId} order by ${mediaJobs.createdAt} desc, ${mediaJobs}.rowid desc)`.as(
        'job_rank',
      ),
    })
    .from(mediaJobs)
    .where(eq(mediaJobs.kind, 'process'))
    .as('latest_process_jobs');
  const normal = sql`${mediaImages.trashedAt} is null and ${mediaImages.deletionStatus} is null`;
  const images = tx
    .select({
      storageId: mediaImages.storageId,
      normalImages: sql<number>`count(case when ${normal} then 1 end)`,
      recycledImages: sql<number>`count(case when not (${normal}) then 1 end)`,
      initialProcessingFailures: sql<number>`count(case when ${normal} and ${mediaImages.processingStatus} = 'failed' then 1 end)`,
      reprocessFailures: sql<number>`count(case when ${normal} and ${mediaImages.processingStatus} = 'ready' and ${latestProcessJobs.status} = 'failed' then 1 end)`,
    })
    .from(mediaImages)
    .leftJoin(
      latestProcessJobs,
      and(
        eq(latestProcessJobs.imageId, mediaImages.id),
        eq(latestProcessJobs.rank, 1),
      ),
    )
    .groupBy(mediaImages.storageId)
    .orderBy(asc(mediaImages.storageId))
    .all();
  const usage = new Map<string, MediaStorageUsage>(
    images.map((image) => [
      image.storageId,
      {
        ...image,
        knownBytes: 0,
        unconfirmedObjects: 0,
        groups: { recycle: 0, original: 0, derived: 0, pending: 0 },
        confirmedAt: null,
      },
    ]),
  );
  const group = sql<MediaUsageGroup>`case
    when ${mediaImages.trashedAt} is not null or ${mediaImages.deletionStatus} is not null then 'recycle'
    when ${mediaObjects.status} = 'stored' and ${mediaVersions.kind} = 'original' then 'original'
    when ${mediaObjects.status} = 'stored' and ${mediaVersions.kind} in ('compressed', 'thumbnail', 'watermark') then 'derived'
    else 'pending' end`;
  const known = sql`${mediaObjects.status} != 'writing' and ${mediaObjects.byteSize} is not null`;
  const objects = tx
    .select({
      storageId: mediaObjects.storageId,
      group,
      knownBytes: sql<number>`coalesce(sum(case when ${known} then ${mediaObjects.byteSize} end), 0)`,
      unconfirmedObjects: sql<number>`count(case when not (${known}) then 1 end)`,
      unknownConfirmationTimes: sql<number>`count(case when ${known} and ${mediaObjects.byteSizeConfirmedAt} is null then 1 end)`,
      confirmedAt: sql<
        number | null
      >`min(case when ${known} then ${mediaObjects.byteSizeConfirmedAt} end)`,
    })
    .from(mediaObjects)
    .innerJoin(mediaImages, eq(mediaImages.id, mediaObjects.imageId))
    .leftJoin(
      mediaVersions,
      and(
        eq(mediaVersions.objectId, mediaObjects.id),
        eq(mediaVersions.imageId, mediaObjects.imageId),
      ),
    )
    .where(notInArray(mediaObjects.status, ['planned', 'deleted']))
    .groupBy(mediaObjects.storageId, group)
    .all();
  const missingConfirmationTimes = new Set<string>();
  for (const object of objects) {
    const row = usage.get(object.storageId)!;
    row.knownBytes += object.knownBytes;
    row.unconfirmedObjects += object.unconfirmedObjects;
    row.groups[object.group] += object.knownBytes;
    if (object.unknownConfirmationTimes > 0)
      missingConfirmationTimes.add(object.storageId);
    if (
      object.confirmedAt !== null &&
      (row.confirmedAt === null ||
        object.confirmedAt < row.confirmedAt.getTime())
    )
      row.confirmedAt = new Date(object.confirmedAt);
  }
  for (const storageId of missingConfirmationTimes)
    usage.get(storageId)!.confirmedAt = null;
  return [...usage.values()];
}
