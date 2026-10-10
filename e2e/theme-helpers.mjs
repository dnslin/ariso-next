import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  resizeViewport,
  readGeometry,
  assertGeometry,
} from './browser-geometry.mjs';

export const settingsTrigger = '[data-testid="theme-settings-trigger"]';
export const publicTrigger = '[data-testid="theme-public-trigger"]';
export const dialog = '[role="dialog"][aria-label="外观"]';
export const radio = (mode) => `${dialog} input[type="radio"][value="${mode}"]`;

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

export async function openTheme(
  page,
  trigger = settingsTrigger,
  keyboard = false,
) {
  await page.waitForFunction((trigger) => {
    const node = document.querySelector(trigger);
    return node && !node.disabled;
  }, trigger);
  if (keyboard) {
    await page.focus(trigger);
    await page.keyboard.press('Enter');
  } else await page.click(trigger);
  await page.waitForSelector(dialog);
  const group = await page.evaluate((dialog) => {
    const node = document.querySelector(`${dialog} [role="radiogroup"]`);
    const label =
      node.getAttribute('aria-label') ||
      document.getElementById(node.getAttribute('aria-labelledby'))
        ?.textContent;
    return {
      label: label?.trim(),
      count: node.querySelectorAll('input[type="radio"]').length,
    };
  }, dialog);
  assert.deepEqual(group, { label: '界面主题', count: 3 });
}

export async function chooseTheme(page, mode, resolved) {
  await page.click(`${dialog} [data-testid="theme-option-${mode}"] label`);
  await page.waitForFunction(
    (selector) => document.querySelector(selector)?.checked === true,
    radio(mode),
  );
  assert.equal(
    await page.evaluate(
      (dialog) =>
        document.querySelectorAll(`${dialog} input[type="radio"]:checked`)
          .length,
      dialog,
    ),
    1,
  );
  await expectTheme(page, resolved, mode);
}

export async function closeTheme(page, trigger = settingsTrigger) {
  await page.keyboard.press('Escape');
  await page.waitForSelector(dialog, { state: 'hidden' });
  await page.waitForFunction(
    (trigger) => document.activeElement === document.querySelector(trigger),
    trigger,
  );
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
