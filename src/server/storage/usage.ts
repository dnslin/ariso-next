import { sql } from 'drizzle-orm';

/** Probe responsibility precedes scanner observations of the same key. No remote I/O. */
export const storageUsageObjects = sql`select storage_id storageId, key objectKey,
  2 ownerPriority, object_state != 'planned' occupied, 'pending' usageGroup,
  case when object_state = 'writing' then null else byte_size end knownBytes,
  confirmed_at confirmedAt from storage_probes
  union all select storage_id, key, 3, 1, 'pending', size, confirmed_at from storage_orphans`;
