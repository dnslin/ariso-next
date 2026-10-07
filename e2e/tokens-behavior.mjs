import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resizeViewport, setTheme } from './browser-geometry.mjs';
import { identitySql } from './identity-session.mjs';
import { saveClipboard, restoreClipboard } from './library-copy-helpers.mjs';
import {
  createDialog,
  revokeDialog,
  createTokensPage,
  tokenSelector,
  tokenControl,
  tokensRequest,
  displayedTokenTime,
} from './tokens-page.mjs';
import { tokensWriteFault } from './tokens-transport.mjs';

const run = promisify(execFile);

async function assertWorkingAction(page, state, operation, target) {
  await page.waitForSelector(`${revokeDialog}[data-state="${state}"]`);
  const pending = await page.evaluate((selector) => {
    const root = document.querySelector(selector);
    const button = root.querySelector('[data-testid="api-revoke-confirm"]');
    return {
      title: root
        .querySelector('[data-slot="alert-dialog-heading"]')
        .textContent.trim(),
      body: root
        .querySelector('[data-slot="alert-dialog-body"]')
        .textContent.trim(),
      fields: root.querySelectorAll(
        'input,textarea,select,[contenteditable="true"],[role="textbox"],[role="spinbutton"]',
      ).length,
      buttons: root.querySelectorAll('button').length,
      cancel: !!root.querySelector('[data-testid="api-revoke-cancel"]'),
      processing: button && {
        text: button.textContent.trim(),
        disabled: button.disabled,
        height: button.getBoundingClientRect().height,
        border: getComputedStyle(button).borderTopWidth,
      },
    };
  }, revokeDialog);
  assert.deepEqual(
    pending,
    {
      title: `正在${operation}`,
      body: `正在${operation} ${target}…`,
      fields: 0,
      buttons: 1,
      cancel: false,
      processing: {
        text: '处理中…',
        disabled: true,
        height: 48,
        border: '1px',
      },
    },
    'Every working action uses its approved short modal with one actual disabled outline control',
  );
}

async function assertSecretNotPersisted(page, config, report, width, key) {
  const listed = await tokensRequest(page, report, width);
  assert.equal(listed.status, 200);
  for (const token of listed.payload.tokens)
    assert.deepEqual(Object.keys(token).sort(), [
      'createdAt',
      'enabled',
      'expiresAt',
      'id',
      'name',
    ]);
  assert.equal(
    JSON.stringify(listed.payload).includes(key),
    false,
    'List has no key value',
  );
  const storage = await page.evaluate(() => ({
    local: { ...localStorage },
    session: { ...sessionStorage },
  }));
  assert.equal(
    JSON.stringify(storage).includes(key),
    false,
    'Full keys do not enter browser persistent storage',
  );
  const rows = await identitySql(config, 'SELECT * FROM apikey');
  assert.equal(
    JSON.stringify(rows).includes(key),
    false,
    'The actual SQLite database has no full key',
  );
  return listed.payload.tokens;
}

