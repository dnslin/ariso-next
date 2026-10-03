import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import {
  getStorageReferences,
  readMediaObjectReferences,
} from '../media/references.ts';
import {
  readUploadReferences,
  readUploadObjectReferences,
} from '../upload/usage.ts';
import {
  readProbeReferences,
  readProbeObjectReferences,
} from '../storage/probes.ts';
import { storageOrphans } from '../storage/schema.ts';
import type { StorageReferences } from '../storage/references.ts';

/** Same synchronous transaction as the configuration or object ownership check. */
export function readStorageReferences(
  db: BetterSQLite3Database,
  storageId: string,
  key?: string,
  activeWrites = 0,
): StorageReferences {
  if (key !== undefined) {
    const objects = readMediaObjectReferences(db, storageId, key);
    const uploads = readUploadObjectReferences(db, storageId, key);
    const probes = readProbeObjectReferences(db, storageId, key);
    return {
      counts: {
        objects: objects.length,
        uploads: uploads.length,
        probes: probes.length,
      },
      keys: new Set(
        objects.length || uploads.length || probes.length ? [key] : [],
      ),
      activeWrites,
    };
  }
  const media = getStorageReferences(db, storageId);
  const uploads = readUploadReferences(db).filter(
    (session) => session.storageId === storageId,
  );
  const probes = readProbeReferences(db, storageId);
  const keys = new Set(media.objects.map((object) => object.key));
  for (const session of uploads) {
    if (session.temporaryKey) keys.add(session.temporaryKey);
    if (session.finalKey) keys.add(session.finalKey);
  }
  for (const probe of probes) keys.add(probe.key);
  const orphans = db
    .select()
    .from(storageOrphans)
    .where(eq(storageOrphans.storageId, storageId))
    .all();
  return {
    counts: {
      images: media.images.length,
      versions: media.versions.length,
      objects: media.objects.length,
      jobs: media.jobs.length,
      cleanupJobs: media.cleanupJobs.length,
      uploads: uploads.length,
      probes: probes.length,
      orphans: orphans.filter((object) => !keys.has(object.key)).length,
    },
    keys,
    activeWrites,
  };
}
