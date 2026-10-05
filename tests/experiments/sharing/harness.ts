import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { stop, unusedPort } from '../../integration/runtime/process-helpers.ts';
import { openFixture, seedOwner } from '../identity/fixture.ts';

export async function launchSharing(signal?: AbortSignal) {
  const directory = await mkdtemp(join(tmpdir(), 'ariso-sharing-'));
  const database = join(directory, 'sharing.db');
  const config = join(directory, 'config.json');
  const secret = randomBytes(32).toString('hex');
  let child: ReturnType<typeof spawn> | undefined;
  let closed: Promise<unknown> | undefined;
  let logs = '';
  let loginAttempt = 0;
  let stopped = false;
  try {
    signal?.throwIfAborted();
    const connection = openFixture(database);
    try {
      await seedOwner(
        connection.db,
        'owner@example.test',
        'sharing-experiment-password',
      );
    } finally {
      connection.close();
    }
    signal?.throwIfAborted();
    const port = await unusedPort();
    const origin = `http://127.0.0.1:${port}`;
    await writeFile(config, JSON.stringify({ origin, now: 1800000000000 }));
    await promisify(execFile)(
      process.execPath,
      [
        resolve('node_modules/next/dist/bin/next'),
        'build',
        resolve('tests/experiments/sharing/next-app'),
        '--webpack',
      ],
      {
        env: {
          ...process.env,
          NODE_ENV: 'production',
          NEXT_TELEMETRY_DISABLED: '1',
        },
        signal,
        timeout: 120000,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    const request = (path: string, init: RequestInit = {}) =>
      fetch(`${origin}${path}`, {
        ...init,
        redirect: init.redirect ?? 'manual',
        signal: init.signal ?? AbortSignal.timeout(30000),
      });
    async function start(startSignal?: AbortSignal) {
      startSignal?.throwIfAborted();
      const offset = logs.length;
      child = spawn(
        process.execPath,
        [
          resolve('node_modules/next/dist/bin/next'),
          'start',
          resolve('tests/experiments/sharing/next-app'),
          '--hostname',
          '127.0.0.1',
          '--port',
          String(port),
        ],
        {
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: {
            ...process.env,
            NODE_ENV: 'production',
            NEXT_TELEMETRY_DISABLED: '1',
            SHARING_DATABASE: database,
            SHARING_CONFIG: config,
            BETTER_AUTH_SECRET: secret,
          },
        },
      );
      child.stdout!.on('data', (chunk) => {
        logs += chunk;
      });
      child.stderr!.on('data', (chunk) => {
        logs += chunk;
      });
      closed = once(child, 'close');
      const deadline = Date.now() + 30000;
      let lastError: unknown;
      while (true) {
        startSignal?.throwIfAborted();
        if (
          child.exitCode !== null ||
          child.signalCode !== null ||
          Date.now() > deadline
        )
          throw new Error(
            `Sharing HTTP did not become ready at ${origin}/control.\n${logs.slice(offset)}`,
            { cause: lastError },
          );
        try {
          const attempt = AbortSignal.timeout(500);
          const ready = await request('/control', {
            signal: startSignal
              ? AbortSignal.any([startSignal, attempt])
              : attempt,
          });
          if (ready.ok) {
            await ready.text();
            startSignal?.throwIfAborted();
            return;
          }
          lastError = new Error(
            `Sharing readiness returned HTTP ${ready.status}: ${await ready.text()}`,
          );
        } catch (error) {
          startSignal?.throwIfAborted();
          lastError = error;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    await start(signal);
    return {
      directory,
      origin,
      logs: () => logs,
      request,
      async control<T = unknown>(body: object): Promise<T> {
        const response = await request('/control', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error(await response.text());
        return response.json();
      },
      async login() {
        const response = await request('/api/auth/sign-in/email', {
          method: 'POST',
          headers: {
            origin,
            'content-type': 'application/json',
            'x-experiment-ip': `192.0.2.${++loginAttempt}`,
          },
          body: JSON.stringify({
            email: 'owner@example.test',
            password: 'sharing-experiment-password',
          }),
        });
        if (!response.ok) throw new Error(await response.text());
        return response.headers
          .getSetCookie()
          .map((cookie) => cookie.split(';')[0])
          .join('; ');
      },
      async restart() {
        await stop(child!, closed!);
        await start();
      },
      async stop() {
        if (stopped) return;
        stopped = true;
        try {
          await stop(child!, closed!);
        } finally {
          await rm(directory, { recursive: true, force: true });
        }
      },
    };
  } catch (error) {
    try {
      if (child && closed) await stop(child, closed);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
    throw error;
  }
}
