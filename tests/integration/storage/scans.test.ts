import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createSecretCrypto } from '../../../src/server/runtime/crypto.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import {
  scanStorage,
  readStorageScan,
  type ScanAdapter,
  type ScanContext,
} from '../../../src/server/storage/scans.ts';
import {
  storageConfigs,
  storageOrphans,
} from '../../../src/server/storage/schema.ts';

let directory: string;
let connection: ReturnType<typeof openRuntimeDatabase>;
let context: ScanContext;
let keys: Set<string>;
let activeWrites: number;
const configId = 'scan-local';

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'ariso-scan-'));
  connection = openRuntimeDatabase(join(directory, 'app.db'));
  migrateRuntimeDatabase(connection.db, resolve('drizzle'));
  keys = new Set();
  activeWrites = 0;
  context = {
    db: connection.db,
    storageRoot: directory,
    secretCrypto: createSecretCrypto(Buffer.alloc(32, 1)),
    readReferences: () => ({ counts: {}, keys, activeWrites }),
  };
  connection.db
    .insert(storageConfigs)
    .values({
      id: configId,
      name: 'scan fixture',
      type: 'local',
      localPath: 'disk',
      enabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();
});
afterEach(() => {
  connection.close();
  rmSync(directory, { recursive: true, force: true });
});
const orphans = () => connection.db.select().from(storageOrphans).all();
const namespace = () => join(directory, 'disk', 'ariso', configId);
function put(key: string, bytes = 'content') {
  const path = join(namespace(), key);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, bytes);
}
function fake(
  pages: { key: string; size: number }[][],
  remove: ScanAdapter['deleteObject'] = async () => {},
) {
  const deleted: string[] = [];
  const removed = new Set<string>();
  let destroyed = false;
  const adapter: ScanAdapter = {
    async *listObjects() {
      for (const page of pages)
        yield page.filter(({ key }) => !removed.has(key));
    },
    async deleteObject(key, options) {
      deleted.push(key);
      await remove(key, options);
      removed.add(key);
    },
    destroy() {
      destroyed = true;
    },
  };
  context.adapterFactory = () => adapter;
  return {
    deleted,
    get destroyed() {
      return destroyed;
    },
  };
}

it('停用Local完整扫描只清理无引用文件，保护正常/回收/版本/上传Key及相邻配置', async () => {
  for (const key of [
    'images/normal',
    'trash/old',
    'versions/valid',
    'uploads/active.partial',
  ]) {
    put(key);
    keys.add(key);
  }
  put('unregistered/deep/orphan', 'orphan-bytes');
  const neighbor = join(directory, 'disk/ariso/neighbor/same');
  mkdirSync(join(neighbor, '..'), { recursive: true });
  writeFileSync(neighbor, 'neighbor');
  const result = await scanStorage(context, configId);
  expect(result).toMatchObject({
    status: 'passed',
    discoveredCount: 1,
    deletedCount: 1,
    protectedCount: 4,
    failedCount: 0,
  });
  for (const key of keys)
    expect(readFileSync(join(namespace(), key), 'utf8')).toBe('content');
  expect(readFileSync(neighbor, 'utf8')).toBe('neighbor');
  expect(orphans()).toEqual([]);
  expect(readStorageScan(connection.db, configId)).toEqual(result);
});

it('新命名空间没有对象时不创建文件目录，迟到对象在下一轮被清理', async () => {
  expect((await scanStorage(context, configId)).deletedCount).toBe(0);
  put('uploads/late.partial', 'late');
  expect(await scanStorage(context, configId)).toMatchObject({
    status: 'passed',
    discoveredCount: 1,
    deletedCount: 1,
  });
  expect(orphans()).toEqual([]);
});

it('分页遍历会处理全部批次，并释放S3适配器', async () => {
  connection.db
    .update(storageConfigs)
    .set({
      type: 's3',
      localPath: null,
      endpoint: 'https://s3.example.test',
      region: 'auto',
      bucket: 'test',
      pathPrefix: 'prefix',
      forcePathStyle: true,
    })
    .where(eq(storageConfigs.id, configId))
    .run();
  const storage = fake([
    [{ key: 'first', size: 7 }],
    [],
    [{ key: 'second', size: 19 }],
  ]);
  expect(await scanStorage(context, configId)).toMatchObject({
    status: 'passed',
    discoveredCount: 2,
    deletedCount: 2,
    scope: { namespace: `prefix/ariso/${configId}/` },
  });
  expect(storage.deleted).toEqual(['first', 'second']);
  expect(storage.destroyed).toBe(true);
});

