import Database from 'better-sqlite3';
import { realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import { z } from 'zod';
import type { BuildIdentity } from '../runtime/build-info.ts';
import { localPathSchema } from '../storage/validation.ts';
import { readObjectForMaintenance } from '../storage/local.ts';
import { checkBackupDatabase } from './normalize.ts';

const count = z.number().int().nonnegative().safe();
const storageSummary = {
  id: z.string().min(1),
  name: z.string(),
  enabled: z.boolean(),
  images: count,
  objects: count,
  bytes: count,
};
export const maxBackupManifestBytes = 16 * 1024 * 1024;
export const backupManifestSchema = z.strictObject({
  formatVersion: z.literal(1),
  application: z.strictObject({
    version: z.string().min(1),
    revision: z.string().min(1),
  }),
  databaseMigration: count,
  snapshotStartedAt: count,
  snapshotCompletedAt: count,
  siteName: z.string(),
  publicUrl: z.string(),
  ownerEmail: z.string(),
  images: count,
  trashedImages: count,
  albums: count,
  tags: count,
  objects: count,
  bytes: count,
  storages: z.array(
    z.discriminatedUnion('type', [
      z.strictObject({
        ...storageSummary,
        type: z.literal('local'),
        localPath: localPathSchema,
      }),
      z.strictObject({ ...storageSummary, type: z.literal('s3') }),
    ]),
  ),
});
export type BackupManifest = z.infer<typeof backupManifestSchema>;
export type BackupSummary = Omit<
  BackupManifest,
  'formatVersion' | 'databaseMigration' | 'snapshotStartedAt'
>;
export function backupSummary(manifest: BackupManifest): BackupSummary {
  const {
    formatVersion: _formatVersion,
    databaseMigration: _databaseMigration,
    snapshotStartedAt: _snapshotStartedAt,
    ...summary
  } = manifest;
  void _formatVersion;
  void _databaseMigration;
  void _snapshotStartedAt;
  return summary;
}
export type BackupFile = {
  name: string;
  size: number;
  storageId?: string;
} & ({ path: string } | { type: 's3'; storageId: string; key: string });
export function safeArchivePart(value: string) {
  if (!value || /[\\/\0]/.test(value) || value === '.' || value === '..')
    throw Object.assign(new Error(`非法备份身份路径: ${value}`), {
      code: 'BACKUP_PATH_INVALID',
    });
  return value;
}
export function safeObjectKey(value: string) {
  if (
    value.includes('\\') ||
    value.includes('\0') ||
    value.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw Object.assign(new Error(`非法备份对象路径: ${value}`), {
      code: 'BACKUP_PATH_INVALID',
    });
  return value;
}
export function readDatabaseMigration(db: Database.Database) {
  const row = db
    .prepare(
      'SELECT created_at AS value FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1',
    )
    .get() as { value: number } | undefined;
  if (!row || !Number.isSafeInteger(row.value))
    throw Object.assign(new Error('缺少数据库版本记录'), {
      code: 'BACKUP_DATABASE_INVALID',
    });
  return row.value;
}
export function backupDatabaseFacts(db: Database.Database) {
  checkBackupDatabase(db);
  const site = db
    .prepare(
      'SELECT name,public_url AS publicUrl FROM site_settings WHERE id=1',
    )
    .get() as { name: string; publicUrl: string } | undefined;
  const owner = db.prepare('SELECT id,email FROM user').get() as
    { id: string; email: string } | undefined;
  const credential =
    owner &&
    (db
      .prepare(
        "SELECT password FROM account WHERE user_id=? AND account_id=? AND provider_id='credential'",
      )
      .get(owner.id, owner.id) as { password: string } | undefined);
  if (
    !site ||
    !owner ||
    !credential?.password ||
    !db.prepare('SELECT 1 FROM media_settings').get() ||
    !db.prepare('SELECT 1 FROM storage_settings').get()
  )
    throw Object.assign(new Error('备份缺少完整站点与所有者配置'), {
      code: 'BACKUP_DATABASE_INVALID',
    });
  const total = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  return {
    siteName: site.name,
    publicUrl: site.publicUrl,
    ownerEmail: owner.email,
    images: total('SELECT COUNT(*) AS n FROM media_images'),
    trashedImages: total(
      'SELECT COUNT(*) AS n FROM media_images WHERE trashed_at IS NOT NULL',
    ),
    albums: total('SELECT COUNT(*) AS n FROM albums'),
    tags: total('SELECT COUNT(*) AS n FROM tags'),
  };
}

/** The normalized snapshot is the only source of object identity. No bucket/directory walk. */
export function* requiredBackupObjects(db: Database.Database) {
  const rows = db
    .prepare(
      `SELECT o.storage_id AS storageId,o.key,o.byte_size AS size,s.type,s.local_path AS localPath,s.enabled
    FROM media_objects o JOIN media_images i ON i.id=o.image_id JOIN storage_configs s ON s.id=o.storage_id
    WHERE o.purpose!='temporary' AND ((i.deletion_status IS NULL AND (
      o.status='stored' OR EXISTS(SELECT 1 FROM media_versions v WHERE v.object_id=o.id)
      OR EXISTS(SELECT 1 FROM media_size_versions v WHERE v.object_id=o.id OR v.source_object_id=o.id)
      OR EXISTS(SELECT 1 FROM media_replacements r JOIN media_jobs j ON j.id=r.job_id WHERE r.original_object_id=o.id AND j.status='queued')
      OR EXISTS(SELECT 1 FROM media_size_requests r JOIN media_jobs j ON j.id=r.job_id WHERE r.source_object_id=o.id AND j.status='queued')
      OR EXISTS(SELECT 1 FROM media_edit_requests r JOIN media_jobs j ON j.id=r.job_id WHERE r.rendered_object_id=o.id AND j.status='queued')))
      OR EXISTS(SELECT 1 FROM media_edit_requests r JOIN media_jobs j ON j.id=r.job_id WHERE r.source_object_id=o.id AND j.status='queued'
        AND NOT EXISTS(SELECT 1 FROM media_objects rendered WHERE rendered.id=r.rendered_object_id AND rendered.status='stored')))
    ORDER BY o.storage_id,o.key`,
    )
    .iterate() as Iterable<{
    storageId: string;
    key: string;
    size: number | null;
    type: 'local' | 's3';
    localPath: string | null;
    enabled: number;
  }>;
  for (const row of rows) {
    safeArchivePart(row.storageId);
    safeObjectKey(row.key);
    if (row.size === null || !Number.isSafeInteger(row.size) || row.size < 0)
      throw Object.assign(new Error(`必需对象没有已确认大小: ${row.key}`), {
        code: 'BACKUP_OBJECT_INVALID',
      });
    const object = {
      name: `objects/${row.storageId}/${row.key}`,
      size: row.size,
      storageId: row.storageId,
      key: row.key,
      enabled: Boolean(row.enabled),
    };
    if (row.type === 'local')
      yield {
        ...object,
        type: 'local' as const,
        localPath: localPathSchema.parse(row.localPath),
      };
    else if (row.type === 's3')
      yield { ...object, type: 's3' as const, localPath: null };
    else
      throw Object.assign(new Error(`不支持的备份存储类型: ${row.storageId}`), {
        code: 'BACKUP_DATABASE_INVALID',
      });
  }
}
export function* requiredBackupAssets(db: Database.Database) {
  const branding = db
    .prepare(
      'SELECT logo_key AS logo,favicon_key AS favicon FROM site_settings WHERE id=1',
    )
    .get() as { logo: string | null; favicon: string | null };
  for (const key of new Set([branding.logo, branding.favicon]))
    if (key) {
      safeObjectKey(key);
      yield {
        name: `assets/branding/${key}`,
        relativePath: `branding/${key}`,
        size: null as number | null,
      };
    }
  const watermarks = db
    .prepare(
      `SELECT path,size FROM (
    SELECT a.path,a.byte_size AS size FROM media_watermark_assets a JOIN media_settings m ON m.watermark_asset_id=a.id
    UNION SELECT json_extract(snapshot,'$.watermarkAsset.path'),json_extract(snapshot,'$.watermarkAsset.byteSize') FROM media_jobs WHERE status='queued'
    UNION SELECT json_extract(j.snapshot,'$.watermarkAsset.path'),json_extract(j.snapshot,'$.watermarkAsset.byteSize') FROM media_versions v JOIN media_objects o ON o.id=v.object_id JOIN media_jobs j ON j.id=o.job_id WHERE v.kind='watermark'
    UNION SELECT json_extract(value,'$.watermarkAsset.path'),json_extract(value,'$.watermarkAsset.byteSize') FROM media_replacements r JOIN media_jobs j ON j.id=r.job_id,json_each(r.snapshots) WHERE j.status='queued'
    UNION SELECT a.path,a.byte_size FROM media_edit_templates t JOIN media_watermark_assets a ON a.id=t.watermark_asset_id
    UNION SELECT json_extract(r.watermark_asset,'$.path'),json_extract(r.watermark_asset,'$.byteSize') FROM media_edit_requests r JOIN media_jobs j ON j.id=r.job_id
      WHERE NOT EXISTS(SELECT 1 FROM media_objects rendered WHERE rendered.id=r.rendered_object_id AND rendered.status='stored')
      AND (j.status='queued' OR (j.status='failed'
        AND EXISTS(SELECT 1 FROM media_images target WHERE target.id=j.image_id AND target.deletion_status IS NULL)
        AND EXISTS(SELECT 1 FROM media_versions v JOIN media_objects source ON source.id=v.object_id JOIN media_images i ON i.id=v.image_id
          WHERE v.image_id=r.source_image_id AND v.kind='original' AND v.object_id=r.source_object_id AND source.status='stored' AND i.deletion_status IS NULL)))
  ) WHERE path IS NOT NULL ORDER BY path`,
    )
    .iterate() as Iterable<{ path: string; size: number }>;
  const seen = new Map<string, number>();
  for (const asset of watermarks) {
    safeObjectKey(asset.path);
    if (
      !Number.isSafeInteger(asset.size) ||
      asset.size < 0 ||
      (seen.has(asset.path) && seen.get(asset.path) !== asset.size)
    )
      throw Object.assign(new Error(`水印素材记录不一致: ${asset.path}`), {
        code: 'BACKUP_OBJECT_INVALID',
      });
    if (seen.has(asset.path)) continue;
    seen.set(asset.path, asset.size);
    yield {
      name: `assets/watermarks/${asset.path}`,
      relativePath: `watermarks/${asset.path}`,
      size: asset.size,
    };
  }
}
async function assetFile(
  dataDir: string,
  asset: ReturnType<typeof requiredBackupAssets> extends Generator<infer T>
    ? T
    : never,
): Promise<BackupFile> {
  const root = await realpath(join(dataDir, 'assets'));
  const path = await realpath(join(root, asset.relativePath));
  const inside = relative(root, path);
  if (inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside))
    throw Object.assign(new Error(`素材路径超出目录: ${path}`), {
      code: 'BACKUP_PATH_INVALID',
    });
  const info = await stat(path);
  if (!info.isFile() || (asset.size !== null && info.size !== asset.size))
    throw Object.assign(new Error(`素材大小不一致: ${path}`), {
      code: 'BACKUP_OBJECT_INVALID',
    });
  return { name: asset.name, path, size: info.size };
}
export async function* iterateBackupFiles(options: {
  databasePath: string;
  dataDir: string;
}): AsyncGenerator<BackupFile> {
  const db = new Database(options.databasePath, {
    readonly: true,
    fileMustExist: true,
  });
  try {
    for (const object of requiredBackupObjects(db)) {
      if (object.type === 's3') {
        yield {
          name: object.name,
          size: object.size,
          storageId: object.storageId,
          key: object.key,
          type: 's3',
        };
        continue;
      }
      const storage = {
        id: object.storageId,
        localPath: object.localPath,
        enabled: object.enabled,
      };
      let read: Awaited<ReturnType<typeof readObjectForMaintenance>>;
      try {
        read = await readObjectForMaintenance(
          join(options.dataDir, 'storage'),
          storage,
          object.key,
          'application/octet-stream',
        );
      } catch (cause) {
        if ((cause as { code?: string }).code === 'STORAGE_OBJECT_MISSING')
          throw Object.assign(
            new Error(`必需对象不存在: ${object.storageId}/${object.key}`, {
              cause,
            }),
            { code: 'BACKUP_OBJECT_MISSING' },
          );
        throw cause;
      }
      await new Promise<void>((resolve, reject) => {
        read.stream.once('close', resolve);
        read.stream.once('error', reject);
        read.stream.destroy();
      });
      if (read.size !== object.size)
        throw Object.assign(
          new Error(`必需对象大小不一致: ${object.storageId}/${object.key}`),
          { code: 'BACKUP_OBJECT_INVALID' },
        );
      yield {
        name: object.name,
        path: read.path,
        size: object.size,
        storageId: object.storageId,
      };
    }
    for (const asset of requiredBackupAssets(db))
      yield await assetFile(options.dataDir, asset);
  } finally {
    db.close();
  }
}
export async function buildBackupManifest(options: {
  databasePath: string;
  dataDir: string;
  application: BuildIdentity;
  snapshotStartedAt: number;
  snapshotCompletedAt: number;
}): Promise<BackupManifest> {
  const db = new Database(options.databasePath, {
    readonly: true,
    fileMustExist: true,
  });
  try {
    const facts = backupDatabaseFacts(db);
    const rows = db
      .prepare(
        'SELECT id,name,type,enabled,local_path AS localPath FROM storage_configs ORDER BY id',
      )
      .all() as Array<{
      id: string;
      name: string;
      type: 'local' | 's3';
      enabled: number;
      localPath: string | null;
    }>;
    const storages = rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      ...(row.type === 'local' ? { localPath: row.localPath } : {}),
      enabled: Boolean(row.enabled),
      images: (
        db
          .prepare('SELECT COUNT(*) AS n FROM media_images WHERE storage_id=?')
          .get(row.id) as { n: number }
      ).n,
      objects: 0,
      bytes: 0,
    }));
    let objects = 0;
    let bytes = 0;
    for await (const file of iterateBackupFiles(options)) {
      objects++;
      bytes += file.size;
      const storage = storages.find((s) => s.id === file.storageId);
      if (storage) {
        storage.objects++;
        storage.bytes += file.size;
      }
    }
    const manifest = backupManifestSchema.parse({
      formatVersion: 1,
      application: options.application,
      databaseMigration: readDatabaseMigration(db),
      snapshotStartedAt: options.snapshotStartedAt,
      snapshotCompletedAt: options.snapshotCompletedAt,
      ...facts,
      objects,
      bytes,
      storages,
    });
    if (Buffer.byteLength(JSON.stringify(manifest)) > maxBackupManifestBytes)
      throw Object.assign(new Error('备份摘要超出格式允许大小'), {
        code: 'BACKUP_MANIFEST_TOO_LARGE',
      });
    return manifest;
  } finally {
    db.close();
  }
}
