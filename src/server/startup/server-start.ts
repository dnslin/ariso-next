import { readSmtpConfig } from '../identity/mail.ts';
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
import { captureGithubSettings } from '../identity/github-settings.ts';
import { requireInitialSettings } from './initial-settings.ts';
import { startUploadRuntime } from '../upload/runtime.ts';
import { startMediaQueue } from '../media/queue.ts';
import { createRuntimeLogger } from '../runtime/logger.ts';
import { startSharingRuntime } from '../sharing/runtime.ts';
import { startAnalyticsRuntime } from '../analytics/runtime.ts';
import { startStorageMaintenance } from '../storage/maintenance.ts';
import { readStorageReferences } from './storage-references.ts';
import type { ReadStorageReferences } from '../storage/references.ts';
import { releaseStorageHistory } from '../upload/usage.ts';
import { createBrandingService } from '../site/branding.ts';
import { createArchiveService } from '../delivery/archive.ts';
import { createReplacementService } from '../media/replacement.ts';
import { createEditPreviewRuntime } from '../media/edit-preview.ts';
import { createAccessProtectionRuntime } from '../access-protection/runtime.ts';
import { createContentMutations } from '../runtime/content-mutations.ts';
import { createBackupQuiescence } from '../backup/quiescence.ts';
import { BackupError } from '../backup/errors.ts';
import { createBackupRuntime } from '../backup/runtime.ts';
import { readBuildIdentity } from '../runtime/build-info.ts';
import { createRestoreRuntime } from '../backup/restore-runtime.ts';

type ServerRuntime = ReturnType<typeof initializeServerRuntime>;

const processState = globalThis as typeof globalThis & {
  arisoServerRuntime?: ServerRuntime;
};

