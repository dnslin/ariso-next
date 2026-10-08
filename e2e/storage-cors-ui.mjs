import assert from 'node:assert/strict';
import { identitySql } from './identity-session.mjs';
import { verifyLongCorsOrigin } from './storage-cors-origin.mjs';
import {
  verifyCorsLayouts,
  verifyCorsDialogs,
  ensureCorsOverview,
  captureCorsDialog,
} from './storage-cors-layout.mjs';
export { verifyCorsLayouts } from './storage-cors-layout.mjs';

const root = '[data-testid="storage-cors"]';
const start = '[data-testid="cors-start"]';
const button = (name) => `loc=role:button[name="${name}"]`;
async function retryReadWithKeyboard(page, field, value) {
  await page.focus(button('重新加载'));
  await page.waitForFunction(
    () => document.activeElement?.textContent.trim() === '重新加载',
  );
  await page.evaluate(
    ({ field, value }) => {
      document.addEventListener(
        'keydown',
        (event) => {
          if (event.key === 'Enter') window[field] = value;
        },
        { capture: true, once: true },
      );
    },
    { field, value },
  );
  await page.keyboard.press('Enter');
}
const readState = async (page, id) => {
  const response = await page.fetch(`/api/storages/${id}/cors-tests`);
  assert.equal(response.status, 200);
  return JSON.parse(response.body);
};
export async function verifyCorsAccessBoundaries(
  page,
  config,
  request,
  report,
) {
  const storages = await request('/api/storages');
  const local = storages.find((storage) => storage.type === 'local');
  assert.ok(
    local,
    'The isolated initialized application has a real Local storage',
  );
  const deleted = await request('/api/storages', 'POST', {
    type: 'local',
    name: 'Deleted CORS boundary fixture',
    localPath: 'cors-deleted-ui-boundary',
  });
  // The deletion feature belongs to another task. Remove only this unreferenced
  // disposable fixture row to represent a previously deleted identifier.
  await identitySql(
    config,
    `DELETE FROM storage_configs WHERE id = '${deleted.id}'`,
  );
  for (const boundary of [
    {
      id: `missing-${Date.now()}`,
      status: 404,
      code: 'STORAGE_NOT_FOUND',
      label: 'missing',
    },
    {
      id: deleted.id,
      status: 404,
      code: 'STORAGE_NOT_FOUND',
      label: 'deleted',
    },
    {
      id: local.id,
      status: 400,
      code: 'STORAGE_INVALID_INPUT',
      label: 'local',
    },
  ]) {
    const response = await page.fetch(
      `/api/storages/${boundary.id}/cors-tests`,
    );
    assert.equal(response.status, boundary.status);
    assert.equal(JSON.parse(response.body).code, boundary.code);
    await page.goto(`${config.origin}/settings/storage/${boundary.id}/cors`);
    await page.waitForSelector(
      '[data-testid="storage-cors"][data-state="error"]',
    );
    assert.equal(
      await page.evaluate(
        () => document.querySelector('[data-testid="cors-start"]') !== null,
      ),
      false,
    );
    const probes = await identitySql(
      config,
      `SELECT count(*) AS count FROM storage_probes WHERE storage_id = '${boundary.id}'`,
    );
    assert.equal(probes[0].count, 0);
    await verifyCorsLayouts(
      page,
      config,
      `${boundary.label}-storage`,
      report,
      [1440, 390],
    );
  }
  report.checks.push(
    'Actual missing, controlled deleted and existing Local storage routes expose their real 404/400 errors without runnable CORS controls or probe creation; CORS boundary remains separate from the management editor',
  );
}
export async function openCorsUi(page, config, id) {
  await page.goto(`${config.origin}/settings/storage/${id}/cors`);
  await page.waitForFunction(() => {
    const state = document.querySelector('[data-testid="storage-cors"]')
      ?.dataset.state;
    return state && state !== 'loading';
  });
}

export async function runCorsUiSample(page, storageId, expected = 'passed') {
  const before = (await readState(page, storageId)).report?.probeId;
  if (
    !(await page.evaluate(
      () => !!document.querySelector('[data-testid="cors-start"]'),
    ))
  )
    await ensureCorsOverview(page);
  await page.waitForFunction(() => {
    const button = document.querySelector('[data-testid="cors-start"]');
    return button && !button.disabled;
  });
  // Actual user activation calls the shipped React handler and runCorsSample.
  await page.focus(start);
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    async ({ id, before, expected }) => {
      const response = await fetch(`/api/storages/${id}/cors-tests`);
      if (!response.ok) return false;
      const state = await response.json();
      return (
        state.report?.probeId !== before &&
        state.status === expected &&
        !state.probes.some((probe) => probe.state === 'running') &&
        document.querySelector('[data-testid="storage-cors"]')?.dataset
          .state === expected &&
        !document.querySelector('[data-testid="cors-start"]')?.disabled
      );
    },
    { id: storageId, before, expected },
    { timeout: 90000 },
  );
  const state = await readState(page, storageId);
  assert.equal(state.status, expected);
  return state.report;
}

