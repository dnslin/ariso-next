import assert from 'node:assert/strict';
import { join } from 'node:path';
import { resizeViewport, setTheme } from './browser-geometry.mjs';
import { waitForPaint } from './sharing-public-page.mjs';
import { viewer } from './sharing-viewer-page.mjs';

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
    'Wheel zoom focus observation after the focused neighbor button is removed',
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

  let homeReached = false;
  for (let index = 0; index < 12; index++) {
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => ({
      visible: !!document.activeElement.getClientRects().length,
      list: !!document.activeElement.closest('[data-share-item], [inert]'),
      home: document.activeElement.matches('.public-header a[href="/"]'),
    }));
    assert.equal(
      focus.list,
      false,
      'The suspended gallery cannot receive keyboard focus',
    );
    assert.equal(
      focus.visible,
      true,
      'Keyboard focus stays on the current anonymous page visible controls',
    );
    homeReached ||= focus.home;
  }
  assert.equal(
    homeReached,
    true,
    'The approved Return Home navigation remains keyboard reachable',
  );
  await page.focus('[data-testid="share-viewer-close"]');
  await page.keyboard.press('ArrowRight');
  await current(config.publicIds[7]);
  await page.keyboard.press('ArrowLeft');
  await current(config.publicIds[6]);
  await imageLoaded();
  const beforeZoom = await zoomState(page);
  await page.click('[data-testid="share-viewer-zoom"]');
  await page.waitForFunction((before) => {
    const root = document.querySelector('[data-testid="share-viewer-stage"]');
    return (
      [...root.querySelectorAll('img')]
        .map((image) => image.getBoundingClientRect().width)
        .join(',') !== before
    );
  }, beforeZoom);
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
  const center = await page.evaluate(() => {
    const rect = document
      .querySelector('[data-testid="share-viewer-stage"]')
      .getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
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
  await page.click('[data-testid="share-viewer-zoom"]');
  await assertZoomRestored(page, config.publicIds[6]);
  const supportsFullscreen = await page.evaluate(
    () => document.fullscreenEnabled,
  );
  if (supportsFullscreen) {
    for (const width of [1440, 390]) {
      for (const theme of ['light', 'dark']) {
        await resizeViewport(page, width);
        await setTheme(page, theme);
        await page.click('[data-testid="share-viewer-fullscreen"]');
        await page.waitForFunction(() => !!document.fullscreenElement);
        await capture('fullscreen', [width], [theme]);
        await recordFullscreenFocus(page, record, `entered-${width}-${theme}`);
        await page.click('[data-testid="share-viewer-fullscreen"]');
        await page.waitForFunction(() => !document.fullscreenElement);
        await waitForPaint(page);
        await recordFullscreenFocus(
          page,
          record,
          `button-exit-${width}-${theme}`,
        );
      }
    }
  } else
    report.limitations.push(
      'The current browser does not expose fullscreen support.',
    );

  await session.updateShare({ show_name: 1 });
  const namedContext = await neighbors(config.publicIds[6]);
  assert.ok(namedContext.current.displayName);
  await page.waitForFunction(
    (name) =>
      [...document.querySelectorAll('[data-testid="share-viewer"] p')].some(
        (node) => node.textContent === name,
      ),
    namedContext.current.displayName,
    { timeout: 15000 },
  );
  await page.click('[data-testid="share-viewer-zoom"]');
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
      await capture('zoomed-names', [width], [theme]);
      await assertZoomLayout(page, record, { width, theme, showName: true });
      await assertNamedLayout(page, record, namedContext.current.displayName, {
        state: 'zoomed-names',
        width,
        theme,
      });
    }
  }
  await page.click('[data-testid="share-viewer-zoom"]');
  await assertZoomRestored(page, config.publicIds[6]);

  if (supportsFullscreen) {
    for (const width of [1440, 390]) {
      for (const theme of ['light', 'dark']) {
        await resizeViewport(page, width);
        await setTheme(page, theme);
        await page.click('[data-testid="share-viewer-fullscreen"]');
        await page.waitForFunction(() => !!document.fullscreenElement);
        await capture('fullscreen-names', [width], [theme]);
        await assertNamedLayout(
          page,
          record,
          namedContext.current.displayName,
          { state: 'fullscreen-names', width, theme },
        );
        await recordFullscreenFocus(
          page,
          record,
          `entered-names-${width}-${theme}`,
        );
        await page.click('[data-testid="share-viewer-fullscreen"]');
        await page.waitForFunction(() => !document.fullscreenElement);
        await waitForPaint(page);
        await recordFullscreenFocus(
          page,
          record,
          `button-exit-names-${width}-${theme}`,
        );
      }
    }
  }
  await session.updateShare({ show_name: 0 });
  await page.waitForFunction(
    (names) =>
      !names.some((name) =>
        document.querySelector('main').textContent.includes(name),
      ),
    config.names,
    { timeout: 15000 },
  );
  await session.hiddenNames();

  if (supportsFullscreen) {
    for (const width of [390, 1440]) {
      await resizeViewport(page, width);
      await setTheme(page, 'light');
      await page.click('[data-testid="share-viewer-fullscreen"]');
      await page.waitForFunction(() => !!document.fullscreenElement);
      await waitForPaint(page);
      await recordFullscreenFocus(page, record, `before-Escape-${width}`);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.fullscreenElement);
      await waitForPaint(page);
      await current(config.publicIds[6]);
      assert.equal(
        await page.evaluate(
          () => !!document.querySelector('[data-testid="share-viewer"]'),
        ),
        true,
        'Native fullscreen Escape restores the ordinary viewer without closing it',
      );
      await capture('fullscreen-return', [width], ['light']);
      await recordFullscreenFocus(page, record, `Escape-exit-${width}`);
      record(
        'Native fullscreen Escape preserves the open viewer and current image before a subsequent Escape closes it',
        { width, imageId: config.publicIds[6] },
      );
    }
    await resizeViewport(page, 1440);
    await setTheme(page, 'light');
    record(
      'Browser fullscreen enters and exits on the current anonymous image with actual desktop/mobile light/dark captures',
    );
  }
  await page.keyboard.press('Escape');
  await page.waitForSelector(viewer, { state: 'hidden' });
  await page.waitForFunction(
    (id) => document.activeElement?.getAttribute('data-share-open') === id,
    config.publicIds[6],
  );
  record(
    'Visible page Tab order including Return Home, arrow navigation, zoom/pan, Escape and original card focus return',
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
  assert.equal(await scrollPosition(page), scrollBefore);
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
    const before = await shortScrollState(page);
    assert.ok(
      before.maximum > 0,
      'The short viewer has real scrollable image content',
    );
    assert.ok(
      before.imageTop >= before.top && before.imageBottom > before.bottom,
      'The image starts at the top and extends below the short viewport',
    );
    // Wheel in the content padding, where YARL scroll-to-zoom does not consume it.
    await page.mouse.move(before.x, before.y);
    await page.mouse.wheel(0, 600, {
      label: 'view the lower edge in a short viewer',
    });
    await page.waitForFunction(() => {
      const image = document.querySelector(
        '[data-testid="share-viewer-stage"]',
      );
      const scroller = image.parentElement.parentElement;
      return (
        scroller.scrollTop > 0 &&
        image.getBoundingClientRect().bottom <=
          scroller.getBoundingClientRect().bottom + 1
      );
    });
    const after = await shortScrollState(page);
    assert.ok(
      after.scroll > before.scroll,
      'Actual wheel input scrolls the image content',
    );
    const controls = await page.evaluate(() =>
      ['close', 'previous', 'next', 'zoom'].map((action) => {
        const rectangle = document
          .querySelector(`[data-testid="share-viewer-${action}"]`)
          .getBoundingClientRect();
        return {
          action,
          width: rectangle.width,
          height: rectangle.height,
          left: rectangle.left,
          right: rectangle.right,
          top: rectangle.top,
          bottom: rectangle.bottom,
        };
      }),
    );
    for (const control of controls) {
      assert.ok(control.width >= 44 && control.height >= 44);
      assert.ok(
        control.left >= 0 &&
          control.right <= 390 &&
          control.top >= 0 &&
          control.bottom <= 420,
        `${control.action} stays fully reachable during short viewport scrolling`,
      );
    }
    const screenshot = `sharing-viewer-short-viewport-scrolled-${theme}-390x420.png`;
    await page.screenshot({ path: join(config.output, screenshot) });
    report.layouts.push({
      state: 'short-viewport-scrolled',
      width: 390,
      height: 420,
      theme,
      screenshot,
      geometry: { scroll: after, controls },
    });
    await page.mouse.move(after.x, after.y);
    await page.mouse.wheel(0, -600, {
      label: 'return to the upper edge of the image',
    });
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="share-viewer-stage"]')
          .parentElement.parentElement.scrollTop === 0,
    );
    record(
      'Actual short viewport scrolling reaches both image edges while the fixed controls stay usable',
      { width: 390, height: 420, theme, before, after },
    );
  }
  await close();
  await resizeViewport(page, 390);

  await session.updateShare({ show_name: 0, layout: 'grid' });
  await waitForPaint(page);
}

