import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  resizeViewport,
  setTheme,
  readGeometry,
  assertGeometry,
} from './browser-geometry.mjs';
import { accountRequest } from './account-auth.mjs';

export const accountDialog = '[data-testid="account-dialog"]';
export const accountButton = (name) =>
  name === '取消'
    ? `loc=css:${accountDialog} form button:text-is("取消")`
    : `loc=role:button[name="${name}"]`;
const dialog = accountDialog;
const button = accountButton;

export function createAccountPage(page, config, report) {
  async function screenshot(name, width = config.width ?? 'all') {
    const filename = `account-${width}-${name}.png`;
    await page.screenshot({ path: join(config.output, filename) });
    report.screenshots.push(filename);
  }
  async function open(kind) {
    while (
      await page.evaluate(() =>
        Boolean(
          document.querySelector(
            '[data-slot="toast"][data-frontmost="true"]:not([data-exiting="true"])',
          ),
        ),
      )
    ) {
      const titleId = await page.evaluate(
        () =>
          document.querySelector(
            '[data-slot="toast"][data-frontmost="true"] [data-slot="toast-title"]',
          )?.id,
      );
      assert.ok(titleId, 'The previous frontmost notification has a title ID');
      await page.focus(
        '[data-slot="toast"][data-frontmost="true"] [data-slot="toast-close"]',
      );
      await page.keyboard.press('Enter');
      await page.waitForFunction((id) => !document.getElementById(id), titleId);
    }
    await page.waitForFunction(
      () => !document.querySelector('[data-slot="toast"]'),
    );
    const toastIds = await page.evaluate(() =>
      [...document.querySelectorAll('[data-slot="toast-title"]')].map(
        (node) => node.id,
      ),
    );
    const scroll = await page.evaluate(() => ({
      window: scrollY,
      content: document.querySelector('.shell-content').scrollTop,
    }));
    await page.focus(`[data-testid="account-change-${kind}"]`);
    await page.keyboard.press('Enter');
    await page.waitForSelector(dialog);
    await page.waitForFunction(
      (id) => document.activeElement?.id === id,
      kind === 'email' ? 'email' : 'currentPassword',
    );
    return { toastIds, scroll };
  }
  async function close(kind, snapshot) {
    await page.keyboard.press('Escape');
    await page.waitForSelector(dialog, { state: 'hidden' });
    await page.waitForFunction(
      (selector) => document.activeElement === document.querySelector(selector),
      `[data-testid="account-change-${kind}"]`,
    );
    const focusStyles = await page.evaluate(() => ({
      container: getComputedStyle(document.querySelector('[data-slot="tabs"]'))
        .outlineStyle,
      outline: getComputedStyle(document.activeElement).outlineStyle,
      shadow: getComputedStyle(document.activeElement).boxShadow,
    }));
    assert.equal(
      focusStyles.container,
      'none',
      'Settings container has no encompassing focus outline',
    );
    assert.ok(
      focusStyles.outline !== 'none' || focusStyles.shadow !== 'none',
      'The keyboard-focused account action retains its own visible focus ring',
    );
    assert.deepEqual(
      await page.evaluate(() => ({
        window: scrollY,
        content: document.querySelector('.shell-content').scrollTop,
      })),
      snapshot.scroll,
      'Closing account editing preserves source scrolling',
    );
  }
  async function fields(values) {
    for (const [id, value] of Object.entries(values))
      await page.fill(`#${id}`, value);
  }
  async function valuesRemain(values) {
    assert.equal(
      await page.evaluate(
        (values) =>
          Object.entries(values).every(
            ([id, value]) => document.querySelector(`#${id}`)?.value === value,
          ),
        values,
      ),
      true,
      'Account errors preserve entered values',
    );
  }
  async function fieldError(id) {
    await page.waitForSelector(`#${id}[aria-invalid="true"]`);
    await page.waitForFunction((id) => document.activeElement?.id === id, id);
    const associated = await page.evaluate((id) => {
      const input = document.getElementById(id);
      return [
        ...(input.getAttribute('aria-describedby') ?? '').split(' '),
        ...(input.getAttribute('aria-errormessage') ?? '').split(' '),
      ].some((id) => !!document.getElementById(id)?.textContent.trim());
    }, id);
    assert.equal(
      associated,
      true,
      'Field feedback is associated with its input',
    );
  }
  async function successful(kind, expectedEmail, snapshot, width) {
    await page.waitForSelector(dialog, { state: 'hidden' });
    await page.waitForFunction(
      (email) =>
        document.querySelector('[data-testid="account-email"]')?.textContent ===
        email,
      expectedEmail,
    );
    await page.waitForFunction(
      ({ title, previousIds }) =>
        [...document.querySelectorAll('[data-slot="toast-title"]')].some(
          (node) =>
            node.textContent === title &&
            !!node.id &&
            !previousIds.includes(node.id),
        ),
      {
        title: kind === 'email' ? '登录邮箱已更新' : '密码已更新',
        previousIds: snapshot.toastIds,
      },
    );
    assert.equal(new URL(await page.url()).pathname, '/settings/account');
    await page.waitForFunction(
      (selector) => document.activeElement === document.querySelector(selector),
      `[data-testid="account-change-${kind}"]`,
    );
    const session = await accountRequest(
      page,
      report,
      width,
      '/api/auth/get-session',
    );
    assert.equal(session.status, 200);
    assert.equal(session.payload.user.email, expectedEmail);
    assert.deepEqual(
      await page.evaluate(() => ({
        window: scrollY,
        content: document.querySelector('.shell-content').scrollTop,
      })),
      snapshot.scroll,
      'Successful update preserves source scrolling',
    );
  }
  async function verifiedEmail(expectedEmail, name, snapshot, width) {
    await page.waitForSelector(`${dialog}[data-state="verified"]`);
    await page.waitForSelector('loc=role:heading[name="已核对当前邮箱"]');
    assert.equal(
      await page.evaluate(
        ({ selector, email }) =>
          [...document.querySelector(selector).querySelectorAll('p')].some(
            (node) => node.textContent === `当前邮箱：${email}`,
          ),
        { selector: dialog, email: expectedEmail },
      ),
      true,
      'Reconciliation displays the actual current email',
    );
    assert.equal(
      await page.evaluate(
        (selector) =>
          document.querySelector(`${selector} button[type="submit"]`),
        dialog,
      ),
      null,
      'Reconciliation has no resubmit action',
    );
    await stateGeometry(name, width);
    await page.click(button('返回账号与安全'));
    await page.waitForSelector(dialog, { state: 'hidden' });
    await page.waitForFunction(
      (email) =>
        document.querySelector('[data-testid="account-email"]')?.textContent ===
        email,
      expectedEmail,
    );
    await page.waitForFunction(
      () =>
        document.activeElement ===
        document.querySelector('[data-testid="account-change-email"]'),
    );
    assert.equal(new URL(await page.url()).pathname, '/settings/account');
    assert.deepEqual(
      await page.evaluate(() => ({
        window: scrollY,
        content: document.querySelector('.shell-content').scrollTop,
      })),
      snapshot.scroll,
      'Returning from reconciliation preserves source scrolling',
    );
  }
  async function geometry(name, width) {
    const layout = await readGeometry(page);
    assertGeometry(layout, name);
    report.layouts.push({ name, businessWidth: width, ...layout });
    await screenshot(name, width);
  }
  async function stateGeometry(name, width) {
    async function busySpinnerColors(theme) {
      const spinners = await page.evaluate(
        (selector) =>
          [
            ...document.querySelectorAll(
              `${selector} button [data-slot="spinner"]`,
            ),
          ].map((spinner) => {
            const button = spinner.closest('button');
            return {
              button: button.textContent,
              disabled: button.disabled,
              color: getComputedStyle(spinner).color,
              foreground: getComputedStyle(button).color,
              background: getComputedStyle(button).backgroundColor,
            };
          }),
        dialog,
      );
      if (
        ['email-pending', 'password-pending', 'email-reconciling'].includes(
          name,
        )
      )
        assert.equal(
          spinners.length,
          1,
          `${name}-${theme} exposes its busy spinner`,
        );
      for (const spinner of spinners) {
        report.busySpinnerColors ??= [];
        report.busySpinnerColors.push({
          name,
          theme,
          width,
          ...spinner,
        });
        assert.equal(
          spinner.disabled,
          true,
          `${name}-${theme} busy button is disabled`,
        );
        assert.equal(
          spinner.color,
          spinner.foreground,
          `${name}-${theme} spinner inherits button foreground`,
        );
        assert.notEqual(
          spinner.color,
          spinner.background,
          `${name}-${theme} spinner is distinct from button background`,
        );
      }
    }
    await geometry(`${name}-light`, width);
    await busySpinnerColors('light');
    await setTheme(page, 'dark');
    await geometry(`${name}-dark`, width);
    await busySpinnerColors('dark');
    await setTheme(page, 'light');
  }

  async function pending(kind, width, fault) {
    assert.equal((await fault.result()).status, 200);
    report.requests.push({
      path: `/api/account/${kind}`,
      method: kind === 'email' ? 'PATCH' : 'POST',
      width,
      status: 200,
      heldRealResponse: true,
    });
    assert.equal(
      await page.evaluate((selector) => {
        const root = document.querySelector(selector);
        return [
          ...root.querySelectorAll(
            'form input,form button,button[aria-label="关闭账号编辑"]',
          ),
        ].every((node) => node.matches(':disabled'));
      }, dialog),
      true,
      'Pending write disables fields and every modal action',
    );
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    assert.equal((await fault.result()).requests, 1);
    await page.waitForSelector(dialog);
    await stateGeometry(`${kind}-pending`, width);
  }
  return {
    open,
    close,
    fields,
    valuesRemain,
    fieldError,
    successful,
    verifiedEmail,
    geometry,
    stateGeometry,
    screenshot,
    pending,
  };
}

