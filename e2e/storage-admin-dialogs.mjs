/* global taskSpace, config */
const { default: assert } = await import('node:assert/strict');
const { writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { storageLayouts, storageDialogGeometry, assertStorageShortDialog } =
  await import(
    new URL('./storage-admin-layout.mjs', config.identitySessionScript).href
  );
const page = (await taskSpace(config.spaceId)).page(config.pageLabel ?? 'p1');
const { resizeViewport } = await import(
  new URL('./browser-geometry.mjs', config.identitySessionScript).href
);
const report = { status: 'failed', checks: [], layouts: [] };
async function request(path, method = 'GET', body) {
  const response = await page.fetch(path, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
  });
  assert.ok(response.status >= 200 && response.status < 300, response.body);
  return JSON.parse(response.body);
}
async function control(mode) {
  const response = await fetch(`${config.corsFixture}/_control`, {
    method: 'POST',
    body: JSON.stringify({ mode }),
  });
  assert.equal(response.status, 200);
}
try {
  await page.goto(config.origin);
  const login = await page.fetch('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(config.credentials),
  });
  assert.equal(login.status, 200);
  const initial = await request('/api/storages');
  assert.equal(initial.length, 1);
  assert.equal(initial[0].type, 'local');
  await request(`/api/storages/${initial[0].id}`, 'DELETE');
  await page.goto(`${config.origin}/settings/storage`);
  await page.waitForSelector(
    '[data-testid="storage-list"][data-state="empty"]',
  );
  assert.deepEqual(await request('/api/storages'), []);
  assert.equal((await request('/api/settings/storage')).defaultStorageId, null);
  await storageLayouts(page, config, report, 'empty', [1440, 390]);
  report.checks.push(
    'Fresh Local configuration deleted through the real API; empty state has no recreated storage or automatic default.',
  );
  const storage = await request('/api/storages', 'POST', {
    name: 'Issue 198 short dialog',
    type: 's3',
    endpoint: config.corsFixture,
    region: 'us-east-1',
    bucket: 'cors-test',
    pathPrefix: 'storage-admin-dialogs-198',
    forcePathStyle: true,
    accessKey: 'test-access',
    secretKey: 'test-secret',
    enabled: false,
  });
  for (const [mode, title, stage] of [
    ['configuration-denied', '尚无法确认 Bucket 支持范围', 'configuration'],
    ['versioning-enabled', '此 Bucket 暂不支持', 'configuration'],
    ['anonymous-unavailable', '未能确认匿名访问被拒绝', 'anonymous'],
  ]) {
    await control(mode);
    const before = (await request(`/api/storages/${storage.id}`))
      .connectionReport?.probeId;
    await page.goto(`${config.origin}/settings/storage/${storage.id}`);
    await page.waitForSelector('[data-testid="storage-editor"]');
    await page.click('[data-testid="storage-test"]');
    await page.waitForFunction(
      async ({ id, before }) => {
        const value = await (await fetch(`/api/storages/${id}`)).json();
        return (
          value.connectionReport?.probeId !== before &&
          value.connectionStatus === 'failed' &&
          !value.probes.some((probe) => probe.state === 'running')
        );
      },
      { id: storage.id, before },
      { timeout: 90000 },
    );
    await page.waitForFunction(
      (title) =>
        document.querySelector(
          '[data-testid="storage-connection-result-dialog"] h2',
        )?.textContent === title,
      title,
    );
    const value = await request(`/api/storages/${storage.id}`);
    assert.equal(value.enabled, false);
    assert.equal(value.connectionReport.passed, false);
    assert.equal(value.connectionReport.cleanupPending, false);
    const failed = value.connectionReport.stages.find(
      (entry) => entry.stage === stage,
    );
    assert.equal(failed.status, 'failed');
    if (mode === 'anonymous-unavailable') {
      assert.equal(failed.error.httpStatusCode, 503);
      assert.equal(
        value.connectionReport.stages.find((entry) => entry.stage === 'delete')
          .status,
        'passed',
      );
    }
    await storageLayouts(page, config, report, mode, [1440, 390]);
    for (const dialog of report.dialogs.filter(
      (dialog) => dialog.state === mode,
    ))
      assertStorageShortDialog(dialog);
    const current = await storageDialogGeometry(page);
    assertStorageShortDialog(current);
    const action = '[data-slot="alert-dialog-footer"] > button:first-of-type';
    await page.focus(action);
    for (const key of ['Tab', 'Shift+Tab']) {
      await page.keyboard.press(key);
      assert.equal(
        await page.evaluate(
          () => !!document.activeElement.closest('[role="alertdialog"]'),
        ),
        true,
      );
    }
    await resizeViewport(page, 390, 480);
    await page.focus(action);
    const short = await page.evaluate(() => {
      const rect = document.activeElement.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, viewport: innerHeight };
    });
    assert.ok(short.top >= 0 && short.bottom <= short.viewport);
    const screenshot = `storage-admin-${mode}-short.png`;
    await page.screenshot({ path: join(config.output, screenshot) });
    report.layouts.push({
      state: mode,
      width: 390,
      height: 480,
      screenshot,
      short,
    });
    report.checks.push({
      mode,
      stage,
      reportPassed: value.connectionReport.passed,
      probeId: value.connectionReport.probeId,
      keyboardFocusTrapped: true,
    });
  }
  const r2 = await request('/api/storages', 'POST', {
    name: 'Issue 198 R2 confirmation layout only',
    type: 's3',
    endpoint: 'https://issue198test.r2.cloudflarestorage.com',
    region: 'auto',
    bucket: 'dialog-only',
    pathPrefix: 'storage-admin-r2-dialog-198',
    accessKey: 'dialog-only-access',
    secretKey: 'dialog-only-secret',
    enabled: false,
  });
  await page.goto(`${config.origin}/settings/storage/${r2.id}`);
  await page.waitForSelector('[data-testid="storage-editor"]');
  await page.evaluate((id) => {
    const original = window.fetch;
    window.__r2ConfirmationTestRequests = 0;
    window.fetch = (...args) => {
      if (
        new URL(String(args[0]), location.href).pathname ===
          `/api/storages/${id}/test` &&
        args[1]?.method === 'POST'
      )
        window.__r2ConfirmationTestRequests++;
      return original(...args);
    };
  }, r2.id);
  await page.click('[data-testid="storage-test"]');
  await page.waitForSelector(
    'loc=role:heading[name="确认 R2 Bucket 锁定设置"]',
  );
  await storageLayouts(page, config, report, 'r2-owner-confirm', [1440, 390]);
  const r2Dialogs = report.dialogs.filter(
    (dialog) => dialog.state === 'r2-owner-confirm',
  );
  assert.equal(r2Dialogs.length, 4);
  for (const dialog of r2Dialogs) {
    assertStorageShortDialog(dialog);
    assert.equal(dialog.buttons.length, 2);
    if (dialog.viewport === 390)
      assert.deepEqual(dialog.buttonWidths, [308, 308]);
  }
  await page.click('loc=role:button[name="返回配置"]');
  await page.waitForSelector('[data-slot="alert-dialog-dialog"]', {
    state: 'hidden',
  });
  assert.equal(
    await page.evaluate(() => window.__r2ConfirmationTestRequests),
    0,
  );
  const cancelledR2 = await request(`/api/storages/${r2.id}`);
  assert.equal(cancelledR2.connectionStatus, 'untested');
  assert.equal(cancelledR2.connectionReport, null);
  assert.deepEqual(cancelledR2.probes, []);
  assert.equal(cancelledR2.enabled, false);
  report.checks.push(
    'Official R2 endpoint with fake credentials opens only the confirmation UI; two full-width actions match the approved nodes, cancel makes no connection-test request or remote operation.',
  );
  report.status = 'passed';
} catch (error) {
  report.error = error.stack ?? String(error);
  await page.screenshot({
    path: join(config.output, 'storage-admin-dialogs-failure.png'),
  });
  throw error;
} finally {
  await control('normal');
  await writeFile(
    join(config.output, 'storage-admin-dialogs.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log({ storageAdminDialogs: report.status });
}
