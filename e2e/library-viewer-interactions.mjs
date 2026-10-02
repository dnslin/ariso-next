import assert from 'node:assert/strict';
import { viewerId } from './library-viewer-fixtures.mjs';
import { setDetail171Viewport } from './library-detail-171-helpers.mjs';
import {
  button,
  closeViewer,
  entry,
  openViewerSource,
  viewerShot,
  viewerState,
  waitViewerImage,
} from './library-viewer-helpers.mjs';

const imageBounds = (page) =>
  page.evaluate(() => {
    const rect = document
      .querySelector('[data-testid="image-viewer"] .yarl__slide_current img')
      .getBoundingClientRect();
    const stageNode = document.querySelector('[data-testid="viewer-stage"]');
    const stage = stageNode.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      centerX: stage.x + stage.width / 2,
      centerY: stage.y + stage.height / 2,
      borderRadius: getComputedStyle(stageNode).borderRadius,
    };
  });

export async function verifyViewerInteractions({ page, config, report }) {
  await setDetail171Viewport(page, 1440);
  await openViewerSource(page, config, 7);
  const base = await imageBounds(page);
  assert.equal(base.borderRadius, '12px');
  await page.click(button('放大'));
  await page.waitForFunction(
    (width) =>
      document
        .querySelector('[data-testid="image-viewer"] .yarl__slide_current img')
        .getBoundingClientRect().width >
      width * 1.05,
    base.width,
  );
  const zoomed = await imageBounds(page);
  assert.equal(zoomed.borderRadius, '0px');
  await page.mouse.move(zoomed.centerX, zoomed.centerY);
  await page.mouse.down();
  await page.mouse.move(zoomed.centerX + 80, zoomed.centerY + 40);
  await page.mouse.up();
  await page.waitForFunction((position) => {
    const rect = document
      .querySelector('[data-testid="image-viewer"] .yarl__slide_current img')
      .getBoundingClientRect();
    return (
      Math.abs(rect.x - position.x) > 10 || Math.abs(rect.y - position.y) > 10
    );
  }, zoomed);
  assert.equal(
    (await viewerState(page)).id,
    viewerId(7),
    'Zoomed pan must not become picture navigation',
  );
  await page.keyboard.press('ArrowRight');
  assert.equal(
    (await viewerState(page)).id,
    viewerId(7),
    'Zoomed arrow moves the image instead of advancing',
  );
  await page.click(button('还原'));
  await page.waitForFunction(
    (width) =>
      Math.abs(
        document
          .querySelector(
            '[data-testid="image-viewer"] .yarl__slide_current img',
          )
          .getBoundingClientRect().width - width,
      ) < 2,
    base.width,
  );
  const restored = await imageBounds(page);
  assert.equal(restored.borderRadius, '12px');
  report.stageBoundary = {
    desktop: {
      initial: base.borderRadius,
      zoomed: zoomed.borderRadius,
      restored: restored.borderRadius,
    },
  };
  await page.focus('[data-testid="image-viewer"] .yarl__container');
  await page.keyboard.press('Shift+Equal');
  await page.waitForFunction(
    (width) =>
      document
        .querySelector('[data-testid="image-viewer"] .yarl__slide_current img')
        .getBoundingClientRect().width >
      width * 1.05,
    base.width,
  );
  await page.keyboard.press('-');
  await page.waitForFunction(
    (width) =>
      Math.abs(
        document
          .querySelector(
            '[data-testid="image-viewer"] .yarl__slide_current img',
          )
          .getBoundingClientRect().width - width,
      ) < 2,
    base.width,
  );
  await page.mouse.move(base.centerX, base.centerY);
  await page.mouse.wheel(0, -250);
  await page.waitForFunction(
    (width) =>
      document
        .querySelector('[data-testid="image-viewer"] .yarl__slide_current img')
        .getBoundingClientRect().width >
      width * 1.05,
    base.width,
  );
  await page.click(button('还原'));
  const fullscreenSupported = await page.evaluate(
    () =>
      document.fullscreenEnabled &&
      typeof document.documentElement.requestFullscreen === 'function',
  );
  if (fullscreenSupported) {
    await page.click(button('全屏'));
    await page.waitForFunction(() => !!document.fullscreenElement);
    await viewerShot(page, config, report, 'system-fullscreen');
    await page.click(button('退出全屏'));
    await page.waitForFunction(() => !document.fullscreenElement);
  }
  report.fullscreen = {
    supported: fullscreenSupported,
    enteredAndExited: !!fullscreenSupported,
  };
  await closeViewer(page);
  report.checks.push(
    'Desktop real YARL Zoom enlarges, resets, handles +/− keyboard and wheel. Mouse/arrow pan while zoomed retains image identity; supported system fullscreen is entered/exited through its real API.',
  );

  await setDetail171Viewport(page, 390);
  await page.cdp('Emulation.setTouchEmulationEnabled', {
    enabled: true,
    maxTouchPoints: 2,
  });
  try {
    await openViewerSource(page, config, 7);
    const touchBase = await imageBounds(page);
    assert.equal(touchBase.borderRadius, '12px');
    assert.equal(
      await page.evaluate(
        () =>
          getComputedStyle(
            document.querySelector(
              '[data-testid="viewer-stage"] .yarl__container',
            ),
          ).touchAction,
      ),
      'none',
      'Stage permits image pinch and both pan axes',
    );
    const points = (distance) => [
      {
        x: touchBase.centerX - distance,
        y: touchBase.centerY,
        radiusX: 1,
        radiusY: 1,
        force: 1,
        id: 1,
      },
      {
        x: touchBase.centerX + distance,
        y: touchBase.centerY,
        radiusX: 1,
        radiusY: 1,
        force: 1,
        id: 2,
      },
    ];
    await page.cdp('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: points(30),
    });
    for (const distance of [40, 50, 65, 80])
      await page.cdp('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: points(distance),
      });
    await page.cdp('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await page.waitForFunction(
      (width) =>
        document
          .querySelector(
            '[data-testid="image-viewer"] .yarl__slide_current img',
          )
          .getBoundingClientRect().width >
        width * 1.1,
      touchBase.width,
    );
    const pinched = await imageBounds(page);
    assert.equal(pinched.borderRadius, '0px');
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
    await page.cdp('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: finger(0),
    });
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
      return (
        Math.abs(rect.x - position.x) > 10 && Math.abs(rect.y - position.y) > 5
      );
    }, pinched);
    assert.equal(
      (await viewerState(page)).id,
      viewerId(7),
      'Single-finger zoomed pan retains current picture',
    );
    await viewerShot(page, config, report, 'touch-pinch-pan');
    await page.click(button('还原'));
    await page.waitForFunction(
      (width) =>
        Math.abs(
          document
            .querySelector(
              '[data-testid="image-viewer"] .yarl__slide_current img',
            )
            .getBoundingClientRect().width - width,
        ) < 2,
      touchBase.width,
    );
    const touchRestored = await imageBounds(page);
    assert.equal(touchRestored.borderRadius, '12px');
    report.stageBoundary.touch = {
      initial: touchBase.borderRadius,
      zoomed: pinched.borderRadius,
      restored: touchRestored.borderRadius,
    };
    await closeViewer(page);
  } finally {
    await page.cdp('Emulation.setTouchEmulationEnabled', { enabled: false });
  }
  await page.goto(`${config.origin}/library?image=${viewerId(7)}`);
  await page.waitForSelector('[data-testid="detail-body"]');
  try {
    await page.evaluate(() => {
      Object.defineProperty(document, 'fullscreenEnabled', {
        configurable: true,
        value: false,
      });
    });
    await page.click(entry);
    await waitViewerImage(page, viewerId(7), 'compressed');
    assert.equal(
      await page.evaluate(
        () =>
          !!document.querySelector(
            '[data-testid="image-viewer"] button[aria-label="全屏"]',
          ),
      ),
      false,
      'No unusable system fullscreen button is shown',
    );
    await page.click(button('放大'));
    await page.waitForSelector(button('还原'));
    await viewerShot(page, config, report, 'fullscreen-unavailable');
    await closeViewer(page, true);
  } finally {
    await page.evaluate(() => {
      delete document.fullscreenEnabled;
    });
  }
  report.checks.push(
    'Chromium touch emulation performs real two-finger pinch and single-finger zoomed pan. Explicit missing Fullscreen capability hides the system button while viewport viewer and zoom remain. This is browser emulation, not physical-device evidence.',
  );
}
