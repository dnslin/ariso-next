import assert from 'node:assert/strict';
import { join } from 'node:path';

export async function verifySearchToolbarLayouts(
  page,
  { output, name, selected = false },
) {
  const results = [];
  for (const theme of ['light', 'dark']) {
    await toolbarTheme(page, theme);
    for (const width of [360, 390, 430, 640, 768, 1024, 1130, 1280, 1440]) {
      await page.cdp('Emulation.setDeviceMetricsOverride', {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: width < 768,
      });
      await page.waitForFunction((width) => innerWidth === width, width);
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      const result = await page.evaluate(() => {
        const bar = document.querySelector('[data-testid="library-toolbar"]');
        const search = bar.querySelector('[data-slot="search-field"]');
        const albumActions = bar.querySelector(
          '[role="toolbar"][aria-label="相册操作"]',
        );
        const bounds = (node) => {
          const r = node.getBoundingClientRect();
          return {
            left: r.left,
            right: r.right,
            width: r.width,
            cy: r.y + r.height / 2,
          };
        };
        return {
          width: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          bar: bounds(bar),
          search: bounds(search),
          albumActions: albumActions ? bounds(albumActions) : null,
          actions: [...bar.querySelectorAll('button')]
            .filter((node) => !search.contains(node))
            .map((node) => ({
              ...bounds(node),
              albumAction: !!albumActions?.contains(node),
            })),
        };
      });
      const label = `${name}/${theme}/${width}`;
      assert.ok(result.scrollWidth <= width, `${label}: no page overflow`);
      assert.ok(
        Math.abs(result.search.width - (width < 640 ? result.bar.width : 280)) <
          1,
        `${label}: full-width mobile search and bounded desktop search`,
      );
      assert.ok(result.actions.length > 0, `${label}: actions remain present`);
      if (result.albumActions)
        assert.ok(
          Math.abs(result.albumActions.right - result.bar.right) < 1,
          `${label}: album actions align to the toolbar right edge`,
        );
      for (const action of result.actions) {
        assert.ok(
          action.left >= result.bar.left - 1 &&
            action.right <= result.bar.right + 1,
          `${label}: action stays within toolbar`,
        );
        const inlineWidth = action.albumAction
          ? selected
            ? 1440
            : 1024
          : selected
            ? 1024
            : 768;
        if (width >= inlineWidth)
          assert.ok(
            Math.abs(action.cy - result.search.cy) < 1,
            `${label}: actions align beside search when space is available`,
          );
      }
      if ([390, 1130, 1440].includes(width))
        await page.screenshot({
          path: join(output, `${name}-${theme}-${width}.png`),
        });
      results.push({ name, theme, ...result });
    }
  }
  await toolbarTheme(page, 'light');
  await page.cdp('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  return results;
}

async function toolbarTheme(page, theme) {
  await page.cdp('Emulation.setEmulatedMedia', {
    features: [
      { name: 'prefers-color-scheme', value: theme },
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ],
  });
  // Other visual scenarios explicitly set the root theme, independent of OS mode.
  await page.evaluate((theme) => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.classList.toggle('light', theme === 'light');
    root.style.colorScheme = theme;
  }, theme);
  await page.waitForFunction(
    (theme) => document.documentElement.classList.contains(theme),
    theme,
  );
}
