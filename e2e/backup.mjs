import assert from 'node:assert/strict';
import { open } from 'node:fs/promises';

// The runner owns both disposable instances, their fixture accounts, restart,
// error collection and supplied TaskSpace. These helpers operate only its Page.
export async function beginBackup(page, { origin, password, onStep }) {
  await page.goto(`${origin}/settings/backup`);
  await page.waitForSelector('#backup-create');
  await page.waitForFunction(() => {
    const button = document.getElementById('backup-create');
    return button && !button.disabled;
  });
  await page.click('#backup-create');
  await page.fill('#backup-password', password);
  await page.fill('#backup-confirm-password', password);
  await onStep?.('password');
  await page.click('button[form="backup-create-form"]');
  await page.waitForSelector('[data-testid="backup-confirm-submit"]');
  await onStep?.('confirm-backup');
  await page.click('[data-testid="backup-confirm-submit"]');
  await page.waitForSelector('[data-testid="backup-task"]');
  await page.waitForFunction(
    () => !document.querySelector('[role="alertdialog"]'),
  );
  await onStep?.('creating');
  const state = await page.evaluate(() => {
    const element = document.querySelector('[data-testid="backup-task"]');
    return { id: element?.dataset.jobId, status: element?.dataset.state };
  });
  assert.ok(state.id, 'The real created task is displayed');
  assert.ok(
    ['preparing', 'copying', 'finalizing', 'ready'].includes(state.status),
  );
  return state.id;
}

export async function waitForBackupDownload(page, { origin, id, path }) {
  await page.goto(`${origin}/settings/backup`);
  const selector = `[data-testid="backup-history-item"][data-job-id="${id}"] a[href$="/file"]`;
  await page.waitForSelector(selector);
  const pending = page.waitForEvent('download', { timeout: 30000 });
  await page.click(selector);
  const download = await pending;
  await download.saveAs(path);
  const file = await open(path, 'r');
  try {
    const header = Buffer.alloc(64);
    await file.read(header, 0, header.length, 0);
    assert.ok(
      header.toString().startsWith('age-encryption.org/v1\n'),
      'The browser downloaded an age file, not an error document',
    );
  } finally {
    await file.close();
  }
  return { path, suggestedFilename: download.suggestedFilename() };
}

export async function verifyPausedPages(page, { origin, imageId }) {
  await page.goto(`${origin}/upload`);
  await page.waitForSelector('[data-testid="backup-pause-notice"]');
  await page.waitForSelector('loc=role:button[name="开始上传"]');
  const upload = await page.evaluate(
    () =>
      [...document.querySelectorAll('button')].find(
        (node) => node.textContent.trim() === '开始上传',
      )?.disabled,
  );
  assert.equal(
    upload,
    true,
    'Starting a new upload is disabled while the real backup is paused',
  );
  await page.goto(`${origin}/library`);
  await page.waitForSelector('[data-testid="backup-pause-notice"]');
  await page.waitForSelector(`[data-image-id="${imageId}"]`);
  await page.waitForFunction((id) => {
    const image = document.querySelector(`[data-image-id="${id}"] img`);
    return image?.complete && image.naturalWidth > 0;
  }, imageId);
  await page.hover(`[data-image-id="${imageId}"]`);
  await page.click(
    `[data-image-id="${imageId}"] label:has(input[type="checkbox"])`,
  );
  await page.waitForSelector('[aria-label="管理选择，已选 1 张"]');
  const actions = await page.evaluate(() =>
    Object.fromEntries(
      ['复制链接', '添加到相册', '添加标签'].map((label) => {
        const control = document.querySelector(`button[aria-label="${label}"]`);
        return [
          label,
          control
            ? {
                disabled: control.disabled,
                pending: control.getAttribute('aria-disabled'),
              }
            : null,
        ];
      }),
    ),
  );
  assert.equal(actions['复制链接']?.disabled, false);
  assert.equal(actions['添加到相册']?.disabled, true);
  assert.equal(actions['添加标签']?.disabled, true);
}

