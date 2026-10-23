import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { snapshotDatabase } from '../../../src/server/backup/snapshot.ts';
import {
  buildBackupManifest,
  iterateBackupFiles,
} from '../../../src/server/backup/manifest.ts';
import { createBackupDataFixture, fixtureApplication } from './data-fixture.ts';
let root: string;
let fixture: ReturnType<typeof createBackupDataFixture>;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ariso-backup-data-'));
  fixture = createBackupDataFixture(join(root, 'source'));
});
afterEach(() => {
  fixture.close();
  rmSync(root, { recursive: true, force: true });
});
it('snapshots a consistent real schema, preserving identity and queued/failed work while dropping transient grants and sessions only in the copy', async () => {
  fixture.addImage('saved', 'original bytes');
  fixture.addImage('queued', 'queued bytes', { jobStatus: 'queued' });
  fixture.addImage('failed', 'failed bytes', { jobStatus: 'failed' });
  const db = fixture.db.$client;
  const owner = (db.prepare('SELECT id FROM user').get() as { id: string }).id;
  db.prepare(
    'INSERT INTO session(id,expires_at,token,created_at,updated_at,user_id) VALUES(?,?,?,?,?,?)',
  ).run('session', Date.now() + 999999, 'old-session', 1, 1, owner);
  db.prepare(
    'INSERT INTO verification(id,identifier,value,expires_at) VALUES(?,?,?,?)',
  ).run('verification', 'reset-password:token', owner, Date.now() + 99999);
  db.prepare(
    'INSERT INTO apikey(id,reference_id,key,created_at,updated_at) VALUES(?,?,?,?,?)',
  ).run('key', owner, 'retain-api-key', 1, 1);
  db.prepare(
    "INSERT INTO media_previews(id,status,cleanup_status,created_at,updated_at) VALUES('preview','queued','retained',1,1)",
  ).run();
  const destination = join(root, 'snapshot.db');
  await snapshotDatabase({ db: fixture.db, destination });
  const copy = new Database(destination, { readonly: true });
  try {
    expect(copy.prepare('SELECT password FROM account').get()).toEqual({
      password: 'retained-password-hash',
    });
    expect(copy.prepare('SELECT key FROM apikey').get()).toEqual({
      key: 'retain-api-key',
    });
    expect(
      copy
        .prepare('SELECT status FROM media_jobs WHERE id=?')
        .get('queued-job'),
    ).toEqual({ status: 'queued' });
    expect(
      copy
        .prepare('SELECT status FROM media_jobs WHERE id=?')
        .get('failed-job'),
    ).toEqual({ status: 'failed' });
    for (const table of ['session', 'verification', 'media_previews'])
      expect(copy.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()).toEqual({
        n: 0,
      });
    expect(copy.pragma('foreign_key_check')).toEqual([]);
  } finally {
    copy.close();
  }
  expect(db.prepare('SELECT COUNT(*) AS n FROM session').get()).toEqual({
    n: 1,
  });
  expect(db.prepare('SELECT COUNT(*) AS n FROM media_previews').get()).toEqual({
    n: 1,
  });
});
it('enumerates disabled local and recycled media, and retains deletion semantics without requiring already deleted bytes', async () => {
  const first = fixture.addImage('saved', 'saved bytes');
  fixture.addImage('trash', 'trash bytes', { trashed: true });
  fixture.addImage('deleting', 'gone', { deleting: true });
  fixture.db.$client.prepare('UPDATE storage_configs SET enabled=0').run();
  const destination = join(root, 'snapshot.db');
  const times = await snapshotDatabase({ db: fixture.db, destination });
  const manifest = await buildBackupManifest({
    databasePath: destination,
    dataDir: fixture.paths.dataDir,
    application: fixtureApplication,
    ...times,
  });
  expect(manifest).toMatchObject({
    images: 3,
    trashedImages: 1,
    objects: 2,
    bytes: 22,
    storages: [{ enabled: false, images: 3, objects: 2 }],
  });
  const files = [];
  for await (const file of iterateBackupFiles({
    databasePath: destination,
    dataDir: fixture.paths.dataDir,
  }))
    files.push(file);
  expect(files).toHaveLength(2);
  expect(files).toContainEqual(
    expect.objectContaining({
      name: `objects/${fixture.storage.id}/${first.key}`,
      size: 11,
    }),
  );
});
it('fails the whole backup on a required missing local object', async () => {
  const image = fixture.addImage('saved', 'bytes');
  rmSync(image.path);
  const destination = join(root, 'snapshot.db');
  const times = await snapshotDatabase({ db: fixture.db, destination });
  await expect(
    buildBackupManifest({
      databasePath: destination,
      dataDir: fixture.paths.dataDir,
      application: fixtureApplication,
      ...times,
    }),
  ).rejects.toMatchObject({ code: 'BACKUP_OBJECT_MISSING' });
});
it('includes the exact watermark file retained in a queued task snapshot even when current settings use another watermark', async () => {
  fixture.addImage('queued', 'bytes', { jobStatus: 'queued' });
  const job = fixture.db.$client
    .prepare('SELECT snapshot FROM media_jobs WHERE id=?')
    .get('queued-job') as { snapshot: string };
  const snapshot = JSON.parse(job.snapshot);
  snapshot.watermarkAsset = {
    id: 'saved-watermark',
    path: 'saved-watermark/source',
    byteSize: 5,
    format: 'PNG',
    mime: 'image/png',
    width: 1,
    height: 1,
  };
  fixture.db.$client
    .prepare('UPDATE media_jobs SET snapshot=? WHERE id=?')
    .run(JSON.stringify(snapshot), 'queued-job');
  const { mkdirSync, writeFileSync } = await import('node:fs');
  mkdirSync(join(fixture.paths.watermarks, 'saved-watermark'));
  writeFileSync(
    join(fixture.paths.watermarks, 'saved-watermark/source'),
    'water',
  );
  const destination = join(root, 'snapshot.db');
  await snapshotDatabase({ db: fixture.db, destination });
  const files = [];
  for await (const file of iterateBackupFiles({
    databasePath: destination,
    dataDir: fixture.paths.dataDir,
  }))
    files.push(file);
  expect(files).toContainEqual(
    expect.objectContaining({
      name: 'assets/watermarks/saved-watermark/source',
      size: 5,
    }),
  );
});
