import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  viewerId,
  viewerName,
  viewerQuery,
} from './library-viewer-fixtures.mjs';

export const viewer = '[data-testid="image-viewer"]';
export const entry = '[data-testid="detail-viewer-entry"]';
export const button = (name) => `loc=role:button[name="${name}"]`;
export const tab = (name) =>
  `${viewer} [role="tablist"][aria-label="大图查看版本"] [role="tab"]:text-is("${name}")`;
export const kindNames = {
  original: '原图',
  compressed: '压缩图',
  thumbnail: '缩略图',
  watermark: '水印图',
};

export const settleViewer = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );

export async function waitViewerOverlayStable(page) {
  await page.waitForFunction(() => {
    const overlayTargets = [
      ...document.querySelectorAll(
        '[data-slot="modal-backdrop"],[data-slot="modal-container"],[data-slot="modal-dialog"],[data-slot="alert-dialog-backdrop"],[data-slot="alert-dialog-container"],[data-slot="alert-dialog-dialog"]',
      ),
    ];
    return overlayTargets.every(
      (node) =>
        !node.matches('[data-entering],[data-exiting]') &&
        node
          .getAnimations({ subtree: false })
          .every(
            (animation) =>
              animation.playState !== 'running' ||
              animation.effect?.getTiming().iterations === Infinity,
          ),
    );
  });
}

export async function viewerState(page) {
  return page.evaluate(() => {
    const root = document.querySelector('[data-testid="image-viewer"]');
    const current = root?.querySelector('.yarl__slide_current img');
    return {
      id: root?.dataset.imageId,
      kind: root?.dataset.version,
      src: current?.getAttribute('src'),
      decoded: !!current?.complete && current.naturalWidth > 0,
      info: root?.querySelector('[data-testid="viewer-current-version"]')
        ?.textContent,
      placeholder: root?.querySelector('[data-testid="viewer-placeholder"]')
        ?.textContent,
      url: location.href,
    };
  });
}

export async function waitViewerImage(page, id, kind) {
  await page.waitForFunction(
    ({ id, kind }) => {
      const root = document.querySelector('[data-testid="image-viewer"]');
      const image = root?.querySelector('.yarl__slide_current img');
      return (
        root?.dataset.imageId === id &&
        root?.dataset.version === kind &&
        image?.complete &&
        image.naturalWidth > 0
      );
    },
    { id, kind },
  );
  await waitViewerOverlayStable(page);
  const state = await viewerState(page);
  assert.match(state.src, new RegExp(`/i/${id}\\?type=${kind}(?:&|$)`));
  assert.ok(
    state.info.includes(kindNames[kind]),
    'Actual selected version is named',
  );
  assert.equal(
    state.src.includes('/_next/image'),
    false,
    'Delivery is used directly',
  );
}

export async function openViewerDirect(page, config, id = viewerId(7), kind) {
  await page.goto(`${config.origin}/library?image=${id}`);
  await page.waitForSelector('[data-testid="detail-body"]');
  if (kind) await page.click(`loc=role:tab[name="${kindNames[kind]}"]`);
  await page.click(entry);
  await page.waitForSelector(viewer);
}

export async function closeViewer(page, keyboard = false) {
  if (keyboard) await page.keyboard.press('Escape');
  else await page.click(button('关闭大图'));
  await page.waitForSelector(viewer, { state: 'hidden' });
  await page.waitForSelector('[data-testid="detail-body"]');
  await page.waitForFunction(
    () => document.activeElement?.dataset.testid === 'detail-viewer-entry',
  );
}

export async function findViewerCard(page, index) {
  const id = viewerId(index);
  const geometry = await page.evaluate(() => {
    const main = document.querySelector('main');
    return { height: main.clientHeight, extent: main.scrollHeight };
  });
  for (
    let top = 0;
    top < geometry.extent;
    top += Math.max(100, geometry.height / 2)
  ) {
    await page.evaluate((top) => {
      document.querySelector('main').scrollTop = top;
    }, top);
    await settleViewer(page);
    if (
      await page.evaluate(
        (id) =>
          !!document.querySelector(
            `[data-testid="library-card"][data-image-id="${id}"]`,
          ),
        id,
      )
    )
      return;
  }
  assert.fail(`Real query card ${id} was not mounted in any virtual window`);
}

export async function openViewerSource(
  page,
  config,
  index = 19,
  query = viewerQuery,
) {
  await page.goto(`${config.origin}/library?${query}`);
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="library-list"]')?.dataset
        .loadedCount === '20',
  );
  await findViewerCard(page, index);
  const source = button(`查看图片：${viewerName(index)}`);
  await page.focus(source);
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-testid="detail-body"]');
  await page.click(entry);
  await page.waitForSelector(viewer);
  await waitViewerImage(page, viewerId(index), 'compressed');
}

export async function monitorViewerRequests(page) {
  await page.evaluate(() => {
    window.__viewerFetch = window.fetch;
    window.__viewerRequests = [];
    window.fetch = async (...args) => {
      const url = new URL(String(args[0]), location.href);
      if (url.pathname.startsWith('/api/images'))
        window.__viewerRequests.push({ path: url.pathname, query: url.search });
      return window.__viewerFetch(...args);
    };
    performance.clearResourceTimings();
  });
}

export async function restoreViewerFetch(page) {
  await page.evaluate(() => {
    window.__viewerRelease?.();
    if (window.__viewerFetch) window.fetch = window.__viewerFetch;
    delete window.__viewerRelease;
    delete window.__viewerFetch;
  });
}

export async function viewerShot(page, config, report, name) {
  await waitViewerOverlayStable(page);
  const file = `library-viewer-${name}.png`;
  await page.screenshot({ path: join(config.output, file) });
  report.screenshots ??= [];
  report.screenshots.push(file);
}
