import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  storageConfigs,
  storageProbes,
} from '../../../src/server/storage/schema.ts';
import { createSecretCrypto } from '../../../src/server/runtime/crypto.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import {
  createStorage,
  readStorage,
  updateStorage,
} from '../../../src/server/storage/settings.ts';
import { storageCreateInputSchema } from '../../../src/server/storage/validation.ts';
import { startStorageProbeRuntime } from '../../../src/server/storage/probe-runtime.ts';
import {
  readProbeReferences,
  readProbeUsage,
} from '../../../src/server/storage/probes.ts';

let directory: string;
let connection: ReturnType<typeof openRuntimeDatabase>;
let runtime: ReturnType<typeof startStorageProbeRuntime>;
let server: ReturnType<typeof createServer>;
let storageId: string;
let publicRead: boolean;
let deleteFails: boolean;
let corruptRead: boolean;
let holdWrite: boolean;
let releaseWrite: (() => void) | undefined;
const objects = new Map<string, Buffer>();
const secretCrypto = createSecretCrypto(Buffer.alloc(32, 37));
const context = () => ({ storageRoot: directory, secretCrypto });
const logger = { info() {}, error() {} };
beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'ariso-probes-'));
  connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  migrateRuntimeDatabase(connection.db, resolve('drizzle'));
  objects.clear();
  publicRead = false;
  deleteFails = false;
  corruptRead = false;
  holdWrite = false;
  releaseWrite = undefined;
  server = createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://localhost');
    res.setHeader('x-amz-request-id', 'probe-request');
    const error = (status: number, code: string) => {
      res.writeHead(status, { 'content-type': 'application/xml' });
      res.end(`<Error><Code>${code}</Code><Message>${code}</Message></Error>`);
    };
    if (url.searchParams.has('versioning'))
      return res.end('<VersioningConfiguration/>');
    if (url.searchParams.has('object-lock'))
      return error(404, 'ObjectLockConfigurationNotFoundError');
    if (req.method === 'PUT') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      objects.set(url.pathname, Buffer.concat(chunks));
      if (holdWrite)
        await new Promise<void>((resolve) => {
          releaseWrite = resolve;
        });
      res.end();
      return;
    }
    if (req.method === 'DELETE') {
      if (deleteFails) return error(403, 'AccessDenied');
      objects.delete(url.pathname);
      res.writeHead(204);
      res.end();
      return;
    }
    if (!req.headers.authorization && !publicRead)
      return error(403, 'AccessDenied');
    const data = objects.get(url.pathname);
    if (!data) return error(404, 'NoSuchKey');
    res.setHeader('content-length', data.length);
    res.end(corruptRead ? Buffer.alloc(data.length) : data);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as { port: number };
  storageId = createStorage(
    connection.db,
    storageCreateInputSchema.parse({
      type: 's3',
      name: 'probe',
      endpoint: `http://127.0.0.1:${address.port}`,
      region: 'us-east-1',
      bucket: 'test-bucket',
      forcePathStyle: true,
      accessKey: 'test-access',
      secretKey: 'test-secret',
    }),
    context(),
  ).id;
  runtime = startStorageProbeRuntime({
    db: connection.db,
    secretCrypto,
    logger,
  });
});
afterEach(async () => {
  releaseWrite?.();
  await runtime?.stop();
  server?.closeAllConnections();
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  connection?.close();
  rmSync(directory, { recursive: true, force: true });
});
it('真实四阶段通过后才允许启用，清理成功释放引用与占用', async () => {
  expect(() =>
    updateStorage(connection.db, storageId, { enabled: true }, context()),
  ).toThrow();
  const report = await runtime.test(storageId, {
    revision: 1,
  });
  expect(report.passed).toBe(true);
  expect(report.stages.map((stage) => stage.status)).toEqual(
    Array(5).fill('passed'),
  );
  expect(objects.size).toBe(0);
  expect(readProbeReferences(connection.db, storageId)).toEqual([]);
  expect(readProbeUsage(connection.db)).toEqual([]);
  expect(readStorage(connection.db, storageId)).toMatchObject({
    connectionStatus: 'passed',
    enabled: false,
  });
  expect(
    updateStorage(connection.db, storageId, { enabled: true }, context())
      .enabled,
  ).toBe(true);
});
it.each(['public', 'corrupt'] as const)(
  '%s 对象不通过且始终清理',
  async (failure) => {
    publicRead = failure === 'public';
    corruptRead = failure === 'corrupt';
    const report = await runtime.test(storageId, {
      revision: 1,
    });
    expect(report.passed).toBe(false);
    expect(
      report.stages.find((stage) => stage.status === 'failed')?.stage,
    ).toBe(failure === 'public' ? 'anonymous' : 'read');
    expect(objects.size).toBe(0);
    expect(readStorage(connection.db, storageId).connectionStatus).toBe(
      'failed',
    );
  },
);
it('删除失败保留确切 Key、已确认占用与错误，停用状态下可手动重试', async () => {
  deleteFails = true;
  const report = await runtime.test(storageId, {
    revision: 1,
  });
  expect(report.passed).toBe(false);
  expect(report.cleanupPending).toBe(true);
  expect(objects.size).toBe(1);
  expect(readProbeReferences(connection.db, storageId)).toHaveLength(1);
  expect(readProbeUsage(connection.db)).toMatchObject([
    { storageId, knownBytes: 64, unconfirmedObjects: 0 },
  ]);
  deleteFails = false;
  await runtime.retryCleanup(storageId, report.probeId);
  expect(objects.size).toBe(0);
  expect(readProbeReferences(connection.db, storageId)).toEqual([]);
  expect(readStorage(connection.db, storageId).connectionStatus).toBe('failed');
});

