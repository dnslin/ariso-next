import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

assert.equal(process.versions.node.split('.')[0], '24', 'Use Node 24');
const output = resolve(
  process.env.BROWSER_REPORT_DIR ?? '../../../test-results/ui',
);
await mkdir(output, { recursive: true });
const socket = createServer().listen(0, '127.0.0.1');
await once(socket, 'listening');
const port = socket.address().port;
await new Promise((resolve, reject) =>
  socket.close((error) => (error ? reject(error) : resolve())),
);
const origin = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  [
    'node_modules/next/dist/bin/next',
    'start',
    '--hostname',
    '127.0.0.1',
    '--port',
    String(port),
  ],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);
let logs = '';
server.stdout.on('data', (chunk) => {
  logs += chunk;
});
server.stderr.on('data', (chunk) => {
  logs += chunk;
});
let browser;
const controller = new AbortController();
const interrupt = () =>
  controller.abort(new Error('UI verification interrupted or timed out'));
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);
const timeout = setTimeout(interrupt, 120000);
async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const closed = once(child, 'close');
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  try {
    await closed;
  } finally {
    clearTimeout(timer);
  }
}
try {
  const deadline = Date.now() + 30000;
  while (true) {
    controller.signal.throwIfAborted();
    assert.equal(server.exitCode, null, logs);
    try {
      if ((await fetch(origin, { signal: AbortSignal.timeout(1000) })).ok)
        break;
    } catch (error) {
      if (Date.now() >= deadline) throw error;
    }
    assert.ok(Date.now() < deadline, 'UI server startup timed out');
    await delay(100, undefined, { signal: controller.signal });
  }
  const config = {
    origin,
    output,
    spaceId: process.env.EGO_TASK_SPACE
      ? Number(process.env.EGO_TASK_SPACE)
      : undefined,
    keepSpace: process.env.EGO_KEEP_SPACE === '1',
  };
  browser = spawn('ego-browser', ['nodejs'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let browserLogs = '';
  for (const stream of [browser.stdout, browser.stderr])
    stream.on('data', (chunk) => {
      browserLogs += chunk;
      process.stdout.write(chunk);
    });
  const closed = once(browser, 'close', { signal: controller.signal });
  browser.stdin.on('error', (error) => {
    browserLogs += String(error);
  });
  browser.stdin.end(
    `const config = ${JSON.stringify(config)};\n${await readFile(new URL('./browser.mjs', import.meta.url), 'utf8')}`,
  );
  try {
    const [code] = await closed;
    assert.equal(code, 0, 'UI browser verification failed');
  } finally {
    await writeFile(`${output}/ego.log`, browserLogs);
  }
} finally {
  clearTimeout(timeout);
  await stop(browser);
  await stop(server);
  await writeFile(`${output}/server.log`, logs);
}
