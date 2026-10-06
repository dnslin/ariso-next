import assert from 'node:assert/strict';
import { resizeViewport } from './browser-geometry.mjs';
import { waitForPaint } from './sharing-public-page.mjs';
import { viewer } from './sharing-viewer-page.mjs';

async function holdNeighbor(page, imageId) {
  await page.evaluate((id) => {
    const original = window.fetch;
    let held = false;
    window.__viewerHeld = null;
    window.__releaseViewer = null;
    window.fetch = async (...args) => {
      const url = new URL(String(args[0]), location.origin);
      if (!held && url.searchParams.get('imageId') === id) {
        held = true;
        const response = await original(...args);
        window.__viewerHeld = await response.clone().json();
        await new Promise((resolve) => {
          window.__releaseViewer = resolve;
        });
        return response;
      }
      return original(...args);
    };
  }, imageId);
}

export async function verifySharingViewerRaces({
  page,
  config,
  report,
  session,
  viewing,
}) {
  report.stage = 'viewer-races';
  const { open, close, current, imageLoaded, capture, record } = viewing;
  await resizeViewport(page, 1440);
  await session.updateShare({ enabled: 1, show_name: 1, layout: 'grid' });
  await session.open();
  await session.loaded(40);
  await open();
  await imageLoaded();
  await holdNeighbor(page, config.publicIds[7]);
  await page.click('[data-testid="share-viewer-next"]');
  await page.waitForFunction(() => !!window.__releaseViewer);
  assert.ok(
    await page.evaluate(() => !!window.__viewerHeld.current.displayName),
    'The held real neighbor response contains the old visible name',
  );
  for (const width of [390, 1440]) {
    for (const theme of ['light', 'dark']) {
      await capture('neighbor-loading', [width], [theme]);
      const loading = await page.evaluate(() => {
        const root = document.querySelector('[data-testid="share-viewer"]');
        const status = [...root.querySelectorAll('[role="status"]')].find(
          (node) => node.textContent.includes('正在读取图片'),
        );
        const rectangle = status?.getBoundingClientRect();
        const style = status && getComputedStyle(status);
        return {
          text: status?.textContent,
          visible:
            !!rectangle &&
            rectangle.width > 16 &&
            rectangle.height >= 16 &&
            rectangle.top >= 0 &&
            rectangle.bottom <= innerHeight &&
            style.visibility !== 'hidden' &&
            !status.closest('[hidden],[inert],[aria-hidden="true"]'),
          background: style?.backgroundColor,
          currentImage: root.getAttribute('data-image-id'),
          heldName: window.__viewerHeld.current.displayName,
        };
      });
      record('Actual held neighbor loading status observation', {
        width,
        theme,
        loading,
      });
      assert.equal(
        loading.visible,
        true,
        'Loading shows a readable status rather than screen-reader-only text',
      );
      assert.ok(
        ['transparent', 'rgba(0, 0, 0, 0)'].includes(loading.background),
        'The loading status uses neutral text without a colored block',
      );
      assert.equal(loading.currentImage, config.publicIds[6]);
      assert.ok(loading.heldName, 'The pending response retains its real name');
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
  await page.evaluate(() => window.__releaseViewer());
  await waitForPaint(page);
  await session.hiddenNames();
  await current(config.publicIds[6]);
  record(
    'A late named neighbor response cannot restore names or advance an obsolete navigation after showName turns off',
  );
  await close();

  await session.open();
  await session.loaded(40);
  await open();
  await holdNeighbor(page, config.publicIds[7]);
  await page.click('[data-testid="share-viewer-next"]');
  await page.waitForFunction(() => !!window.__releaseViewer);
  await close();
  await open(config.publicIds[8]);
  await page.evaluate(() => window.__releaseViewer());
  await waitForPaint(page);
  await current(config.publicIds[8]);
  record(
    'Closing and opening a different image ignores the previous late neighbor result',
  );
  await close();

  await session.open();
  await session.loaded(40);
  await open();
  await page.evaluate(() => {
    const original = window.fetch;
    window.__viewerErrorInjected = false;
    window.fetch = async (...args) => {
      if (
        !window.__viewerErrorInjected &&
        String(args[0]).includes('items?imageId=')
      ) {
        window.__viewerErrorInjected = true;
        return new Response(JSON.stringify({ code: 'INTERNAL_SERVER_ERROR' }), {
          status: 503,
          headers: { 'content-type': 'application/json' },
        });
      }
      return original(...args);
    };
  });
  await page.click('[data-testid="share-viewer-next"]');
  await page.waitForSelector('[data-testid="share-viewer-error"]');
  report.expectedConsoleErrors ??= [];
  report.expectedConsoleErrors.push('分享大图读取失败 [object Object]');
  await capture('neighbor-error', [390, 1440], ['light', 'dark']);
  await page.click(
    '[data-testid="share-viewer-error"] button:has-text("重新加载")',
  );
  await current(config.publicIds[7]);
  await imageLoaded();
  record(
    'Neighbor HTTP failure shows the approved recovery page, preserves selected target, and real retry opens that target',
  );
  await close();

  await session.open();
  await session.loaded(40);
  await open();
  await page.evaluate(() => {
    const original = window.fetch;
    window.__viewerRefreshCalls = 0;
    window.__viewerManualRefreshCalls = 0;
    window.__viewerRetryEvent = null;
    window.__viewerAllowRefresh = false;
    window.fetch = async (...args) => {
      if (String(args[0]).endsWith('/refresh')) {
        window.__viewerRefreshCalls++;
        if (window.event && window.event === window.__viewerRetryEvent)
          window.__viewerManualRefreshCalls++;
        if (!window.__viewerAllowRefresh) {
          return new Response(
            JSON.stringify({ code: 'INTERNAL_SERVER_ERROR' }),
            { status: 503, headers: { 'content-type': 'application/json' } },
          );
        }
      }
      return original(...args);
    };
  });
  await page.waitForSelector('[data-testid="share-viewer-check"]', {
    timeout: 15000,
  });
  report.expectedConsoleErrors.push('分享状态检查失败 [object Object]');
  await capture('status-check-error', [390, 1440], ['light', 'dark']);
  const failedChecks = await page.evaluate(() => window.__viewerRefreshCalls);
  await page.evaluate(() => {
    const button = document.querySelector('[data-testid="share-viewer-check"]');
    button.addEventListener(
      'pointerdown',
      () => {
        window.__viewerAllowRefresh = true;
      },
      { once: true, capture: true },
    );
    button.addEventListener(
      'click',
      (event) => {
        window.__viewerRetryEvent = event;
      },
      { once: true, capture: true },
    );
  });
  await page.click('[data-testid="share-viewer-check"]');
  const manualPosts = await page.evaluate(
    () => window.__viewerManualRefreshCalls,
  );
  record('Real retry button refresh POST dispatch observation', {
    manualPosts,
  });
  assert.ok(
    manualPosts > 0,
    'The real retry button activation itself dispatches a refresh POST, independent of automatic polling',
  );
  await page.waitForFunction(
    (before) => window.__viewerRefreshCalls > before,
    failedChecks,
  );
  await page.waitForSelector('[data-testid="share-viewer-check"]', {
    state: 'hidden',
  });
  await current(config.publicIds[6]);
  record(
    'A failed status POST preserves current content; its retry sends a new real refresh POST and clears the warning after successful state reconciliation',
    { manualPosts },
  );
  await close();

  await session.open();
  await session.loaded(40);
  await open();
  await holdNeighbor(page, config.publicIds[7]);
  await page.click('[data-testid="share-viewer-next"]');
  await page.waitForFunction(() => !!window.__releaseViewer);
  await session.updateShare({ enabled: 0 });
  await page.waitForSelector('[data-testid="share-state"]');
  await page.waitForSelector(viewer, { state: 'hidden' });
  await page.evaluate(() => window.__releaseViewer());
  await waitForPaint(page);
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelectorAll(
          '[data-share-item], [data-testid="share-viewer"]',
        ).length,
    ),
    0,
  );
  assert.deepEqual(
    await page.evaluate((name) => {
      const text = document.querySelector('main').textContent;
      const attributes = [
        ...document.querySelectorAll('[alt],[title],[aria-label]'),
      ].flatMap((node) =>
        ['alt', 'title', 'aria-label'].map(
          (attribute) => node.getAttribute(attribute) ?? '',
        ),
      );
      return {
        text: text.includes(name),
        attributes: attributes.some((value) => value.includes(name)),
      };
    }, config.albums.public.name),
    { text: false, attributes: false },
  );
  record(
    'A held authorized neighbor response cannot refill album data after share revocation',
  );
  await session.updateShare({ enabled: 1 });
}
