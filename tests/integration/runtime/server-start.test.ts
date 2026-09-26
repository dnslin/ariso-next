import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let directory: string;
let env: NodeJS.ProcessEnv;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'ariso-server-start-'));
  env = {
    NODE_ENV: 'test',
    DATA_DIR: directory,
    BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
    ARISO_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
  };
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));

function run(
  source: string,
  overrides: Partial<NodeJS.ProcessEnv> = {},
  expectedStatus = 0,
) {
  const startup = new URL(
    '../../../src/server/startup/server-start.ts',
    import.meta.url,
  );
  const instrumentation = new URL(
    '../../../src/instrumentation.ts',
    import.meta.url,
  );
  const health = new URL(
    '../../../src/app/api/health/route.ts',
    import.meta.url,
  );
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import assert from 'node:assert/strict';
    import { existsSync } from 'node:fs';
    import { join, resolve } from 'node:path';
    const startupUrl = ${JSON.stringify(startup.href)};
    const { startServer, getServerRuntime } = await import(startupUrl);
    const { register } = await import(${JSON.stringify(instrumentation.href)});
    const { GET } = await import(${JSON.stringify(health.href)});
    const databasePath = join(process.env.DATA_DIR, 'ariso.db');
    async function prepare() {
      const { runPreflight } = await import(${JSON.stringify(new URL('../../../src/server/startup/preflight.ts', import.meta.url).href)});
      runPreflight();
    }
    ${source}
  `,
    ],
    {
      env: { ...env, ...overrides },
      encoding: 'utf8',
      timeout: 10000,
      cwd: resolve('.'),
    },
  );
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  expect(result.status, result.stderr).toBe(expectedStatus);
  return result;
}

describe('Web startup and real health handler', () => {
  it.each([
    { NEXT_RUNTIME: 'edge' },
    { NEXT_RUNTIME: undefined },
    { NEXT_RUNTIME: 'nodejs', NEXT_PHASE: 'phase-production-build' },
  ])('导入和非 Web 初始化不读密钥或建立数据库：%j', (mode) => {
    run(
      `
      assert.equal(existsSync(databasePath), false);
      await register();
      assert.equal(existsSync(databasePath), false);
      assert.throws(getServerRuntime, /not been initialized/);
    `,
      {
        ...mode,
        BETTER_AUTH_SECRET: undefined,
        ARISO_ENCRYPTION_KEY: undefined,
      },
    );
  });

  it('初始化缺失时健康接口返回 503，不按请求偷偷打开数据库', () => {
    run(`
      const response = GET();
      assert.equal(response.status, 503);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.deepEqual(await response.json(), { status: 'unavailable' });
      assert.equal(existsSync(databasePath), false);
    `);
  });

  it('Node 初始化在已迁移无所有者的磁盘库执行 SELECT 1；重复调用及模块重载复用连接', () => {
    run(
      `
      await prepare();
      await Promise.all([register(), register()]);
      const state = getServerRuntime();
      try {
        assert.equal(existsSync(databasePath), true);
        assert.equal(state.connection.db.$client.memory, false);
        assert.equal(state.connection.db.$client.name, databasePath);
        assert.equal(state.connection.db.$client.prepare("SELECT count(*) AS count FROM user").get().count, 0);
        state.connection.db.$client.exec('CREATE TEMP TABLE connection_marker (value TEXT)');
        state.connection.db.$client.prepare('INSERT INTO connection_marker VALUES (?)').run('preserved');
        assert.strictEqual(startServer(), state);
        assert.strictEqual(startServer().mediaQueue, state.mediaQueue);
        const reloaded = await import(startupUrl + '?reload');
        assert.strictEqual(reloaded.startServer(), state);
        assert.strictEqual(reloaded.startServer().mediaQueue, state.mediaQueue);
        assert.deepEqual(reloaded.getServerRuntime().connection.db.$client.prepare('SELECT value FROM connection_marker').all(), [{ value: 'preserved' }]);
        await register();
        process.stdout.write('finite initialization completed\\n');
        const response = GET();
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.deepEqual(await response.json(), { status: 'ok' });
      } finally { await state.stop(); }
    `,
      { NEXT_RUNTIME: 'nodejs' },
    );
  });

  it('真实连接关闭后返回 503，保留错误日志，响应没有秘密或路径且不会自动重连', () => {
    const result = run(`
      await prepare();
      const state = startServer();
      assert.equal(GET().status, 200);
      state.connection.close();
      const response = GET();
      assert.equal(response.status, 503);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(await response.text(), '{"status":"unavailable"}');
      assert.strictEqual(startServer(), state);
      assert.equal(state.connection.db.$client.open, false);
      await new Promise(resolve => setTimeout(resolve, 300));
      await state.mediaQueue.stop();
    `);
    expect(result.stdout).toContain('Database health check failed');
    expect(result.stdout).toContain('not open');
    expect(result.stdout).not.toContain(env.BETTER_AUTH_SECRET);
    expect(result.stdout).not.toContain(env.ARISO_ENCRYPTION_KEY);
    expect(result.stdout).not.toContain('Media queue stopped after an error');
  });

  it('初始化失败向上传播，不保存失败状态，修复配置后可以重试', () => {
    run(
      `
      const secret = process.env.BETTER_AUTH_SECRET;
      delete process.env.BETTER_AUTH_SECRET;
      await assert.rejects(register, /BETTER_AUTH_SECRET/);
      assert.throws(getServerRuntime, /not been initialized/);
      assert.equal(existsSync(databasePath), false);
      process.env.BETTER_AUTH_SECRET = secret;
      await prepare();
      await register();
      await getServerRuntime().stop();
    `,
      { NEXT_RUNTIME: 'nodejs' },
    );
  });
});

describe('Web shutdown ownership', () => {
  it('停止幂等，队列完成前保留连接，停止后健康接口拒绝新访问', () => {
    run(`
      await prepare();
      const state = startServer();
      const originalStop = state.mediaQueue.stop.bind(state.mediaQueue);
      let finish;
      let calls = 0;
      state.mediaQueue.stop = async () => {
        calls += 1;
        await originalStop();
        await new Promise(resolve => { finish = resolve; });
      };
      const originalUploadStop = state.uploads.stop.bind(state.uploads);
      let finishUploads;
      state.uploads.stop = async () => {
        await originalUploadStop();
        await new Promise(resolve => { finishUploads = resolve; });
      };
      let flushCalls = 0;
      const analyticsStop = state.analytics.stop.bind(state.analytics);
      state.analytics.stop = () => {
        flushCalls += 1;
        assert.equal(state.connection.db.$client.open, true);
        return analyticsStop();
      };
      const stopping = state.stop();
      assert.strictEqual(state.stop(), stopping);
      assert.equal(calls, 0);
      assert.equal(state.connection.db.$client.open, true);
      assert.throws(getServerRuntime, /stopping/);
      assert.equal(GET().status, 503);
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(calls, 0);
      assert.equal(state.connection.db.$client.open, true);
      finishUploads();
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(calls, 1);
      assert.equal(flushCalls, 0);
      finish();
      await stopping;
      assert.equal(flushCalls, 1);
      assert.equal(state.connection.db.$client.open, false);
    `);
  });

  it('Next close hook waits for framework cleanup, preserves this, and stops the application once', () => {
    run(`
      await prepare();
      const state = startServer();
      const { createRequire } = await import('node:module');
      const require = createRequire(startupUrl);
      const NextServer = require('next/dist/server/next-server.js').default;
      const instance = Object.create(NextServer.prototype);
      let finishFramework;
      NextServer.prototype.close = async function () {
        assert.strictEqual(this, instance);
        await new Promise(resolve => { finishFramework = resolve; });
      };
      const before = ['SIGTERM', 'SIGINT'].map(signal => process.listenerCount(signal));
      await import(${JSON.stringify(new URL('../../../src/cli/shutdown.ts', import.meta.url).href)});
      assert.deepEqual(['SIGTERM', 'SIGINT'].map(signal => process.listenerCount(signal)), before);
      const stopping = instance.close();
      await new Promise(resolve => setTimeout(resolve, 40));
      assert.equal(state.stopping, false);
      assert.equal(state.connection.db.$client.open, true);
      let flushed = false;
      const analyticsStop = state.analytics.stop.bind(state.analytics);
      state.analytics.stop = () => {
        assert.equal(state.connection.db.$client.open, true);
        flushed = true;
        return analyticsStop();
      };
      finishFramework();
      await stopping;
      assert.equal(flushed, true);
      assert.equal(state.connection.db.$client.open, false);
      assert.strictEqual(state.stop(), state.stop());
    `);
  });

  it('框架与应用同时清理失败时仍记录框架原因', () => {
    const result = run(`
      await prepare();
      const state = startServer();
      const { createRequire } = await import('node:module');
      const require = createRequire(startupUrl);
      const NextServer = require('next/dist/server/next-server.js').default;
      NextServer.prototype.close = async () => { throw new Error('framework close failure'); };
      await import(${JSON.stringify(new URL('../../../src/cli/shutdown.ts', import.meta.url).href)});
      const originalStop = state.stop.bind(state);
      state.stop = async () => { await originalStop(); throw new Error('application close failure'); };
      await assert.rejects(Object.create(NextServer.prototype).close(), /application close failure/);
      assert.equal(state.connection.db.$client.open, false);
    `);
    expect(result.stderr).toContain('framework close failure');
  });

  it('队列停止失败仍清理统计和数据库，并保留原始错误', () => {
    const result = run(`
      await prepare();
      const state = startServer();
      const stop = state.mediaQueue.stop.bind(state.mediaQueue);
      state.mediaQueue.stop = async () => { await stop(); throw new Error('stop failure evidence'); };
      let flushed = false;
      const analyticsStop = state.analytics.stop.bind(state.analytics);
      state.analytics.stop = () => { flushed = true; return analyticsStop(); };
      await assert.rejects(state.stop(), /stop failure evidence/);
      assert.equal(flushed, true);
      assert.equal(state.connection.db.$client.open, false);
    `);
    expect(result.stdout).not.toContain('analytics flushed, database closed');
  });

  it('统计刷写失败仍关闭数据库，不报告成功', () => {
    const result = run(`
      await prepare();
      const state = startServer();
      const analyticsStop = state.analytics.stop.bind(state.analytics);
      state.analytics.stop = () => { analyticsStop(); return false; };
      await assert.rejects(state.stop(), /Analytics shutdown flush did not complete/);
      assert.equal(state.connection.db.$client.open, false);
    `);
    expect(result.stdout).not.toContain('analytics flushed, database closed');
  });
});
