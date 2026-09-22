import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import {
  copyFile,
  mkdir,
  mkdtemp,
  open,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { stop, unusedPort } from '../../integration/runtime/process-helpers.ts';
import { openFixture, seedOwner } from '../identity/fixture.ts';
import type { Case, Scenario } from './fixture.ts';

export async function launchDelivery(signal?: AbortSignal) {
  const directory = await mkdtemp(join(tmpdir(), 'ariso-delivery-'));
  const database = join(directory, 'auth.db');
  const connection = openFixture(database);
  let child: ReturnType<typeof spawn> | undefined;
  let closed: Promise<unknown> | undefined;
  let logs = '';
  let loginAttempt = 0;
  try {
    await seedOwner(
      connection.db,
      'owner@example.test',
      'delivery-experiment-password',
    );
    signal?.throwIfAborted();
    const objects = join(directory, 'files/ariso/probe');
    await mkdir(objects, { recursive: true });
    await copyFile(
      resolve('tests/fixtures/runtime/images/sample.png'),
      join(objects, 'sample'),
    );
    await copyFile(join(objects, 'sample'), join(objects, 'replacement'));
    await writeFile(
      join(objects, 'svg'),
      '<svg xmlns="http://www.w3.org/2000/svg"><text>delivery</text></svg>',
    );
    const large = await open(join(objects, 'large'), 'w');
    await large.truncate(16 * 1024 * 1024);
    await large.close();
    const port = await unusedPort();
    const origin = `http://127.0.0.1:${port}`;
    const config = join(directory, 'config.json');
    await writeFile(config, JSON.stringify({ origin }));
    await promisify(execFile)(
      process.execPath,
      [
        resolve('node_modules/next/dist/bin/next'),
        'build',
        resolve('tests/experiments/delivery/next-app'),
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
    signal?.throwIfAborted();
    child = spawn(
      process.execPath,
      [
        resolve('node_modules/next/dist/bin/next'),
        'start',
        resolve('tests/experiments/delivery/next-app'),
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
          DELIVERY_ROOT: directory,
          DELIVERY_DATABASE: database,
          DELIVERY_CONFIG: config,
          BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
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
    while (!logs.includes('Ready in')) {
      signal?.throwIfAborted();
      if (child.exitCode !== null || Date.now() > deadline)
        throw new Error(logs);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const request = (path: string, init: RequestInit = {}) =>
      fetch(`${origin}${path}`, {
        ...init,
        signal: init.signal ?? AbortSignal.timeout(30000),
      });
    await request('/', { signal });
    signal?.throwIfAborted();
    return {
      directory,
      objects,
      origin,
      connection,
      logs: () => logs,
      request,
      async control(
        id: string,
        state: Partial<Scenario> = {},
        release = false,
      ) {
        const response = await request('/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, state, release }),
        });
        if (!response.ok) throw new Error(await response.text());
      },
      async probe(id: string): Promise<Case> {
        return (await request(`/control?id=${id}`)).json();
      },
      async login() {
        const response = await request('/api/auth/sign-in/email', {
          method: 'POST',
          headers: {
            origin,
            'Content-Type': 'application/json',
            'x-experiment-ip': `192.0.2.${++loginAttempt}`,
          },
          body: JSON.stringify({
            email: 'owner@example.test',
            password: 'delivery-experiment-password',
          }),
        });
        if (!response.ok) throw new Error(await response.text());
        return response.headers
          .getSetCookie()
          .map((cookie) => cookie.split(';')[0])
          .join('; ');
      },
      async stop() {
        await stop(child!, closed!);
        connection.close();
        await rm(directory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    if (child && closed) await stop(child, closed);
    connection.close();
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
