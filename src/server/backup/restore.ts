import Database from 'better-sqlite3';
import { mkdir, open, readdir, rm, statfs } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import type { BuildIdentity } from '../runtime/build-info.ts';
import {
  extractArchiveEntries,
  inspectArchive,
  readArchiveEntry,
  type ArchiveExtraction,
} from './read.ts';
import {
  maxBackupManifestBytes,
  backupDatabaseFacts,
  backupManifestSchema,
  backupSummary,
  readDatabaseMigration,
  requiredBackupAssets,
  requiredBackupObjects,
  type BackupManifest,
} from './manifest.ts';
import { normalizeSnapshot, checkBackupDatabase } from './normalize.ts';
import {
  backupSecretsSchema,
  convertRestoredConfiguration,
} from './restore-config.ts';
import { BackupError } from './errors.ts';
import type { BackupProgress } from './types.ts';
import type { RestoreRemote } from './restore-remote.ts';

function assertApplication(
  manifest: BackupManifest,
  application: BuildIdentity,
) {
  if (
    manifest.application.version !== application.version ||
    manifest.application.revision !== application.revision
  )
    throw new BackupError(
      'BACKUP_VERSION_MISMATCH',
      409,
      `备份来自 ${manifest.application.version}，请使用相同版本和构建恢复`,
    );
}
function currentMigration() {
  const migrations = readMigrationFiles({
    migrationsFolder: resolve('drizzle'),
  });
  return Math.max(...migrations.map((migration) => migration.folderMillis));
}
function fileMapping(
  db: Database.Database,
  ready: string,
  remote?: RestoreRemote,
  signal?: AbortSignal,
) {
  const result: ArchiveExtraction[] = [];
  for (const object of requiredBackupObjects(db)) {
    if (object.type === 's3') {
      result.push({
        name: object.name,
        size: object.size,
        write: async (stream) => {
          if (!remote)
            throw new BackupError(
              'RESTORE_TARGET_REQUIRED',
              409,
              `请先配置 S3 存储: ${object.storageId}`,
            );
          await remote.writeObject(
            { storageId: object.storageId, key: object.key, size: object.size },
            stream,
            signal,
          );
        },
      });
      continue;
    }
    result.push({
      name: object.name,
      size: object.size,
      destination: join(
        ready,
        'storage',
        object.localPath,
        'ariso',
        object.storageId,
        object.key,
      ),
    });
  }
  for (const asset of requiredBackupAssets(db))
    result.push({
      name: asset.name,
      ...(asset.size === null ? {} : { size: asset.size }),
      destination: join(ready, 'assets', asset.relativePath),
    });
  return result;
}

/** Caller has completed age authentication before this function sees the ZIP. */
export async function inspectBackup(options: {
  source: string;
  workDirectory: string;
  application: BuildIdentity;
  signal?: AbortSignal;
}) {
  const { source, signal } = options;
  signal?.throwIfAborted();
  const manifest = backupManifestSchema.parse(
    JSON.parse(
      (
        await readArchiveEntry(source, 'manifest.json', {
          maxBytes: maxBackupManifestBytes,
          signal,
        })
      ).toString('utf8'),
    ),
  );
  assertApplication(manifest, options.application);
  backupSecretsSchema.parse(
    JSON.parse(
      (
        await readArchiveEntry(source, 'secrets.json', {
          maxBytes: 1024,
          signal,
        })
      ).toString('utf8'),
    ),
  );
  const archive = await inspectArchive(source, { signal });
  const sizes = new Map(
    archive.entries.map((entry) => [entry.name, entry.size]),
  );
  if (!sizes.has('database/ariso.db'))
    throw new BackupError('BACKUP_DATABASE_INVALID', 400, '备份缺少数据库');
  await mkdir(options.workDirectory, { recursive: true, mode: 0o700 });
  const databasePath = join(options.workDirectory, 'ariso.db');
  for (const suffix of ['', '.part', '-wal', '-shm'])
    await rm(`${databasePath}${suffix}`, { force: true });
  await extractArchiveEntries({
    source,
    entries: [{ name: 'database/ariso.db', destination: databasePath }],
    signal,
  });
  const db = new Database(databasePath, {
    readonly: true,
    fileMustExist: true,
  });
  try {
    const facts = backupDatabaseFacts(db);
    const migration = readDatabaseMigration(db);
    if (
      migration !== manifest.databaseMigration ||
      migration !== currentMigration()
    )
      throw new BackupError(
        'BACKUP_VERSION_MISMATCH',
        409,
        '备份数据库版本与当前应用不一致',
      );
    for (const field of [
      'siteName',
      'publicUrl',
      'ownerEmail',
      'images',
      'trashedImages',
      'albums',
      'tags',
    ] as const)
      if (facts[field] !== manifest[field])
        throw new BackupError(
          'BACKUP_MANIFEST_MISMATCH',
          400,
          '备份摘要与数据库不一致',
        );
    const mappings = fileMapping(
      db,
      join(options.workDirectory, 'unused-ready'),
    );
    let bytes = 0;
    let localBytes = 0;
    const required = new Set([
      'manifest.json',
      'secrets.json',
      'database/ariso.db',
    ]);
    for (const mapping of mappings) {
      const size = sizes.get(mapping.name);
      if (size === undefined)
        throw new BackupError(
          'BACKUP_OBJECT_MISSING',
          400,
          `备份缺少必需文件: ${mapping.name}`,
        );
      if (mapping.size !== undefined && mapping.size !== size)
        throw new BackupError(
          'BACKUP_OBJECT_INVALID',
          400,
          `备份文件大小与数据库不一致: ${mapping.name}`,
        );
      required.add(mapping.name);
      bytes += size;
      if ('destination' in mapping) localBytes += size;
    }
    if (
      required.size !== sizes.size ||
      manifest.objects !== mappings.length ||
      manifest.bytes !== bytes
    )
      throw new BackupError(
        'BACKUP_MANIFEST_MISMATCH',
        400,
        '备份文件清单与数据库不一致',
      );
    const storages = db
      .prepare(
        'SELECT id,name,type,enabled,local_path AS localPath FROM storage_configs ORDER BY id',
      )
      .all() as Array<{
      id: string;
      name: string;
      type: string;
      enabled: number;
      localPath: string;
    }>;
    if (storages.length !== manifest.storages.length)
      throw new BackupError(
        'BACKUP_MANIFEST_MISMATCH',
        400,
        '备份存储清单与数据库不一致',
      );
    for (const storage of storages) {
      const saved = manifest.storages.find((item) => item.id === storage.id);
      if (
        !saved ||
        saved.name !== storage.name ||
        saved.type !== storage.type ||
        saved.enabled !== Boolean(storage.enabled) ||
        (saved.type === 'local' && saved.localPath !== storage.localPath) ||
        saved.images !==
          (
            db
              .prepare(
                'SELECT COUNT(*) AS n FROM media_images WHERE storage_id=?',
              )
              .get(storage.id) as { n: number }
          ).n ||
        saved.objects !==
          mappings.filter((item) =>
            item.name.startsWith(`objects/${storage.id}/`),
          ).length ||
        saved.bytes !==
          mappings
            .filter((item) => item.name.startsWith(`objects/${storage.id}/`))
            .reduce((sum, item) => sum + sizes.get(item.name)!, 0)
      )
        throw new BackupError(
          'BACKUP_MANIFEST_MISMATCH',
          400,
          '备份存储配置与数据库不一致',
        );
    }
    return {
      manifest,
      summary: backupSummary(manifest),
      databasePath,
      localBytes,
      databaseBytes: sizes.get('database/ariso.db')!,
    };
  } finally {
    db.close();
  }
}

