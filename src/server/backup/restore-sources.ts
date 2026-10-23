import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import type { RestoreRemoteSource } from './restore-remote-types.ts';

// The extracted database belongs to DATA_DIR; it is not a build asset.
const { join } = process.getBuiltinModule('node:path');
export function readRestoreRemoteSources(
  jobDirectory: string,
): RestoreRemoteSource[] {
  // The durable remote record retains original coordinates after work files are removed at ready.
  if (existsSync(join(jobDirectory, 'remote.json'))) return [];
  const path = join(jobDirectory, 'work', 'ariso.db');
  if (!existsSync(path)) return [];
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    return (
      db
        .prepare(
          `SELECT id AS storageId,name,COALESCE(endpoint,'') AS endpoint,COALESCE(region,'') AS region,COALESCE(bucket,'') AS bucket,COALESCE(path_prefix,'') AS pathPrefix,force_path_style AS forcePathStyle,config_revision AS configRevision FROM storage_configs WHERE type='s3' ORDER BY id`,
        )
        .all() as Array<
        Omit<RestoreRemoteSource, 'forcePathStyle'> & {
          forcePathStyle: number | null;
        }
      >
    ).map((row) => ({ ...row, forcePathStyle: Boolean(row.forcePathStyle) }));
  } finally {
    db.close();
  }
}
