import assert from 'node:assert/strict';
import { join } from 'node:path';

/** Upload state geometry and screenshots share one viewport controller. */
export function createUploadLayouts({ page, config, report }) {
  async function resize(width, height = width >= 1200 ? 1080 : 844) {
    await page.cdp('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 768,
    });
    await page.waitForFunction((width) => innerWidth === width, width);
  }
  async function layouts(name) {
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
      for (const width of [360, 390, 430, 768, 1440]) {
        await resize(width);
        if (
          [
            'ready',
            'saving',
            'processing-failed',
            'upload-failed',
            'cancelled',
          ].includes(name)
        ) {
          const summary = await page.evaluate(
            () =>
              document.querySelector(
                'section[aria-labelledby="upload-title"] > div > p',
              ).textContent,
          );
          assert.match(
            summary,
            name === 'saving'
              ? /正在核对保存与处理结果/
              : /成功 \d+ 张 · 失败 \d+ 张 · 取消 \d+ 张/,
            'Summary describes the real queue outcome',
          );
        }
        const result = await page.evaluate(() => ({
          width: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          queue: (() => {
            const card = document.querySelector('[data-testid="upload-item"]');
            const row = document.querySelector(
              '[data-testid="upload-file-row"]',
            );
            if (!card || !row) return null;
            const styles = getComputedStyle(card);
            const preview = row.firstElementChild.getBoundingClientRect();
            const action = row.querySelector('button')?.getBoundingClientRect();
            return {
              state: card.dataset.state,
              radius: Number.parseFloat(styles.borderRadius),
              padding: Number.parseFloat(styles.paddingLeft),
              preview: {
                width: preview.width,
                height: preview.height,
                bottom: preview.bottom,
              },
              action: action
                ? {
                    top: action.top,
                    bottom: action.bottom,
                    width: action.width,
                  }
                : null,
            };
          })(),
          targets: [...document.querySelectorAll('button,a')]
            .filter((node) => {
              const r = node.getBoundingClientRect();
              return r.width > 0 && r.height > 0;
            })
            .map((node) => ({
              name: node.getAttribute('aria-label') || node.textContent,
              shellNavigation: node.classList.contains('shell-nav-link'),
              width: node.getBoundingClientRect().width,
              height: node.getBoundingClientRect().height,
            })),
        }));
        assert.ok(
          result.scrollWidth <= width,
          `${name}/${theme}/${width}: no horizontal overflow`,
        );
        if (result.queue) {
          const { state, radius, padding, preview, action } = result.queue;
          assert.equal(radius, 0, 'Queue row uses the shared enclosing card');
          assert.equal(padding, 0);
          assert.equal(preview.width, width < 1280 ? 56 : 64);
          assert.equal(preview.height, width < 1280 ? 56 : 64);
          if (action && width < 768 && state !== 'queued') {
            assert.ok(
              action.top < preview.bottom &&
                action.bottom > preview.bottom - preview.height,
              'Mobile result action stays beside the file information',
            );
            assert.equal(action.width, 88);
          }
        }
        for (const target of result.targets)
          assert.ok(
            target.width >= 44 &&
              target.height >=
                (width >= 1200 && target.shellNavigation ? 40 : 44),
            `${target.name}: minimum 44px target`,
          );
        await page.screenshot({
          path: join(config.output, `upload-${name}-${theme}-${width}.png`),
        });
        report.layouts.push({ name, theme, ...result });
      }
    }
  }
  return { resize, layouts };
}