export async function verifyTokenClipboard(page, ui, report, width, key) {
  const saved = await saveClipboard();
  const selection = () =>
    page.evaluate(() => {
      const node = document.querySelector('[data-testid="api-secret"]');
      return {
        start: node.selectionStart,
        end: node.selectionEnd,
        direction: node.selectionDirection,
        scrollLeft: node.scrollLeft,
      };
    });
  const initialPermission = await page.evaluate(
    async () =>
      (await navigator.permissions.query({ name: 'clipboard-write' })).state,
  );
  try {
    await page.cdp('Browser.setPermission', {
      permission: { name: 'clipboard-write' },
      setting: 'granted',
      origin: new URL(await page.url()).origin,
    });
    await page.evaluate(() => {
      const native = navigator.clipboard.writeText.bind(navigator.clipboard);
      window.__tokensClipboard = { native, calls: [] };
      navigator.clipboard.writeText = async (text) => {
        try {
          await native(text);
          window.__tokensClipboard.calls.push({ success: true });
        } catch (error) {
          window.__tokensClipboard.calls.push({ success: false });
          throw error;
        }
      };
    });
    let selected, before;
    const successfulCopies = [];
    for (const theme of ['light', 'dark']) {
      await ui.dismissNotifications();
      await setTheme(page, theme);
      await page.focus(tokenControl('secret'));
      await page.waitForFunction(
        () =>
          document.activeElement ===
          document.querySelector('[data-testid="api-secret"]'),
      );
      if (theme === 'dark') {
        await page.keyboard.press('Tab');
        await page.waitForFunction(
          () => document.activeElement?.dataset.testid === 'api-copy',
        );
      }
      // Prepare each copy after theme and focus changes, then measure its own
      // starting state. Evidence masking must not edit the real input value.
      await page.evaluate(() => {
        const node = document.querySelector('[data-testid="api-secret"]');
        node.setSelectionRange(40, 50, 'backward');
        node.scrollLeft = 100;
      });
      selected = await selection();
      assert.deepEqual(
        selected,
        { start: 40, end: 50, direction: 'backward', scrollLeft: 100 },
        'Each copy starts with the exact native partial selection and horizontal scroll',
      );
      before = await ui.sourceState();
      await ui.copyEvidence(`secret-copied-${theme}`, width, async () => {
        if (theme === 'light') await page.click(tokenControl('copy'));
        else await page.keyboard.press('Enter');
      });
      successfulCopies.push({ success: true });
      assert.deepEqual(
        await page.evaluate(() => window.__tokensClipboard.calls),
        successfulCopies,
        'Each theme captures a new actual successful clipboard write',
      );
      assert.equal(
        (await run('pbpaste', [])).stdout,
        key,
        'Native clipboard contains the entire exact key on every theme',
      );
      assert.equal(
        await ui.secret(),
        key,
        'Copy success keeps the once-only key visible',
      );
      assert.deepEqual(
        await ui.sourceState(),
        before,
        'Every copy success preserves page and scroll',
      );
      assert.deepEqual(
        await selection(),
        selected,
        'Every copy and redacted screenshot preserves the exact selected range and input horizontal scroll',
      );
    }
    const successfulToastIds = await page.evaluate(() =>
      [...document.querySelectorAll('[data-slot="toast-title"]')].map(
        (node) => node.id,
      ),
    );
    await page.cdp('Browser.setPermission', {
      permission: { name: 'clipboard-write' },
      setting: 'denied',
      origin: new URL(await page.url()).origin,
    });
    await page.click(tokenControl('copy'));
    await page.waitForFunction(
      (count) => window.__tokensClipboard.calls.length === count + 1,
      successfulCopies.length,
    );
    assert.deepEqual(
      await page.evaluate(() => window.__tokensClipboard.calls),
      [...successfulCopies, { success: false }],
    );
    await page.waitForSelector('[data-testid="api-copy-error"]');
    assert.deepEqual(
      await page.evaluate(
        (selector) => ({
          title: document
            .querySelector(`${selector} [data-slot="modal-heading"]`)
            .textContent.trim(),
          copy: document
            .querySelector('[data-testid="api-copy"]')
            .getAttribute('aria-label'),
        }),
        createDialog,
      ),
      { title: '保存你的 Token', copy: '再次复制 Token' },
      'Clipboard denial retains the secret in the approved retry-copy state',
    );
    assert.equal(
      await page.evaluate(
        (previous) =>
          [...document.querySelectorAll('[data-slot="toast-title"]')].some(
            (node) =>
              node.textContent === 'Token 已复制' &&
              !previous.includes(node.id),
          ),
        successfulToastIds,
      ),
      false,
      'Clipboard denial never announces a new copy success',
    );
    assert.equal(
      await ui.secret(),
      key,
      'Clipboard denial retains the full key',
    );
    assert.deepEqual(
      await selection(),
      selected,
      'Clipboard denial preserves the existing partial selection',
    );
    await page.focus(tokenControl('secret'));
    await page.keyboard.press('ControlOrMeta+A');
    assert.equal(
      await page.evaluate(() => {
        const node = document.querySelector('[data-testid="api-secret"]');
        return (
          node.selectionStart === 0 && node.selectionEnd === node.value.length
        );
      }),
      true,
      'The whole key remains selectable for manual copy',
    );
    await page.keyboard.press('ControlOrMeta+C');
    assert.equal(
      (await run('pbpaste', [])).stdout,
      key,
      'Manual native copy keeps the exact unwrapped key',
    );
    assert.deepEqual(
      await ui.sourceState(),
      before,
      'Clipboard denial preserves page and scroll',
    );
    const manuallySelected = await selection();
    await ui.stateGeometry('secret-copy-error', width);
    assert.deepEqual(
      await selection(),
      manuallySelected,
      'Redacted failure evidence preserves manual selection',
    );
    report.clipboard.push({
      width,
      nativeSuccess: true,
      nativeDenied: true,
      manualExact: true,
      valueRetained: true,
      partialSelection: selected,
      selectionPreserved: true,
      successfulCopies: successfulCopies.length,
      successThemes: ['light', 'dark'],
    });
  } finally {
    await page.evaluate(() => {
      if (window.__tokensClipboard)
        navigator.clipboard.writeText = window.__tokensClipboard.native;
      delete window.__tokensClipboard;
    });
    await page.cdp('Browser.setPermission', {
      permission: { name: 'clipboard-write' },
      setting: initialPermission,
      origin: new URL(await page.url()).origin,
    });
    await restoreClipboard(saved);
  }
}

