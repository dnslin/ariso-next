/* global taskSpace, config */
const { default: assert } = await import('node:assert/strict');
const { writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { setTimeout: delay } = await import('node:timers/promises');
const { identitySql } = await import(config.identitySessionScript);
const { runCorsUiSample } = await import(
  new URL('./storage-cors-ui.mjs', config.identitySessionScript).href
);
const {
  storageLayouts,
  storageShortViewport,
  storageReadFault,
  loseStorageMutation,
} = await import(
  new URL('./storage-admin-layout.mjs', config.identitySessionScript).href
);
const task = await taskSpace(config.spaceId);
const page = task.page(config.pageLabel ?? 'p1');
const report = {
  status: 'failed',
  taskSpaceId: task.spaceId,
  checks: [],
  layouts: [],
  limitations: [
    'HTTP S3 fault fixture exercises actual network operations but does not certify R2/SeaweedFS compatibility.',
    'Physical touch, soft keyboard and nonzero safe area are outside the current acceptance scope.',
  ],
};
const button = (name) => `loc=role:button[name="${name}"]`;
const field = (name) => `input[name="${name}"]`;
const request = async (path, method = 'GET', body) => {
  const response = await page.fetch(path, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
  });
  assert.ok(
    response.status >= 200 && response.status < 300,
    `${method} ${path}: ${response.status} ${response.body}`,
  );
  return JSON.parse(response.body);
};
const storage = (id) => request(`/api/storages/${id}`);
const settings = () => request('/api/settings/storage');
const open = async (id) => {
  await page.goto(`${config.origin}/settings/storage/${id}`);
  await page.waitForSelector('[data-testid="storage-editor"]');
  await page.waitForSelector(field('name'));
};
const save = () => page.click('[data-testid="storage-save"]');
async function openDefault(id) {
  await open(id);
  await page.click('[data-testid="storage-open-default"]');
  await page.waitForSelector('[data-testid="storage-default-view"]');
}
async function openCleanup(id) {
  await open(id);
  await page.click('[data-testid="storage-open-cleanup"]');
  await page.waitForSelector('[data-testid="storage-cleanup-view"]');
}
async function savedByName(name) {
  await page.waitForFunction(async (name) => {
    const response = await fetch('/api/storages');
    return (
      response.ok && (await response.json()).some((item) => item.name === name)
    );
  }, name);
  return (await request('/api/storages')).find((item) => item.name === name);
}
async function control(mode) {
  const response = await fetch(`${config.corsFixture}/_control`, {
    ...(mode ? { method: 'POST', body: JSON.stringify({ mode }) } : {}),
  });
  assert.equal(response.status, 200);
  return response.json();
}
async function createLocal(name, path) {
  await page.goto(`${config.origin}/settings/storage/new`);
  await page.waitForSelector('[data-testid="storage-type-local"]');
  await page.click('[data-testid="storage-type-local"]');
  await page.fill(field('name'), name);
  await page.fill(field('localPath'), path);
  await storageLayouts(page, config, report, 'local-new', [1440, 390]);
  await save();
  return savedByName(name);
}
async function runConnection(id, expected, preserveInput = false) {
  const before = (await storage(id)).connectionReport?.probeId;
  if (!preserveInput) await open(id);
  await page.click('[data-testid="storage-test"]');
  await page.waitForFunction(
    async ({ id, expected, before }) => {
      const response = await fetch(`/api/storages/${id}`);
      if (!response.ok) return false;
      const value = await response.json();
      return (
        value.connectionStatus === expected &&
        value.connectionReport?.probeId !== before &&
        !value.probes.some((probe) => probe.state === 'running')
      );
    },
    { id, expected, before },
    { timeout: 90000 },
  );
  const value = await storage(id);
  assert.equal(value.connectionReport.passed, expected === 'passed');
  const failure = value.connectionReport.stages.find(
    (stage) => stage.status === 'failed',
  );
  const title =
    expected === 'passed'
      ? '连接测试通过'
      : failure?.stage === 'configuration'
        ? failure.error?.code === 'STORAGE_BUCKET_UNSUPPORTED'
          ? '此 Bucket 暂不支持'
          : '尚无法确认 Bucket 支持范围'
        : failure?.stage === 'anonymous'
          ? failure.error?.httpStatusCode >= 200 &&
            failure.error?.httpStatusCode < 300
            ? '连接失败：测试对象可公开读取'
            : '未能确认匿名访问被拒绝'
          : value.connectionReport.cleanupPending
            ? '连接测试失败：对象删除失败'
            : '连接测试未通过';
  await page.waitForFunction(
    (title) =>
      [
        ...document.querySelectorAll(
          '[data-testid="storage-connection-report"] h1, [data-testid="storage-connection-result-dialog"] h2',
        ),
      ].some(
        (node) =>
          node.textContent.trim() === title && node.getClientRects().length,
      ),
    title,
  );
  return value;
}
let heldRead;
let rejectedRead;
try {
  await page.goto(config.origin);
  const signIn = () =>
    page.fetch('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(config.credentials),
    });
  let login = await signIn();
  for (let attempt = 0; login.status === 429 && attempt < 6; attempt++) {
    const seconds = Number(
      login.headers['x-retry-after'] ?? login.headers['retry-after'],
    );
    assert.ok(
      Number.isFinite(seconds) && seconds > 0,
      'Login limiter exposes a real retry deadline',
    );
    (report.loginRetrySeconds ??= []).push(seconds);
    await delay(seconds * 1000);
    login = await signIn();
  }
  assert.equal(login.status, 200, login.body);
  const initial = await request('/api/storages');
  const initialDefault = (await settings()).defaultStorageId;
  assert.ok(initial.some((item) => item.id === initialDefault));
  await page.goto(`${config.origin}/settings/storage`);
  await page.waitForSelector(
    '[data-testid="storage-list"][data-state="ready"]',
  );
  await storageLayouts(page, config, report, 'list');
  heldRead = await storageReadFault(page, '/api/storages', 'hold');
  await page.reload();
  await page.waitForSelector('[role="status"]');
  await page.waitForFunction(
    () => typeof window.__releaseStorageRead === 'function',
  );
  await storageLayouts(page, config, report, 'list-loading', [1440, 390]);
  await page.evaluate(() => {
    window.__storageReadMode = 'normal';
    window.__releaseStorageRead();
  });
  await page.waitForSelector('[data-testid="storage-list"]');
  await page.cdp('Page.removeScriptToEvaluateOnNewDocument', heldRead);
  heldRead = undefined;
  rejectedRead = await storageReadFault(page, '/api/storages', 'fail');
  await page.reload();
  await page.waitForSelector('[role="alert"]');
  await storageLayouts(page, config, report, 'list-error', [1440, 390]);
  await page.evaluate(() => {
    window.__storageReadMode = 'normal';
  });
  await page.focus(button('重新加载'));
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-testid="storage-list"]');
  await page.cdp('Page.removeScriptToEvaluateOnNewDocument', rejectedRead);
  rejectedRead = undefined;
  report.checks.push(
    'Actual list reads expose loading/error and keyboard retry recovers the real stored rows.',
  );

  const local = await createLocal('Issue 198 local', 'storage-admin-198');
  assert.equal(local.type, 'local');
  await open(local.id);
  await storageLayouts(page, config, report, 'local-editor');
  await storageShortViewport(page, config, report);
  await page.fill(field('localPath'), '../../outside-storage');
  await save();
  await page.waitForSelector('[role="alert"]');
  assert.equal(
    await page.evaluate(
      () => document.querySelector('input[name="localPath"]').value,
    ),
    '../../outside-storage',
  );
  assert.equal((await storage(local.id)).localPath, 'storage-admin-198');
  await storageLayouts(page, config, report, 'local-field-error', [1440, 390]);
  await page.fill(field('localPath'), 'storage-admin-198');
  await page.fill(field('name'), 'Issue 198 renamed local');
  await loseStorageMutation(page, `/api/storages/${local.id}`, 'PATCH');
  await save();
  await page.waitForFunction(() => window.__storageMutationUsed);
  assert.equal(await page.evaluate(() => window.__storageMutationStatus), 200);
  await page.waitForFunction(() => document.body.textContent.includes('核对'));
  await page.waitForFunction(
    async (id) =>
      (await (await fetch(`/api/storages/${id}`)).json()).name ===
      'Issue 198 renamed local',
    local.id,
  );
  assert.equal(
    (await request('/api/storages')).filter((item) => item.id === local.id)
      .length,
    1,
  );
  assert.equal((await storage(local.id)).configRevision, local.configRevision);
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="storage-save"]').disabled,
  );
  assert.equal(
    await page.evaluate(
      () => document.querySelector('input[name="name"]').value,
    ),
    'Issue 198 renamed local',
    'Unknown successful save keeps the user input during reconciliation',
  );
  await page.fill(field('name'), 'Issue 198 reconciled local');
  await save();
  await savedByName('Issue 198 reconciled local');
  assert.equal((await storage(local.id)).name, 'Issue 198 reconciled local');
  report.checks.push(
    'Local create writes a real independent directory; invalid path retains input without updating storage; a lost successful PATCH is read back without duplicate creation or revision change.',
  );

  await page.goto(`${config.origin}/settings/storage/new`);
  await page.waitForSelector('[data-testid="storage-type-s3"]');
  await page.click('[data-testid="storage-type-s3"]');
  for (const [name, value] of Object.entries({
    name: 'Issue 198 S3',
    endpoint: config.corsFixture,
    region: 'us-east-1',
    bucket: 'cors-test',
    accessKey: 'test-access',
    secretKey: 'test-secret',
    pathPrefix: 'storage-admin-198',
  }))
    await page.fill(field(name), value);
  await page.click('loc=role:switch[name="Path Style"]');
  await storageLayouts(page, config, report, 's3-new');
  await page.fill(field('endpoint'), `${config.corsFixture}?invalid=1`);
  await save();
  await page.waitForSelector('[role="alert"]');
  assert.equal(
    await page.evaluate(
      () => document.querySelector('input[name="endpoint"]').value,
    ),
    `${config.corsFixture}?invalid=1`,
  );
  assert.equal(
    (await request('/api/storages')).some(
      (value) => value.name === 'Issue 198 S3',
    ),
    false,
  );
  await storageLayouts(page, config, report, 's3-field-error', [1440, 390]);
  await page.fill(field('endpoint'), config.corsFixture);
  await save();
  const s3 = await savedByName('Issue 198 S3');
  assert.equal(s3.enabled, false);
  assert.equal(s3.connectionStatus, 'untested');
  assert.equal(s3.hasAccessKey, true);
  assert.equal(s3.hasSecretKey, true);
  await page.waitForSelector('[data-testid="storage-connection-result"]');
  await storageLayouts(page, config, report, 's3-saved-untested', [1440, 390]);
  await open(s3.id);
  assert.equal(
    await page.evaluate(
      () => document.querySelector('input[name="accessKey"]').value,
    ),
    '',
  );
  assert.equal(
    await page.evaluate(
      () => document.querySelector('input[name="secretKey"]').value,
    ),
    '',
  );
  await page.fill(field('secretKey'), 'unsaved-credential-must-not-be-saved');
  await page.fill(field('pathPrefix'), 'unsaved-position-must-not-be-saved');
  const tested = await runConnection(s3.id, 'passed', true);
  assert.equal(tested.configRevision, s3.configRevision);
  assert.equal(tested.endpoint, config.corsFixture);
  assert.equal(tested.pathPrefix, 'storage-admin-198');
  assert.equal(
    tested.enabled,
    false,
    'Connection success requires separate manual enable',
  );
  assert.equal(tested.connectionReport.cleanupPending, false);
  assert.deepEqual(
    tested.connectionReport.stages
      .filter((stage) =>
        ['write', 'read', 'anonymous', 'delete'].includes(stage.stage),
      )
      .map((stage) => stage.status),
    ['passed', 'passed', 'passed', 'passed'],
  );
  await storageLayouts(page, config, report, 'connection-passed', [1440, 390]);
  await page.evaluate((id) => {
    const original = window.fetch;
    window.__storageEnableBodies = [];
    window.fetch = (...args) => {
      if (
        new URL(String(args[0]), location.href).pathname ===
          `/api/storages/${id}` &&
        args[1]?.method === 'PATCH'
      )
        window.__storageEnableBodies.push(JSON.parse(args[1].body));
      return original(...args);
    };
  }, s3.id);
  await page.click('[data-testid="storage-enable"]');
  await page.waitForFunction(
    async (id) => (await (await fetch(`/api/storages/${id}`)).json()).enabled,
    s3.id,
  );
  assert.deepEqual(await page.evaluate(() => window.__storageEnableBodies), [
    { enabled: true },
  ]);
  const enabledSaved = await storage(s3.id);
  assert.equal(enabledSaved.configRevision, s3.configRevision);
  assert.equal(enabledSaved.endpoint, config.corsFixture);
  assert.equal(enabledSaved.pathPrefix, 'storage-admin-198');
  assert.equal(enabledSaved.hasAccessKey, true);
  assert.equal(enabledSaved.hasSecretKey, true);
  const priorRetest = enabledSaved.connectionReport.probeId;
  await control('hold-connection-put');
  await page.click('[data-testid="storage-test"]');
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="storage-connection-report"] h1')
        ?.textContent === '正在测试连接',
  );
  const heldDeadline = Date.now() + 10000;
  while ((await control()).objects.length === 0) {
    assert.ok(
      Date.now() < heldDeadline,
      'Held connection PUT reaches the actual fault service',
    );
    await delay(50);
  }
  await page.click(button('返回配置'));
  await page.waitForSelector('[data-testid="storage-editor"]');
  assert.equal(
    await page.evaluate(
      () => document.querySelector('input[name="secretKey"]').value,
    ),
    'unsaved-credential-must-not-be-saved',
  );
  assert.equal(
    await page.evaluate(
      () => document.querySelector('input[name="pathPrefix"]').value,
    ),
    'unsaved-position-must-not-be-saved',
  );
  await control('normal');
  await page.waitForFunction(
    async ({ id, before }) => {
      const value = await (await fetch(`/api/storages/${id}`)).json();
      return (
        value.connectionStatus === 'passed' &&
        value.connectionReport.probeId !== before &&
        value.probes.length === 0 &&
        !document.querySelector('[data-testid="storage-save"]').disabled
      );
    },
    { id: s3.id, before: priorRetest },
    { timeout: 90000 },
  );
  report.checks.push(
    'Unsaved credential/position edits are excluded from connection tests and enable PATCH contains only enabled:true; returning during a held real retest preserves both unsaved inputs while server cleanup finishes.',
  );
  await openDefault(s3.id);
  await page.click('[data-testid="storage-default"]');
  await page.waitForFunction(
    async (id) =>
      (await (await fetch('/api/settings/storage')).json()).defaultStorageId ===
      id,
    s3.id,
  );
  await storageLayouts(page, config, report, 'default-selected', [1440, 390]);
  await control('anonymous-readable');
  const enabledFailure = await runConnection(s3.id, 'failed');
  assert.equal(enabledFailure.enabled, false);
  assert.equal((await settings()).defaultStorageId, s3.id);
  await storageLayouts(
    page,
    config,
    report,
    'enabled-retest-failed',
    [1440, 390],
  );
  await control('normal');
  await runConnection(s3.id, 'passed');
  await page.click('[data-testid="storage-enable"]');
  await page.waitForFunction(
    async (id) => (await (await fetch(`/api/storages/${id}`)).json()).enabled,
    s3.id,
  );
  await open(s3.id);
  await page.fill(field('name'), 'Issue 198 renamed S3');
  await save();
  await savedByName('Issue 198 renamed S3');
  const renamed = await storage(s3.id);
  assert.equal(renamed.connectionStatus, 'passed');
  assert.equal(renamed.enabled, true);
  assert.equal(renamed.configRevision, tested.configRevision);
  await page.goto(`${config.origin}/settings/storage/${s3.id}/cors`);
  await page.waitForSelector('[data-testid="storage-cors"]');
  const cors = await runCorsUiSample(page, s3.id);
  assert.equal(cors.passed, true);
  await page.waitForSelector(`a[href="/settings/storage/${s3.id}"]`);
  assert.equal(
    await page.evaluate(
      (id) =>
        document
          .querySelector(`a[href="/settings/storage/${id}"]`)
          .textContent.trim(),
      s3.id,
    ),
    '管理此存储',
  );
  await page.click(`a[href="/settings/storage/${s3.id}"]`);
  await page.waitForSelector('[data-testid="storage-editor"]');
  assert.equal(
    new URL(await page.url()).pathname,
    `/settings/storage/${s3.id}`,
  );
  report.checks.push(
    'Migrated CORS route runs a real browser sample and its passed result links back to the actual storage editor.',
  );
  await open(s3.id);
  await page.fill(field('secretKey'), 'test-secret-revised');
  await save();
  await page.waitForFunction(
    async (id) =>
      (await (await fetch(`/api/storages/${id}`)).json()).configRevision > 1,
    s3.id,
  );
  const revised = await storage(s3.id);
  assert.equal(revised.enabled, false);
  assert.equal(revised.connectionStatus, 'untested');
  assert.equal(revised.corsStatus, 'invalidated');
  assert.equal((await settings()).defaultStorageId, s3.id);
  await openDefault(s3.id);
  assert.ok(
    await page.evaluate(() =>
      document.body.textContent.includes('当前配置尚未通过连接测试'),
    ),
  );
  await storageLayouts(
    page,
    config,
    report,
    'default-view-disabled',
    [1440, 390],
  );
  await page.click(button('返回配置并测试'));
  await page.waitForSelector('[data-testid="storage-editor"]');
  const untestedEnable = await page.fetch(`/api/storages/${s3.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(untestedEnable.status, 409);
  assert.equal(JSON.parse(untestedEnable.body).code, 'STORAGE_TEST_REQUIRED');
  assert.equal((await storage(s3.id)).enabled, false);
  assert.equal((await settings()).defaultStorageId, s3.id);
  await runConnection(s3.id, 'passed');
  await page.click('[data-testid="storage-enable"]');
  await page.waitForFunction(
    async (id) => (await (await fetch(`/api/storages/${id}`)).json()).enabled,
    s3.id,
  );
  assert.equal((await settings()).defaultStorageId, s3.id);
  await open(s3.id);
  await page.click('loc=role:switch[name="启用此存储"]');
  await save();
  await page.waitForFunction(
    async (id) => !(await (await fetch(`/api/storages/${id}`)).json()).enabled,
    s3.id,
  );
  assert.equal((await settings()).defaultStorageId, s3.id);
  await page.goto(`${config.origin}/settings/storage`);
  await page.waitForSelector(
    '[data-testid="storage-list"][data-state="ready"]',
  );
  assert.ok(
    await page.evaluate(() =>
      document.body.textContent.includes('默认存储已停用'),
    ),
  );
  await storageLayouts(page, config, report, 'default-disabled', [1440, 390]);
  await openDefault(s3.id);
  await page.click('[data-testid="storage-clear-default"]');
  await page.waitForSelector('[data-testid="storage-confirm-clear-default"]');
  await storageLayouts(
    page,
    config,
    report,
    'clear-default-confirm',
    [1440, 390],
  );
  await page.focus('[data-testid="storage-confirm-clear-default"]');
  for (const key of ['Tab', 'Shift+Tab']) {
    await page.keyboard.press(key);
    assert.equal(
      await page.evaluate(
        () =>
          !!document.activeElement.closest(
            '[role="alertdialog"],[role="dialog"]',
          ),
      ),
      true,
      'Default confirmation retains keyboard focus',
    );
  }
  await page.click('[data-testid="storage-confirm-clear-default"]');
  await page.waitForFunction(
    async () =>
      (await (await fetch('/api/settings/storage')).json()).defaultStorageId ===
      null,
  );
  assert.equal((await storage(s3.id)).enabled, false);
  report.checks.push(
    'S3 is saved disabled, real write/read/anonymous-denial/delete stages pass, separate enable/default actions persist, rename preserves test/revision, credential change invalidates tests and disables while preserving default.',
  );

  for (const [mode, stage] of [
    ['configuration-denied', 'configuration'],
    ['versioning-enabled', 'configuration'],
  ]) {
    await control(mode);
    const result = await runConnection(s3.id, 'failed');
    assert.equal(result.connectionReport.passed, false);
    assert.equal(
      result.connectionReport.stages.find((value) => value.stage === stage)
        .status,
      'failed',
    );
    assert.equal(result.connectionReport.cleanupPending, false);
    assert.equal(result.enabled, false);
    await storageLayouts(page, config, report, mode, [1440, 390]);
  }
  report.checks.push(
    'Actual missing capability permission and enabled Bucket versioning produce distinct failed configuration stages; anonymous-readable enabled retest fails and stops storage while preserving the default pointer.',
  );

  await control('delete-failure');
  const failed = await runConnection(s3.id, 'failed');
  assert.equal(failed.connectionReport.cleanupPending, true);
  assert.ok(failed.probes.length > 0);
  await storageLayouts(page, config, report, 'cleanup-pending', [1440, 390]);
  await control('normal');
  await openCleanup(s3.id);
  await page.click(button('重试清理'));
  await page.waitForFunction(
    async (id) =>
      (await (await fetch(`/api/storages/${id}`)).json()).probes.length === 0,
    s3.id,
    { timeout: 90000 },
  );
  assert.deepEqual((await control()).objects, []);
  report.checks.push(
    'HTTP 2xx failed connection report displays failed; actual remote DELETE failure retains probe and UI retry removes its exact object while storage remains disabled.',
  );

  const orphanPath = `/cors-test/storage-admin-198/ariso/${s3.id}/orphans/browser-198`;
  await control('delete-failure');
  const orphanWrite = await fetch(`${config.corsFixture}${orphanPath}`, {
    method: 'PUT',
    headers: { authorization: 'isolated-http-fixture' },
    body: 'independent browser scan orphan',
  });
  assert.equal(orphanWrite.status, 200);
  await openCleanup(s3.id);
  assert.equal((await storage(s3.id)).scan, null);
  await page.click(button('扫描并清理受管孤儿对象'));
  await page.waitForFunction(
    async (id) =>
      (await (await fetch(`/api/storages/${id}`)).json()).scan?.status ===
      'failed',
    s3.id,
    { timeout: 90000 },
  );
  assert.equal((await storage(s3.id)).scan.status, 'failed');
  assert.ok(
    await page.evaluate(() =>
      document
        .querySelector('[data-testid="storage-cleanup-view"]')
        .textContent.includes('AccessDenied'),
    ),
  );
  await storageLayouts(page, config, report, 'scan-failed', [1440, 390]);
  const failedStarted = (await storage(s3.id)).scan.startedAt;
  await page.click(button('扫描并清理受管孤儿对象'));
  await page.waitForFunction(
    async ({ id, before }) => {
      const value = await (await fetch(`/api/storages/${id}`)).json();
      return value.scan.status === 'failed' && value.scan.startedAt !== before;
    },
    { id: s3.id, before: failedStarted },
    { timeout: 90000 },
  );
  assert.ok((await control()).objects.includes(orphanPath));
  await control('normal');
  await page.click(button('扫描并清理受管孤儿对象'));
  await page.waitForFunction(
    async (id) =>
      (await (await fetch(`/api/storages/${id}`)).json()).scan.status ===
      'passed',
    s3.id,
    { timeout: 90000 },
  );
  assert.deepEqual((await control()).objects, []);
  await storageLayouts(page, config, report, 'scan-recovered', [1440, 390]);
  report.checks.push(
    'Real namespace scan records exact orphan DELETE AccessDenied; UI retry fails again retaining object, then a fresh successful retry removes it and reports passed.',
  );

  await open(local.id);
  await page.click('loc=role:switch[name="设为默认存储"]');
  await save();
  await page.waitForFunction(
    async (id) =>
      (await (await fetch('/api/settings/storage')).json()).defaultStorageId ===
      id,
    local.id,
  );
  await page.goto(`${config.origin}/upload`);
  await page.waitForSelector('input[aria-label="选择图片文件"]', {
    state: 'attached',
  });
  await page.setInputFiles('input[aria-label="选择图片文件"]', [
    join(config.projectDirectory, 'tests/fixtures/runtime/images/sample.png'),
  ]);
  await page.click(button('开始上传'));
  await page.waitForSelector(
    '[data-testid="upload-item"][data-state="ready"]',
    { timeout: 90000 },
  );
  const [image] = await identitySql(
    config,
    `SELECT id FROM media_images WHERE storage_id='${local.id}' ORDER BY created_at DESC LIMIT 1`,
  );
  assert.ok(image);
  await open(local.id);
  const references = await storage(local.id);
  assert.ok(
    Object.values(references.references.counts).some((count) => count > 0),
  );
  assert.equal(
    await page.evaluate(
      () =>
        [...document.querySelectorAll('input[name="localPath"]')].filter(
          (node) => !node.readOnly && !node.disabled,
        ).length,
    ),
    0,
    'Referenced Local storage has no editable position control',
  );
  assert.equal(
    await page.evaluate(
      () => document.querySelector('input[name="localPath"]').value,
    ),
    'storage-admin-198',
    'Locked Local still displays the actual directory',
  );
  await storageLayouts(page, config, report, 'local-referenced', [1440, 390]);
  assert.equal(
    await page.evaluate(
      () => document.querySelector('[data-testid="storage-delete"]').disabled,
    ),
    true,
  );
  const blockedDelete = await page.fetch(`/api/storages/${local.id}`, {
    method: 'DELETE',
  });
  assert.equal(blockedDelete.status, 409, blockedDelete.body);
  assert.equal(JSON.parse(blockedDelete.body).code, 'STORAGE_IN_USE');
  await page.click(button('查看引用与删除限制'));
  await page.waitForSelector('[data-testid="storage-reference-view"]');
  assert.ok(
    await page.evaluate(() =>
      document
        .querySelector('[data-testid="storage-reference-view"]')
        .textContent.includes('图片与版本'),
    ),
  );
  await storageLayouts(page, config, report, 'delete-blocked', [1440, 390]);
  await request(`/api/images/${image.id}/trash`, 'POST', {});
  await request(`/api/images/${image.id}`, 'DELETE');
  await page.waitForFunction(
    async (id) => {
      const response = await fetch(`/api/storages/${id}`);
      const value = await response.json();
      return (
        value.references.activeWrites === 0 &&
        Object.values(value.references.counts).every((count) => count === 0)
      );
    },
    local.id,
    { timeout: 90000 },
  );
  await open(local.id);
  await page.click('[data-testid="storage-delete"]');
  await page.waitForSelector('[data-testid="storage-confirm-delete"]');
  await storageLayouts(page, config, report, 'delete-confirm', [1440, 390]);
  await page.click('[data-testid="storage-confirm-delete"]');
  await page.waitForFunction(
    async (id) => (await fetch(`/api/storages/${id}`)).status === 404,
    local.id,
    { timeout: 90000 },
  );
  assert.equal((await settings()).defaultStorageId, null);
  report.checks.push(
    'Real browser upload creates media/object/job references; position locks and deletion explain actual reference counts; trash and permanent cleanup release references before UI deletion clears default.',
  );

  for (const value of await request('/api/storages'))
    await request(`/api/storages/${value.id}`, 'PATCH', { enabled: false });
  await page.goto(`${config.origin}/settings/storage`);
  await page.waitForSelector(
    '[data-testid="storage-list"][data-state="ready"]',
  );
  await storageLayouts(page, config, report, 'all-disabled', [1440, 390]);
  assert.equal((await settings()).defaultStorageId, null);
  await page.reload();
  assert.equal((await settings()).defaultStorageId, null);
  for (const value of await request('/api/storages')) {
    const detail = await storage(value.id);
    assert.equal(detail.references.activeWrites, 0);
    assert.ok(
      Object.values(detail.references.counts).every((count) => count === 0),
    );
    await request(`/api/storages/${value.id}`, 'DELETE');
  }
  await page.reload();
  await page.waitForSelector(
    '[data-testid="storage-list"][data-state="empty"]',
  );
  assert.deepEqual(await request('/api/storages'), []);
  assert.equal((await settings()).defaultStorageId, null);
  await storageLayouts(page, config, report, 'empty', [1440, 390]);
  await page.reload();
  assert.deepEqual(
    await request('/api/storages'),
    [],
    'Empty state must not reconstruct initial default',
  );
  // Full suite shares this disposable runtime with later modules. Restore a
  // usable Local configuration through the normal API rather than SQL resets.
  const restored = await request('/api/storages', 'POST', {
    type: 'local',
    name: 'Browser suite Local',
    localPath: 'default',
  });
  await request('/api/settings/storage', 'PATCH', {
    defaultStorageId: restored.id,
  });
  if (config.storageNavigation)
    await request('/api/storages', 'POST', {
      type: 's3',
      name: 'Independent storage navigation',
      endpoint: config.corsFixture,
      region: 'us-east-1',
      bucket: 'cors-test',
      accessKey: 'test-access',
      secretKey: 'test-secret',
      forcePathStyle: true,
    });
  report.checks.push(
    'All-disabled and empty lists remain valid, default stays null across reloads, deleted initial storage is not silently recreated.',
  );
  await request('/api/auth/sign-out', 'POST', {});
  report.status = 'passed';
} catch (error) {
  report.error = error.stack ?? String(error);
  await page.screenshot({
    path: join(config.output, 'storage-admin-failure.png'),
  });
  throw error;
} finally {
  if (heldRead)
    await page.cdp('Page.removeScriptToEvaluateOnNewDocument', heldRead);
  if (rejectedRead)
    await page.cdp('Page.removeScriptToEvaluateOnNewDocument', rejectedRead);
  await control('normal');
  await writeFile(
    join(config.output, 'storage-admin.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
console.log({
  storageAdmin: report.status,
  report: join(config.output, 'storage-admin.json'),
});
