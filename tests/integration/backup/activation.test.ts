import { assertEmptyRestoreTarget } from '../../../src/server/backup/restore-target.ts';
import { assertRestoreNotActivating } from '../../../src/server/identity/reset-password.ts';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  activateRestore,
  activationCheckpoints,
} from '../../../src/server/backup/activate.ts';
import {
  readJobState,
  writeJobState,
} from '../../../src/server/backup/jobs.ts';
import type { RestoreJob } from '../../../src/server/backup/types.ts';
import {
  createBackupDataFixture,
  fixtureApplication,
  fixtureKey,
} from './data-fixture.ts';
let root: string;
let target: string;
let task: string;
beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'ariso-real-activation-'));
  target = join(root, 'target');
  task = join(target, 'restore', 'job');
  const old = createBackupDataFixture(target, false);
  old.close();
  const original = createBackupDataFixture(join(root, 'original'));
  original.addImage('restored', 'kept restored bytes');
  mkdirSync(join(task, 'ready'), { recursive: true });
  await original.db.$client.backup(join(task, 'ready', 'ariso.db'));
  cpSync(original.paths.storage, join(task, 'ready', 'storage'), {
    recursive: true,
  });
  cpSync(original.paths.assets, join(task, 'ready', 'assets'), {
    recursive: true,
  });
  original.close();
  writeJobState(task, {
    kind: 'restore',
    id: 'job',
    status: 'ready',
    application: fixtureApplication,
    createdAt: 1,
    updatedAt: 1,
    receivedBytes: 1,
    uploadBytes: 1,
  });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
function activate(checkpoint?: (name: string) => void) {
  return activateRestore({
    dataDir: target,
    jobDirectory: task,
    application: fixtureApplication,
    encryptionKey: fixtureKey,
    checkpoint,
  });
}
it('publishes before directory initialization, moves genuine old WAL away, and never republishes after completed', () => {
  const wal = spawnSync(process.execPath, [
    resolve('tests/integration/backup/activation-worker.ts'),
    target,
    'none',
    'wal',
  ]);
  expect(wal.signal).toBe('SIGKILL');
  expect(existsSync(join(target, 'ariso.db-wal'))).toBe(true);
  const oldWal = readFileSync(join(target, 'ariso.db-wal'));
  activate();
  expect(readJobState(task)?.status).toBe('completed');
  expect(readFileSync(join(task, 'previous-empty', 'ariso.db-wal'))).toEqual(
    oldWal,
  );
  const live = new Database(join(target, 'ariso.db'));
  live.prepare("UPDATE account SET password='new-cli-password'").run();
  live.prepare("UPDATE media_images SET display_name='later edit'").run();
  live.close();
  activate();
  const after = new Database(join(target, 'ariso.db'), { readonly: true });
  try {
    expect(after.prepare('SELECT password FROM account').get()).toEqual({
      password: 'new-cli-password',
    });
    expect(
      after.prepare('SELECT display_name FROM media_images').get(),
    ).toEqual({ display_name: 'later edit' });
  } finally {
    after.close();
  }
});
it.each(activationCheckpoints)(
  'recovers a real SIGKILL at %s with the real schema',
  (checkpoint) => {
    const wal = spawnSync(process.execPath, [
      resolve('tests/integration/backup/activation-worker.ts'),
      target,
      'none',
      'wal',
    ]);
    expect(wal.signal).toBe('SIGKILL');
    const stopped = spawnSync(
      process.execPath,
      [
        resolve('tests/integration/backup/activation-worker.ts'),
        target,
        checkpoint,
      ],
      { encoding: 'utf8', timeout: 10000 },
    );
    expect(stopped.stderr).toBe('');
    expect(stopped.signal).toBe('SIGKILL');
    activate();
    const live = new Database(join(target, 'ariso.db'), { readonly: true });
    try {
      expect(live.pragma('integrity_check', { simple: true })).toBe('ok');
      expect(live.pragma('foreign_key_check')).toEqual([]);
      expect(live.prepare('SELECT id FROM media_images').get()).toEqual({
        id: 'restored',
      });
    } finally {
      live.close();
    }
    expect(readJobState(task)?.status).toBe('completed');
  },
  15000,
);
it('rejects nonempty targets, but permits generated empty paths and defaults', () => {
  const blank = createBackupDataFixture(join(root, 'blank'), false);
  try {
    expect(() =>
      assertEmptyRestoreTarget({ db: blank.db, dataDir: blank.paths.dataDir }),
    ).not.toThrow();
    writeFileSync(join(blank.paths.storage, 'do-not-overwrite'), 'keep');
    expect(() =>
      assertEmptyRestoreTarget({ db: blank.db, dataDir: blank.paths.dataDir }),
    ).toThrow(/非空|已有/);
  } finally {
    blank.close();
  }
  writeFileSync(join(target, 'assets', 'keep'), 'retain');
  expect(() => activate()).toThrow(/非空|已有/);
  expect(readFileSync(join(target, 'assets', 'keep'), 'utf8')).toBe('retain');
});
it('guards CLI only during activation, not ordinary backups or completed restores', () => {
  expect(() => assertRestoreNotActivating(target)).not.toThrow();
  const state = readJobState<RestoreJob>(task)!;
  writeJobState(task, { ...state, status: 'activating' });
  expect(() => assertRestoreNotActivating(target)).toThrow(
    /RESTORE_ACTIVATING/,
  );
  writeJobState(task, { ...state, status: 'completed' });
  expect(() => assertRestoreNotActivating(target)).not.toThrow();
});
it('accepts an otherwise blank instance after its real startup storage scan, including final activation', async () => {
  const { startStorageMaintenance } =
    await import('../../../src/server/storage/maintenance.ts');
  const { readStorageReferences } =
    await import('../../../src/server/startup/storage-references.ts');
  const { createSecretCrypto } =
    await import('../../../src/server/runtime/crypto.ts');
  const blank = createBackupDataFixture(target, false);
  const maintenance = startStorageMaintenance({
    db: blank.db,
    storageRoot: blank.paths.storage,
    secretCrypto: createSecretCrypto(fixtureKey),
    readReferences: readStorageReferences,
    clearReleasedReferences() {},
    logger: { error() {} },
  });
  try {
    await maintenance.scan(blank.storage.id);
    expect(
      blank.db.$client.prepare('SELECT COUNT(*) AS n FROM user').get(),
    ).toEqual({ n: 0 });
    expect(
      blank.db.$client.prepare('SELECT status FROM storage_scans').get(),
    ).toEqual({ status: 'passed' });
    expect(() =>
      assertEmptyRestoreTarget({ db: blank.db, dataDir: target }),
    ).not.toThrow();
  } finally {
    await maintenance.stop();
    blank.close();
  }
  activate();
  expect(readJobState(task)?.status).toBe('completed');
});
