import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { stop, unusedPort } from '../../integration/runtime/process-helpers.ts';

export async function launchIdentity(
  database: string,
  config: string,
  secret: string,
  port?: number,
) {
  port ??= await unusedPort();
  const child = spawn(
    process.execPath,
    [
      resolve('node_modules/next/dist/bin/next'),
      'dev',
      resolve('tests/experiments/identity/next-app'),
      '--webpack',
      '--hostname',
      '127.0.0.1',
      '--port',
      String(port),
    ],
    {
      env: {
        ...process.env,
        NODE_ENV: 'development',
        IDENTITY_DATABASE: database,
        IDENTITY_CONFIG: config,
        BETTER_AUTH_SECRET: secret,
        NEXT_TELEMETRY_DISABLED: '1',
      },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let logs = '';
  child.stdout.on('data', (chunk) => {
    logs += chunk;
  });
  child.stderr.on('data', (chunk) => {
    logs += chunk;
  });
  const closed = once(child, 'close');
  return { port, child, logs: () => logs, stop: () => stop(child, closed) };
}
