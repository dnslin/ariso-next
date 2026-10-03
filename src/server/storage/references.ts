import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

/** Business providers are composed by startup, never imported by storage. */
export type StorageReferences = {
  counts: Record<string, number>;
  keys: Set<string>;
  activeWrites: number;
};
export type ReadStorageReferences = (
  db: BetterSQLite3Database,
  storageId: string,
  key?: string,
) => StorageReferences;

export function requireNoStorageReferences(
  storageId: string,
  references: StorageReferences,
  includeOrphans = true,
) {
  if (
    references.activeWrites > 0 ||
    Object.entries(references.counts).some(
      ([kind, count]) => (includeOrphans || kind !== 'orphans') && count > 0,
    )
  )
    throw Object.assign(new Error(`存储仍有引用: ${storageId}`), {
      code: 'STORAGE_IN_USE',
      storageId,
      references: references.counts,
      activeWrites: references.activeWrites,
    });
}
