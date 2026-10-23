import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { initializeRuntimePaths } from '../../../src/server/runtime/paths.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import { prepareInitialStorage } from '../../../src/server/storage/defaults.ts';
import { prepareInitialMedia } from '../../../src/server/media/settings.ts';
import { createProcessingSnapshot } from '../../../src/server/media/settings.ts';
import { createSecretCrypto } from '../../../src/server/runtime/crypto.ts';
import { insertSetupOwner } from '../../../src/server/identity/setup.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaVersions,
} from '../../../src/server/media/schema.ts';

export const fixtureApplication = {
  version: 'v1.2.1-local.1',
  revision: 'a'.repeat(40),
};
export const fixtureKey = Buffer.alloc(32, 17);
export function createBackupDataFixture(dataDir: string, owner = true) {
  const paths = initializeRuntimePaths(dataDir);
  const connection = openRuntimeDatabase(paths.database);
  migrateRuntimeDatabase(connection.db, resolve('drizzle'));
  prepareInitialStorage(connection.db, paths);
  if (owner) {
    connection.db.transaction((tx) =>
      insertSetupOwner(tx, 'owner@example.test', 'retained-password-hash'),
    );
    connection.db.$client
      .prepare(
        'INSERT INTO site_settings (id, public_url, time_zone, name, description, updated_at) VALUES (1, ?, ?, ?, ?, ?)',
      )
      .run(
        'https://old.example.test',
        'Asia/Shanghai',
        'Saved site',
        'Retained description',
        Date.now(),
      );
    connection.db.transaction((tx) => prepareInitialMedia(tx));
    const crypto = createSecretCrypto(fixtureKey);
    connection.db.$client
      .prepare(
        'INSERT INTO identity_github_settings (id, enabled, client_id, client_secret_encrypted, updated_at) VALUES (1, 0, ?, ?, ?)',
      )
      .run('github-client', crypto.encryptSecret('github secret'), Date.now());
    connection.db.$client
      .prepare(
        'INSERT INTO identity_smtp_settings (id, host, port, mode, username, password_encrypted, from_name, from_email, updated_at) VALUES (1, ?, 465, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        'smtp.example.test',
        'tls',
        'smtp-user',
        crypto.encryptSecret('smtp secret'),
        'Owner',
        'owner@example.test',
        Date.now(),
      );
  }
  const storage = connection.db.$client
    .prepare('SELECT id, local_path AS localPath FROM storage_configs')
    .get() as { id: string; localPath: string };
  function addImage(
    id: string,
    text: string,
    options: {
      trashed?: boolean;
      deleting?: boolean;
      jobStatus?: 'queued' | 'failed';
    } = {},
  ) {
    const now = new Date();
    connection.db
      .insert(mediaImages)
      .values({
        id,
        storageId: storage.id,
        originalName: `${id}.jpg`,
        displayName: id,
        visibility: 'public',
        format: 'JPEG',
        mime: 'image/jpeg',
        byteSize: Buffer.byteLength(text),
        processingStatus: 'ready',
        trashedAt: options.trashed ? now : null,
        deletionStatus: options.deleting ? 'deleting' : null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const jobId = `${id}-job`;
    connection.db
      .insert(mediaJobs)
      .values({
        id: jobId,
        imageId: id,
        kind: 'process',
        scope: 'all',
        snapshot: connection.db.transaction((tx) =>
          createProcessingSnapshot(tx),
        ),
        expectedVersions: [],
        status: options.jobStatus ?? 'succeeded',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const objectId = `${id}-original`;
    const key = `images/${id}/original/saved.jpg`;
    connection.db
      .insert(mediaObjects)
      .values({
        id: objectId,
        imageId: id,
        jobId,
        storageId: storage.id,
        key,
        purpose: 'original',
        status: options.deleting ? 'cleanup_pending' : 'stored',
        byteSize: Buffer.byteLength(text),
        createdAt: now,
        updatedAt: now,
      })
      .run();
    connection.db
      .insert(mediaVersions)
      .values({
        imageId: id,
        objectId,
        kind: 'original',
        byteSize: Buffer.byteLength(text),
        format: 'JPEG',
        mime: 'image/jpeg',
        createdAt: now,
      })
      .run();
    const path = join(
      paths.storage,
      storage.localPath,
      'ariso',
      storage.id,
      key,
    );
    if (!options.deleting) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text);
    }
    return { path, key, objectId, jobId };
  }
  return { ...connection, paths, storage, addImage };
}
