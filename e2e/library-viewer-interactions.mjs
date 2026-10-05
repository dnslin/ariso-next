import assert from 'node:assert/strict';
import { viewerId } from './library-viewer-fixtures.mjs';
import { setDetail171Viewport } from './library-detail-171-helpers.mjs';
import {
  closeViewer,
  openViewerDirect,
  openViewerSource,
  settleViewer,
  viewerShot,
  viewerState,
  waitViewerImage,
  waitViewerNeighbors,
} from './library-viewer-helpers.mjs';
import {
  assertViewerLayout,
  readViewerLayout,
} from './library-viewer-layouts.mjs';

const imageBounds = (page) =>
  page.evaluate(() => {
    const image = document.querySelector(
      '[data-testid="image-viewer"] .yarl__slide_current img',
    );
    const rect = image.getBoundingClientRect();
    const transform = new DOMMatrixReadOnly(
      getComputedStyle(image.closest('.yarl__slide_wrapper')).transform,
    );
    const contain = Math.min(
      rect.width / image.naturalWidth,
      rect.height / image.naturalHeight,
    );
    const stage = document
      .querySelector('[data-testid="viewer-stage"]')
      .getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      centerX: stage.x + stage.width / 2,
      centerY: stage.y + stage.height / 2,
      scale: transform.a,
      translateX: transform.e,
      translateY: transform.f,
      paintedWidth: image.naturalWidth * contain,
      paintedHeight: image.naturalHeight * contain,
      stage: {
        x: stage.x,
        y: stage.y,
        width: stage.width,
        height: stage.height,
      },
    };
  });

const waitZoom = (page, width) =>
  page.waitForFunction(
    (width) =>
      document
        .querySelector('[data-testid="image-viewer"] .yarl__slide_current img')
        .getBoundingClientRect().width >
      width * 1.05,
    width,
  );

const waitReset = (page, width) =>
  page.waitForFunction(
    (width) =>
      Math.abs(
        document
          .querySelector(
            '[data-testid="image-viewer"] .yarl__slide_current img',
          )
          .getBoundingClientRect().width - width,
      ) < 2,
    width,
  );

async function panMouse(page, base, id) {
  await page.mouse.move(base.centerX, base.centerY);
  await page.mouse.down();
  await page.mouse.move(base.centerX + 80, base.centerY + 40);
  await page.mouse.up();
  await page.waitForFunction((position) => {
    const rect = document
      .querySelector('[data-testid="image-viewer"] .yarl__slide_current img')
      .getBoundingClientRect();
    const matrix = new DOMMatrixReadOnly(
      getComputedStyle(
        document.querySelector(
          '[data-testid="image-viewer"] .yarl__slide_current .yarl__slide_wrapper',
        ),
      ).transform,
    );
    return (
      Math.abs(rect.x - position.x) > 10 &&
      Math.abs(rect.y - position.y) > 5 &&
      Math.abs(matrix.a - position.scale) < 0.001 &&
      Math.abs(matrix.f - position.translateY) > 5
    );
  }, base);
  assert.equal(
    (await viewerState(page)).id,
    id,
    'Zoomed pan retains image identity',
  );
}

let nextTouchGestureAt = 0;
async function startTouchGesture(page, touchPoints) {
  // YARL 3.32.2 treats touch starts within 300 ms as a double tap.
  await page.waitForFunction(
    (deadline) => performance.now() >= deadline,
    nextTouchGestureAt,
  );
  await page.cdp('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints,
  });
  nextTouchGestureAt = await page.evaluate(() => performance.now() + 300);
}

async function pinch(page, center, distances) {
  const points = (distance) => [
    {
      x: center.centerX - distance,
      y: center.centerY,
      radiusX: 1,
      radiusY: 1,
      force: 1,
      id: 1,
    },
    {
      x: center.centerX + distance,
      y: center.centerY,
      radiusX: 1,
      radiusY: 1,
      force: 1,
      id: 2,
    },
  ];
  await startTouchGesture(page, points(distances[0]));
  for (const distance of distances.slice(1))
    await page.cdp('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: points(distance),
    });
  await page.cdp('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await settleViewer(page);
}

async function swipe(page, center, direction) {
  const offsets =
    direction === 'next' ? [120, 60, 0, -60, -120] : [-120, -60, 0, 60, 120];
  const finger = (offset) => [
    {
      x: center.centerX + offset,
      y: center.centerY,
      radiusX: 1,
      radiusY: 1,
      force: 1,
      id: 1,
    },
  ];
  await startTouchGesture(page, finger(offsets[0]));
  for (const offset of offsets.slice(1))
    await page.cdp('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: finger(offset),
    });
  await page.cdp('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
}

