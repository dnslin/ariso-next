import assert from 'node:assert/strict';
import { join } from 'node:path';
import { accountRequest } from './account-auth.mjs';
import {
  resizeViewport,
  setTheme,
  readGeometry,
  assertGeometry,
} from './browser-geometry.mjs';

export const oauthDialog = '[data-testid="oauth-page"]';
export const unlinkDialog = '[data-testid="github-unlink"]';

export function createOAuthPage(page, config, report) {
  const width = config.width ?? 1440;
  const scroll = () =>
    page.evaluate(() => ({
      window: scrollY,
      content: document.querySelector('.shell-content').scrollTop,
    }));
  async function screenshot(name, capturedWidth = width) {
    const file = `oauth-${config.width ?? 'all'}-${config.oauthPhase}-${name}-${capturedWidth}.png`;
    await page.screenshot({ path: join(config.output, file) });
    report.screenshots.push(file);
  }
  async function rowLayout(capturedWidth) {
    const layout = await page.evaluate(() => {
      const root = document.querySelector('[data-testid="account-page"]');
      const rect = (node) => {
        const { x, y, width, height, bottom, right } =
          node.getBoundingClientRect();
        return { x, y, width, height, bottom, right };
      };
      const github = root.querySelector('[data-testid="account-github"]');
      return {
        contentWidth: github.parentElement.getBoundingClientRect().width,
        headings: [
          ...root.querySelectorAll(
            '#owner-account-heading, #account-github-heading',
          ),
        ].map((node) => ({
          text: node.textContent.trim(),
          icon: !!node.querySelector('svg[aria-hidden="true"]'),
        })),
        rows: [
          ...root.querySelectorAll('[data-testid="account-setting-row"]'),
        ].map((node) => ({
          label: node
            .querySelector('[data-testid="account-setting-label"]')
            .textContent.trim(),
          icon: !!node
            .querySelector('[data-testid="account-setting-label"]')
            .querySelector('svg[aria-hidden="true"]'),
          labelRect: rect(
            node.querySelector('[data-testid="account-setting-label"]'),
          ),
          value: rect(
            node.querySelector('[data-testid="account-setting-value"]'),
          ),
          content: rect(
            node.querySelector('[data-testid="account-setting-content"]'),
          ),
          buttons: [...node.querySelectorAll('button')].map(rect),
        })),
      };
    });
    assert.ok(
      layout.contentWidth <= 961,
      'Account rows use the approved maximum content width',
    );
    assert.deepEqual(layout.headings, [
      { text: '所有者账号', icon: true },
      { text: 'GitHub 登录', icon: true },
    ]);
    assert.deepEqual(
      layout.rows.map(({ label, icon }) => ({ label, icon })),
      [
        { label: '登录邮箱', icon: true },
        { label: '登录密码', icon: true },
        { label: 'GitHub 账号', icon: true },
        { label: '站点登录配置', icon: true },
      ],
    );
    for (const row of layout.rows) {
      for (const button of row.buttons) {
        assert.ok(
          button.width >= 44 && button.height >= 44,
          `${row.label} action has a 44px target`,
        );
        if (capturedWidth < 640) {
          assert.ok(
            button.x >= row.content.right + 11,
            `${row.label} action is beside its content on mobile`,
          );
          assert.ok(
            Math.abs(
              button.y +
                button.height / 2 -
                (row.content.y + row.content.height / 2),
            ) < 1,
            `${row.label} action is vertically centered on mobile`,
          );
        } else
          assert.ok(
            button.x >= row.value.right,
            `${row.label} action follows its value on desktop`,
          );
      }
    }
    return layout;
  }
  async function geometry(name, capturedWidth = width) {
    const layout = await rowLayout(capturedWidth);
    report.layouts.push({
      name: `${name}-rows`,
      width: capturedWidth,
      ...layout,
    });
    const result = await readGeometry(page);
    assertGeometry(result, name);
    report.layouts.push({ name, ...result });
    await screenshot(name, capturedWidth);
  }
  async function ready() {
    await page.waitForSelector(
      '[data-testid="oauth-settings"][data-state="ready"]',
    );
    await page.waitForFunction(() =>
      ['unbound', 'bound'].includes(
        document.querySelector('[data-testid="account-github"]')?.dataset.state,
      ),
    );
  }
  async function open() {
    // Dismiss existing neutral notifications using their real keyboard action.
    // A mobile bottom toast may otherwise cover the next configuration button.
    while (
      await page.evaluate(
        () =>
          !!document.querySelector(
            '[data-slot="toast"][data-frontmost="true"]:not([data-exiting="true"])',
          ),
      )
    ) {
      const title = await page.evaluate(
        () =>
          document.querySelector(
            '[data-slot="toast"][data-frontmost="true"] [data-slot="toast-title"]',
          )?.id,
      );
      assert.ok(title, 'The prior notification has a title identifier');
      await page.focus(
        '[data-slot="toast"][data-frontmost="true"] [data-slot="toast-close"]',
      );
      await page.keyboard.press('Enter');
      await page.waitForFunction((id) => !document.getElementById(id), title);
    }
    await page.waitForFunction(
      () => !document.querySelector('[data-slot="toast"]'),
    );
    await page.focus('[data-testid="account-github-config"]');
    await page.keyboard.press('Enter');
    await page.waitForSelector(`${oauthDialog}[data-state="editing"]`);
  }
  async function close() {
    await page.waitForFunction(
      (root) => !!document.activeElement?.closest(root),
      oauthDialog,
    );
    await page.keyboard.press('Escape');
    await page.waitForSelector(oauthDialog, { state: 'detached' });
    await page.waitForFunction(
      () =>
        document.activeElement ===
        document.querySelector('[data-testid="account-github-config"]'),
    );
  }
  async function enabled(expected) {
    const read = () =>
      page.evaluate(() => {
        const control = document.querySelector('[data-testid="oauth-enabled"]');
        const input = control.matches('input')
          ? control
          : control.querySelector('input');
        return input
          ? input.checked
          : control.getAttribute('aria-checked') === 'true';
      });
    if ((await read()) !== expected)
      await page.click('[data-testid="oauth-enabled"]');
    assert.equal(
      await read(),
      expected,
      'The actual enable control matches the intended value',
    );
  }
  async function fill(clientId, secret) {
    await page.fill('#oauth-client-id', clientId);
    if (secret !== undefined) await page.fill('#oauth-client-secret', secret);
  }
  async function saved() {
    await page.waitForSelector(oauthDialog, { state: 'hidden' });
    await ready();
    await page.waitForFunction(
      () =>
        document.activeElement ===
        document.querySelector('[data-testid="account-github-config"]'),
    );
    assert.equal(new URL(await page.url()).pathname, '/settings/account');
  }
  async function layouts(name, withSettings = false) {
    const pending = await page.evaluate(
      () => !!document.querySelector('[data-testid="oauth-pending-restart"]'),
    );
    const configuration = pending
      ? await accountRequest(page, report, width, '/api/settings/github')
      : null;
    if (configuration) {
      assert.equal(configuration.status, 200);
      assert.equal(configuration.payload.pendingRestart, true);
    }
    const widths =
      config.width === 1440
        ? [1440]
        : config.width === 390
          ? [360, 390, 430, 768]
          : [1440, 360, 390, 430, 768];
    for (const theme of ['light', 'dark']) {
      await setTheme(page, theme);
      for (const capturedWidth of widths) {
        await resizeViewport(page, capturedWidth);
        await geometry(`${name}-${theme}`, capturedWidth);
        if (configuration) {
          const trigger = '[data-testid="oauth-config-difference"]';
          const path = new URL(await page.url()).pathname;
          await page.focus(trigger);
          const snapshot = await scroll();
          await page.keyboard.press('Enter');
          await page.waitForFunction(
            (selector) =>
              document
                .querySelector(selector)
                ?.getAttribute('aria-expanded') === 'true',
            trigger,
          );
          const details = await page.evaluate(() =>
            [
              ...document.querySelectorAll(
                '[data-testid="oauth-pending-restart"] [data-testid="oauth-config-snapshot"]',
              ),
            ].map((node) => ({
              lines: [...node.querySelectorAll('p')].map((line) =>
                line.textContent.trim(),
              ),
              visible:
                node.getBoundingClientRect().height > 0 &&
                getComputedStyle(node).visibility === 'visible',
            })),
          );
          assert.deepEqual(
            details,
            ['saved', 'effective'].map((key) => {
              const value = configuration.payload[key];
              return {
                lines: [
                  `${key === 'saved' ? '已保存' : '当前生效'} · ${value.enabled ? '启用' : '停用'}`,
                  `Client ID：${value.clientId || '未设置'}`,
                  `密钥${value.hasSecret ? '已设置' : '未设置'}`,
                ],
                visible: true,
              };
            }),
            'Expanded configuration compares the actual saved and effective public snapshots',
          );
          await geometry(
            `${name}-configuration-difference-${theme}`,
            capturedWidth,
          );
          await page.keyboard.press('Enter');
          await page.waitForFunction(
            (selector) =>
              document
                .querySelector(selector)
                ?.getAttribute('aria-expanded') === 'false',
            trigger,
          );
          assert.equal(
            new URL(await page.url()).pathname,
            path,
            'Configuration comparison preserves the account page',
          );
          assert.equal(
            await page.evaluate(
              (selector) =>
                document.activeElement === document.querySelector(selector),
              trigger,
            ),
            true,
            'Configuration comparison retains keyboard focus',
          );
          assert.deepEqual(
            await scroll(),
            snapshot,
            'Collapsing configuration comparison retains source scrolling',
          );
        }
        if (withSettings) {
          await open();
          await geometry(`${name}-configuration-${theme}`, capturedWidth);
          await page.focus('[data-testid="oauth-save"]');
          await page.keyboard.press('Tab');
          assert.equal(
            await page.evaluate(
              (root) => !!document.activeElement?.closest(root),
              oauthDialog,
            ),
            true,
            'OAuth configuration traps keyboard focus',
          );
          await page.keyboard.press('Shift+Tab');
          await close();
        }
      }
      if (withSettings && widths.includes(390)) {
        await resizeViewport(page, 390, 400);
        await open();
        await page.focus('[data-testid="oauth-save"]');
        await page.evaluate(() =>
          document.activeElement.scrollIntoView({ block: 'center' }),
        );
        assert.equal(
          await page.evaluate(() => {
            const rect = document.activeElement.getBoundingClientRect();
            return rect.top >= 0 && rect.bottom <= innerHeight;
          }),
          true,
          'OAuth save is reachable in a short viewport',
        );
        await geometry(`${name}-configuration-short-${theme}`, 390);
        await close();
      }
    }
    await resizeViewport(page, width);
    await setTheme(page, 'light');
  }
  return {
    ready,
    open,
    close,
    enabled,
    fill,
    saved,
    geometry,
    screenshot,
    layouts,
    scroll,
  };
}

