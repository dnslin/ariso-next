import { join } from 'node:path';
import { openRuntimeDatabase } from '../runtime/db.ts';
import { parseRuntimeEnv } from '../runtime/env.ts';
import { createSetupState } from '../identity/setup.ts';
import { requireInitialSettings } from './initial-settings.ts';

type ServerRuntime = ReturnType<typeof initializeServerRuntime>;

const processState = globalThis as typeof globalThis & {
  arisoServerRuntime?: ServerRuntime;
};

function initializeServerRuntime() {
  const config = parseRuntimeEnv();
  const connection = openRuntimeDatabase(join(config.dataDir, 'ariso.db'));
  try {
    const setup = createSetupState(connection.db, connection.db.$client.name);
    if (!setup.code) {
      requireInitialSettings(connection.db, connection.db.$client.name);
    } else {
      // 初始化码必须在 fatal 等任何日志级别下可见，仅此启动输出包含码。
      process.stdout.write(
        `${JSON.stringify({ time: new Date().toISOString(), level: 'info', module: 'identity.setup', event: 'setup-code', code: setup.code, msg: '请使用初始化码完成 setup' })}\n`,
      );
    }
    return { config, connection, setup };
  } catch (error) {
    connection.close();
    throw error;
  }
}

/** prestart 已准备目录和迁移；同步初始化完成后才保存，热更新复用同一连接。 */
export function startServer() {
  return (processState.arisoServerRuntime ??= initializeServerRuntime());
}

export function getServerRuntime() {
  if (!processState.arisoServerRuntime) {
    throw new Error('Web runtime has not been initialized');
  }
  return processState.arisoServerRuntime;
}