export async function importBackupThroughPage(
  page,
  { origin, setupCode, password, file },
) {
  await page.goto(`${origin}/setup/restore`);
  await page.waitForSelector('#restore-code');
  assert.equal(
    await page.evaluate(() => !!document.querySelector('#restore-file')),
    true,
    'The approved initial form includes code, file and password together',
  );
  await page.fill('#restore-code', setupCode);
  await page.setInputFiles('#restore-file', [file]);
  await page.fill('#restore-password', password);
  await page.click('[data-testid="restore-next"]');
  await page.waitForSelector(
    '[data-testid="restore-screen"][data-state="核对内容"]',
  );
  const content = await page.evaluate(
    () => document.querySelector('[data-testid="restore-screen"]').textContent,
  );
  assert.ok(content.includes('备份已解密，应用版本匹配'));
  assert.ok(!/模拟重启|恢复演示情景|填入示例配置/.test(content));
}

export async function prepareRestoreThroughPage(
  page,
  { publicUrl, onStep, targets = [] },
) {
  await page.click('[data-testid="restore-next"]');
  await page.waitForSelector('#publicUrl');
  await page.fill('#publicUrl', publicUrl);
  const targetRecovery = targets.length
    ? await configureRestoreTargets(page, targets, onStep)
    : undefined;
  await onStep?.('targets');
  await page.click('[data-testid="restore-next"]');
  await page.waitForSelector(
    '[data-testid="restore-screen"][data-state="确认恢复"]',
  );
  await onStep?.('confirm-restore');
  await page.click('[data-testid="restore-next"]');
  const timing = targets.length
    ? await waitForRemoteRestoreReady(page)
    : undefined;
  if (!targets.length)
    await page.waitForSelector('[data-testid="restore-ready"]');
  const status = await page.evaluate(
    () => document.querySelector('[data-testid="restore-ready"]').textContent,
  );
  assert.ok(status.includes('数据已恢复，等待重启'));
  assert.ok(status.includes('新站点尚未启用'));
  assert.ok(!status.includes('模拟重启'));
  return timing ? { ...timing, targetRecovery } : undefined;
}

export async function configureRestoreTargets(page, targets, onStep) {
  const first = targets[0];
  await configureRestoreRemoteTarget(page, {
    ...first,
    value: { ...first.value, secretKey: 'invalid-backup-browser-secret' },
    expectedState: 'failed',
  });
  await page.waitForFunction((id) => {
    const target = document.querySelector(
      `[data-testid="restore-target"][data-storage-id="${id}"]`,
    );
    const error = target?.querySelector('[role="alert"]');
    return (
      document.querySelector('[data-testid="restore-next"]').disabled &&
      !!error?.textContent.trim() &&
      error.getClientRects().length > 0
    );
  }, first.storageId);
  await onStep?.('target-error');
  for (const target of targets)
    await configureRestoreRemoteTarget(page, target);
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="restore-next"]').disabled,
  );
  const trigger = `#restore-target-${first.storageId}`;
  if (
    await page.evaluate(
      (selector) =>
        document.querySelector(selector).getAttribute('aria-expanded') !==
        'true',
      trigger,
    )
  )
    await page.click(trigger);
  await page.fill(
    `#restore-${first.storageId}-pathPrefix`,
    `${first.value.pathPrefix}-unsaved-change`,
  );
  await page.waitForFunction(
    () => document.querySelector('[data-testid="restore-next"]').disabled,
  );
  await configureRestoreRemoteTarget(page, {
    ...first,
    value: { pathPrefix: first.value.pathPrefix },
  });
  return {
    failedTestBlockedContinuation: true,
    correctedTestPassed: true,
    unsavedChangeBlockedContinuation: true,
  };
}

export async function waitForRemoteRestoreReady(page) {
  const started = performance.now();
  await page.waitForFunction(
    () => {
      const state = document.querySelector('[data-testid="restore-outcome"]')
        ?.dataset.state;
      return (
        !!document.querySelector('[data-testid="restore-ready"]') ||
        ['failed', 'interrupted'].includes(state) ||
        !!document.querySelector('[data-testid="restore-cleanup-pending"]')
      );
    },
    undefined,
    { timeout: 90000 },
  );
  const state = await page.evaluate(() =>
    document.querySelector('[data-testid="restore-ready"]')
      ? 'ready'
      : document.querySelector('[data-testid="restore-cleanup-pending"]')
        ? 'cleanup-pending'
        : document.querySelector('[data-testid="restore-outcome"]')?.dataset
            .state,
  );
  assert.equal(state, 'ready', `S3 restore entered terminal state ${state}`);
  return { readyWaitMs: Math.round(performance.now() - started) };
}

