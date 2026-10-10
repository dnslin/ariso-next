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
import { selectBrowserPlan } from './browser-plan.mjs';
import { runM2Restart } from './browser-m2.mjs';
import { runIdentityManagement } from './browser-identity-management.mjs';
import { runOAuthManagement } from './browser-oauth.mjs';
import { runBusinessBrowserStage } from './browser-business.mjs';
import { createSharingRunner } from './browser-sharing.mjs';
import { runBrandBrowser } from './browser-brand.mjs';
import { runBrandingBrowser } from './browser-branding.mjs';
import { startSmtpBrowserFixture } from '../e2e/smtp-fixture.mjs';
import { startPasswordResetBrowserFixture } from '../e2e/password-reset-fixture.mjs';

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
const pageLabel = process.env.EGO_PAGE_LABEL ?? 'p1';
const plan = selectBrowserPlan({
  suite,
  only,
  pageLabel,
  storageConfig: values['storage-config'],
  previewConfig: values['preview-config'],
});

const output = resolve(
  process.env.BROWSER_REPORT_DIR ??
    `test-results/browser${suite === 'full' ? '' : `-${suite}`}`,
);
await mkdir(output, { recursive: true });
for (const name of [
  'browser.json',
  'brand-experiment.json',
  'brand-image.png',
  'brand-download.svg',
  'branding.json',
  'branding-image.png',
  'branding-download.svg',
  'branding-server.log',
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
  'upload-settings.json',
  'upload-settings-failure.png',
  'upload-input.json',
  'upload-usage.json',
  'upload-usage-failure.png',
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
  'theme.json',
  'site-general.json',
  'site-general-failure.png',
  'site-branding.json',
  'site-branding-restart.json',
  'site-branding-restart-input.json',
  'site-branding-failure.png',
  'processing.json',
  'processing-failure.png',
  'analytics.json',
  'analytics-failure.png',
  'account.json',
  'account-all-failure.png',
  'account-1440-failure.png',
  'account-390-failure.png',
  'account-1440.json',
  'account-390.json',
  ...[1440, 390, 'all'].flatMap((width) =>
    ['before', 'after', 'enabled'].map(
      (phase) => `oauth-${width}-${phase}.json`,
    ),
  ),
  'tokens.json',
  'tokens-1440.json',
  'tokens-390.json',
  'tokens-all-failure.png',
  'tokens-1440-failure.png',
  'tokens-390-failure.png',
  'delivery-s3/browser.json',
  'sharing-experiment.json',
  'sharing-protocol.json',
  'sharing-public.json',
  'sharing-public-failure.png',

  'sharing-management.json',
  'sharing-management-failure.png',
  'password-reset.json',
  'password-reset-failure.png',
  'smtp.json',
  'smtp-failure.png',
  'm2-1440.json',
  'm2-390.json',
  'interaction-polish-1440.json',
  'interaction-polish-390.json',
  'workspace-continuity-1440.json',
  'identity-session-1440.json',
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
let smtpFixture;
let passwordResetFixture;
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
  if (browserConfig.setupCode) secrets.push(browserConfig.setupCode);
  if (browserConfig.credentials?.password)
    secrets.push(browserConfig.credentials.password);
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
const sharing = createSharingRunner({
  signal: controller.signal,
  runBrowser,
  pageLabel,
  output,
  report,
  secrets,
  setupCodes,
  redact,
});
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

if (suite === 'brand-experiment' || suite === 'branding') {
  try {
    const spaceId = Number(process.env.EGO_TASK_SPACE);
    assert.ok(
      Number.isInteger(spaceId) && spaceId > 0,
      'Existing Ego space required',
    );
    report.taskSpaceId = spaceId;
    const run = suite === 'branding' ? runBrandingBrowser : runBrandBrowser;
    await run({
      spaceId,
      pageLabel,
      output,
      runBrowser,
      signal: controller.signal,
    });
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

if (
  [
    'sharing-experiment',
    'sharing-protocol',
    'sharing-public',
    'sharing-viewer',
  ].includes(suite)
) {
  try {
    const spaceId = Number(process.env.EGO_TASK_SPACE);
    assert.ok(
      Number.isInteger(spaceId) && spaceId > 0,
      'Existing Ego space required',
    );
    report.taskSpaceId = spaceId;
    if (suite === 'sharing-viewer')
      await sharing.runViewer(spaceId, plan.config.sharingViewerPhase);
    else if (suite === 'sharing-public')
      await sharing.runPublic(spaceId, plan.config.sharingPublicPhase);
    else if (suite === 'sharing-protocol') await sharing.runProtocol(spaceId);
    else await sharing.runExperiment(spaceId);
    report.status = 'passed';
  } catch (error) {
    report.error = redact(error.stack ?? String(error));
    process.exitCode = 1;
    console.error(report.error);
  } finally {
    await stop(browser);
    await sharing.stop();
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
  if (suite === 'full' || suite === 'smtp') {
    smtpFixture = await startSmtpBrowserFixture(temporary);
    secrets.push(smtpFixture.browserInput.password);
  }
  if (suite === 'full' || suite === 'password-reset')
    passwordResetFixture = await startPasswordResetBrowserFixture(temporary);
  const smtpCertificates = [smtpFixture, passwordResetFixture].filter(Boolean);
  if (smtpCertificates.length) {
    productionEnv.NODE_EXTRA_CA_CERTS = join(temporary, 'browser-smtp-ca.pem');
    await writeFile(
      productionEnv.NODE_EXTRA_CA_CERTS,
      (
        await Promise.all(
          smtpCertificates.map((fixture) => readFile(fixture.caPath, 'utf8')),
        )
      ).join('\n'),
    );
  }
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
  async function restartProduction(dataDirectory) {
    await stop(server);
    return startProduction(dataDirectory);
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
    ...(smtpFixture ? { smtpFixture: smtpFixture.browserInput } : {}),
    ...(passwordResetFixture
      ? { passwordResetFixture: passwordResetFixture.browserInput }
      : {}),
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
      ...plan.config,
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
      suite === 'storage-cors' ||
      (suite === 'storage-admin' && only !== 'live' && only !== 'regressions')
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
    report.taskSpaceId = config.spaceId;
    report.stages = {};
    if (suite === 'm2-mobile') {
      await runM2Restart({
        check,
        runBrowser,
        restart: restartProduction,
        config: { ...focusedConfig, width: 390 },
      });
    } else if (suite === 'oauth') {
      if (
        await runOAuthManagement({
          check,
          runBrowser,
          restart: restartProduction,
          config: focusedConfig,
        })
      )
        report.oauth = 'passed';
    } else {
      for (const [script, result] of plan.stages) {
        const passed = await runBusinessBrowserStage({
          check,
          runBrowser,
          restart: restartProduction,
          config: focusedConfig,
          script,
        });
        if (passed) report[result] = 'passed';
      }
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
    await check('brand-experiment', () =>
      runBrandBrowser({
        spaceId: report.taskSpaceId,
        pageLabel,
        output,
        runBrowser,
        signal: controller.signal,
      }),
    );
    await check('branding', () =>
      runBrandingBrowser({
        spaceId: report.taskSpaceId,
        pageLabel,
        output,
        runBrowser,
        signal: controller.signal,
      }),
    );
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
        runBusinessBrowserStage({
          check,
          runBrowser,
          restart: restartProduction,
          config: { ...identityConfig, ...extra },
          script,
          name,
          dependencies: [ownerName],
        });
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
        for (const [script, name] of plan.stages) await business(name, script);
      }
      await runM2Restart({
        check,
        runBrowser,
        restart: restartProduction,
        config: identityConfig,
        dependencies: [ownerName],
      });
      await business(`interaction-polish-${width}`, 'interaction-polish');
      await business(`workspace-continuity-${width}`, 'workspace-continuity');
      const management = await runIdentityManagement({
        check,
        runBrowser,
        restart: restartProduction,
        config: identityConfig,
        dependencies: [ownerName],
      });
      if (management.tokensPassed) report[`tokens-${width}`] = 'passed';
      if (management.oauthPassed) report[`oauth-${width}`] = 'passed';
      if (management.accountPassed) report[`account-${width}`] = 'passed';
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
      sharing.runProtocol(report.taskSpaceId),
    );
    await check('sharing-public', () => sharing.runPublic(report.taskSpaceId));
    await check('sharing-viewer', () => sharing.runViewer(report.taskSpaceId));
    await check('sharing-experiment', () =>
      sharing.runExperiment(report.taskSpaceId),
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
    smtpFixture?.close(),
    passwordResetFixture?.close(),
    sharing.stop(),
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