async function createdToken(
  page,
  ui,
  config,
  report,
  width,
  name,
  expiry,
  registerSecret,
) {
  const beforeIds = (
    await tokensRequest(page, report, width)
  ).payload.tokens.map(({ id }) => id);
  const snapshot = await ui.openCreate(name);
  const expiryEntry = expiry ? await ui.expiry(expiry) : undefined;
  if (expiry) {
    assert.equal(
      await page.evaluate(
        (selector) =>
          document
            .querySelector(`${selector} [data-slot="modal-heading"]`)
            .textContent.trim(),
        createDialog,
      ),
      '创建 Token',
      'A valid finite expiry retains its approved editing heading',
    );
    await ui.stateGeometry('expiry-form', width);
  }
  const fault = await tokensWriteFault(page, '/api/upload-tokens', 'POST');
  try {
    await page.click(tokenControl('create-submit'));
    const response = await fault.result();
    assert.equal(
      response.status,
      200,
      'The pending view follows an actual committed create',
    );
    await page.waitForSelector(`${createDialog}[data-state="creating"]`);
    assert.equal(
      await page.evaluate((selector) => {
        const root = document.querySelector(selector);
        return [...root.querySelectorAll('input,button')].every(
          (node) => node.disabled,
        );
      }, createDialog),
      true,
      'Pending create disables fields and every close/submit action',
    );
    const pending = await page.evaluate((selector) => {
      const root = document.querySelector(selector);
      const processing = root.querySelector(
        '[data-testid="api-create-submit"]',
      );
      return {
        forms: root.querySelectorAll('form').length,
        fields: root.querySelectorAll(
          'input,textarea,select,[contenteditable="true"],[role="textbox"],[role="spinbutton"]',
        ).length,
        title: root
          .querySelector('[data-slot="modal-heading"]')
          .textContent.trim(),
        body: root.querySelector('[data-slot="modal-body"]').textContent.trim(),
        footerButtons: root.querySelectorAll(
          '[data-slot="modal-footer"] button',
        ).length,
        buttons: root.querySelectorAll('button').length,
        processing: processing && {
          text: processing.textContent.trim(),
          disabled: processing.disabled,
          height: processing.getBoundingClientRect().height,
        },
        cancel: !!root.querySelector('[data-testid="api-create-cancel"]'),
      };
    }, createDialog);
    assert.deepEqual(
      pending,
      {
        forms: 0,
        fields: 0,
        title: expiry ? '正在创建限时 Token' : '正在创建',
        body: '正在生成上传 Token，请稍候。',
        footerButtons: 1,
        buttons: 1,
        processing: { text: '处理中…', disabled: true, height: 48 },
        cancel: false,
      },
      'Committed creates show only the approved short pending message and one real disabled 48px action',
    );
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    assert.equal(
      (await fault.result()).requests,
      1,
      'Pending keyboard actions do not repeat the POST',
    );
    await ui.stateGeometry(expiry ? 'creating-expiring' : 'creating', width);
    await fault.release();
  } finally {
    await fault.dispose();
  }
  const key = await ui.secret();
  registerSecret(key);
  const rows = await assertSecretNotPersisted(page, config, report, width, key);
  const added = rows.filter(({ id }) => !beforeIds.includes(id));
  assert.equal(added.length, 1, 'One explicit create produces one new ID');
  const token = added[0];
  assert.equal(token.name, name);
  assert.equal(token.enabled, true);
  if (expiry) {
    report.business.push({
      scenario: 'expiry-entry',
      width,
      id: token.id,
      timeZone: config.tokensTimeZone,
      segments: expiryEntry,
      requestedExpiresAt: expiry.toISOString(),
      persistedExpiresAt: token.expiresAt,
    });
    assert.ok(
      Math.abs(new Date(token.expiresAt).getTime() - expiry.getTime()) < 2500,
      'Site-timezone date entry is persisted as the requested UTC expiry',
    );
  } else assert.equal(token.expiresAt, null, 'The default key never expires');
  assert.equal(
    await page.evaluate(
      ({ selector, expiry }) =>
        document.querySelector(selector).textContent.includes(expiry),
      {
        selector: createDialog,
        expiry: token.expiresAt
          ? displayedTokenTime(token.expiresAt, config.tokensTimeZone)
          : '永不过期',
      },
    ),
    true,
    'The once-only modal displays expiry in the configured site timezone',
  );
  assert.equal(
    await page.evaluate(
      (selector) =>
        document
          .querySelector(`${selector} [data-slot="modal-heading"]`)
          .textContent.trim(),
      createDialog,
    ),
    '保存你的 Token',
    'The once-only modal retains a stable heading while expiry appears in its metadata',
  );
  await ui.stateGeometry(expiry ? 'secret-expiring' : 'secret', width);
  if (expiry) {
    await page.focus(tokenControl('secret-close'));
    await page.keyboard.press('Enter');
    await page.waitForSelector(`${createDialog}[data-state="close-confirm"]`);
    assert.equal(
      await page.evaluate(() =>
        document
          .querySelector(
            '[data-testid="api-close-confirm"] [data-slot="alert-dialog-heading"]',
          )
          .textContent.trim(),
      ),
      '确认关闭限时 Token？',
      'The finite credential close warning retains its approved heading',
    );
    if (name.includes('-short-'))
      await ui.stateGeometry('close-warning-expiring', width);
    await page.click(tokenControl('keep-secret'));
    assert.equal(
      await ui.secret(),
      key,
      'Returning from the finite warning keeps the exact once-only key',
    );
  }
  return { token, key, snapshot };
}

