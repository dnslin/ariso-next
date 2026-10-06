import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { stop, unusedPort } from '../../integration/runtime/process-helpers.ts';

export async function launchIdentity(
  database: string,
  config: string,
  secret: string,
  port?: number,
  githubConfig?: string,
) {
  port ??= await unusedPort();
  const app = resolve('tests/experiments/identity/next-app');
  await mkdir(join(app, '.next'), { recursive: true });
  const buildDirectory = await mkdtemp(join(app, '.next', 'identity-'));
  const distDir = relative(app, buildDirectory);
  try {
    // Next adds generated type paths to this file; keep the source config unchanged.
    await writeFile(
      join(buildDirectory, 'tsconfig.json'),
      JSON.stringify({ extends: join(app, 'tsconfig.json') }),
    );
    const child = spawn(
      process.execPath,
      [
        resolve('node_modules/next/dist/bin/next'),
        'dev',
        app,
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
          IDENTITY_NEXT_DIST_DIR: distDir,
          IDENTITY_NEXT_TSCONFIG: join(distDir, 'tsconfig.json'),
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
    return {
      port,
      child,
      buildDirectory,
      logs: () => logs,
      async stop() {
        try {
          await stop(child, closed);
        } finally {
          await rm(buildDirectory, { recursive: true, force: true });
        }
      },
    };
  } catch (error) {
    await rm(buildDirectory, { recursive: true, force: true });
    throw error;
  }
}
