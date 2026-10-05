import assert from 'node:assert/strict';
import { resizeViewport, setTheme } from './browser-geometry.mjs';
import { createTokensPage } from './tokens-page.mjs';

export async function verifyTokensConsumers(page, config, report) {
  const ui = createTokensPage(page, config, report);
  const categories = [
    ['/settings/processing', '图片处理'],
    ['/settings/account', '账号与安全'],
    ['/settings/api', '上传 API'],
  ];
  for (const theme of ['light', 'dark']) {
    await setTheme(page, theme);
    for (const width of config.width ? [config.width] : [1440, 390]) {
      await resizeViewport(page, width);
      for (const [path, label] of categories) {
        await page.goto(`${config.origin}${path}`);
        await page.waitForSelector('[data-slot="tabs"]');
        await page.waitForFunction((path) => location.pathname === path, path);
        if (width >= 1200) {
          const state = await page.evaluate(() => {
            const tabs = [
              ...document.querySelectorAll('.settings-desktop [role="tab"]'),
            ];
            return {
              labels: tabs.map((node) => node.textContent.trim()),
              selected: tabs
                .filter((node) => node.getAttribute('aria-selected') === 'true')
                .map((node) => node.textContent.trim()),
              icons: tabs.every(
                (node) => !!node.querySelector('svg[aria-hidden="true"]'),
              ),
            };
          });
          assert.deepEqual(
            state.labels,
            categories.map(([, label]) => label),
          );
          assert.deepEqual(state.selected, [label]);
          assert.equal(state.icons, true);
        } else {
          const trigger = '.settings-mobile [data-slot="select-trigger"]';
          await page.waitForFunction(
            ({ selector, label }) =>
              document.querySelector(selector)?.textContent.includes(label),
            { selector: trigger, label },
          );
          await page.click(trigger);
          await page.waitForSelector('[role="listbox"]');
          const labels = await page.evaluate(() =>
            [...document.querySelectorAll('[role="option"]')].map((node) =>
              node.textContent.trim(),
            ),
          );
          assert.deepEqual(
            labels,
            categories.map(([, label]) => label),
          );
          await page.keyboard.press('Escape');
        }
        await ui.geometry(`consumer-${path.split('/').at(-1)}-${theme}`, width);
      }
    }
  }
  await page.goto(`${config.origin}/settings/api`);
  await page.waitForSelector('[data-testid="api-page"][data-state="ready"]');
  await resizeViewport(page, config.width ?? 1440);
  await setTheme(page, 'light');
  report.checks.push(
    'Every implemented SettingsCategories consumer (processing/account/API) has the same order, labels, icons and correct selection on desktop/mobile in both themes.',
  );
}
