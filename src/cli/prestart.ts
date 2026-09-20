import { join } from 'node:path';
import { prepareInitialStorage } from '../server/storage/defaults.ts';
import { runPreflight } from '../server/startup/preflight.ts';
import { parseLogLevel } from '../server/runtime/env.ts';
import { createRuntimeLogger } from '../server/runtime/logger.ts';

// 配置校验失败也必须可诊断；固定级别仅用于启动失败日志。
let logger = createRuntimeLogger('runtime.prestart', 'fatal');
try {
  logger = createRuntimeLogger(
    'runtime.prestart',
    parseLogLevel(process.env.LOG_LEVEL),
  );
  runPreflight(process.env, (db, config) => {
    prepareInitialStorage(db, { storage: join(config.dataDir, 'storage') });
  });
  logger.info({ phase: 'prestart' }, 'prestart completed');
} catch (error) {
  logger.fatal({ err: error, phase: 'prestart' }, 'prestart failed:');
  process.exitCode = 1;
}