it('活动写入暂缓删除，已发现对象仍登记已知用量；写入结束下一轮可清理', async () => {
  activeWrites = 1;
  const storage = fake([[{ key: 'just-written', size: 30 }]]);
  expect(await scanStorage(context, configId)).toMatchObject({
    status: 'passed',
    protectedCount: 1,
    discoveredCount: 1,
  });
  expect(storage.deleted).toEqual([]);
  expect(orphans()).toEqual([
    expect.objectContaining({ key: 'just-written', size: 30 }),
  ]);
  activeWrites = 0;
  await scanStorage(context, configId);
  expect(storage.deleted).toEqual(['just-written']);
});

it('发现后新引用参与删除前复核，并移除孤儿计量避免重复', async () => {
  const storage = fake([[{ key: 'adopted', size: 11 }]]);
  context.readReferences = () => {
    if (orphans().length) keys.add('adopted');
    return { counts: {}, keys, activeWrites: 0 };
  };
  expect(await scanStorage(context, configId)).toMatchObject({
    status: 'passed',
    discoveredCount: 1,
    deletedCount: 0,
    protectedCount: 1,
  });
  expect(storage.deleted).toEqual([]);
  expect(orphans()).toEqual([]);
});

it('删除失败持久保存大小和远端诊断，重启后缺席列表的Key仍精确重试', async () => {
  const storage = fake([[{ key: 'failed', size: 31 }]], async () => {
    throw Object.assign(new Error('permission denied'), {
      operation: 'delete',
      serviceCode: 'AccessDenied',
      httpStatusCode: 403,
      requestId: 'remote-request',
    });
  });
  await expect(scanStorage(context, configId)).rejects.toMatchObject({
    code: 'STORAGE_SCAN_FAILED',
    storageId: configId,
  });
  expect(orphans()).toEqual([
    expect.objectContaining({
      key: 'failed',
      size: 31,
      error: expect.objectContaining({
        serviceCode: 'AccessDenied',
        httpStatusCode: 403,
        requestId: 'remote-request',
      }),
    }),
  ]);
  expect(readStorageScan(connection.db, configId)).toMatchObject({
    status: 'failed',
    failedCount: 1,
    deletedCount: 0,
  });
  expect(storage.destroyed).toBe(true);
  connection.close();
  connection = openRuntimeDatabase(join(directory, 'app.db'));
  context.db = connection.db;
  const restarted = fake([]);
  expect(await scanStorage(context, configId)).toMatchObject({
    status: 'passed',
    deletedCount: 1,
    discoveredCount: 0,
  });
  expect(restarted.deleted).toEqual(['failed']);
  expect(orphans()).toEqual([]);
});

it('后续页失败不当作空，保留部分完成结果；取消后下一轮从头扫描', async () => {
  let destroyed = 0;
  context.adapterFactory = () => ({
    async *listObjects() {
      yield [{ key: 'one', size: 1 }];
      throw new Error('list page denied');
    },
    async deleteObject() {},
    destroy() {
      destroyed++;
    },
  });
  await expect(scanStorage(context, configId)).rejects.toThrow(
    'list page denied',
  );
  expect(readStorageScan(connection.db, configId)).toMatchObject({
    status: 'failed',
    deletedCount: 1,
    error: { message: 'list page denied' },
  });
  expect(destroyed).toBe(1);
  const controller = new AbortController();
  context.adapterFactory = () => ({
    async *listObjects() {
      yield [{ key: 'two', size: 2 }];
      controller.abort(new Error('interrupted'));
      yield [{ key: 'three', size: 3 }];
    },
    async deleteObject() {},
    destroy() {
      destroyed++;
    },
  });
  await expect(
    scanStorage(context, configId, { signal: controller.signal }),
  ).rejects.toMatchObject({ code: 'STORAGE_SCAN_INTERRUPTED' });
  expect(readStorageScan(connection.db, configId)).toMatchObject({
    status: 'interrupted',
    deletedCount: 1,
  });
  expect(destroyed).toBe(2);
  const next = fake([[{ key: 'three', size: 3 }]]);
  expect((await scanStorage(context, configId)).status).toBe('passed');
  expect(next.deleted).toEqual(['three']);
});

