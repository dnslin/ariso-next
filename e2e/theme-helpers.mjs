import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  resizeViewport,
  readGeometry,
  assertGeometry,
} from './browser-geometry.mjs';

export const themeTriggers = '[data-testid="theme-trigger"]';
const modes = ['light', 'dark', 'system'];
const labels = { light: '亮色', dark: '暗色', system: '自动' };
const icons = { light: 'sun', dark: 'moon', system: 'monitor' };

export async function visibleThemeTrigger(page) {
  const desktop = await page.evaluate(() => innerWidth >= 1200);
  return `${desktop ? '.shell-toolbar' : '.shell-mobile-header'} ${themeTriggers}`;
}

export async function expectThemeEntries(page, admin) {
  const entries = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="theme-trigger"]')].map(
      (button) => {
        const rect = button.getBoundingClientRect();
        const style = getComputedStyle(button);
        return {
          visible:
            rect.width > 0 &&
            rect.height > 0 &&
            style.visibility !== 'hidden' &&
            !button.closest('[inert]'),
          width: rect.width,
          height: rect.height,
        };
      },
    ),
  );
  assert.equal(
    entries.length,
    admin ? 2 : 0,
    'Theme controls belong only to the responsive admin headers',
  );
  const visible = entries.filter((entry) => entry.visible);
  assert.equal(
    visible.length,
    admin ? 1 : 0,
    'Only one responsive theme control is visible',
  );
  for (const entry of visible)
    assert.ok(
      entry.width >= 44 && entry.height >= 44,
      'Header icon has a 44px click target',
    );
}

export async function expectPreference(page, mode) {
  const selector = await visibleThemeTrigger(page);
  await page.waitForFunction(
    ({ selector, mode }) =>
      document.querySelector(selector)?.dataset.theme === mode,
    { selector, mode },
  );
  const state = await page.evaluate((selector) => {
    const button = document.querySelector(selector);
    return {
      label: button.getAttribute('aria-label'),
      icon: button.querySelector('svg')?.getAttribute('class'),
      text: button.textContent.trim(),
    };
  }, selector);
  const next = modes[(modes.indexOf(mode) + 1) % modes.length];
  assert.equal(state.label, `外观：${labels[mode]}；点击切换为${labels[next]}`);
  assert.ok(state.icon?.split(' ').includes(`lucide-${icons[mode]}`));
  assert.equal(state.text, '', 'Theme control contains only its state icon');
}

export async function emulateSystem(page, system) {
  await page.cdp('Emulation.setEmulatedMedia', {
    features: [
      { name: 'prefers-color-scheme', value: system },
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ],
  });
  await page.waitForFunction(
    (system) =>
      matchMedia('(prefers-color-scheme: dark)').matches ===
      (system === 'dark'),
    system,
  );
}

export async function expectTheme(page, resolved, preference) {
  await page.waitForFunction(
    ({ resolved, preference }) =>
      document.documentElement.classList.contains(resolved) &&
      (preference === undefined ||
        localStorage.getItem('theme') === preference),
    { resolved, preference },
  );
  const state = await page.evaluate(() => ({
    light: document.documentElement.classList.contains('light'),
    dark: document.documentElement.classList.contains('dark'),
    colorScheme: document.documentElement.style.colorScheme,
  }));
  assert.equal(state.light, resolved === 'light');
  assert.equal(state.dark, resolved === 'dark');
  assert.equal(state.colorScheme, resolved);
}

export async function cycleTheme(page, keyboard = false) {
  const selector = await visibleThemeTrigger(page);
  await page.waitForFunction((selector) => {
    const node = document.querySelector(selector);
    return node && !node.disabled && node.dataset.theme;
  }, selector);
  const current = await page.evaluate(
    (selector) => document.querySelector(selector).dataset.theme,
    selector,
  );
  assert.ok(modes.includes(current));
  const next = modes[(modes.indexOf(current) + 1) % modes.length];
  if (keyboard) {
    await page.focus(selector);
    await page.keyboard.press('Enter');
  } else await page.click(selector);
  await expectPreference(page, next);
  const resolved =
    next === 'system'
      ? await page.evaluate(() =>
          matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
        )
      : next;
  await expectTheme(page, resolved, next);
  if (keyboard)
    assert.equal(
      await page.evaluate(
        (selector) =>
          document.activeElement === document.querySelector(selector),
        selector,
      ),
      true,
      'Keyboard theme change retains trigger focus',
    );
  return next;
}

export async function chooseTheme(page, mode, resolved, keyboard = false) {
  assert.ok(modes.includes(mode));
  const selector = await visibleThemeTrigger(page);
  await page.waitForFunction(
    (selector) => !!document.querySelector(selector)?.dataset.theme,
    selector,
  );
  const current = await page.evaluate(
    (selector) => document.querySelector(selector).dataset.theme,
    selector,
  );
  const clicks =
    (modes.indexOf(mode) - modes.indexOf(current) + modes.length) %
    modes.length;
  for (let index = 0; index < clicks; index++) await cycleTheme(page, keyboard);
  await expectPreference(page, mode);
  await expectTheme(page, resolved, mode);
}

export async function themeEvidence(
  page,
  config,
  report,
  name,
  width,
  resolved,
  height,
) {
  await resizeViewport(page, width, height);
  await page.waitForFunction(() => document.fonts.status === 'loaded');
  const geometry = await readGeometry(page);
  assertGeometry(geometry, `theme/${name}/${width}/${resolved}`);
  const screenshot = `theme-${name}-${resolved}-${width}${height ? `x${height}` : ''}.png`;
  await page.screenshot({ path: join(config.output, screenshot) });
  report.layouts.push({
    name,
    resolved,
    height: height ?? (width >= 1200 ? 1080 : 844),
    screenshot,
    ...geometry,
  });
}

/** Resolve actual CSS colors through Chromium, including OKLCH and alpha. */
export async function readContrast(page, selector, property = 'color') {
  return page.evaluate(
    ({ selector, property }) => {
      const node = document.querySelector(selector);
      if (!node) throw new Error(`Missing contrast target: ${selector}`);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      function rgba(color) {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        return [...context.getImageData(0, 0, 1, 1).data].map((value, index) =>
          index === 3 ? value / 255 : value,
        );
      }
      function over(top, bottom) {
        return [0, 1, 2]
          .map((index) => top[index] * top[3] + bottom[index] * (1 - top[3]))
          .concat(1);
      }
      const layers = [];
      for (let parent = node; parent; parent = parent.parentElement)
        layers.unshift(rgba(getComputedStyle(parent).backgroundColor));
      const background = layers.reduce(
        (result, layer) => over(layer, result),
        [255, 255, 255, 1],
      );
      const style = getComputedStyle(node);
      const foreground = over(
        rgba(style.getPropertyValue(property)),
        background,
      );
      const luminance = (color) =>
        color
          .slice(0, 3)
          .map((value) => {
            const channel = value / 255;
            return channel <= 0.04045
              ? channel / 12.92
              : ((channel + 0.055) / 1.055) ** 2.4;
          })
          .reduce(
            (result, value, index) =>
              result + value * [0.2126, 0.7152, 0.0722][index],
            0,
          );
      const first = luminance(foreground),
        second = luminance(background);
      return {
        selector,
        property,
        text: node.textContent.trim(),
        foreground,
        background,
        ratio:
          (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05),
      };
    },
    { selector, property },
  );
}
