import assert from 'node:assert/strict';
import { join } from 'node:path';

export async function waitForSharingScrollStable(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const coordinates = () => [
      document.scrollingElement.scrollTop,
      document.querySelector('main').scrollTop,
    ];
    let previous = coordinates();
    let stableSince = performance.now();
    await new Promise((resolve) => {
      const read = () => {
        const current = coordinates();
        if (!current.every((value, index) => value === previous[index]))
          stableSince = performance.now();
        previous = current;
        if (performance.now() - stableSince >= 200) resolve();
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
  let step = 'resize';
  let activeTheme = initial.theme;
  try {
    await resizeViewport(page, 390, 420);
    for (const theme of ['light', 'dark']) {
      activeTheme = theme;
      await setTheme(page, theme);
      step = 'scroll-to-top';
      await page.mouse.move(195, 300);
      await page.mouse.wheel(0, -100000);
      await page.waitForFunction(() => scrollY === 0);
      await waitForSharingScrollStable(page);
      assert.equal(await page.evaluate(() => scrollY), 0);
      step = 'reach-empty-content';
      for (let attempt = 0; attempt < 6; attempt++) {
        const position = await page.evaluate(() => {
          const content = [
            ...document.querySelectorAll(
              '[data-testid="share-empty"] svg, [data-testid="share-empty"] p',
            ),
          ].map((node) => node.getBoundingClientRect());
          return {
            scroll: scrollY,
            viewportTop: 0,
            viewportBottom: innerHeight,
            top: Math.min(...content.map((rect) => rect.top)),
            bottom: Math.max(...content.map((rect) => rect.bottom)),
          };
        });
        (report.shortEmptyScrollActions ??= []).push({
          theme,
          attempt,
          ...position,
        });
        if (
          position.scroll > 0 &&
          position.top >= position.viewportTop &&
          position.bottom <= position.viewportBottom
        )
          break;
        const delta =
          (position.top + position.bottom) / 2 -
          (position.viewportTop + position.viewportBottom) / 2;
        await page.mouse.wheel(0, delta);
        await waitForSharingScrollStable(page);
      }
      await page.waitForFunction(() => {
        return (
          scrollY > 0 &&
          [
            ...document.querySelectorAll(
              '[data-testid="share-empty"] svg, [data-testid="share-empty"] p',
            ),
          ].every((node) => {
            const rect = node.getBoundingClientRect();
            return rect.top >= 0 && rect.bottom <= innerHeight;
          })
        );
      });
      await waitForSharingScrollStable(page);
      const empty = await page.evaluate(() => {
        const node = document.querySelector('[data-testid="share-empty"]');
        const icon = node.querySelector('.lucide-images');
        const text = node.querySelector('p');
        const bounds = (element) => {
          const { left, right, top, bottom, width, height } =
            element.getBoundingClientRect();
          return { left, right, top, bottom, width, height };
        };
        return {
          scroll: scrollY,
          height: node.getBoundingClientRect().height,
          viewport: { width: innerWidth, height: innerHeight },
          scroller: { top: 0, bottom: innerHeight },
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
  } catch (error) {
    report.shortEmptyFailure = await page.evaluate(
      ({ step, theme }) => {
        const bounds = (node) => {
          const { top, bottom, height } = node.getBoundingClientRect();
          return { top, bottom, height };
        };
        const scroller = document.scrollingElement;
        return {
          step,
          theme,
          viewport: { width: innerWidth, height: innerHeight },
          scroll: scrollY,
          scrollHeight: scroller.scrollHeight,
          clientHeight: scroller.clientHeight,
          scroller: { top: 0, bottom: innerHeight },
          content: [
            ...document.querySelectorAll(
              '[data-testid="share-empty"] svg, [data-testid="share-empty"] p',
            ),
          ].map(bounds),
        };
      },
      { step, theme: activeTheme },
    );
    await page.screenshot({
      path: join(config.output, 'sharing-public-empty-short-failure.png'),
    });
    throw error;
  } finally {
    await resizeViewport(page, initial.width, initial.height);
    await setTheme(page, initial.theme);
  }
}

/** The cover, title and gallery move together in the document, with no scrollbar. */
export async function verifySharingDocumentScroll(
  { page, config, report },
  layout,
) {
  const { resizeViewport, setTheme } = await import(config.geometryScript);
  const initial = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    theme: document.documentElement.classList.contains('dark')
      ? 'dark'
      : 'light',
  }));
  try {
    for (const width of [1440, 390]) {
      await resizeViewport(page, width);
      await page.mouse.move(width / 2, 300);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForFunction(() => scrollY === 0);
      await waitForSharingScrollStable(page);
      const before = await documentSharingPosition(page);
      assert.equal(
        before.layout,
        layout,
        'The public layout follows the saved share setting',
      );
      assert.equal(before.internalScrollRoot, false);
      assert.deepEqual(
        before.scrollableAncestors,
        [],
        'The cover and gallery have no independent scroll container',
      );
      assert.ok(
        before.scrollbarWidth === 'none' || before.webkitScrollbar === 'none',
        'The document hides its scrollbar',
      );
      assert.ok(before.maximum > 250, 'The real album remains scrollable');
      const distinctHeights = new Set(
        before.imageHeights.map((height) => Math.round(height)),
      );
      assert.ok(
        layout === 'grid'
          ? distinctHeights.size === 1
          : distinctHeights.size > 1,
        'Grid uses equal image slots and masonry preserves the mixed image ratios',
      );
      await page.keyboard.press('PageDown');
      await page.waitForFunction(() => scrollY > 0);
      await waitForSharingScrollStable(page);
      const after = await documentSharingPosition(page);
      const distance = after.scroll - before.scroll;
      for (const part of ['coverTop', 'titleTop', 'galleryTop'])
        assert.ok(
          Math.abs(after[part] - before[part] + distance) <= 1,
          `${part} moves with the document rather than staying fixed`,
        );
      const screenshot = `sharing-public-${layout}-document-scrolled-${width}.png`;
      await page.screenshot({ path: join(config.output, screenshot) });
      report.layouts.push({
        state: `${layout}-document-scrolled`,
        width,
        height: after.viewportHeight,
        theme: initial.theme,
        screenshot,
        geometry: { before, after },
      });
      report.checks.push({
        scenario:
          'Whole-page scrolling moves the cover, heading and saved-layout gallery together while hiding the scrollbar',
        layout,
        width,
        before,
        after,
      });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForFunction(() => scrollY === 0);
    }
  } finally {
    await resizeViewport(page, initial.width, initial.height);
    await setTheme(page, initial.theme);
  }
}
async function documentSharingPosition(page) {
  return page.evaluate(() => {
    const cover = document.querySelector('[data-share-cover]');
    const gallery = document.querySelector('[data-testid="share-items"]');
    const scrollableAncestors = [];
    for (
      let node = cover.parentElement;
      node && node !== document.documentElement;
      node = node.parentElement
    ) {
      if (
        ['auto', 'scroll'].includes(getComputedStyle(node).overflowY) &&
        node.scrollHeight > node.clientHeight + 1
      )
        scrollableAncestors.push(node.tagName);
    }
    return {
      scroll: scrollY,
      maximum: document.scrollingElement.scrollHeight - innerHeight,
      viewportHeight: innerHeight,
      layout: gallery.getAttribute('data-layout'),
      internalScrollRoot: !!document.querySelector('[data-share-scroll]'),
      scrollableAncestors,
      scrollbarWidth: getComputedStyle(document.documentElement).scrollbarWidth,
      webkitScrollbar: getComputedStyle(
        document.documentElement,
        '::-webkit-scrollbar',
      ).display,
      coverTop: cover.getBoundingClientRect().top,
      titleTop: cover.parentElement.querySelector('h1').getBoundingClientRect()
        .top,
      galleryTop: gallery.getBoundingClientRect().top,
      imageHeights: [...gallery.querySelectorAll('[data-share-item] > div')]
        .slice(0, 8)
        .map((node) => node.getBoundingClientRect().height),
    };
  });
}
