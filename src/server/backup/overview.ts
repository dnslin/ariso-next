import { statfsSync } from 'node:fs';
import type { openRuntimeDatabase } from '../runtime/db.ts';
import type { BuildIdentity } from '../runtime/build-info.ts';

export function readBackupOverview(
  db: ReturnType<typeof openRuntimeDatabase>['db'],
  dataDir: string,
  application: BuildIdentity | null,
) {
  const sql = db.$client;
  const storages = (
    sql
      .prepare(
        `SELECT s.id,s.name,s.type,s.enabled,
    (SELECT COUNT(*) FROM media_images i WHERE i.storage_id=s.id) AS images,
    (SELECT COALESCE(SUM(o.byte_size),0) FROM media_objects o WHERE o.storage_id=s.id AND o.status!='deleted' AND o.purpose!='temporary') AS bytes
    FROM storage_configs s ORDER BY s.created_at,s.id`,
      )
      .all() as Array<{
      id: string;
      name: string;
      type: 'local' | 's3';
      enabled: number;
      images: number;
      bytes: number;
    }>
  ).map((storage) => ({ ...storage, enabled: Boolean(storage.enabled) }));
  const objects = (
    sql
      .prepare(
        "SELECT COUNT(*) AS n FROM media_objects WHERE status!='deleted' AND purpose!='temporary'",
      )
      .get() as { n: number }
  ).n;
  const bytes = storages.reduce((sum, storage) => sum + storage.bytes, 0);
  const images = storages.reduce((sum, storage) => sum + storage.images, 0);
  const disk = statfsSync(dataDir);
  const databaseBytes =
    Number(sql.pragma('page_count', { simple: true })) *
    Number(sql.pragma('page_size', { simple: true }));
  return {
    availability: {
      supported: application !== null,
      ...(!application
        ? { message: '当前构建没有发布版本信息，不能创建可恢复的备份' }
        : {}),
    },
    scope: {
      images,
      objects,
      bytes,
      freeBytes: disk.bavail * disk.bsize,
      estimatedBytes: bytes + databaseBytes + objects * 1024 + 16 * 1024 * 1024,
      storages,
    },
  };
}