export async function configureRestoreRemoteTarget(
  page,
  { storageId, value, confirmR2 = false, expectedState = 'passed' },
) {
  const container = `[data-testid="restore-target"][data-storage-id="${storageId}"]`;
  const trigger = `#restore-target-${storageId}`;
  await page.waitForSelector(trigger);
  const previousTest = await page.evaluate(
    (selector) => document.querySelector(selector).dataset.testedAt,
    container,
  );
  const expanded = await page.evaluate(
    (selector) =>
      document.querySelector(selector).getAttribute('aria-expanded'),
    trigger,
  );
  if (expanded !== 'true') await page.click(trigger);
  for (const key of [
    'endpoint',
    'region',
    'bucket',
    'pathPrefix',
    'accessKey',
    'secretKey',
  ]) {
    if (value[key] !== undefined)
      await page.fill(`#restore-${storageId}-${key}`, value[key]);
  }
  if (value.forcePathStyle !== undefined) {
    const selected = await page.evaluate((selector) => {
      const control = document.querySelector(`${selector} [role="switch"]`);
      return control.checked ?? control.getAttribute('aria-checked') === 'true';
    }, container);
    if (selected !== value.forcePathStyle) {
      await page.focus(`${container} [role="switch"]`);
      await page.keyboard.press('Space');
    }
  }
  await page.click(`${container} [data-testid="restore-test-target"]`);
  if (confirmR2) {
    await page.waitForSelector('[data-testid="restore-r2-confirm"]');
    await page.click('[data-testid="restore-r2-confirm"]');
  }
  await page.waitForFunction(
    ({ container, expectedState, previousTest }) => {
      const target = document.querySelector(container);
      return (
        target?.dataset.state === expectedState &&
        target.dataset.testedAt &&
        target.dataset.testedAt !== previousTest
      );
    },
    { container, expectedState, previousTest },
    { timeout: 90000 },
  );
}

export async function repairRestoreRemoteCredentials(
  page,
  { storageId, accessKey = '', secretKey = '' },
) {
  const container = `[data-testid="restore-target"][data-storage-id="${storageId}"]`;
  const trigger = `#restore-target-${storageId}`;
  await page.waitForSelector('[data-testid="restore-cleanup-pending"]');
  if (
    await page.evaluate(
      (selector) =>
        document.querySelector(selector).getAttribute('aria-expanded') !==
        'true',
      trigger,
    )
  )
    await page.click(trigger);
  const locked = await page.evaluate(
    (id) =>
      ['endpoint', 'region', 'bucket', 'pathPrefix'].every(
        (key) => document.getElementById(`restore-${id}-${key}`).disabled,
      ),
    storageId,
  );
  assert.equal(
    locked,
    true,
    'Cleanup credential repair cannot change its remote destination',
  );
  if (accessKey) await page.fill(`#restore-${storageId}-accessKey`, accessKey);
  if (secretKey) await page.fill(`#restore-${storageId}-secretKey`, secretKey);
  await page.click(`${container} [data-testid="restore-repair-target"]`);
}

export async function verifyRestoreReauthorization(
  page,
  { setupCode, hasRemoteTargets = false },
) {
  await page.reload();
  await page.waitForSelector('#restore-code');
  assert.equal(
    await page.evaluate(() => document.querySelector('#restore-code').value),
    '',
    'Setup code is not persisted',
  );
  await page.fill('#restore-code', setupCode);
  await page.click('[data-testid="restore-next"]');
  if (hasRemoteTargets) return waitForRemoteRestoreReady(page);
  await page.waitForSelector('[data-testid="restore-ready"]');
}

export async function verifyRestoreActivated(page, { origin }) {
  await page.goto(`${origin}/setup/restore`);
  await page.waitForURL(`${origin}/login`);
}
