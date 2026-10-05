import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { startCorsFixture } from '../e2e/storage-cors-fixture.mjs';
import { startUploadEndpoint } from '../tests/integration/upload/s3-endpoint.ts';
import { launchProtocolDelivery } from '../tests/integration/delivery/s3-fixture.ts';
import { runBrowserStage } from './browser-stages.mjs';

assert.equal(process.versions.node.split('.')[0], '24', 'Use Node 24');
const { values } = parseArgs({
  args: process.argv.slice(process.argv[2] === '--' ? 3 : 2),
  options: {
    suite: { type: 'string', default: 'full' },
    only: { type: 'string' },
    'storage-config': { type: 'string' },
    'preview-config': { type: 'string' },
  },
});
const suite = values.suite;
const only = values.only;
const singleSuites = {
  library: 'library',
  'shell-navigation': 'shellNavigation',
  albums: 'albums',
  'album-cover': 'albumCover',
  tags: 'tags',
  'upload-input': 'uploadInput',
};
assert.ok(
  [
    'full',
    'viewer',
    'upload',
    'upload-regression',
    'm2-mobile',
    'upload-s3',
    'copy-dropdown',
    'library-batch',
    'library-reprocess',
    'library-copy',
    'storage-admin',
    'processing',
    'trash',
    'sharing-experiment',
    'sharing-protocol',
    ...Object.keys(singleSuites),
  ].includes(suite),
  'Unknown browser suite',
);
assert.ok(
  only === undefined ||
    (suite === 'processing' &&
      [
        'representative',
        'settings',
        'preview',
        'recovery',
        'consumers',
      ].includes(only)) ||
    (suite === 'upload' && ['relations', 'submissions'].includes(only)) ||
    (suite === 'upload-regression' && only === 'main') ||
    (suite === 'library' && only === 'recovery') ||
    (suite === 'upload-s3' && only === 'cleanup') ||
    (suite === 'storage-admin' &&
      ['live', 'dialogs', 'feedback', 'regressions'].includes(only)) ||
    (suite === 'viewer' &&
      [
        'representative',
        'behavior',
        'recovery',
        'refresh',
        'consumers',
        'deleted-source',
        'pending-navigation',
      ].includes(only)) ||
    (suite === 'library-copy' &&
      ['representative', 'feedback', 'revision'].includes(only)) ||
    (suite === 'trash' &&
      [
        'representative',
        'cleanup',
        'query-error',
        'confirmation',
        'approved-ui',
        'approved-results',
        'approved-query',
        'approved-progress',
        'review-fixes',
      ].includes(only)) ||
    (suite === 'library-batch' &&
      [
        'representative',
        'visibility',
        'feedback',
        'tag-states',
        'lifecycle',
        'cache',
        'review-fixes',
      ].includes(only)),
  '--only requires an applicable targeted suite',
);
assert.ok(
  !values['preview-config'] ||
    (suite === 'storage-admin' && only === 'feedback'),
  '--preview-config applies only to storage-admin feedback',
);
assert.ok(
  !values['storage-config'] || (suite === 'storage-admin' && only === 'live'),
  '--storage-config applies only to storage-admin live',
);
const pageLabel = process.env.EGO_PAGE_LABEL ?? 'p1';
assert.match(pageLabel, /^p[1-9]\d*$/, 'Invalid EGO_PAGE_LABEL');
assert.ok(
  !['full', 'm2-mobile'].includes(suite) || pageLabel === 'p1',
  `Browser suite ${suite} requires EGO_PAGE_LABEL=p1`,
);

