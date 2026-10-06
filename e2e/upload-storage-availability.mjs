import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

/** Verify real default/availability changes with an independently owned Local fixture. */
export async function runUploadStorageAvailability({
  page,
  report,
  sql,
  select,
  state,
  released,
  clear,
  imageId,
  layouts,
  trackReferences,
}) {
  const button = (name) => `loc=role:button[name="${name}"]`;
  async function storageAvailability(stage) {
    const response = await page.fetch('/upload/settings');
    const settings = JSON.parse(response.body);
    const snapshot = {
      stage,
      database: {
        settings: await sql('SELECT default_storage_id FROM storage_settings'),
        storages: await sql(
          'SELECT id,enabled FROM storage_configs ORDER BY id',
        ),
      },
      response: {
        status: response.status,
        defaultStorageId: settings.defaultStorageId,
        storages: settings.storages?.map(({ id, enabled }) => ({
          id,
          enabled,
        })),
      },
      message: await page.evaluate(
        () =>
          document.querySelector(
            '[data-testid="upload-settings"] [role="alert"]',
          )?.textContent ?? null,
      ),
    };
    report.storageAvailability ??= [];
    report.storageAvailability.push(snapshot);
    assert.equal(response.status, 200, 'Read real upload storage settings');
    return snapshot.response;
  }
  await trackReferences();
  const [storageSetting] = await sql(
    'SELECT default_storage_id FROM storage_settings',
  );
  const storageId = storageSetting.default_storage_id;
  // The UI still displays the default loaded earlier, but an untouched default
  // is resolved transactionally when Start is clicked, not pinned by the page.
  await select();
  try {
    await sql('UPDATE storage_settings SET default_storage_id=NULL');
    await page.click(button('开始上传'));
    await state('upload-failed');
    assert.ok(!(await imageId()));
    await page.waitForFunction(() =>
      document
        .querySelector('[data-testid="upload-item"]')
        .textContent.includes('没有默认存储'),
    );
    await released();
  } finally {
    await sql(`UPDATE storage_settings SET default_storage_id='${storageId}'`);
  }
  await clear();
  report.checks.push(
    'Removing the default after file selection makes the real Start request fail without imageId; untouched default is resolved on the server at submission time.',
  );
  const enabledStorageIds = (
    await sql('SELECT id FROM storage_configs WHERE enabled=1 ORDER BY id')
  ).map(({ id }) => id);
  let alternateStorageId;
  try {
    const alternate = await page.fetch('/api/storages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'local',
        name: 'Upload availability fixture',
        localPath: `upload-availability-${randomUUID()}`,
      }),
    });
    assert.equal(alternate.status, 201, 'Create independent Local fixture');
    const created = JSON.parse(alternate.body);
    alternateStorageId = created.id;
    assert.ok(alternateStorageId);
    assert.equal(created.enabled, true);
    report.storageFixture = { id: alternateStorageId, deleted: false };
    await sql('UPDATE storage_settings SET default_storage_id=NULL');
    await page.reload();
    await page.waitForSelector('input[aria-label="选择图片文件"]', {
      state: 'attached',
    });
    await select();
    await page.waitForFunction(() =>
      document.body.textContent.includes('默认存储缺失或已停用'),
    );
    await layouts('missing-default');
    assert.equal(
      await page.evaluate(
        () =>
          [...document.querySelectorAll('button')].find(
            (node) => node.textContent === '开始上传',
          ).disabled,
      ),
      true,
    );
    await page.click(button('移除'));
    await sql(`UPDATE storage_settings SET default_storage_id='${storageId}'`);
    await sql(`UPDATE storage_configs SET enabled=0 WHERE id='${storageId}'`);
    await page.reload();
    await page.waitForSelector('input[aria-label="选择图片文件"]', {
      state: 'attached',
    });
    await select();
    const withAlternate = await storageAvailability('disabled-default');
    assert.equal(withAlternate.defaultStorageId, storageId);
    assert.equal(
      withAlternate.storages.find(({ id }) => id === storageId).enabled,
      false,
    );
    assert.equal(
      withAlternate.storages.find(({ id }) => id === alternateStorageId)
        .enabled,
      true,
    );
    await page.waitForFunction(() =>
      document.body.textContent.includes('默认存储缺失或已停用'),
    );
    await layouts('disabled-default');
    assert.equal(
      await page.evaluate(
        () =>
          [...document.querySelectorAll('button')].find(
            (node) => node.textContent === '开始上传',
          ).disabled,
      ),
      true,
      'An available alternative must not silently replace the disabled default',
    );
    assert.ok(!(await imageId()));
    await page.click(button('移除'));
    const availableIds = (
      await sql('SELECT id FROM storage_configs WHERE enabled=1 ORDER BY id')
    ).map(({ id }) => id);
    assert.ok(availableIds.includes(alternateStorageId));
    await sql(
      `UPDATE storage_configs SET enabled=0 WHERE id IN (${availableIds.map((id) => `'${id}'`).join(',')})`,
    );
    await page.reload();
    await page.waitForSelector('input[aria-label="选择图片文件"]', {
      state: 'attached',
    });
    await select();
    const unavailable = await storageAvailability('all-disabled');
    assert.equal(
      unavailable.storages.some(({ enabled }) => enabled),
      false,
    );
    await page.waitForFunction(() =>
      document.body.textContent.includes('暂无可用存储'),
    );
    await layouts('disabled-storage');
    assert.equal(
      await page.evaluate(
        () =>
          [...document.querySelectorAll('button')].find(
            (node) => node.textContent === '开始上传',
          ).disabled,
      ),
      true,
    );
    await page.click(button('移除'));
  } finally {
    try {
      await storageAvailability('before-restoring-storage');
    } catch (error) {
      report.storageDiagnosticError = String(error);
    }
    await sql(`UPDATE storage_settings SET default_storage_id='${storageId}'`);
    if (enabledStorageIds.length)
      await sql(
        `UPDATE storage_configs SET enabled=1 WHERE id IN (${enabledStorageIds.map((id) => `'${id}'`).join(',')})`,
      );
    if (alternateStorageId) {
      const removed = await page.fetch(`/api/storages/${alternateStorageId}`, {
        method: 'DELETE',
      });
      assert.equal(removed.status, 200, 'Delete independent Local fixture');
      assert.equal(JSON.parse(removed.body).deleted, true);
      report.storageFixture.deleted = true;
    }
    assert.deepEqual(
      (
        await sql('SELECT id FROM storage_configs WHERE enabled=1 ORDER BY id')
      ).map(({ id }) => id),
      enabledStorageIds,
      'Restore only originally enabled storages; originally disabled stay disabled',
    );
  }
  const settingsFault = await page.cdp(
    'Page.addScriptToEvaluateOnNewDocument',
    {
      source: `const originalUploadSettingsFetch = window.__uploadFetch; window.__uploadFetch = async (...args) => { if (new URL(String(args[0]), location.href).pathname === '/upload/settings') { window.__uploadFetch = originalUploadSettingsFetch; await originalUploadSettingsFetch(...args); await new Promise(resolve => { window.__uploadReleaseSettings = resolve; }); delete window.__uploadReleaseSettings; throw new TypeError('Verification: settings response lost'); } return originalUploadSettingsFetch(...args); };`,
    },
  );
  try {
    await page.reload();
    await page.waitForFunction(
      () =>
        typeof window.__uploadReleaseSettings === 'function' &&
        document.body.textContent.includes('正在读取上传设置'),
    );
    await layouts('settings-loading');
    await page.evaluate(() => window.__uploadReleaseSettings());
    await page.waitForSelector(button('重试读取设置'));
    await layouts('settings-error');
    await page.click(button('重试读取设置'));
    await page.waitForSelector('input[aria-label="选择图片文件"]', {
      state: 'attached',
    });
  } finally {
    await page.evaluate(() => window.__uploadReleaseSettings?.());
    await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
      identifier: settingsFault.identifier,
    });
  }
  report.checks.push(
    'Real missing default and disabled default with another enabled Local prevent manual start without silently choosing another target; explicitly disabling every enabled storage exposes no available storage. The independent Local fixture is deleted and only originally enabled IDs are restored; lost real settings response displays retry and recovers.',
  );
}