it('同配置并发测试冲突，写入未确认显示未知，改凭据后的旧回包不能覆盖新配置', async () => {
  holdWrite = true;
  const testing = runtime.test(storageId, { revision: 1 });
  await vi.waitFor(() => expect(releaseWrite).toBeTypeOf('function'));
  expect(() => runtime.test(storageId, { revision: 1 })).toThrow('正在执行');
  expect(readProbeUsage(connection.db)).toMatchObject([
    { knownBytes: 0, unconfirmedObjects: 1 },
  ]);
  updateStorage(
    connection.db,
    storageId,
    { secretKey: 'new-secret' },
    context(),
  );
  releaseWrite!();
  expect(await testing).toMatchObject({
    passed: false,
    stale: true,
    revision: 1,
  });
  expect(readStorage(connection.db, storageId)).toMatchObject({
    configRevision: 2,
    connectionStatus: 'untested',
    connectionReport: null,
    enabled: false,
  });
  expect(objects.size).toBe(0);
  await expect(runtime.test(storageId, { revision: 1 })).rejects.toMatchObject({
    code: 'STORAGE_TEST_STALE',
  });
});
it('取消在途 PUT 后先结束本地请求，再删除确切 Key，释放探测引用', async () => {
  holdWrite = true;
  const controller = new AbortController();
  const testing = runtime.test(storageId, { revision: 1 }, controller.signal);
  await vi.waitFor(() => expect(releaseWrite).toBeTypeOf('function'));
  controller.abort(new Error('caller disconnected'));
  const report = await testing;
  releaseWrite!();
  expect(report).toMatchObject({ passed: false, cleanupPending: false });
  expect(report.stages.find((stage) => stage.stage === 'write')?.status).toBe(
    'failed',
  );
  expect(objects.size).toBe(0);
  expect(readProbeReferences(connection.db, storageId)).toEqual([]);
});
it('已通过且启用的配置再次测试失败会停用，并保留默认以外配置身份', async () => {
  await runtime.test(storageId, { revision: 1 });
  updateStorage(connection.db, storageId, { enabled: true }, context());
  publicRead = true;
  await runtime.test(storageId, { revision: 1 });
  expect(readStorage(connection.db, storageId)).toMatchObject({
    id: storageId,
    enabled: false,
    connectionStatus: 'failed',
  });
});
it('重启恢复被打断探测为失败，保留已知对象占用直到远端删除成功', async () => {
  deleteFails = true;
  const report = await runtime.test(storageId, { revision: 1 });
  await runtime.stop();
  connection.db
    .update(storageProbes)
    .set({ state: 'running', stage: 'read', cleanupAttempts: 0 })
    .where(eq(storageProbes.id, report.probeId))
    .run();
  connection.close();
  connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  runtime = startStorageProbeRuntime({
    db: connection.db,
    secretCrypto,
    logger,
  });
  await vi.waitFor(() =>
    expect(
      connection.db.select().from(storageProbes).get()?.cleanupAttempts,
    ).toBe(1),
  );
  expect(
    readStorage(connection.db, storageId).connectionReport?.stages.find(
      (stage) => stage.stage === 'read',
    )?.error?.code,
  ).toBe('STORAGE_TEST_INTERRUPTED');
  expect(readProbeUsage(connection.db)).toMatchObject([
    { knownBytes: 64, unconfirmedObjects: 0 },
  ]);
  deleteFails = false;
  await runtime.retryCleanup(storageId, report.probeId);
  expect(objects.size).toBe(0);
  expect(readProbeUsage(connection.db)).toEqual([]);
});
it('自动清理最多三次，重启不重置次数；手动重试可恢复且不把测试改成通过', async () => {
  deleteFails = true;
  const report = await runtime.test(storageId, { revision: 1 });
  for (const attempts of [2, 3]) {
    await runtime.stop();
    connection.db
      .update(storageProbes)
      .set({ nextCleanupAt: new Date(0) })
      .where(eq(storageProbes.id, report.probeId))
      .run();
    runtime = startStorageProbeRuntime({
      db: connection.db,
      secretCrypto,
      logger,
    });
    await vi.waitFor(() =>
      expect(
        connection.db.select().from(storageProbes).get()?.cleanupAttempts,
      ).toBe(attempts),
    );
  }
  expect(
    connection.db.select().from(storageProbes).get()?.nextCleanupAt,
  ).toBeNull();
  await runtime.stop();
  runtime = startStorageProbeRuntime({
    db: connection.db,
    secretCrypto,
    logger,
  });
  expect(
    connection.db.select().from(storageProbes).get()?.cleanupAttempts,
  ).toBe(3);
  deleteFails = false;
  await runtime.retryCleanup(storageId, report.probeId);
  expect(readStorage(connection.db, storageId)).toMatchObject({
    connectionStatus: 'failed',
    connectionReport: { cleanupPending: false },
  });
});
it('旧失败探测清理不能覆盖后续成功报告，不同 probe 责任各自保留', async () => {
  deleteFails = true;
  const old = await runtime.test(storageId, { revision: 1 });
  deleteFails = false;
  const current = await runtime.test(storageId, { revision: 1 });
  expect(current.passed).toBe(true);
  expect(objects.size).toBe(1);
  await runtime.retryCleanup(storageId, old.probeId);
  expect(readStorage(connection.db, storageId).connectionReport?.probeId).toBe(
    current.probeId,
  );
  expect(readStorage(connection.db, storageId).connectionStatus).toBe('passed');
});
it('planned 不冒充占用，writing 不补零；读取用量不发网络且按存储汇总', async () => {
  deleteFails = true;
  const report = await runtime.test(storageId, { revision: 1 });
  connection.db
    .update(storageProbes)
    .set({ objectState: 'planned', byteSize: null, confirmedAt: null })
    .where(eq(storageProbes.id, report.probeId))
    .run();
  expect(readProbeUsage(connection.db)).toMatchObject([
    { storageId, knownBytes: 0, unconfirmedObjects: 0, confirmedAt: null },
  ]);
  connection.db
    .update(storageProbes)
    .set({ objectState: 'writing' })
    .where(eq(storageProbes.id, report.probeId))
    .run();
  expect(readProbeUsage(connection.db)).toMatchObject([
    { storageId, knownBytes: 0, unconfirmedObjects: 1 },
  ]);
  expect(() =>
    connection.db
      .delete(storageConfigs)
      .where(eq(storageConfigs.id, storageId))
      .run(),
  ).toThrow();
  deleteFails = false;
  await runtime.retryCleanup(storageId, report.probeId);
});