it.each(['localPath', 'configRevision'] as const)(
  '扫描时%s变化停止后续删除，记录旧扫描范围',
  async (field) => {
    context.adapterFactory = () => ({
      async *listObjects() {
        connection.db
          .update(storageConfigs)
          .set(
            field === 'localPath'
              ? { localPath: 'changed' }
              : { configRevision: 2 },
          )
          .where(eq(storageConfigs.id, configId))
          .run();
        yield [{ key: 'old-object', size: 1 }];
      },
      async deleteObject() {
        throw new Error('must not delete');
      },
      destroy() {},
    });
    await expect(scanStorage(context, configId)).rejects.toMatchObject({
      code: 'STORAGE_SCAN_FAILED',
      scan: { error: { code: 'STORAGE_SCAN_STALE' } },
    });
    expect(readStorageScan(connection.db, configId)).toMatchObject({
      status: 'failed',
      scope: { localPath: 'disk' },
      deletedCount: 0,
    });
  },
);

it('历史pending成为有效引用时退出孤儿统计，保留对应对象', async () => {
  connection.db
    .insert(storageOrphans)
    .values({
      storageId: configId,
      key: 'adopted',
      size: 8,
      confirmedAt: new Date(),
      error: { message: 'previous failure' },
    })
    .run();
  keys.add('adopted');
  const storage = fake([]);
  expect(await scanStorage(context, configId)).toMatchObject({
    status: 'passed',
    protectedCount: 0,
    deletedCount: 0,
  });
  expect(storage.deleted).toEqual([]);
  expect(orphans()).toEqual([]);
});

it('超过一页的历史pending全部重试，不因删除当前页改变后续覆盖', async () => {
  connection.db
    .insert(storageOrphans)
    .values(
      Array.from({ length: 1001 }, (_, index) => ({
        storageId: configId,
        key: `pending/${String(index).padStart(4, '0')}`,
        size: 1,
        confirmedAt: new Date(),
      })),
    )
    .run();
  const storage = fake([]);
  expect(await scanStorage(context, configId)).toMatchObject({
    status: 'passed',
    deletedCount: 1001,
  });
  expect(new Set(storage.deleted).size).toBe(1001);
  expect(orphans()).toEqual([]);
});

it('历史删除失败的对象列举再次出现，本轮只尝试一次并更新真实大小', async () => {
  connection.db
    .insert(storageOrphans)
    .values({
      storageId: configId,
      key: 'failed',
      size: 1,
      confirmedAt: new Date(),
    })
    .run();
  const storage = fake([[{ key: 'failed', size: 7 }]], async () => {
    throw new Error('injected failure');
  });
  await expect(scanStorage(context, configId)).rejects.toMatchObject({
    code: 'STORAGE_SCAN_FAILED',
  });
  expect(storage.deleted).toEqual(['failed']);
  expect(orphans()).toEqual([
    expect.objectContaining({ key: 'failed', size: 7 }),
  ]);
  expect(readStorageScan(connection.db, configId)).toMatchObject({
    failedCount: 1,
    discoveredCount: 1,
  });
});

it('精确Key引用提供方参与发现与删除前复核', async () => {
  const storage = fake([
    [
      { key: 'valid', size: 1 },
      { key: 'orphan', size: 2 },
    ],
  ]);
  context.readReferences = (_db, _id, key) => ({
    counts: {},
    keys: key === 'valid' ? new Set(['valid']) : new Set(),
    activeWrites: 0,
  });
  expect(await scanStorage(context, configId)).toMatchObject({
    deletedCount: 1,
    protectedCount: 1,
  });
  expect(storage.deleted).toEqual(['orphan']);
});

it.each([
  ['local', 'STORAGE_OPERATION_FAILED', 500],
  ['s3', 'STORAGE_OPERATION_FAILED', 502],
  ['s3', 'STORAGE_TIMEOUT', 504],
  ['s3', 'SQLITE_IOERR', 500],
] as const)(
  '扫描失败区分 %s / %s 的实际响应状态 %s',
  async (type, code, status) => {
    connection.db
      .update(storageConfigs)
      .set({ type })
      .where(eq(storageConfigs.id, configId))
      .run();
    context.adapterFactory = () => ({
      async *listObjects() {
        yield [];
        throw Object.assign(new Error('injected listing failure'), { code });
      },
      async deleteObject() {},
      destroy() {},
    });
    await expect(scanStorage(context, configId)).rejects.toMatchObject({
      code: 'STORAGE_SCAN_FAILED',
      status,
    });
    expect(readStorageScan(connection.db, configId)?.status).toBe('failed');
  },
);
