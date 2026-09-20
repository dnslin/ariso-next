import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { promisify } from 'node:util';
import { openFixture, seedOwner } from './fixture.ts';
import { launchIdentity } from './http-process.ts';

assert.equal(process.versions.node.split('.')[0], '24');
const output = resolve(
  process.env.BROWSER_REPORT_DIR ?? 'test-results/identity-browser',
);
const controller = new AbortController();
const interrupt = () =>
  controller.abort(new Error('Identity browser verification interrupted'));
process.on('SIGINT', interrupt);
process.on('SIGTERM', interrupt);
let directory: string | undefined;
let connection: ReturnType<typeof openFixture> | undefined;
let server: Awaited<ReturnType<typeof launchIdentity>> | undefined;
try {
  directory = await mkdtemp(join(tmpdir(), 'ariso-identity-browser-'));
  await mkdir(output, { recursive: true });
  controller.signal.throwIfAborted();
  const dbPath = join(directory, 'auth.db');
  const configPath = join(directory, 'config.json');
  connection = openFixture(dbPath);
  await seedOwner(
    connection.db,
    'owner@example.test',
    'identity-experiment-password',
  );
  connection.close();
  controller.signal.throwIfAborted();
  server = await launchIdentity(
    dbPath,
    configPath,
    randomBytes(32).toString('hex'),
  );
  await writeFile(
    configPath,
    JSON.stringify({ origin: `http://127.0.0.1:${server.port}` }),
  );
  const deadline = Date.now() + 30000;
  while (!server.logs().includes('Ready in')) {
    assert.ok(
      server.child.exitCode === null && Date.now() < deadline,
      server.logs(),
    );
    await setTimeout(100, undefined, { signal: controller.signal });
  }
  const config = {
    port: server.port,
    configPath,
    report: join(output, 'browser.json'),
    spaceId: process.env.EGO_TASK_SPACE
      ? Number(process.env.EGO_TASK_SPACE)
      : undefined,
    keepSpace: process.env.EGO_KEEP_SPACE === '1',
  };
  const source = await readFile(
    resolve('tests/experiments/identity/browser.mjs'),
    'utf8',
  );
  controller.signal.throwIfAborted();
  const browser = promisify(execFile)('ego-browser', ['nodejs'], {
    signal: controller.signal,
    timeout: 120000,
    maxBuffer: 1024 * 1024,
  });
  browser.child.stdin!.end(
    `const config = ${JSON.stringify(config)};\n${source}`,
  );
  const { stdout, stderr } = await browser;
  console.log(stdout);
  if (stderr) console.error(stderr);
} finally {
  connection?.close();
  if (server) {
    await server.stop();
    await writeFile(join(output, 'server.log'), server.logs());
  }
  if (directory) await rm(directory, { recursive: true, force: true });
  process.off('SIGINT', interrupt);
  process.off('SIGTERM', interrupt);
}
