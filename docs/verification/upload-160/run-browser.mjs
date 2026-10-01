import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
const projectDirectory = resolve('.');
const { launch, stop } = await import(
  pathToFileURL(
    join(projectDirectory, 'tests/integration/runtime/process-helpers.ts'),
  )
);
assert.equal(process.versions.node.split('.')[0], '24');
const mode = process.argv[2] ?? 'submissions';
assert.ok(['submissions', 'regression', 'polling'].includes(mode));
const spaceId = Number(process.env.EGO_TASK_SPACE);
assert.ok(
  Number.isInteger(spaceId) && spaceId > 0,
  'Resume an existing Ego space with EGO_TASK_SPACE',
);
const output = resolve(projectDirectory, `test-results/upload-160-${mode}`);
const temporary = await mkdtemp(join(tmpdir(), 'ariso-160-target-'));
const dataDirectory = join(temporary, 'data');
await mkdir(output, { recursive: true });
const server = await launch(
  resolve(projectDirectory, '.next/standalone'),
  temporary,
  { DATA_DIR: dataDirectory, PATH: process.env.PATH, HOST: '127.0.0.1' },
);
const origin = `http://ariso-input-${server.port}.localhost:${server.port}`;
const credentials = {
  email: 'issue160@example.test',
  password: randomBytes(24).toString('hex'),
};
const report = {
  startedAt: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  origin,
  spaceId,
  mode,
  status: 'failed',
};
let code;
try {
  const deadline = Date.now() + 30000;
  let healthError;
  while (true) {
    assert.equal(
      server.child.exitCode,
      null,
      'Production server remains running',
    );
    try {
      if (
        (
          await fetch(`http://127.0.0.1:${server.port}/api/health`, {
            signal: AbortSignal.timeout(1000),
          })
        ).ok
      )
        break;
    } catch (error) {
      healthError = error;
    }
    assert.ok(
      Date.now() < deadline,
      `Production health deadline: ${healthError ?? 'non-200 health response'}`,
    );
    await delay(100);
  }
  for (const line of server.logs().split('\n')) {
    try {
      const row = JSON.parse(line);
      if (row.event === 'setup-code') code = row.code;
    } catch {}
  }
  assert.ok(code, 'New isolated runtime issued setup code');
  const setup = await fetch(`${origin}/api/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({
      code,
      ...credentials,
      publicUrl: origin,
      timeZone: 'Asia/Shanghai',
    }),
  });
  assert.equal(setup.status, 200, await setup.text());
  const config = {
    projectDirectory,
    output,
    origin,
    spaceId,
    credentials,
    nodeExecutable: process.execPath,
    databasePath: join(dataDirectory, 'ariso.db'),
    dataDirectory,
    identitySessionScript: pathToFileURL(
      join(projectDirectory, 'e2e/identity-session.mjs'),
    ).href,
    libraryDetailScript: pathToFileURL(
      join(projectDirectory, 'e2e/library-detail.mjs'),
    ).href,
  };
  const source = await readFile(
    join(
      projectDirectory,
      `e2e/${{ submissions: 'upload-submissions', regression: 'upload', polling: 'upload-polling' }[mode]}.mjs`,
    ),
    'utf8',
  );
  const browser = spawn('ego-browser', ['nodejs'], {
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let logs = '';
  browser.stdout.on('data', (chunk) => {
    logs += chunk;
    process.stdout.write(chunk);
  });
  browser.stderr.on('data', (chunk) => {
    logs += chunk;
    process.stderr.write(chunk);
  });
  const closed = once(browser, 'close');
  browser.stdin.end(`const config = ${JSON.stringify(config)};\n${source}`);
  const [exit] = await closed;
  await writeFile(
    join(output, 'ego.log'),
    logs
      .replaceAll(credentials.password, '[redacted]')
      .replaceAll(code, '[redacted]'),
  );
  assert.equal(exit, 0, 'Target upload input browser passed');
  report.status = 'passed';
} catch (error) {
  report.error = String(error.stack ?? error);
  throw error;
} finally {
  await stop(server.child, server.closed);
  await writeFile(
    join(output, 'server.log'),
    server
      .logs()
      .replaceAll(credentials.password, '[redacted]')
      .replaceAll(code ?? 'NO_SETUP_CODE', '[redacted]'),
  );
  await rm(temporary, { recursive: true, force: true });
  report.finishedAt = new Date().toISOString();
  report.temporaryRemoved = true;
  await writeFile(
    join(output, 'runner.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
}
