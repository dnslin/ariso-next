import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { cp, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { launch, stop, unusedPort } from './process-helpers';

// 同一期限覆盖响应头与正文，超时后让调用方进入 finally 清理进程。
async function requestHealth(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
  return { response, body: await response.text() };
}

let directory: string;
let app: string;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ariso-health-'));
  app = join(directory, 'app');
  await cp(resolve('.next/standalone'), app, {
    recursive: true,
    verbatimSymlinks: true,
  });
}, 30000);
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

it('未初始化的隔离生产产物返回 200 / no-store，健康检查不发起外部连接', async () => {
  // Node 内置诊断通道观察客户端 TCP 连接，不拦截或替换实际请求。
  const observer = `import { channel } from 'node:diagnostics_channel';
    channel('net.client.socket').subscribe(() => console.log('health-test-outbound'));
    console.log('health-test-observer-ready');`;
  const run = await launch(app, directory, {
    NODE_OPTIONS: `--no-experimental-strip-types --import=data:text/javascript,${encodeURIComponent(observer)}`,
  });
  try {
    await expect
      .poll(() => run.logs(), { timeout: 15000 })
      .toContain('Ready in');
    const db = new Database(join(directory, `data-${run.port}`, 'ariso.db'));
    try {
      expect(
        db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations'",
          )
          .all(),
      ).toEqual([{ name: 'site_settings' }]);
      expect(db.prepare('SELECT * FROM site_settings').all()).toEqual([]);
    } finally {
      db.close();
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      const { response, body } = await requestHealth(
        `http://127.0.0.1:${run.port}/api/health`,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(body).toBe('{"status":"ok"}');
    }
    const files = await readdir(app, { recursive: true });
    expect(files).not.toContain('tests');
    expect(files.some((file) => file.includes('health-failure'))).toBe(false);
  } finally {
    await stop(run.child, run.closed);
  }
  expect(run.logs()).toContain('health-test-observer-ready');
  expect(run.logs()).not.toContain('health-test-outbound');
}, 30000);

it.each(['close-database', 'stall-headers', 'stall-body'] as const)(
  '%s：实际 HTTP 故障可诊断或及时取消，并清理子进程',
  async (fault) => {
    const port = await unusedPort();
    const secret = randomBytes(32).toString('hex');
    const key = randomBytes(32).toString('hex');
    const dataDir = await mkdtemp(join(directory, 'fault-'));
    const child = spawn(
      process.execPath,
      [resolve('tests/fixtures/runtime/health-failure.ts')],
      {
        cwd: directory,
        env: {
          NODE_ENV: 'test',
          DATA_DIR: dataDir,
          PORT: String(port),
          BETTER_AUTH_SECRET: secret,
          ARISO_ENCRYPTION_KEY: key,
        },
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      },
    );
    assert(child.stdout && child.stderr);
    let logs = '';
    child.stdout.on('data', (chunk) => {
      logs += chunk;
    });
    child.stderr.on('data', (chunk) => {
      logs += chunk;
    });
    const closed = once(child, 'close');
    try {
      const url = `http://127.0.0.1:${port}/api/health`;
      await expect
        .poll(
          async () => {
            if (child.exitCode !== null) throw new Error(logs);
            try {
              return (await requestHealth(url)).response.status;
            } catch {
              return 0;
            }
          },
          { timeout: 10000 },
        )
        .toBe(200);
      const acknowledged = once(child, 'message', {
        signal: AbortSignal.timeout(5000),
      });
      child.send(fault);
      expect(await acknowledged).toEqual([fault, undefined]);
      if (fault === 'close-database') {
        for (let attempt = 0; attempt < 2; attempt++) {
          const { response, body } = await requestHealth(url);
          expect(response.status).toBe(503);
          expect(response.headers.get('cache-control')).toBe('no-store');
          expect(body).toBe('{"status":"unavailable"}');
        }
      } else {
        await expect(requestHealth(url)).rejects.toMatchObject({
          name: 'TimeoutError',
        });
      }
    } finally {
      await stop(child, closed);
    }
    expect(await closed).toEqual([null, 'SIGTERM']);
    if (fault === 'close-database') {
      expect(logs).toContain('Database health check failed');
      expect(logs).toContain('not open');
      expect(logs).toContain('"phase":"health"');
    }
    expect(logs).not.toContain(secret);
    expect(logs).not.toContain(key);
  },
  30000,
);
