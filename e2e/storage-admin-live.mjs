/* global taskSpace, config */
const { default: assert } = await import('node:assert/strict');
const { writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { randomUUID } = await import('node:crypto');
const { identitySql } = await import(config.identitySessionScript);
const { storageLayouts, assertStorageShortDialog } = await import(
  new URL('./storage-admin-layout.mjs', config.identitySessionScript).href
);
const { inspectManagementNamespace } = await import(
  new URL('./storage-admin-live-sdk.mjs', config.identitySessionScript).href
);
const task = await taskSpace(config.spaceId);
const page = task.page(config.pageLabel ?? 'p1');
const report = {
  status: 'failed',
  taskSpaceId: task.spaceId,
  checks: [],
  services: [],
  layouts: [],
  limitations: [
    'R2 whole-Bucket no-lock confirmation reuses the previously authorized same-Bucket evidence; clicking this run’s confirmation does not claim a fresh console inspection.',
    'Remote Bucket policies and CORS configuration are not modified. Upload uses the actual relay route because the new configuration has no passed browser CORS result.',
  ],
};
const button = (name) => `loc=role:button[name="${name}"]`;
const input = (name) => `input[name="${name}"]`;
const created = [];
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
  assert.ok(
    response.status >= 200 && response.status < 300,
    `${method} ${path}: HTTP ${response.status}`,
  );
  return JSON.parse(response.body);
}
const storage = (id) => request(`/api/storages/${id}`);
const settings = () => request('/api/settings/storage');
async function open(id) {
  await page.goto(`${config.origin}/settings/storage/${id}`);
  await page.waitForSelector('[data-testid="storage-editor"]');
}
try {
  assert.ok(
    config.storageTargets?.length === 2,
    'Live suite requires exactly R2 and SeaweedFS',
  );
  assert.ok(config.r2NoLockEvidence);
  await page.goto(config.origin);
  const login = await page.fetch('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(config.credentials),
  });
  assert.equal(login.status, 200);
  await page.goto(`${config.origin}/settings/storage`);
  await page.waitForSelector(
    '[data-testid="storage-list"][data-state="ready"]',
  );
  await storageLayouts(page, config, report, 'list', [1440, 390]);
  for (const target of config.storageTargets) {
    const name = `Issue 198 ${target.service} ${randomUUID()}`;
    const prefix = `storage-admin-198/${randomUUID()}`;
    const entry = { service: target.service, status: 'failed', checks: [] };
    report.services.push(entry);
    await page.goto(`${config.origin}/settings/storage/new`);
    await page.waitForSelector('[data-testid="storage-type-s3"]');
    await page.click('[data-testid="storage-type-s3"]');
    for (const [field, value] of Object.entries({
      name,
      endpoint: target.endpoint,
      region: target.region,
      bucket: target.bucket,
      pathPrefix: prefix,
      accessKey: target.credentials.accessKeyId,
      secretKey: target.credentials.secretAccessKey,
    }))
      await page.fill(input(field), value);
    if (target.forcePathStyle)
      await page.click('loc=role:switch[name="Path Style"]');
    await page.click('[data-testid="storage-save"]');
    await page.waitForFunction(
      async (name) =>
        (await (await fetch('/api/storages')).json()).some(
          (value) => value.name === name,
        ),
      name,
    );
    const saved = (await request('/api/storages')).find(
      (value) => value.name === name,
    );
    entry.storageId = saved.id;
    entry.namespace = `${prefix}/ariso/${saved.id}/`;
    created.push({
      target,
      id: saved.id,
      namespace: entry.namespace,
      imageIds: [],
    });
    assert.equal(saved.enabled, false);
    assert.equal(saved.connectionStatus, 'untested');
    await page.waitForSelector('[data-testid="storage-connection-result"]');
    await storageLayouts(
      page,
      config,
      report,
      `${target.service}-saved`,
      [1440, 390],
    );
    await page.click('[data-testid="storage-test"]');
    if (target.service === 'r2') {
      await page.waitForSelector(button('已确认，开始测试'));
      await storageLayouts(
        page,
        config,
        report,
        'r2-owner-confirm',
        [1440, 390],
      );
      await page.click(button('已确认，开始测试'));
    }
    await page.waitForFunction(
      async (id) => {
        const value = await (await fetch(`/api/storages/${id}`)).json();
        return (
          value.connectionStatus === 'passed' &&
          !value.probes.some((probe) => probe.state === 'running')
        );
      },
      saved.id,
      { timeout: 90000 },
    );
    const connected = await storage(saved.id);
    assert.equal(connected.enabled, false);
    assert.equal(connected.connectionReport.passed, true);
    assert.equal(connected.connectionReport.cleanupPending, false);
    assert.equal(connected.connectionReport.stale, false);
    assert.ok(
      connected.connectionReport.stages.every(
        (stage) => stage.status === 'passed',
      ),
    );
    if (target.service === 'r2')
      assert.equal(
        connected.connectionReport.ownerConfirmation.wholeBucketHasNoLockRules,
        true,
      );
    entry.connection = connected.connectionReport;
    await page.waitForSelector('[data-testid="storage-enable"]');
    await storageLayouts(
      page,
      config,
      report,
      `${target.service}-passed`,
      [1440, 390],
    );
    await page.click('[data-testid="storage-enable"]');
    await page.waitForFunction(
      async (id) => (await (await fetch(`/api/storages/${id}`)).json()).enabled,
      saved.id,
    );
    await open(saved.id);
    await page.click('[data-testid="storage-open-default"]');
    await page.waitForSelector('[data-testid="storage-default-view"]');
    await page.click('[data-testid="storage-default"]');
    await page.waitForFunction(
      async (id) =>
        (await (await fetch('/api/settings/storage')).json())
          .defaultStorageId === id,
      saved.id,
    );
    await storageLayouts(
      page,
      config,
      report,
      `${target.service}-default-selected`,
      [1440, 390],
    );
    const footer = await page.evaluate(() => ({
      height: document.querySelector('.shell-footer').getBoundingClientRect()
        .height,
      success: document
        .querySelector('.shell-footer')
        .textContent.includes('默认存储已更新'),
    }));
    assert.ok(
      footer.height <= 82,
      'Success message does not enlarge the fixed footer',
    );
    assert.equal(footer.success, false);
    for (const layout of report.layouts.filter(
      (layout) => layout.state === `${target.service}-default-selected`,
    )) {
      assert.ok(layout.footer.height <= 82);
      assert.equal(layout.footer.success, false);
    }
    entry.defaultFooter = footer;
    const revision = (await storage(saved.id)).configRevision;
    await open(saved.id);
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
    await page.fill(input('name'), `${name} renamed`);
    await page.click('[data-testid="storage-save"]');
    await page.waitForFunction(
      async ({ id, name }) =>
        (await (await fetch(`/api/storages/${id}`)).json()).name === name,
      { id: saved.id, name: `${name} renamed` },
    );
    const renamed = await storage(saved.id);
    assert.equal(renamed.configRevision, revision);
    assert.equal(renamed.connectionStatus, 'passed');
    assert.equal(renamed.enabled, true);
    entry.checks.push(
      'Real UI create disabled → service connection passed → manual enable → default → rename with blank credential fields preserves revision/test.',
    );

    await page.goto(`${config.origin}/upload`);
    await page.waitForSelector('input[aria-label="选择图片文件"]', {
      state: 'attached',
    });
    if (
      await page.evaluate(
        () => !!document.querySelector('[data-testid="upload-item"]'),
      )
    ) {
      await page.click(button('清空已完成'));
      await page.waitForSelector('[data-testid="upload-item"]', {
        state: 'hidden',
      });
    }
    await page.setInputFiles('input[aria-label="选择图片文件"]', [
      join(config.projectDirectory, 'tests/fixtures/runtime/images/sample.png'),
    ]);
    await page.click(button('开始上传'));
    await page.waitForSelector(
      '[data-testid="upload-item"][data-state="ready"]',
      { timeout: 90000 },
    );
    const imageId = await page.evaluate(
      () =>
        document.querySelector('[data-testid="upload-item"]').dataset.imageId,
    );
    assert.ok(imageId);
    created.at(-1).imageIds.push(imageId);
    const [session] = await identitySql(
      config,
      `SELECT route,storage_id FROM upload_sessions WHERE image_id='${imageId}'`,
    );
    assert.equal(session.storage_id, saved.id);
    assert.equal(session.route, 'relay');
    const preview = await page.evaluate(
      (id) =>
        new Promise((resolve, reject) => {
          const image = new Image();
          const timer = setTimeout(
            () => reject(new Error('Live owner thumbnail did not load')),
            15000,
          );
          image.onload = () => {
            clearTimeout(timer);
            resolve({ width: image.naturalWidth, height: image.naturalHeight });
          };
          image.onerror = () => {
            clearTimeout(timer);
            reject(new Error('Live owner thumbnail failed to decode'));
          };
          image.src = `/i/${id}?type=thumbnail`;
        }),
      imageId,
    );
    assert.ok(preview.width > 0 && preview.height > 0);
    entry.upload = {
      imageId,
      route: session.route,
      ownerThumbnailDecoded: preview,
    };
    await open(saved.id);
    assert.ok(
      Object.values((await storage(saved.id)).references.counts).some(
        (count) => count > 0,
      ),
    );
    assert.equal(
      await page.evaluate(
        () => document.querySelector('[data-testid="storage-delete"]').disabled,
      ),
      true,
    );
    await storageLayouts(
      page,
      config,
      report,
      `${target.service}-referenced`,
      [1440, 390],
    );
    await page.click('loc=role:switch[name="启用此存储"]');
    await page.click('[data-testid="storage-save"]');
    await page.waitForFunction(
      async (id) =>
        !(await (await fetch(`/api/storages/${id}`)).json()).enabled,
      saved.id,
    );
    assert.equal((await settings()).defaultStorageId, saved.id);
    const disabledPreview = await page.fetch(`/i/${imageId}?type=thumbnail`);
    assert.equal(disabledPreview.status, 409);
    assert.equal(JSON.parse(disabledPreview.body).code, 'STORAGE_DISABLED');
    await page.click('[data-testid="storage-open-default"]');
    await page.waitForSelector('[data-testid="storage-default-view"]');
    await page.click('[data-testid="storage-clear-default"]');
    await page.waitForSelector('[data-testid="storage-confirm-clear-default"]');
    await storageLayouts(
      page,
      config,
      report,
      `${target.service}-clear-default`,
      [1440, 390],
    );
    for (const dialog of report.dialogs.filter(
      (dialog) => dialog.state === `${target.service}-clear-default`,
    ))
      assertStorageShortDialog(dialog);
    await page.focus('[data-testid="storage-confirm-clear-default"]');
    for (const key of ['Tab', 'Shift+Tab']) {
      await page.keyboard.press(key);
      assert.equal(
        await page.evaluate(
          () => !!document.activeElement.closest('[role="alertdialog"]'),
        ),
        true,
      );
    }
    await page.click('[data-testid="storage-confirm-clear-default"]');
    await page.waitForFunction(
      async () =>
        (await (await fetch('/api/settings/storage')).json())
          .defaultStorageId === null,
    );
    await request(`/api/images/${imageId}/trash`, 'POST', {});
    await request(`/api/images/${imageId}`, 'DELETE');
    await page.waitForFunction(
      async (id) => {
        const value = await (await fetch(`/api/storages/${id}`)).json();
        return (
          value.references.activeWrites === 0 &&
          Object.values(value.references.counts).every((count) => count === 0)
        );
      },
      saved.id,
      { timeout: 90000 },
    );
    await open(saved.id);
    await page.click('[data-testid="storage-delete"]');
    await page.waitForSelector('[data-testid="storage-confirm-delete"]');
    await storageLayouts(
      page,
      config,
      report,
      `${target.service}-delete`,
      [1440, 390],
    );
    for (const dialog of report.dialogs.filter(
      (dialog) => dialog.state === `${target.service}-delete`,
    ))
      assertStorageShortDialog(dialog);
    await page.click('[data-testid="storage-confirm-delete"]');
    await page.waitForFunction(
      async (id) => (await fetch(`/api/storages/${id}`)).status === 404,
      saved.id,
      { timeout: 90000 },
    );
    assert.equal((await settings()).defaultStorageId, null);
    entry.finalKeys = await inspectManagementNamespace(target, entry.namespace);
    assert.deepEqual(entry.finalKeys, []);
    created.at(-1).finished = true;
    entry.checks.push(
      'Real relay upload reads thumbnail and locks referenced storage; disable preserves default and rejects new content; clear default, trash/permanent cleanup and scanned configuration deletion leave the exact independent namespace empty.',
    );
    entry.status = 'passed';
  }
  report.status = 'passed';
} catch (error) {
  report.error = error.stack ?? String(error);
  // Live credentials are never captured: remove the in-progress form from the
  // screenshot only if it still contains entered secret fields after a failure.
  const credentialsVisible = await page.evaluate(() =>
    ['accessKey', 'secretKey'].some(
      (name) => !!document.querySelector(`input[name="${name}"]`)?.value,
    ),
  );
  if (!credentialsVisible)
    await page.screenshot({
      path: join(config.output, 'storage-admin-live-failure.png'),
    });
  throw error;
} finally {
  for (const owned of created) {
    if (owned.finished) continue;
    try {
      const remaining = await inspectManagementNamespace(
        owned.target,
        owned.namespace,
        true,
      );
      if (remaining.length)
        report.checks.push(
          `${owned.target.service}: failure teardown deleted ${remaining.length} objects only in this run's known independent namespace.`,
        );
    } catch (error) {
      (report.cleanupErrors ??= []).push({
        service: owned.target.service,
        error: error.message,
      });
    }
  }
  await writeFile(
    join(config.output, 'storage-admin-live.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
console.log({
  storageAdminLive: report.status,
  services: report.services.map((service) => ({
    service: service.service,
    status: service.status,
  })),
  report: join(config.output, 'storage-admin-live.json'),
});
