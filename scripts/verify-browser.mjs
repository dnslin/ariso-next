import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

assert.equal(process.versions.node.split('.')[0], '24', 'Use Node 24');
const output = resolve(
  process.env.BROWSER_REPORT_DIR ?? 'test-results/browser',
);
await mkdir(output, { recursive: true });
for (const name of [
  'browser.json',
  'shell-browser.json',
  'error-recovery.json',
  'library.json',
  'upload.json',
  'upload-polling.json',
  'm2-1440.json',
  'm2-390.json',
  ...[1440, 390].flatMap((width) =>
    ['setup', 'restart'].map((phase) => `identity-${width}-${phase}.json`),
  ),
])
  await rm(join(output, name), { force: true });
const temporary = await mkdtemp(join(tmpdir(), 'ariso-browser-'));
const report = {
  startedAt: new Date().toISOString(),
  platform: process.platform,
  arch: process.arch,
  node: process.version,
  status: 'failed',
};
await writeFile(
  join(output, 'runner.json'),
  `${JSON.stringify({ ...report, status: 'running' }, null, 2)}\n`,
);
let server;
let browser;
let shellServer;
let shellLogs = '';
let logs = '';
const secrets = [];
function setupCodes(value) {
  return value.split('\n').flatMap((line) => {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      return [];
    }
    return record.module === 'identity.setup' && record.event === 'setup-code'
      ? [record.code]
      : [];
  });
}
function redact(value) {
  let safe = String(value);
  for (const secret of [...secrets, ...setupCodes(logs)])
    safe = safe.replaceAll(secret, '[redacted]');
  return safe;
}
async function stop(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null)
    return;
  const closed = once(child, 'close');
  const signal = (name) => {
    try {
      process.kill(-child.pid, name);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  };
  signal('SIGTERM');
  const timer = setTimeout(() => signal('SIGKILL'), 5000);
  try {
    await closed;
  } finally {
    clearTimeout(timer);
  }
}
const controller = new AbortController();
const interrupt = () =>
  controller.abort(new Error('Browser verification interrupted'));
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);
try {
  const app = join(temporary, 'app');
  await cp(resolve('.next/standalone'), app, {
    recursive: true,
    verbatimSymlinks: true,
  });
  controller.signal.throwIfAborted();
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise((resolve, reject) =>
    socket.close((error) => (error ? reject(error) : resolve())),
  );
  // Chromium resolves *.localhost to loopback; unique hosts isolate test cookies.
  const origin = `http://ariso-${port}.localhost:${port}`;
  report.origin = origin;
  const productionEnv = {
    PATH: `${dirname(process.execPath)}:${process.env.PATH ?? '/usr/bin:/bin'}`,
    NODE_ENV: 'production',
    HOST: '127.0.0.1',
    PORT: String(port),
    BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
    ARISO_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
  };
  let spawnError;
  async function startProduction(dataDirectory) {
    const logStart = logs.length;
    spawnError = undefined;
    server = spawn('sh', [join(app, 'entrypoint.sh')], {
      cwd: temporary,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...productionEnv, DATA_DIR: dataDirectory },
    });
    server.stdout.on('data', (chunk) => {
      logs += chunk;
    });
    server.stderr.on('data', (chunk) => {
      logs += chunk;
    });
    server.on('error', (error) => {
      spawnError = error;
    });
    const deadline = Date.now() + 30000;
    while (true) {
      controller.signal.throwIfAborted();
      if (spawnError) throw spawnError;
      assert.equal(
        server.exitCode,
        null,
        `Production server exited: ${redact(logs)}`,
      );
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
          signal: AbortSignal.timeout(1000),
        });
        if (response.status === 200) break;
      } catch (error) {
        if (Date.now() >= deadline) throw error;
      }
      assert.ok(Date.now() < deadline, 'Production server health timed out');
      await delay(100, undefined, { signal: controller.signal });
    }
    return setupCodes(logs.slice(logStart));
  }
  await startProduction(join(temporary, 'data'));
  const shellSocket = createServer();
  shellSocket.listen(0, '127.0.0.1');
  await once(shellSocket, 'listening');
  const shellPort = shellSocket.address().port;
  await new Promise((resolve, reject) =>
    shellSocket.close((error) => (error ? reject(error) : resolve())),
  );
  const shellOrigin = `http://127.0.0.1:${shellPort}`;
  shellServer = spawn(
    process.execPath,
    [
      resolve('node_modules/next/dist/bin/next'),
      'start',
      resolve('tests/experiments/shell'),
      '--hostname',
      '127.0.0.1',
      '--port',
      String(shellPort),
    ],
    { detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  shellServer.stdout.on('data', (chunk) => {
    shellLogs += chunk;
  });
  shellServer.stderr.on('data', (chunk) => {
    shellLogs += chunk;
  });
  shellServer.on('error', (error) => {
    spawnError = error;
  });
  const shellDeadline = Date.now() + 30000;
  while (true) {
    controller.signal.throwIfAborted();
    if (spawnError) throw spawnError;
    assert.equal(
      shellServer.exitCode,
      null,
      `Shell fixture exited: ${shellLogs}`,
    );
    try {
      if (
        (
          await fetch(`${shellOrigin}/dashboard`, {
            signal: AbortSignal.timeout(1000),
          })
        ).status === 200
      )
        break;
    } catch (error) {
      if (Date.now() >= shellDeadline) throw error;
    }
    assert.ok(Date.now() < shellDeadline, 'Shell fixture startup timed out');
    await delay(100, undefined, { signal: controller.signal });
  }
  const config = {
    nodeExecutable: process.execPath,
    projectDirectory: resolve('.'),
    databasePath: join(temporary, 'data', 'ariso.db'),
    errorsScript: pathToFileURL(resolve('e2e/browser-errors.mjs')).href,
    identitySessionScript: pathToFileURL(resolve('e2e/identity-session.mjs'))
      .href,
    recoveryScript: pathToFileURL(resolve('e2e/error-recovery.mjs')).href,
    libraryDetailScript: pathToFileURL(resolve('e2e/library-detail.mjs')).href,
    shellOrigin,
    shellScript: pathToFileURL(resolve('e2e/shell.mjs')).href,
    origin,
    output,
    spaceId: process.env.EGO_TASK_SPACE
      ? Number(process.env.EGO_TASK_SPACE)
      : undefined,
    keepSpace: true,
  };
  if (config.spaceId !== undefined)
    assert.ok(
      Number.isInteger(config.spaceId) && config.spaceId > 0,
      'Invalid EGO_TASK_SPACE',
    );
  async function runBrowser(script, browserConfig, logName) {
    const source = await readFile(new URL(script, import.meta.url), 'utf8');
    browser = spawn('ego-browser', ['nodejs'], {
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let browserLogs = '';
    browser.stdout.on('data', (chunk) => {
      browserLogs += chunk;
    });
    browser.stderr.on('data', (chunk) => {
      browserLogs += chunk;
    });
    const closed = once(browser, 'close', { signal: controller.signal });
    browser.stdin.on('error', () => {
      /* Process close/error below reports a failed CLI. */
    });
    browser.stdin.end(
      `const config = ${JSON.stringify(browserConfig)};\n${source}`,
    );
    const timeout = setTimeout(interrupt, 300000);
    try {
      const [code] = await closed;
      assert.equal(code, 0, `Ego browser verification failed (${logName})`);
    } finally {
      clearTimeout(timeout);
      const safeLogs = redact(browserLogs);
      process.stdout.write(safeLogs);
      await writeFile(join(output, logName), safeLogs);
    }
  }
  await runBrowser('../e2e/runtime.mjs', config, 'ego.log');
  const runtimeReport = JSON.parse(
    await readFile(join(output, 'browser.json'), 'utf8'),
  );
  report.taskSpaceId = runtimeReport.taskSpaceId;
  report.identity = [];
  await stop(server);
  await stop(shellServer);
  for (const width of [1440, 390]) {
    const dataDirectory = join(temporary, `identity-${width}`);
    const codes = await startProduction(dataDirectory);
    assert.equal(codes.length, 1, 'Empty directory must issue one setup code');
    secrets.push(codes[0]);
    const credentials = {
      email: `owner-${width}@example.test`,
      password: randomBytes(18).toString('hex'),
    };
    secrets.push(credentials.password);
    const identityConfig = {
      ...config,
      spaceId: report.taskSpaceId,
      width,
      code: codes[0],
      credentials,
      databasePath: join(dataDirectory, 'ariso.db'),
      dataDirectory,
    };
    await runBrowser(
      '../e2e/identity.mjs',
      { ...identityConfig, phase: 'setup' },
      `identity-${width}-setup.log`,
    );
    await stop(server);
    assert.deepEqual(
      await startProduction(dataDirectory),
      [],
      'Initialized restart must not issue another code',
    );
    await runBrowser(
      '../e2e/identity.mjs',
      {
        ...identityConfig,
        phase: 'restart',
        keepSpace: true,
      },
      `identity-${width}-restart.log`,
    );
    report.identity.push({ width, setup: 'passed', restart: 'passed' });
    if (width === 390) {
      await runBrowser('../e2e/library.mjs', identityConfig, 'library.log');
      await runBrowser('../e2e/upload.mjs', identityConfig, 'upload.log');
      await runBrowser(
        '../e2e/upload-polling.mjs',
        identityConfig,
        'upload-polling.log',
      );
      report.uploadPolling = 'passed';
      report.upload = 'passed';
      report.library = 'passed';
    }
    await runBrowser(
      '../e2e/m2.mjs',
      { ...identityConfig, phase: 'before' },
      `m2-${width}-before.log`,
    );
    await stop(server);
    assert.deepEqual(await startProduction(dataDirectory), []);
    await runBrowser(
      '../e2e/m2.mjs',
      { ...identityConfig, phase: 'after' },
      `m2-${width}-after.log`,
    );
    report[`m2-${width}`] = 'passed';
    await stop(server);
  }
  // Reuse the same Ego space for isolated UI/library checks and let its runner
  // close it after the final successful suite (unless the caller keeps it).
  browser = spawn(process.execPath, ['run-browser.mjs'], {
    cwd: resolve('tests/experiments/ui'),
    detached: true,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: {
      ...process.env,
      EGO_TASK_SPACE: String(report.taskSpaceId),
      BROWSER_REPORT_DIR: join(output, 'ui'),
    },
  });
  const [uiCode] = await once(browser, 'close', { signal: controller.signal });
  assert.equal(uiCode, 0, 'Isolated UI/library browser verification failed');
  report.status = 'passed';
} catch (error) {
  report.error = redact(error.stack ?? String(error));
  process.exitCode = 1;
  console.error(report.error);
} finally {
  await stop(browser);
  await stop(server);
  await stop(shellServer);
  await writeFile(join(output, 'shell-server.log'), shellLogs);
  await writeFile(join(output, 'server.log'), redact(logs));
  await rm(temporary, { recursive: true, force: true });
  report.finishedAt = new Date().toISOString();
  report.temporaryDirectoryRemoved = true;
  await writeFile(
    join(output, 'runner.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  process.removeListener('SIGINT', interrupt);
  process.removeListener('SIGTERM', interrupt);
  console.log(`Browser report: ${output}`);
}
