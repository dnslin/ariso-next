import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { snapshotDatabase } from '../../../src/server/backup/snapshot.ts';
import {
  buildBackupManifest,
  iterateBackupFiles,
} from '../../../src/server/backup/manifest.ts';
import {
  inspectBackup,
  prepareRestore,
} from '../../../src/server/backup/restore.ts';
import { performBackupWork } from '../../../src/server/backup/work.ts';
import { createRestoreRemote } from '../../../src/server/backup/restore-remote.ts';
import { readRestoreRemoteSources } from '../../../src/server/backup/restore-sources.ts';
import {
  createBackupDataFixture,
  fixtureApplication,
  fixtureKey,
} from './data-fixture.ts';
import { writeZipFixture } from './archive-fixture.ts';
import { remoteEndpoint } from './restore-remote-fixture.ts';

const disk = vi.hoisted(() => ({
  available: 0,
  ready: '',
  measurements: [] as boolean[],
}));
vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>();
  const { existsSync: exists } = await import('node:fs');
  return {
    ...actual,
    statfs: async () => {
      const occupied = disk.ready !== '' && exists(disk.ready);
      disk.measurements.push(occupied);
      return { bsize: 1, bavail: occupied ? 0 : disk.available };
    },
  };
});
let root: string;
let endpoint: Awaited<ReturnType<typeof remoteEndpoint>>;
let remote: ReturnType<typeof createRestoreRemote>;
let source: string;
let jobDirectory: string;
let required: number;
let localPath: string;
let localStorageId: string;
const local = 'small local bytes';
const remoteBytes = 'remote bytes '.repeat(16);
const asset = '<svg xmlns="http://www.w3.org/2000/svg"/>';
const nextKey = Buffer.alloc(32, 36);
const reserve = 16 * 1024 * 1024;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ariso-restore-space-'));
  jobDirectory = join(root, 'job');
  await mkdir(jobDirectory);
  endpoint = await remoteEndpoint();
  disk.ready = join(jobDirectory, 'ready');
  disk.measurements = [];
  const fixture = createBackupDataFixture(join(root, 'source'));
  localPath = fixture.storage.localPath;
  localStorageId = fixture.storage.id;
  try {
    fixture.addImage('local', local);
    const image = fixture.addImage('remote', remoteBytes);
    fixture.db.$client
      .prepare(
        "INSERT INTO storage_configs(id,name,type,enabled,endpoint,region,bucket,path_prefix,force_path_style,access_key_encrypted,secret_key_encrypted,created_at,updated_at) VALUES('remote','remote','s3',0,'http://old.invalid','test','old','old',1,'old-key','old-key',1,1)",
      )
      .run();
    fixture.db.$client.transaction(() => {
      fixture.db.$client.pragma('defer_foreign_keys=ON');
      fixture.db.$client
        .prepare(
          "UPDATE media_images SET storage_id='remote' WHERE id='remote'",
        )
        .run();
      fixture.db.$client
        .prepare(
          "UPDATE media_objects SET storage_id='remote' WHERE image_id='remote'",
        )
        .run();
    })();
    await rm(image.path);
    await mkdir(join(fixture.paths.assets, 'branding/logo'), {
      recursive: true,
    });
    await writeFile(
      join(fixture.paths.assets, 'branding/logo/test.svg'),
      asset,
    );
    fixture.db.$client
      .prepare(
        "UPDATE site_settings SET logo_key='logo/test.svg',logo_mime='image/svg+xml'",
      )
      .run();
    const databasePath = join(root, 'snapshot.db');
    const times = await snapshotDatabase({
      db: fixture.db,
      destination: databasePath,
    });
    const manifest = await buildBackupManifest({
      databasePath,
      dataDir: fixture.paths.dataDir,
      application: fixtureApplication,
      ...times,
    });
    const databaseBytes = await readFile(databasePath);
    const entries = [
      { name: 'manifest.json', value: Buffer.from(JSON.stringify(manifest)) },
      {
        name: 'secrets.json',
        value: Buffer.from(
          JSON.stringify({ originalEncryptionKey: fixtureKey.toString('hex') }),
        ),
      },
      { name: 'database/ariso.db', value: databaseBytes },
    ];
    for await (const file of iterateBackupFiles({
      databasePath,
      dataDir: fixture.paths.dataDir,
    }))
      entries.push({
        name: file.name,
        value:
          'path' in file ? await readFile(file.path) : Buffer.from(remoteBytes),
      });
    source = join(jobDirectory, 'content.zip');
    const zip = await writeZipFixture(source, entries);
    required =
      databaseBytes.length +
      Buffer.byteLength(local) +
      Buffer.byteLength(asset) +
      reserve;
    expect(zip.length + reserve).toBeGreaterThan(required);
  } finally {
    fixture.close();
  }
  await inspectBackup({
    source,
    workDirectory: join(jobDirectory, 'work'),
    application: fixtureApplication,
  });
  remote = createRestoreRemote({
    jobDirectory,
    jobId: 'space-fixture',
    encryptionKey: nextKey,
    sources: readRestoreRemoteSources(jobDirectory),
  });
  const target = remote.saveTarget('remote', {
    endpoint: endpoint.endpoint,
    region: 'test',
    bucket: 'target',
    pathPrefix: 'new',
    forcePathStyle: true,
    accessKey: 'new-key',
    secretKey: 'new-secret',
  });
  expect(
    (await remote.testTarget('remote', { revision: target.revision }))
      .testStatus,
  ).toBe('passed');
  disk.available = required;
  endpoint.requests.length = 0;
});
afterEach(async () => {
  await endpoint?.close();
  await rm(root, { recursive: true, force: true });
});
const execute = () =>
  performBackupWork(
    {
      kind: 'restore',
      jobId: 'space-fixture',
      jobDirectory,
      application: fixtureApplication,
      encryptionKey: nextKey,
      publicUrl: 'https://new.example.test',
    },
    new AbortController().signal,
    () => {},
  );