export async function verifyViewerInteractions({ page, config, sql, report }) {
  await setDetail171Viewport(page, 1440);
  await openViewerSource(page, config, 7);
  const base = await imageBounds(page);
  assertViewerLayout(await readViewerLayout(page), true);
  await page.mouse.move(base.centerX, base.centerY);
  for (let click = 0; click < 2; click++) {
    await page.mouse.down();
    await page.mouse.up();
  }
  await waitZoom(page, base.width);
  const zoomed = await imageBounds(page);
  assert.deepEqual(
    zoomed.stage,
    base.stage,
    'Zoom changes picture scale, not the viewport stage',
  );
  await panMouse(page, zoomed, viewerId(7));
  await page.keyboard.press('ArrowRight');
  await settleViewer(page);
  assert.equal(
    (await viewerState(page)).id,
    viewerId(7),
    'Zoomed arrow pans instead of advancing',
  );
  await page.keyboard.press('Control+0');
  await waitReset(page, base.width);
  await page.keyboard.press('Shift+Equal');
  await waitZoom(page, base.width);
  await page.keyboard.press('-');
  await waitReset(page, base.width);
  await page.mouse.move(base.centerX, base.centerY);
  await page.mouse.wheel(0, -250);
  await waitZoom(page, base.width);
  await viewerShot(page, config, report, 'desktop-wheel-zoom');
  await page.keyboard.press('Control+0');
  await waitReset(page, base.width);
  assertViewerLayout(await readViewerLayout(page), true);
  await closeViewer(page, true);
  report.checks.push(
    'Desktop real double-click, +/− keyboard and wheel zoom work without visible zoom controls. Mouse/arrow pan while zoomed retains image identity; keyboard reset restores maximum proportional contain, the viewport stage and Escape return to detail.',
  );

  // A real small thumbnail must fill the proportional viewport despite its
  // natural 400×300 dimensions; zoom must use the same displayed base size.
  await openViewerDirect(page, config, viewerId(7), 'thumbnail');
  await waitViewerImage(page, viewerId(7), 'thumbnail');
  const thumbnail = await readViewerLayout(page);
  assertViewerLayout(thumbnail, true);
  assert.equal(thumbnail.picture.naturalWidth, 400);
  assert.equal(thumbnail.picture.naturalHeight, 300);
  report.layouts.push({ state: 'viewer-small-thumbnail', ...thumbnail });
  const smallBase = await imageBounds(page);
  await page.keyboard.press('Shift+Equal');
  await waitZoom(page, smallBase.width);
  await panMouse(page, await imageBounds(page), viewerId(7));
  await page.keyboard.press('Control+0');
  await waitReset(page, smallBase.width);
  await closeViewer(page, true);

  const id = 'issue185-no-dimensions';
  const metadata = await page.fetch('/api/images/' + id);
  assert.equal(metadata.status, 200);
  const detail = JSON.parse(metadata.body);
  assert.equal(detail.width, null);
  assert.equal(detail.height, null);
  assert.ok(
    detail.versions
      .filter((version) => version.saved)
      .every((version) => version.width === null && version.height === null),
  );
  const objects = await sql(
    "SELECT width,height FROM media_objects WHERE image_id='issue185-no-dimensions'",
  );
  assert.equal(objects.length, 2);
  assert.ok(
    objects.every((object) => object.width === null && object.height === null),
  );
  await openViewerDirect(page, config, id);
  await waitViewerImage(page, id, 'compressed');
  const decoded = await readViewerLayout(page);
  assertViewerLayout(decoded, true);
  assert.equal(decoded.picture.naturalWidth, 1200);
  assert.equal(decoded.picture.naturalHeight, 900);
  report.layouts.push({ state: 'viewer-null-dimensions', ...decoded });
  const noDimensionBase = await imageBounds(page);
  await page.keyboard.press('Shift+Equal');
  await waitZoom(page, noDimensionBase.width);
  await panMouse(page, await imageBounds(page), id);
  await viewerShot(page, config, report, 'null-dimensions-zoom-pan');
  await closeViewer(page, true);
  report.checks.push(
    'Real 400×300 thumbnail uses the maximum proportional viewport and can zoom/pan. A real 1200×900 PNG/WebP fixture whose image and saved object/version dimensions are all NULL still decodes, fills proportional contain, then + zoom and two-axis mouse pan work before Escape returns to detail.',
  );

  const partialId = 'issue185-partial-dimensions';
  const partialResponse = await page.fetch('/api/images/' + partialId);
  assert.equal(partialResponse.status, 200);
  const partialDetail = JSON.parse(partialResponse.body);
  assert.equal(partialDetail.width, 1200);
  assert.equal(partialDetail.height, 900);
  const partialVersion = partialDetail.versions.find(
    (version) => version.kind === 'thumbnail',
  );
  assert.equal(partialVersion.width, null);
  assert.equal(partialVersion.height, 240);
  await openViewerDirect(page, config, partialId, 'thumbnail');
  await waitViewerImage(page, partialId, 'thumbnail');
  const partial = await readViewerLayout(page);
  assertViewerLayout(partial, true);
  assert.equal(partial.picture.naturalWidth, 320);
  assert.equal(partial.picture.naturalHeight, 240);
  report.layouts.push({ state: 'viewer-partial-dimensions', ...partial });
  const partialBase = await imageBounds(page);
  await page.keyboard.press('Shift+Equal');
  await waitZoom(page, partialBase.width);
  await panMouse(page, await imageBounds(page), partialId);
  await viewerShot(page, config, report, 'partial-dimensions-zoom-pan');
  await closeViewer(page, true);
  report.checks.push(
    'A real 320×240 thumbnail with width=NULL and height=240, attached to a 1200×900 original, uses its decoded pair for proportional contain and zoom. Two-axis pan, including vertical movement, succeeds without mixing original width into thumbnail height.',
  );

  await setDetail171Viewport(page, 390);
  await page.cdp('Emulation.setTouchEmulationEnabled', {
    enabled: true,
    maxTouchPoints: 2,
  });
  try {
    await openViewerSource(page, config, 7);
    await waitViewerNeighbors(page, viewerId(7));
    const touchBase = await imageBounds(page);
    assertViewerLayout(await readViewerLayout(page), true);
    assert.equal(
      await page.evaluate(
        () =>
          getComputedStyle(
            document.querySelector(
              '[data-testid="image-viewer"] .yarl__container',
            ),
          ).touchAction,
      ),
      'none',
      'Stage permits pinch and both pan axes',
    );
    // Each CDP packet moves both pointers together. YARL's incremental zoom
    // observes one committed factor per packet, so stretch far enough for the
    // actual picture (not the full-size img box) to exceed the tall viewport.
    const pinchDistances = [30, 40, 50, 65, 80, 100, 130, 180];
    await pinch(page, touchBase, pinchDistances);
    await waitZoom(page, touchBase.width);
    const pinched = await imageBounds(page);
    report.touchGeometry = { base: touchBase, pinchDistances, pinched };
    assert.ok(
      pinched.paintedWidth > touchBase.stage.width &&
        pinched.paintedHeight > touchBase.stage.height,
      'Both painted axes exceed the viewport before testing two-axis pan',
    );
    const finger = (offset) => [
      {
        x: touchBase.centerX + offset,
        y: touchBase.centerY + offset / 2,
        radiusX: 1,
        radiusY: 1,
        force: 1,
        id: 1,
      },
    ];
    await startTouchGesture(page, finger(0));
    for (const offset of [20, 40, 60])
      await page.cdp('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: finger(offset),
      });
    await page.cdp('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await page.waitForFunction((position) => {
      const rect = document
        .querySelector('[data-testid="image-viewer"] .yarl__slide_current img')
        .getBoundingClientRect();
      const matrix = new DOMMatrixReadOnly(
        getComputedStyle(
          document.querySelector(
            '[data-testid="image-viewer"] .yarl__slide_current .yarl__slide_wrapper',
          ),
        ).transform,
      );
      return (
        Math.abs(rect.x - position.x) > 10 &&
        Math.abs(rect.y - position.y) > 5 &&
        Math.abs(matrix.a - position.scale) < 0.001 &&
        Math.abs(matrix.f - position.translateY) > 5
      );
    }, pinched);
    assert.equal(
      (await viewerState(page)).id,
      viewerId(7),
      'Single-finger zoomed pan retains current picture',
    );
    report.touchGeometry.panned = await imageBounds(page);
    await viewerShot(page, config, report, 'touch-pinch-pan');
    await pinch(page, touchBase, [180, 130, 100, 80, 60, 40, 20, 5]);
    await waitReset(page, touchBase.width);
    assertViewerLayout(await readViewerLayout(page), true);
    await swipe(page, touchBase, 'next');
    await waitViewerImage(page, viewerId(8), 'compressed');
    await waitViewerNeighbors(page, viewerId(8));
    await swipe(page, touchBase, 'previous');
    await waitViewerImage(page, viewerId(7), 'compressed');
    await closeViewer(page, true);
  } finally {
    await page.cdp('Emulation.setTouchEmulationEnabled', { enabled: false });
  }
  report.checks.push(
    'Chromium touch emulation performs real two-finger pinch in/out and diagonal single-finger zoomed pan while preserving image identity. After proportional contain is restored, actual left/right swipes navigate to the known neighbor and back. This is browser emulation, not physical-device evidence.',
  );
}
