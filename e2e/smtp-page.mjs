import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  readGeometry,
  assertGeometry,
  resizeViewport,
  setTheme,
} from './browser-geometry.mjs';

export const smtpControl = (name) => `[data-testid="smtp-${name}"]`;
export async function smtpField(page, name) {
  return page.evaluate((selector) => {
    const node = document.querySelector(selector);
    return node.matches('input') ? selector : `${selector} input`;
  }, smtpControl(name));
}
export async function smtpFill(page, name, value) {
  await page.fill(await smtpField(page, name), String(value));
}
export async function smtpReady(page) {
  await page.waitForSelector(`${smtpControl('page')}[data-state="ready"]`);
}
export async function smtpOpen(page, config) {
  await page.goto(`${config.origin}/settings/email`);
  await smtpReady(page);
}
export async function smtpValue(page, name) {
  return page.evaluate(
    (selector) => document.querySelector(selector).value,
    await smtpField(page, name),
  );
}
export async function smtpConfigure(page, target, credentials = {}) {
  for (const [name, value] of Object.entries({
    host: target.host,
    port: target.port,
    'from-name': 'Ariso 浏览器测试',
    'from-email': 'sender@example.test',
    ...credentials,
  }))
    await smtpFill(page, name, value);
  await page.click(smtpControl('mode'));
  await page.click(
    `loc=role:option[name="${target.mode === 'tls' ? 'TLS' : 'STARTTLS'}"]`,
  );
}
export function createSmtpPage(page, config, report) {
  async function settledLayout() {
    await page.waitForFunction(
      () =>
        document
          .getAnimations()
          .filter(
            (animation) =>
              animation.timeline instanceof DocumentTimeline &&
              animation.effect?.getTiming().iterations !== Infinity,
          )
          .every((animation) => animation.playState !== 'running'),
      undefined,
      { timeout: 5000 },
    );
  }
  async function screenshot(name) {
    const filename = `smtp-${name}.png`;
    await settledLayout();
    await page.screenshot({ path: join(config.output, filename) });
    report.screenshots.push(filename);
  }
  async function geometry(name) {
    await settledLayout();
    const layout = await readGeometry(page);
    assertGeometry(layout, name);
    report.layouts.push({ name, ...layout });
    await screenshot(name);
  }
  async function themedGeometry(name) {
    for (const theme of ['light', 'dark']) {
      await setTheme(page, theme);
      await geometry(`${name}-${theme}`);
    }
    await setTheme(page, 'light');
  }
  async function activate(name) {
    await page.focus(smtpControl(name));
    await page.keyboard.press('Enter');
  }
  async function sourceState() {
    return page.evaluate(() => ({
      url: location.href,
      scroll: scrollY,
      content: document.querySelector('.shell-content')?.scrollTop,
    }));
  }
  async function dismiss() {
    const close =
      '[data-slot="toast"][data-frontmost="true"] [data-slot="toast-close"]';
    for (let n = 0; n < 10; n++) {
      if (
        !(await page.evaluate(
          (selector) => !!document.querySelector(selector),
          close,
        ))
      )
        break;
      await page.click(close);
    }
  }
  async function returned(name, dialog) {
    await page.waitForSelector(smtpControl(dialog), { state: 'hidden' });
    await page.waitForFunction(
      (selector) => document.activeElement === document.querySelector(selector),
      smtpControl(name),
    );
  }
  return {
    screenshot,
    geometry,
    themedGeometry,
    activate,
    sourceState,
    dismiss,
    returned,
  };
}

