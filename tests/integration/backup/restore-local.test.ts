import {
  createReadStream,
  existsSync,
  mkdtempSync,
  mkdirSync,
  statSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createEncryptedArchive } from '../../../src/server/backup/archive.ts';
import { decryptArchiveFile } from '../../../src/server/backup/decrypt.ts';
import { snapshotDatabase } from '../../../src/server/backup/snapshot.ts';
import {
  buildBackupManifest,
  iterateBackupFiles,
} from '../../../src/server/backup/manifest.ts';
import {
  inspectBackup,
  prepareRestore,
} from '../../../src/server/backup/restore.ts';
import { createSecretCrypto } from '../../../src/server/runtime/crypto.ts';
import {
  createBackupDataFixture,
  fixtureApplication,
  fixtureKey,
} from './data-fixture.ts';
let root: string;
let fixture: ReturnType<typeof createBackupDataFixture>;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ariso-backup-restore-'));
  fixture = createBackupDataFixture(join(root, 'source'));
});
afterEach(() => {
  if (fixture.db.$client.open) fixture.close();
  rmSync(root, { recursive: true, force: true });
});
async function archive(omitObject = false) {
  const destination = join(root, 'snapshot.db');
  const times = await snapshotDatabase({ db: fixture.db, destination });
  const manifest = await buildBackupManifest({
    databasePath: destination,
    dataDir: fixture.paths.dataDir,
    application: fixtureApplication,
    ...times,
  });
  async function* entries() {
    yield {
      name: 'manifest.json',
      source: Buffer.from(JSON.stringify(manifest)),
    };
    yield {
      name: 'secrets.json',
      source: Buffer.from(
        JSON.stringify({ originalEncryptionKey: fixtureKey.toString('hex') }),
      ),
    };
    yield { name: 'database/ariso.db', source: createReadStream(destination) };
    for await (const file of iterateBackupFiles({
      databasePath: destination,
      dataDir: fixture.paths.dataDir,
    }))
      if (!omitObject && 'path' in file)
        yield {
          name: file.name,
          source: createReadStream(file.path),
          size: file.size,
        };
  }
  const encrypted = join(root, 'backup.zip.age');
  await createEncryptedArchive({
    destination: encrypted,
    password: 'fixture password',
    entries: entries(),
  });
  const source = join(root, 'content.zip');
  await decryptArchiveFile({
    source: encrypted,
    destination: source,
    password: 'fixture password',
  });
  return { source, manifest };
}
it('restores only from the archive, preserves file bytes and relationships, and reencrypts credentials for the new instance', async () => {
  const original = fixture.addImage('original', 'image exact bytes');
  fixture.addImage('trash', 'trashed bytes', { trashed: true });
  fixture.db.$client
    .prepare(
      "INSERT INTO albums(id,name,description,created_at,updated_at) VALUES('album','Album','Description',1,1)",
    )
    .run();
  fixture.db.$client
    .prepare(
      "INSERT INTO album_images(album_id,image_id,joined_at) VALUES('album','original',1)",
    )
    .run();
  fixture.db.$client
    .prepare(
      "INSERT INTO album_shares(id,album_id,token,enabled,layout,show_name,auth_revision,created_at,updated_at) VALUES('share','album','retained-share-token',1,'grid',1,1,1,1)",
    )
    .run();
  fixture.db.$client
    .prepare(
      "INSERT INTO storage_configs(id,name,type,enabled,local_path,created_at,updated_at) VALUES('zz-empty','Disabled empty','local',0,'empty-dir',1,1)",
    )
    .run();
  mkdirSync(join(fixture.paths.storage, 'empty-dir'));
  const { source, manifest } = await archive();
  fixture.close();
  rmSync(fixture.paths.dataDir, { recursive: true });
  const jobDirectory = join(root, 'new', 'restore', 'job');
  const nextKey = Buffer.alloc(32, 29);
  const inspected = await inspectBackup({
    source,
    workDirectory: join(jobDirectory, 'inspect'),
    application: fixtureApplication,
  });
  expect(inspected.summary).toMatchObject({
    images: 2,
    trashedImages: 1,
    albums: 1,
    ownerEmail: 'owner@example.test',
  });
  const summary = await prepareRestore({
    source,
    jobDirectory,
    application: fixtureApplication,
    encryptionKey: new Uint8Array(nextKey),
    publicUrl: 'https://new.example.test',
  });
  expect(summary.images).toBe(2);
  const db = new Database(join(jobDirectory, 'ready', 'ariso.db'), {
    readonly: true,
  });
  try {
    expect(db.prepare('SELECT password FROM account').get()).toEqual({
      password: 'retained-password-hash',
    });
    expect(db.prepare('SELECT token FROM album_shares').get()).toEqual({
      token: 'retained-share-token',
    });
    expect(db.prepare('SELECT * FROM album_images').all()).toEqual([
      { album_id: 'album', image_id: 'original', joined_at: 1 },
    ]);
    expect(db.prepare('SELECT public_url FROM site_settings').get()).toEqual({
      public_url: 'https://new.example.test',
    });
    const secret = db
      .prepare(
        'SELECT client_secret_encrypted AS secret FROM identity_github_settings',
      )
      .get() as { secret: string };
    expect(
      createSecretCrypto(nextKey).decryptSecret(
        secret.secret,
        'restored github',
      ),
    ).toBe('github secret');
    expect(() =>
      createSecretCrypto(fixtureKey).decryptSecret(secret.secret, 'old key'),
    ).toThrow();
    expect(db.pragma('foreign_key_check')).toEqual([]);
  } finally {
    db.close();
  }
  expect(
    readFileSync(
      join(
        jobDirectory,
        'ready',
        'storage',
        manifest.storages.find((storage) => storage.type === 'local')!
          .localPath,
        'ariso',
        fixture.storage.id,
        original.key,
      ),
      'utf8',
    ),
  ).toBe('image exact bytes');
  expect(existsSync(join(jobDirectory, 'ready', 'ariso.db-wal'))).toBe(false);
  expect(
    statSync(join(jobDirectory, 'ready', 'storage', 'empty-dir')).isDirectory(),
  ).toBe(true);
}, 15000);
it('rejects incompatible releases and incomplete required files before preparing an enabled site', async () => {
  fixture.addImage('required', 'bytes');
  const { source } = await archive(true);
  const workDirectory = join(root, 'inspection');
  await expect(
    inspectBackup({
      source,
      workDirectory,
      application: { ...fixtureApplication, version: 'v9.0.0' },
    }),
  ).rejects.toMatchObject({ code: 'BACKUP_VERSION_MISMATCH' });
  await expect(
    inspectBackup({
      source,
      workDirectory,
      application: fixtureApplication,
    }),
  ).rejects.toMatchObject({ code: 'BACKUP_OBJECT_MISSING' });
  expect(existsSync(join(workDirectory, 'ready'))).toBe(false);
}, 15000);