const output = resolve(
  process.env.BROWSER_REPORT_DIR ??
    `test-results/browser${suite === 'full' ? '' : `-${suite}`}`,
);
await mkdir(output, { recursive: true });
for (const name of [
  'browser.json',
  'shell-browser.json',
  'shell-navigation.json',
  'error-recovery.json',
  'library.json',
  'library-viewer.json',
  'library-query.json',
  'library-feedback.json',
  'library-selection.json',
  'library-selection-reconciliation.json',
  'library-batch.json',
  'library-batch-failure.png',
  'trash-query-batch.json',
  'trash-cleanup.json',
  'library-reprocess.json',
  'library-reprocess-failure.png',
  'library-copy.json',
  'library-copy-failure.png',
  'library-filters.json',
  'library-scale.json',
  'albums.json',
  'album-cover.json',
  'tags.json',
  'upload.json',
  'upload-submissions.json',
  'upload-relations.json',
  'upload-polling.json',
  'upload-input.json',
  'upload-s3.json',
  'copy-dropdown.json',
  'storage-cors.json',
  'storage-admin.json',
  'storage-admin-failure.png',
  'storage-admin-dialogs.json',
  'storage-admin-dialogs-failure.png',
  'storage-admin-live.json',
  'storage-admin-live-failure.png',
  'storage-admin-feedback.json',
  'storage-admin-feedback-failure.png',
  'storage-admin-regressions.json',
  'storage-admin-regressions-failure.png',
  'processing.json',
  'processing-failure.png',
  'delivery-s3/browser.json',
  'sharing-experiment.json',
  'sharing-protocol.json',
  'm2-1440.json',
  'm2-390.json',
  'interaction-polish-1440.json',
  'interaction-polish-390.json',
  'workspace-continuity-1440.json',
  'workspace-continuity-390.json',
  ...[1440, 390].flatMap((width) =>
    ['setup', 'restart'].map((phase) => `identity-${width}-${phase}.json`),
  ),
])
  await rm(join(output, name), { force: true });
const report = {
  startedAt: new Date().toISOString(),
  platform: process.platform,
  arch: process.arch,
  node: process.version,
  status: 'failed',
  suite,
  only,
  pageLabel,
};
await writeFile(
  join(output, 'runner.json'),
  `${JSON.stringify({ ...report, status: 'running' }, null, 2)}\n`,
);
let server;
let browser;
let shellServer;
let corsFixture;
let deliveryFixture;
const sharingFixtures = new Set();
const uploadFixtures = [];
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
async function runBrowser(script, browserConfig, logName) {
  const source = await readFile(new URL(script, import.meta.url), 'utf8');
  controller.signal.throwIfAborted();
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
  const child = browser;
  const closed = once(child, 'close', {
    signal: AbortSignal.any([controller.signal, AbortSignal.timeout(600000)]),
  });
  browser.stdin.on('error', () => {
    /* Process close/error below reports a failed CLI. */
  });
  browser.stdin.end(
    `const config = ${JSON.stringify(browserConfig)};\n${source}`,
  );
  // Full screenshot matrices can exceed five minutes; behavior waits stay bounded.
  try {
    const [code] = await closed;
    assert.equal(code, 0, `Ego browser verification failed (${logName})`);
  } finally {
    await stop(child);
    const safeLogs = redact(browserLogs);
    process.stdout.write(safeLogs);
    await writeFile(join(output, logName), safeLogs);
  }
}
async function runSharingExperiment(spaceId) {
  const { launchSharing } =
    await import('../tests/experiments/sharing/harness.ts');
  const sharingFixture = await launchSharing(controller.signal);
  sharingFixtures.add(sharingFixture);
  try {
    secrets.push('sharing-password', 'sharing-experiment-password');
    report.sharingOrigin = sharingFixture.origin;
    await runBrowser(
      '../tests/experiments/sharing/browser.mjs',
      { origin: sharingFixture.origin, spaceId, pageLabel, output },
      'sharing-experiment.log',
    );
    report.sharingExperiment = 'passed';
    report.sharingBrowserContexts = 'unverified';
  } finally {
    try {
      await writeFile(
        join(output, 'sharing-server.log'),
        redact(sharingFixture.logs()),
      );
    } finally {
      await sharingFixture.stop();
      sharingFixtures.delete(sharingFixture);
    }
  }
}
async function runSharingProtocol(spaceId) {
  const { launchSharingProtocol } =
    await import('../e2e/sharing-protocol-fixture.ts');
  const sharingFixture = await launchSharingProtocol(controller.signal);
  sharingFixtures.add(sharingFixture);
  try {
    secrets.push(
      'sharing-protocol-password',
      ...sharingFixture.browserInput.tokens,
      ...setupCodes(sharingFixture.logs()),
    );
    await runBrowser(
      '../e2e/sharing-protocol.mjs',
      { ...sharingFixture.browserInput, spaceId, pageLabel, output },
      'sharing-protocol.log',
    );
    await sharingFixture.verify();
    report.sharingProtocol = 'passed';
  } finally {
    try {
      await writeFile(
        join(output, 'sharing-protocol-server.log'),
        redact(sharingFixture.logs()),
      );
    } finally {
      await sharingFixture.stop();
      sharingFixtures.delete(sharingFixture);
    }
  }
}
if (suite === 'full') {
  report.stages = {};
  report.taskSpaceId = process.env.EGO_TASK_SPACE
    ? Number(process.env.EGO_TASK_SPACE)
    : undefined;
}
const check = (name, operation, dependencies = []) => {
  controller.signal.throwIfAborted();
  return runBrowserStage(
    report.stages,
    name,
    operation,
    async (error) => {
      console.error(
        redact(`Browser stage failed (${name}): ${error.stack ?? error}`),
      );
      controller.signal.throwIfAborted();
      if (!report.taskSpaceId) {
        const runtimeReport = JSON.parse(
          await readFile(join(output, 'browser.json'), 'utf8'),
        );
        report.taskSpaceId = runtimeReport.taskSpaceId;
      }
      await runBrowser(
        '../e2e/browser-failure-state.mjs',
        {
          spaceId: report.taskSpaceId,
          pageLabel,
        },
        `${name}-failure-state.log`,
      );
    },
    dependencies,
  );
};

