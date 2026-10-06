import assert from 'node:assert/strict';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import {
  resizeViewport,
  setTheme,
  readGeometry,
  assertGeometry,
} from './browser-geometry.mjs';
import { accountRequest, accountSignIn } from './account-auth.mjs';
import { observeAccountLogin } from './account-transport.mjs';

export const tokenSelector = (id) =>
  `[data-testid="api-token"][data-token-id="${id}"]`;
export const createDialog = '[data-testid="api-create-dialog"]';
export const revokeDialog = '[data-testid="api-revoke-dialog"]';
export const tokenControl = (name) => `[data-testid="api-${name}"]`;
export const displayedTokenTime = (value, timeZone) =>
  new Intl.DateTimeFormat('zh-CN', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value));

export async function tokensSignIn(page, config, report, width) {
  const current = new URL(await page.url());
  if (
    current.origin === config.origin &&
    current.pathname === '/login' &&
    current.searchParams.get('returnTo') === '/settings/api'
  ) {
    await page.fill('#email', config.credentials.email);
    await page.fill('#password', config.credentials.password);
    const observer = await observeAccountLogin(page);
    try {
      for (let attempt = 1; attempt <= 3; attempt++) {
        await page.waitForFunction(
          () => !document.querySelector('button[type="submit"]').disabled,
        );
        await observer.reset();
        await page.focus('loc=role:button[name="登录"]');
        await page.keyboard.press('Enter');
        await page.waitForFunction(
          () =>
            location.pathname === '/settings/api' ||
            window.__accountFault?.observed.responses.some(
              (response) => response.status >= 400,
            ),
        );
        if (new URL(await page.url()).pathname === '/settings/api') break;
        const limited = await observer.lastFailure();
        assert.equal(
          limited.status,
          429,
          'API destination login only retries an actual rate limit',
        );
        assert.ok(
          limited.retryAfter > 0 && limited.retryAfter <= 60 && attempt < 3,
        );
        report.requests.push({
          ...limited,
          width,
          method: 'POST',
          source: 'api-return-login',
          attempt,
        });
        await delay(
          Math.max(
            0,
            limited.receivedAt + limited.retryAfter * 1000 - Date.now(),
          ),
        );
      }
      await page.waitForURL(`${config.origin}/settings/api`);
    } finally {
      await observer.dispose();
    }
    await page.waitForSelector('[data-testid="api-page"][data-state="ready"]');
    return;
  }
  await accountSignIn(page, config, report, config.credentials, width);
  await page.goto(`${config.origin}/settings/api`);
  await page.waitForSelector('[data-testid="api-page"][data-state="ready"]');
}

export async function tokensRequest(
  page,
  report,
  width,
  method = 'GET',
  body,
  id,
) {
  return accountRequest(
    page,
    report,
    width,
    `/api/upload-tokens${id ? `/${id}` : ''}`,
    method,
    body,
  );
}