export async function verifyTokensCreates(
  page,
  config,
  report,
  registerSecret,
) {
  const ui = createTokensPage(page, config, report);
  const widths = config.width ? [config.width] : [1440, 390];
  for (const width of widths) {
    await resizeViewport(page, width);
    await setTheme(page, 'light');
    const name = `浏览器一次明文-${width}`;
    const { token, key, snapshot } = await createdToken(
      page,
      ui,
      config,
      report,
      width,
      name,
      undefined,
      registerSecret,
    );
    await verifyTokenClipboard(page, ui, report, width, key);
    await page.focus(tokenControl('secret-close'));
    await page.keyboard.press('Enter');
    await page.waitForSelector(`${createDialog}[data-state="close-confirm"]`);
    await ui.stateGeometry('close-warning', width);
    await page.click(tokenControl('close-confirm-cancel'));
    assert.equal(
      await ui.secret(),
      key,
      'The close warning X keeps the full key',
    );
    await page.focus(tokenControl('secret-close'));
    await page.keyboard.press('Enter');
    await page.waitForSelector(`${createDialog}[data-state="close-confirm"]`);
    await page.click(tokenControl('keep-secret'));
    assert.equal(
      await ui.secret(),
      key,
      'Close warning can return to the original full key',
    );
    await ui.closeSecret(snapshot);
    await ui.rowState(token.id, 'enabled');
    await ui.stateGeometry('populated', width);
    const reopen = await ui.openCreate();
    assert.equal(
      await page.evaluate(() =>
        document.querySelector('[data-testid="api-secret"]'),
      ),
      null,
      'Reopening create does not recover the previous key',
    );
    await ui.cancelCreate(reopen);
    await page.reload();
    await page.waitForSelector(tokenSelector(token.id));
    assert.equal(
      await page.evaluate(() =>
        document.querySelector('[data-testid="api-secret"]'),
      ),
      null,
      'Reload cannot recover a closed key',
    );
    await assertSecretNotPersisted(page, config, report, width, key);

    if (config.tokensPhase !== 'representative') {
      for (const [kind, milliseconds] of [
        ['short', 10 * 60_000],
        ['long', 2 * 365 * 86_400_000],
      ]) {
        const expiry = new Date(
          Math.floor((Date.now() + milliseconds) / 1000) * 1000,
        );
        const created = await createdToken(
          page,
          ui,
          config,
          report,
          width,
          `浏览器-${kind}-${width}`,
          expiry,
          registerSecret,
        );
        await ui.closeSecret(created.snapshot);
        report.business.push({
          scenario: `${kind}-expiry`,
          width,
          id: created.token.id,
          expiresAt: created.token.expiresAt,
        });
      }
      const refresh = await createdToken(
        page,
        ui,
        config,
        report,
        width,
        `刷新清除明文-${width}`,
        undefined,
        registerSecret,
      );
      await page.reload();
      await page.waitForSelector(tokenSelector(refresh.token.id));
      assert.equal(
        await page.evaluate(() =>
          document.querySelector('[data-testid="api-secret"]'),
        ),
        null,
        'Refreshing an open once-only modal discards its key',
      );
      await assertSecretNotPersisted(page, config, report, width, refresh.key);
    }
    report.business.push({
      scenario: 'once-only-key',
      width,
      id: token.id,
      status: 'passed',
    });
    const expires = await tokensRequest(page, report, width, 'POST', {
      name: `即时过期-${width}`,
      expiresIn: 5,
    });
    assert.equal(expires.status, 200);
    const expiredId = expires.payload.token.id;
    await page.reload();
    await ui.rowState(expiredId, 'enabled');
    await page.waitForSelector(
      `${tokenSelector(expiredId)}[data-state="expired"]`,
      { timeout: 10000 },
    );
    assert.equal(
      await page.evaluate(
        (selector) =>
          document.querySelector(`${selector} [data-testid="api-toggle"]`)
            .disabled,
        tokenSelector(expiredId),
      ),
      true,
      'Expiration cannot be restored through enabling',
    );
    await ui.stateGeometry('expired', width);
    const expiredSnapshot = await ui.openRevoke(expiredId);
    assert.deepEqual(
      await page.evaluate(
        (selector) => ({
          title: document
            .querySelector(`${selector} [data-slot="alert-dialog-heading"]`)
            .textContent.trim(),
          body: document
            .querySelector(`${selector} [data-slot="alert-dialog-body"]`)
            .textContent.trim(),
        }),
        revokeDialog,
      ),
      {
        title: '撤销过期 Token？',
        body: `即时过期-${width}已经过期，无法继续使用。撤销会移除这条记录。`,
      },
      'Expired revoke describes removing an unusable record',
    );
    await ui.stateGeometry('expired-revoke-confirm', width);
    await page.keyboard.press('Escape');
    await ui.returnFocus(
      `${tokenSelector(expiredId)} ${tokenControl('revoke')}`,
      expiredSnapshot,
      revokeDialog,
    );
    const current = (
      await tokensRequest(page, report, width)
    ).payload.tokens.find((token) => token.id === expiredId);
    assert.ok(
      !current || new Date(current.expiresAt).getTime() <= Date.now(),
      'Plugin cleanup may remove the actual expired row',
    );
  }
  report.checks.push(
    'Actual Cookie creates expose the full key only in the current modal; native Clipboard success/denial and manual copy preserve text/page/scroll; close/reopen/reload cannot retrieve it; lists, browser storage and SQLite never store the full value.',
  );
}