export async function captureSmtpLayouts(
  page,
  config,
  report,
  ui,
  { tips = true, name = 'unconfigured' } = {},
) {
  for (const theme of ['light', 'dark']) {
    await setTheme(page, theme);
    for (const width of [1440, 360, 390, 430, 768]) {
      await resizeViewport(page, width);
      await ui.geometry(`${name}-page-${theme}-${width}`);
      if (!tips) continue;
      await page.focus(smtpControl('tip'));
      await page.keyboard.press('Tab');
      await page.keyboard.press('Shift+Tab');
      if (width < 640) await page.keyboard.press('Enter');
      await page.waitForSelector(smtpControl('tip-content'));
      await ui.geometry(`tip-${theme}-${width}`);
      const tipBounds = await page.evaluate((selector) => {
        const content = document.querySelector(selector);
        const surface =
          content.dataset.slot === 'popover-dialog'
            ? content.parentElement
            : content;
        return {
          width: surface.getBoundingClientRect().width,
          maximum: Math.min(320, innerWidth - 32),
        };
      }, smtpControl('tip-content'));
      assert.ok(
        tipBounds.width <= tipBounds.maximum + 0.5,
        'SMTP explanation retains its approved reading width',
      );
      await page.keyboard.press('Escape');
      await page.waitForSelector(smtpControl('tip-content'), {
        state: 'hidden',
      });
      assert.equal(
        await page.evaluate(
          (selector) =>
            document.activeElement === document.querySelector(selector),
          smtpControl('tip'),
        ),
        true,
        'Tips closes with focus on its source',
      );
      if (width >= 640) {
        await page.hover(smtpControl('tip'));
        await page.waitForSelector(smtpControl('tip-content'));
        await page.hover(smtpControl('tip-content'));
        assert.equal(
          await page.evaluate(
            (selector) =>
              !!document.querySelector(selector)?.getClientRects().length,
            smtpControl('tip-content'),
          ),
          true,
          'Pointer can enter the explanation for continuous reading',
        );
        await page.keyboard.press('Escape');
      } else {
        await ui.activate('tip');
        await page.waitForSelector(smtpControl('tip-content'));
        // Popover makes the background inert; click its visible outside area.
        const outside = await page.evaluate(() => {
          const rect = document.querySelector('h1').getBoundingClientRect();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        });
        await page.mouse.click(outside.x, outside.y, {
          label: '关闭手机 SMTP 说明',
        });
        await page.waitForSelector(smtpControl('tip-content'), {
          state: 'hidden',
        });
        await page.waitForFunction(
          (selector) =>
            document.activeElement === document.querySelector(selector),
          smtpControl('tip'),
        );
        assert.equal(
          await page.evaluate(
            (selector) =>
              document.activeElement === document.querySelector(selector),
            smtpControl('tip'),
          ),
          true,
          'Clicking the noninteractive page title dismisses mobile Tips and returns focus',
        );
        await ui.activate('tip');
        await page.waitForSelector(smtpControl('tip-content'));
        await ui.activate('tip-close');
        await page.waitForSelector(smtpControl('tip-content'), {
          state: 'hidden',
        });
        await page.waitForFunction(
          (selector) =>
            document.activeElement === document.querySelector(selector),
          smtpControl('tip'),
        );
        assert.equal(
          await page.evaluate(
            (selector) =>
              document.activeElement === document.querySelector(selector),
            smtpControl('tip'),
          ),
          true,
          'Mobile Tips close returns focus',
        );
      }
    }
    await resizeViewport(page, 390, 400);
    const lastField = await smtpField(page, 'password');
    await page.focus(await smtpField(page, 'from-email'));
    await page.keyboard.press('Tab');
    await ui.geometry(`${name}-short-${theme}`);
    const reachable = await page.evaluate((selector) => {
      const field = document.querySelector(selector);
      const rect = field.getBoundingClientRect();
      const content = document
        .querySelector('.shell-content')
        .getBoundingClientRect();
      return (
        document.activeElement === field &&
        rect.top >= content.top &&
        rect.bottom <= content.bottom &&
        rect.top >= 0 &&
        rect.bottom <= innerHeight
      );
    }, lastField);
    assert.equal(
      reachable,
      true,
      'Short viewport last field remains reachable',
    );
  }
  await resizeViewport(page, 1440);
  await setTheme(page, 'light');
  report.checks.push(
    `${name} SMTP ${tips ? 'and credential Tips' : 'form'} covers 360/390/430/768/1440, both themes, 390×400 and reduced motion${tips ? ', pointer/keyboard/mobile outside click, close and focus' : ''}.`,
  );
}