export function createTokensPage(page, config, report) {
  async function screenshot(
    name,
    width = config.width ?? 'all',
    { copyToast = false, expectedSecret } = {},
  ) {
    const filename = `tokens-${width}-${name}.png`;
    // Keep secret screenshots useful without putting a credential in evidence.
    const secret = await page.evaluate(() => {
      const node = document.querySelector('[data-testid="api-secret"]');
      if (!node) return null;
      const state = {
        value: node.value,
        start: node.selectionStart,
        end: node.selectionEnd,
        direction: node.selectionDirection,
        scrollLeft: node.scrollLeft,
      };
      node.value = state.value.replace(/./g, '•');
      node.setSelectionRange(state.start, state.end, state.direction);
      node.scrollLeft = state.scrollLeft;
      return state;
    });
    try {
      if (expectedSecret)
        assert.deepEqual(
          secret,
          expectedSecret,
          'Real copy preserves the key, exact selected range and input horizontal scroll before evidence masking',
        );
      const toast = copyToast ? await copyToastReady() : undefined;
      await page.screenshot({ path: join(config.output, filename) });
      report.screenshots.push(filename);
      return toast;
    } finally {
      if (secret !== null)
        await page.evaluate((state) => {
          const node = document.querySelector('[data-testid="api-secret"]');
          if (node) {
            node.value = state.value;
            node.setSelectionRange(state.start, state.end, state.direction);
            node.scrollLeft = state.scrollLeft;
          }
        }, secret);
    }
  }
  async function copyToastReady() {
    await page.waitForFunction(async () => {
      const read = () => {
        const root = document.querySelector(
          '[data-slot="toast"][data-frontmost="true"]',
        );
        if (
          !root ||
          root.dataset.entering === 'true' ||
          root.dataset.exiting === 'true' ||
          root
            .getAnimations({ subtree: true })
            .some((animation) => animation.playState === 'running')
        )
          return null;
        const nodes = [
          root,
          root.querySelector('[data-slot="toast-content"]'),
          root.querySelector('[data-slot="toast-title"]'),
          root.querySelector('[data-slot="toast-close"]'),
        ];
        if (nodes[2]?.textContent !== 'Token 已复制') return null;
        const rects = nodes.map((node) =>
          node?.getBoundingClientRect().toJSON(),
        );
        return rects.every(
          (rect, index) =>
            rect &&
            rect.width > 0 &&
            rect.height > 0 &&
            rect.left >= 0 &&
            rect.top >= 0 &&
            rect.right <= innerWidth &&
            rect.bottom <= innerHeight &&
            getComputedStyle(nodes[index]).visibility === 'visible' &&
            getComputedStyle(nodes[index]).opacity === '1',
        )
          ? rects
          : null;
      };
      const before = read();
      if (!before) return false;
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const after = read();
      return !!after && JSON.stringify(before) === JSON.stringify(after);
    });
    return page.evaluate(() => {
      const root = document.querySelector(
        '[data-slot="toast"][data-frontmost="true"]',
      );
      return Object.fromEntries(
        Object.entries({
          surface: root,
          content: root.querySelector('[data-slot="toast-content"]'),
          title: root.querySelector('[data-slot="toast-title"]'),
          close: root.querySelector('[data-slot="toast-close"]'),
        }).map(([name, node]) => [name, node.getBoundingClientRect().toJSON()]),
      );
    });
  }
  async function geometry(name, width) {
    const layout = await readGeometry(page);
    assertGeometry(layout, name);
    report.layouts.push({
      name,
      businessWidth: width,
      ...layout,
    });
    await screenshot(name, width);
  }
  async function copyEvidence(name, width, copy) {
    const expectedSecret = await page.evaluate(() => {
      const node = document.querySelector('[data-testid="api-secret"]');
      return {
        value: node.value,
        start: node.selectionStart,
        end: node.selectionEnd,
        direction: node.selectionDirection,
        scrollLeft: node.scrollLeft,
      };
    });
    await copy();
    // The notification has a real four-second lifetime. Capture it directly
    // after masking/stability, before collecting the slower behavior evidence.
    const copyToast = await screenshot(name, width, {
      copyToast: true,
      expectedSecret,
    });
    const layout = await readGeometry(page);
    assertGeometry(layout, name);
    assertGeometry(
      {
        ...layout,
        targets: [
          {
            name: '复制成功通知关闭',
            width: copyToast.close.width,
            height: copyToast.close.height,
            navigation: false,
          },
        ],
      },
      name,
    );
    report.layouts.push({ name, businessWidth: width, ...layout, copyToast });
  }
  async function stateGeometry(name, width) {
    for (const theme of ['light', 'dark']) {
      await setTheme(page, theme);
      await geometry(`${name}-${theme}`, width);
    }
    await setTheme(page, 'light');
  }
  async function sourceState() {
    return page.evaluate(() => ({
      url: location.href,
      window: scrollY,
      content: document.querySelector('.shell-content').scrollTop,
    }));
  }
  async function dismissNotifications() {
    for (let index = 0; index < 20; index++) {
      const titleId = await page.evaluate(
        () =>
          document.querySelector(
            '[data-slot="toast"][data-frontmost="true"] [data-slot="toast-title"]',
          )?.id,
      );
      if (!titleId) break;
      await page.focus(
        '[data-slot="toast"][data-frontmost="true"] [data-slot="toast-close"]',
      );
      await page.keyboard.press('Enter');
      await page.waitForFunction((id) => !document.getElementById(id), titleId);
    }
    await page.waitForFunction(
      () => !document.querySelector('[data-slot="toast"]'),
    );
  }
  async function openCreate(name) {
    await dismissNotifications();
    await page.focus(tokenControl('create-open'));
    const snapshot = await sourceState();
    await page.keyboard.press('Enter');
    await page.waitForSelector(createDialog);
    await page.waitForFunction(() => document.activeElement?.id === 'api-name');
    if (name !== undefined) await page.fill('#api-name', name);
    return snapshot;
  }
  async function returnFocus(selector, snapshot, dialog = createDialog) {
    await page.waitForSelector(dialog, { state: 'hidden' });
    await page.waitForFunction(
      (selector) => document.activeElement === document.querySelector(selector),
      selector,
    );
    assert.deepEqual(
      await sourceState(),
      snapshot,
      'The source page and scroll remain unchanged',
    );
    const styles = await page.evaluate(() => ({
      container: getComputedStyle(document.querySelector('[data-slot="tabs"]'))
        .outlineStyle,
      outline: getComputedStyle(document.activeElement).outlineStyle,
      shadow: getComputedStyle(document.activeElement).boxShadow,
    }));
    assert.equal(
      styles.container,
      'none',
      'Settings have no encompassing focus outline',
    );
    assert.ok(
      styles.outline !== 'none' || styles.shadow !== 'none',
      'The source action has its own visible keyboard focus',
    );
  }
  async function cancelCreate(snapshot) {
    await page.keyboard.press('Escape');
    await returnFocus(tokenControl('create-open'), snapshot);
  }
  async function expiry(instant) {
    await page.click(tokenControl('set-expiry'));
    await page.waitForSelector(tokenControl('expiry-input'));
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: config.tokensTimeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      })
        .formatToParts(instant)
        .map(({ type, value }) => [type, value]),
    );
    for (const type of ['year', 'month', 'day', 'hour', 'minute', 'second']) {
      const selector = `${tokenControl('expiry-input')} [data-segment-type="${type}"]`;
      await page.focus(selector);
      await page.keyboard.type(parts[type]);
    }
    await page.keyboard.press('Tab');
    const entered = await page.evaluate(() =>
      Object.fromEntries(
        [
          ...document.querySelectorAll(
            '[data-testid="api-expiry-input"] [data-segment-type]',
          ),
        ].map((node) => [node.dataset.segmentType, node.textContent]),
      ),
    );
    for (const type of ['year', 'month', 'day', 'hour', 'minute', 'second'])
      assert.equal(
        Number(entered[type]),
        Number(parts[type]),
        `Expiry ${type} is entered in the site timezone`,
      );
    return entered;
  }
  async function secret() {
    await page.waitForSelector(`${createDialog}[data-state="secret"]`);
    const key = await page.evaluate(
      () => document.querySelector('[data-testid="api-secret"]').value,
    );
    assert.ok(
      key.length > 32,
      'The real create response exposes a complete key',
    );
    return key;
  }
  async function closeSecret(snapshot) {
    await page.focus(tokenControl('secret-close'));
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-testid="api-close-confirm"]');
    await page.focus(tokenControl('confirm-close'));
    await page.keyboard.press('Enter');
    await returnFocus(tokenControl('create-open'), snapshot);
    assert.equal(
      await page.evaluate(() =>
        document.querySelector('[data-testid="api-secret"]'),
      ),
      null,
    );
  }
  async function openRevoke(id) {
    await dismissNotifications();
    await page.focus(`${tokenSelector(id)} ${tokenControl('revoke')}`);
    const snapshot = await sourceState();
    await page.keyboard.press('Enter');
    await page.waitForSelector(revokeDialog);
    return snapshot;
  }
  async function rowState(id, state) {
    await page.waitForSelector(`${tokenSelector(id)}[data-state="${state}"]`);
  }
  return {
    screenshot,
    geometry,
    stateGeometry,
    copyEvidence,
    sourceState,
    openCreate,
    returnFocus,
    cancelCreate,
    expiry,
    secret,
    closeSecret,
    openRevoke,
    rowState,
    dismissNotifications,
  };
}

