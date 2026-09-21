import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { openRuntimeDatabase } from '../src/server/runtime/db.ts';
import { updateSiteSettings } from '../src/server/site/settings.ts';
import {
  email,
  password,
  seedAuthOwner,
} from '../tests/integration/identity/auth-fixture.ts';
import { launch, stop } from '../tests/integration/runtime/process-helpers.ts';

assert.equal(process.versions.node.split('.')[0], '24', 'Use Node 24');
const spaceId = Number(process.env.EGO_TASK_SPACE);
assert.ok(
  Number.isInteger(spaceId) && spaceId > 0,
  'Set EGO_TASK_SPACE to the existing task space',
);
const output = resolve(
  process.env.BROWSER_REPORT_DIR ?? 'test-results/identity-auth-browser',
);
const controller = new AbortController();
const interrupt = () =>
  controller.abort(new Error('Identity browser verification interrupted'));
process.on('SIGINT', interrupt);
process.on('SIGTERM', interrupt);
let directory: string | undefined;
let connection: ReturnType<typeof openRuntimeDatabase> | undefined;
let server: Awaited<ReturnType<typeof launch>> | undefined;
const report = {
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  startedAt: new Date().toISOString(),
  status: 'failed',
  temporaryDirectoryRemoved: false,
};
try {
  await mkdir(output, { recursive: true });
  directory = await mkdtemp(join(tmpdir(), 'ariso-auth-browser-'));
  controller.signal.throwIfAborted();
  const dataDir = join(directory, 'data');
  server = await launch(resolve('.next/standalone'), directory, {
    DATA_DIR: dataDir,
    HOST: '127.0.0.1',
  });
  const origin = `http://127.0.0.1:${server.port}`;
  const otherOrigin = `http://localhost:${server.port}`;
  const deadline = Date.now() + 30000;
  while (true) {
    controller.signal.throwIfAborted();
    assert.equal(server.child.exitCode, null, server.logs());
    try {
      if (
        (
          await fetch(`${origin}/api/health`, {
            signal: AbortSignal.timeout(1000),
          })
        ).status === 200
      )
        break;
    } catch (error) {
      if (Date.now() >= deadline) throw error;
    }
    assert.ok(Date.now() < deadline, 'Production health timed out');
    await delay(100, undefined, { signal: controller.signal });
  }
  connection = openRuntimeDatabase(join(dataDir, 'ariso.db'));
  await seedAuthOwner(connection, origin);
  const source = await readFile(
    new URL('../e2e/identity-auth.mjs', import.meta.url),
    'utf8',
  );
  async function phase(
    name: string,
    currentOrigin: string,
    secondSessionId?: string,
  ) {
    controller.signal.throwIfAborted();
    const reportPath = join(output, `${name}.json`);
    const config = {
      spaceId,
      phase: name,
      origin: currentOrigin,
      otherOrigin,
      credentials: { email, password },
      secondSessionId,
      report: reportPath,
    };
    const browser = promisify(execFile)('ego-browser', ['nodejs'], {
      signal: controller.signal,
      timeout: 120000,
      maxBuffer: 1024 * 1024,
    });
    browser.child.stdin!.end(
      `const config = ${JSON.stringify(config)};\n${source}`,
    );
    const { stdout, stderr } = await browser;
    await writeFile(join(output, `${name}.log`), stdout + stderr);
    console.log(stdout);
    if (stderr) console.error(stderr);
    return JSON.parse(await readFile(reportPath, 'utf8')) as {
      sessionId: string;
    };
  }
  const first = await phase('first-session', origin);
  connection.db.transaction((tx) =>
    updateSiteSettings(tx, {
      publicUrl: otherOrigin,
      timeZone: 'Asia/Shanghai',
    }),
  );
  const second = await phase('second-session', otherOrigin);
  assert.notEqual(first.sessionId, second.sessionId);
  connection.db.transaction((tx) =>
    updateSiteSettings(tx, { publicUrl: origin, timeZone: 'Asia/Shanghai' }),
  );
  await phase('logout-first', origin, second.sessionId);
  report.status = 'passed';
} finally {
  connection?.close();
  if (server) {
    await stop(server.child, server.closed);
    await writeFile(join(output, 'server.log'), server.logs());
  }
  if (directory) await rm(directory, { recursive: true, force: true });
  report.temporaryDirectoryRemoved = true;
  await writeFile(
    join(output, 'runner.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  process.off('SIGINT', interrupt);
  process.off('SIGTERM', interrupt);
}
