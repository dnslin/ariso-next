import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

/** 调用方持有连接并负责关闭；不创建业务表或执行迁移。 */
export function openRuntimeDatabase(databasePath: string) {
  const client = new Database(databasePath);
  try {
    client.pragma('journal_mode = WAL');
    client.pragma('foreign_keys = ON');
    client.pragma('busy_timeout = 5000');
    return {
      db: drizzle(client),
      close: () => client.close(),
    };
  } catch (error) {
    client.close();
    throw error;
  }
}
