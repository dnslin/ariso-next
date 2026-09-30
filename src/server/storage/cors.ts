import { randomUUID } from 'node:crypto';
import { and, eq, lte } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { requireSiteSettings, type SiteTransaction } from '../site/settings.ts';
import { storageConfigs, storageProbes } from './schema.ts';
import { createS3Storage } from './s3.ts';
import {
  configuration,
  clientConfig,
  stageError,
  updateProbe,
  probeError,
  type ProbeContext,
} from './probes.ts';
import type {
  CorsBrowserResult,
  CorsReport,
  CorsTestSession,
  CorsTestState,
} from './cors-types.ts';

const payload = 'Ariso browser CORS probe\n';
const contentType = 'application/octet-stream';
const methods = ['PUT', 'GET', 'HEAD'] as const;
function siteOrigin(db: BetterSQLite3Database) {
  return new URL(requireSiteSettings(db).publicUrl).origin;
}
function requireOrigin(db: BetterSQLite3Database, origin: string | null) {
  const expected = siteOrigin(db);
  if (origin !== expected)
    throw probeError(
      'STORAGE_CORS_ORIGIN_MISMATCH',
      `请从配置的站点地址 ${expected} 检测；当前来源：${origin ?? '缺失'}`,
      409,
    );
  return expected;
}
export function invalidateS3Cors(tx: SiteTransaction) {
  tx.update(storageConfigs)
    .set({ corsStatus: 'invalidated', updatedAt: new Date() })
    .where(eq(storageConfigs.type, 's3'))
    .run();
  tx.update(storageProbes)
    .set({ invalidated: true, updatedAt: new Date() })
    .where(
      and(
        eq(storageProbes.purpose, 'cors'),
        eq(storageProbes.state, 'running'),
      ),
    )
    .run();
}
export function readCorsTestState(
  db: BetterSQLite3Database,
  storageId: string,
): CorsTestState {
  const config = db
    .select()
    .from(storageConfigs)
    .where(eq(storageConfigs.id, storageId))
    .get();
  if (!config) throw probeError('STORAGE_NOT_FOUND', '存储不存在', 404);
  if (config.type !== 's3')
    throw probeError('STORAGE_INVALID_INPUT', 'CORS 检测仅用于 S3 存储', 400);
  const origin = siteOrigin(db);
  return {
    origin,
    example: [
      {
        AllowedOrigins: [origin],
        AllowedMethods: [...methods],
        AllowedHeaders: ['content-type'],
      },
    ],
    status: config.corsStatus,
    report: config.corsReport,
    probes: db
      .select()
      .from(storageProbes)
      .where(
        and(
          eq(storageProbes.storageId, storageId),
          eq(storageProbes.purpose, 'cors'),
        ),
      )
      .all()
      .map((probe) => ({
        probeId: probe.id,
        state: probe.state,
        stage: probe.stage,
        key: probe.key,
        invalidated: probe.invalidated,
        expiresAt: probe.expiresAt?.toISOString() ?? null,
        error: probe.error,
        report: probe.report as CorsReport,
      })),
  };
}
function saveCorsReport(context: ProbeContext, report: CorsReport) {
  const config = configuration(context, report.storageId);
  const probe = context.db
    .select()
    .from(storageProbes)
    .where(eq(storageProbes.id, report.probeId))
    .get();
  report.stale =
    !!probe?.invalidated ||
    config.configRevision !== report.revision ||
    siteOrigin(context.db) !== report.origin;
  if (report.stale) report.passed = false;
  if (!report.stale)
    context.db
      .update(storageConfigs)
      .set({
        corsStatus: report.passed ? 'passed' : 'failed',
        corsRevision: report.revision,
        corsOrigin: report.origin,
        corsTestedAt: new Date(report.testedAt),
        corsReport: report,
        updatedAt: new Date(),
      })
      .where(eq(storageConfigs.id, report.storageId))
      .run();
}
export async function createCorsTest(
  context: ProbeContext,
  storageId: string,
  revision: number,
  requestOrigin: string | null,
): Promise<CorsTestSession> {
  const origin = requireOrigin(context.db, requestOrigin);
  const config = configuration(context, storageId);
  if (config.configRevision !== revision)
    throw probeError('STORAGE_TEST_STALE', '配置已修改，请重新读取配置');
  if (
    config.connectionStatus !== 'passed' ||
    config.connectionRevision !== revision
  )
    throw probeError('STORAGE_TEST_REQUIRED', '当前配置须先通过连接测试');
  const snapshot = clientConfig(context, config);
  const probeId = randomUUID();
  const key = `probes/${probeId}`;
  const report: CorsReport = {
    probeId,
    storageId,
    revision,
    origin,
    passed: false,
    stale: false,
    cleanupPending: true,
    testedAt: new Date().toISOString(),
    stages: (
      [
        'browser-put',
        'browser-get',
        'browser-head',
        'verify',
        'delete',
      ] as const
    ).map((stage) => ({ stage, status: 'pending' })),
  };
  context.db.transaction((tx) => {
    if (
      tx
        .select()
        .from(storageProbes)
        .where(
          and(
            eq(storageProbes.storageId, storageId),
            eq(storageProbes.purpose, 'cors'),
            eq(storageProbes.state, 'running'),
          ),
        )
        .get()
    )
      throw probeError('STORAGE_IN_USE', '该存储正在执行直传检测');
    tx.insert(storageProbes)
      .values({
        id: probeId,
        storageId,
        purpose: 'cors',
        configRevision: revision,
        origin,
        key,
        state: 'running',
        stage: 'browser',
        objectState: 'writing',
        expiresAt: new Date(Date.now() + 300_000),
        report,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run();
  });
  const storage = createS3Storage(snapshot);
  try {
    const upload = await storage.signUpload(key, contentType);
    const get = await storage.signRead(key, {
      method: 'GET',
      contentType,
      contentDisposition: 'inline',
      cacheControl: 'no-store',
    });
    const head = await storage.signRead(key, { method: 'HEAD' });
    const expiresAt = new Date(
      Math.min(
        upload.expiresAt.getTime(),
        get.expiresAt.getTime(),
        head.expiresAt.getTime(),
      ),
    );
    updateProbe(context, probeId, { expiresAt });
    return {
      probeId,
      storageId,
      revision,
      origin,
      payload,
      upload: { ...upload, expiresAt: upload.expiresAt.toISOString() },
      get: { ...get, expiresAt: get.expiresAt.toISOString() },
      head: { ...head, expiresAt: head.expiresAt.toISOString() },
      expiresAt: expiresAt.toISOString(),
    };
  } catch (error) {
    // No URL reached the caller, so no remote request could start.
    context.db.delete(storageProbes).where(eq(storageProbes.id, probeId)).run();
    throw error;
  } finally {
    storage.destroy();
  }
}
export async function finishCorsTest(
  context: ProbeContext,
  storageId: string,
  probeId: string,
  requestOrigin: string | null,
  results: CorsBrowserResult[],
  signal?: AbortSignal,
): Promise<CorsReport> {
  requireOrigin(context.db, requestOrigin);
  const probe = context.db.transaction((tx) => {
    const current = tx
      .select()
      .from(storageProbes)
      .where(
        and(
          eq(storageProbes.id, probeId),
          eq(storageProbes.storageId, storageId),
          eq(storageProbes.purpose, 'cors'),
        ),
      )
      .get();
    if (!current)
      throw probeError('STORAGE_NOT_FOUND', '直传探测不存在或已结束', 404);
    if (current.state !== 'running' || current.stage !== 'browser')
      throw probeError('STORAGE_IN_USE', '直传探测已进入核验或清理');
    updateProbe({ ...context, db: tx }, probeId, { stage: 'verify' });
    return current;
  });
  const report = probe.report as CorsReport;
  const config = configuration(context, storageId);
  let storage: ReturnType<typeof createS3Storage> | undefined;
  let setupError: unknown;
  let secrets: string[] = [];
  try {
    const snapshot = clientConfig(context, config);
    secrets = Object.values(snapshot.credentials).filter(
      (value): value is string => !!value,
    );
    storage = createS3Storage(snapshot);
  } catch (error) {
    setupError = error;
  }
  try {
    const expired = !probe.expiresAt || Date.now() >= probe.expiresAt.getTime();
    for (const [index, method] of methods.entries()) {
      const result = results.find((item) => item.method === method);
      const passed =
        !expired &&
        !!result &&
        (result.responseType === 'cors' || result.responseType === 'basic') &&
        result.status >= 200 &&
        result.status < 300 &&
        !result.error;
      Object.assign(report.stages[index], {
        status: passed ? 'passed' : 'failed',
        evidence: result
          ? {
              method: result.method,
              status: result.status,
              responseType: result.responseType,
            }
          : undefined,
        ...(!passed
          ? {
              error: {
                code: expired
                  ? 'STORAGE_CORS_EXPIRED'
                  : 'STORAGE_CORS_BROWSER_FAILED',
                message: expired
                  ? '直传检测已到期'
                  : result?.error
                    ? stageError(new Error(result.error), secrets).message
                    : '直传检测失败，请检查 CORS 与浏览器网络',
              },
            }
          : {}),
      });
    }
    updateProbe(context, probeId, { report });
    try {
      if (!storage) throw setupError;
      const result = await storage.readObject(probe.key, {
        signal: AbortSignal.any([
          ...(signal ? [signal] : []),
          AbortSignal.timeout(30_000),
        ]),
      });
      const chunks: Buffer[] = [];
      let size = 0;
      try {
        for await (const chunk of result.stream) {
          size += chunk.length;
          if (size > Buffer.byteLength(payload))
            throw new Error('探测对象内容与样本不一致');
          chunks.push(Buffer.from(chunk));
        }
        if (!Buffer.concat(chunks).equals(Buffer.from(payload)))
          throw new Error('探测对象内容与样本不一致');
      } finally {
        result.stream.destroy();
      }
      report.stages[3] = {
        stage: 'verify',
        status: 'passed',
        evidence: { byteSize: size },
      };
      updateProbe(context, probeId, {
        objectState: 'stored',
        byteSize: size,
        confirmedAt: new Date(),
        report,
      });
    } catch (error) {
      report.stages[3] = {
        stage: 'verify',
        status: 'failed',
        error: stageError(error),
      };
    }
    updateProbe(context, probeId, { stage: 'delete', report });
    try {
      if (!storage) throw setupError;
      await storage.deleteObject(probe.key, {
        signal: AbortSignal.timeout(30_000),
      });
      report.cleanupPending = false;
      report.stages[4] = { stage: 'delete', status: 'passed' };
    } catch (error) {
      report.stages[4] = {
        stage: 'delete',
        status: 'failed',
        error: stageError(error),
      };
    }
    report.passed = report.stages.every((stage) => stage.status === 'passed');
    report.testedAt = new Date().toISOString();
    context.db.transaction(() => {
      saveCorsReport(context, report);
      if (!report.cleanupPending)
        context.db
          .delete(storageProbes)
          .where(eq(storageProbes.id, probeId))
          .run();
      else
        updateProbe(context, probeId, {
          state: 'cleanup',
          report,
          error: JSON.stringify(report.stages[4].error),
          cleanupAttempts: 1,
          nextCleanupAt: new Date(Date.now() + 60_000),
        });
    });
    return report;
  } finally {
    storage?.destroy();
  }
}
function interruptCorsProbes(context: ProbeContext, expiredOnly: boolean) {
  context.db.transaction(() => {
    const probes = context.db
      .select()
      .from(storageProbes)
      .where(
        and(
          eq(storageProbes.purpose, 'cors'),
          eq(storageProbes.state, 'running'),
          ...(expiredOnly
            ? [
                lte(storageProbes.expiresAt, new Date()),
                eq(storageProbes.stage, 'browser'),
              ]
            : []),
        ),
      )
      .all();
    for (const probe of probes) {
      const report = probe.report as CorsReport;
      report.passed = false;
      report.testedAt = new Date().toISOString();
      const pending = report.stages.find((stage) => stage.status === 'pending');
      if (pending)
        Object.assign(pending, {
          status: 'failed',
          error: {
            code: expiredOnly
              ? 'STORAGE_CORS_EXPIRED'
              : 'STORAGE_TEST_INTERRUPTED',
            message: expiredOnly
              ? '浏览器未在签名到期前完成直传检测'
              : '直传检测被进程重启中断',
          },
        });
      for (const stage of report.stages)
        if (stage.status === 'pending') stage.status = 'skipped';
      saveCorsReport(context, report);
      updateProbe(context, probe.id, {
        state: 'cleanup',
        stage: 'delete',
        report,
        nextCleanupAt: new Date(),
      });
    }
  });
}
export function expireCorsProbes(context: ProbeContext) {
  interruptCorsProbes(context, true);
}
export function recoverCorsProbes(context: ProbeContext) {
  interruptCorsProbes(context, false);
}
