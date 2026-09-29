import type Database from 'better-sqlite3';

export type UsageObject = {
  storageId: string;
  key: string;
  owner: 'media' | 'upload' | 'storage';
  group: 'recycle' | 'original' | 'derived' | 'pending';
  state:
    | 'planned'
    | 'writing'
    | 'stored'
    | 'cleanup_pending'
    | 'cleanup_failed'
    | 'deleted'
    | 'handed_off';
  confirmedBytes: number | null;
  confirmedAt: number | null;
};

/** Experiment only: S3/probe/orphan production providers do not exist yet. */
export function createExperimentResponsibilityTable(sqlite: Database.Database) {
  sqlite.exec(`CREATE TABLE experimental_usage_responsibility (
    storageId TEXT NOT NULL, key TEXT NOT NULL, owner TEXT NOT NULL,
    "group" TEXT NOT NULL, state TEXT NOT NULL, confirmedBytes INTEGER,
    confirmedAt INTEGER, PRIMARY KEY(storageId, key, owner))`);
}

export function recordExperimentObject(
  sqlite: Database.Database,
  object: UsageObject,
) {
  sqlite
    .prepare(
      `INSERT INTO experimental_usage_responsibility
    (storageId,key,owner,"group",state,confirmedBytes,confirmedAt)
    VALUES (@storageId,@key,@owner,@group,@state,@confirmedBytes,@confirmedAt)
    ON CONFLICT(storageId,key,owner) DO UPDATE SET
    "group"=excluded."group",state=excluded.state,
    confirmedBytes=excluded.confirmedBytes,confirmedAt=excluded.confirmedAt`,
    )
    .run(object);
}

/** Read-only adapters over existing responsibility records, in one SQLite snapshot. */
export function readUsageObjects(sqlite: Database.Database): UsageObject[] {
  return sqlite.transaction(() => {
    const media = sqlite
      .prepare(
        `SELECT o.storage_id storageId, o.key, 'media' owner,
      CASE WHEN i.trashed_at IS NOT NULL OR i.deletion_status IS NOT NULL THEN 'recycle'
      WHEN v.kind = 'original' THEN 'original'
      WHEN v.kind IS NOT NULL THEN 'derived' ELSE 'pending' END "group",
      o.status state, o.byte_size confirmedBytes, o.updated_at confirmedAt
      FROM media_objects o JOIN media_images i ON i.id=o.image_id
      LEFT JOIN media_versions v ON v.object_id=o.id`,
      )
      .all() as UsageObject[];
    // finalizing is persisted BEFORE rename; neither key's existence is confirmed.
    // receiving byte_size is progress, not proof of a complete object.
    const upload = sqlite
      .prepare(
        `SELECT storage_id storageId, temporary_key key,
      'upload' owner, 'pending' "group", 'writing' state,
      NULL confirmedBytes, NULL confirmedAt FROM upload_sessions WHERE temporary_key IS NOT NULL
      UNION ALL SELECT storage_id,final_key,'upload','pending',
      CASE WHEN state='accepted' THEN 'handed_off' ELSE 'writing' END,NULL,NULL
      FROM upload_sessions WHERE final_key IS NOT NULL`,
      )
      .all() as UsageObject[];
    const experimental = sqlite
      .prepare('SELECT * FROM experimental_usage_responsibility')
      .all() as UsageObject[];
    return [...media, ...upload, ...experimental];
  })();
}

export function aggregateUsage(records: UsageObject[]) {
  const priority = { recycle: 0, original: 1, derived: 2, pending: 3 };
  const objects = new Map<string, UsageObject>();
  const ownerPriority = { media: 0, upload: 1, storage: 2 };
  // Confirmation updates the same owner's observation before cross-provider deduplication.
  const responsibilities = new Map<string, UsageObject>();
  for (const row of records) {
    const identity = JSON.stringify([row.storageId, row.key, row.owner]);
    const previous = responsibilities.get(identity);
    if (!previous || (row.confirmedAt ?? -1) > (previous.confirmedAt ?? -1))
      responsibilities.set(identity, row);
  }
  for (const row of responsibilities.values()) {
    if (
      row.state === 'deleted' ||
      row.state === 'handed_off' ||
      row.state === 'planned'
    )
      continue;
    const identity = JSON.stringify([row.storageId, row.key]);
    const previous = objects.get(identity);
    if (
      !previous ||
      priority[row.group] < priority[previous.group] ||
      (priority[row.group] === priority[previous.group] &&
        ownerPriority[row.owner] < ownerPriority[previous.owner])
    )
      objects.set(identity, row);
  }
  const storages = new Map<
    string,
    {
      storageId: string;
      knownBytes: number;
      pendingObjects: number;
      groups: Record<UsageObject['group'], number>;
      lastConfirmedAt: number | null;
    }
  >();
  for (const row of records) {
    if (!storages.has(row.storageId))
      storages.set(row.storageId, {
        storageId: row.storageId,
        knownBytes: 0,
        pendingObjects: 0,
        groups: { recycle: 0, original: 0, derived: 0, pending: 0 },
        lastConfirmedAt: null,
      });
  }
  for (const row of objects.values()) {
    const storage = storages.get(row.storageId)!;
    if (row.state === 'writing' || row.confirmedBytes === null) {
      storage.pendingObjects++;
    } else {
      storage.knownBytes += row.confirmedBytes;
      storage.groups[row.group] += row.confirmedBytes;
      if (row.confirmedAt !== null)
        storage.lastConfirmedAt = Math.max(
          storage.lastConfirmedAt ?? 0,
          row.confirmedAt,
        );
    }
  }
  return [...storages.values()].sort((a, b) =>
    a.storageId.localeCompare(b.storageId),
  );
}

export function readExperimentObjects(
  sqlite: Database.Database,
): UsageObject[] {
  return sqlite
    .prepare('SELECT * FROM experimental_usage_responsibility')
    .all() as UsageObject[];
}
