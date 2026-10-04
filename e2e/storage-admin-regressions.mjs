/* global taskSpace, config */
const { default: assert } = await import('node:assert/strict');
const { writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { identitySql } = await import(config.identitySessionScript);
const { resizeViewport, setTheme, readGeometry, assertGeometry } = await import(
  new URL('./browser-geometry.mjs', config.identitySessionScript).href
);
const task = await taskSpace(config.spaceId);
const page = task.page(config.pageLabel ?? 'p1');
const report = {
  status: 'failed',
  taskSpaceId: task.spaceId,
  origin: config.origin,
  checks: [],
  layouts: [],
  backgroundRequests: [],
  limitations: [
    'Only Local storage recovery, deletion and default intent are exercised; remote S3 services and the full existing layout matrix are outside this regression run.',
    'Representative actual pages use 1440×1080 light and 390×844 dark; physical touch, soft keyboard and nonzero safe areas are not exercised.',
  ],
};
const field = (name) => `input[name="${name}"]`;
const defaultSwitch = 'loc=role:switch[name="设为默认存储"]';
let cookie;
let current;
async function request(path, method = 'GET', body) {
  const response = await fetch(`${config.origin}${path}`, {
    method,
    headers: {
      cookie,
      Origin: config.origin,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const value = await response.json();
  if (method !== 'GET')
    report.backgroundRequests.push({
      path,
      method,
      body,
      status: response.status,
    });
  assert.ok(
    response.ok,
    `${method} ${path}: ${response.status} ${JSON.stringify(value)}`,
  );
  return value;
}
const settings = () => request('/api/settings/storage');
const local = (name) =>
  request('/api/storages', 'POST', { type: 'local', name, localPath: name });
const setDefault = (id) =>
  request('/api/settings/storage', 'PATCH', { defaultStorageId: id });
const save = () => page.click('[data-testid="storage-save"]');
async function waitEditor(id) {
  await page.waitForFunction((id) => {
    const input = document.querySelector('input[name="name"]');
    return (
      location.pathname === `/settings/storage/${id}` &&
      !!document.querySelector('[data-testid="storage-editor"]') &&
      !!input &&
      !input.disabled
    );
  }, id);
}
async function open(id = 'new') {
  await page.goto(`${config.origin}/settings/storage/${id}`);
  await page.waitForSelector('[data-testid="storage-editor"]');
  await page.waitForSelector(field('name'));
  current.startSnapshot = await page.snapshot();
}
async function monitor(fault = null) {
  await page.evaluate((fault) => {
    const original = window.fetch;
    window.__storageRegression = {
      documentId: crypto.randomUUID(),
      requests: [],
      uploadSettings: [],
      faultUsed: false,
    };
    window.fetch = async (...args) => {
      const path = new URL(String(args[0]), location.href).pathname;
      const method = args[1]?.method ?? 'GET';
      const tracked =
        path.startsWith('/api/storages') ||
        path.startsWith('/api/uploads') ||
        path === '/api/settings/storage' ||
        path === '/upload/settings';
      const record = tracked
        ? {
            path,
            method,
            ...(args[1]?.body ? { body: JSON.parse(args[1].body) } : {}),
          }
        : undefined;
      if (record) window.__storageRegression.requests.push(record);
      const response = await original(...args);
      if (record) record.status = response.status;
      if (record && !response.ok) record.error = await response.clone().json();
      if (path === '/upload/settings' && response.ok)
        window.__storageRegression.uploadSettings.push(
          await response.clone().json(),
        );
      if (
        fault &&
        !window.__storageRegression.faultUsed &&
        path === fault.path &&
        method === fault.method
      ) {
        window.__storageRegression.faultUsed = true;
        record.responseLost = true;
        throw new TypeError(
          'Verification: completed real storage response was lost',
        );
      }
      return response;
    };
  }, fault);
}
async function settle() {
  await page.waitForFunction(() => {
    const button = document.querySelector('[data-testid="storage-save"]');
    return (
      button &&
      !button.disabled &&
      window.__storageRegression.requests.every(
        (item) => item.status !== undefined,
      )
    );
  });
}
async function toggleDefault() {
  await page.focus(defaultSwitch);
  await page.keyboard.press('Space');
}
async function evidence(state, width = 1440, theme = 'light') {
  await resizeViewport(page, width);
  await setTheme(page, theme);
  await page.evaluate(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document
      .querySelector('.shell-content')
      ?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  });
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) =>
          animation.playState !== 'running' ||
          animation.effect?.getTiming().iterations === Infinity,
      ),
  );
  const geometry = await readGeometry(page);
  assertGeometry(geometry, state);
  const screenshot = `storage-regression-${state}-${theme}-${width}.png`;
  await page.screenshot({ path: join(config.output, screenshot) });
  report.layouts.push({
    state,
    theme,
    height: width === 1440 ? 1080 : 844,
    ...geometry,
    screenshot,
  });
}
async function authoritative() {
  return {
    storages: await request('/api/storages'),
    settings: await settings(),
    database: {
      storages: await identitySql(
        config,
        'SELECT id,name,type,enabled,local_path FROM storage_configs ORDER BY id',
      ),
      settings: await identitySql(
        config,
        'SELECT default_storage_id FROM storage_settings',
      ),
    },
  };
}
function check(label, assertion) {
  try {
    assertion();
    current.assertions.push({ label, status: 'passed' });
  } catch (error) {
    current.assertions.push({ label, status: 'failed', error: error.message });
  }
}
async function scenario(id, run) {
  current = { id, status: 'failed', assertions: [] };
  report.checks.push(current);
  try {
    await run();
    current.status = current.assertions.every(
      (item) => item.status === 'passed',
    )
      ? 'passed'
      : 'failed';
  } catch (error) {
    current.error = error.stack ?? String(error);
    await page.screenshot({
      path: join(config.output, `storage-regression-${id}-failure.png`),
    });
  } finally {
    current.browser = await page.evaluate(
      () => window.__storageRegression ?? null,
    );
    current.snapshot = await page.snapshot();
    current.notices = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '[data-slot="alert-description"],[role="alert"],[role="status"]',
        ),
      ]
        .filter((node) => node.getClientRects().length)
        .map((node) => node.textContent.trim()),
    );
    current.authoritative = await authoritative();
    check(
      'Final real SQLite rows and default agree with the authoritative API',
      () => {
        assert.equal(
          current.authoritative.database.settings[0].default_storage_id,
          current.authoritative.settings.defaultStorageId,
        );
        assert.deepEqual(
          current.authoritative.database.storages.map((item) => ({
            id: item.id,
            name: item.name,
          })),
          current.authoritative.storages
            .map((item) => ({ id: item.id, name: item.name }))
            .sort((a, b) => a.id.localeCompare(b.id)),
        );
      },
    );
  }
  current.status =
    !current.error &&
    current.assertions.every((item) => item.status === 'passed')
      ? 'passed'
      : 'failed';
  console.log({
    scenario: id,
    status: current.status,
    assertions: current.assertions,
  });
}
async function navigation(path) {
  if (await page.evaluate(() => innerWidth < 1200))
    await page.click('loc=role:button[name="菜单"]');
  await page.click(`a.shell-nav-link[href="${path}"]`);
  await page.waitForURL(`${config.origin}${path}`);
}
async function cleanup(id) {
  await request(`/api/storages/${id}`, 'DELETE');
}
try {
  await page.goto(config.origin);
  const login = await page.fetch('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(config.credentials),
  });
  assert.equal(login.status, 200, login.body);
  const { cookies } = await page.cdp('Network.getCookies', {
    urls: [config.origin],
  });
  cookie = cookies.map((item) => `${item.name}=${item.value}`).join('; ');

  await scenario('create-lost-response-default', async () => {
    await resizeViewport(page, 1440);
    await open();
    await setTheme(page, 'light');
    await page.fill(field('name'), 'regression-create-default');
    await page.fill(field('localPath'), 'regression-create-default');
    await toggleDefault();
    await monitor({ path: '/api/storages', method: 'POST' });
    await save();
    await page.waitForFunction(() => window.__storageRegression.faultUsed);
    await settle();
    const browser = await page.evaluate(() => window.__storageRegression);
    const rows = (await request('/api/storages')).filter(
      (item) => item.name === 'regression-create-default',
    );
    const defaultId = (await settings()).defaultStorageId;
    current.result = { rows, defaultId };
    await waitEditor(rows[0]?.id);
    await evidence('create-reconciled');
    check(
      'Real POST succeeds once; reconciliation creates no duplicate',
      () => {
        assert.equal(
          browser.requests.filter(
            (item) => item.path === '/api/storages' && item.method === 'POST',
          ).length,
          1,
        );
        assert.equal(rows.length, 1);
        assert.equal(
          browser.requests.find((item) => item.responseLost)?.status,
          201,
        );
      },
    );
    check(
      'Recovered create completes the explicitly requested default PATCH',
      () => {
        assert.equal(defaultId, rows[0]?.id);
        assert.deepEqual(
          browser.requests
            .filter(
              (item) =>
                item.method === 'PATCH' &&
                item.path === '/api/settings/storage',
            )
            .map((item) => item.body),
          [{ defaultStorageId: rows[0]?.id }],
        );
      },
    );
    if (rows[0]) current.cleanupId = rows[0].id;
  });
  if (current.cleanupId) await cleanup(current.cleanupId);

  await scenario('update-lost-response-clear-default', async () => {
    const target = await local('regression-clear-default');
    current.cleanupId = target.id;
    await setDefault(target.id);
    await open(target.id);
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector('[role="switch"][aria-label="设为默认存储"]')
            .checked,
      ),
      true,
    );
    await page.fill(field('name'), 'regression-clear-default-renamed');
    await toggleDefault();
    await monitor({ path: `/api/storages/${target.id}`, method: 'PATCH' });
    await save();
    await page.waitForFunction(() => window.__storageRegression.faultUsed);
    await settle();
    await evidence('rename-clear-reconciled', 390, 'dark');
    const browser = await page.evaluate(() => window.__storageRegression);
    const saved = await request(`/api/storages/${target.id}`);
    const defaultId = (await settings()).defaultStorageId;
    current.result = { saved, defaultId };
    check('Real rename PATCH succeeds once and is read back', () => {
      assert.equal(saved.name, 'regression-clear-default-renamed');
      assert.equal(
        browser.requests.filter(
          (item) =>
            item.path === `/api/storages/${target.id}` &&
            item.method === 'PATCH',
        ).length,
        1,
      );
      assert.equal(
        browser.requests.find((item) => item.responseLost)?.status,
        200,
      );
    });
    check('Recovered rename completes the explicit clear-default PATCH', () => {
      assert.equal(defaultId, null);
      assert.deepEqual(
        browser.requests
          .filter(
            (item) =>
              item.method === 'PATCH' && item.path === '/api/settings/storage',
          )
          .map((item) => item.body),
        [{ defaultStorageId: null }],
      );
    });
  });
  if (current.cleanupId) await cleanup(current.cleanupId);

  await scenario('default-lost-response-read-only', async () => {
    const target = await local('regression-default-lost');
    current.cleanupId = target.id;
    await setDefault(null);
    await open(target.id);
    await monitor({ path: '/api/settings/storage', method: 'PATCH' });
    await toggleDefault();
    await save();
    await page.waitForFunction(() => window.__storageRegression.faultUsed);
    await settle();
    const browser = await page.evaluate(() => window.__storageRegression);
    const defaultId = (await settings()).defaultStorageId;
    current.result = { target, defaultId };
    check(
      'Lost real default PATCH is verified through GET without repeating mutation',
      () => {
        assert.equal(defaultId, target.id);
        assert.deepEqual(
          browser.requests
            .filter(
              (item) =>
                item.method === 'PATCH' &&
                item.path === '/api/settings/storage',
            )
            .map((item) => item.body),
          [{ defaultStorageId: target.id }],
        );
        assert.equal(
          browser.requests.find((item) => item.responseLost)?.status,
          200,
        );
        assert.ok(
          browser.requests.some(
            (item) =>
              item.method === 'GET' && item.path === '/api/settings/storage',
          ),
        );
        assert.equal(
          browser.requests.filter(
            (item) =>
              item.method === 'PATCH' &&
              item.path === `/api/storages/${target.id}`,
          ).length,
          0,
        );
      },
    );
  });
  if (current.cleanupId) await cleanup(current.cleanupId);

  for (const lost of [false, true]) {
    await scenario(
      `delete-${lost ? 'lost-response' : 'normal'}-upload-cache`,
      async () => {
        const target = await local(
          `regression-delete-${lost ? 'lost' : 'normal'}`,
        );
        await setDefault(target.id);
        const width = lost ? 390 : 1440;
        await resizeViewport(page, width);
        await page.goto(`${config.origin}/upload`);
        await page.waitForSelector('[data-testid="upload-settings"]');
        await setTheme(page, lost ? 'dark' : 'light');
        current.startSnapshot = await page.snapshot();
        await monitor(
          lost
            ? { path: `/api/storages/${target.id}`, method: 'DELETE' }
            : null,
        );
        const documentId = await page.evaluate(
          () => window.__storageRegression.documentId,
        );
        await page.setInputFiles('input[aria-label="选择图片文件"]', [
          join(
            config.projectDirectory,
            'tests/fixtures/runtime/images/sample.png',
          ),
        ]);
        await page.waitForSelector(
          '[data-testid="upload-item"][data-state="queued"]',
        );
        await navigation('/settings/storage');
        await page.waitForSelector(
          '[data-testid="storage-list"][data-state="ready"]',
        );
        await page.click(`a[href="/settings/storage/${target.id}"]`);
        await page.waitForSelector('[data-testid="storage-editor"]');
        const detail = await request(`/api/storages/${target.id}`);
        assert.equal(detail.references.activeWrites, 0);
        assert.ok(
          Object.values(detail.references.counts).every((value) => value === 0),
        );
        await page.click('[data-testid="storage-delete"]');
        await page.waitForSelector('[data-testid="storage-confirm-delete"]');
        await page.click('[data-testid="storage-confirm-delete"]');
        await page.waitForURL(`${config.origin}/settings/storage`);
        await page.waitForSelector(
          '[data-testid="storage-list"][data-state="ready"]',
        );
        await navigation('/upload');
        await page.waitForSelector('[data-testid="upload-settings"]');
        await page.waitForSelector(
          '[data-testid="upload-item"][data-state="queued"]',
        );
        await page.click(
          '[data-testid="upload-settings"] [aria-haspopup="listbox"] >> nth=0',
        );
        await page.waitForSelector('[role="listbox"]');
        current.options = await page.evaluate(() =>
          [
            ...document.querySelectorAll('[role="listbox"] [role="option"]'),
          ].map((node) => ({
            name: node.textContent.trim(),
            selected: node.getAttribute('aria-selected'),
            id: node.getAttribute('data-key'),
          })),
        );
        await page.keyboard.press('Escape');
        await evidence(
          `delete-${lost ? 'lost' : 'normal'}-return-upload`,
          width,
          lost ? 'dark' : 'light',
        );
        const browser = await page.evaluate(() => window.__storageRegression);
        const uploadSettings = await request('/upload/settings');
        current.result = { target, uploadSettings };
        check(
          'Same browser document and unsubmitted local queue survive actual navigation',
          () => {
            assert.equal(browser.documentId, documentId);
            assert.ok(
              browser.requests.every(
                (item) => !item.path.startsWith('/api/uploads'),
              ),
            );
          },
        );
        check(
          'One real DELETE clears the database default; lost response is checked by GET 404',
          () => {
            const deletes = browser.requests.filter(
              (item) =>
                item.method === 'DELETE' &&
                item.path === `/api/storages/${target.id}`,
            );
            assert.equal(deletes.length, 1);
            assert.equal(deletes[0].status, 200);
            assert.equal(deletes[0].responseLost ?? false, lost);
            if (lost)
              assert.ok(
                browser.requests.some(
                  (item) =>
                    item.method === 'GET' &&
                    item.path === `/api/storages/${target.id}` &&
                    item.status === 404,
                ),
              );
            assert.equal(uploadSettings.defaultStorageId, null);
            assert.ok(
              !uploadSettings.storages.some((item) => item.id === target.id),
            );
          },
        );
        check(
          'Persistent UploadProvider refreshes its settings and cannot choose deleted storage',
          () => {
            assert.ok(
              browser.uploadSettings.some(
                (value) =>
                  value.defaultStorageId === null &&
                  !value.storages.some((item) => item.id === target.id),
              ),
              'Provider must perform a real refreshed /upload/settings read',
            );
            assert.ok(
              !current.options.some((item) => item.name === target.name),
              'Deleted storage must disappear from actual Select options',
            );
          },
        );
      },
    );
  }

  await scenario('rename-preserves-external-default', async () => {
    const a = await local('regression-default-a');
    const b = await local('regression-default-b');
    await setDefault(a.id);
    await resizeViewport(page, 1440);
    await open(a.id);
    await setTheme(page, 'light');
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector('[role="switch"][aria-label="设为默认存储"]')
            .checked,
      ),
      true,
    );
    await monitor();
    await setDefault(b.id);
    current.defaultsAfterRename = [];
    for (const name of [
      'regression-default-a-first',
      'regression-default-a-second',
    ]) {
      await page.fill(field('name'), name);
      await save();
      await settle();
      current.defaultsAfterRename.push((await settings()).defaultStorageId);
    }
    const renamed = await request(`/api/storages/${a.id}`);
    const browser = await page.evaluate(() => window.__storageRegression);
    await evidence('external-default-after-two-renames');
    check(
      'Two explicit name-only saves preserve external default B without default PATCH',
      () => {
        assert.deepEqual(current.defaultsAfterRename, [b.id, b.id]);
        assert.equal(renamed.name, 'regression-default-a-second');
        assert.deepEqual(
          browser.requests
            .filter(
              (item) =>
                item.method === 'PATCH' &&
                item.path === `/api/storages/${a.id}`,
            )
            .map((item) => item.body),
          [
            { name: 'regression-default-a-first' },
            { name: 'regression-default-a-second' },
          ],
        );
        assert.equal(
          browser.requests.filter(
            (item) =>
              item.method === 'PATCH' && item.path === '/api/settings/storage',
          ).length,
          0,
        );
      },
    );
    // Establish a false switch through the real UI, then explicitly turn it on.
    if (
      await page.evaluate(
        () =>
          document.querySelector('[role="switch"][aria-label="设为默认存储"]')
            .checked,
      )
    ) {
      await toggleDefault();
      await save();
      await settle();
    }
    await toggleDefault();
    await save();
    await settle();
    const afterEnable = (await settings()).defaultStorageId;
    await toggleDefault();
    await save();
    await settle();
    const afterClear = (await settings()).defaultStorageId;
    current.result = { a, b, afterEnable, afterClear };
    check('Explicit default switch still selects A and clears default', () => {
      assert.equal(afterEnable, a.id);
      assert.equal(afterClear, null);
    });
  });
  await scenario('recovered-create-default-rejected-correction', async () => {
    await resizeViewport(page, 390);
    await open();
    await setTheme(page, 'dark');
    await page.fill(field('name'), 'regression-disabled-default');
    await page.fill(field('localPath'), 'regression-disabled-default');
    await toggleDefault();
    await page.focus('loc=role:switch[name="启用此存储"]');
    await page.keyboard.press('Space');
    await monitor({ path: '/api/storages', method: 'POST' });
    await save();
    await page.waitForFunction(() => window.__storageRegression.faultUsed);
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="storage-save"]')?.textContent !==
        '正在保存',
    );
    const rows = (await request('/api/storages')).filter(
      (item) => item.name === 'regression-disabled-default',
    );
    assert.equal(rows.length, 1);
    const target = rows[0];
    const browser = await page.evaluate(() => window.__storageRegression);
    const controls = await page.evaluate(() => ({
      saveDisabled: document.querySelector('[data-testid="storage-save"]')
        .disabled,
      enabledDisabled: document.querySelector(
        '[role="switch"][aria-label="启用此存储"]',
      ).disabled,
      isDefault: document.querySelector(
        '[role="switch"][aria-label="设为默认存储"]',
      ).checked,
      message: [...document.querySelectorAll('[data-slot="alert-description"]')]
        .map((node) => node.textContent.trim())
        .join('\n'),
    }));
    current.rejected = {
      target,
      controls,
      browser,
      defaultId: (await settings()).defaultStorageId,
    };
    await evidence('recovered-default-rejected');
    check(
      'Recovered real POST proceeds to an explicit 409 STORAGE_DISABLED default refusal',
      () => {
        assert.equal(target.enabled, false);
        assert.equal(
          browser.requests.find((item) => item.responseLost)?.status,
          201,
        );
        const defaults = browser.requests.filter(
          (item) =>
            item.path === '/api/settings/storage' && item.method === 'PATCH',
        );
        assert.equal(defaults.length, 1);
        assert.equal(defaults[0].status, 409);
        assert.equal(defaults[0].error.code, 'STORAGE_DISABLED');
        assert.equal(current.rejected.defaultId, null);
      },
    );
    check(
      'Explicit refusal preserves default intent and leaves correction controls usable',
      () => {
        assert.equal(controls.isDefault, true);
        assert.equal(controls.saveDisabled, false);
        assert.equal(controls.enabledDisabled, false);
        assert.ok(controls.message.includes(`存储已停用: ${target.id}`));
      },
    );
    if (!controls.saveDisabled && !controls.enabledDisabled) {
      await page.focus('loc=role:switch[name="启用此存储"]');
      await page.keyboard.press('Space');
      await save();
      await settle();
      const corrected = await request(`/api/storages/${target.id}`);
      const defaultId = (await settings()).defaultStorageId;
      await waitEditor(target.id);
      const requests = await page.evaluate(
        () => window.__storageRegression.requests,
      );
      current.result = { corrected, defaultId };
      check(
        'User enable-and-save completes default without creating a second storage',
        () => {
          assert.equal(corrected.enabled, true);
          assert.equal(defaultId, target.id);
          assert.equal(
            requests.filter(
              (item) => item.path === '/api/storages' && item.method === 'POST',
            ).length,
            1,
          );
          assert.deepEqual(
            requests
              .filter(
                (item) =>
                  item.path === `/api/storages/${target.id}` &&
                  item.method === 'PATCH',
              )
              .map((item) => item.body),
            [{ enabled: true }],
          );
          assert.deepEqual(
            requests
              .filter(
                (item) =>
                  item.path === '/api/settings/storage' &&
                  item.method === 'PATCH',
              )
              .map((item) => item.status),
            [409, 200],
          );
        },
      );
      await evidence('recovered-default-corrected', 390, 'dark');
    }
  });
  report.status = report.checks.every((item) => item.status === 'passed')
    ? 'passed'
    : 'failed';
  assert.equal(
    report.status,
    'passed',
    'Storage regressions failed; see individual assertions in storage-admin-regressions.json',
  );
} catch (error) {
  report.error = error.stack ?? String(error);
  await page.screenshot({
    path: join(config.output, 'storage-admin-regressions-failure.png'),
  });
  throw error;
} finally {
  await writeFile(
    join(config.output, 'storage-admin-regressions.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
console.log({
  storageAdminRegressions: report.status,
  report: join(config.output, 'storage-admin-regressions.json'),
});
