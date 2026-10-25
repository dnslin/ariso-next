import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { mediaJobs } from './schema.ts';
import { initialMediaSettings } from './validation.ts';

const currentOriginals = sql`select i.id imageId, i.display_name displayName, o.content_sha256 hash,
  s.enabled enabled,
  (select j.status from media_jobs j where j.image_id=i.id and j.kind='fingerprint' order by j.created_at desc,j.rowid desc limit 1) jobStatus,
  (select j.error from media_jobs j where j.image_id=i.id and j.kind='fingerprint' order by j.created_at desc,j.rowid desc limit 1) error
  from media_images i join media_versions v on v.image_id=i.id and v.kind='original'
  join media_objects o on o.id=v.object_id and o.status='stored'
  join storage_configs s on s.id=i.storage_id where i.deletion_status is null`;

export function readFingerprintCoverage(db: BetterSQLite3Database) {
  return db.transaction((tx) => {
    const counts = tx.get<{
      total: number;
      completed: number;
      running: number;
      failed: number;
      unavailable: number;
    }>(sql`select count(*) total,
      count(case when hash is not null then 1 end) completed,
      count(case when hash is null and enabled=1 and jobStatus='running' then 1 end) running,
      count(case when hash is null and enabled=1 and jobStatus in ('failed','cancelled') then 1 end) failed,
      count(case when hash is null and enabled=0 then 1 end) unavailable from (${currentOriginals})`)!;
    const failures = tx.all<{
      imageId: string;
      displayName: string;
      message: string;
    }>(sql`select imageId,displayName,
      case when enabled=0 then '图片所属存储已停用，启用后继续检查' else coalesce(error,'指纹检查未完成，请重试') end message
      from (${currentOriginals}) where hash is null and (enabled=0 or jobStatus in ('failed','cancelled')) order by imageId limit 20`);
    return {
      ...counts,
      pending:
        counts.total -
        counts.completed -
        counts.running -
        counts.failed -
        counts.unavailable,
      complete: counts.completed === counts.total,
      failures,
    };
  });
}

/** Keep a small backlog; the shared scheduler runs at most one fingerprint reader. */
export function enqueueFingerprintJobs(db: BetterSQLite3Database) {
  // The partial index contains only missing original hashes, not every unhashed derivative.
  // A completed library needs neither a history scan nor a write transaction.
  const candidate = db.get<{ id: string }>(sql`select o.id from media_objects o
    where o.purpose='original' and o.content_sha256 is null and o.status='stored'
    and exists(select 1 from media_versions v join media_images i on i.id=v.image_id
      join storage_configs s on s.id=i.storage_id
      where v.image_id=o.image_id and v.kind='original' and v.object_id=o.id
        and i.deletion_status is null and s.enabled=1) limit 1`);
  if (!candidate) return 0;
  return db.transaction(
    (tx) => {
      // A storage disable is an operational pause; re-enabling makes its work runnable again.
      tx.update(mediaJobs)
        .set({
          status: 'queued',
          error: null,
          finishedAt: null,
          retryCount: 0,
          recoveryCount: 0,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(mediaJobs.kind, 'fingerprint'),
            eq(mediaJobs.status, 'failed'),
            sql`${mediaJobs.error} like '%STORAGE_DISABLED%'`,
            sql`exists (select 1 from media_images i join storage_configs s on s.id=i.storage_id where i.id=${mediaJobs.imageId} and i.deletion_status is null and s.enabled=1)`,
          ),
        )
        .run();
      const active = tx.get<{ count: number }>(
        sql`select count(*) count from media_jobs j join media_images i on i.id=j.image_id join storage_configs s on s.id=i.storage_id where j.kind='fingerprint' and j.status in ('queued','running') and s.enabled=1 and i.deletion_status is null`,
      )!.count;
      if (active >= 20) return 0;
      const candidates = tx.all<{
        imageId: string;
      }>(sql`select imageId from (${currentOriginals}) c
      where hash is null and enabled=1 and (jobStatus is null or jobStatus='succeeded')
      and not exists(select 1 from media_jobs j where j.image_id=c.imageId and j.status in ('queued','running'))
      order by imageId limit ${20 - active}`);
      const now = new Date();
      for (const { imageId } of candidates)
        tx.insert(mediaJobs)
          .values({
            id: randomUUID(),
            imageId,
            kind: 'fingerprint',
            scope: 'all',
            // Fingerprints never render or retain a configured watermark asset.
            snapshot: {
              ...initialMediaSettings,
              compressionEnabled: false,
              watermarkAsset: null,
            },
            expectedVersions: [],
            status: 'queued',
            step: 'fingerprint',
            createdAt: now,
            updatedAt: now,
          })
          .run();
      return candidates.length;
    },
    { behavior: 'immediate' },
  );
}

export function retryFingerprintJobs(db: BetterSQLite3Database) {
  db.transaction(
    (tx) => {
      tx.update(mediaJobs)
        .set({
          status: 'queued',
          error: null,
          retryCount: 0,
          recoveryCount: 0,
          nextAttemptAt: null,
          finishedAt: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(mediaJobs.kind, 'fingerprint'),
            inArray(mediaJobs.status, ['failed', 'cancelled']),
            sql`exists(select 1 from (${currentOriginals}) c where c.imageId=${mediaJobs.imageId} and c.hash is null and c.enabled=1)`,
          ),
        )
        .run();
      enqueueFingerprintJobs(tx);
    },
    { behavior: 'immediate' },
  );
  return readFingerprintCoverage(db);
}
