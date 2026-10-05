import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stop, unusedPort } from '../../integration/runtime/process-helpers.ts';

export async function launchIdentity(
  database: string,
  config: string,
  secret: string,
  port?: number,
  githubConfig?: string,
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
        // Capture before spawning Next; saving the file cannot affect this process.
        IDENTITY_GITHUB_SETTINGS: githubConfig
          ? readFileSync(githubConfig, 'utf8')
          : undefined,
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