export async function verifyTokensLifecycle(page, config, report) {
  const ui = createTokensPage(page, config, report);
  for (const width of config.width ? [config.width] : [1440, 390]) {
    await resizeViewport(page, width);
    const response = await tokensRequest(page, report, width, 'POST', {
      name: `启停撤销-${width}`,
    });
    assert.equal(response.status, 200);
    const id = response.payload.token.id;
    await page.reload();
    await ui.rowState(id, 'enabled');
    for (const [enabled, state] of [
      [false, 'disabled'],
      [true, 'enabled'],
    ]) {
      const fault = await tokensWriteFault(
        page,
        `/api/upload-tokens/${id}`,
        'PATCH',
      );
      try {
        await page.click(`${tokenSelector(id)} ${tokenControl('toggle')}`);
        assert.equal((await fault.result()).status, 200);
        assert.equal(
          await page.evaluate(
            (selector) =>
              [
                ...document.querySelector(selector).querySelectorAll('button'),
              ].every((node) => node.disabled),
            tokenSelector(id),
          ),
          true,
        );
        await assertWorkingAction(
          page,
          enabled ? 'enabling' : 'disabling',
          enabled ? '启用' : '停用',
          `启停撤销-${width}`,
        );
        await page.keyboard.press('Enter');
        await page.keyboard.press('Escape');
        await page.waitForSelector(
          `${revokeDialog}[data-state="${enabled ? 'enabling' : 'disabling'}"]`,
        );
        assert.equal(
          (await fault.result()).requests,
          1,
          'Pending toggle keyboard actions cannot close or repeat the real write',
        );
        await ui.stateGeometry(enabled ? 'enabling' : 'disabling', width);
        await fault.release();
        await ui.rowState(id, state);
      } finally {
        await fault.dispose();
      }
      assert.equal(
        (await tokensRequest(page, report, width)).payload.tokens.find(
          (token) => token.id === id,
        ).enabled,
        enabled,
      );
    }
    const snapshot = await ui.openRevoke(id);
    await ui.stateGeometry('revoke-confirm', width);
    await page.keyboard.press('Escape');
    await ui.returnFocus(
      `${tokenSelector(id)} ${tokenControl('revoke')}`,
      snapshot,
      revokeDialog,
    );
    await ui.openRevoke(id);
    const fault = await tokensWriteFault(
      page,
      `/api/upload-tokens/${id}`,
      'DELETE',
    );
    try {
      await page.click(tokenControl('revoke-confirm'));
      assert.equal((await fault.result()).status, 200);
      await page.waitForSelector(`${revokeDialog}[data-state="revoking"]`);
      await assertWorkingAction(page, 'revoking', '撤销', `启停撤销-${width}`);
      await page.keyboard.press('Enter');
      await page.keyboard.press('Escape');
      await page.waitForSelector(`${revokeDialog}[data-state="revoking"]`);
      assert.equal(
        (await fault.result()).requests,
        1,
        'Pending revocation is not repeated',
      );
      await ui.stateGeometry('revoking', width);
      await fault.release();
      await page.waitForSelector(revokeDialog, { state: 'hidden' });
      await page.waitForSelector(tokenSelector(id), { state: 'hidden' });
      await page.waitForFunction(
        () =>
          document.activeElement ===
          document.querySelector('[data-testid="api-create-open"]'),
      );
    } finally {
      await fault.dispose();
    }
    assert.equal(
      (await tokensRequest(page, report, width)).payload.tokens.some(
        (token) => token.id === id,
      ),
      false,
    );
    report.business.push({
      scenario: 'reversible-enable-and-delete',
      width,
      id,
      status: 'passed',
    });
  }
  report.checks.push(
    'Enable/disable round trips update the actual target ID; real pending writes prohibit repeats; cancel returns focus; confirmed revocation removes the credential from the list.',
  );
}
