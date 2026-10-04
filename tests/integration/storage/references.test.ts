import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { collectionFixture } from '../collections/helpers.ts';
import { createSecretCrypto } from '../../../src/server/runtime/crypto.ts';
import { readStorageReferences } from '../../../src/server/startup/storage-references.ts';
import {
  mediaCleanupJobs,
  mediaImages,
  mediaJobs,
  mediaObjects,
} from '../../../src/server/media/schema.ts';
import { planDerivedObject } from '../../../src/server/media/objects.ts';
import {
  cancelSession,
  createSubmission,
  getSubmission,
} from '../../../src/server/upload/sessions.ts';
import {
  uploadSessions,
  uploadSubmissions,
} from '../../../src/server/upload/schema.ts';
import { releaseStorageHistory } from '../../../src/server/upload/usage.ts';
import * as local from '../../../src/server/storage/local.ts';
import { startStorageMaintenance } from '../../../src/server/storage/maintenance.ts';
import {
  readStorageScan,
  type ScanAdapter,
  type ScanContext,
} from '../../../src/server/storage/scans.ts';
import {
  storageConfigs,
  storageOrphans,
  storageProbes,
  storageSettings,
} from '../../../src/server/storage/schema.ts';
import {
  createStorage,
  readStorage,
  readStorageSettings,
  updateStorage,
} from '../../../src/server/storage/settings.ts';
import {
  storageCreateInputSchema,
  storageUpdateInputSchema,
} from '../../../src/server/storage/validation.ts';

let fixture: ReturnType<typeof collectionFixture>;
let runtimes: ReturnType<typeof startStorageMaintenance>[];
const secretCrypto = createSecretCrypto(Buffer.alloc(32, 164));
beforeEach(() => {
  fixture = collectionFixture();
  runtimes = [];
});
afterEach(async () => {
  for (const runtime of runtimes) await runtime.stop();
  fixture.close();
});
const context = () => ({
  db: fixture.db,
  storageRoot: fixture.storageRoot,
  secretCrypto,
  readReferences: readStorageReferences,
});
function start(extra: Partial<ScanContext> = {}, intervalMs = 60_000) {
  const errors: unknown[] = [];
  const runtime = startStorageMaintenance(
    {
      ...context(),
      ...extra,
      clearReleasedReferences: releaseStorageHistory,
      logger: {
        error: (error: unknown) => {
          errors.push(error);
        },
      },
    },
    intervalMs,
  );
  runtimes.push(runtime);
  return { runtime, errors };
}
function put(key: string, bytes = 'fixture-bytes', id = fixture.storage.id) {
  const path = join(
    fixture.storageRoot,
    fixture.storage.localPath,
    'ariso',
    id,
    key,
  );
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, bytes);
  return path;
}
const submission = (requestId = randomUUID()) =>
  createSubmission(fixture.db, {
    requestId,
    files: [
      {
        queueItemId: randomUUID(),
        originalName: 'fixture.png',
        declaredSize: 7,
      },
    ],
  });
function adapter(
  config: typeof storageConfigs.$inferSelect,
  hook?: (key: string) => void,
): ScanAdapter {
  if (config.type !== 'local' || !config.localPath)
    throw new Error('Expected local fixture');
  const storage = {
    id: config.id,
    enabled: config.enabled,
    localPath: config.localPath,
  };
  return {
    listObjects: (options) =>
      local.listObjects(fixture.storageRoot, storage, options),
    async deleteObject(key) {
      await local.deleteObject(fixture.storageRoot, storage, key);
      hook?.(key);
    },
    destroy() {},
  };
}