export async function captureAccountLayouts(page, config, report, credentials) {
  const { open, close, fields, fieldError, geometry } = createAccountPage(
    page,
    config,
    report,
  );
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
      await geometry(`page-${theme}-${width}`, width);
      for (const kind of ['email', 'password']) {
        const snapshot = await open(kind);
        await geometry(`${kind}-${theme}-${width}`, width);
        await page.click(button('显示当前密码'));
        assert.equal(
          await page.evaluate(
            () => document.querySelector('#currentPassword').type,
          ),
          'text',
        );
        await page.click(button('隐藏当前密码'));
        assert.equal(
          await page.evaluate(
            () => document.querySelector('#currentPassword').type,
          ),
          'password',
        );
        // Tab and Shift+Tab remain in the real modal focus scope.
        await page.focus(button('取消'));
        await page.keyboard.press('Tab');
        assert.equal(
          await page.evaluate(
            (selector) => !!document.activeElement?.closest(selector),
            dialog,
          ),
          true,
        );
        await page.keyboard.press('Shift+Tab');
        await close(kind, snapshot);
      }
    }
    if (widths.includes(390)) {
      await resizeViewport(page, 390, 400);
      const snapshot = await open('password');
      await fields({
        currentPassword: credentials.password,
        newPassword: 'short',
        confirmPassword: 'other',
      });
      await page.click(button('保存密码'));
      await fieldError('newPassword');
      await page.focus(button('保存密码'));
      await page.evaluate(() =>
        document.activeElement.scrollIntoView({ block: 'center' }),
      );
      assert.equal(
        await page.evaluate(() => {
          const rect = document.activeElement.getBoundingClientRect();
          return rect.top >= 0 && rect.bottom <= innerHeight;
        }),
        true,
        'Short viewport keeps the save action reachable',
      );
      await geometry(`password-error-short-${theme}`, 390);
      await close('password', snapshot);
    }
  }
  await resizeViewport(page, config.width ?? 1440);
  await setTheme(page, 'light');
  report.checks.push(
    'Responsive/light/dark page and both modals; keyboard opening, focus trap, password visibility, Escape return focus and 390×400 error scrolling.',
  );
}
