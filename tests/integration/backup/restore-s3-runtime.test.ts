import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRestoreRuntime } from '../../../src/server/backup/restore-runtime.ts';
import { snapshotDatabase } from '../../../src/server/backup/snapshot.ts';
import {
  backupSummary,
  buildBackupManifest,
} from '../../../src/server/backup/manifest.ts';
import {
  readJobState,
  writeJobState,
} from '../../../src/server/backup/jobs.ts';
import { createSetupState } from '../../../src/server/identity/setup.ts';
import { createSecretCrypto } from '../../../src/server/runtime/crypto.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import type { RestoreJob } from '../../../src/server/backup/types.ts';
import type { RestoreRemoteTargetInput } from '../../../src/server/backup/restore-remote-types.ts';
import {
  createBackupDataFixture,
  fixtureApplication,
  fixtureKey,
} from './data-fixture.ts';
import { remoteEndpoint } from './restore-remote-fixture.ts';

let root: string;
let jobId: string;
let storageId: string;
let jobDirectory: string;
let target: ReturnType<typeof createBackupDataFixture>;
let setup: ReturnType<typeof createSetupState>;
let service: ReturnType<typeof createRestoreRuntime>;
let endpoint: Awaited<ReturnType<typeof remoteEndpoint>>;
let input: RestoreRemoteTargetInput;
const encryptionKey = Buffer.alloc(32, 23);
const releaseWrites = new Set<() => void>();
const workerFile = new URL(
  '../../../src/cli/backup-worker.ts',
  import.meta.url,
);

