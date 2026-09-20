import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  existsSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import {
  prepareInitialStorage,
  resolveUploadStorage,
} from '../../../src/server/storage/defaults.ts';
import {
  storageConfigs,
  storageSettings,
} from '../../../src/server/storage/schema.ts';

let directory: string;
let storage: string;
let connection: ReturnType<typeof openRuntimeDatabase>;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'ariso-storage-defaults-'));
  storage = join(directory, 'storage');
  mkdirSync(storage);
  connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  migrateRuntimeDatabase(connection.db, resolve('drizzle'));
});
afterEach(() => {
  connection.close();
  rmSync(directory, { recursive: true, force: true });
});
const prepare = () => prepareInitialStorage(connection.db, { storage });
const configs = () => connection.db.select().from(storageConfigs).all();
const settings = () => connection.db.select().from(storageSettings).all();

describe('默认本地存储持久初始化', () => {
  it('首次准备创建目录、启用配置及默认指针，重开数据库不改写', () => {
    expect(configs()).toEqual([]);
    prepare();
    const saved = configs();
    expect(saved).toEqual([
      expect.objectContaining({
        id: expect.any(String),
        name: '默认本地存储',
        type: 'local',
        enabled: true,
        localPath: 'default',
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      }),
    ]);
    expect(settings()).toEqual([{ id: 1, defaultStorageId: saved[0].id }]);
    expect(existsSync(join(storage, 'default'))).toBe(true);
    connection.close();
    connection = openRuntimeDatabase(join(directory, 'ariso.db'));
    prepare();
    expect(configs()).toEqual(saved);
  });

  it('清空默认、停用、删除全部配置后保留已初始化状态，不重建目录', () => {
    prepare();
    connection.db.update(storageConfigs).set({ enabled: false }).run();
    prepare();
    expect(configs()[0].enabled).toBe(false);
    connection.db.update(storageSettings).set({ defaultStorageId: null }).run();
    prepare();
    expect(settings()).toEqual([{ id: 1, defaultStorageId: null }]);
    connection.db.delete(storageConfigs).run();
    rmSync(join(storage, 'default'), { recursive: true });
    prepare();
    expect(configs()).toEqual([]);
    expect(existsSync(join(storage, 'default'))).toBe(false);
  });

  it('目录失败不写默认行，修复目录后可以重试', () => {
    writeFileSync(join(storage, 'default'), 'keep');
    expect(prepare).toThrow();
    expect(configs()).toEqual([]);
    expect(settings()).toEqual([]);
    rmSync(join(storage, 'default'));
    prepare();
    expect(configs()).toHaveLength(1);
  });

  it('第二行写入失败时配置也回滚，保留目录供修复后重试', () => {
    connection.db.$client
      .exec(`CREATE TRIGGER reject_settings BEFORE INSERT ON storage_settings
      BEGIN SELECT RAISE(ABORT, 'test write interruption'); END`);
    expect(prepare).toThrow('test write interruption');
    expect(configs()).toEqual([]);
    expect(settings()).toEqual([]);
    expect(existsSync(join(storage, 'default'))).toBe(true);
    connection.db.$client.exec('DROP TRIGGER reject_settings');
    prepare();
    expect(configs()).toHaveLength(1);
  });

  it('上传选择区分无默认、缺失及停用，不回退到其他存储', () => {
    expect(() => resolveUploadStorage(connection.db)).toThrowError(
      expect.objectContaining({ code: 'DEFAULT_STORAGE_UNSET' }),
    );
    prepare();
    const saved = configs()[0];
    expect(connection.db.transaction((tx) => resolveUploadStorage(tx))).toEqual(
      saved,
    );
    expect(resolveUploadStorage(connection.db, saved.id)).toEqual(saved);
    expect(() => resolveUploadStorage(connection.db, 'missing')).toThrowError(
      expect.objectContaining({ code: 'STORAGE_NOT_FOUND' }),
    );
    connection.db.update(storageConfigs).set({ enabled: false }).run();
    expect(() => resolveUploadStorage(connection.db)).toThrowError(
      expect.objectContaining({ code: 'DEFAULT_STORAGE_DISABLED' }),
    );
    expect(() => resolveUploadStorage(connection.db, saved.id)).toThrowError(
      expect.objectContaining({ code: 'STORAGE_DISABLED' }),
    );
    connection.db.update(storageSettings).set({ defaultStorageId: null }).run();
    expect(() => resolveUploadStorage(connection.db)).toThrowError(
      expect.objectContaining({ code: 'DEFAULT_STORAGE_UNSET' }),
    );
  });

  it('数据库约束拒绝第二设置行和不存在的默认配置', () => {
    prepare();
    expect(() =>
      connection.db.insert(storageSettings).values({ id: 2 }).run(),
    ).toThrow();
    expect(() =>
      connection.db
        .update(storageSettings)
        .set({ defaultStorageId: 'missing' })
        .run(),
    ).toThrow();
    expect(settings()[0].defaultStorageId).toBe(configs()[0].id);
  });
});
