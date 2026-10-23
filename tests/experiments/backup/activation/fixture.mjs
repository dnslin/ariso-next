import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import Database from 'better-sqlite3';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { markReady, paths, prepareFile } from './model.mjs';

const worker = fileURLToPath(new URL('./worker.mjs', import.meta.url));

export const fixtureFiles = {
  'storage/default/ariso/local-store/original/风景.bin': Buffer.from(
    'original fixture\0\u4e2d\u6587',
  ),
  'storage/default/ariso/local-store/thumbnail/thumb.bin': Buffer.from([
    0, 3, 7, 255,
  ]),
  'assets/branding/logo.bin': Buffer.from('branding fixture'),
  'assets/watermarks/watermark.bin': Buffer.from('watermark fixture'),
};

export function runChild(action, root, stopAt, onCheckpoint) {
  return new Promise((resolve, reject) => {
    const child = fork(worker, [action, root, ...(stopAt ? [stopAt] : [])], {
      execPath: process.execPath,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    let output = '';
    let matched = false;
    const deadline = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Worker deadline: ${action}/${stopAt}\n${output}`));
    }, 15000);
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    child.on('message', (message) => {
      if (
        message.ready ||
        (stopAt !== undefined && message.checkpoint === stopAt)
      ) {
        matched = true;
        try {
          onCheckpoint?.(message);
        } catch (error) {
          child.kill('SIGKILL');
          reject(error);
        }
        child.kill('SIGKILL');
      }
    });
    child.once('error', (error) => {
      clearTimeout(deadline);
      reject(error);
    });
    child.once('exit', (code, signal) => {
      clearTimeout(deadline);
      resolve({ code, signal, matched, output });
    });
  });
}

export async function createFixture(
  root,
  { missingInitialDirectories = false } = {},
) {
  const p = paths(root);
  await mkdir(p.ready, { recursive: true });
  if (!missingInitialDirectories) {
    await mkdir(join(root, 'storage', 'default'), { recursive: true });
    await mkdir(join(root, 'assets', 'branding'), { recursive: true });
    await mkdir(join(root, 'assets', 'watermarks'), { recursive: true });
  }
  const old = await runChild('old-wal', root);
  assert.equal(old.signal, 'SIGKILL');
  assert(existsSync(p.database + '-wal'));
  assert(existsSync(p.database + '-shm'));
  const oldWal = readFileSync(p.database + '-wal');
  const oldShm = readFileSync(p.database + '-shm');
  const sourcePath = join(p.task, 'work.db');
  const source = new Database(sourcePath);
  try {
    source.pragma('foreign_keys = ON');
    source.pragma('journal_mode = WAL');
    source.exec(`
      CREATE TABLE owner (id TEXT PRIMARY KEY, password TEXT NOT NULL);
      CREATE TABLE images (id TEXT PRIMARY KEY, object_key TEXT NOT NULL, owner_id TEXT REFERENCES owner(id));
      CREATE TABLE albums (id TEXT PRIMARY KEY);
      CREATE TABLE memberships (album_id TEXT REFERENCES albums(id), image_id TEXT REFERENCES images(id));
      INSERT INTO owner VALUES ('restored-owner', 'backup-password-hash');
      INSERT INTO images VALUES ('image-1', 'original/风景.bin', 'restored-owner');
      INSERT INTO albums VALUES ('album-1');
      INSERT INTO memberships VALUES ('album-1', 'image-1');
    `);
    await source.backup(join(p.ready, 'ariso.db'));
  } finally {
    source.close();
  }
  await rm(sourcePath, { force: true });
  for (const [name, bytes] of Object.entries(fixtureFiles))
    await prepareFile(root, join(p.ready, name), bytes);
  await markReady(root);
  return { oldWal, oldShm };
}

export function readTrace(root) {
  return readFileSync(paths(root).trace, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
}

export function checkLive(root, fixture, expectedImageCount = 1) {
  const p = paths(root);
  for (const [name, expected] of Object.entries(fixtureFiles))
    assert.deepEqual(readFileSync(join(root, name)), expected, name);
  assert(
    !existsSync(p.database + '-wal'),
    'No stale live WAL before test read',
  );
  assert(
    !existsSync(p.database + '-shm'),
    'No stale live SHM before test read',
  );
  assert.deepEqual(
    readFileSync(join(p.previous, 'ariso.db-wal')),
    fixture.oldWal,
  );
  // SHM holds volatile read-lock/index metadata and is changed even by a
  // readonly connection. Its presence/size and the WAL-backed old data matter.
  assert.equal(
    readFileSync(join(p.previous, 'ariso.db-shm')).length,
    fixture.oldShm.length,
  );
  const old = new Database(join(p.previous, 'ariso.db'), {
    readonly: true,
    fileMustExist: true,
  });
  try {
    assert.deepEqual(
      old.prepare('SELECT value FROM old_marker ORDER BY rowid').all(),
      [{ value: 'old-base' }, { value: 'old-wal-only' }],
    );
  } finally {
    old.close();
  }
  const db = new Database(p.database, { fileMustExist: true });
  try {
    assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
    assert.deepEqual(db.pragma('foreign_key_check'), []);
    assert.equal(
      db.prepare('SELECT COUNT(*) AS n FROM images').get().n,
      expectedImageCount,
    );
    assert.equal(
      db.prepare('SELECT COUNT(*) AS n FROM memberships').get().n,
      1,
    );
    assert.equal(db.prepare('SELECT id FROM owner').get().id, 'restored-owner');
    assert.equal(
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM sqlite_master WHERE name='old_marker'",
        )
        .get().n,
      0,
    );
  } finally {
    db.close();
  }
  assert.equal(
    JSON.parse(readFileSync(p.background, 'utf8')).phase,
    'completed',
  );
}
