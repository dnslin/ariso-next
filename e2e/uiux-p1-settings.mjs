import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { resizeViewport } from './browser-geometry.mjs';

const quality =
  '[data-field="quality"] input:not([type="hidden"]):not([type="range"])';
const leaveDialog = 'loc=role:dialog[name="放弃未保存的修改?"]';

/** Runs only against the caller's disposable, authenticated UI preview. */
export async function runUiuxP1Settings(page, origin, { output } = {}) {
  const report = {
    checks: [],
    screenshots: [],
    smtpInitiallyUnconfigured: false,
  };
  if (output) await mkdir(output, { recursive: true });
  async function screenshot(name) {
    if (!output) return;
    await page.waitForFunction(
      () =>
        document.fonts.status === 'loaded' &&
        [...document.getAnimations()]
          .filter(
            (animation) =>
              animation.effect?.getTiming().iterations !== Infinity &&
              animation.effect?.getTiming().duration !== 'auto',
          )
          .every((animation) => animation.playState !== 'running'),
    );
    const filename = `${name}.png`;
    await page.screenshot({ path: join(output, filename) });
    report.screenshots.push(filename);
  }
  async function request(path, method = 'GET', input) {
    const result = await page.evaluate(
      async ({ path, method, input }) => {
        const response = await fetch(path, {
          method,
          cache: 'no-store',
          ...(input === undefined
            ? {}
            : {
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(input),
              }),
        });
        return { status: response.status, payload: await response.json() };
      },
      { path, method, input },
    );
    assert.equal(
      result.status,
      200,
      `${method} ${path} returned ${result.status}`,
    );
    return result.payload;
  }
  async function category(label, width) {
    if (width >= 1200) await page.click(`loc=role:tab[name="${label}"]`);
    else {
      await page.click('.settings-mobile button');
      await page.click(`loc=role:option[name="${label}"]`);
    }
  }
  const processingReady = () =>
    page.waitForSelector(
      '[data-testid="processing-editor"][data-state="ready"]',
    );
  const smtpReady = () =>
    page.waitForSelector('[data-testid="smtp-page"][data-state="ready"]');
  const value = (selector) =>
    page.evaluate(
      (selector) => document.querySelector(selector).value,
      selector,
    );
  async function typeQuality(next) {
    await page.click(quality);
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type(String(next));
    assert.equal(
      await value(quality),
      String(next),
      'NumberField must preserve the text typed before blur',
    );
  }
  async function fillQuality(next) {
    await typeQuality(next);
    await page.keyboard.press('Tab');
  }
  async function continueEditing(selector, expected, evidence) {
    await page.waitForSelector(leaveDialog);
    if (evidence) await screenshot(evidence);
    await page.click('loc=role:button[name="继续编辑"]');
    await page.waitForFunction(
      () => !document.querySelector('[role="dialog"]'),
    );
    assert.equal(await value(selector), String(expected));
    assert.equal(
      await page.evaluate(
        (selector) =>
          document.activeElement === document.querySelector(selector),
        selector,
      ),
      true,
      'Continue editing must restore the edited field, including after NumberField blur',
    );
  }
  async function saved(path, key, expected) {
    await page.waitForFunction(
      async ({ path, key, expected }) => {
        const response = await fetch(path, { cache: 'no-store' });
        return response.ok && (await response.json())[key] === expected;
      },
      { path, key, expected },
    );
  }

  const mediaOriginal = await request('/api/settings/media');
  const smtpOriginal = await request('/api/settings/smtp');
  const { id, updatedAt, ...mediaInput } = mediaOriginal;
  void id;
  void updatedAt;
  report.smtpInitiallyUnconfigured = smtpOriginal === null;
  try {
    for (const width of [1440, 390]) {
      await resizeViewport(page, width);
      await page.goto(`${origin}/settings/general`);
      await page.waitForSelector('[data-testid="site-general"]');
      const history = await page.cdp('Page.getNavigationHistory');
      const previousEntry = history.entries[history.currentIndex];
      await category('图片处理', width);
      await processingReady();
      const beforeQuality = Number(await value(quality));
      const editedQuality = beforeQuality === 73 ? 74 : 73;
      // Keep NumberField focused: no blur/commit before the real history Back.
      await typeQuality(editedQuality);
      const beforeUnloadBlocked = () =>
        page.evaluate(() => {
          // Verify our listener without opening or handling a browser-owned prompt.
          const event = new Event('beforeunload', { cancelable: true });
          window.dispatchEvent(event);
          return event.defaultPrevented;
        });
      assert.equal(await beforeUnloadBlocked(), true);
      await typeQuality(beforeQuality);
      assert.equal(
        await beforeUnloadBlocked(),
        false,
        'Restoring the focused raw value removes the leave warning',
      );
      await typeQuality(editedQuality);
      await page.cdp('Page.navigateToHistoryEntry', {
        entryId: previousEntry.id,
      });
      await continueEditing(
        quality,
        editedQuality,
        `uiux-p1-settings-raw-back-${width}`,
      );
      assert.equal(new URL(await page.url()).pathname, '/settings/processing');
      // Commit the edited value, then restore the saved value in a new focus
      // session without blurring; the old committed draft must not cause a warning.
      await fillQuality(editedQuality);
      await typeQuality(beforeQuality);
      assert.equal(
        await beforeUnloadBlocked(),
        false,
        'Restoring the saved value in a new focus session must not warn',
      );
      assert.equal(
        await page.evaluate(
          (selector) =>
            document.activeElement === document.querySelector(selector),
          quality,
        ),
        true,
      );
      await fillQuality(beforeQuality);
      report.checks.push({
        name: 'F01-uncommitted-number-history-back-beforeunload',
        width,
      });
      report.checks.push({
        name: 'F01-refocused-raw-value-restored-without-blur',
        width,
      });

      await fillQuality(editedQuality);
      await category('邮件服务', width);
      await continueEditing(
        quality,
        editedQuality,
        `uiux-p1-settings-leave-${width}`,
      );
      assert.equal(new URL(await page.url()).pathname, '/settings/processing');
      await category('邮件服务', width);
      await page.waitForSelector(leaveDialog);
      await page.click('loc=role:button[name="放弃修改"]');
      await smtpReady();
      await category('图片处理', width);
      await processingReady();
      assert.equal(await value(quality), String(beforeQuality));

      await fillQuality(editedQuality);
      await page.click('[data-testid="processing-save"]');
      await saved('/api/settings/media', 'quality', editedQuality);
      await page.waitForFunction(
        () =>
          !document.querySelector('[data-testid="processing-save"]').disabled,
      );
      await category('邮件服务', width);
      await smtpReady();
      assert.equal(
        await page.evaluate(() => !!document.querySelector('[role="dialog"]')),
        false,
        'A successful save must not require a leave confirmation',
      );
      await category('图片处理', width);
      await processingReady();
      assert.equal(await value(quality), String(editedQuality));
      report.checks.push({
        name: 'F01-processing-confirm-discard-save-focus',
        width,
        beforeQuality,
        editedQuality,
      });

      await category('邮件服务', width);
      await smtpReady();
      const beforeHost = await value('#smtp-host');
      const editedHost =
        beforeHost === 'smtp.uiux-p1.example.test'
          ? 'smtp.uiux-p1-next.example.test'
          : 'smtp.uiux-p1.example.test';
      await page.fill('#smtp-host', editedHost);
      await category('基本设置', width);
      await continueEditing(
        '#smtp-host',
        editedHost,
        `uiux-p1-settings-smtp-leave-${width}`,
      );
      assert.equal(new URL(await page.url()).pathname, '/settings/email');
      await category('基本设置', width);
      await page.waitForSelector(leaveDialog);
      await page.click('loc=role:button[name="放弃修改"]');
      await page.waitForSelector('[data-testid="site-general"]');
      await category('邮件服务', width);
      await smtpReady();
      assert.equal(await value('#smtp-host'), beforeHost);

      await page.fill('#smtp-host', editedHost);
      if (!(await value('#smtp-from-name')))
        await page.fill('#smtp-from-name', 'Ariso UI 交互检查');
      if (!(await value('#smtp-from-email')))
        await page.fill('#smtp-from-email', 'sender@example.test');
      await page.click('[data-testid="smtp-save"]');
      await saved('/api/settings/smtp', 'host', editedHost);
      await page.waitForFunction(
        () =>
          document.querySelector('[data-testid="smtp-page"]')?.dataset
            .operation === 'idle',
      );
      await category('基本设置', width);
      await page.waitForSelector('[data-testid="site-general"]');
      assert.equal(
        await page.evaluate(() => !!document.querySelector('[role="dialog"]')),
        false,
      );
      await category('邮件服务', width);
      await smtpReady();
      assert.equal(await value('#smtp-host'), editedHost);
      await screenshot(`uiux-p1-settings-smtp-saved-${width}`);
      report.checks.push({
        name: 'F01-smtp-confirm-discard-save-focus',
        width,
        beforeHost,
        editedHost,
      });
    }
    return report;
  } finally {
    await request('/api/settings/media', 'PATCH', mediaInput);
    if (smtpOriginal) {
      const { hasPassword, updatedAt, ...publicSettings } = smtpOriginal;
      void hasPassword;
      void updatedAt;
      await request('/api/settings/smtp', 'PATCH', publicSettings);
    }
    // A null SMTP baseline stays configured only in this disposable runner DB.
    // No test email is sent; no password or credential-clearing operation is used.
  }
}
