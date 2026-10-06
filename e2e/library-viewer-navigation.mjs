import assert from 'node:assert/strict';
import {
  viewerId,
  viewerName,
  viewerQuery,
} from './library-viewer-fixtures.mjs';
import { setDetail171Viewport } from './library-detail-171-helpers.mjs';
import {
  button,
  closeViewer,
  entry,
  findViewerCard,
  monitorViewerRequests,
  openViewerSource,
  restoreViewerFetch,
  settleViewer,
  viewerState,
  waitViewerImage,
  waitViewerNeighbors,
} from './library-viewer-helpers.mjs';

export async function verifyViewerNavigation({ page, config, report }) {
  report.stage = 'navigation:viewport-390x400';
  await setDetail171Viewport(page, 390, 400);
  report.stage = 'navigation:source-query-load';
  await page.goto(`${config.origin}/library?${viewerQuery}`);
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="library-list"]')?.dataset
        .loadedCount === '20',
  );
  const savedLayout = await page.evaluate(
    () => document.querySelector('[data-testid="library-list"]').dataset.layout,
  );
  report.stage = 'navigation:source-layout-control';
  await page.evaluate(() => {
    const main = document.querySelector('main');
    const mainRect = main.getBoundingClientRect();
    const radioRect = document
      .querySelector('[role="radio"][aria-label="瀑布流"]')
      .getBoundingClientRect();
    main.scrollTop +=
      radioRect.top +
      radioRect.height / 2 -
      (mainRect.top + mainRect.height / 2);
  });
  await settleViewer(page);
  const layoutControl = await page.evaluate(() => {
    const control = document.querySelector(
      '[role="radio"][aria-label="瀑布流"]',
    );
    const rect = control.getBoundingClientRect();
    const hit = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );
    return {
      scrollTop: document.querySelector('main').scrollTop,
      reachable: control === hit || control.contains(hit),
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  });
  assert.equal(
    layoutControl.reachable,
    true,
    'Visible layout radio receives pointer input before the source scenario',
  );
  report.navigationLayoutControl = layoutControl;
  await page.click('loc=role:radio[name="瀑布流"]');
  report.stage = 'navigation:source-card-selection-and-detail';
  await findViewerCard(page, 19);
  const source = button(`查看图片：${viewerName(19)}`);
  try {
    await page.hover(source);
  } catch (error) {
    report.navigationSourceFailure = await page.evaluate(
      (name) => {
        const source = [
          ...document.querySelectorAll('[data-library-open]'),
        ].find((node) => node.getAttribute('aria-label') === name);
        const main = document.querySelector('main');
        return {
          at: performance.now(),
          scrollTop: main?.scrollTop,
          source: source?.getBoundingClientRect().toJSON(),
          checkbox: source
            ?.closest('[data-image-id]')
            ?.querySelector('label')
            ?.getBoundingClientRect()
            .toJSON(),
          main: main?.getBoundingClientRect().toJSON(),
        };
      },
      `查看图片：${viewerName(19)}`,
    );
    throw error;
  }
  await page.click(
    `label:has(input[aria-label="选择图片：${viewerName(19)}"])`,
  );
  await page.waitForSelector('[data-testid="library-selection"]');
  await page.focus(source);
  const before = await page.evaluate(() => ({
    url: location.href,
    scroll: document.querySelector('main').scrollTop,
    layout: document.querySelector('[data-testid="library-list"]').dataset
      .layout,
    selection: document.querySelector('[data-testid="library-selection"]')
      .textContent,
  }));
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-testid="detail-body"]');
  const detailUrl = await page.url();
  await page.evaluate(() => {
    const body = document.querySelector('[data-testid="detail-body"]');
    body.scrollTop = body.scrollHeight;
    const entry = document.querySelector('[data-testid="detail-viewer-entry"]');
    const record = () => {
      window.__viewerDetailScroll = body.scrollTop;
    };
    entry.addEventListener('pointerdown', record, {
      capture: true,
      once: true,
    });
    entry.addEventListener('click', record, { capture: true, once: true });
  });
  await monitorViewerRequests(page);
  try {
    report.stage = 'navigation:initial-neighbor-window';
    await page.click(entry);
    await waitViewerImage(page, viewerId(19), 'compressed');
    const initialNeighbors = await waitViewerNeighbors(page, viewerId(19));
    assert.equal(initialNeighbors.previous.id, viewerId(18));
    assert.equal(initialNeighbors.next.id, viewerId(20));
    report.navigationSequence = [
      { input: 'open', ...(await viewerState(page)) },
    ];
    const windowState = await page.evaluate(() => ({
      requests: window.__viewerRequests,
      imageIds: [
        ...new Set(
          performance
            .getEntriesByType('resource')
            .map((item) => new URL(item.name))
            // Visible list thumbnails can finish after timing reset. This
            // source viewer uses compressed throughout, so exclude those.
            .filter(
              (url) =>
                url.pathname.startsWith('/i/') &&
                url.searchParams.get('type') !== 'thumbnail',
            )
            .map((url) => url.pathname)
            .map((path) => path.split('/')[2]),
        ),
      ],
      slides: document.querySelectorAll(
        '[data-testid="image-viewer"] .yarl__slide',
      ).length,
      optimized: performance
        .getEntriesByType('resource')
        .some((item) => new URL(item.name).pathname === '/_next/image'),
    }));
    assert.ok(
      windowState.slides <= 3,
      'Only current and two adjacent slides are mounted',
    );
    assert.ok(
      windowState.imageIds.length <= 3,
      'No more than current and each adjacent image is requested',
    );
    assert.ok(
      windowState.imageIds.every((id) =>
        [viewerId(18), viewerId(19), viewerId(20)].includes(id),
      ),
      'No image beyond the neighbor window is preloaded',
    );
    assert.equal(
      windowState.requests.some((request) => request.path === '/api/images'),
      false,
      'Viewer does not fetch all matching results',
    );
    assert.equal(windowState.optimized, false);
    const neighbors = windowState.requests.find((request) =>
      request.path.endsWith('/neighbors'),
    );
    assert.equal(
      new URLSearchParams(neighbors.query).get('q'),
      'issue185-query-',
    );
    assert.equal(
      new URLSearchParams(neighbors.query).get('visibility'),
      'private',
    );
    assert.equal(
      new URLSearchParams(neighbors.query).get('sort'),
      'uploaded_asc',
    );
    report.preload = windowState;
    report.stage = 'navigation:cross-page-keyboard';
    await page.keyboard.press('ArrowRight');
    await waitViewerImage(page, viewerId(20), 'compressed');
    report.navigationSequence.push({
      input: 'ArrowRight',
      ...(await viewerState(page)),
    });
    assert.equal(
      await page.url(),
      detailUrl,
      'Cross-page viewer navigation preserves underlying image/page URL',
    );
    for (let index = 21; index < 25; index++) {
      const adjacent = await waitViewerNeighbors(page, viewerId(index - 1));
      assert.equal(adjacent.previous.id, viewerId(index - 2));
      assert.equal(adjacent.next.id, viewerId(index));
      await page.keyboard.press('ArrowRight');
      await waitViewerImage(page, viewerId(index), 'compressed');
      assert.equal(await page.url(), detailUrl);
      report.navigationSequence.push({
        input: 'ArrowRight',
        ...(await viewerState(page)),
      });
    }
    assert.equal((await waitViewerNeighbors(page, viewerId(24))).next, null);
    await page.keyboard.press('ArrowRight');
    await settleViewer(page);
    assert.equal(
      (await viewerState(page)).id,
      viewerId(24),
      'Last image never loops',
    );
    assert.equal(
      await page.evaluate(
        () => !!document.activeElement?.closest('[data-testid="image-viewer"]'),
      ),
      true,
      'Reaching the last-image boundary keeps keyboard focus inside the viewer',
    );
    report.stage = 'navigation:reverse-after-continuous-next';
    await page.keyboard.press('ArrowLeft');
    await waitViewerImage(page, viewerId(23), 'compressed');
    const reverseNeighbors = await waitViewerNeighbors(page, viewerId(23));
    assert.equal(reverseNeighbors.previous.id, viewerId(22));
    assert.equal(reverseNeighbors.next.id, viewerId(24));
    assert.equal(await page.url(), detailUrl);
    report.navigationSequence.push({
      input: 'ArrowLeft',
      ...(await viewerState(page)),
    });
    await page.keyboard.press('ArrowRight');
    await waitViewerImage(page, viewerId(24), 'compressed');
    assert.equal(await page.url(), detailUrl);
    report.navigationSequence.push({
      input: 'ArrowRight',
      ...(await viewerState(page)),
    });
    const queries = await page.evaluate(() =>
      window.__viewerRequests
        .filter((request) => request.path.endsWith('/neighbors'))
        .map((request) => ({ path: request.path, query: request.query })),
    );
    for (const request of queries) {
      const params = new URLSearchParams(request.query);
      assert.equal(params.get('q'), 'issue185-query-');
      assert.equal(params.get('visibility'), 'private');
      assert.equal(params.get('sort'), 'uploaded_asc');
    }
    report.navigationQueries = queries;
    report.stage = 'navigation:tab-containment-after-continuous-navigation';
    report.keyboardFocus ??= [];
    for (const key of [
      'Tab',
      'Tab',
      'Tab',
      'Shift+Tab',
      'Shift+Tab',
      'Shift+Tab',
    ]) {
      await page.keyboard.press(key);
      await settleViewer(page);
      const focus = await page.evaluate(() => ({
        tag: document.activeElement?.tagName,
        label: document.activeElement?.getAttribute('aria-label'),
        inViewer: !!document.activeElement?.closest(
          '[data-testid="image-viewer"]',
        ),
      }));
      report.keyboardFocus.push({
        context: 'filtered-sequence',
        key,
        ...focus,
      });
      assert.equal(
        focus.inViewer,
        true,
        `${key} stays inside the browsing viewer`,
      );
    }
    report.stage = 'navigation:escape-and-entry-focus';
    await closeViewer(page, true);
    report.stage = 'navigation:source-detail-scroll-and-list-return';
    const detailScroll = await page.evaluate(() => {
      const body = document.querySelector('[data-testid="detail-body"]');
      return {
        before: window.__viewerDetailScroll,
        current: body.scrollTop,
        maximum: body.scrollHeight - body.clientHeight,
      };
    });
    assert.ok(
      detailScroll.before > 0,
      'The source detail body actually scrolled before opening',
    );
    assert.ok(
      Math.abs(
        detailScroll.current -
          Math.min(detailScroll.before, detailScroll.maximum),
      ) <= 1,
      'Close restores source detail body scroll as well as entry focus',
    );
    report.detailBodyScroll = detailScroll;
    assert.equal(await page.url(), detailUrl);
    await page.click(button('关闭图片详情'));
    await page.waitForFunction(
      () => !new URL(location.href).searchParams.has('image'),
    );
    assert.equal(await page.url(), before.url);
    await page.waitForFunction(
      (name) =>
        document.activeElement?.getAttribute('aria-label') ===
        `查看图片：${name}`,
      viewerName(19),
    );
    const returned = await page.evaluate(
      (name) => ({
        scroll: document.querySelector('main').scrollTop,
        layout: document.querySelector('[data-testid="library-list"]').dataset
          .layout,
        selection: document.querySelector('[data-testid="library-selection"]')
          .textContent,
        checked: document.querySelector(`input[aria-label="选择图片：${name}"]`)
          ?.checked,
        loaded: document.querySelector('[data-testid="library-list"]').dataset
          .loadedCount,
      }),
      viewerName(19),
    );
    assert.ok(
      Math.abs(returned.scroll - before.scroll) <= 1,
      'Source scroll is restored',
    );
    assert.equal(returned.layout, before.layout);
    assert.equal(returned.selection, before.selection);
    assert.equal(returned.checked, true);
    assert.equal(returned.loaded, '20');
  } finally {
    await restoreViewerFetch(page);
  }
  await openViewerSource(page, config, 0);
  report.stage = 'navigation:first-boundary';
  assert.equal((await waitViewerNeighbors(page, viewerId(0))).previous, null);
  await page.keyboard.press('ArrowLeft');
  await settleViewer(page);
  assert.equal(
    (await viewerState(page)).id,
    viewerId(0),
    'First image never loops',
  );
  await closeViewer(page);
  await page.click(button('关闭图片详情'));
  if (savedLayout === 'grid') await page.click('loc=role:radio[name="网格"]');
  report.checks.push(
    'A real filtered private uploaded_asc query crosses page 1 index 19→20, advances five consecutive times to 24, returns to 23 with ArrowLeft and advances again to 24. Each current image uses the actual delivery URL, every neighbor request retains search/visibility/sort, and actual adjacent IDs follow the ascending order. First/last boundaries never loop. Only three slides/current±1 delivery requests are allowed. After three Tab and three Shift+Tab operations keep focus inside, Escape restores original detail entry, then closing detail restores exact selected source card focus/scroll, URL page, masonry layout and selection without loading page 2 into the list.',
  );
}
