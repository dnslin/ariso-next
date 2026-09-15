import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

function run(source: string, overrides: Partial<NodeJS.ProcessEnv> = {}) {
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
    import { join } from 'node:path';
    const startupUrl = ${JSON.stringify(startup.href)};
    const { startServer, getServerRuntime } = await import(startupUrl);
    const { register } = await import(${JSON.stringify(instrumentation.href)});
    const { GET } = await import(${JSON.stringify(health.href)});
    const databasePath = join(process.env.DATA_DIR, 'ariso.db');
    ${source}
  `,
    ],
    {
      env: { ...env, ...overrides },
      encoding: 'utf8',
      timeout: 10000,
    },
  );
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  expect(result.status, result.stderr).toBe(0);
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

  it('Node 初始化在无业务表的磁盘库执行 SELECT 1；重复调用及模块重载复用连接', () => {
    run(
      `
      await Promise.all([register(), register()]);
      const state = getServerRuntime();
      try {
        assert.equal(existsSync(databasePath), true);
        assert.equal(state.connection.db.$client.memory, false);
        assert.equal(state.connection.db.$client.name, databasePath);
        assert.deepEqual(state.connection.db.$client.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all(), []);
        assert.strictEqual(startServer(), state);
        const reloaded = await import(startupUrl + '?reload');
        assert.strictEqual(reloaded.startServer(), state);
        const response = GET();
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.deepEqual(await response.json(), { status: 'ok' });
      } finally { state.connection.close(); }
    `,
      { NEXT_RUNTIME: 'nodejs' },
    );
  });

  it('真实连接关闭后返回 503，保留错误日志，响应没有秘密或路径且不会自动重连', () => {
    const result = run(`
      const state = startServer();
      assert.equal(GET().status, 200);
      state.connection.close();
      const response = GET();
      assert.equal(response.status, 503);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(await response.text(), '{"status":"unavailable"}');
      assert.strictEqual(startServer(), state);
      assert.equal(state.connection.db.$client.open, false);
    `);
    expect(result.stdout).toContain('Database health check failed');
    expect(result.stdout).toContain('not open');
    expect(result.stdout).not.toContain(env.BETTER_AUTH_SECRET);
    expect(result.stdout).not.toContain(env.ARISO_ENCRYPTION_KEY);
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
      await register();
      getServerRuntime().connection.close();
    `,
      { NEXT_RUNTIME: 'nodejs' },
    );
  });
});
