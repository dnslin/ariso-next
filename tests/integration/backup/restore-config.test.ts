import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createSecretCrypto } from '../../../src/server/runtime/crypto.ts';
import { convertRestoredConfiguration } from '../../../src/server/backup/restore-config.ts';
import type { RestoredRemoteConfiguration } from '../../../src/server/backup/restore-remote-types.ts';
import { createBackupDataFixture, fixtureKey } from './data-fixture.ts';
let root: string;
let fixture: ReturnType<typeof createBackupDataFixture>;
const newKey = Buffer.alloc(32, 29);
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ariso-restore-config-'));
  fixture = createBackupDataFixture(root);
  for (const [id, enabled] of [
    ['remote-one', 1],
    ['remote-two', 0],
  ] as const)
    fixture.db.$client
      .prepare(
        `INSERT INTO storage_configs(id,name,type,enabled,endpoint,region,bucket,path_prefix,force_path_style,access_key_encrypted,secret_key_encrypted,config_revision,cors_status,cors_revision,cors_origin,created_at,updated_at) VALUES(?,?,'s3',?,'https://old.example.test','old','old-bucket','old',1,'obsolete-source-credential','obsolete-source-credential',7,'passed',7,'https://old.example.test',1,1)`,
      )
      .run(id, id, enabled);
  fixture.db.$client
    .prepare("UPDATE storage_settings SET default_storage_id='remote-one'")
    .run();
});
afterEach(() => {
  fixture.close();
  rmSync(root, { recursive: true, force: true });
});
function target(storageId: string): RestoredRemoteConfiguration {
  const crypto = createSecretCrypto(newKey);
  return {
    storageId,
    endpoint: 'https://new.example.test',
    region: 'new-region',
    bucket: 'new-bucket',
    pathPrefix: `recovery/${storageId}`,
    forcePathStyle: false,
    accessKeyEncrypted: crypto.encryptSecret(`new-access-${storageId}`),
    secretKeyEncrypted: crypto.encryptSecret(`new-secret-${storageId}`),
    revision: 8,
    testedAt: 1234,
    connectionReport: {
      probeId: 'fixture-probe',
      storageId,
      revision: 8,
      passed: true,
      stale: false,
      cleanupPending: false,
      stages: [],
      deploymentRequirement: 'private bucket',
      testedAt: new Date(1234).toISOString(),
      ownerConfirmation: {
        wholeBucketHasNoLockRules: true,
        confirmedAt: new Date(1234).toISOString(),
      },
    },
  };
}
it('uses each new S3 location and key while keeping IDs, default storage and enable intent', () => {
  convertRestoredConfiguration({
    db: fixture.db.$client,
    originalEncryptionKey: fixtureKey.toString('hex'),
    encryptionKey: newKey,
    publicUrl: 'https://restored.example.test',
    targets: [target('remote-one'), target('remote-two')],
  });
  const rows = fixture.db.$client
    .prepare("SELECT * FROM storage_configs WHERE type='s3' ORDER BY id")
    .all() as Array<Record<string, unknown>>;
  expect(
    rows.map((r) => [
      r.id,
      r.enabled,
      r.endpoint,
      r.region,
      r.bucket,
      r.path_prefix,
      r.config_revision,
      r.connection_revision,
      r.connection_status,
      r.cors_status,
      r.cors_revision,
      r.cors_origin,
    ]),
  ).toEqual([
    [
      'remote-one',
      1,
      'https://new.example.test',
      'new-region',
      'new-bucket',
      'recovery/remote-one',
      8,
      8,
      'passed',
      'untested',
      null,
      null,
    ],
    [
      'remote-two',
      0,
      'https://new.example.test',
      'new-region',
      'new-bucket',
      'recovery/remote-two',
      8,
      8,
      'passed',
      'untested',
      null,
      null,
    ],
  ]);
  expect(
    fixture.db.$client
      .prepare('SELECT default_storage_id FROM storage_settings')
      .get(),
  ).toEqual({ default_storage_id: 'remote-one' });
  const crypto = createSecretCrypto(newKey);
  expect(
    crypto.decryptSecret(rows[0].access_key_encrypted as string, 'fixture'),
  ).toBe('new-access-remote-one');
  expect(
    crypto.decryptSecret(
      (
        fixture.db.$client
          .prepare(
            'SELECT client_secret_encrypted AS value FROM identity_github_settings',
          )
          .get() as { value: string }
      ).value,
      'fixture',
    ),
  ).toBe('github secret');
});
it('does not publish partially converted configuration when a required S3 target is missing', () => {
  const before = fixture.db.$client
    .prepare('SELECT * FROM identity_github_settings')
    .all();
  expect(() =>
    convertRestoredConfiguration({
      db: fixture.db.$client,
      originalEncryptionKey: fixtureKey.toString('hex'),
      encryptionKey: newKey,
      publicUrl: 'https://restored.example.test',
      targets: [target('remote-one')],
    }),
  ).toThrow(/remote-two/);
  expect(
    fixture.db.$client.prepare('SELECT * FROM identity_github_settings').all(),
  ).toEqual(before);
  expect(
    fixture.db.$client.prepare('SELECT public_url FROM site_settings').get(),
  ).toEqual({ public_url: 'https://old.example.test' });
});