// Hold/reject real GET results at the browser boundary. Successful response
// bytes always come from production; this never fabricates a passed result.
async function readingFault(page, id, mode) {
  return page.cdp('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      const original = window.fetch;
      window.__corsReadMode = ${JSON.stringify(mode)};
      window.fetch = async (...args) => {
        const response = await original(...args);
        const path = new URL(String(args[0]), location.href).pathname;
        if (path === ${JSON.stringify(`/api/storages/${id}/cors-tests`)} && (!args[1]?.method || args[1].method === 'GET')) {
          if (window.__corsReadMode === 'hold') await new Promise(resolve => { window.__releaseCorsRead = resolve; });
          if (window.__corsReadMode === 'fail') throw new TypeError('Verification: real CORS state response was lost');
        }
        return response;
      };
    })();`,
  });
}

export async function verifyCorsUiFailures({
  page,
  config,
  storage,
  control,
  request,
  report,
  entry,
}) {
  const id = storage.id;
  const record = (result) =>
    entry.probes.push({ key: `probes/${result.probeId}`, report: result });
  await verifyCorsLayouts(page, config, 'passed', report);
  await page.waitForSelector(`a[href="/settings/storage/${id}"]`);
  assert.equal(
    await page.evaluate(
      (id) =>
        document
          .querySelector(`a[href="/settings/storage/${id}"]`)
          .textContent.trim(),
      id,
    ),
    '管理此存储',
  );
  await verifyCorsDialogs(page, config, id, report);
  await page.reload();
  await page.waitForSelector(`${root}[data-state="passed"]`);
  await page.click(button('查看清理状态'));
  await page.waitForSelector(button('刷新清理状态'));
  await page.evaluate((id) => {
    const original = window.fetch;
    window.__corsCachedReadFailure = true;
    window.fetch = async (...args) => {
      const response = await original(...args);
      if (
        window.__corsCachedReadFailure &&
        new URL(String(args[0]), location.href).pathname ===
          `/api/storages/${id}/cors-tests` &&
        (!args[1]?.method || args[1].method === 'GET')
      ) {
        throw new TypeError(
          'Verification: refresh of cached passed result lost its real response',
        );
      }
      return response;
    };
  }, id);
  await page.click(button('刷新清理状态'));
  await page.waitForSelector(button('重新加载'));
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelector('[data-testid="storage-cors"]').dataset.state,
    ),
    'error',
  );
  assert.equal(
    await page.evaluate(() =>
      document.querySelector('h1').textContent.includes('检测通过'),
    ),
    false,
  );
  await verifyCorsLayouts(
    page,
    config,
    'cached-read-error',
    report,
    [1440, 390],
  );
  await retryReadWithKeyboard(page, '__corsCachedReadFailure', false);
  await page.waitForSelector(`${root}[data-state="passed"]`);
  report.checks.push(
    'Audit regression: refreshing a cached passed result into a real read failure removes passed title/state; retry restores the actual persisted result',
  );
  await request(`/api/storages/${id}`, 'PATCH', {
    name: '长名称直传存储验证'.repeat(20),
  });
  await page.reload();
  await page.waitForSelector(`${root}[data-state="passed"]`);
  await verifyCorsLayouts(page, config, 'long-name', report, [1440, 390]);
  await request(`/api/storages/${id}`, 'PATCH', { name: storage.name });
  await page.reload();
  await ensureCorsOverview(page);
  report.checks.push(
    'A 180-character saved name remains usable at desktop/mobile widths; a connected disabled storage can be tested before enabling',
  );

  const held = await readingFault(page, id, 'hold');
  try {
    await page.reload();
    await page.waitForSelector('[role="status"]');
    assert.ok(
      await page.evaluate(() =>
        document.body.textContent.includes('正在读取直传设置'),
      ),
    );
    assert.equal(
      await page.evaluate(
        () =>
          !!document.querySelector('[data-testid="cors-start"]') &&
          !document.querySelector('[data-testid="cors-start"]').disabled,
      ),
      false,
    );
    await page.waitForFunction(
      () => typeof window.__releaseCorsRead === 'function',
    );
    await page.evaluate(() => {
      window.__corsReadMode = 'normal';
      window.__releaseCorsRead();
    });
    await ensureCorsOverview(page);
  } finally {
    await page.cdp('Page.removeScriptToEvaluateOnNewDocument', held);
  }
  const failedRead = await readingFault(page, id, 'fail');
  try {
    await page.reload();
    await page.waitForSelector(button('重新加载'));
    await page.waitForSelector(`${root}[data-state="error"] [role="alert"]`);
    const unavailable = await page.evaluate(() => {
      const screen = document.querySelector('[data-testid="storage-cors"]');
      const alert = screen.querySelector('[role="alert"]');
      return {
        state: screen.dataset.state,
        role: alert?.role,
        text: alert?.textContent,
      };
    });
    assert.equal(unavailable.state, 'error');
    assert.equal(unavailable.role, 'alert');
    assert.ok(unavailable.text.includes('无法读取直传设置'));
    assert.ok(
      unavailable.text.includes(
        'Verification: real CORS state response was lost',
      ),
    );
    report.readFailureAlert = unavailable;
    assert.equal(
      await page.evaluate(
        () =>
          !!document.querySelector('[data-testid="cors-start"]') &&
          !document.querySelector('[data-testid="cors-start"]').disabled,
      ),
      false,
    );
    await verifyCorsLayouts(page, config, 'read-error', report, [1440, 390]);
    await retryReadWithKeyboard(page, '__corsReadMode', 'normal');
    await ensureCorsOverview(page);
  } finally {
    await page.cdp('Page.removeScriptToEvaluateOnNewDocument', failedRead);
  }
  report.checks.push(
    'Held/rejected real reads expose loading/error; no runnable detection while data is unavailable; retry recovers without navigation',
  );

  await verifyLongCorsOrigin(page, config, id, report);
  record(await runCorsUiSample(page, id));
  report.checks.push(
    'Restoring the original origin remains invalidated until a fresh real UI test passes',
  );

  await control('deny-cors');
  const failed = await runCorsUiSample(page, id, 'failed');
  record(failed);
  assert.equal(failed.passed, false);
  assert.ok(
    await page.evaluate(() =>
      document
        .querySelector('[data-testid="storage-cors"]')
        .textContent.includes('CORS'),
    ),
  );
  await verifyCorsLayouts(page, config, 'failed', report, [1440, 390]);

  await control('delete-failure');
  const dirty = await runCorsUiSample(page, id, 'failed');
  record(dirty);
  assert.equal(dirty.cleanupPending, true);
  await page.click(button('查看清理状态'));
  await page.waitForSelector('loc=role:dialog[name="检测对象清理状态"]');
  assert.ok(
    await page.evaluate(
      (key) =>
        document.querySelector('[role="dialog"]').textContent.includes(key),
      `probes/${dirty.probeId}`,
    ),
  );
  await captureCorsDialog(page, config, 'cleanup-pending', report);
  await control('normal');
  await page.focus(button('重试清理'));
  assert.equal(
    await page.evaluate(() => document.activeElement?.textContent.trim()),
    '重试清理',
  );
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    async (id) =>
      (await (await fetch(`/api/storages/${id}/cors-tests`)).json()).probes
        .length === 0,
    id,
  );
  await page.waitForSelector('loc=role:dialog[name="本次测试对象已清理"]');
  // CorsDialog restores focus on the next animation frame after removing the
  // retry button. The changed heading can render before that focus callback.
  await page.waitForFunction(() =>
    document.querySelector('[role="dialog"]')?.contains(document.activeElement),
  );
  const cleanupFocus = await page.evaluate(() => ({
    withinDialog: document
      .querySelector('[role="dialog"]')
      .contains(document.activeElement),
    tag: document.activeElement.tagName,
    name:
      document.activeElement.getAttribute('aria-label') ||
      document.activeElement.textContent.trim().slice(0, 80),
  }));
  report.cleanupFocus = cleanupFocus;
  await page.screenshot({
    path: `${config.output}/cors-cleanup-keyboard-focus.png`,
  });
  assert.equal(
    cleanupFocus.withinDialog,
    true,
    'Keyboard cleanup completion retains focus inside the dialog',
  );
  await captureCorsDialog(page, config, 'cleanup-complete', report);
  await page.click(button('返回直传设置'));
  report.checks.push(
    'Production UI reports CORS failure and exact-key cleanup failure; real retry removes object and updates cleanup dialog',
  );

  // A real configuration revision change invalidates the prior result and
  // disables testing until the new revision passes connection verification.
  const changed = await request(`/api/storages/${id}`, 'PATCH', {
    secretKey: 'test-secret-revised',
  });
  await page.reload();
  await page.waitForSelector(`${root}[data-state="invalidated"]`);
  assert.equal(
    await page.evaluate(
      () => document.querySelector('[data-testid="cors-start"]').disabled,
    ),
    true,
  );
  await verifyCorsLayouts(page, config, 'invalidated', report, [1440, 390]);
  await page.click(button('查看失效原因'));
  await page.waitForSelector('loc=role:dialog[name="直传检测结果已失效"]');
  assert.equal(
    await page.evaluate(
      () =>
        [...document.querySelectorAll('[role="dialog"] button')].find(
          (button) => button.textContent.trim() === '重新检测',
        ).disabled,
    ),
    true,
  );
  assert.equal(
    await page.evaluate(() =>
      document
        .querySelector('[role="dialog"]')
        .textContent.includes('当前存储配置尚未通过连接测试'),
    ),
    true,
    'Disabled retest explains the actual connection prerequisite',
  );
  await captureCorsDialog(page, config, 'invalidated-dialog', report);
  await page.click(button('返回直传设置'));
  const connection = await request(`/api/storages/${id}/test`, 'POST', {
    revision: changed.configRevision,
  });
  assert.equal(connection.passed, true);
  await page.reload();
  await page.waitForSelector(start);
  report.checks.push(
    'Real credential revision invalidates CORS and disables detection until the new connection test passes',
  );

  // Navigation can race with the interrupted request's completion report.
  // Exercise the definite lost-report case at the real fetch boundary rather
  // than assuming every navigation prevents that report from reaching server.
  await page.evaluate((id) => {
    const original = window.fetch;
    sessionStorage.setItem('cors-lost-completion', '[]');
    window.fetch = async function (input, init) {
      const url = new URL(
        typeof input === 'string' ? input : input.url,
        location.href,
      );
      if (
        url.pathname.startsWith(`/api/storages/${id}/cors-tests/`) &&
        url.pathname.endsWith('/complete') &&
        init?.method === 'POST'
      ) {
        const attempts = JSON.parse(
          sessionStorage.getItem('cors-lost-completion'),
        );
        attempts.push({ results: JSON.parse(init.body).results });
        sessionStorage.setItem(
          'cors-lost-completion',
          JSON.stringify(attempts),
        );
        throw new TypeError('Controlled completion connection loss');
      }
      return original.call(this, input, init);
    };
  }, id);
  await control('hold-put');
  await page.click(start);
  await page.waitForFunction(
    async (id) =>
      (
        await (await fetch(`/api/storages/${id}/cors-tests`)).json()
      ).probes.some((probe) => probe.state === 'running'),
    id,
  );
  assert.equal(
    await page.evaluate(() => {
      const start = document.querySelector('[data-testid="cors-start"]');
      return !start || start.disabled;
    }),
    true,
  );
  const pending = (await readState(page, id)).probes[0];
  await verifyCorsLayouts(page, config, 'running', report, [1440, 390]);
  await page.cdp('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.click('a[aria-label="图库"]');
  await page.waitForURL(`${config.origin}/library`);
  await page.waitForSelector(root, { state: 'hidden' });
  await control('normal');
  await page.waitForFunction(
    () => JSON.parse(sessionStorage.getItem('cors-lost-completion')).length > 0,
  );
  report.navigationInterruption = {
    route: '/library',
    completionFault:
      'Reject the production POST /complete fetch before network dispatch; all other requests stay real',
    attempts: await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem('cors-lost-completion')),
    ),
    persistedAfterNavigation: await readState(page, id),
  };
  assert.equal(
    report.navigationInterruption.attempts.length,
    1,
    'The production completion request encountered the injected connection loss once',
  );
  const interrupted = report.navigationInterruption.attempts[0].results;
  assert.deepEqual(
    interrupted.map((result) => result.method),
    ['PUT', 'GET', 'HEAD'],
  );
  assert.ok(
    interrupted.every(
      (result) => result.status === 0 && result.responseType === 'error',
    ),
  );
  assert.match(interrupted[0].error, /已中断或超时/);
  assert.ok(
    interrupted
      .slice(1)
      .every((result) => result.error === '前一步未通过，本步未执行'),
  );
  assert.ok(
    report.navigationInterruption.persistedAfterNavigation.probes.some(
      (probe) => probe.probeId === pending.probeId && probe.state === 'running',
    ),
  );

  const expiredRow = await identitySql(
    config,
    `UPDATE storage_probes SET expires_at = 1 WHERE id = '${pending.probeId}' AND state = 'running'`,
  );
  assert.equal(
    expiredRow.changes,
    1,
    'After navigation the probe is still running without a browser completion callback',
  );
  await page.waitForFunction(
    async (id) => {
      const state = await (
        await fetch(`/api/storages/${id}/cors-tests`)
      ).json();
      return state.probes.length === 0 && state.status === 'failed';
    },
    id,
    { timeout: 75000 },
  );
  const expired = await readState(page, id);
  assert.equal(expired.report.passed, false);
  assert.equal(expired.report.probeId, pending.probeId);
  record(expired.report);
  await openCorsUi(page, config, id);
  await page.waitForSelector(`${root}[data-state="failed"]`);
  assert.deepEqual((await control()).objects, []);
  report.checks.push(
    'Actual UI navigation during a held PUT with an undeliverable completion report leaves server cleanup responsibility; controlled persisted expiry is recovered by the production maintenance loop and reopened page shows failed',
  );
}
