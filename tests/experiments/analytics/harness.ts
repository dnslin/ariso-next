import { spawn, execFile } from 'node:child_process';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { unusedPort } from '../../integration/runtime/process-helpers.ts';

const execute = promisify(execFile);
export const appDirectory = resolve('tests/experiments/analytics/next-app');
export const standalone = join(appDirectory, '.next/standalone');
export const serverRelative = 'tests/experiments/analytics/next-app/server.js';
export async function buildExperiment() {
  await execute(
    process.execPath,
    [
      resolve('node_modules/next/dist/bin/next'),
      'build',
      appDirectory,
      '--webpack',
    ],
    {
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      timeout: 120000,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
}

export async function launchExperiment(image?: string) {
  const directory = await mkdtemp(join(tmpdir(), 'ariso-analytics-'));
  const port = await unusedPort();
  const origin = `http://127.0.0.1:${port}`;
  const name = `analytics-${process.pid}-${port}`;
  const database = join(directory, 'analytics.db');
  const traceFile = join(directory, 'trace.jsonl');
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    HOSTNAME: '127.0.0.1',
    PORT: String(port),
    ANALYTICS_DATABASE: database,
    ANALYTICS_TRACE: traceFile,
    NEXT_TELEMETRY_DISABLED: '1',
  };
  delete environment.NEXT_MANUAL_SIG_HANDLE;
  const child = image
    ? spawn(
        'docker',
        [
          'run',
          '--name',
          name,
          '--network',
          'bridge',
          '-p',
          `127.0.0.1:${port}:3000`,
          '--mount',
          `type=bind,src=${directory},dst=/evidence`,
          '-e',
          'HOSTNAME=0.0.0.0',
          '-e',
          'PORT=3000',
          '-e',
          'ANALYTICS_DATABASE=/evidence/analytics.db',
          '-e',
          'ANALYTICS_TRACE=/evidence/trace.jsonl',
          image,
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      )
    : spawn(process.execPath, [join(standalone, serverRelative)], {
        cwd: directory,
        env: environment,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
  const closed = once(child, 'close');
  let logs = '';
  child.stdout!.on('data', (chunk) => {
    logs += chunk;
  });
  child.stderr!.on('data', (chunk) => {
    logs += chunk;
  });
  const signal = async (value: NodeJS.Signals) => {
    if (image) await execute('docker', ['kill', '--signal', value, name]);
    else child.kill(value);
  };
  const trace = async () =>
    (await readFile(traceFile, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
  const request = (path = '') =>
    fetch(`${origin}/${path}`, {
      signal: AbortSignal.timeout(15000),
      headers: { Connection: 'close' },
    });
  const dispose = async () => {
    if (child.exitCode === null && child.signalCode === null) {
      await signal('SIGKILL');
      await closed;
    }
    if (image) await execute('docker', ['rm', name]);
    await rm(directory, { recursive: true, force: true });
  };
  try {
    const deadline = Date.now() + 30000;
    while (true) {
      if (
        child.exitCode !== null ||
        child.signalCode !== null ||
        Date.now() > deadline
      )
        throw new Error(`Next experiment failed to start: ${logs}`);
      try {
        const response = await request();
        if (response.ok) {
          await response.json();
          break;
        }
      } catch (error) {
        if (Date.now() > deadline) throw new Error(logs, { cause: error });
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return {
      database,
      request,
      signal,
      trace,
      closed,
      logs: () => logs,
      dispose,
    };
  } catch (error) {
    await dispose();
    throw error;
  }
}
