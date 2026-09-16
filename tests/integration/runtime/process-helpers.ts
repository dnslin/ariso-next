import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';

export async function unusedPort() {
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

export async function launch(
  app: string,
  directory: string,
  overrides: Record<string, string | undefined> = {},
) {
  const port =
    overrides.PORT === undefined ? await unusedPort() : Number(overrides.PORT);
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
    // 独立进程组让失败清理同时覆盖尚未 exec 的 shell 和 prestart。
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    logs += chunk;
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    logs += chunk;
    stderr += chunk;
  });
  const closed = once(child, 'close');
  return {
    child,
    closed,
    port,
    logs: () => logs,
    stdout: () => stdout,
    stderr: () => stderr,
  };
}

export async function stop(child: ChildProcess, closed: Promise<unknown>) {
  const pid = child.pid;
  if (!pid) {
    await closed;
    return;
  }
  const signalGroup = (signal: NodeJS.Signals) => {
    try {
      process.kill(-pid, signal);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
  };
  signalGroup('SIGTERM');
  const timeout = setTimeout(() => signalGroup('SIGKILL'), 5000);
  try {
    await closed;
  } finally {
    clearTimeout(timeout);
  }
}