it('真实子进程 SIGKILL 后新 runtime 恢复确切 Key，不把未完成的测试判通过', async () => {
  await runtime.stop();
  holdWrite = true;
  const child = spawn(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import { openRuntimeDatabase } from './src/server/runtime/db.ts';
    import { createSecretCrypto } from './src/server/runtime/crypto.ts';
    import { startStorageProbeRuntime } from './src/server/storage/probe-runtime.ts';
    const connection = openRuntimeDatabase(process.env.PROBE_DATABASE);
    const runtime = startStorageProbeRuntime({ db: connection.db, secretCrypto: createSecretCrypto(Buffer.alloc(32, 37)), logger: { info() {}, error() {} } });
    await runtime.test(process.env.PROBE_STORAGE, { revision: 1 });
  `,
    ],
    {
      cwd: resolve('.'),
      env: {
        ...process.env,
        PROBE_DATABASE: join(directory, 'ariso.db'),
        PROBE_STORAGE: storageId,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const exited = once(child, 'exit');
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  try {
    await vi.waitFor(
      () => {
        expect(child.exitCode, stderr).toBeNull();
        expect(releaseWrite).toBeTypeOf('function');
      },
      { timeout: 10000 },
    );
    expect(readProbeUsage(connection.db)).toMatchObject([
      { knownBytes: 0, unconfirmedObjects: 1 },
    ]);
    child.kill('SIGKILL');
    await exited;
    runtime = startStorageProbeRuntime({
      db: connection.db,
      secretCrypto,
      logger,
    });
    await vi.waitFor(() =>
      expect(readProbeReferences(connection.db, storageId)).toEqual([]),
    );
    expect(objects.size).toBe(0);
    expect(readStorage(connection.db, storageId)).toMatchObject({
      connectionStatus: 'failed',
      enabled: false,
      connectionReport: { passed: false, cleanupPending: false },
    });
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
      await exited;
    }
    releaseWrite?.();
  }
}, 15000);
