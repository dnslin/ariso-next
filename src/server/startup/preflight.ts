import { resolve } from 'node:path';
import { parseRuntimeEnv } from '../runtime/env.ts';
import { initializeRuntimePaths } from '../runtime/paths.ts';
import { openRuntimeDatabase } from '../runtime/db.ts';
import { migrateRuntimeDatabase } from '../runtime/migrations.ts';

/** 从项目根目录执行；短期连接不交给 Web 进程复用。 */
export function runPreflight(
  env: Record<string, string | undefined> = process.env,
) {
  const config = parseRuntimeEnv(env);
  const paths = initializeRuntimePaths(config.dataDir);
  const connection = openRuntimeDatabase(paths.database);
  try {
    migrateRuntimeDatabase(connection.db, resolve('drizzle'));
  } finally {
    connection.close();
  }
}
