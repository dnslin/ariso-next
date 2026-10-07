import { asc, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { countAlbums } from '../collections/records.ts';
import {
  readMediaCounts,
  mediaUsageObjects,
  type MediaUsageGroup,
} from '../media/usage.ts';
import { uploadUsageObjects } from '../upload/usage.ts';
import { storageUsageObjects } from '../storage/usage.ts';
import { storageConfigs } from '../storage/schema.ts';

type UsageRow = {
  storageId: string;
  usageGroup: MediaUsageGroup;
  knownBytes: number;
  unconfirmedObjects: number;
  missingConfirmationTimes: number;
  confirmedAt: number | null;
};

/** Aggregate in SQLite so the application retains only one row per storage/group. */
export function readUsage(db: BetterSQLite3Database, now = new Date()) {
  return db.transaction((tx) => {
    const rows = tx.all<UsageRow>(sql`with observations as (
      ${mediaUsageObjects} union all ${uploadUsageObjects} union all ${storageUsageObjects}
    ), owned as (
      select *, row_number() over (
        partition by storageId, objectKey order by ownerPriority, confirmedAt desc
      ) responsibilityRank from observations
    ) select storageId, usageGroup, coalesce(sum(knownBytes), 0) knownBytes,
      count(case when knownBytes is null then 1 end) unconfirmedObjects,
      count(case when knownBytes is not null and confirmedAt is null then 1 end) missingConfirmationTimes,
      min(case when knownBytes is not null then confirmedAt end) confirmedAt
      from owned where responsibilityRank = 1 and occupied = 1 group by storageId, usageGroup`);
    const storages = tx
      .select({
        id: storageConfigs.id,
        name: storageConfigs.name,
        type: storageConfigs.type,
        enabled: storageConfigs.enabled,
      })
      .from(storageConfigs)
      .orderBy(asc(storageConfigs.id))
      .all()
      .map((storage) => {
        const owned = rows.filter((row) => row.storageId === storage.id);
        const groups = { recycle: 0, original: 0, derived: 0, pending: 0 };
        let confirmedAt: number | null = null;
        for (const row of owned) {
          groups[row.usageGroup] = row.knownBytes;
          if (row.confirmedAt !== null)
            confirmedAt =
              confirmedAt === null
                ? row.confirmedAt
                : Math.min(confirmedAt, row.confirmedAt);
        }
        const unconfirmedObjects = owned.reduce(
          (total, row) => total + row.unconfirmedObjects,
          0,
        );
        return {
          ...storage,
          knownBytes: owned.reduce((total, row) => total + row.knownBytes, 0),
          unconfirmedObjects,
          groups,
          confirmationStatus: unconfirmedObjects
            ? ('unconfirmed' as const)
            : ('confirmed' as const),
          confirmedAt:
            confirmedAt !== null &&
            !owned.some((row) => row.missingConfirmationTimes > 0)
              ? new Date(confirmedAt)
              : null,
        };
      });
    return { generatedAt: now, scope: 'registered-objects' as const, storages };
  });
}

/** Only the current counts portion of overview; access reports belong to T-ANA-04. */
export function readOverview(db: BetterSQLite3Database, now = new Date()) {
  return db.transaction((tx) => {
    const rows = readMediaCounts(tx);
    const counts = {
      normalImages: 0,
      recycledImages: 0,
      initialProcessingFailures: 0,
      reprocessFailures: 0,
    };
    for (const row of rows) {
      counts.normalImages += row.normalImages;
      counts.recycledImages += row.recycledImages;
      counts.initialProcessingFailures += row.initialProcessingFailures;
      counts.reprocessFailures += row.reprocessFailures;
    }
    return { generatedAt: now, counts: { ...counts, albums: countAlbums(tx) } };
  });
}
