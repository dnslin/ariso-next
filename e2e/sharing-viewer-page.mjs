import assert from 'node:assert/strict';
import { join } from 'node:path';
import { resizeViewport, setTheme } from './browser-geometry.mjs';
import { assertCropped, waitForPaint } from './sharing-public-page.mjs';

export const viewer = '[data-testid="share-viewer"]';
export const stage = '[data-testid="share-viewer-stage"]';

export function createSharingViewerPage({ page, config, report, session }) {
  const record = (scenario, detail = {}) =>
    report.checks.push({ scenario, ...detail });
  async function current(imageId) {
    await page.waitForFunction(
      (id) =>
        document
          .querySelector('[data-testid="share-viewer"]')
          ?.getAttribute('data-image-id') === id,
      imageId,
    );
  }
  async function open(imageId = config.publicIds[6]) {
    await page.click(`[data-share-open="${imageId}"]`);
    await current(imageId);
  }
  async function close() {
    await page.click('[data-testid="share-viewer-close"]');
    await page.waitForSelector(viewer, { state: 'hidden' });
  }
  async function imageLoaded() {
    await page.waitForFunction(() =>
      [
        ...document.querySelectorAll(
          '[data-testid="share-viewer-stage"] .yarl__slide_current img',
        ),
      ].some((image) => image.complete && image.naturalWidth > 0),
    );
  }
  async function capture(
    state,
    widths = [360, 390, 430, 768, 1440],
    themes = ['light', 'dark'],
    height,
  ) {
    for (const width of widths)
      for (const theme of themes) {
        await resizeViewport(
          page,
          width,
          height ?? (width >= 1200 ? 1080 : 844),
        );
        await setTheme(page, theme);
        await waitForPaint(page);
        const geometry = await page.evaluate(() => {
          const root = document.querySelector('[data-testid="share-viewer"]');
          const rectangle = root.getBoundingClientRect();
          const stage = document
            .querySelector('[data-testid="share-viewer-stage"]')
            ?.getBoundingClientRect();
          return {
            viewport: { width: innerWidth, height: innerHeight },
            root: {
              left: rectangle.left,
              right: rectangle.right,
              top: rectangle.top,
              bottom: rectangle.bottom,
            },
            stage: stage && { width: stage.width, height: stage.height },
            targets: [...root.querySelectorAll('button')]
              .filter((node) => node.getClientRects().length)
              .map((node) => {
                const rectangle = node.getBoundingClientRect();
                return {
                  label: node.getAttribute('aria-label') || node.textContent,
                  width: rectangle.width,
                  height: rectangle.height,
                  left: rectangle.left,
                  right: rectangle.right,
                  top: rectangle.top,
                  bottom: rectangle.bottom,
                };
              }),
          };
        });
        assert.ok(geometry.root.left >= -1 && geometry.root.right <= width + 1);
        assert.ok(
          geometry.root.top >= -1 &&
            geometry.root.bottom <= geometry.viewport.height + 1,
        );
        for (const target of geometry.targets) {
          assert.ok(
            target.width >= 44 && target.height >= 44,
            `${target.label} has a 44px click target`,
          );
          assert.ok(
            target.left >= -1 &&
              target.right <= width + 1 &&
              target.top >= -1 &&
              target.bottom <= geometry.viewport.height + 1,
            `${target.label} fits viewport`,
          );
        }
        const screenshot = `sharing-viewer-${state}-${theme}-${width}${height ? `x${height}` : ''}.png`;
        await page.screenshot({ path: join(config.output, screenshot) });
        report.layouts.push({
          state,
          width,
          height: geometry.viewport.height,
          theme,
          screenshot,
          geometry,
        });
      }
  }
  async function neighbors(imageId, cookie) {
    const response = await page.fetch(
      `${session.publicPath}/items?imageId=${imageId}`,
      { headers: cookie ? { cookie } : {} },
    );
    assert.equal(response.status, 200);
    const body = JSON.parse(response.body);
    assertCropped(body);
    return body;
  }
  return { record, current, open, close, imageLoaded, capture, neighbors };
}
