import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { readMediaUsage } from '../media/usage.ts';
import { readUploadUsage } from '../upload/usage.ts';
import { readProbeUsage } from '../storage/probes.ts';
import { listStorages } from '../storage/settings.ts';
import { readStorageOrphanUsage } from '../storage/maintenance.ts';
import type { ReadStorageReferences } from '../storage/references.ts';

/** Compose persisted observations in one snapshot; this is not a remote capacity query. */
export function readStorageOverview(
  db: BetterSQLite3Database,
  readReferences: ReadStorageReferences,
) {
  return db.transaction((tx) => {
    const observations = [
      ...readMediaUsage(tx),
      ...readUploadUsage(tx),
      ...readProbeUsage(tx),
    ];
    return listStorages(tx).map((storage) => {
      const owned = observations.filter((row) => row.storageId === storage.id);
      const orphans = readStorageOrphanUsage(
        { db: tx, readReferences },
        storage.id,
      );
      return {
        ...storage,
        usage: {
          knownBytes: owned.reduce(
            (bytes, row) => bytes + row.knownBytes,
            orphans.knownBytes,
          ),
          unconfirmedObjects: owned.reduce(
            (count, row) => count + row.unconfirmedObjects,
            0,
          ),
        },
      };
    });
  });
}
