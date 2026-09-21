import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { constants } from 'node:fs';
import { appendFile, cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execa } from 'execa';
import { expect, it, vi } from 'vitest';
import { stop, unusedPort } from '../runtime/process-helpers.ts';
import { email, password } from './auth-fixture.ts';

it('real Next dev recompilation retains the startup code and the original code creates a login-capable owner', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ariso-setup-dev-'));
  const port = await unusedPort();
  const origin = `http://127.0.0.1:${port}`;
  const env = {
    PATH: `${dirname(process.execPath)}:${process.env.PATH}`,
    NODE_ENV: 'development',
    NEXT_TELEMETRY_DISABLED: '1',
    DATA_DIR: join(directory, 'data'),
    BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
    ARISO_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
    LOG_LEVEL: 'fatal',
  } satisfies NodeJS.ProcessEnv;
  let child: ReturnType<typeof spawn> | undefined;
  let closed: Promise<unknown> | undefined;
  let logs = '';
  const codes = () =>
    logs.split('\n').flatMap((line) => {
      try {
        const entry = JSON.parse(line);
        return entry.module === 'identity.setup' && entry.event === 'setup-code'
          ? [entry.code as string]
          : [];
      } catch {
        return [];
      }
    });
  const request = (path: string, init: RequestInit = {}) =>
    fetch(`${origin}${path}`, {
      ...init,
      signal: AbortSignal.timeout(20000),
      redirect: 'manual',
    });
  try {
    for (const file of [
      'src',
      'public',
      'dist',
      'drizzle',
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      'next.config.ts',
      'next-env.d.ts',
      'tsconfig.json',
    ]) {
      await cp(resolve(file), join(directory, file), { recursive: true });
    }
    // A real isolated project keeps Turbopack inside its root without touching the user's files.
    await cp(resolve('node_modules'), join(directory, 'node_modules'), {
      recursive: true,
      verbatimSymlinks: true,
      mode: constants.COPYFILE_FICLONE,
    });
    await execa(process.execPath, ['dist/cli/prestart.js'], {
      cwd: directory,
      env,
      extendEnv: false,
      timeout: 15000,
    });
    child = spawn(
      process.execPath,
      [
        'node_modules/next/dist/bin/next',
        'dev',
        '--hostname',
        '127.0.0.1',
        '--port',
        String(port),
      ],
      {
        cwd: directory,
        env,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    child.stdout!.on('data', (chunk) => {
      logs += chunk;
    });
    child.stderr!.on('data', (chunk) => {
      logs += chunk;
    });
    closed = once(child, 'close');
    await vi.waitFor(
      async () => {
        expect(child!.exitCode, logs).toBeNull();
        const response = await request('/api/health');
        expect(response.status, `${await response.text()}\n${logs}`).toBe(200);
      },
      { timeout: 30000 },
    );
    expect(codes()).toHaveLength(1);
    const code = codes()[0];
    expect(code).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect((await request('/api/setup')).status).toBe(405);
    const offset = logs.length;
    const marker = `setup-dev-recompiled-${randomBytes(8).toString('hex')}`;
    await appendFile(
      join(directory, 'src/app/api/setup/route.ts'),
      `\nconsole.info(${JSON.stringify(marker)});\n`,
    );
    // Subsequent HTTP requests drive the dev compiler after the filesystem edit.
    await vi.waitFor(
      async () => {
        expect((await request('/api/setup')).status).toBe(405);
        expect(logs.slice(offset)).toContain(marker);
      },
      { timeout: 20000 },
    );
    expect(codes()).toEqual([code]);
    const setup = await request('/api/setup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        code,
        email,
        password,
        publicUrl: origin,
        timeZone: 'UTC',
      }),
    });
    expect(setup.status, await setup.clone().text()).toBe(200);
    expect(await setup.json()).toEqual({
      code: 'SETUP_COMPLETED',
      redirectTo: '/login',
    });
    expect(setup.headers.getSetCookie()).toEqual([]);
    const login = await request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({ email, password }),
    });
    expect(login.status, await login.clone().text()).toBe(200);
    expect(login.headers.getSetCookie().join(';')).toContain('session_token=');
    expect(codes()).toEqual([code]);
  } finally {
    if (child && closed) await stop(child, closed);
    await rm(directory, { recursive: true, force: true });
  }
}, 120000);