function initializeServerRuntime() {
  const config = parseRuntimeEnv();
  const application = readBuildIdentity();
  const contentMutations = createContentMutations();
  const connection = openRuntimeDatabase(join(config.dataDir, 'ariso.db'));
  try {
    verifyStorageSecrets(
      connection.db,
      createSecretCrypto(config.encryptionKey),
    );
    const github = captureGithubSettings(
      connection.db,
      createSecretCrypto(config.encryptionKey),
    );
    readSmtpConfig(connection.db, createSecretCrypto(config.encryptionKey));
    const setup = createSetupState(connection.db, connection.db.$client.name);
    const restore = createRestoreRuntime({
      db: connection.db,
      dataDir: config.dataDir,
      encryptionKey: config.encryptionKey,
      application,
      setup,
      logger: createRuntimeLogger('backup.restore', config.logLevel),
    });
    if (!setup.code) {
      requireInitialSettings(connection.db, connection.db.$client.name);
    } else {
      // 初始化码必须在 fatal 等任何日志级别下可见，仅此启动输出包含码。
      process.stdout.write(
        `${JSON.stringify({ time: new Date().toISOString(), level: 'info', module: 'identity.setup', event: 'setup-code', code: setup.code, msg: '请使用初始化码完成 setup' })}\n`,
      );
    }
    const mediaResources = createMediaResources();
    const branding = createBrandingService({
      db: connection.db,
      brandingRoot: resolve(config.dataDir, 'assets', 'branding'),
      logger: createRuntimeLogger('site.branding', config.logLevel),
    });
    void branding.ready.catch((err) => {
      createRuntimeLogger('site.branding', config.logLevel).error(
        { err },
        'Brand startup cleanup failed',
      );
    });
    const secretCrypto = createSecretCrypto(config.encryptionKey);
    const archive = createArchiveService({
      db: connection.db,
      storageRoot: resolve(config.dataDir, 'storage'),
      secretCrypto,
      logger: createRuntimeLogger('delivery.archive', config.logLevel),
    });
    const replacements = createReplacementService({
      db: connection.db,
      storageRoot: resolve(config.dataDir, 'storage'),
      temporaryRoot: resolve(config.dataDir, 'tmp'),
      watermarksRoot: resolve(config.dataDir, 'assets', 'watermarks'),
      resources: mediaResources,
      secretCrypto,
      logger: createRuntimeLogger('media.replace', config.logLevel),
    });
    const mediaQueue = startMediaQueue({
      db: connection.db,
      // DATA_DIR is absolute; keep runtime data paths absolute for output tracing.
      storageRoot: resolve(config.dataDir, 'storage'),
      temporaryRoot: resolve(config.dataDir, 'tmp'),
      watermarksRoot: resolve(config.dataDir, 'assets', 'watermarks'),
      resources: mediaResources,
      secretCrypto,
      logger: createRuntimeLogger('media.queue', config.logLevel),
    });
    const editPreviews = createEditPreviewRuntime(
      {
        db: connection.db,
        storageRoot: resolve(config.dataDir, 'storage'),
        temporaryRoot: resolve(config.dataDir, 'tmp'),
        watermarksRoot: resolve(config.dataDir, 'assets', 'watermarks'),
        resources: mediaResources,
        secretCrypto,
        logger: createRuntimeLogger('media.edit-preview', config.logLevel),
      },
      mediaQueue.runTransientPreview,
    );
    void editPreviews.ready.catch((err) => {
      createRuntimeLogger('media.edit-preview', config.logLevel).error(
        { err },
        'Image editor preview startup cleanup failed',
      );
    });
    const uploads = startUploadRuntime({
      db: connection.db,
      temporaryRoot: resolve(config.dataDir, 'tmp'),
      secretCrypto,
      resources: mediaResources,
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
    const storageReferences: ReadStorageReferences = (db, id, key) =>
      readStorageReferences(
        db,
        id,
        key,
        uploads.activeWrites(id) +
          mediaQueue.activeWrites(id) +
          replacements.activeWrites(id) +
          storageProbes.activeWrites(id),
      );
    const storageMaintenance = startStorageMaintenance({
      db: connection.db,
      storageRoot: resolve(config.dataDir, 'storage'),
      secretCrypto,
      readReferences: storageReferences,
      clearReleasedReferences: releaseStorageHistory,
      logger: createRuntimeLogger('storage.maintenance', config.logLevel),
    });
    const sharing = startSharingRuntime({
      db: connection.db,
      logger: createRuntimeLogger('sharing', config.logLevel),
    });
    const accessProtection = createAccessProtectionRuntime({
      db: connection.db,
      logger: createRuntimeLogger('access-protection', config.logLevel),
    });
    const backupQuiescence = createBackupQuiescence({
      contentMutations,
      mediaQueue,
      uploads,
      storageMaintenance,
      storageProbes,
      watermarks,
      branding,
      flushAnalytics() {
        if (!analytics.flush())
          throw new BackupError(
            'BACKUP_ANALYTICS_FLUSH_FAILED',
            503,
            '访问统计暂时无法保存，请稍后重试备份',
          );
      },
    });
    const backups = createBackupRuntime({
      db: connection.db,
      dataDir: config.dataDir,
      encryptionKey: config.encryptionKey,
      application,
      logger: createRuntimeLogger('backup', config.logLevel),
      contentMutations,
      quiescence: backupQuiescence,
    });
    let stopping: Promise<void> | undefined;
    const runtime = {
      config,
      connection,
      setup,
      github,
      mediaResources,
      mediaQueue,
      editPreviews,
      uploads,
      storageProbes,
      storageReferences,
      storageMaintenance,
      watermarks,
      analytics,
      sharing,
      branding,
      archive,
      replacements,
      accessProtection,
      contentMutations,
      backupQuiescence,
      backups,
      restore,
      get stopping() {
        return stopping !== undefined;
      },
      stop() {
        return (stopping ??= backups
          .stop()
          .finally(() => restore.stop())
          .finally(() => storageMaintenance.stop())
          .finally(() => sharing.stop())
          .finally(() => accessProtection.stop())
          .finally(() => archive.close())
          .finally(() => replacements.close())
          .finally(() => editPreviews.close())
          .finally(() => uploads.stop())
          .finally(() => mediaQueue.stop())
          .finally(() => watermarks.stop())
          .finally(() => storageProbes.stop())
          .finally(() => branding.close())
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
