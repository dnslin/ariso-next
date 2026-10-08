import assert from 'node:assert/strict';
import {
  button,
  screen,
  editableSite,
  siteFault,
} from './site-general-helpers.mjs';
import {
  prepareSiteGeneralHistory,
  verifySiteGeneralBack,
} from './site-general-history.mjs';
import { signInToLibrary } from './library-login.mjs';

async function pair(tools, name) {
  await tools.evidence(name, 1440, 'light');
  await tools.evidence(name, 390, 'dark');
  await tools.evidence(name, 390, 'light');
}

export async function verifySiteGeneralRecovery(page, config, tools, report) {
  let fault = await siteFault(page, { mode: 'read-hold' }, true);
  try {
    await page.goto(`${config.origin}/settings/general`, {
      waitUntil: 'domcontentloaded',
    });
    await tools.state('loading');
    await fault.wait('releaseRead');
    assert.equal(
      (await fault.observed()).requests[0].status,
      200,
      'Loading holds a real successful GET',
    );
    assert.equal(
      await page.evaluate(
        () =>
          document
            .querySelector('[data-testid="site-general"]')
            .querySelectorAll('input,textarea,button[type="submit"]').length,
      ),
      0,
      'Unread values are not editable placeholders',
    );
    await pair(tools, 'loading');
    await page.focus('.skip-link');
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      () => document.activeElement === document.querySelector('#main-content'),
    );
    await fault.release('releaseRead');
    await tools.state('ready');
    assert.equal(
      await page.evaluate(
        () =>
          document.activeElement === document.querySelector('#main-content'),
      ),
      true,
      'Initial read completion preserves the shared skip-link focus',
    );
  } finally {
    await fault.dispose();
  }
  fault = await siteFault(page, { mode: 'read-error' }, true);
  try {
    await page.goto(`${config.origin}/settings/general`);
    await tools.state('error');
    assert.equal(
      await page.evaluate(
        () =>
          document
            .querySelector('[data-testid="site-general"]')
            .querySelectorAll('input,textarea').length,
      ),
      0,
    );
    await pair(tools, 'read-error');
  } finally {
    await fault.dispose();
  }
  await page.click(button('重新读取站点信息'));
  await tools.state('ready');

  for (const [path, retry] of [
    ['/api/settings/storage', '重新读取默认存储'],
    ['/api/settings/media', '重新读取图片默认值'],
  ]) {
    fault = await siteFault(page, { mode: 'read-error', path }, true);
    try {
      await page.goto(`${config.origin}/settings/general`);
      await tools.state('ready');
      await page.waitForSelector(button(retry));
      await tools.fill({ description: `其他模块读错不锁站点 ${path}` });
      await tools.save();
      assert.equal(
        (await tools.read()).description,
        `其他模块读错不锁站点 ${path}`,
      );
      await tools.evidence(
        path.includes('storage')
          ? 'partial-storage-error'
          : 'partial-media-error',
        390,
        'dark',
      );
      await tools.reveal(
        `main .divide-y > div:nth-child(${path.includes('storage') ? 2 : 3})`,
        path.includes('storage')
          ? 'partial-storage-region'
          : 'partial-media-region',
      );
    } finally {
      await fault.dispose();
    }
    await page.click(button(retry));
    await page.waitForSelector(button(retry), { state: 'hidden' });
  }

  const savingHistory = await prepareSiteGeneralHistory(page, config, tools);
  const unchanged = await tools.values();
  fault = await siteFault(page, { mode: 'write-hold' });
  try {
    await page.click(button('保存站点信息'));
    await fault.wait('releaseWrite');
    await tools.state('saving');
    await tools.enabled(false);
    assert.equal((await fault.observed()).requests[0].status, 200);
    await pair(tools, 'saving');
    await verifySiteGeneralBack(page, tools, report, savingHistory, {
      phase: 'saving',
    });
    await fault.release('releaseWrite');
    await tools.state('ready');
    assert.deepEqual(editableSite(await tools.read()), unchanged);
  } finally {
    await fault.dispose();
  }

  const unknownHistory = await prepareSiteGeneralHistory(page, config, tools);
  const submitted = await tools.values();
  const beforeUnknown = await tools.read();
  fault = await siteFault(page, { mode: 'lost', check: 'hold' });
  try {
    await page.click(button('保存站点信息'));
    await fault.wait('releaseWrite');
    assert.equal(
      (await tools.read()).description,
      submitted.description,
      'Server actually committed before losing the response',
    );
    assert.notEqual(
      (await tools.read()).updatedAt,
      beforeUnknown.updatedAt,
      'The unchanged-fields PATCH still performed a real server write',
    );
    await fault.release('releaseWrite');
    await tools.state('unknown');
    assert.deepEqual(
      await fault.observed(),
      { writes: 1, reads: 0, requests: [{ method: 'PATCH', status: 200 }] },
      'Unknown result performs neither automatic retry nor automatic read',
    );
    assert.deepEqual(await tools.values(), submitted);
    await pair(tools, 'unknown');
    await verifySiteGeneralBack(page, tools, report, unknownHistory, {
      phase: 'unknown',
    });
    await page.click('main a[href="/settings/storage"]');
    const leave = '[role="dialog"]:has-text("放弃未保存的修改")';
    await page.waitForSelector(leave);
    assert.equal(
      await page.evaluate(() =>
        [...document.querySelectorAll('[role="dialog"]')].some(
          (node) =>
            node.textContent.includes('可能') &&
            node.textContent.includes('核对'),
        ),
      ),
      true,
      'Unknown-result leave confirmation does not falsely claim the write failed',
    );
    await page.click(button('继续编辑'));
    await page.waitForSelector(leave, { state: 'hidden' });
    await tools.state('unknown');
    assert.deepEqual(await tools.values(), submitted);
    assert.equal((await fault.observed()).writes, 1);
    await page.click(button('核对已保存设置'));
    await fault.wait('releaseRead');
    await tools.state('checking');
    await tools.enabled(false);
    await pair(tools, 'checking');
    await fault.release('releaseRead');
    await tools.state('confirmed');
    assert.deepEqual(await tools.values(), submitted);
    assert.equal(
      (await fault.observed()).writes,
      1,
      'Read-back never repeats the mutation',
    );
    await pair(tools, 'confirmed');
  } finally {
    await fault.dispose();
  }

  await tools.open();
  await tools.fill({ description: '核对失败仍保留' });
  const retryDraft = await tools.values();
  fault = await siteFault(page, { mode: 'lost', check: 'error' });
  try {
    await page.click(button('保存站点信息'));
    await fault.wait('releaseWrite');
    await fault.release('releaseWrite');
    await tools.state('unknown');
    await page.click(button('核对已保存设置'));
    await tools.state('check-error');
    assert.deepEqual(await tools.values(), retryDraft);
    assert.equal((await fault.observed()).writes, 1);
    await pair(tools, 'check-error');
  } finally {
    await fault.dispose();
  }
  await page.click(button('核对已保存设置'));
  await tools.state('confirmed');
  assert.deepEqual(await tools.values(), retryDraft);

  for (const keep of [false, true]) {
    await tools.open();
    const saved = editableSite(await tools.read());
    await tools.fill({ description: keep ? '保留未提交草稿' : '待替换草稿' });
    const draft = await tools.values();
    fault = await siteFault(page, { mode: 'unsent', check: 'hold' });
    try {
      await page.click(button('保存站点信息'));
      await tools.state('unknown');
      await page.click(button('核对已保存设置'));
      await fault.wait('releaseRead');
      await fault.release('releaseRead');
      await tools.state('different');
      assert.deepEqual(await tools.values(), draft);
      assert.deepEqual(
        editableSite(await tools.read()),
        saved,
        'The injected unsent write did not change the server',
      );
      assert.equal((await fault.observed()).writes, 1);
      await pair(tools, keep ? 'different-keep' : 'different-server');
      await page.click(button(keep ? '保留输入继续编辑' : '使用服务器设置'));
      await tools.state('ready');
      assert.deepEqual(await tools.values(), keep ? draft : saved);
    } finally {
      await fault.dispose();
    }
    if (keep) {
      await tools.save();
      assert.deepEqual(
        editableSite(await tools.read()),
        draft,
        'Only explicit save after choosing the draft writes it',
      );
    }
  }
  assert.equal(
    await page.evaluate(
      (screen) => document.querySelectorAll(screen).length,
      screen,
    ),
    1,
  );
  report.checks.push(
    'Real held initial GET, failed initial read, isolated related-module read failures, held real save, lost committed response, explicit read-back/check failure/retry/match and server-vs-draft choices are covered. Unknown outcomes do not repeat PATCH and preserve the draft.',
  );

  await tools.open();
  const snapshot = () =>
    tools.sql(
      'SELECT name,description,public_url,time_zone,updated_at FROM site_settings WHERE id=1',
    );
  const savedBeforeExpiry = await snapshot();
  await tools.fill({
    name: '会话失效保留名称',
    description: '会话失效保留描述',
    publicUrl: 'https://expired-draft.example.test',
    timeZone: savedBeforeExpiry[0].time_zone === 'UTC' ? 'Asia/Tokyo' : 'UTC',
  });
  const expiredDraft = await tools.values();
  const signedOut = await page.fetch('/api/auth/sign-out', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(signedOut.status, 200, 'The actual owner session is signed out');
  const anonymous = await page.fetch('/api/auth/get-session', {
    cache: 'no-store',
  });
  assert.equal(anonymous.status, 200);
  assert.equal(JSON.parse(anonymous.body), null);
  await page.evaluate(() => {
    const original = window.fetch;
    window.__siteExpiredSave = { original, requests: [] };
    window.fetch = async (...args) => {
      const response = await original(...args);
      if (
        new URL(String(args[0]), location.href).pathname ===
          '/api/settings/site' &&
        args[1]?.method === 'PATCH'
      ) {
        const body = await response.clone().json();
        window.__siteExpiredSave.requests.push({
          method: 'PATCH',
          status: response.status,
          code: body.code,
        });
      }
      return response;
    };
  });
  try {
    await page.click(button('保存站点信息'));
    await tools.state('session');
    report.expiredSave = await page.evaluate(
      () => window.__siteExpiredSave.requests,
    );
    assert.deepEqual(report.expiredSave, [
      { method: 'PATCH', status: 401, code: 'UNAUTHORIZED' },
    ]);
  } finally {
    await page.evaluate(() => {
      window.fetch = window.__siteExpiredSave.original;
      delete window.__siteExpiredSave;
    });
  }
  assert.deepEqual(await tools.values(), expiredDraft);
  await tools.enabled(false);
  const expiredFeedback = await page.evaluate(() => ({
    path: location.pathname,
    alert: [...document.querySelectorAll('[role="alert"]')].find((node) =>
      node.textContent.includes('会话已失效'),
    )?.textContent,
    save: document.querySelector('#site-save').textContent.trim(),
  }));
  assert.equal(expiredFeedback.path, '/settings/general');
  assert.ok(
    expiredFeedback.alert?.includes(
      '当前输入已保留，请重新登录后核对服务器设置。',
    ),
  );
  assert.equal(expiredFeedback.save, '保存站点信息');
  assert.deepEqual(await snapshot(), savedBeforeExpiry);
  await pair(tools, 'session-expired');
  await page.goto(`${config.origin}/library`);
  await page.waitForSelector('#email');
  await signInToLibrary(page, config, report);
  await tools.open();
  assert.deepEqual(await snapshot(), savedBeforeExpiry);
  report.checks.push(
    'Real sign-out makes the browser session anonymous before the explicit site PATCH returns 401 UNAUTHORIZED. All four draft values remain visible and disabled on the same general page with neutral expired feedback and a disabled save action without a saving label. The complete persisted site row remains unchanged; real UI sign-in restores the independent owner session before later consumers.',
  );
}
