import { startStorageProbeRuntime } from '../storage/probe-runtime.ts';
import { createMediaResources } from '../media/resources.ts';
import { startWatermarkRuntime } from '../media/watermark-runtime.ts';
import { hasUploadWatermarkReference } from '../upload/watermark-references.ts';
import { verifyStorageSecrets } from '../storage/settings.ts';
import { createSecretCrypto } from '../runtime/crypto.ts';
import { join, resolve } from 'node:path';
import { openRuntimeDatabase } from '../runtime/db.ts';
import { parseRuntimeEnv } from '../runtime/env.ts';
import { createSetupState } from '../identity/setup.ts';
import { requireInitialSettings } from './initial-settings.ts';
import { startUploadRuntime } from '../upload/runtime.ts';
import { startMediaQueue } from '../media/queue.ts';
import { createRuntimeLogger } from '../runtime/logger.ts';
import { startAnalyticsRuntime } from '../analytics/runtime.ts';

type ServerRuntime = ReturnType<typeof initializeServerRuntime>;

const processState = globalThis as typeof globalThis & {
  arisoServerRuntime?: ServerRuntime;
};

function initializeServerRuntime() {
  const config = parseRuntimeEnv();
  const connection = openRuntimeDatabase(join(config.dataDir, 'ariso.db'));
  try {
    verifyStorageSecrets(
      connection.db,
      createSecretCrypto(config.encryptionKey),
    );
    const setup = createSetupState(connection.db, connection.db.$client.name);
    if (!setup.code) {
      requireInitialSettings(connection.db, connection.db.$client.name);
    } else {
      // 初始化码必须在 fatal 等任何日志级别下可见，仅此启动输出包含码。
      process.stdout.write(
        `${JSON.stringify({ time: new Date().toISOString(), level: 'info', module: 'identity.setup', event: 'setup-code', code: setup.code, msg: '请使用初始化码完成 setup' })}\n`,
      );
    }
    const mediaResources = createMediaResources();
    const mediaQueue = startMediaQueue({
      db: connection.db,
      // DATA_DIR is absolute; keep runtime data paths absolute for output tracing.
      storageRoot: resolve(config.dataDir, 'storage'),
      temporaryRoot: resolve(config.dataDir, 'tmp'),
      watermarksRoot: resolve(config.dataDir, 'assets', 'watermarks'),
      resources: mediaResources,
      logger: createRuntimeLogger('media.queue', config.logLevel),
    });
    const uploads = startUploadRuntime({
      db: connection.db,
      storageRoot: resolve(config.dataDir, 'storage'),
      logger: createRuntimeLogger('upload', config.logLevel),
    });
    const watermarks = startWatermarkRuntime({
      db: connection.db,
      watermarksRoot: resolve(config.dataDir, 'assets', 'watermarks'),
      hasUploadReference: hasUploadWatermarkReference,
      resources: mediaResources,
      logger: createRuntimeLogger('media.watermark', config.logLevel),
    });
    const analytics = startAnalyticsRuntime({
      db: connection.db.$client,
      logger: createRuntimeLogger('analytics', config.logLevel),
    });
    const storageProbes = startStorageProbeRuntime({
      db: connection.db,
      secretCrypto: createSecretCrypto(config.encryptionKey),
      logger: createRuntimeLogger('storage.probes', config.logLevel),
    });
    let stopping: Promise<void> | undefined;
    const runtime = {
      config,
      connection,
      setup,
      mediaQueue,
      uploads,
      storageProbes,
      watermarks,
      analytics,
      get stopping() {
        return stopping !== undefined;
      },
      stop() {
        return (stopping ??= uploads
          .stop()
          .finally(() => mediaQueue.stop())
          .finally(() => watermarks.stop())
          .finally(() => storageProbes.stop())
          .finally(() => {
            try {
              if (!analytics.stop()) {
                throw new Error('Analytics shutdown flush did not complete');
              }
            } finally {
              connection.close();
            }
          })
          .then(() => {
            createRuntimeLogger('runtime.shutdown', config.logLevel).info(
              'Upload and media queues stopped, analytics flushed, database closed',
            );
          }));
      },
    };
    return runtime;
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
  if (processState.arisoServerRuntime.stopping) {
    throw new Error('Web runtime is stopping');
  }
  return processState.arisoServerRuntime;
}
