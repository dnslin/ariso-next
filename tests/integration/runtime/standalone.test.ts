import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cp, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { once } from 'node:events';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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

async function unusedPort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing port');
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

async function launch(overrides: Record<string, string> = {}) {
  const port = await unusedPort();
  const child = spawn('sh', [join(app, 'entrypoint.sh')], {
    cwd: directory,
    env: {
      PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
      NODE_ENV: 'production',
      NODE_OPTIONS: '--no-experimental-strip-types',
      PORT: String(port),
      DATA_DIR: join(directory, `data-${port}`),
      BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
      ARISO_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
      ...overrides,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', (chunk) => {
    logs += chunk;
  });
  child.stderr.on('data', (chunk) => {
    logs += chunk;
  });
  const closed = once(child, 'close');
  return { child, closed, port, logs: () => logs };
}

async function stop(child: ChildProcess, closed: Promise<unknown>) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  const timeout = setTimeout(() => child.kill('SIGKILL'), 5000);
  try {
    await closed;
  } finally {
    clearTimeout(timeout);
  }
}

describe('isolated production directory', () => {
  it('包含编译 CLI、迁移、原生驱动及静态资源，不携带开发工具或源码', async () => {
    const files = await readdir(app, { recursive: true });
    for (const file of [
      'server.js',
      'entrypoint.sh',
      'dist/cli/prestart.js',
      'drizzle/meta/_journal.json',
      'public/runtime.svg',
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
      const run = await launch(env as Record<string, string>);
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
        const home = await fetch(origin);
        expect(home.status).toBe(200);
        const html = await home.text();
        expect(html).toContain('运行基础建设中');
        const scripts = [...html.matchAll(/src="([^" ]+\.js[^" ]*)"/g)].map(
          (match) => match[1],
        );
        expect(scripts.length).toBeGreaterThan(0);
        for (const path of ['/runtime.svg', ...scripts]) {
          const response = await fetch(new URL(path, origin));
          expect(response.status, path).toBe(200);
          expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
        }
      } finally {
        await stop(run.child, run.closed);
      }
    },
    25000,
  );

  it('prestart 配置失败时非零退出且不监听 Web 端口', async () => {
    const run = await launch({ HOST: '' });
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