async function syncFile(path: string) {
  const handle = await open(path, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}
async function syncDirectories(path: string) {
  for (const entry of await readdir(path, { withFileTypes: true }))
    if (entry.isDirectory()) await syncDirectories(join(path, entry.name));
  await syncFile(path);
}
export async function prepareRestore(options: {
  source: string;
  jobDirectory: string;
  application: BuildIdentity;
  encryptionKey: Uint8Array;
  publicUrl: string;
  signal?: AbortSignal;
  onProgress?: (progress: BackupProgress) => void;
  remote?: RestoreRemote;
}) {
  const { signal } = options;
  signal?.throwIfAborted();
  const ready = join(options.jobDirectory, 'ready');
  // A retry replaces this task's partial output; reclaim it before checking free space.
  await rm(ready, { recursive: true, force: true });
  const inspected = await inspectBackup({
    source: options.source,
    workDirectory: join(options.jobDirectory, 'work'),
    application: options.application,
    signal,
  });
  const disk = await statfs(options.jobDirectory);
  const additionalBytes =
    inspected.localBytes + inspected.databaseBytes + 16 * 1024 * 1024;
  if (disk.bavail * disk.bsize < additionalBytes)
    throw new BackupError(
      'BACKUP_NO_SPACE',
      507,
      '可用磁盘空间不足，请释放空间后重试',
    );
  const secrets = backupSecretsSchema.parse(
    JSON.parse(
      (
        await readArchiveEntry(options.source, 'secrets.json', {
          maxBytes: 1024,
          signal,
        })
      ).toString('utf8'),
    ),
  );
  for (const directory of ['storage', 'assets/branding', 'assets/watermarks'])
    await mkdir(join(ready, directory), { recursive: true, mode: 0o700 });
  for (const storage of inspected.manifest.storages.filter(
    (item) => item.type === 'local',
  ))
    await mkdir(join(ready, 'storage', storage.localPath), {
      recursive: true,
      mode: 0o700,
    });
  const db = new Database(inspected.databasePath, { fileMustExist: true });
  try {
    db.pragma('foreign_keys=ON');
    db.pragma('journal_mode=DELETE');
    normalizeSnapshot(db);
    const targets = options.remote?.configurations() ?? [];
    if (
      inspected.manifest.storages.some((item) => item.type === 's3') &&
      !options.remote
    )
      throw new BackupError(
        'RESTORE_TARGET_REQUIRED',
        409,
        '请先配置全部 S3 恢复目标',
      );
    await options.remote?.beginRestore(
      (function* () {
        for (const object of requiredBackupObjects(db))
          if (object.type === 's3')
            yield {
              storageId: object.storageId,
              key: object.key,
              size: object.size,
            };
      })(),
      signal,
    );
    convertRestoredConfiguration({
      db,
      originalEncryptionKey: secrets.originalEncryptionKey,
      encryptionKey: options.encryptionKey,
      publicUrl: options.publicUrl,
      targets,
    });
    await extractArchiveEntries({
      source: options.source,
      entries: fileMapping(db, ready, options.remote, signal),
      signal,
      onProgress: (progress) =>
        options.onProgress?.({
          objectsDone: progress.entries,
          objectsTotal: inspected.manifest.objects,
          bytesDone: progress.bytes,
          bytesTotal: inspected.manifest.bytes,
        }),
    });
    signal?.throwIfAborted();
    checkBackupDatabase(db);
    await db.backup(join(ready, 'ariso.db'));
  } finally {
    db.close();
  }
  await syncFile(join(ready, 'ariso.db'));
  await syncDirectories(ready);
  await syncFile(options.jobDirectory);
  await options.remote?.finishRestore(signal);
  signal?.throwIfAborted();
  return inspected.summary;
}