it('真实media正常、回收、失败、版本、候选、任务和清理责任完整计数，保护文件并阻止删除与换位置', async () => {
  const { db, storage } = fixture;
  const normal = fixture.image();
  const trash = fixture.image();
  const failed = fixture.image();
  db.update(mediaImages)
    .set({ processingStatus: 'ready' })
    .where(eq(mediaImages.id, normal))
    .run();
  db.update(mediaJobs)
    .set({ status: 'succeeded' })
    .where(eq(mediaJobs.imageId, normal))
    .run();
  db.update(mediaImages)
    .set({ trashedAt: new Date() })
    .where(eq(mediaImages.id, trash))
    .run();
  db.update(mediaImages)
    .set({ processingStatus: 'failed' })
    .where(eq(mediaImages.id, failed))
    .run();
  db.update(mediaJobs)
    .set({ status: 'failed' })
    .where(eq(mediaJobs.imageId, failed))
    .run();
  const job = db
    .select()
    .from(mediaJobs)
    .where(eq(mediaJobs.imageId, trash))
    .get()!;
  db.transaction((tx) => planDerivedObject(tx, job.id, 'thumbnail'));
  db.insert(mediaCleanupJobs)
    .values({
      id: randomUUID(),
      imageId: failed,
      status: 'failed',
      error: 'known cleanup failure',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();
  const objects = db.select().from(mediaObjects).all();
  const files = objects.map((object) => put(object.key));
  const refs = readStorageReferences(db, storage.id);
  expect(refs.counts).toMatchObject({
    images: 3,
    versions: 3,
    objects: 5,
    jobs: 1,
    cleanupJobs: 1,
    uploads: 0,
    probes: 0,
  });
  expect(refs.keys).toEqual(new Set(objects.map((object) => object.key)));
  for (const object of objects)
    expect(
      readStorageReferences(db, storage.id, object.key).keys.has(object.key),
    ).toBe(true);
  const { runtime } = start();
  expect(await runtime.scan(storage.id)).toMatchObject({
    protectedCount: 5,
    discoveredCount: 0,
    deletedCount: 0,
  });
  await expect(runtime.deleteStorage(storage.id)).rejects.toMatchObject({
    code: 'STORAGE_IN_USE',
    references: expect.objectContaining({ images: 3, cleanupJobs: 1 }),
  });
  expect(() =>
    updateStorage(
      db,
      storage.id,
      storageUpdateInputSchema.parse({ localPath: 'elsewhere' }),
      context(),
      readStorageReferences,
    ),
  ).toThrow(expect.objectContaining({ code: 'STORAGE_IN_USE' }));
  expect(readStorage(db, storage.id)).toMatchObject({
    enabled: true,
    localPath: storage.localPath,
  });
  expect(readStorageSettings(db).defaultStorageId).toBe(storage.id);
  for (const path of files)
    expect(readFileSync(path, 'utf8')).toBe('fixture-bytes');
});

it.each(['queued', 'failed-cleanup'] as const)(
  '真实upload %s责任阻止删除和位置修改，不把终态失败当零引用',
  async (kind) => {
    const { db, storage } = fixture;
    const current = submission();
    if (kind === 'failed-cleanup')
      db.update(uploadSessions)
        .set({
          state: 'failed',
          cleanupStatus: 'failed',
          temporaryKey: 'uploads/known-failure',
          error: 'permission denied',
        })
        .where(eq(uploadSessions.id, current.sessions[0].id))
        .run();
    expect(readStorageReferences(db, storage.id).counts.uploads).toBe(1);
    if (kind === 'failed-cleanup')
      expect(
        readStorageReferences(db, storage.id, 'uploads/known-failure').keys.has(
          'uploads/known-failure',
        ),
      ).toBe(true);
    const before = getSubmission(db, current.id);
    const { runtime } = start();
    await expect(runtime.deleteStorage(storage.id)).rejects.toMatchObject({
      code: 'STORAGE_IN_USE',
      references: expect.objectContaining({ uploads: 1 }),
    });
    expect(() =>
      updateStorage(
        db,
        storage.id,
        storageUpdateInputSchema.parse({ localPath: 'other-disk' }),
        context(),
        readStorageReferences,
      ),
    ).toThrow(expect.objectContaining({ code: 'STORAGE_IN_USE' }));
    expect(getSubmission(db, current.id)).toEqual(before);
    expect(readStorageSettings(db).defaultStorageId).toBe(storage.id);
  },
);

it('真实probe清理记录阻止S3位置修改和配置删除，确切Key仍被引用', async () => {
  const { db } = fixture;
  const stored = createStorage(
    db,
    storageCreateInputSchema.parse({
      type: 's3',
      name: 'probe-referenced',
      endpoint: 'https://fixture.invalid',
      region: 'auto',
      bucket: 'fixture',
      accessKey: 'fixture-access',
      secretKey: 'fixture-secret',
    }),
    context(),
  );
  const id = randomUUID();
  const key = `probes/${id}`;
  const now = new Date();
  db.insert(storageProbes)
    .values({
      id,
      storageId: stored.id,
      purpose: 'connection',
      configRevision: 1,
      key,
      state: 'cleanup',
      stage: 'delete',
      objectState: 'stored',
      byteSize: 64,
      error: 'AccessDenied',
      createdAt: now,
      updatedAt: now,
      report: {
        probeId: id,
        storageId: stored.id,
        revision: 1,
        passed: false,
        stale: false,
        cleanupPending: true,
        stages: [
          {
            stage: 'delete',
            status: 'failed',
            error: { message: 'AccessDenied' },
          },
        ],
        deploymentRequirement: 'fixture',
        testedAt: now.toISOString(),
        ownerConfirmation: {
          wholeBucketHasNoLockRules: false,
          confirmedAt: null,
        },
      },
    })
    .run();
  expect(readStorageReferences(db, stored.id)).toMatchObject({
    counts: expect.objectContaining({ probes: 1 }),
    keys: new Set([key]),
  });
  expect(readStorageReferences(db, stored.id, key).keys.has(key)).toBe(true);
  const { runtime } = start({
    adapterFactory: (config) =>
      config.type === 'local'
        ? adapter(config)
        : {
            async *listObjects() {},
            async deleteObject() {
              throw new Error('No object deletion expected');
            },
            destroy() {},
          },
  });
  await expect(runtime.deleteStorage(stored.id)).rejects.toMatchObject({
    code: 'STORAGE_IN_USE',
    references: expect.objectContaining({ probes: 1 }),
  });
  expect(() =>
    updateStorage(
      db,
      stored.id,
      storageUpdateInputSchema.parse({ bucket: 'other' }),
      context(),
      readStorageReferences,
    ),
  ).toThrow(expect.objectContaining({ code: 'STORAGE_IN_USE' }));
  expect(db.select().from(storageProbes).get()!.key).toBe(key);
});

it('无引用本地配置先清实际孤儿，释放终态上传历史并清默认，只移除自己的空命名空间', async () => {
  const { db, storage } = fixture;
  const history = submission();
  cancelSession(db, history.sessions[0].id);
  const neighbor = put('neighbor.bin', 'neighbor', 'neighbor-configuration');
  const outside = join(
    fixture.storageRoot,
    storage.localPath,
    'other-application.txt',
  );
  writeFileSync(outside, 'other-application');
  const { runtime } = start();
  await runtime.scan(storage.id);
  const orphan = put('uploads/late-orphan', 'orphan');
  await expect(runtime.deleteStorage(storage.id)).resolves.toEqual({
    deleted: true,
    storageId: storage.id,
  });
  expect(existsSync(orphan)).toBe(false);
  expect(
    existsSync(
      join(fixture.storageRoot, storage.localPath, 'ariso', storage.id),
    ),
  ).toBe(false);
  expect(existsSync(join(fixture.storageRoot, storage.localPath))).toBe(true);
  expect(readFileSync(neighbor, 'utf8')).toBe('neighbor');
  expect(readFileSync(outside, 'utf8')).toBe('other-application');
  expect(db.select().from(storageConfigs).all()).toEqual([]);
  expect(db.select().from(storageOrphans).all()).toEqual([]);
  expect(db.select().from(uploadSessions).all()).toEqual([]);
  expect(db.select().from(uploadSubmissions).all()).toEqual([]);
  expect(readStorageSettings(db).defaultStorageId).toBeNull();
});

it('最后一次对象删除后新增的真实上传引用参与最终事务复核，拒绝删配置并保留默认指针', async () => {
  const { db, storage } = fixture;
  const history = submission();
  cancelSession(db, history.sessions[0].id);
  const templateSubmission = db.select().from(uploadSubmissions).get()!;
  const templateSession = db.select().from(uploadSessions).get()!;
  let inserted = false;
  let armed = false;
  const { runtime } = start({
    adapterFactory: (config) =>
      adapter(config, () => {
        if (!armed || inserted) return;
        inserted = true;
        // Persist the real provider rows to exercise the final reference check independently of request gating.
        const submissionId = randomUUID();
        db.transaction((tx) => {
          tx.insert(uploadSubmissions)
            .values({
              ...templateSubmission,
              id: submissionId,
              requestId: randomUUID(),
            })
            .run();
          tx.insert(uploadSessions)
            .values({
              ...templateSession,
              id: randomUUID(),
              submissionId,
              queueItemId: randomUUID(),
              candidateImageId: randomUUID(),
              state: 'queued',
            })
            .run();
        });
      }),
  });
  await runtime.scan(storage.id);
  put('race-last-object');
  armed = true;
  await expect(runtime.deleteStorage(storage.id)).rejects.toMatchObject({
    code: 'STORAGE_IN_USE',
    references: expect.objectContaining({ uploads: 1 }),
  });
  expect(inserted).toBe(true);
  expect(readStorage(db, storage.id)).toMatchObject({ enabled: false });
  expect(readStorageSettings(db).defaultStorageId).toBe(storage.id);
  expect(db.select().from(uploadSessions).all()).toHaveLength(2);
  expect(readStorageReferences(db, storage.id).counts.uploads).toBe(1);
});

it('列举错误保留配置、默认指针和可诊断扫描失败记录', async () => {
  const { db, storage } = fixture;
  const { runtime, errors } = start({
    adapterFactory: () => ({
      async *listObjects() {
        throw Object.assign(new Error('listing denied'), {
          operation: 'list',
          serviceCode: 'AccessDenied',
          requestId: 'listing-request',
        });
      },
      async deleteObject() {
        throw new Error('No object deletion expected');
      },
      destroy() {},
    }),
  });
  await expect(runtime.deleteStorage(storage.id)).rejects.toMatchObject({
    code: 'STORAGE_SCAN_FAILED',
  });
  expect(readStorageScan(db, storage.id)).toMatchObject({
    status: 'failed',
    error: {
      message: 'listing denied',
      operation: 'list',
      serviceCode: 'AccessDenied',
      requestId: 'listing-request',
    },
  });
  expect(readStorage(db, storage.id)).toMatchObject({ enabled: false });
  expect(readStorageSettings(db).defaultStorageId).toBe(storage.id);
  expect(errors.length).toBeGreaterThan(0);
});

it('命名空间内未知符号链接拒绝配置删除，链接目标与相邻文件不被删除', async () => {
  const { db, storage } = fixture;
  const target = put(
    'other-application.bin',
    'target',
    'neighbor-configuration',
  );
  const link = join(
    fixture.storageRoot,
    storage.localPath,
    'ariso',
    storage.id,
    'unknown-link',
  );
  mkdirSync(join(link, '..'), { recursive: true });
  symlinkSync(target, link);
  const { runtime } = start();
  await expect(runtime.deleteStorage(storage.id)).rejects.toMatchObject({
    code: 'STORAGE_OPERATION_FAILED',
    operation: 'remove-empty-namespace',
  });
  expect(readStorageScan(db, storage.id)).toMatchObject({
    status: 'failed',
    error: { operation: 'remove-empty-namespace' },
  });
  expect(existsSync(link)).toBe(true);
  expect(readFileSync(target, 'utf8')).toBe('target');
  expect(readStorage(db, storage.id).id).toBe(storage.id);
  expect(readStorageSettings(db).defaultStorageId).toBe(storage.id);
});

it('配置删除后周期维护不再扫描它，其他配置继续完成后续轮次', async () => {
  const { db, storage } = fixture;
  db.insert(storageConfigs)
    .values({
      ...storage,
      id: 'neighbor',
      localPath: 'neighbor',
      name: 'neighbor',
    })
    .run();
  mkdirSync(join(fixture.storageRoot, 'neighbor'));
  const scans = new Map<string, number>();
  const { runtime } = start(
    {
      adapterFactory: (config) => {
        scans.set(config.id, (scans.get(config.id) ?? 0) + 1);
        return adapter(config);
      },
    },
    20,
  );
  await runtime.deleteStorage(storage.id);
  const removedCount = scans.get(storage.id);
  const neighborCount = scans.get('neighbor') ?? 0;
  await expect
    .poll(() => scans.get('neighbor') ?? 0)
    .toBeGreaterThanOrEqual(neighborCount + 2);
  expect(scans.get(storage.id)).toBe(removedCount);
  expect(readStorage(db, 'neighbor').id).toBe('neighbor');
  expect(db.select().from(storageSettings).get()!.defaultStorageId).toBeNull();
});
