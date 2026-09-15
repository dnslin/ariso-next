import { resolve } from 'node:path';
import { parseRuntimeEnv, type RuntimeConfig } from '../runtime/env.ts';
import { initializeRuntimePaths } from '../runtime/paths.ts';
import { openRuntimeDatabase } from '../runtime/db.ts';
import { migrateRuntimeDatabase } from '../runtime/migrations.ts';

/** 从项目根目录执行；短期连接不交给 Web 进程复用。 */
export function runPreflight(
  env: Record<string, string | undefined> = process.env,
  prepare?: (
    db: ReturnType<typeof openRuntimeDatabase>['db'],
    config: RuntimeConfig,
  ) => undefined,
) {
  const config = parseRuntimeEnv(env);
  const paths = initializeRuntimePaths(config.dataDir);
  const connection = openRuntimeDatabase(paths.database);
  try {
    migrateRuntimeDatabase(connection.db, resolve('drizzle'));
    // 普通同步组合函数：显式读取所属模块的配置；失败原样传播，已提交迁移保留。
    prepare?.(connection.db, config);
  } finally {
    connection.close();
  }
}
