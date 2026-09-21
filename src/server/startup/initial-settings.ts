import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { incompleteIdentity } from '../identity/setup.ts';
import { readMediaSettings } from '../media/settings.ts';
import { storageSettings } from '../storage/schema.ts';

/** 已有所有者时，两启动入口共同检查初始必需设置，不修补损坏数据。 */
export function requireInitialSettings(
  db: BetterSQLite3Database,
  databasePath: string,
) {
  if (!readMediaSettings(db))
    throw incompleteIdentity(databasePath, 'media_settings');
  // 默认指针为空、停用或删除配置都是初始化后的合法修改。
  if (!db.select().from(storageSettings).get())
    throw incompleteIdentity(databasePath, 'storage_settings');
}