export async function verifyCallbackCopy(
  page,
  config,
  report,
  ui,
  callbackUrl,
) {
  await ui.open();
  const snapshot = await ui.scroll();
  try {
    await page.cdp('Browser.setPermission', {
      permission: { name: 'clipboard-write' },
      setting: 'granted',
      origin: config.origin,
    });
    await page.evaluate(() => {
      const original = navigator.clipboard.writeText.bind(navigator.clipboard);
      window.__oauthClipboard = { original, resolved: false, text: null };
      navigator.clipboard.writeText = async (value) => {
        await original(value);
        window.__oauthClipboard.resolved = true;
        window.__oauthClipboard.text = value;
      };
    });
    await page.focus('loc=role:button[name="复制 GitHub 回调地址"]');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__oauthClipboard.resolved);
    assert.equal(
      await page.evaluate(() => window.__oauthClipboard.text),
      callbackUrl,
      'The resolved native Clipboard write receives the complete callback URL',
    );
    assert.deepEqual(
      await ui.scroll(),
      snapshot,
      'Copy preserves the settings modal scroll position',
    );
    await page.cdp('Browser.setPermission', {
      permission: { name: 'clipboard-write' },
      setting: 'denied',
      origin: config.origin,
    });
    await page.click('loc=role:button[name="复制 GitHub 回调地址"]');
    await page.waitForSelector('[data-testid="oauth-manual-copy"]');
    await page.waitForFunction(
      () =>
        ![...document.querySelectorAll('[data-slot="toast-title"]')].some(
          (node) => node.textContent.trim() === '回调地址已复制',
        ),
    );
    await page.click('loc=role:button[name="选择完整回调地址"]');
    assert.deepEqual(
      await page.evaluate(() => {
        const field = document.querySelector(
          '[data-testid="oauth-manual-copy"]',
        );
        return {
          value: field.value,
          readonly: field.readOnly,
          focused: document.activeElement === field,
          selected:
            field.selectionStart === 0 &&
            field.selectionEnd === field.value.length,
        };
      }),
      { value: callbackUrl, readonly: true, focused: true, selected: true },
    );
    for (const theme of ['light', 'dark']) {
      await setTheme(page, theme);
      await ui.geometry(`callback-manual-${theme}`);
    }
    report.checks.push(
      'Native callback Clipboard write resolves with the complete URL; actual denied browser permission exposes full selectable readonly text in the same modal.',
    );
  } finally {
    await page.evaluate(() => {
      if (window.__oauthClipboard)
        navigator.clipboard.writeText = window.__oauthClipboard.original;
      delete window.__oauthClipboard;
    });
    await page.cdp('Browser.setPermission', {
      permission: { name: 'clipboard-write' },
      setting: 'prompt',
      origin: config.origin,
    });
    await setTheme(page, 'light');
    await ui.close();
  }
}
