import assert from 'node:assert/strict';
import {
  setDetail171Theme,
  setDetail171Viewport,
} from './library-detail-171-helpers.mjs';
import { viewerId } from './library-viewer-fixtures.mjs';
import {
  closeViewer,
  openViewerDirect,
  viewer,
  viewerShot,
  settleViewer,
  waitViewerImage,
  waitViewerOverlayStable,
} from './library-viewer-helpers.mjs';

export async function readViewerLayout(page) {
  await settleViewer(page);
  await waitViewerOverlayStable(page);
  return page.evaluate((selector) => {
    const root = document.querySelector(selector);
    const stage = root.querySelector('[data-testid="viewer-stage"]');
    const image = root.querySelector('.yarl__slide_current img');
    const bounds = (node) => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    let picture = null;
    if (image) {
      const rect = image.getBoundingClientRect();
      const scale = Math.min(
        rect.width / image.naturalWidth,
        rect.height / image.naturalHeight,
      );
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      picture = {
        x: rect.x + (rect.width - width) / 2,
        y: rect.y + (rect.height - height) / 2,
        width,
        height,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        objectFit: getComputedStyle(image).objectFit,
        objectPosition: getComputedStyle(image).objectPosition,
      };
    }
    return {
      width: innerWidth,
      height: innerHeight,
      documentOverflow: document.documentElement.scrollWidth > innerWidth,
      overflow: root.scrollWidth > root.clientWidth,
      root: bounds(root),
      stage: bounds(stage),
      picture,
      oldChrome: !!root.querySelector(
        'h1,[role="tablist"],[data-testid="viewer-current-version"],[data-testid="viewer-footer"]',
      ),
      targets: [...root.querySelectorAll('button,a')]
        .filter((node) => {
          if (
            !node.getClientRects().length ||
            node.closest('[aria-hidden="true"],[inert]')
          )
            return false;
          const style = getComputedStyle(node);
          return (
            style.visibility !== 'hidden' &&
            style.clip !== 'rect(0px, 0px, 0px, 0px)' &&
            style.clipPath !== 'inset(50%)'
          );
        })
        .map((node) => {
          const rect = node.getBoundingClientRect();
          const hit = document.elementFromPoint(
            rect.x + rect.width / 2,
            rect.y + rect.height / 2,
          );
          return {
            name: node.getAttribute('aria-label') || node.textContent.trim(),
            text: node.textContent.trim(),
            svg: !!node.querySelector('svg'),
            width: rect.width,
            height: rect.height,
            inViewport:
              rect.left >= -1 &&
              rect.top >= -1 &&
              rect.right <= innerWidth + 1 &&
              rect.bottom <= innerHeight + 1,
            reachable: node === hit || node.contains(hit),
          };
        }),
    };
  }, viewer);
}

export function assertViewerLayout(geometry, ready) {
  assert.equal(geometry.documentOverflow, false);
  assert.equal(geometry.overflow, false);
  for (const rect of [geometry.root, geometry.stage]) {
    assert.ok(Math.abs(rect.x) <= 1 && Math.abs(rect.y) <= 1);
    assert.ok(
      Math.abs(rect.width - geometry.width) <= 1 &&
        Math.abs(rect.height - geometry.height) <= 1,
      'Viewer and picture stage each occupy the real viewport',
    );
  }
  assert.equal(
    geometry.oldChrome,
    false,
    'Immersive viewer has no filename, versions, caption or footer controls',
  );
  const close = geometry.targets.find((target) => target.name === '关闭大图');
  assert.ok(
    close?.svg && close.text === '',
    'Close is an accessible icon button',
  );
  for (const target of geometry.targets) {
    assert.ok(
      target.width >= 44 && target.height >= 44,
      target.name + ': 44px target',
    );
    assert.equal(
      target.inViewport,
      true,
      target.name + ': viewport-visible target',
    );
    assert.equal(
      target.reachable,
      true,
      target.name + ': actual pointer target',
    );
  }
  if (!ready) return;
  assert.deepEqual(
    geometry.targets.map((target) => target.name),
    ['关闭大图'],
    'Normal viewer has only the close control',
  );
  const picture = geometry.picture;
  assert.ok(picture, 'Ready viewer displays actual delivery pixels');
  assert.equal(picture.objectFit, 'contain');
  assert.equal(picture.objectPosition, '50% 50%');
  assert.ok(
    Math.abs(
      picture.width / picture.height -
        picture.naturalWidth / picture.naturalHeight,
    ) < 0.001,
    'Displayed image retains its real aspect ratio',
  );
  assert.ok(
    picture.x >= -1 &&
      picture.y >= -1 &&
      picture.x + picture.width <= geometry.width + 1 &&
      picture.y + picture.height <= geometry.height + 1,
    'Contain keeps the whole picture in the viewport',
  );
  assert.ok(
    Math.abs(picture.width - geometry.width) <= 1 ||
      Math.abs(picture.height - geometry.height) <= 1,
    'Contain uses the largest proportional viewport area',
  );
}

export async function verifyViewerLayouts(
  context,
  state = 'ready',
  representative = false,
) {
  const { page, config, report } = context;
  for (const theme of ['light', 'dark']) {
    await setDetail171Theme(page, theme);
    for (const width of representative
      ? [1440, 390]
      : [360, 390, 430, 768, 1440]) {
      await setDetail171Viewport(page, width);
      const geometry = await readViewerLayout(page);
      assertViewerLayout(geometry, state === 'ready');
      await viewerShot(page, config, report, state + '-' + theme + '-' + width);
      report.layouts.push({ state: 'viewer-' + state, theme, ...geometry });
    }
  }
}

export async function verifyViewerShortViewport({ page, config, report }) {
  for (const width of [390, 1440]) {
    await setDetail171Viewport(page, width, 400);
    const geometry = await readViewerLayout(page);
    assertViewerLayout(geometry, true);
    report.layouts.push({ state: 'viewer-short', ...geometry });
    await viewerShot(page, config, report, 'short-' + width);
  }
  report.checks.push(
    'The immersive picture stage occupies five real viewport widths in both themes, uses maximum proportional contain, and exposes only a reachable 44px close icon. 390/1440×400 preserve these properties. Screenshots require independent review and user acceptance.',
  );
}

export async function verifyViewerLongName({ page, config, report }) {
  const id = viewerId(0);
  const endpoint = '/api/images/' + id;
  const response = await page.fetch(endpoint);
  assert.equal(response.status, 200);
  const before = JSON.parse(response.body);
  const longName = '图'.repeat(255);
  const patch = (displayName) =>
    page.fetch(endpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName }),
    });
  try {
    const changed = await patch(longName);
    assert.equal(changed.status, 200);
    assert.equal(JSON.parse(changed.body).displayName, longName);
    await setDetail171Viewport(page, 360, 400);
    await openViewerDirect(page, config, id);
    await waitViewerImage(page, id, 'compressed');
    const geometry = await readViewerLayout(page);
    report.longName = geometry;
    await viewerShot(page, config, report, 'long-name-360-short');
    assertViewerLayout(geometry, true);
    assert.equal(
      await page.evaluate(
        (name) =>
          document
            .querySelector('[data-testid="image-viewer"]')
            .textContent.includes(name),
        longName,
      ),
      false,
      'Filename stays in detail rather than the immersive viewer',
    );
    await closeViewer(page, true);
    report.checks.push(
      'A real 255-character Chinese display-name PATCH does not alter the immersive 360×400 stage or close icon; filename remains absent, contain and Escape work, and the original name is restored.',
    );
  } finally {
    assert.equal((await patch(before.displayName)).status, 200);
  }
}
