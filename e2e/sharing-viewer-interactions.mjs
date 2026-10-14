import assert from 'node:assert/strict';
import { resizeViewport, setTheme } from './browser-geometry.mjs';
import { waitForPaint } from './sharing-public-page.mjs';
import { assertSharingViewerCanvas, viewer } from './sharing-viewer-page.mjs';

export async function verifySharingViewerInteractions(scene) {
  const { page, config, report, session, viewing } = scene;
  const { record, current, open, close, imageLoaded, capture, neighbors } =
    viewing;
  report.stage = 'viewer-interactions';
  await resizeViewport(page, 1440);
  await setTheme(page, 'light');
  await session.updateShare({ enabled: 1, show_name: 0, layout: 'grid' });
  await session.open();
  await session.loaded(40);
  await session.ensureVisible();
  await session.instrument();
  await page.evaluate(() => performance.clearResourceTimings());
  await open();
  await imageLoaded();
  const resources = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((name) => /\/i\/[^/?]+\?type=(?!thumbnail)/.test(name)),
  );
  await waitForPaint(page);
  assert.equal(
    await page.evaluate(() =>
      document.activeElement?.matches('.yarl__container'),
    ),
    true,
    'Escape starts on the actual YARL stage after opening the viewer',
  );
  await page.keyboard.press('Escape');
  await page.waitForSelector(viewer, { state: 'hidden' });
  await page.waitForFunction(
    (id) => document.activeElement?.getAttribute('data-share-open') === id,
    config.publicIds[6],
  );
  record(
    'Escape on the actual YARL stage closes the viewer and restores the original card focus without refocusing a button',
  );
  await open(config.publicIds[6]);
  await imageLoaded();
  await waitForPaint(page);
  await page.focus('[data-testid="share-viewer-next"]');
  const wheelCenter = await page.evaluate(() => {
    const rect = document
      .querySelector('[data-testid="share-viewer-stage"]')
      .getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await page.mouse.move(wheelCenter.x, wheelCenter.y);
  await page.mouse.wheel(0, -180, {
    label: 'enlarge the focused shared image',
  });
  await page.waitForFunction(
    () =>
      Number(
        document
          .querySelector('[data-testid="share-viewer"]')
          .getAttribute('data-zoom'),
      ) > 1,
  );
  const wheelFocus = await page.evaluate(() => ({
    tag: document.activeElement?.tagName,
    insideViewer: !!document.activeElement?.closest(
      '[data-testid="share-viewer"]',
    ),
  }));
  record(
    'Wheel zoom focus observation on the transparent neighbor arrow',
    wheelFocus,
  );
  assert.equal(
    wheelFocus.insideViewer,
    true,
    'Wheel zoom keeps keyboard focus on the visible viewer',
  );
  await page.keyboard.press('Escape');
  await page.waitForSelector(viewer, { state: 'hidden' });
  await page.waitForFunction(
    (id) => document.activeElement?.getAttribute('data-share-open') === id,
    config.publicIds[6],
  );
  record(
    'Escape after wheel zoom closes the viewer and restores the source card focus',
  );
  await open(config.publicIds[6]);
  await imageLoaded();
  await waitForPaint(page);
  await page.focus('[data-testid="share-viewer-stage"] .yarl__container');
  assert.equal(
    await page.evaluate(() =>
      document.activeElement?.matches('.yarl__container'),
    ),
    true,
    'Continuous keyboard navigation starts on the actual YARL stage',
  );
  await page.keyboard.press('ArrowRight');
  await current(config.publicIds[7]);
  await imageLoaded();
  await waitForPaint(page);
  record('YARL keyboard navigation intermediate focus observation', {
    focusAfterFirstArrow: await page.evaluate(() => ({
      tag: document.activeElement?.tagName,
      className: document.activeElement?.className,
      insideStage: !!document.activeElement?.closest(
        '[data-testid="share-viewer-stage"]',
      ),
    })),
  });
  await page.keyboard.press('ArrowLeft');
  await current(config.publicIds[6]);
  await imageLoaded();
  await waitForPaint(page);
  record(
    'Continuous ArrowRight and ArrowLeft from the actual YARL stage preserve keyboard navigation without refocusing another control',
  );
  await session.hiddenNames();
  const allowed = [
    config.publicIds[5],
    config.publicIds[6],
    config.publicIds[7],
  ];
  assert.ok(
    resources.length > 0,
    'Opening the viewer requests actual full preview bytes',
  );
  for (const resource of resources)
    assert.ok(
      allowed.some((id) => resource.includes(`/i/${id}?`)),
      'At most the immediate previous/current/next image is preloaded',
    );
  const context = await neighbors(config.publicIds[6]);
  assert.equal(context.current.imageId, config.publicIds[6]);
  assert.equal(context.previous.imageId, config.publicIds[5]);
  assert.equal(context.next.imageId, config.publicIds[7]);
  record(
    'Anonymous viewer loads only current and one neighbor in each direction; hidden names stay absent',
    { requestedImages: resources.length },
  );

  await assertSharingViewerCanvas(page);
  for (let index = 0; index < 12; index++) {
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => ({
      visible: !!document.activeElement.getClientRects().length,
      insideViewer: !!document.activeElement.closest(
        '[data-testid="share-viewer"]',
      ),
      list: !!document.activeElement.closest('[data-share-item], [inert]'),
    }));
    assert.equal(
      focus.list,
      false,
      'The suspended gallery cannot receive keyboard focus',
    );
    assert.equal(
      focus.visible,
      true,
      'Keyboard focus remains on a visible viewer control',
    );
    assert.equal(
      focus.insideViewer,
      true,
      'Tab stays inside the image dialog and cannot reach Return Home',
    );
  }
  await page.focus('[data-testid="share-viewer-close"]');
  await page.keyboard.press('ArrowRight');
  await current(config.publicIds[7]);
  await page.keyboard.press('ArrowLeft');
  await current(config.publicIds[6]);
  await imageLoaded();
  const beforeZoom = await zoomState(page);
  await doubleClickImage(page);
  await page.waitForFunction(
    (before) =>
      [...document.querySelectorAll('[data-testid="share-viewer-stage"] img')]
        .map((image) => image.getBoundingClientRect().width)
        .join(',') !== before,
    beforeZoom,
  );
  for (const width of [390, 1440]) {
    for (const theme of ['light', 'dark']) {
      await capture('zoomed', [width], [theme]);
      await assertZoomLayout(page, record, { width, theme, showName: false });
    }
  }
  await session.hiddenNames();
  const beforePan = await page.evaluate(
    () =>
      document
        .querySelector(
          '[data-testid="share-viewer-stage"] .yarl__slide_current img',
        )
        .getBoundingClientRect().top,
  );
  const center = await stageCenter(page);
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x, center.y + 60);
  await page.mouse.up();
  await page.waitForFunction(
    (before) =>
      document
        .querySelector(
          '[data-testid="share-viewer-stage"] .yarl__slide_current img',
        )
        .getBoundingClientRect().top !== before,
    beforePan,
  );
  await restoreZoom(page);
  await assertZoomRestored(page, config.publicIds[6]);

  await session.updateShare({ show_name: 1 });
  const namedContext = await neighbors(config.publicIds[6]);
  assert.ok(namedContext.current.displayName);
  await page.waitForFunction(
    (name) =>
      document
        .querySelector('[data-testid="share-viewer"] .yarl__slide_current img')
        ?.getAttribute('alt') === name,
    namedContext.current.displayName,
    { timeout: 15000 },
  );
  await doubleClickImage(page);
  await page.waitForFunction(
    () =>
      Number(
        document
          .querySelector('[data-testid="share-viewer"]')
          .getAttribute('data-zoom'),
      ) > 1,
  );
  for (const width of [390, 1440]) {
    for (const theme of ['light', 'dark']) {
      await capture('zoomed-name-enabled', [width], [theme]);
      await assertZoomLayout(page, record, { width, theme, showName: true });
      await assertNamedLayout(page, record, namedContext.current.displayName, {
        width,
        theme,
      });
    }
  }
  await restoreZoom(page);
  await assertZoomRestored(page, config.publicIds[6]);
  await session.updateShare({ show_name: 0 });
  await page.waitForFunction(
    (names) =>
      !names.some((name) =>
        [...document.querySelectorAll('[alt],[title],[aria-label]')].some(
          (node) =>
            ['alt', 'title', 'aria-label'].some((attribute) =>
              node.getAttribute(attribute)?.includes(name),
            ),
        ),
      ),
    config.names,
    { timeout: 15000 },
  );
  await session.hiddenNames();
  await page.keyboard.press('Escape');
  await page.waitForSelector(viewer, { state: 'hidden' });
  await page.waitForFunction(
    (id) => document.activeElement?.getAttribute('data-share-open') === id,
    config.publicIds[6],
  );
  record(
    'Viewport image dialog traps Tab focus, supports arrow navigation, double-click zoom and pan, and returns source card focus on Escape',
  );

  for (const [format, expected] of Object.entries(config.viewerFormats)) {
    const body = await neighbors(expected.imageId);
    assert.ok(
      body.current.previewUrl.endsWith(`?type=${expected.kind}`),
      `${format} uses the explicit existing preview version`,
    );
    await open(expected.imageId);
    await imageLoaded();
    assert.equal(
      await page.evaluate(() =>
        /版本|文件大小|拍摄信息|下载原图|幻灯片/.test(
          document.querySelector('[data-testid="share-viewer"]').textContent,
        ),
      ),
      false,
    );
    await close();
    record(
      `${format} decodes its existing ${expected.kind} preview without management controls`,
    );
  }

  await page.mouse.move(700, 500);
  await page.mouse.wheel(0, 100000, {
    label: 'reach the last loaded shared image',
  });
  await page.waitForSelector(`[data-share-open="${config.publicIds[39]}"]`);
  const scrollBefore = await scrollPosition(page);
  await open(config.publicIds[39]);
  await page.keyboard.press('ArrowRight');
  await current(config.publicIds[40]);
  await imageLoaded();
  assert.equal(
    await page.evaluate(() =>
      Number(
        document
          .querySelector('[data-testid="share-items"]')
          .getAttribute('data-share-loaded-count'),
      ),
    ),
    40,
    'Cross-page viewing does not load another entire list page',
  );
  await close();
  await page.waitForFunction(
    (id) => document.activeElement?.getAttribute('data-share-open') === id,
    config.publicIds[39],
  );
  assert.ok(
    Math.abs((await scrollPosition(page)) - scrollBefore) <= 1,
    'Closing returns to the document scroll position without jumping to the current viewed neighbor',
  );
  record(
    'Cross-page next image uses public neighbors without extending the 40-card list; close restores opening card focus and scroll',
    { scroll: scrollBefore },
  );

  await session.open();
  await session.loaded(40);
  await open();
  for (let index = 5; index >= 0; index--) {
    await page.click('[data-testid="share-viewer-previous"]');
    await current(config.publicIds[index]);
  }
  assert.equal(
    await page.evaluate(
      () => !!document.querySelector('[data-testid="share-viewer-previous"]'),
    ),
    false,
  );
  await page.focus('[data-testid="share-viewer-close"]');
  await page.keyboard.press('ArrowLeft');
  await current(config.publicIds[0]);
  await close();
  for (const count of [80, 120, 124]) {
    await page.click('[data-testid="share-load-more"]');
    await session.loaded(count);
  }
  await page.mouse.move(700, 500);
  await page.mouse.wheel(0, 100000, { label: 'reach the last shared image' });
  await page.waitForSelector(`[data-share-open="${config.publicIds.at(-1)}"]`);
  await open(config.publicIds.at(-1));
  assert.equal(
    await page.evaluate(
      () => !!document.querySelector('[data-testid="share-viewer-next"]'),
    ),
    false,
  );
  await page.focus('[data-testid="share-viewer-close"]');
  await page.keyboard.press('ArrowRight');
  await current(config.publicIds.at(-1));
  await close();
  record(
    'First and last public positions do not wrap; unavailable members retain their ordered viewer placeholders',
  );

  await resizeViewport(page, 390);
  await session.open();
  await session.loaded(40);
  await open();
  await imageLoaded();
  await page.cdp('Emulation.setTouchEmulationEnabled', {
    enabled: true,
    maxTouchPoints: 2,
  });
  try {
    await swipe(page);
    await current(config.publicIds[7]);
    await close();
    await open();
    await imageLoaded();
    const beforePinch = await zoomState(page);
    const bounds = await page.evaluate(() => {
      const rect = document
        .querySelector('[data-testid="share-viewer-stage"]')
        .getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    const points = (distance) => [
      { x: bounds.x - distance, y: bounds.y, id: 1 },
      { x: bounds.x + distance, y: bounds.y, id: 2 },
    ];
    await page.cdp('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: points(35),
    });
    await page.cdp('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: points(85),
    });
    await page.cdp('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await page.waitForFunction(
      (before) =>
        [...document.querySelectorAll('[data-testid="share-viewer-stage"] img')]
          .map((image) => image.getBoundingClientRect().width)
          .join(',') !== before,
      beforePinch,
    );
    await close();
    record(
      'Emulated native touch swipe and pinch change the anonymous image and scale',
    );
  } finally {
    await page.cdp('Emulation.setTouchEmulationEnabled', { enabled: false });
  }

  await resizeViewport(page, 390, 420);
  await open();
  await imageLoaded();
  for (const theme of ['light', 'dark']) {
    await setTheme(page, theme);
    await capture('short-viewport-canvas', [390], [theme], 420);
    const fitted = await page.evaluate(() => {
      const image = document
        .querySelector(
          '[data-testid="share-viewer-stage"] .yarl__slide_current img',
        )
        .getBoundingClientRect();
      return {
        left: image.left,
        right: image.right,
        top: image.top,
        bottom: image.bottom,
        scroll: scrollY,
      };
    });
    assert.ok(
      fitted.left >= 0 &&
        fitted.right <= 390 &&
        fitted.top >= 0 &&
        fitted.bottom <= 420,
      'The complete unzoomed image fits a short viewport',
    );
    await page.mouse.move(8, 210);
    await page.mouse.wheel(0, 600, {
      label: 'try to scroll the background while viewing the image',
    });
    await waitForPaint(page);
    assert.equal(
      await scrollPosition(page),
      fitted.scroll,
      'Viewer wheel input cannot scroll the background document',
    );
    record(
      'A short viewport fits the full image with reachable icon controls and locks background scrolling',
      { width: 390, height: 420, theme, fitted },
    );
  }
  await close();
  await resizeViewport(page, 390);

  await session.updateShare({ show_name: 0, layout: 'grid' });
  await waitForPaint(page);
}

