import { cp, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execa } from 'execa';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { launch, stop } from './process-helpers';

let directory: string;
let app: string;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ariso-standalone-'));
  app = join(directory, 'app');
  await cp(resolve('.next/standalone'), app, {
    recursive: true,
    verbatimSymlinks: true,
  });
}, 30000);
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('isolated production directory', () => {
  it('包含编译 CLI、迁移、原生驱动及静态资源，不携带开发工具或源码', async () => {
    const files = await readdir(app, { recursive: true });
    for (const file of [
      'server.js',
      'entrypoint.sh',
      'scripts/verify-image.mjs',
      'dist/cli/prestart.js',
      'dist/cli/logging.js',
      'drizzle/meta/_journal.json',
      'public/runtime.svg',
      'verification/fixtures/sample.jpg',
      'verification/fixtures/sample.png',
    ]) {
      expect(files).toContain(file);
    }
    expect(
      files.some(
        (file) => file.endsWith('.node') && file.includes('better-sqlite3'),
      ),
    ).toBe(true);
    expect(
      files.some(
        (file) => file.startsWith('.next/static/') && file.endsWith('.js'),
      ),
    ).toBe(true);
    for (const name of ['typescript', 'drizzle-kit', 'vitest']) {
      expect(files.some((file) => file.includes(`node_modules/${name}/`))).toBe(
        false,
      );
    }
    expect(files).not.toContain('src');
    expect(files).not.toContain('tests');
    expect(await readFile(join(app, 'server.js'), 'utf8')).not.toContain(
      'prestart',
    );
    for (const name of ['sample.jpg', 'sample.png']) {
      expect(await readFile(join(app, 'verification/fixtures', name))).toEqual(
        await readFile(resolve('tests/fixtures/runtime/images', name)),
      );
    }
  });

  it('镜像验证脚本脱离开发依赖运行，工具缺失时非零退出并清理临时目录', async () => {
    const result = await execa(
      process.execPath,
      [join(app, 'scripts/verify-image.mjs')],
      {
        cwd: directory,
        env: { PATH: '', TMPDIR: directory },
        extendEnv: false,
        reject: false,
      },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('magick');
    expect(result.stderr).toContain('ENOENT');
    expect(result.stdout).toContain(
      'Verification temporary directory removed:',
    );
    expect(
      (await readdir(directory)).filter((name) =>
        name.startsWith('ariso-verify-image-'),
      ),
    ).toEqual([]);
  });

  it.each([
    { name: '默认 HOST', env: {}, host: '0.0.0.0' },
    { name: '显式 HOST', env: { HOST: '127.0.0.1' }, host: '127.0.0.1' },
    {
      name: '容器 HOSTNAME',
      env: { HOSTNAME: 'container-not-a-listen-address' },
      host: '0.0.0.0',
    },
    {
      name: 'HOST 覆盖容器 HOSTNAME',
      env: { HOST: '127.0.0.1', HOSTNAME: 'container-not-a-listen-address' },
      host: '127.0.0.1',
    },
  ])(
    '$name：完整入口迁移后提供健康、页面与两类静态资源',
    async ({ env, host }) => {
      const run = await launch(app, directory, env as Record<string, string>);
      const origin = `http://127.0.0.1:${run.port}`;
      try {
        await expect
          .poll(
            async () => {
              if (run.child.exitCode !== null) throw new Error(run.logs());
              try {
                return (await fetch(`${origin}/api/health`)).status;
              } catch {
                return 0;
              }
            },
            { timeout: 15000 },
          )
          .toBe(200);
        const health = await fetch(`${origin}/api/health`);
        expect(await health.json()).toEqual({ status: 'ok' });
        expect(health.headers.get('cache-control')).toBe('no-store');
        expect(run.logs()).toContain(`http://${host}:${run.port}`);
        const records = run
          .logs()
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line));
        expect(records).toContainEqual(
          expect.objectContaining({
            module: 'runtime.prestart',
            level: 'info',
            phase: 'prestart',
            msg: 'prestart completed',
          }),
        );
        expect(
          records.some(
            (record) =>
              record.module === 'runtime.console' &&
              record.msg.includes('Next.js'),
          ),
        ).toBe(true);
        for (const record of records) {
          expect(record.time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
          expect(typeof record.msg).toBe('string');
        }
        const home = await fetch(origin);
        expect(home.status).toBe(200);
        const html = await home.text();
        expect(html).toContain('首次使用，请完成站点初始化。');
        expect(html).toMatch(/<a\b[^>]*href="\/setup"/);
        const scripts = [...html.matchAll(/src="([^" ]+\.js[^" ]*)"/g)].map(
          (match) => match[1],
        );
        expect(scripts.length).toBeGreaterThan(0);
        for (const path of ['/runtime.svg', ...scripts]) {
          const response = await fetch(new URL(path, origin));
          expect(response.status, path).toBe(200);
          expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
        }
        for (const path of [
          '/verification/fixtures/sample.jpg',
          '/verification/fixtures/sample.png',
          '/sample.jpg',
          '/sample.png',
        ]) {
          expect((await fetch(new URL(path, origin))).status, path).toBe(404);
        }
      } finally {
        await stop(run.child, run.closed);
      }
    },
    25000,
  );

  it.each([
    { signal: 'SIGTERM' as const, status: 143 },
    { signal: 'SIGINT' as const, status: 130 },
  ])(
    '标准 Next 收到 $signal 后停止队列并关闭数据库，以 $status 退出',
    async ({ signal: requestedSignal, status }) => {
      const run = await launch(app, directory);
      try {
        await expect
          .poll(
            async () => {
              if (run.child.exitCode !== null) throw new Error(run.logs());
              try {
                return (await fetch(`http://127.0.0.1:${run.port}/api/health`))
                  .status;
              } catch {
                return 0;
              }
            },
            { timeout: 15000 },
          )
          .toBe(200);
        run.child.kill(requestedSignal);
        const [code, signal] = await run.closed;
        expect(code, run.logs()).toBe(status);
        expect(run.logs()).toContain(
          'Upload and media queues stopped, analytics flushed, database closed',
        );
        expect(signal).toBeNull();
        await expect(
          fetch(`http://127.0.0.1:${run.port}/api/health`),
        ).rejects.toThrow();
      } finally {
        await stop(run.child, run.closed);
      }
    },
    25000,
  );

  it('prestart 配置失败时非零退出且不监听 Web 端口', async () => {
    const run = await launch(app, directory, { HOST: '' });
    try {
      const [code] = await run.closed;
      expect(code, run.logs()).toBe(1);
      expect(run.logs()).toContain('prestart failed:');
      expect(run.logs()).toContain('HOST');
      expect(run.logs()).not.toContain('Next.js');
      await expect(
        fetch(`http://127.0.0.1:${run.port}/api/health`),
      ).rejects.toThrow();
    } finally {
      await stop(run.child, run.closed);
    }
  }, 15000);
});