if (suite === 'sharing-experiment' || suite === 'sharing-protocol') {
  try {
    const spaceId = Number(process.env.EGO_TASK_SPACE);
    assert.ok(
      Number.isInteger(spaceId) && spaceId > 0,
      'Existing Ego space required',
    );
    report.taskSpaceId = spaceId;
    if (suite === 'sharing-protocol') await runSharingProtocol(spaceId);
    else await runSharingExperiment(spaceId);
    report.status = 'passed';
  } catch (error) {
    report.error = redact(error.stack ?? String(error));
    process.exitCode = 1;
    console.error(report.error);
  } finally {
    await stop(browser);
    for (const fixture of sharingFixtures) await fixture.stop();
    report.finishedAt = new Date().toISOString();
    await writeFile(
      join(output, 'runner.json'),
      `${redact(JSON.stringify(report, null, 2))}\n`,
    );
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
    console.log(`Browser report: ${output}`);
  }
  process.exit(process.exitCode ?? 0);
}
if (suite === 'storage-admin' && only === 'feedback') {
  try {
    assert.ok(values['preview-config'], 'Feedback requires --preview-config');
    const preview = JSON.parse(
      await readFile(resolve(values['preview-config']), 'utf8'),
    );
    const spaceId = Number(process.env.EGO_TASK_SPACE);
    assert.ok(
      Number.isInteger(spaceId) && spaceId > 0,
      'Existing Ego space required',
    );
    assert.ok(preview.origin && preview.email && preview.password);
    secrets.push(preview.password);
    report.origin = preview.origin;
    report.taskSpaceId = spaceId;
    report.existingPreview = true;
    await runBrowser(
      '../e2e/storage-admin-feedback.mjs',
      {
        origin: preview.origin,
        credentials: { email: preview.email, password: preview.password },
        spaceId,
        pageLabel,
        output,
        geometryScript: pathToFileURL(resolve('e2e/browser-geometry.mjs')).href,
      },
      'storage-admin-feedback.log',
    );
    report.storageAdminFeedback = 'passed';
    report.status = 'passed';
  } catch (error) {
    report.error = redact(error.stack ?? String(error));
    process.exitCode = 1;
    console.error(report.error);
  } finally {
    await stop(browser);
    report.finishedAt = new Date().toISOString();
    await writeFile(
      join(output, 'runner.json'),
      `${redact(JSON.stringify(report, null, 2))}\n`,
    );
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
    console.log(`Browser report: ${output}`);
  }
  process.exit(process.exitCode ?? 0);
}
const temporary = await mkdtemp(join(tmpdir(), 'ariso-browser-'));
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
  if (suite === 'storage-admin' && only === 'live') {
    for (const name of [
      'HTTP_PROXY',
      'HTTPS_PROXY',
      'ALL_PROXY',
      'http_proxy',
      'https_proxy',
      'all_proxy',
      'NODE_USE_ENV_PROXY',
    ])
      if (process.env[name]) productionEnv[name] = process.env[name];
    const bypass = [
      ...new Set(
        `${process.env.NO_PROXY ?? ''},${process.env.no_proxy ?? ''},localhost,127.0.0.1,::1,.localhost`
          .split(',')
          .filter(Boolean),
      ),
    ].join(',');
    productionEnv.NO_PROXY = bypass;
    productionEnv.no_proxy = bypass;
  }
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
  let codes;
  if (suite === 'full')
    await check('runtime-start', () =>
      startProduction(join(temporary, 'data')),
    );
  else codes = await startProduction(join(temporary, 'data'));
  let shellOrigin;
  if (suite === 'full') {
    await check('shell-start', async () => {
      const shellSocket = createServer();
      shellSocket.listen(0, '127.0.0.1');
      await once(shellSocket, 'listening');
      const shellPort = shellSocket.address().port;
      await new Promise((resolve, reject) =>
        shellSocket.close((error) => (error ? reject(error) : resolve())),
      );
      shellOrigin = `http://127.0.0.1:${shellPort}`;
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
        assert.ok(
          Date.now() < shellDeadline,
          'Shell fixture startup timed out',
        );
        await delay(100, undefined, { signal: controller.signal });
      }
    });
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
    libraryDetail171Script: pathToFileURL(resolve('e2e/library-detail-171.mjs'))
      .href,
    libraryViewerScript: pathToFileURL(resolve('e2e/library-viewer.mjs')).href,
    storageCorsUiScript: pathToFileURL(resolve('e2e/storage-cors-ui.mjs')).href,
    shellOrigin,
    shellScript: pathToFileURL(resolve('e2e/shell.mjs')).href,
    origin,
    output,
    spaceId: process.env.EGO_TASK_SPACE
      ? Number(process.env.EGO_TASK_SPACE)
      : undefined,
    keepSpace: true,
    pageLabel,
  };
  if (config.spaceId !== undefined)
    assert.ok(
      Number.isInteger(config.spaceId) && config.spaceId > 0,
      'Invalid EGO_TASK_SPACE',
    );
  if (suite !== 'full') {
    assert.ok(
      config.spaceId,
      'Targeted suite requires an existing EGO_TASK_SPACE',
    );
    assert.equal(
      codes.length,
      1,
      'Empty targeted runtime issues one setup code',
    );
    secrets.push(codes[0]);
    const credentials = {
      email: `${suite}-browser@example.test`,
      password: randomBytes(24).toString('hex'),
    };
    secrets.push(credentials.password);
    const setup = await fetch(`${origin}/api/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({
        code: codes[0],
        ...credentials,
        publicUrl: origin,
        timeZone: 'Asia/Shanghai',
      }),
      signal: controller.signal,
    });
    assert.equal(setup.status, 200, await setup.text());
    const focusedConfig = {
      ...config,
      credentials,
      dataDirectory: join(temporary, 'data'),
      onlyCleanup: suite === 'upload-s3' && only === 'cleanup',
      phase: suite === 'copy-dropdown' ? 'green' : undefined,
      viewerRepresentativeOnly: suite === 'viewer' && only === 'representative',
      viewerCheck: suite === 'viewer' ? only : undefined,
      libraryCopyPhase: suite === 'library-copy' ? only : undefined,
      libraryPhase: suite === 'library' ? only : undefined,
      storageNavigation: suite === 'storage-admin' && only === undefined,
      processingPhase: suite === 'processing' ? only : undefined,
      processingNavigationFixtures:
        suite === 'processing' && (only === undefined || only === 'consumers'),
    };
    if (suite === 'storage-admin' && only === 'live') {
      assert.ok(
        values['storage-config'],
        'Live storage management suite requires --storage-config',
      );
      const targets = JSON.parse(
        await readFile(resolve(values['storage-config']), 'utf8'),
      );
      assert.ok(Array.isArray(targets), 'Storage targets must be an array');
      for (const service of ['r2', 'seaweedfs'])
        assert.ok(
          targets.some((target) => target.service === service),
          `Missing ${service} target`,
        );
      for (const target of targets) {
        assert.ok(
          target.credentials?.accessKeyId &&
            target.credentials?.secretAccessKey,
          'Target credentials must be present',
        );
        secrets.push(
          target.credentials.accessKeyId,
          target.credentials.secretAccessKey,
        );
      }
      focusedConfig.storageTargets = targets.filter((target) =>
        ['r2', 'seaweedfs'].includes(target.service),
      );
      focusedConfig.r2NoLockEvidence =
        'docs/tasks/evidence/EV-STORAGE-01/README.md';
    }
    if (
      suite === 'storage-admin' &&
      only !== 'live' &&
      only !== 'regressions'
    ) {
      corsFixture = await startCorsFixture(origin);
      focusedConfig.corsFixture = corsFixture.endpoint;
    }
    if (suite === 'upload-s3') {
      const { openRuntimeDatabase } =
        await import('../src/server/runtime/db.ts');
      const { createSecretCrypto } =
        await import('../src/server/runtime/crypto.ts');
      const { storageConfigs } =
        await import('../src/server/storage/schema.ts');
      const crypto = createSecretCrypto(
        Buffer.from(productionEnv.ARISO_ENCRYPTION_KEY, 'hex'),
      );
      const connection = openRuntimeDatabase(config.databasePath);
      const targets = {};
      try {
        for (const route of ['direct', 'relay']) {
          const endpoint = await startUploadEndpoint({
            corsOrigin: origin,
            control: true,
          });
          uploadFixtures.push(endpoint);
          const id = randomUUID();
          const now = new Date();
          connection.db
            .insert(storageConfigs)
            .values({
              id,
              name: route === 'direct' ? '浏览器 S3 直传' : '浏览器 S3 中转',
              type: 's3',
              enabled: true,
              endpoint: endpoint.target.endpoint,
              region: endpoint.target.region,
              bucket: endpoint.target.bucket,
              pathPrefix: 'browser-upload',
              forcePathStyle: true,
              accessKeyEncrypted: crypto.encryptSecret(
                endpoint.target.credentials.accessKeyId,
              ),
              secretKeyEncrypted: crypto.encryptSecret(
                endpoint.target.credentials.secretAccessKey,
              ),
              connectionStatus: 'passed',
              connectionRevision: 1,
              corsStatus: route === 'direct' ? 'passed' : 'untested',
              corsRevision: route === 'direct' ? 1 : null,
              corsOrigin: route === 'direct' ? origin : null,
              createdAt: now,
              updatedAt: now,
            })
            .run();
          targets[route] = { id, endpoint: endpoint.target.endpoint };
        }
      } finally {
        connection.close();
      }
      focusedConfig.uploadS3 = targets;
    }
    const stages = singleSuites[suite]
      ? [[suite, singleSuites[suite]]]
      : suite === 'processing'
        ? only === undefined || only === 'consumers'
          ? [
              ['processing', 'processing'],
              ['shell-navigation', 'shellNavigation'],
            ]
          : [['processing', 'processing']]
        : suite === 'storage-admin'
          ? only === 'live'
            ? [['storage-admin-live', 'storageAdmin']]
            : only === 'dialogs'
              ? [['storage-admin-dialogs', 'storageAdmin']]
              : only === 'regressions'
                ? [['storage-admin-regressions', 'storageAdminRegressions']]
                : [
                    ['storage-admin', 'storageAdmin'],
                    ['shell-navigation', 'shellNavigation'],
                  ]
          : suite === 'copy-dropdown'
            ? [['library-copy-dropdown', 'copyDropdown']]
            : suite === 'upload-s3'
              ? [['upload-s3', 'uploadS3']]
              : suite === 'viewer'
                ? [['library-viewer-run', 'libraryViewer']]
                : suite === 'library-batch'
                  ? [['library-batch', 'libraryBatch']]
                  : suite === 'trash'
                    ? [
                        ['trash-query-batch', 'trashQueryBatch'],
                        ['trash-cleanup', 'trashCleanup'],
                      ]
                    : suite === 'library-reprocess'
                      ? [['library-batch-reprocess', 'libraryReprocess']]
                      : suite === 'library-copy'
                        ? [['library-copy', 'libraryCopy']]
                        : suite === 'upload'
                          ? [
                              ['upload-submissions', 'uploadSubmissions'],
                              ['upload-relations', 'uploadRelations'],
                            ]
                          : suite === 'm2-mobile'
                            ? []
                            : [
                                ['upload', 'upload'],
                                ['upload-polling', 'uploadPolling'],
                              ];
    report.taskSpaceId = config.spaceId;
    report.stages = {};
    for (const [script, result] of stages) {
      if (
        suite === 'trash' &&
        (([
          'representative',
          'query-error',
          'confirmation',
          'approved-ui',
          'approved-results',
          'approved-query',
          'approved-progress',
          'review-fixes',
        ].includes(only) &&
          script === 'trash-cleanup') ||
          (only === 'cleanup' && script === 'trash-query-batch'))
      )
        continue;
      if (
        suite === 'upload' &&
        only !== undefined &&
        script !== `upload-${only}`
      )
        continue;
      if (
        suite === 'upload-regression' &&
        only === 'main' &&
        script !== 'upload'
      )
        continue;
      const passed = await check(script, () =>
        runBrowser(
          `../e2e/${script}.mjs`,
          {
            ...focusedConfig,
            libraryBatchPhase: suite === 'library-batch' ? only : undefined,
            trashPhase: suite === 'trash' ? only : undefined,
          },
          `${script}.log`,
        ),
      );
      if (passed) report[result] = 'passed';
    }
    if (suite === 'm2-mobile') {
      const mobileConfig = { ...focusedConfig, width: 390 };
      const beforeName = 'm2-390-before';
      await check(beforeName, () =>
        runBrowser(
          '../e2e/m2.mjs',
          { ...mobileConfig, phase: 'before' },
          `${beforeName}.log`,
        ),
      );
      await check(
        'm2-390-after',
        async () => {
          await stop(server);
          assert.deepEqual(
            await startProduction(focusedConfig.dataDirectory),
            [],
            'Initialized restart must not issue another code',
          );
          await runBrowser(
            '../e2e/m2.mjs',
            { ...mobileConfig, phase: 'after' },
            'm2-390-after.log',
          );
        },
        [beforeName],
      );
    }
    assert.ok(
      Object.values(report.stages).every((stage) => stage.status === 'passed'),
      'Focused browser stages failed',
    );
  } else {
    await check(
      'runtime',
      () => runBrowser('../e2e/runtime.mjs', config, 'ego.log'),
      ['runtime-start', 'shell-start'],
    );
    if (!report.taskSpaceId) {
      const runtimeReport = JSON.parse(
        await readFile(join(output, 'browser.json'), 'utf8'),
      );
      report.taskSpaceId = runtimeReport.taskSpaceId;
    }
    await stop(server);
    await stop(shellServer);
    for (const width of [1440, 390]) {
      const dataDirectory = join(temporary, `identity-${width}`);
      const credentials = {
        email: `owner-${width}@example.test`,
        password: randomBytes(18).toString('hex'),
      };
      secrets.push(credentials.password);
      const identityConfig = {
        ...config,
        spaceId: report.taskSpaceId,
        width,
        credentials,
        databasePath: join(dataDirectory, 'ariso.db'),
        dataDirectory,
      };
      const setupName = `identity-${width}-setup`;
      const restartName = `identity-${width}-restart`;
      const startName = `identity-${width}-start`;
      const ownerName = `owner-runtime-${width}`;
      await check(startName, async () => {
        const codes = await startProduction(dataDirectory);
        assert.equal(
          codes.length,
          1,
          'Empty directory must issue one setup code',
        );
        secrets.push(codes[0]);
        identityConfig.code = codes[0];
      });
      await check(setupName, async () => {
        await runBrowser(
          '../e2e/identity.mjs',
          { ...identityConfig, phase: 'setup' },
          `${setupName}.log`,
        );
      }, [startName]);
      await check(ownerName, async () => {
        await stop(server);
        assert.deepEqual(
          await startProduction(dataDirectory),
          [],
          'Initialized restart must not issue another code',
        );
        const owner = await fetch(`${origin}/api/auth/get-session`, {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(10000),
          ]),
        });
        assert.equal(
          owner.status,
          200,
          'Business fixtures require an initialized owner and a ready auth service',
        );
      }, [startName]);
      await check(restartName, async () => {
        await runBrowser(
          '../e2e/identity.mjs',
          { ...identityConfig, phase: 'restart', keepSpace: true },
          `${restartName}.log`,
        );
      }, [setupName, ownerName]);
      const business = (name, script, extra = {}) =>
        check(
          name,
          () =>
            runBrowser(
              `../e2e/${script}.mjs`,
              { ...identityConfig, ...extra },
              `${name}.log`,
            ),
          [ownerName],
        );
      if (width === 390) {
        await business('processing', 'processing');
        try {
          await check(
            'storage-admin',
            async () => {
              corsFixture = await startCorsFixture(origin);
              await runBrowser(
                '../e2e/storage-admin.mjs',
                { ...identityConfig, corsFixture: corsFixture.endpoint },
                'storage-admin.log',
              );
            },
            [ownerName],
          );
          await check(
            'storage-cors',
            async () => {
              corsFixture ??= await startCorsFixture(origin);
              await runBrowser(
                '../e2e/storage-cors.mjs',
                { ...identityConfig, corsFixture: corsFixture.endpoint },
                'storage-cors.log',
              );
            },
            [ownerName],
          );
        } finally {
          if (corsFixture)
            await check('storage-cors-close', async () => {
              await corsFixture.close();
              corsFixture = undefined;
            });
        }
        await business('library', 'library');
        for (const phase of [
          'feedback',
          'selection',
          'selection-reconciliation',
          'query',
          'filters',
          'scale',
        ]) {
          await business(`library-${phase}`, 'library-query', {
            libraryQueryPhase: phase,
          });
        }
        for (const [name, script] of [
          ['library-batch', 'library-batch'],
          ['library-reprocess', 'library-batch-reprocess'],
          ['library-copy', 'library-copy'],
          ['trash-query-batch', 'trash-query-batch'],
          ['trash-cleanup', 'trash-cleanup'],
          ['shell-navigation', 'shell-navigation'],
          ['albums', 'albums'],
          ['album-cover', 'album-cover'],
          ['tags', 'tags'],
          ['upload', 'upload'],
          ['upload-polling', 'upload-polling'],
          ['upload-input', 'upload-input'],
          ['upload-submissions', 'upload-submissions'],
          ['upload-relations', 'upload-relations'],
        ])
          await business(name, script);
      }
      const beforeName = `m2-${width}-before`;
      await business(beforeName, 'm2', { phase: 'before' });
      await check(
        `m2-${width}-after`,
        async () => {
          await stop(server);
          assert.deepEqual(await startProduction(dataDirectory), []);
          await runBrowser(
            '../e2e/m2.mjs',
            { ...identityConfig, phase: 'after' },
            `m2-${width}-after.log`,
          );
        },
        [beforeName],
      );
      await business(`interaction-polish-${width}`, 'interaction-polish');
      await business(`workspace-continuity-${width}`, 'workspace-continuity');
      await stop(server);
    }
    await check('delivery-s3', async () => {
      try {
        deliveryFixture = await launchProtocolDelivery();
        secrets.push(deliveryFixture.browserInput.credentials.password);
        await runBrowser(
          '../e2e/delivery-s3.mjs',
          {
            ...deliveryFixture.browserInput,
            spaceId: report.taskSpaceId,
            output,
          },
          'delivery-s3.log',
        );
      } finally {
        await deliveryFixture?.close();
        deliveryFixture = undefined;
      }
    });
    await check('sharing-protocol', () =>
      runSharingProtocol(report.taskSpaceId),
    );
    await check('sharing-experiment', () =>
      runSharingExperiment(report.taskSpaceId),
    );
    await check('isolated-ui', async () => {
      browser = spawn(process.execPath, ['run-browser.mjs'], {
        cwd: resolve('tests/experiments/ui'),
        detached: true,
        stdio: ['ignore', 'inherit', 'inherit'],
        env: {
          ...process.env,
          EGO_TASK_SPACE: String(report.taskSpaceId),
          EGO_KEEP_SPACE: Object.values(report.stages).every(
            (stage) => stage.status === 'passed',
          )
            ? process.env.EGO_KEEP_SPACE
            : '1',
          BROWSER_REPORT_DIR: join(output, 'ui'),
        },
      });
      const [uiCode] = await once(browser, 'close', {
        signal: controller.signal,
      });
      assert.equal(
        uiCode,
        0,
        'Isolated UI/library browser verification failed',
      );
    });
    assert.ok(
      Object.values(report.stages).every((stage) => stage.status === 'passed'),
      `Browser stages failed or blocked: ${Object.entries(report.stages)
        .filter(([, stage]) => stage.status !== 'passed')
        .map(([name]) => name)
        .join(', ')}`,
    );
  }
  report.status = 'passed';
} catch (error) {
  report.error = redact(error.stack ?? String(error));
  process.exitCode = 1;
  console.error(report.error);
} finally {
  const cleanup = await Promise.allSettled([
    stop(browser),
    stop(server),
    stop(shellServer),
    corsFixture?.close(),
    deliveryFixture?.close(),
    ...[...sharingFixtures].map((fixture) => fixture.stop()),
    ...uploadFixtures.map((endpoint) => endpoint.close()),
  ]);
  const cleanupErrors = cleanup
    .filter((result) => result.status === 'rejected')
    .map((result) => redact(result.reason.stack ?? String(result.reason)));
  const artifacts = await Promise.allSettled([
    writeFile(join(output, 'shell-server.log'), shellLogs),
    writeFile(join(output, 'server.log'), redact(logs)),
    ...(cleanupErrors.length
      ? []
      : [rm(temporary, { recursive: true, force: true, maxRetries: 3 })]),
  ]);
  cleanupErrors.push(
    ...artifacts
      .filter((result) => result.status === 'rejected')
      .map((result) => redact(result.reason.stack ?? String(result.reason))),
  );
  if (cleanupErrors.length) {
    report.cleanupErrors = cleanupErrors;
    report.status = 'failed';
    process.exitCode = 1;
    console.error(cleanupErrors.join('\n'));
  }
  report.finishedAt = new Date().toISOString();
  report.temporaryDirectoryRemoved = cleanupErrors.length === 0;
  await writeFile(
    join(output, 'runner.json'),
    `${redact(JSON.stringify(report, null, 2))}\n`,
  );
  process.removeListener('SIGINT', interrupt);
  process.removeListener('SIGTERM', interrupt);
  console.log(`Browser report: ${output}`);
}