it('restores mixed data when free local space covers only Local/assets, ready DB and the fixed margin', async () => {
  expect(await execute()).toMatchObject({ kind: 'restore' });
  expect(
    await readFile(
      join(
        jobDirectory,
        'ready/storage',
        localPath,
        'ariso',
        localStorageId,
        'images/local/original/saved.jpg',
      ),
      'utf8',
    ),
  ).toBe(local);
  expect(
    await readFile(
      join(jobDirectory, 'ready/assets/branding/logo/test.svg'),
      'utf8',
    ),
  ).toBe(asset);
  expect(
    endpoint.objects
      .get('new/ariso/remote/images/remote/original/saved.jpg')
      ?.toString(),
  ).toBe(remoteBytes);
  expect(disk.measurements).toEqual([false]);
});
it('rejects one byte below the actual local requirement before preparing or writing S3 objects', async () => {
  disk.available = required - 1;
  await expect(
    prepareRestore({
      source,
      jobDirectory,
      application: fixtureApplication,
      encryptionKey: nextKey,
      publicUrl: 'https://new.example.test',
      remote,
    }),
  ).rejects.toMatchObject({ code: 'BACKUP_NO_SPACE', status: 507 });
  expect(existsSync(join(jobDirectory, 'ready'))).toBe(false);
  expect(endpoint.requests).toHaveLength(0);
});
it('removes only this retry ready directory before measuring free space', async () => {
  await mkdir(join(jobDirectory, 'ready/storage'), { recursive: true });
  await writeFile(
    join(jobDirectory, 'ready/storage/previous.part'),
    'old partial',
  );
  const neighbor = join(root, 'other-job/ready');
  await mkdir(neighbor, { recursive: true });
  await writeFile(join(neighbor, 'keep'), 'unrelated');
  await execute();
  expect(disk.measurements).toEqual([false]);
  expect(existsSync(join(jobDirectory, 'ready/storage/previous.part'))).toBe(
    false,
  );
  expect(await readFile(join(neighbor, 'keep'), 'utf8')).toBe('unrelated');
});