async function scrollPosition(page) {
  return page.evaluate(
    () =>
      document.querySelector('[data-share-scroll]')?.scrollTop ??
      document.scrollingElement.scrollTop,
  );
}
async function assertZoomLayout(page, record, detail) {
  const layout = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="share-viewer"]');
    const heading = root.querySelector('p[aria-live="polite"]');
    const headingRectangle = heading?.getBoundingClientRect();
    const headingParentRectangle =
      heading?.parentElement.getBoundingClientRect();
    const stage = root.querySelector('[data-testid="share-viewer-stage"]');
    const stageRectangle = stage.getBoundingClientRect();
    const wrapper = getComputedStyle(stage.parentElement);
    const instruction = [...root.querySelectorAll('p')].find((node) =>
      node.textContent.includes('拖动'),
    );
    const instructionRectangle = instruction?.getBoundingClientRect();
    return {
      zoom: Number(root.getAttribute('data-zoom')),
      heading: heading?.textContent,
      centered:
        !!headingRectangle &&
        getComputedStyle(heading).textAlign === 'center' &&
        Math.abs(
          headingRectangle.left +
            headingRectangle.width / 2 -
            (headingParentRectangle.left + headingParentRectangle.width / 2),
        ) <= 1,
      fullscreen: !!root.querySelector(
        '[data-testid="share-viewer-fullscreen"]',
      ),
      previous: !!root.querySelector('[data-testid="share-viewer-previous"]'),
      next: !!root.querySelector('[data-testid="share-viewer-next"]'),
      padding: [
        wrapper.paddingTop,
        wrapper.paddingRight,
        wrapper.paddingBottom,
        wrapper.paddingLeft,
      ],
      buttons: [...root.querySelectorAll('button')]
        .filter((node) => node.getClientRects().length)
        .map((node) => node.textContent.trim()),
      instruction: instruction?.textContent,
      instructionVisible:
        !!instructionRectangle &&
        instructionRectangle.width > 16 &&
        instructionRectangle.height >= 16 &&
        instructionRectangle.top >= stageRectangle.bottom - 1 &&
        instructionRectangle.bottom <= innerHeight &&
        !instruction.closest('[hidden],[inert],[aria-hidden="true"]'),
    };
  });
  record('Approved enlarged viewer layout observation', { ...detail, layout });
  assert.ok(layout.zoom > 1, 'The captured viewer remains enlarged');
  assert.match(layout.heading, /\d+\s*\/\s*\d+\s*·\s*已放大/);
  assert.equal(
    layout.centered,
    true,
    'The enlarged position label is centered',
  );
  assert.equal(
    layout.fullscreen,
    false,
    'Enlarged mode has no fullscreen entry',
  );
  assert.equal(layout.previous, false);
  assert.equal(layout.next, false);
  assert.deepEqual(
    layout.padding,
    ['0px', '0px', '0px', '0px'],
    'Enlarged image stage removes the ordinary 15px inset',
  );
  assert.deepEqual(layout.buttons, ['关闭', '还原']);
  assert.equal(
    layout.instructionVisible,
    true,
    'The enlarged viewer displays its dragging instruction below the stage',
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
        zoom: root.querySelector('[data-testid="share-viewer-zoom"]')
          .textContent,
      };
    }),
    { imageId, previous: true, next: true, zoom: '放大' },
    'Restore keeps the current image and returns ordinary navigation controls',
  );
}
async function assertNamedLayout(page, record, name, detail) {
  const layout = await page.evaluate((name) => {
    const root = document.querySelector('[data-testid="share-viewer"]');
    const title = [...root.querySelectorAll('p')].find(
      (node) => node.textContent === name,
    );
    const rectangle = title?.getBoundingClientRect();
    const stage = root
      .querySelector('[data-testid="share-viewer-stage"]')
      .getBoundingClientRect();
    return {
      name: title?.textContent,
      visible:
        !!rectangle &&
        rectangle.width > 0 &&
        rectangle.height >= 16 &&
        rectangle.left >= 0 &&
        rectangle.right <= innerWidth &&
        rectangle.top >= 0 &&
        rectangle.bottom <= stage.top &&
        !title.closest('[hidden],[inert],[aria-hidden="true"]'),
      alt: root.querySelector('.yarl__slide_current img')?.getAttribute('alt'),
      rectangle: rectangle && {
        left: rectangle.left,
        right: rectangle.right,
        top: rectangle.top,
        bottom: rectangle.bottom,
      },
      stageTop: stage.top,
    };
  }, name);
  record('Name-enabled viewer layout observation', { ...detail, layout });
  assert.equal(layout.name, name);
  assert.equal(
    layout.visible,
    true,
    'The enabled name is readable above the image without overlap or clipping',
  );
  assert.equal(layout.alt, name, 'The current image uses the enabled name');
}
async function zoomState(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="share-viewer-stage"] img')]
      .map((image) => image.getBoundingClientRect().width)
      .join(','),
  );
}
async function recordFullscreenFocus(page, record, phase) {
  const focus = await page.evaluate(() => {
    const node = document.activeElement;
    const root = document.querySelector('[data-testid="share-viewer"]');
    const rectangle = node?.getBoundingClientRect();
    const style = node && getComputedStyle(node);
    return {
      tag: node?.tagName,
      className: node?.className,
      testId: node?.getAttribute('data-testid'),
      insideViewer: !!node && root.contains(node),
      control: !!node?.matches('button,[role="button"],a,input'),
      stage: !!node?.closest('[data-testid="share-viewer-stage"]'),
      visible:
        !!rectangle &&
        rectangle.width > 0 &&
        rectangle.height > 0 &&
        rectangle.right > 0 &&
        rectangle.left < innerWidth &&
        rectangle.bottom > 0 &&
        rectangle.top < innerHeight &&
        style.visibility !== 'hidden' &&
        !node.closest('[inert],[aria-hidden="true"]'),
    };
  });
  record('Native fullscreen transition focus observation without refocusing', {
    phase,
    focus,
  });
  assert.ok(
    focus.insideViewer && focus.visible && (focus.control || focus.stage),
    `${phase}: fullscreen transitions keep focus on a visible viewer control or stage; BODY is a failure`,
  );
}
async function shortScrollState(page) {
  return page.evaluate(() => {
    const image = document.querySelector('[data-testid="share-viewer-stage"]');
    const scroller = image.parentElement.parentElement;
    const rectangle = scroller.getBoundingClientRect();
    const imageRectangle = image.getBoundingClientRect();
    return {
      scroll: scroller.scrollTop,
      maximum: scroller.scrollHeight - scroller.clientHeight,
      top: rectangle.top,
      bottom: rectangle.bottom,
      imageTop: imageRectangle.top,
      imageBottom: imageRectangle.bottom,
      x: rectangle.left + 8,
      y: rectangle.top + rectangle.height / 2,
    };
  });
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
