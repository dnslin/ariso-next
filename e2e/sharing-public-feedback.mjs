import assert from 'node:assert/strict';
import { join } from 'node:path';

export async function waitForSharingScrollStable(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const coordinates = () => [
      document.scrollingElement.scrollTop,
      document.querySelector('main').scrollTop,
      document.querySelector('[data-share-scroll]')?.scrollTop ?? 0,
    ];
    let previous = coordinates();
    let stableFrames = 0;
    await new Promise((resolve) => {
      const read = () => {
        const current = coordinates();
        stableFrames = current.every(
          (value, index) => value === previous[index],
        )
          ? stableFrames + 1
          : 0;
        previous = current;
        if (stableFrames === 4) resolve();
        else requestAnimationFrame(read);
      };
      requestAnimationFrame(read);
    });
  });
}

export async function verifyShortEmpty({ page, config, report }) {
  const { resizeViewport, setTheme, readGeometry, assertGeometry } =
    await import(config.geometryScript);
  const initial = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    theme: document.documentElement.classList.contains('dark')
      ? 'dark'
      : 'light',
  }));
  try {
    await resizeViewport(page, 390, 420);
    for (const theme of ['light', 'dark']) {
      await setTheme(page, theme);
      await page.mouse.move(195, 300);
      await page.mouse.wheel(0, -100000, {
        label: 'start the short empty album at the top',
      });
      await page.waitForFunction(
        () => document.querySelector('[data-share-scroll]').scrollTop === 0,
      );
      await waitForSharingScrollStable(page);
      assert.equal(
        await page.evaluate(
          () => document.querySelector('[data-share-scroll]').scrollTop,
        ),
        0,
      );
      await page.mouse.wheel(0, 600, {
        label: 'reach the compact empty icon and text in a short viewport',
      });
      await page.waitForFunction(() => {
        const scroller = document.querySelector('[data-share-scroll]');
        const bounds = scroller.getBoundingClientRect();
        return (
          scroller.scrollTop > 0 &&
          [
            ...document.querySelectorAll(
              '[data-testid="share-empty"] svg, [data-testid="share-empty"] p',
            ),
          ].every((node) => {
            const rect = node.getBoundingClientRect();
            return (
              rect.top >= Math.max(0, bounds.top) &&
              rect.bottom <= Math.min(innerHeight, bounds.bottom)
            );
          })
        );
      });
      await waitForSharingScrollStable(page);
      const empty = await page.evaluate(() => {
        const node = document.querySelector('[data-testid="share-empty"]');
        const scroller = document.querySelector('[data-share-scroll]');
        const icon = node.querySelector('.lucide-images');
        const text = node.querySelector('p');
        const bounds = (element) => {
          const { left, right, top, bottom, width, height } =
            element.getBoundingClientRect();
          return { left, right, top, bottom, width, height };
        };
        return {
          scroll: scroller.scrollTop,
          height: node.getBoundingClientRect().height,
          viewport: { width: innerWidth, height: innerHeight },
          scroller: bounds(scroller),
          icon: bounds(icon),
          text: { ...bounds(text), content: text.textContent.trim() },
        };
      });
      assert.equal(empty.height, 220);
      assert.equal(empty.icon.width, 36);
      assert.equal(empty.icon.height, 36);
      assert.equal(empty.text.content, '暂无可展示的图片');
      for (const node of [empty.icon, empty.text]) {
        assert.ok(
          node.left >= 0 &&
            node.right <= empty.viewport.width &&
            node.top >= Math.max(0, empty.scroller.top) &&
            node.bottom <=
              Math.min(empty.viewport.height, empty.scroller.bottom),
          'Real scrolling makes the whole empty icon and text visible without shrinking the container',
        );
      }
      const geometry = await readGeometry(page);
      assertGeometry(geometry, `short empty ${theme}`);
      assert.ok(geometry.targets.length > 0, 'The public home exit is visible');
      for (const target of geometry.targets)
        assert.ok(target.width >= 44 && target.height >= 44);
      const screenshot = `sharing-public-empty-short-${theme}-390.png`;
      await page.screenshot({ path: join(config.output, screenshot) });
      report.layouts.push({
        state: 'empty-short',
        width: 390,
        height: 420,
        theme,
        screenshot,
        geometry,
        emptyGeometry: empty,
      });
      report.checks.push({
        scenario:
          'Short empty album scroll reaches the complete icon and text while preserving the 220px state',
        theme,
        emptyGeometry: empty,
      });
    }
  } finally {
    await resizeViewport(page, initial.width, initial.height);
    await setTheme(page, initial.theme);
  }
}
