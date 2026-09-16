import { randomBytes } from 'node:crypto';
import { cp, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildFrameworkErrorApp } from '../../fixtures/runtime/framework-error';
import { launch, stop } from './process-helpers';

let directory: string;
let app: string;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ariso-logging-'));
  app = join(directory, 'production');
  await cp(resolve('.next/standalone'), app, {
    recursive: true,
    verbatimSymlinks: true,
  });
}, 30000);
afterAll(async () => rm(directory, { recursive: true, force: true }));

function records(run: Awaited<ReturnType<typeof launch>>) {
  // 分别解析两个流，避免不同管道的 chunk 交错影响逐行 JSON 断言。
  const lines = [run.stdout(), run.stderr()].flatMap((output) =>
    output === '' ? [] : output.trimEnd().split('\n'),
  );
  expect(lines.length).toBeGreaterThan(0);
  return lines.map((line) => {
    const record = JSON.parse(line);
    expect(record).toMatchObject({
      time: expect.any(String),
      level: expect.stringMatching(/^(trace|debug|info|warn|error|fatal)$/),
      module: expect.any(String),
      msg: expect.any(String),
    });
    expect(Number.isNaN(Date.parse(record.time))).toBe(false);
    return record;
  });
}

it('隔离最终产物启动及正常请求输出逐行 JSON，故障入口不进入生产应用', async () => {
  const run = await launch(app, directory);
  try {
    await expect
      .poll(() => run.logs(), { timeout: 15000 })
      .toContain('Ready in');
    const response = await fetch(`http://127.0.0.1:${run.port}/api/health`, {
      signal: AbortSignal.timeout(2000),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
    for (const path of ['/framework-error', '/api/log-event']) {
      const absent = await fetch(`http://127.0.0.1:${run.port}${path}`, {
        signal: AbortSignal.timeout(2000),
      });
      expect(absent.status).toBe(404);
      await absent.text();
    }
  } finally {
    await stop(run.child, run.closed);
  }
  expect(records(run)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        module: 'runtime.prestart',
        phase: 'prestart',
        level: 'info',
        msg: 'prestart completed',
      }),
      expect.objectContaining({
        module: 'runtime.console',
        level: 'info',
        msg: expect.stringContaining('Ready in'),
      }),
    ]),
  );
  const files = await readdir(app, { recursive: true });
  expect(
    files.some((file) => /framework-error|log-event|^tests/.test(file)),
  ).toBe(false);
}, 30000);

it('最终产物的启动失败为 JSON，保留配置位置且不泄露非法输入', async () => {
  const secret = randomBytes(32).toString('hex');
  const run = await launch(app, directory, {
    ARISO_ENCRYPTION_KEY: `invalid-${secret}`,
  });
  try {
    await expect.poll(() => run.child.exitCode, { timeout: 10000 }).toBe(1);
    expect(await run.closed).toEqual([1, null]);
  } finally {
    await stop(run.child, run.closed);
  }
  expect(run.logs()).not.toContain(secret);
  expect(run.logs()).not.toContain('Ready in');
  expect(records(run)).toEqual([
    expect.objectContaining({
      module: 'runtime.prestart',
      phase: 'prestart',
      level: 'fatal',
      err: expect.objectContaining({
        message: expect.stringContaining('ARISO_ENCRYPTION_KEY'),
        stack: expect.any(String),
      }),
    }),
  ]);
}, 15000);

it('真实 Next URL 错误及正常事件隐藏指定秘密，保留错误原因、路径和业务上下文', async () => {
  const fixture = join(directory, 'fixture');
  await buildFrameworkErrorApp(fixture);
  await writeFile(
    join(fixture, 'entrypoint.sh'),
    `#!/bin/sh
cd "$(dirname "$0")"
exec node --import ./dist/cli/logging.js node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port "$PORT"
`,
  );
  // 独立列出 Spec 的秘密类别，避免从实现读取规则使遗漏同时影响测试。
  const fields = Object.fromEntries(
    [
      'authorization',
      'cookie',
      'apiKey',
      'uploadToken',
      'accessKey',
      'secretKey',
      'password',
      'clientSecret',
      'resetToken',
      'sharePassword',
      'BETTER_AUTH_SECRET',
      'ARISO_ENCRYPTION_KEY',
    ].map((field) => [field, randomBytes(32).toString('hex')]),
  );
  const parameters = Object.fromEntries(
    [
      'token',
      'resetToken',
      'reset_token',
      'uploadToken',
      'access_token',
      'refresh_token',
      'code',
      'X-Amz-Signature',
      'X-Amz-Credential',
      'X-Amz-Security-Token',
      'AWSAccessKeyId',
      'Signature',
    ].map((field) => [field, randomBytes(32).toString('hex')]),
  );
  const query = new URLSearchParams({
    ...parameters,
    keep: 'visible',
    path: '/images/example.jpg',
  });
  const path = `http://[invalid/framework-error?${query}`;
  const redactedPath = `http://[invalid/framework-error?${Object.keys(
    parameters,
  )
    .map((key) => `${key}=[Redacted]`)
    .join('&')}&keep=visible&path=%2Fimages%2Fexample.jpg`;
  const run = await launch(fixture, directory, {
    BETTER_AUTH_SECRET: fields.BETTER_AUTH_SECRET,
    ARISO_ENCRYPTION_KEY: fields.ARISO_ENCRYPTION_KEY,
  });
  try {
    await expect
      .poll(() => run.logs(), { timeout: 15000 })
      .toContain('Ready in');
    const event = await fetch(`http://127.0.0.1:${run.port}/api/log-event`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(fields),
      signal: AbortSignal.timeout(5000),
    });
    expect(event.status).toBe(200);
    expect(await event.json()).toEqual({ status: 'ok' });
    // fetch 会在客户端拒绝非法 URL；HTTP request 将原始 request-target 交给真实 Next。
    const result = await new Promise<{
      status: number | undefined;
      body: string;
    }>((resolve, reject) => {
      const req = request(
        {
          hostname: '127.0.0.1',
          port: run.port,
          path,
          signal: AbortSignal.timeout(5000),
        },
        (res) => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            body += chunk;
          });
          res.on('end', () => resolve({ status: res.statusCode, body }));
          res.on('error', reject);
        },
      );
      req.on('error', reject);
      req.end();
    });
    expect(result).toEqual({ status: 500, body: 'Internal Server Error' });
    await expect
      .poll(() => run.logs(), { timeout: 5000 })
      .toContain('Failed to handle request for');
  } finally {
    await stop(run.child, run.closed);
  }
  for (const secret of [
    ...Object.values(fields),
    ...Object.values(parameters),
  ]) {
    expect(run.logs()).not.toContain(secret);
  }
  const logs = records(run);
  expect(logs).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        module: 'runtime.fixture',
        level: 'info',
        phase: 'request',
        path: '/api/log-event',
        taskId: 'task-visible',
        imageId: 'image-visible',
        storageId: 'storage-visible',
        msg: 'normal fixture event',
        ...Object.fromEntries(
          Object.keys(fields).map((field) => [field, '[Redacted]']),
        ),
      }),
      expect.objectContaining({
        level: 'error',
        module: 'runtime.console',
        msg: expect.stringContaining(
          `Failed to handle request for ${redactedPath}`,
        ),
      }),
      expect.objectContaining({
        level: 'error',
        module: 'runtime.console',
        err: expect.objectContaining({
          message: 'Invalid URL',
          code: 'ERR_INVALID_URL',
          input: redactedPath,
          stack: expect.stringContaining('router-server.js'),
        }),
      }),
    ]),
  );
}, 180000);
