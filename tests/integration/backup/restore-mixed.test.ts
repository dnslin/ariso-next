import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { prepareRestore } from '../../../src/server/backup/restore.ts';
import { createRestoreRemote } from '../../../src/server/backup/restore-remote.ts';
import { snapshotDatabase } from '../../../src/server/backup/snapshot.ts';
import {
  buildBackupManifest,
  iterateBackupFiles,
} from '../../../src/server/backup/manifest.ts';
import {
  createBackupDataFixture,
  fixtureApplication,
  fixtureKey,
} from './data-fixture.ts';
import { writeZipFixture } from './archive-fixture.ts';
import { remoteEndpoint } from './restore-remote-fixture.ts';
let root: string;
let endpoint: Awaited<ReturnType<typeof remoteEndpoint>>;
let remote: ReturnType<typeof createRestoreRemote>;
let sourceZip: string;
let localPath: string;
let localStorageId: string;
const newKey = Buffer.alloc(32, 31);
const texts = {
  local: 'local exact bytes',
  first: 'first S3 bytes',
  second: 'disabled S3 bytes',
};
let originalKeys: Record<string, string>;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ariso-restore-mixed-'));
  endpoint = await remoteEndpoint();
  const source = createBackupDataFixture(join(root, 'source'));
  localPath = source.storage.localPath;
  localStorageId = source.storage.id;
  originalKeys = {};
  try {
    for (const [id, enabled] of [
      ['remote-one', 1],
      ['remote-two', 0],
    ] as const)
      source.db.$client
        .prepare(
          "INSERT INTO storage_configs(id,name,type,enabled,endpoint,region,bucket,path_prefix,force_path_style,access_key_encrypted,secret_key_encrypted,config_revision,created_at,updated_at) VALUES(?,?,'s3',?,'http://original-unavailable.invalid','test','source','old',1,'obsolete-source-key','obsolete-source-key',7,1,1)",
        )
        .run(id, id, enabled);
    for (const [id, text] of Object.entries(texts)) {
      const image = source.addImage(id, text);
      originalKeys[id] = image.key;
      if (id !== 'local') {
        const storageId = id === 'first' ? 'remote-one' : 'remote-two';
        source.db.$client.transaction(() => {
          source.db.$client.pragma('defer_foreign_keys=ON');
          source.db.$client
            .prepare('UPDATE media_images SET storage_id=? WHERE id=?')
            .run(storageId, id);
          source.db.$client
            .prepare('UPDATE media_objects SET storage_id=? WHERE image_id=?')
            .run(storageId, id);
        })();
        expect(source.db.$client.pragma('foreign_key_check')).toEqual([]);
      }
    }
    source.db.$client
      .prepare("UPDATE storage_settings SET default_storage_id='remote-one'")
      .run();
    const snapshot = join(root, 'snapshot.db');
    const times = await snapshotDatabase({
      db: source.db,
      destination: snapshot,
    });
    const manifest = await buildBackupManifest({
      databasePath: snapshot,
      dataDir: source.paths.dataDir,
      application: fixtureApplication,
      ...times,
    });
    const files: Array<{ name: string; value: Buffer }> = [];
    for await (const file of iterateBackupFiles({
      databasePath: snapshot,
      dataDir: source.paths.dataDir,
    })) {
      if ('path' in file)
        files.push({ name: file.name, value: await readFile(file.path) });
      else
        files.push({
          name: file.name,
          value: Buffer.from(
            file.storageId === 'remote-one' ? texts.first : texts.second,
          ),
        });
    }
    sourceZip = join(root, 'content.zip');
    await writeZipFixture(sourceZip, [
      { name: 'manifest.json', value: Buffer.from(JSON.stringify(manifest)) },
      {
        name: 'secrets.json',
        value: Buffer.from(
          JSON.stringify({ originalEncryptionKey: fixtureKey.toString('hex') }),
        ),
      },
      { name: 'database/ariso.db', value: await readFile(snapshot) },
      ...files,
    ]);
  } finally {
    source.close();
  }
  await rm(join(root, 'source'), { recursive: true });
  await mkdir(join(root, 'job'));
  remote = createRestoreRemote({
    jobDirectory: join(root, 'job'),
    jobId: 'mixed-fixture',
    encryptionKey: newKey,
    sources: ['remote-one', 'remote-two'].map((storageId) => ({
      storageId,
      name: storageId,
      endpoint: 'http://original-unavailable.invalid',
      region: 'test',
      bucket: 'source',
      pathPrefix: 'old',
      forcePathStyle: true,
      configRevision: 7,
    })),
  });
  for (const storageId of ['remote-one', 'remote-two']) {
    const value = remote.saveTarget(storageId, {
      endpoint: endpoint.endpoint,
      region: 'test',
      bucket: 'target',
      pathPrefix: `new/${storageId}`,
      forcePathStyle: true,
      accessKey: 'new-access',
      secretKey: 'new-secret',
    });
    expect(
      (await remote.testTarget(storageId, { revision: value.revision }))
        .testStatus,
    ).toBe('passed');
  }
  endpoint.objects.set(
    'new/remote-one/ariso/neighbor/keep',
    Buffer.from('neighbor'),
  );
});
afterEach(async () => {
  await endpoint?.close();
  await rm(root, { recursive: true, force: true });
});
function restore(signal?: AbortSignal) {
  return prepareRestore({
    source: sourceZip,
    jobDirectory: join(root, 'job'),
    application: fixtureApplication,
    encryptionKey: newKey,
    publicUrl: 'https://new.example.test',
    remote,
    signal,
  });
}
it('restores local and two S3 storage divisions solely from the archive without staging S3 bytes locally', async () => {
  const summary = await restore();
  expect(summary.images).toBe(3);
  expect(
    await readFile(
      join(
        root,
        'job/ready/storage',
        localPath,
        'ariso',
        localStorageId,
        originalKeys.local,
      ),
      'utf8',
    ),
  ).toBe(texts.local);
  for (const [imageId, storageId] of [
    ['first', 'remote-one'],
    ['second', 'remote-two'],
  ]) {
    expect(
      endpoint.objects
        .get(`new/${storageId}/ariso/${storageId}/${originalKeys[imageId]}`)
        ?.toString(),
    ).toBe(texts[imageId as keyof typeof texts]);
    expect(existsSync(join(root, 'job/ready/storage', storageId))).toBe(false);
  }
  const db = new Database(join(root, 'job/ready/ariso.db'), { readonly: true });
  try {
    expect(
      db.prepare('SELECT id,storage_id FROM media_images ORDER BY id').all(),
    ).toEqual([
      { id: 'first', storage_id: 'remote-one' },
      { id: 'local', storage_id: localStorageId },
      { id: 'second', storage_id: 'remote-two' },
    ]);
    expect(
      db
        .prepare(
          "SELECT id,enabled,path_prefix FROM storage_configs WHERE type='s3' ORDER BY id",
        )
        .all(),
    ).toEqual([
      { id: 'remote-one', enabled: 1, path_prefix: 'new/remote-one' },
      { id: 'remote-two', enabled: 0, path_prefix: 'new/remote-two' },
    ]);
    expect(
      db.prepare('SELECT default_storage_id FROM storage_settings').get(),
    ).toEqual({ default_storage_id: 'remote-one' });
  } finally {
    db.close();
  }
  expect(
    [...endpoint.objects.keys()].some((key) =>
      key.endsWith('restore/owner.json'),
    ),
  ).toBe(false);
  expect(
    endpoint.objects.get('new/remote-one/ariso/neighbor/keep')?.toString(),
  ).toBe('neighbor');
  await remote.cleanup();
  expect([...endpoint.objects.keys()]).toEqual([
    'new/remote-one/ariso/neighbor/keep',
  ]);
});
it('does not publish a ready database after a rejected write and retries the same task without duplicating records', async () => {
  endpoint.control.failWrite = originalKeys.second;
  endpoint.control.writeFailureStatus = 403;
  await expect(restore()).rejects.toBeInstanceOf(Error);
  expect(existsSync(join(root, 'job/ready/ariso.db'))).toBe(false);
  endpoint.control.failWrite = '';
  await restore();
  const db = new Database(join(root, 'job/ready/ariso.db'), { readonly: true });
  try {
    expect(db.prepare('SELECT count(*) AS n FROM media_images').get()).toEqual({
      n: 3,
    });
  } finally {
    db.close();
  }
  expect(
    endpoint.objects
      .get(`new/remote-two/ariso/remote-two/${originalKeys.second}`)
      ?.toString(),
  ).toBe(texts.second);
});
it('keeps a fully supplied but unconfirmed server-error write pending and does not publish ready on retry', async () => {
  endpoint.control.failWrite = originalKeys.second;
  await expect(restore()).rejects.toMatchObject({ httpStatusCode: 500 });
  expect(existsSync(join(root, 'job/ready/ariso.db'))).toBe(false);
  endpoint.control.failWrite = '';
  await expect(restore()).rejects.toMatchObject({
    code: 'RESTORE_REMOTE_WRITE_UNCERTAIN',
  });
  await expect(remote.cleanup()).rejects.toMatchObject({
    code: 'RESTORE_REMOTE_WRITE_UNCERTAIN',
  });
  expect(
    remote.list().find((item) => item.storageId === 'remote-two'),
  ).toMatchObject({
    cleanupPending: true,
  });
  expect(existsSync(join(root, 'job/ready/ariso.db'))).toBe(false);
  expect(
    endpoint.objects.get('new/remote-one/ariso/neighbor/keep')?.toString(),
  ).toBe('neighbor');
});
it('stops a real pending remote write before cleanup and preserves a neighbor namespace', async () => {
  const controller = new AbortController();
  let release!: () => void;
  let entered!: () => void;
  const enteredPromise = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  endpoint.control.holdWrite = async (key) => {
    if (key.endsWith(originalKeys.first)) {
      entered();
      await held;
    }
  };
  const pending = restore(controller.signal);
  const rejected = expect(pending).rejects.toBeInstanceOf(Error);
  await enteredPromise;
  controller.abort(new Error('fixture cancelled'));
  await rejected;
  release();
  endpoint.control.holdWrite = undefined;
  await remote.cleanup();
  expect(existsSync(join(root, 'job/ready/ariso.db'))).toBe(false);
  expect([...endpoint.objects.keys()]).toEqual([
    'new/remote-one/ariso/neighbor/keep',
  ]);
});
