import assert from 'node:assert/strict';
import { join } from 'node:path';

export async function checkShortcutLayouts(page, output, name, selector) {
  const results = [];
  for (const theme of ['light', 'dark']) {
    await page.cdp('Emulation.setEmulatedMedia', {
      features: [
        { name: 'prefers-color-scheme', value: theme },
        { name: 'prefers-reduced-motion', value: 'reduce' },
      ],
    });
    await page.waitForFunction(
      (theme) => document.documentElement.classList.contains(theme),
      theme,
    );
    for (const width of [320, 360, 390, 430, 768, 1440]) {
      for (const height of width === 1440
        ? [900, 480]
        : width === 390
          ? [844, 480]
          : [844]) {
        await page.cdp('Emulation.setDeviceMetricsOverride', {
          width,
          height,
          deviceScaleFactor: 1,
          mobile: width < 768,
        });
        await page.waitForFunction(
          ({ width, height }) => innerWidth === width && innerHeight === height,
          { width, height },
        );
        await page.waitForFunction(
          () => !document.querySelector('[data-entering],[data-exiting]'),
        );
        await page.waitForFunction((selector) => {
          const modal = document.querySelector(selector);
          const maxHeight = Number.parseFloat(
            getComputedStyle(modal).maxHeight,
          );
          return Math.abs(maxHeight - (visualViewport.height - 32)) < 1;
        }, selector);
        const result = await page.evaluate((selector) => {
          const modal = document.querySelector(selector);
          const r = modal.getBoundingClientRect();
          const footer = modal.querySelector('[data-slot$="-footer"]');
          const f = footer?.getBoundingClientRect();
          const add = modal.querySelector('[data-testid="album-image-add"]');
          const a = add?.getBoundingClientRect();
          const count = modal.querySelector(
            '[data-testid="album-image-selected-toggle"], [data-testid="album-image-selected"]',
          );
          const feedback = modal.querySelector(
            '[data-testid="album-image-submit-error"]',
          );
          const error = feedback?.getBoundingClientRect();
          return {
            width: innerWidth,
            height: innerHeight,
            scrollWidth: document.documentElement.scrollWidth,
            modal: {
              left: r.left,
              right: r.right,
              top: r.top,
              bottom: r.bottom,
            },
            footer: f ? { top: f.top, bottom: f.bottom } : null,
            add: a ? { top: a.top, bottom: a.bottom } : null,
            feedback: error
              ? { top: error.top, bottom: error.bottom, height: error.height }
              : null,
            selectedCountLeft:
              count?.dataset.testid === 'album-image-selected'
                ? count.getBoundingClientRect().left
                : null,
            small: [...modal.querySelectorAll('button')]
              .filter((n) => {
                const a = n.getBoundingClientRect();
                return (
                  a.width > 0 &&
                  a.height > 0 &&
                  (a.width < 43.5 || a.height < 43.5)
                );
              })
              .map((n) => n.getAttribute('aria-label') || n.textContent),
            clipped: [...modal.querySelectorAll('button')]
              .filter((n) => n.scrollWidth > n.clientWidth + 2)
              .map((n) => n.textContent),
          };
        }, selector);
        assert.ok(
          result.scrollWidth <= width,
          `${name}/${theme}/${width}/${height}: page overflow`,
        );
        assert.ok(
          result.modal.left >= 0 &&
            result.modal.right <= width + 1 &&
            result.modal.top >= 0 &&
            result.modal.bottom <= height + 1,
          `${name}/${theme}/${width}/${height}: dialog within viewport ${JSON.stringify(result.modal)}`,
        );
        assert.ok(
          result.footer &&
            result.footer.bottom <= height + 1 &&
            result.footer.top >= 0,
          `${name}/${theme}/${width}/${height}: footer reachable`,
        );
        if (name.startsWith('album-image-picker'))
          assert.ok(
            result.add &&
              result.add.top >= result.footer.top &&
              result.add.bottom <= result.footer.bottom + 1,
            `${name}/${theme}/${width}/${height}: submit action remains visible`,
          );
        if (result.feedback)
          assert.ok(
            result.feedback.height > 0 &&
              result.feedback.top >= result.modal.top &&
              result.feedback.bottom <= result.footer.top + 1,
            `${name}/${theme}/${width}/${height}: submit feedback remains visible above the footer`,
          );
        assert.deepEqual(
          result.small,
          [],
          `${name}/${theme}/${width}/${height}: touch targets`,
        );
        assert.deepEqual(
          result.clipped,
          [],
          `${name}/${theme}/${width}/${height}: button text fits`,
        );
        if (result.selectedCountLeft !== null && width >= 360)
          assert.ok(
            result.selectedCountLeft >= result.modal.left &&
              result.selectedCountLeft <= result.modal.left + 24,
            `${name}/${theme}/${width}/${height}: selection count stays at footer left`,
          );
        if ([390, 1440].includes(width)) {
          await page.mouse.move(0, 0);
          await page.screenshot({
            path: join(output, `${name}-${theme}-${width}-${height}.png`),
          });
        }
        results.push({ theme, ...result });
      }
    }
  }
  await page.cdp('Emulation.setEmulatedMedia', {
    features: [
      { name: 'prefers-color-scheme', value: 'light' },
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ],
  });
  await page.cdp('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  return results;
}
