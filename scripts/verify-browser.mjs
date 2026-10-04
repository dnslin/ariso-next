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
assert.ok(
  [
    'full',
    'viewer',
    'upload',
    'upload-regression',
    'upload-s3',
    'copy-dropdown',
    'library-batch',
    'library-reprocess',
    'library-copy',
    'storage-admin',
    'processing',
    'trash',
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
  suite !== 'full' || pageLabel === 'p1',
  'Full suite requires p1; focused suites support an isolated EGO_PAGE_LABEL',
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
  // Full screenshot matrices can exceed five minutes; behavior waits stay bounded.
  const timeout = setTimeout(interrupt, 600000);
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
      `${JSON.stringify(report, null, 2)}\n`,
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
  const codes = await startProduction(join(temporary, 'data'));
  let shellOrigin;
  if (suite === 'full') {
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
      assert.ok(Date.now() < shellDeadline, 'Shell fixture startup timed out');
      await delay(100, undefined, { signal: controller.signal });
    }
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
    const stages =
      suite === 'processing'
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
                          : [
                              ['upload', 'upload'],
                              ['upload-polling', 'uploadPolling'],
                            ];
    report.taskSpaceId = config.spaceId;
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
      await runBrowser(
        `../e2e/${script}.mjs`,
        {
          ...focusedConfig,
          libraryBatchPhase: suite === 'library-batch' ? only : undefined,
          trashPhase: suite === 'trash' ? only : undefined,
        },
        `${script}.log`,
      );
      report[result] = 'passed';
    }
  } else {
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
      assert.equal(
        codes.length,
        1,
        'Empty directory must issue one setup code',
      );
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
        await runBrowser(
          '../e2e/processing.mjs',
          identityConfig,
          'processing.log',
        );
        report.processing = 'passed';
        corsFixture = await startCorsFixture(origin);
        await runBrowser(
          '../e2e/storage-admin.mjs',
          { ...identityConfig, corsFixture: corsFixture.endpoint },
          'storage-admin.log',
        );
        report.storageAdmin = 'passed';
        await runBrowser(
          '../e2e/storage-cors.mjs',
          { ...identityConfig, corsFixture: corsFixture.endpoint },
          'storage-cors.log',
        );
        report.storageCors = 'passed';
        await corsFixture.close();
        corsFixture = undefined;
        await runBrowser('../e2e/library.mjs', identityConfig, 'library.log');
        for (const phase of [
          'feedback',
          'selection',
          'selection-reconciliation',
          'query',
          'filters',
          'scale',
        ]) {
          await runBrowser(
            '../e2e/library-query.mjs',
            { ...identityConfig, libraryQueryPhase: phase },
            `library-${phase}.log`,
          );
        }
        report.libraryQuery = 'passed';
        await runBrowser(
          '../e2e/library-batch.mjs',
          identityConfig,
          'library-batch.log',
        );
        report.libraryBatch = 'passed';
        await runBrowser(
          '../e2e/library-batch-reprocess.mjs',
          identityConfig,
          'library-batch-reprocess.log',
        );
        report.libraryReprocess = 'passed';
        await runBrowser(
          '../e2e/library-copy.mjs',
          identityConfig,
          'library-copy.log',
        );
        report.libraryCopy = 'passed';
        await runBrowser(
          '../e2e/trash-query-batch.mjs',
          identityConfig,
          'trash-query-batch.log',
        );
        report.trashQueryBatch = 'passed';
        await runBrowser(
          '../e2e/trash-cleanup.mjs',
          identityConfig,
          'trash-cleanup.log',
        );
        report.trashCleanup = 'passed';
        await runBrowser(
          '../e2e/shell-navigation.mjs',
          identityConfig,
          'shell-navigation.log',
        );
        report.shellNavigation = 'passed';
        await runBrowser('../e2e/albums.mjs', identityConfig, 'albums.log');
        report.albums = 'passed';
        await runBrowser(
          '../e2e/album-cover.mjs',
          identityConfig,
          'album-cover.log',
        );
        report.albumCover = 'passed';
        await runBrowser('../e2e/tags.mjs', identityConfig, 'tags.log');
        report.tags = 'passed';
        await runBrowser('../e2e/upload.mjs', identityConfig, 'upload.log');
        await runBrowser(
          '../e2e/upload-polling.mjs',
          identityConfig,
          'upload-polling.log',
        );
        report.uploadPolling = 'passed';
        await runBrowser(
          '../e2e/upload-input.mjs',
          identityConfig,
          'upload-input.log',
        );
        report.uploadInput = 'passed';
        await runBrowser(
          '../e2e/upload-submissions.mjs',
          identityConfig,
          'upload-submissions.log',
        );
        report.uploadSubmissions = 'passed';
        await runBrowser(
          '../e2e/upload-relations.mjs',
          identityConfig,
          'upload-relations.log',
        );
        report.uploadRelations = 'passed';
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
      await runBrowser(
        '../e2e/interaction-polish.mjs',
        identityConfig,
        `interaction-polish-${width}.log`,
      );
      report[`interaction-polish-${width}`] = 'passed';
      await runBrowser(
        '../e2e/workspace-continuity.mjs',
        identityConfig,
        `workspace-continuity-${width}.log`,
      );
      report[`workspace-continuity-${width}`] = 'passed';
      await stop(server);
    }
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
    report.deliveryS3 = 'passed';
    await deliveryFixture.close();
    deliveryFixture = undefined;
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
    const [uiCode] = await once(browser, 'close', {
      signal: controller.signal,
    });
    assert.equal(uiCode, 0, 'Isolated UI/library browser verification failed');
  }
  report.status = 'passed';
} catch (error) {
  report.error = redact(error.stack ?? String(error));
  process.exitCode = 1;
  console.error(report.error);
} finally {
  await stop(browser);
  await stop(server);
  await stop(shellServer);
  await corsFixture?.close();
  await deliveryFixture?.close();
  for (const endpoint of uploadFixtures) await endpoint.close();
  await writeFile(join(output, 'shell-server.log'), shellLogs);
  await writeFile(join(output, 'server.log'), redact(logs));
  await rm(temporary, { recursive: true, force: true, maxRetries: 3 });
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