export async function captureTokensLayouts(page, config, report) {
  const ui = createTokensPage(page, config, report);
  const widths =
    config.width === 1440
      ? [1440]
      : config.width === 390
        ? [360, 390, 430, 768]
        : [1440, 360, 390, 430, 768];
  for (const theme of ['light', 'dark']) {
    await setTheme(page, theme);
    for (const width of widths) {
      await resizeViewport(page, width);
      await ui.geometry(`page-${theme}-${width}`, width);
      const pageState = await ui.sourceState();
      await page.focus('loc=role:button[name="时间与记录说明"]');
      if (width < 640) await page.keyboard.press('Enter');
      await page.waitForFunction(
        (timeZone) =>
          document.body.textContent.includes(
            `时间按站点时区 ${timeZone} 显示。`,
          ),
        config.tokensTimeZone,
      );
      await ui.geometry(`time-info-${theme}-${width}`, width);
      await page.keyboard.press('Escape');
      await page.focus('loc=role:button[name="上传用法（尚未开放）"]');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() =>
        document.body.textContent.includes('上传用法尚未开放'),
      );
      await ui.geometry(`usage-info-${theme}-${width}`, width);
      await page.keyboard.press('Escape');
      assert.equal(
        await page.evaluate(() =>
          document.activeElement?.getAttribute('aria-label'),
        ),
        '上传用法（尚未开放）',
        'Closing usage help returns focus to its visible icon',
      );
      assert.deepEqual(
        await ui.sourceState(),
        pageState,
        'Help retains the source page and scroll',
      );
      const snapshot = await ui.openCreate();
      await ui.geometry(`create-${theme}-${width}`, width);
      await page.focus(`${tokenControl('no-expiry')} input[type="radio"]`);
      await page.keyboard.press('ArrowRight');
      await page.waitForSelector(tokenControl('expiry-input'));
      await page.keyboard.press('ArrowLeft');
      await page.waitForSelector(tokenControl('expiry-input'), {
        state: 'hidden',
      });
      assert.equal(
        await page.evaluate(
          () =>
            document.querySelector(
              '[data-testid="api-no-expiry"] input[type="radio"]',
            ).checked,
        ),
        true,
        'Mutually exclusive expiry options support keyboard switching back to never',
      );
      await page.focus(tokenControl('create-submit'));
      await page.keyboard.press('Tab');
      assert.equal(
        await page.evaluate(
          (selector) => !!document.activeElement?.closest(selector),
          createDialog,
        ),
        true,
        'Create focus remains in the modal',
      );
      await page.keyboard.press('Shift+Tab');
      await page.click(tokenControl('create-submit'));
      await page.waitForSelector('#api-name[aria-invalid="true"]');
      await page.waitForFunction(
        () => document.activeElement?.id === 'api-name',
      );
      await ui.geometry(`name-error-${theme}-${width}`, width);
      await ui.cancelCreate(snapshot);
    }
    if (widths.includes(390)) {
      await resizeViewport(page, 390, 400);
      const snapshot = await ui.openCreate('手机短视口有效期');
      await ui.expiry(new Date(Date.now() - 60_000));
      await page.click(tokenControl('create-submit'));
      await page.waitForFunction(
        () =>
          document.querySelector(
            '[data-testid="api-create-dialog"] [role="alert"], [data-testid="api-create-dialog"] [data-slot="field-error"]',
          )?.textContent?.length > 0,
      );
      await page.waitForFunction(() =>
        document.activeElement?.matches(
          '[data-testid="api-expiry-input"] [data-segment-type="year"]',
        ),
      );
      await page.focus(tokenControl('create-submit'));
      await page.evaluate(() =>
        document.activeElement.scrollIntoView({ block: 'center' }),
      );
      assert.equal(
        await page.evaluate(() => {
          const rect = document.activeElement.getBoundingClientRect();
          return rect.top >= 0 && rect.bottom <= innerHeight;
        }),
        true,
        'Short viewport keeps the submit action reachable',
      );
      await ui.geometry(`expiry-error-short-${theme}`, 390);
      await ui.cancelCreate(snapshot);
    }
  }
  await resizeViewport(page, config.width ?? 1440);
  await setTheme(page, 'light');
  report.checks.push(
    'Token page/create/error states cover responsive widths, both themes, keyboard focus trapping and return, past-expiry validation and a 390×400 viewport.',
  );
}
