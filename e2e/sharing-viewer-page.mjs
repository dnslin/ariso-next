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
        await assertSharingViewerCanvas(page);
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

/** Normal viewing is a viewport canvas; recovery can expose real actions. */
export async function assertSharingViewerCanvas(page) {
  const canvas = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="share-viewer"]');
    const rect = root.getBoundingClientRect();
    const style = getComputedStyle(root);
    const stage = root.querySelector('[data-testid="share-viewer-stage"]');
    const stageRect = stage?.getBoundingClientRect();
    const recovery = !!root.querySelector('[data-testid="share-viewer-error"]');
    return {
      role: root.getAttribute('role'),
      modal: root.getAttribute('aria-modal'),
      position: style.position,
      background: style.backgroundColor,
      viewport: { width: innerWidth, height: innerHeight },
      root: {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      },
      stage: stageRect && {
        left: stageRect.left,
        right: stageRect.right,
        top: stageRect.top,
        bottom: stageRect.bottom,
      },
      recovery,
      ordinaryImage:
        !!stage?.querySelector('.yarl__slide_current img') &&
        !root.querySelector('[role="status"]'),
      text: root.textContent.trim(),
      obsoleteControls: root.querySelectorAll(
        '[data-testid="share-viewer-fullscreen"], [data-testid="share-viewer-zoom"]',
      ).length,
      headings: recovery
        ? 0
        : root.querySelectorAll('h1,h2,header,footer').length,
      actions: [
        ...root.querySelectorAll('button[data-testid^="share-viewer-"]'),
      ]
        .filter((node) =>
          [
            'share-viewer-close',
            'share-viewer-previous',
            'share-viewer-next',
          ].includes(node.getAttribute('data-testid')),
        )
        .map((node) => ({
          id: node.getAttribute('data-testid'),
          label: node.getAttribute('aria-label'),
          text: node.textContent.trim(),
          icon: !!node.querySelector('svg'),
          background: getComputedStyle(node).backgroundColor,
          border: getComputedStyle(node).borderWidth,
        })),
    };
  });
  assert.equal(canvas.role, 'dialog');
  assert.equal(canvas.modal, 'true');
  assert.equal(canvas.position, 'fixed');
  assert.deepEqual(canvas.root, {
    left: 0,
    right: canvas.viewport.width,
    top: 0,
    bottom: canvas.viewport.height,
  });
  const rgb = canvas.background.match(/\d+/g)?.slice(0, 3).map(Number);
  assert.ok(
    rgb?.length === 3 && rgb.every((channel) => channel <= 32),
    'The viewer covers the page with a near-black canvas in either theme',
  );
  assert.equal(
    canvas.obsoleteControls,
    0,
    'Browser fullscreen and solid Zoom controls have been removed',
  );
  assert.equal(
    canvas.headings,
    0,
    'The image canvas has no brand, heading, position label or footer',
  );
  if (canvas.ordinaryImage)
    assert.equal(
      canvas.text,
      '',
      'Normal viewing shows only the image and icon actions',
    );
  if (!canvas.recovery) {
    assert.deepEqual(
      canvas.stage,
      canvas.root,
      'The image stage fills the viewport, including short windows',
    );
    for (const action of canvas.actions) {
      assert.ok(
        action.label && action.icon,
        `${action.id} is an accessible icon action`,
      );
      assert.equal(action.text, '', `${action.id} has no visible button text`);
      assert.ok(
        ['transparent', 'rgba(0, 0, 0, 0)'].includes(action.background),
        `${action.id} has no button fill`,
      );
      assert.equal(action.border, '0px', `${action.id} has no button border`);
    }
  }
  return canvas;
}
