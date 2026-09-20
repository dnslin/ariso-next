import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { prepareLocalDirectory } from './local.ts';
import { storageConfigs, storageSettings } from './schema.ts';

/** 同步启动准备；settings 的存在表示已初始化，空默认仍是用户的有效选择。 */
export function prepareInitialStorage(
  db: BetterSQLite3Database,
  runtimePaths: { storage: string },
) {
  if (db.select().from(storageSettings).get()) return;
  prepareLocalDirectory(runtimePaths.storage, 'default');
  db.transaction((tx) => {
    if (tx.select().from(storageSettings).get()) return;
    const id = randomUUID();
    const now = new Date();
    tx.insert(storageConfigs)
      .values({
        id,
        name: '默认本地存储',
        type: 'local',
        enabled: true,
        localPath: 'default',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    tx.insert(storageSettings).values({ defaultStorageId: id }).run();
  });
}

/** 调用方在分配上传的同一短事务中读取并固定 storageId。 */
export function resolveUploadStorage(
  db: BetterSQLite3Database,
  requestedId?: string,
) {
  const id =
    requestedId ?? db.select().from(storageSettings).get()?.defaultStorageId;
  if (id == null) {
    throw Object.assign(new Error('没有默认存储'), {
      code: 'DEFAULT_STORAGE_UNSET',
    });
  }
  const config = db
    .select()
    .from(storageConfigs)
    .where(eq(storageConfigs.id, id))
    .get();
  if (!config) {
    throw Object.assign(new Error(`存储不存在: ${id}`), {
      code: 'STORAGE_NOT_FOUND',
      storageId: id,
    });
  }
  if (!config.enabled) {
    throw Object.assign(new Error(`存储已停用: ${id}`), {
      code:
        requestedId === undefined
          ? 'DEFAULT_STORAGE_DISABLED'
          : 'STORAGE_DISABLED',
      storageId: id,
    });
  }
  return config;
}
