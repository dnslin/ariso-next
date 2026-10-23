import { Readable } from 'node:stream';
import { and, eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { createSecretCrypto } from '../runtime/crypto.ts';
import {
  storageConfigs,
  storageProbes,
  type StorageConfig,
  type StorageProbe,
} from './schema.ts';
import { createS3Storage, type S3StorageConfig } from './s3.ts';
import {
  createConnectionReport,
  runConnectionTest,
} from './connection-test.ts';
import type { ConnectionReport, ProbeStageResult } from './probe-types.ts';

export type ProbeContext = {
  db: BetterSQLite3Database;
  secretCrypto: ReturnType<typeof createSecretCrypto>;
};
export type ProbeInput = {
  revision: number;
  wholeBucketHasNoLockRules?: boolean;
};
export function readProbeObjectReferences(
  db: BetterSQLite3Database,
  storageId: string,
  key: string,
) {
  return db
    .select({ key: storageProbes.key })
    .from(storageProbes)
    .where(
      and(eq(storageProbes.storageId, storageId), eq(storageProbes.key, key)),
    )
    .all();
}
export function probeError(code: string, message: string, status = 409) {
  return Object.assign(new Error(message), { code, status });
}
export function configuration(
  context: ProbeContext,
  storageId: string,
): StorageConfig {
  const config = context.db
    .select()
    .from(storageConfigs)
    .where(eq(storageConfigs.id, storageId))
    .get();
  if (!config)
    throw probeError('STORAGE_NOT_FOUND', `存储不存在: ${storageId}`, 404);
  if (config.type !== 's3')
    throw probeError('STORAGE_INVALID_INPUT', '连接探测仅用于 S3 存储', 400);
  return config;
}
export function clientConfig(
  context: Pick<ProbeContext, 'secretCrypto'>,
  config: StorageConfig,
): S3StorageConfig {
  if (!config.accessKeyEncrypted || !config.secretKeyEncrypted)
    throw probeError('STORAGE_TEST_REQUIRED', '测试需要完整 S3 凭据');
  return {
    id: config.id,
    enabled: true,
    endpoint: config.endpoint!,
    region: config.region!,
    bucket: config.bucket!,
    pathPrefix: config.pathPrefix!,
    forcePathStyle: config.forcePathStyle!,
    credentials: {
      accessKeyId: context.secretCrypto.decryptSecret(
        config.accessKeyEncrypted,
        `storage ${config.id} accessKey`,
      ),
      secretAccessKey: context.secretCrypto.decryptSecret(
        config.secretKeyEncrypted,
        `storage ${config.id} secretKey`,
      ),
    },
  };
}
export function stageError(
  error: unknown,
  secrets: string[] = [],
): NonNullable<ProbeStageResult['error']> {
  const detail = error as {
    code?: string;
    serviceCode?: string;
    requestId?: string;
    httpStatusCode?: number;
  };
  let message = error instanceof Error ? error.message : String(error);
  message = message.replace(
    /https?:\/\/[^\s<>"']*X-Amz-[^\s<>"']*/gi,
    '[signed URL redacted]',
  );
  for (const secret of secrets)
    message = message
      .replaceAll(secret, '[redacted]')
      .replaceAll(encodeURIComponent(secret), '[redacted]');
  return {
    message,
    code: detail?.code,
    serviceCode: detail?.serviceCode,
    requestId: detail?.requestId,
    httpStatusCode: detail?.httpStatusCode,
  };
}
export function updateProbe(
  context: ProbeContext,
  id: string,
  values: Partial<typeof storageProbes.$inferInsert>,
) {
  context.db
    .update(storageProbes)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(storageProbes.id, id))
    .run();
}
function saveReport(context: ProbeContext, report: ConnectionReport) {
  return context.db.transaction((tx) => {
    const config = configuration({ ...context, db: tx }, report.storageId);
    report.stale = config.configRevision !== report.revision;
    if (report.stale) report.passed = false;
    if (!report.stale)
      tx.update(storageConfigs)
        .set({
          connectionStatus: report.passed ? 'passed' : 'failed',
          connectionRevision: report.revision,
          connectionTestedAt: new Date(report.testedAt),
          connectionReport: report,
          ...(!report.passed ? { enabled: false } : {}),
          updatedAt: new Date(),
        })
        .where(eq(storageConfigs.id, report.storageId))
        .run();
    return report;
  });
}
export function readProbeReferences(
  db: BetterSQLite3Database,
  storageId: string,
) {
  return db
    .select({
      probeId: storageProbes.id,
      storageId: storageProbes.storageId,
      key: storageProbes.key,
      state: storageProbes.state,
    })
    .from(storageProbes)
    .where(eq(storageProbes.storageId, storageId))
    .all();
}
export function readProbeUsage(db: BetterSQLite3Database) {
  const usage = new Map<
    string,
    {
      storageId: string;
      knownBytes: number;
      unconfirmedObjects: number;
      confirmedAt: Date | null;
    }
  >();
  for (const probe of db.select().from(storageProbes).all()) {
    const row = usage.get(probe.storageId) ?? {
      storageId: probe.storageId,
      knownBytes: 0,
      unconfirmedObjects: 0,
      confirmedAt: null,
    };
    if (probe.objectState === 'stored') row.knownBytes += probe.byteSize!;
    if (probe.objectState === 'writing') row.unconfirmedObjects++;
    if (
      probe.confirmedAt &&
      (!row.confirmedAt || probe.confirmedAt < row.confirmedAt)
    )
      row.confirmedAt = probe.confirmedAt;
    usage.set(probe.storageId, row);
  }
  return [...usage.values()];
}
export function listStorageProbes(
  db: BetterSQLite3Database,
  storageId: string,
) {
  return db
    .select()
    .from(storageProbes)
    .where(eq(storageProbes.storageId, storageId))
    .all();
}

export async function testStorageConnection(
  context: ProbeContext,
  storageId: string,
  input: ProbeInput,
  signal?: AbortSignal,
) {
  const config = configuration(context, storageId);
  if (config.configRevision !== input.revision)
    throw probeError('STORAGE_TEST_STALE', '配置已修改，请重新读取配置并确认');
  const snapshot = clientConfig(context, config);
  const secrets = Object.values(snapshot.credentials).filter(
    (value): value is string => Boolean(value),
  );
  const report = createConnectionReport({
    storageId,
    revision: config.configRevision,
    cleanupPending: true,
    wholeBucketHasNoLockRules: input.wholeBucketHasNoLockRules,
    deploymentRequirement:
      'Bucket 必须保持私有，关闭公共域名/CDN 等旁路，不设置选择性公开规则；本测试不枚举公共别名。',
  });
  const key = `probes/${report.probeId}`;
  context.db.transaction((tx) => {
    if (
      tx
        .select()
        .from(storageProbes)
        .where(
          and(
            eq(storageProbes.storageId, storageId),
            eq(storageProbes.purpose, 'connection'),
            eq(storageProbes.state, 'running'),
          ),
        )
        .get()
    )
      throw probeError('STORAGE_IN_USE', '该存储正在执行连接测试');
    tx.insert(storageProbes)
      .values({
        id: report.probeId,
        storageId,
        purpose: 'connection',
        configRevision: config.configRevision,
        key,
        state: 'running',
        stage: 'configuration',
        objectState: 'planned',
        report,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run();
  });
  const storage = createS3Storage(snapshot);
  try {
    await runConnectionTest({
      storage,
      key,
      report,
      signal,
      formatError: (error) => stageError(error, secrets),
      onStage(stage) {
        updateProbe(context, report.probeId, { stage: stage.stage, report });
      },
      async write(bytes, writeSignal) {
        updateProbe(context, report.probeId, { objectState: 'writing' });
        const result = await storage.writeObject(key, Readable.from([bytes]), {
          size: bytes.length,
          contentType: 'application/octet-stream',
          signal: writeSignal,
        });
        updateProbe(context, report.probeId, {
          objectState: 'stored',
          byteSize: bytes.length,
          confirmedAt: new Date(),
        });
        return result.metadata;
      },
      shouldCleanup() {
        const probe = context.db
          .select()
          .from(storageProbes)
          .where(eq(storageProbes.id, report.probeId))
          .get()!;
        return probe.objectState !== 'planned';
      },
      cleanup: (cleanupSignal) =>
        storage.deleteObject(key, { signal: cleanupSignal }),
    });
    context.db.transaction(() => {
      saveReport(context, report);
      if (!report.cleanupPending)
        context.db
          .delete(storageProbes)
          .where(eq(storageProbes.id, report.probeId))
          .run();
      else
        updateProbe(context, report.probeId, {
          state: 'cleanup',
          report,
          error: JSON.stringify(report.stages[4].error),
          cleanupAttempts: 1,
          nextCleanupAt: new Date(Date.now() + 60_000),
        });
    });
    return report;
  } finally {
    storage.destroy();
  }
}

export async function cleanupProbe(context: ProbeContext, probe: StorageProbe) {
  let storage: ReturnType<typeof createS3Storage> | undefined;
  try {
    storage = createS3Storage(
      clientConfig(context, configuration(context, probe.storageId)),
    );
    await storage.deleteObject(probe.key, {
      signal: AbortSignal.timeout(30_000),
    });
    context.db.transaction((tx) => {
      tx.delete(storageProbes).where(eq(storageProbes.id, probe.id)).run();
      const config = configuration({ ...context, db: tx }, probe.storageId);
      if (probe.purpose === 'cors' && config.corsReport?.probeId === probe.id) {
        tx.update(storageConfigs)
          .set({ corsReport: { ...config.corsReport, cleanupPending: false } })
          .where(eq(storageConfigs.id, probe.storageId))
          .run();
      }
      if (
        config.connectionReport?.probeId === probe.id &&
        config.configRevision === probe.configRevision
      ) {
        tx.update(storageConfigs)
          .set({
            connectionReport: {
              ...config.connectionReport,
              cleanupPending: false,
            },
          })
          .where(eq(storageConfigs.id, probe.storageId))
          .run();
      }
    });
  } catch (error) {
    const attempts = probe.cleanupAttempts + 1;
    updateProbe(context, probe.id, {
      state: 'cleanup',
      cleanupAttempts: attempts,
      nextCleanupAt: attempts >= 3 ? null : new Date(Date.now() + 60_000),
      error: JSON.stringify(stageError(error)),
    });
    throw error;
  } finally {
    storage?.destroy();
  }
}
export function recoverProbes(context: ProbeContext) {
  context.db.transaction(() => {
    for (const probe of context.db
      .select()
      .from(storageProbes)
      .where(
        and(
          eq(storageProbes.purpose, 'connection'),
          eq(storageProbes.state, 'running'),
        ),
      )
      .all()) {
      const report = probe.report as ConnectionReport;
      report.passed = false;
      report.cleanupPending = probe.objectState !== 'planned';
      report.testedAt = new Date().toISOString();
      const stage = report.stages.find((item) => item.stage === probe.stage)!;
      Object.assign(stage, {
        status: 'failed',
        error: {
          code: 'STORAGE_TEST_INTERRUPTED',
          message: '连接测试被进程重启中断',
        },
      });
      for (const item of report.stages)
        if (item.status === 'pending') item.status = 'skipped';
      saveReport(context, report);
      if (report.cleanupPending)
        updateProbe(context, probe.id, {
          state: 'cleanup',
          report,
          error: '连接测试被进程重启中断',
          nextCleanupAt: new Date(),
        });
      else
        context.db
          .delete(storageProbes)
          .where(eq(storageProbes.id, probe.id))
          .run();
    }
  });
}
