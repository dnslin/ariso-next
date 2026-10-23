import { assertEmptyRestoreTarget, hasFiles } from './restore-target.ts';
import Database from 'better-sqlite3';
import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  renameSync,
} from 'node:fs';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { RuntimeConfig } from '../runtime/env.ts';
import {
  readBuildIdentity,
  type BuildIdentity,
} from '../runtime/build-info.ts';
import { backupDatabaseFacts, readDatabaseMigration } from './manifest.ts';
import { verifyRestoredConfiguration } from './restore-config.ts';
import { readJobState, writeJobState, listRestoreJobs } from './jobs.ts';
import type { RestoreJob } from './types.ts';
import { BackupError } from './errors.ts';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { resolve } from 'node:path';

export const activationCheckpoints = [
  'activating.temporary-written',
  'activating.file-synced',
  'activating.renamed',
  'activating.directory-synced',
  'storage.old-moved',
  'storage.old-directory-synced',
  'storage.published',
  'storage.directory-synced',
  'assets.old-moved',
  'assets.old-directory-synced',
  'assets.published',
  'assets.directory-synced',
  'old-db.ariso.db.moved',
  'old-db.ariso.db-wal.moved',
  'old-db.ariso.db-shm.moved',
  'old-db.directories-synced',
  'database.temporary-written',
  'database.temporary-synced',
  'database.published',
  'database.directory-synced',
  'completed.temporary-written',
  'completed.file-synced',
  'completed.renamed',
  'completed.directory-synced',
] as const;
function sync(path: string) {
  const fd = openSync(path, 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
function validateReady(jobDirectory: string, encryptionKey: Uint8Array) {
  const db = new Database(join(jobDirectory, 'ready', 'ariso.db'), {
    readonly: true,
    fileMustExist: true,
  });
  try {
    backupDatabaseFacts(db);
    const migrations = readMigrationFiles({
      migrationsFolder: resolve('drizzle'),
    });
    if (
      readDatabaseMigration(db) !==
      Math.max(...migrations.map((m) => m.folderMillis))
    )
      throw new BackupError(
        'BACKUP_VERSION_MISMATCH',
        409,
        '准备数据库与当前应用版本不一致',
      );
    verifyRestoredConfiguration(db, encryptionKey);
  } finally {
    db.close();
  }
}
function requireBlank(dataDir: string) {
  const path = join(dataDir, 'ariso.db');
  if (!existsSync(path)) {
    for (const name of ['storage', 'assets'])
      if (hasFiles(join(dataDir, name)))
        throw new BackupError(
          'RESTORE_TARGET_NOT_EMPTY',
          409,
          `新实例目录非空: ${join(dataDir, name)}`,
        );
    return;
  }
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    assertEmptyRestoreTarget({ db: drizzle(db), dataDir });
  } finally {
    db.close();
  }
}
function publishDirectory(
  dataDir: string,
  jobDirectory: string,
  name: string,
  checkpoint: (name: string) => void,
) {
  const ready = join(jobDirectory, 'ready');
  const previous = join(jobDirectory, 'previous-empty');
  const source = join(ready, name);
  const target = join(dataDir, name);
  const old = join(previous, name);
  if (!existsSync(source)) {
    if (!existsSync(target)) throw new Error(`恢复目录缺失: ${target}`);
    sync(ready);
    sync(dataDir);
    sync(previous);
    return;
  }
  if (existsSync(target)) {
    if (existsSync(old))
      throw new Error(`恢复目录存在冲突，保留现场: ${target}`);
    renameSync(target, old);
    checkpoint(`${name}.old-moved`);
  }
  // Replay also synchronizes a previous old-directory move interrupted before fsync.
  sync(dataDir);
  sync(previous);
  checkpoint(`${name}.old-directory-synced`);
  renameSync(source, target);
  checkpoint(`${name}.published`);
  sync(ready);
  sync(dataDir);
  checkpoint(`${name}.directory-synced`);
}
export function activateRestore(options: {
  dataDir: string;
  jobDirectory: string;
  application: BuildIdentity;
  encryptionKey: Uint8Array;
  checkpoint?: (name: string) => void;
}) {
  const { dataDir, jobDirectory } = options;
  const checkpoint = options.checkpoint ?? (() => {});
  let state = readJobState<RestoreJob>(jobDirectory);
  if (!state || state.kind !== 'restore')
    throw new Error(`恢复任务不存在: ${jobDirectory}`);
  if (state.status === 'completed') {
    sync(join(jobDirectory, 'state.json'));
    sync(jobDirectory);
    return state;
  }
  if (state.status !== 'ready' && state.status !== 'activating')
    throw new Error(`恢复尚未准备就绪: ${state.status}`);
  if (
    state.application?.version !== options.application.version ||
    state.application.revision !== options.application.revision
  )
    throw new BackupError(
      'BACKUP_VERSION_MISMATCH',
      409,
      '恢复准备后应用版本发生变化，请使用原版本完成启用',
    );
  mkdirSync(dataDir, { recursive: true });
  validateReady(jobDirectory, options.encryptionKey);
  if (state.status === 'ready') {
    requireBlank(dataDir);
    state = { ...state, status: 'activating', updatedAt: Date.now() };
    writeJobState(jobDirectory, state, (stage) =>
      checkpoint(`activating.${stage}`),
    );
  }
  const previous = join(jobDirectory, 'previous-empty');
  mkdirSync(previous, { recursive: true, mode: 0o700 });
  sync(jobDirectory);
  publishDirectory(dataDir, jobDirectory, 'storage', checkpoint);
  publishDirectory(dataDir, jobDirectory, 'assets', checkpoint);
  for (const name of ['ariso.db', 'ariso.db-wal', 'ariso.db-shm']) {
    const source = join(dataDir, name),
      destination = join(previous, name);
    if (!existsSync(destination) && existsSync(source)) {
      renameSync(source, destination);
      checkpoint(`old-db.${name}.moved`);
    }
  }
  sync(dataDir);
  sync(previous);
  checkpoint('old-db.directories-synced');
  if (
    existsSync(join(dataDir, 'ariso.db-wal')) ||
    existsSync(join(dataDir, 'ariso.db-shm'))
  )
    throw new Error('旧数据库 WAL/SHM 尚未移出，恢复不能继续');
  const temporary = join(dataDir, 'ariso.db.activation.part');
  copyFileSync(join(jobDirectory, 'ready', 'ariso.db'), temporary);
  checkpoint('database.temporary-written');
  sync(temporary);
  checkpoint('database.temporary-synced');
  renameSync(temporary, join(dataDir, 'ariso.db'));
  checkpoint('database.published');
  sync(dataDir);
  checkpoint('database.directory-synced');
  state = { ...state, status: 'completed', updatedAt: Date.now() };
  writeJobState(jobDirectory, state, (stage) =>
    checkpoint(`completed.${stage}`),
  );
  return state;
}
/** Runs before ordinary directory initialization, migrations, or opening the live database. */
export function activatePendingRestore(config: RuntimeConfig) {
  const jobs = listRestoreJobs(config.dataDir);
  const active = jobs.filter(
    (job) => job.status === 'ready' || job.status === 'activating',
  );
  if (active.length > 1) throw new Error('存在多个待启用恢复任务，无法选择');
  if (!active.length) {
    for (const job of jobs.filter((job) => job.status === 'completed')) {
      const directory = join(config.dataDir, 'restore', job.id);
      sync(join(directory, 'state.json'));
      sync(directory);
    }
    return;
  }
  const application = readBuildIdentity();
  if (!application)
    throw new BackupError(
      'BACKUP_BUILD_UNAVAILABLE',
      409,
      '当前构建没有版本信息，不能启用恢复数据',
    );
  activateRestore({
    dataDir: config.dataDir,
    jobDirectory: join(config.dataDir, 'restore', active[0].id),
    application,
    encryptionKey: config.encryptionKey,
  });
}
