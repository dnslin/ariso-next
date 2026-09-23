import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve(
  process.env.BROWSER_REPORT_DIR ?? '../../../test-results/upload',
);
await mkdir(output, { recursive: true });
const reportPath = resolve(output, 'browser.json');
await writeFile(
  reportPath,
  `${JSON.stringify(
    {
      startedAt: new Date().toISOString(),
      status: 'running',
      phases: [],
    },
    null,
    2,
  )}\n`,
);
let server;
let browser;
try {
  assert.equal(process.versions.node.split('.')[0], '24', 'Use Node 24');
  server = spawn(process.execPath, ['browser-server.mjs'], {
    env: { ...process.env, PORT: '0' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const origin = await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.once('exit', (code) => reject(new Error(`Fixture exited: ${code}`)));
    server.stdout.once('data', (data) => resolve(String(data).trim()));
  });
  const source = await readFile(
    new URL('./browser-check.mjs', import.meta.url),
    'utf8',
  );
  const config = {
    origin,
    output,
    keepSpace: process.env.EGO_KEEP_SPACE === '1',
    spaceId: process.env.EGO_TASK_SPACE
      ? Number(process.env.EGO_TASK_SPACE)
      : 'UPLOAD-V03 verification',
  };
  browser = spawn('ego-browser', ['nodejs'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let log = '';
  browser.stdout.on('data', (data) => {
    log += data;
  });
  browser.stderr.on('data', (data) => {
    log += data;
  });
  browser.stdin.end(`const config = ${JSON.stringify(config)};\n${source}`);
  const timeout = setTimeout(() => browser.kill('SIGTERM'), 240000);
  try {
    const [code] = await once(browser, 'close');
    process.stdout.write(log);
    await writeFile(resolve(output, 'ego.log'), log);
    assert.equal(code, 0, 'Ego upload experiment failed');
  } finally {
    clearTimeout(timeout);
  }
} catch (error) {
  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  await writeFile(
    reportPath,
    `${JSON.stringify(
      {
        ...report,
        status: 'failed',
        finishedAt: new Date().toISOString(),
        error: report.error ?? error.stack ?? String(error),
      },
      null,
      2,
    )}\n`,
  );
  throw error;
} finally {
  if (browser && browser.exitCode === null) browser.kill('SIGTERM');
  if (server && server.exitCode === null && server.signalCode === null) {
    const closed = once(server, 'close');
    server.kill('SIGTERM');
    await closed;
  }
}
