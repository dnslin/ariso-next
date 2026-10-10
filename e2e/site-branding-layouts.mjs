import assert from 'node:assert/strict';
import { control } from './site-branding-helpers.mjs';
import { resizeViewport } from './browser-geometry.mjs';

export async function verifyBrandingLayouts(page, tools, report) {
  await tools.open();
  for (const width of [360, 390, 430, 768, 1440, 1920])
    for (const theme of ['light', 'dark'])
      await tools.evidence('ready', width, theme);
  await tools.choose('logo');
  for (const width of [390, 1440])
    await tools.evidence('selected', width, 'light');
  await resizeViewport(page, 390, 420);
  await page.focus('.shell-footer button:first-child');
  assert.equal(
    await page.evaluate(() => document.activeElement.textContent.trim()),
    '取消',
  );
  await page.keyboard.press('Tab');
  await page.waitForFunction(() => {
    const node = document.querySelector('[data-testid="branding-logo-save"]');
    const rect = node.getBoundingClientRect();
    return (
      document.activeElement === node &&
      rect.top >= 0 &&
      rect.bottom <= innerHeight
    );
  });
  const focus = await page.evaluate(() => {
    const node = document.querySelector('[data-testid="branding-logo-save"]');
    const style = getComputedStyle(node);
    return {
      visible:
        node.matches(':focus-visible') || node.dataset.focusVisible === 'true',
      outline:
        style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2,
      ring:
        style.boxShadow !== 'none' &&
        style.getPropertyValue('--tw-ring-shadow').includes('2px'),
    };
  });
  assert.equal(
    focus.visible && (focus.outline || focus.ring),
    true,
    `Keyboard focus has a visible indicator: ${JSON.stringify(focus)}`,
  );
  await tools.evidence('short-selected-focus', 390, 'dark', 420);
  await page.keyboard.press('Shift+Tab');
  assert.equal(
    await page.evaluate(
      () =>
        document.activeElement.matches('.shell-footer button') &&
        document.activeElement.textContent.trim() === '取消',
    ),
    true,
    'Reverse Tab from the final save button reaches the adjacent cancel action',
  );
  await page.click(control('logo', 'cancel'));
  report.checks.push(
    'Both themes at 360/390/430/768/1440/1920, selected desktop/mobile, short viewport and keyboard targets are measured on the production page.',
  );
}
