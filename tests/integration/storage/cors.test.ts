import { startStorageProbeRuntime } from '../../../src/server/storage/probe-runtime.ts';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import { createSecretCrypto } from '../../../src/server/runtime/crypto.ts';
import {
  createStorage,
  readStorage,
  updateStorage,
} from '../../../src/server/storage/settings.ts';
import { storageCreateInputSchema } from '../../../src/server/storage/validation.ts';
import {
  storageConfigs,
  storageProbes,
} from '../../../src/server/storage/schema.ts';
import {
  initializeSiteSettings,
  updateSiteSettings,
  requireSiteSettings,
} from '../../../src/server/site/settings.ts';
import {
  createCorsTest,
  finishCorsTest,
  readCorsTestState,
  invalidateS3Cors,
  expireCorsProbes,
  recoverCorsProbes,
} from '../../../src/server/storage/cors.ts';
import {
  readProbeReferences,
  cleanupProbe,
} from '../../../src/server/storage/probes.ts';
import type {
  CorsTestSession,
  CorsBrowserResult,
} from '../../../src/server/storage/cors-types.ts';

let directory: string;
let connection: ReturnType<typeof openRuntimeDatabase>;
let server: ReturnType<typeof createServer>;
let storageId: string;
let deleteFails = false;
const objects = new Map<string, Buffer>();
const secretCrypto = createSecretCrypto(Buffer.alloc(32, 37));
const origin = 'https://ariso.example.com';
const context = () => ({ db: connection.db, secretCrypto });
const success: CorsBrowserResult[] = ['PUT', 'GET', 'HEAD'].map((method) => ({
  method: method as CorsBrowserResult['method'],
  status: 200,
  responseType: 'cors',
}));
beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'ariso-cors-'));
  connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  migrateRuntimeDatabase(connection.db, resolve('drizzle'));
  connection.db.transaction((tx) =>
    initializeSiteSettings(tx, { publicUrl: origin, timeZone: 'UTC' }),
  );
  objects.clear();
  deleteFails = false;
  server = createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://localhost');
    const fail = (status: number, code: string) => {
      res.writeHead(status, { 'content-type': 'application/xml' });
      res.end(`<Error><Code>${code}</Code></Error>`);
    };
    if (req.method === 'PUT') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      objects.set(url.pathname, Buffer.concat(chunks));
      return res.end();
    }
    if (req.method === 'DELETE') {
      if (deleteFails) return fail(403, 'AccessDenied');
      objects.delete(url.pathname);
      res.writeHead(204);
      return res.end();
    }
    const data = objects.get(url.pathname);
    if (!data) return fail(404, 'NoSuchKey');
    res.setHeader('content-length', data.length);
    res.end(req.method === 'HEAD' ? undefined : data);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  storageId = createStorage(
    connection.db,
    storageCreateInputSchema.parse({
      type: 's3',
      name: 'cors',
      endpoint: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
      region: 'us-east-1',
      bucket: 'test-bucket',
      forcePathStyle: true,
      accessKey: 'test-access',
      secretKey: 'test-secret',
    }),
    { storageRoot: directory, secretCrypto },
  ).id;
  connection.db
    .update(storageConfigs)
    .set({ connectionStatus: 'passed', connectionRevision: 1, enabled: true })
    .where(eq(storageConfigs.id, storageId))
    .run();
});
afterEach(async () => {
  server?.closeAllConnections();
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  connection?.close();
  rmSync(directory, { recursive: true, force: true });
});
async function upload(session: CorsTestSession, payload = session.payload) {
  const response = await fetch(session.upload.url, {
    method: 'PUT',
    headers: session.upload.headers,
    body: payload,
  });
  expect(response.ok).toBe(true);
}
const start = () => createCorsTest(context(), storageId, 1, origin);
it('与正式签名共用 headers，三步浏览器结果、服务器内容与删除全部成功才通过', async () => {
  const session = await start();
  expect(session.upload.headers).toEqual({
    'content-type': 'application/octet-stream',
  });
  expect(
    new URL(session.upload.url).searchParams.get('X-Amz-SignedHeaders'),
  ).toContain('content-type');
  expect(session.head.method).toBe('HEAD');
  expect(readProbeReferences(connection.db, storageId)).toHaveLength(1);
  await upload(session);
  const report = await finishCorsTest(
    context(),
    storageId,
    session.probeId,
    origin,
    success,
  );
  expect(report).toMatchObject({
    passed: true,
    stale: false,
    cleanupPending: false,
  });
  expect(report.stages.every((stage) => stage.status === 'passed')).toBe(true);
  expect(objects.size).toBe(0);
  expect(readProbeReferences(connection.db, storageId)).toEqual([]);
  expect(readStorage(connection.db, storageId)).toMatchObject({
    corsStatus: 'passed',
    enabled: true,
  });
  expect(readCorsTestState(connection.db, storageId).example).toEqual([
    {
      AllowedOrigins: [origin],
      AllowedMethods: ['PUT', 'GET', 'HEAD'],
      AllowedHeaders: ['content-type'],
    },
  ]);
});
it.each(['opaque', 'error', 'missing', 'http', 'corrupt'] as const)(
  '%s 不能通过，也不会停用已启用存储，且精确清理',
  async (failure) => {
    const session = await start();
    await upload(session, failure === 'corrupt' ? 'corrupt' : session.payload);
    const results = success.map((result) => ({ ...result }));
    if (failure === 'opaque' || failure === 'error')
      results[0].responseType = failure;
    if (failure === 'http') results[0].status = 403;
    if (failure === 'missing') results.pop();
    const report = await finishCorsTest(
      context(),
      storageId,
      session.probeId,
      origin,
      results,
    );
    expect(report.passed).toBe(false);
    expect(report.cleanupPending).toBe(false);
    expect(objects.size).toBe(0);
    expect(readStorage(connection.db, storageId)).toMatchObject({
      enabled: true,
      corsStatus: 'failed',
      connectionStatus: 'passed',
    });
  },
);
it('错误来源不能创建或完成 passed，活动对象仍保留清理引用', async () => {
  await expect(
    createCorsTest(context(), storageId, 1, 'https://wrong.example.com'),
  ).rejects.toMatchObject({ code: 'STORAGE_CORS_ORIGIN_MISMATCH' });
  expect(readProbeReferences(connection.db, storageId)).toEqual([]);
  const session = await start();
  await upload(session);
  await expect(
    finishCorsTest(
      context(),
      storageId,
      session.probeId,
      'https://wrong.example.com',
      success,
    ),
  ).rejects.toMatchObject({ code: 'STORAGE_CORS_ORIGIN_MISMATCH' });
  expect(readStorage(connection.db, storageId).corsStatus).toBe('untested');
  expect(readProbeReferences(connection.db, storageId)).toHaveLength(1);
});
it('同配置不能重复开始；已结束探测不能重复完成', async () => {
  const session = await start();
  await expect(start()).rejects.toMatchObject({ code: 'STORAGE_IN_USE' });
  await upload(session);
  await finishCorsTest(context(), storageId, session.probeId, origin, success);
  await expect(
    finishCorsTest(context(), storageId, session.probeId, origin, success),
  ).rejects.toMatchObject({ code: 'STORAGE_NOT_FOUND' });
});
it('site 与全部 S3 失效同事务，失败回滚；A→B→A 旧回包不能恢复通过', async () => {
  const second = createStorage(
    connection.db,
    storageCreateInputSchema.parse({
      type: 's3',
      name: 'second',
      endpoint: 'https://s3.example.com',
      region: 'us-east-1',
      bucket: 'second',
    }),
    { storageRoot: directory, secretCrypto },
  );
  const session = await start();
  await upload(session);
  expect(() =>
    connection.db.transaction((tx) => {
      updateSiteSettings(tx, {
        publicUrl: 'https://changed.example.com',
        timeZone: 'UTC',
      });
      invalidateS3Cors(tx);
      throw new Error('rollback');
    }),
  ).toThrow('rollback');
  expect(requireSiteSettings(connection.db).publicUrl).toBe(origin);
  expect(readStorage(connection.db, storageId).corsStatus).toBe('untested');
  expect(
    readCorsTestState(connection.db, storageId).probes[0].invalidated,
  ).toBe(false);
  for (const publicUrl of ['https://changed.example.com', origin])
    connection.db.transaction((tx) => {
      updateSiteSettings(tx, { publicUrl, timeZone: 'UTC' });
      invalidateS3Cors(tx);
    });
  expect(readStorage(connection.db, second.id).corsStatus).toBe('invalidated');
  const report = await finishCorsTest(
    context(),
    storageId,
    session.probeId,
    origin,
    success,
  );
  expect(report).toMatchObject({
    passed: false,
    stale: true,
    cleanupPending: false,
  });
  expect(readStorage(connection.db, storageId).corsStatus).toBe('invalidated');
  expect(objects.size).toBe(0);
});
it('配置 revision 变化拒绝旧结果，改名不失效', async () => {
  const session = await start();
  await upload(session);
  updateStorage(
    connection.db,
    storageId,
    { name: 'renamed' },
    { storageRoot: directory, secretCrypto },
  );
  expect(readStorage(connection.db, storageId).configRevision).toBe(1);
  updateStorage(
    connection.db,
    storageId,
    { secretKey: 'changed' },
    { storageRoot: directory, secretCrypto },
  );
  const report = await finishCorsTest(
    context(),
    storageId,
    session.probeId,
    origin,
    success,
  );
  expect(report).toMatchObject({ passed: false, stale: true });
  expect(readStorage(connection.db, storageId).corsStatus).toBe('invalidated');
});
it('删除失败保留引用，重试成功不把失败结论改成 passed', async () => {
  const session = await start();
  await upload(session);
  deleteFails = true;
  expect(
    await finishCorsTest(
      context(),
      storageId,
      session.probeId,
      origin,
      success,
    ),
  ).toMatchObject({ passed: false, cleanupPending: true });
  expect(readProbeReferences(connection.db, storageId)).toHaveLength(1);
  expect(objects.size).toBe(1);
  deleteFails = false;
  await cleanupProbe(
    context(),
    connection.db.select().from(storageProbes).get()!,
  );
  expect(readProbeReferences(connection.db, storageId)).toEqual([]);
  expect(readStorage(connection.db, storageId)).toMatchObject({
    corsStatus: 'failed',
    corsReport: { cleanupPending: false },
  });
  expect(objects.size).toBe(0);
});
it.each(['expire', 'restart'] as const)(
  '浏览器未完成时 %s 生成持久失败并清理；有效 PUT 地址不继续锁引用',
  async (mode) => {
    const session = await start();
    await upload(session);
    if (mode === 'expire') {
      connection.db
        .update(storageProbes)
        .set({ expiresAt: new Date(0) })
        .run();
      expireCorsProbes(context());
    } else recoverCorsProbes(context());
    expect(readStorage(connection.db, storageId).corsStatus).toBe('failed');
    const probe = connection.db.select().from(storageProbes).get()!;
    expect(probe.state).toBe('cleanup');
    await cleanupProbe(context(), probe);
    expect(readProbeReferences(connection.db, storageId)).toEqual([]);
    expect(objects.size).toBe(0);
    expect(Date.parse(session.upload.expiresAt)).toBeGreaterThan(Date.now());
  },
);
it('在到期边界收到浏览器成功也只记录失败并清理', async () => {
  const session = await start();
  await upload(session);
  connection.db
    .update(storageProbes)
    .set({ expiresAt: new Date(0) })
    .run();
  expect(
    await finishCorsTest(
      context(),
      storageId,
      session.probeId,
      origin,
      success,
    ),
  ).toMatchObject({ passed: false, cleanupPending: false });
  expect(objects.size).toBe(0);
});
it('检测期间清空凭据仍终结探测并保留明确的清理失败，恢复凭据后可重试', async () => {
  const session = await start();
  await upload(session);
  updateStorage(
    connection.db,
    storageId,
    { secretKey: null },
    { storageRoot: directory, secretCrypto },
  );
  const report = await finishCorsTest(
    context(),
    storageId,
    session.probeId,
    origin,
    success,
  );
  expect(report).toMatchObject({
    passed: false,
    stale: true,
    cleanupPending: true,
  });
  expect(readProbeReferences(connection.db, storageId)).toMatchObject([
    { state: 'cleanup' },
  ]);
  updateStorage(
    connection.db,
    storageId,
    { secretKey: 'test-secret' },
    { storageRoot: directory, secretCrypto },
  );
  await cleanupProbe(
    context(),
    connection.db.select().from(storageProbes).get()!,
  );
  expect(objects.size).toBe(0);
});
it('旧失败对象清理不能覆盖后续成功报告', async () => {
  const old = await start();
  await upload(old);
  deleteFails = true;
  await finishCorsTest(context(), storageId, old.probeId, origin, success);
  const oldProbe = connection.db.select().from(storageProbes).get()!;
  deleteFails = false;
  const current = await start();
  await upload(current);
  expect(
    await finishCorsTest(
      context(),
      storageId,
      current.probeId,
      origin,
      success,
    ),
  ).toMatchObject({ passed: true });
  await cleanupProbe(context(), oldProbe);
  expect(readStorage(connection.db, storageId)).toMatchObject({
    corsStatus: 'passed',
    corsReport: {
      probeId: current.probeId,
      passed: true,
      cleanupPending: false,
    },
  });
  expect(objects.size).toBe(0);
});
it('浏览器声称成功但对象不存在时不可通过，删除不存在的确切 Key 后释放引用', async () => {
  const session = await start();
  const report = await finishCorsTest(
    context(),
    storageId,
    session.probeId,
    origin,
    success,
  );
  expect(report).toMatchObject({ passed: false, cleanupPending: false });
  expect(report.stages.find((stage) => stage.stage === 'verify')).toMatchObject(
    { status: 'failed' },
  );
  expect(readProbeReferences(connection.db, storageId)).toEqual([]);
});
it('错误详情隐藏签名地址和当前凭据，但保留网络诊断文本', async () => {
  const session = await start();
  const report = await finishCorsTest(
    context(),
    storageId,
    session.probeId,
    origin,
    [
      {
        method: 'PUT',
        status: 0,
        responseType: 'error',
        error: `Failed to fetch ${session.upload.url} test-secret test-access`,
      },
    ],
  );
  const serialized = JSON.stringify(report);
  expect(serialized).not.toContain(session.upload.url);
  expect(serialized).not.toContain('test-secret');
  expect(serialized).not.toContain('test-access');
  expect(serialized).toContain('Failed to fetch');
});
it('运行时重启实际恢复 CORS 探测，后台删除失败保留错误，既有手动重试入口可恢复', async () => {
  let runtime = startStorageProbeRuntime({
    ...context(),
    logger: { info() {}, error() {} },
  });
  try {
    const session = await runtime.startCors(storageId, 1, origin);
    await upload(session);
    await runtime.stop();
    deleteFails = true;
    runtime = startStorageProbeRuntime({
      ...context(),
      logger: { info() {}, error() {} },
    });
    await vi.waitFor(() =>
      expect(
        connection.db.select().from(storageProbes).get()?.cleanupAttempts,
      ).toBe(1),
    );
    expect(readCorsTestState(connection.db, storageId)).toMatchObject({
      status: 'failed',
      report: { passed: false, cleanupPending: true },
      probes: [{ state: 'cleanup' }],
    });
    deleteFails = false;
    await runtime.retryCleanup(storageId, session.probeId);
    expect(objects.size).toBe(0);
    expect(readCorsTestState(connection.db, storageId)).toMatchObject({
      status: 'failed',
      report: { passed: false, cleanupPending: false },
      probes: [],
    });
  } finally {
    await runtime.stop();
  }
});