function start() {
  setup = createSetupState(target.db, target.paths.database);
  return createRestoreRuntime({
    db: target.db,
    dataDir: join(root, 'target'),
    encryptionKey,
    application: fixtureApplication,
    setup,
    workerFile,
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  });
}
function remoteRecord() {
  return readFile(join(jobDirectory, 'remote.json'), 'utf8').then((text) =>
    JSON.parse(text),
  );
}
function currentTarget() {
  const value = service
    .read(jobId)
    .targets?.find((item) => item.storageId === storageId);
  if (!value) throw new Error('Expected the saved S3 target');
  return value;
}
async function settled(status: 'passed' | 'failed') {
  await vi.waitFor(() => expect(currentTarget().testStatus).toBe(status), {
    timeout: 5000,
  });
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ariso-restore-s3-runtime-'));
  jobId = randomUUID();
  storageId = randomUUID();
  endpoint = await remoteEndpoint();
  const sourceRoot = join(root, 'source');
  const source = createBackupDataFixture(sourceRoot);
  target = createBackupDataFixture(join(root, 'target'), false);
  jobDirectory = join(root, 'target', 'restore', jobId);
  try {
    const crypto = createSecretCrypto(fixtureKey);
    source.db
      .insert(storageConfigs)
      .values({
        id: storageId,
        name: 'Original disabled S3',
        type: 's3',
        enabled: false,
        endpoint: 'https://old-unavailable.example.test',
        region: 'old-region',
        bucket: 'old-bucket',
        pathPrefix: 'original',
        forcePathStyle: true,
        configRevision: 3,
        accessKeyEncrypted: crypto.encryptSecret('old-fixture-access'),
        secretKeyEncrypted: crypto.encryptSecret('old-fixture-secret'),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run();
    const databasePath = join(jobDirectory, 'work', 'ariso.db');
    const times = await snapshotDatabase({
      db: source.db,
      destination: databasePath,
    });
    const manifest = await buildBackupManifest({
      databasePath,
      dataDir: sourceRoot,
      application: fixtureApplication,
      ...times,
    });
    writeJobState(jobDirectory, {
      kind: 'restore',
      id: jobId,
      status: 'configuring',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      receivedBytes: 1,
      uploadBytes: 1,
      publicUrl: 'https://restored.example.test',
      summary: backupSummary(manifest),
      application: fixtureApplication,
    });
  } finally {
    source.close();
  }
  input = {
    endpoint: endpoint.endpoint,
    region: 'new-region',
    bucket: 'new-bucket',
    pathPrefix: '恢复 + %',
    forcePathStyle: true,
    accessKey: 'target-fixture-access',
    secretKey: 'target-fixture-secret',
  };
  service = start();
});

afterEach(async () => {
  for (const release of releaseWrites) release();
  releaseWrites.clear();
  try {
    await service?.stop();
  } finally {
    try {
      await endpoint?.close();
    } finally {
      target?.close();
      await rm(root, { recursive: true, force: true });
    }
  }
});

it('keeps configuring and never publishes ready before every target has a current-revision connection test', async () => {
  expect(
    service.read(jobId).summary?.storages.find((item) => item.id === storageId),
  ).toMatchObject({ type: 's3', enabled: false, objects: 0 });
  await expect(service.execute(jobId)).rejects.toMatchObject({
    status: 409,
    code: 'RESTORE_TARGET_REQUIRED',
  });
  const saved = await service.saveTarget(jobId, storageId, input);
  expect(saved.targets?.[0].revision).toBe(4);
  await expect(service.execute(jobId)).rejects.toMatchObject({
    status: 409,
    code: 'RESTORE_TARGET_TEST_REQUIRED',
  });
  await service.testTarget(jobId, storageId, { revision: 4 });
  await settled('passed');
  await service.saveTarget(jobId, storageId, {
    ...input,
    secretKey: 'changed-fixture-secret',
  });
  expect(currentTarget()).toMatchObject({
    revision: 5,
    testedRevision: null,
    testStatus: 'untested',
  });
  await expect(service.execute(jobId)).rejects.toMatchObject({
    status: 409,
    code: 'RESTORE_TARGET_TEST_REQUIRED',
  });
  expect(service.read(jobId).status).toBe('configuring');
  expect(readJobState<RestoreJob>(jobDirectory)?.status).toBe('configuring');
  expect(existsSync(join(jobDirectory, 'ready'))).toBe(false);
  expect(endpoint.objects.size).toBe(0);
});

it('returns the testing snapshot before a held owner PUT settles, blocks competing operations, and allows cancellation', async () => {
  await service.saveTarget(jobId, storageId, input);
  const held = Promise.withResolvers<void>();
  releaseWrites.add(held.resolve);
  endpoint.control.holdWrite = (key) =>
    key.endsWith('/restore/owner.json') ? held.promise : Promise.resolve();
  const started = await service.testTarget(jobId, storageId, { revision: 4 });
  expect(started.status).toBe('configuring');
  expect(started.targets?.[0].testStatus).toBe('testing');
  await vi.waitFor(
    () =>
      expect(
        [...endpoint.objects.keys()].some((key) =>
          key.endsWith('/restore/owner.json'),
        ),
      ).toBe(true),
    { timeout: 5000 },
  );
  await expect(
    service.testTarget(jobId, storageId, { revision: 4 }),
  ).rejects.toMatchObject({ status: 409, code: 'RESTORE_STATE_CONFLICT' });
  await expect(
    service.saveTarget(jobId, storageId, input),
  ).rejects.toMatchObject({ status: 409, code: 'RESTORE_STATE_CONFLICT' });
  await expect(
    service.configure(jobId, 'https://different.example.test'),
  ).rejects.toMatchObject({ status: 409, code: 'RESTORE_STATE_CONFLICT' });
  await expect(service.execute(jobId)).rejects.toMatchObject({
    status: 409,
    code: 'RESTORE_BUSY',
  });
  const cancelled = await service.cancel(jobId);
  expect(cancelled).toMatchObject({ status: 'cancelled' });
  expect(cancelled.cleanupPending).toBeUndefined();
  expect(cancelled.targets?.[0].cleanupPending).toBe(false);
  expect(endpoint.objects.size).toBe(0);
  expect(setup.restoreJobId).toBeNull();
  expect(service.current().job).toBeNull();
  expect(existsSync(join(jobDirectory, 'remote.json'))).toBe(true);
  expect(existsSync(join(jobDirectory, 'ready'))).toBe(false);
  held.resolve();
});

it('recovers interrupted target testing on a new runtime while retaining cleanup ownership and requiring the new setup code', async () => {
  await service.saveTarget(jobId, storageId, input);
  const oldCode = setup.code!;
  service.authorize(oldCode);
  await service.stop();
  const record = await remoteRecord();
  Object.assign(record.targets[0], {
    testStatus: 'testing',
    cleanupPending: true,
    claim: 'owned',
    probeKey: 'restore/probes/interrupted',
  });
  await writeFile(join(jobDirectory, 'remote.json'), JSON.stringify(record));
  const prefix = `${input.pathPrefix}/ariso/${storageId}/`;
  endpoint.objects.set(
    `${prefix}restore/owner.json`,
    Buffer.from(JSON.stringify({ jobId, storageId })),
  );
  endpoint.objects.set(
    `${prefix}restore/probes/interrupted`,
    Buffer.from('small probe'),
  );
  service = start();
  expect(setup.code === oldCode).toBe(false);
  expect(() => service.authorize(oldCode)).toThrowError(
    expect.objectContaining({ code: 'INVALID_SETUP_CODE', status: 401 }),
  );
  expect(() => service.authorize(setup.code!)).not.toThrow();
  expect(currentTarget()).toMatchObject({
    testStatus: 'failed',
    cleanupPending: true,
    failure: { code: 'RESTORE_TARGET_TEST_INTERRUPTED' },
  });
  expect((await remoteRecord()).targets[0]).toMatchObject({
    claim: 'owned',
    probeKey: 'restore/probes/interrupted',
  });
  expect(endpoint.requests).toHaveLength(0);
  expect(endpoint.objects.size).toBe(2);
  const retry = await service.testTarget(jobId, storageId, { revision: 4 });
  expect(retry.targets?.[0].testStatus).toBe('testing');
  await settled('passed');
  expect(currentTarget().cleanupPending).toBe(false);
  expect(endpoint.objects.size).toBe(0);
});

it('retains a failed cancellation for same-location credential repair and later cleanup without touching neighboring objects', async () => {
  await service.saveTarget(jobId, storageId, input);
  endpoint.objects.set(
    'neighbor/ariso/other/images/keep',
    Buffer.from('neighbor'),
  );
  endpoint.control.failDelete = true;
  await service.testTarget(jobId, storageId, { revision: 4 });
  await settled('failed');
  expect(currentTarget().cleanupPending).toBe(true);
  await expect(service.cancel(jobId)).rejects.toMatchObject({
    code: 'RESTORE_CLEANUP_FAILED',
    status: 500,
  });
  expect(service.read(jobId)).toMatchObject({
    status: 'cancelled',
    cleanupPending: true,
  });
  expect(setup.restoreJobId).toBe(jobId);
  await expect(
    service.saveTarget(jobId, storageId, { ...input, pathPrefix: 'different' }),
  ).rejects.toMatchObject({
    code: 'RESTORE_TARGET_CLEANUP_REQUIRED',
    status: 409,
  });
  expect(currentTarget().pathPrefix).toBe(input.pathPrefix);
  const repairedSecret = 'repaired-fixture-secret';
  const repaired = await service.saveTarget(jobId, storageId, {
    ...input,
    secretKey: repairedSecret,
  });
  expect(repaired.cleanupPending).toBe(true);
  expect(currentTarget()).toMatchObject({
    revision: 5,
    pathPrefix: input.pathPrefix,
    cleanupPending: true,
  });
  const privateState = await remoteRecord();
  expect(
    createSecretCrypto(encryptionKey).decryptSecret(
      privateState.targets[0].secretKeyEncrypted,
      'fixture target',
    ) === repairedSecret,
  ).toBe(true);
  expect(JSON.stringify(privateState).includes(repairedSecret)).toBe(false);
  endpoint.control.failDelete = false;
  const cancelled = await service.cancel(jobId);
  expect(cancelled.status).toBe('cancelled');
  expect(cancelled.cleanupPending).toBeUndefined();
  expect(cancelled.targets?.[0]).toMatchObject({
    pathPrefix: input.pathPrefix,
    cleanupPending: false,
  });
  expect([...endpoint.objects.keys()]).toEqual([
    'neighbor/ariso/other/images/keep',
  ]);
  expect(
    endpoint.objects.get('neighbor/ariso/other/images/keep')!.toString(),
  ).toBe('neighbor');
  expect(setup.restoreJobId).toBeNull();
  expect(service.current().job).toBeNull();
  const count = endpoint.requests.length;
  expect((await service.cancel(jobId)).status).toBe('cancelled');
  expect(endpoint.requests).toHaveLength(count);
  expect(existsSync(join(jobDirectory, 'remote.json'))).toBe(true);
});

it('rejects late location changes for an already-cleaned target while another target keeps cancellation pending', async () => {
  await service.stop();
  const secondStorageId = randomUUID();
  const databasePath = join(jobDirectory, 'work', 'ariso.db');
  const work = new Database(databasePath, { fileMustExist: true });
  try {
    work
      .prepare(
        `INSERT INTO storage_configs
      (id,name,type,enabled,endpoint,region,bucket,path_prefix,force_path_style,
       access_key_encrypted,secret_key_encrypted,config_revision,created_at,updated_at)
      SELECT ?, 'Second original S3',type,enabled,endpoint,region,bucket,path_prefix,force_path_style,
       access_key_encrypted,secret_key_encrypted,config_revision,created_at,updated_at
      FROM storage_configs WHERE id=?`,
      )
      .run(secondStorageId, storageId);
  } finally {
    work.close();
  }
  const manifest = await buildBackupManifest({
    databasePath,
    dataDir: join(root, 'source'),
    application: fixtureApplication,
    snapshotStartedAt: Date.now(),
    snapshotCompletedAt: Date.now(),
  });
  writeJobState(jobDirectory, {
    ...readJobState<RestoreJob>(jobDirectory)!,
    summary: backupSummary(manifest),
  });
  // This is still fixture initialization: no target or remote operation exists yet.
  await rm(join(jobDirectory, 'remote.json'));
  service = start();
  await service.saveTarget(jobId, storageId, input);
  await service.saveTarget(jobId, secondStorageId, input);
  endpoint.control.failDelete = true;
  await service.testTarget(jobId, storageId, { revision: 4 });
  await settled('failed');
  endpoint.control.failDelete = false;
  await service.testTarget(jobId, secondStorageId, { revision: 4 });
  await vi.waitFor(
    () =>
      expect(
        service
          .read(jobId)
          .targets?.find((item) => item.storageId === secondStorageId)
          ?.testStatus,
      ).toBe('passed'),
    { timeout: 5000 },
  );
  endpoint.control.failDelete = true;
  await expect(service.cancel(jobId)).rejects.toMatchObject({
    code: 'RESTORE_CLEANUP_FAILED',
  });
  const cancelled = service.read(jobId);
  expect(cancelled).toMatchObject({
    status: 'cancelled',
    cleanupPending: true,
  });
  expect(
    cancelled.targets?.find((item) => item.storageId === storageId)
      ?.cleanupPending,
  ).toBe(true);
  expect(
    cancelled.targets?.find((item) => item.storageId === secondStorageId),
  ).toMatchObject({
    cleanupPending: false,
    writeStarted: false,
    pathPrefix: input.pathPrefix,
  });
  await expect(
    service.saveTarget(jobId, secondStorageId, {
      ...input,
      pathPrefix: 'late-new-location',
    }),
  ).rejects.toMatchObject({
    code: 'RESTORE_TARGET_CLEANUP_REQUIRED',
    status: 409,
  });
  expect(
    service
      .read(jobId)
      .targets?.find((item) => item.storageId === secondStorageId)?.pathPrefix,
  ).toBe(input.pathPrefix);
});