async function scrollPosition(page) {
  return page.evaluate(() => scrollY);
}
async function assertZoomLayout(page, record, detail) {
  const canvas = await assertSharingViewerCanvas(page);
  const layout = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="share-viewer"]');
    return {
      zoom: Number(root.getAttribute('data-zoom')),
      text: root.textContent.trim(),
    };
  });
  record('Enlarged image remains on the pure viewport canvas', {
    ...detail,
    layout,
    canvas,
  });
  assert.ok(layout.zoom > 1, 'The captured viewer remains enlarged');
  assert.equal(
    layout.text,
    '',
    'Zoom adds no position label, filename, instruction or solid Restore button',
  );
}
async function assertZoomRestored(page, imageId) {
  await page.waitForFunction(
    () =>
      Number(
        document
          .querySelector('[data-testid="share-viewer"]')
          .getAttribute('data-zoom'),
      ) === 1,
  );
  assert.deepEqual(
    await page.evaluate(() => {
      const root = document.querySelector('[data-testid="share-viewer"]');
      return {
        imageId: root.getAttribute('data-image-id'),
        previous: !!root.querySelector('[data-testid="share-viewer-previous"]'),
        next: !!root.querySelector('[data-testid="share-viewer-next"]'),
      };
    }),
    { imageId, previous: true, next: true },
    'Gesture restoration keeps the current image and transparent navigation arrows',
  );
}
async function assertNamedLayout(page, record, name, detail) {
  const layout = await page.evaluate((name) => {
    const root = document.querySelector('[data-testid="share-viewer"]');
    return {
      nameVisible: root.textContent.includes(name),
      alt: root.querySelector('.yarl__slide_current img')?.getAttribute('alt'),
    };
  }, name);
  record(
    'Enabled names remain in image alternative text without visible viewer chrome',
    { ...detail, layout },
  );
  assert.equal(layout.nameVisible, false);
  assert.equal(
    layout.alt,
    name,
    'The current image uses the enabled name for assistive technology',
  );
}
async function stageCenter(page) {
  return page.evaluate(() => {
    const rect = document
      .querySelector('[data-testid="share-viewer-stage"]')
      .getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
}
async function doubleClickImage(page) {
  const center = await stageCenter(page);
  await page.mouse.move(center.x, center.y);
  for (const clickCount of [1, 2]) {
    await page.mouse.down({ button: 'left', clickCount });
    await page.mouse.up({ button: 'left', clickCount });
  }
}
async function restoreZoom(page) {
  const center = await stageCenter(page);
  await page.mouse.move(center.x, center.y);
  await page.mouse.wheel(0, 100000, {
    label: 'restore the full shared image using its native zoom gesture',
  });
  await page.waitForFunction(
    () =>
      Number(
        document
          .querySelector('[data-testid="share-viewer"]')
          .getAttribute('data-zoom'),
      ) === 1,
  );
}
async function zoomState(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="share-viewer-stage"] img')]
      .map((image) => image.getBoundingClientRect().width)
      .join(','),
  );
}
async function swipe(page) {
  const bounds = await page.evaluate(() => {
    const rect = document
      .querySelector('[data-testid="share-viewer-stage"]')
      .getBoundingClientRect();
    return {
      x: rect.left + rect.width * 0.75,
      end: rect.left + rect.width * 0.25,
      y: rect.top + rect.height / 2,
    };
  });
  await page.cdp('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: bounds.x, y: bounds.y, id: 1 }],
  });
  for (let step = 1; step <= 5; step++)
    await page.cdp('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        {
          x: bounds.x + ((bounds.end - bounds.x) * step) / 5,
          y: bounds.y,
          id: 1,
        },
      ],
    });
  await page.cdp('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
}
