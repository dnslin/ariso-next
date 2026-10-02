import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import {
  viewerId,
  viewerName,
  viewerQuery,
  viewerStorage,
} from './library-viewer-fixtures.mjs';
import {
  setDetail171Theme,
  setDetail171Viewport,
} from './library-detail-171-helpers.mjs';
import {
  button,
  closeViewer,
  entry,
  findViewerCard,
  monitorViewerRequests,
  openViewerDirect,
  openViewerSource,
  restoreViewerFetch,
  settleViewer,
  viewer,
  viewerShot,
  viewerState,
  waitViewerImage,
  waitViewerNeighbors,
} from './library-viewer-helpers.mjs';
import { verifyViewerLayouts } from './library-viewer-layouts.mjs';

async function notifyViewer(page) {
  await page.evaluate(() => {
    const channel = new BroadcastChannel('ariso:library-changed');
    channel.postMessage('changed');
    channel.close();
  });
}

export async function verifyViewerRecovery(context) {
  const { page, config, sql, report } = context;
  await setDetail171Viewport(page, 390);
  await page.cdp('Network.enable');
  await page.cdp('Network.setCacheDisabled', { cacheDisabled: true });
  try {
    await openViewerDirect(page, config, 'issue185-unreadable');
    await page.waitForFunction(() =>
      document
        .querySelector(
          '[data-testid="image-viewer"] .yarl__slide_current [data-testid="viewer-placeholder"]',
        )
        ?.textContent.includes('失败'),
    );
    assert.equal((await viewerState(page)).kind, 'compressed');
    assert.equal(
      await page.evaluate(() =>
        [...document.querySelectorAll('[data-testid="image-viewer"] img')].some(
          (image) => /type=(original|thumbnail)/.test(image.src),
        ),
      ),
      false,
      'Missing real compressed file does not fallback',
    );
    await verifyViewerLayouts(context, 'delivery-error', true);
    await closeViewer(page);

    await openViewerDirect(page, config, 'issue185-empty');
    await page.waitForSelector(
      `${viewer} .yarl__slide_current [data-testid="viewer-placeholder"]`,
    );
    assert.match((await viewerState(page)).placeholder, /保存|不存在|生成/);
    const candidate = await page.fetch('/i/issue185-empty?type=compressed');
    assert.equal(candidate.status, 404);
    assert.equal(
      JSON.parse(candidate.body).code,
      'VERSION_UNAVAILABLE',
      'Real stored but unpublished candidate bytes are not readable',
    );
    await verifyViewerLayouts(context, 'no-readable-version', true);
    await closeViewer(page);

    report.stage = 'recovery:loading-fresh-response-setup';
    const loadingId = 'issue185-loading';
    const loadingUrl = new URL(`/i/${loadingId}?type=compressed`, config.origin)
      .href;
    report.loading = {
      url: loadingUrl,
      previouslyCompleted: await page.evaluate(
        (url) =>
          performance
            .getEntriesByType('resource')
            .some((entry) => entry.name === url),
        loadingUrl,
      ),
      pausedResponses: [],
      requests: [],
      browserEvents: [],
    };
    assert.equal(
      report.loading.previouslyCompleted,
      false,
      'Independent compressed delivery has not been read by an earlier scenario',
    );
    // Keep earlier intentionally failing resource events distinct from this
    // fresh, successful delivery. Every drained browser error stays recorded.
    report.loading.priorBrowserEvents = (await page.events()).filter(
      ({ method }) =>
        ['Runtime.bindingCalled', 'Runtime.exceptionThrown'].includes(method),
    );
    const paused = new Set();
    async function collectLoadingEvents() {
      for (const { method, params } of await page.events()) {
        if (
          method === 'Fetch.requestPaused' &&
          params.request.url === loadingUrl
        ) {
          paused.add(params.requestId);
          report.loading.pausedResponses.push({
            requestId: params.requestId,
            networkId: params.networkId,
            url: params.request.url,
            status: params.responseStatusCode,
            headers: params.responseHeaders,
          });
        } else if (
          method === 'Network.requestWillBeSent' &&
          params.request.url === loadingUrl
        ) {
          report.loading.requests.push({
            requestId: params.requestId,
            url: params.request.url,
            type: params.type,
            timestamp: params.timestamp,
          });
        } else if (
          ['Runtime.bindingCalled', 'Runtime.exceptionThrown'].includes(method)
        ) {
          report.loading.browserEvents.push({ method, params });
        }
      }
    }
    await page.cdp('Fetch.enable', {
      patterns: [{ urlPattern: loadingUrl, requestStage: 'Response' }],
    });
    try {
      report.stage = 'recovery:loading-real-response-paused';
      // DOMContentLoaded lets the real response remain in flight while the
      // default detail preview and then the viewer mount the same saved kind.
      await page.goto(`${config.origin}/library?image=${loadingId}`, {
        waitUntil: 'domcontentloaded',
      });
      await page.waitForSelector('[data-testid="detail-body"]');
      const deadline = Date.now() + 10000;
      while (!paused.size && Date.now() < deadline) {
        await collectLoadingEvents();
        if (!paused.size) await setTimeout(50);
      }
      assert.ok(
        paused.size,
        'The actual compressed response reaches the existing Fetch pause boundary within 10 seconds',
      );
      const response = await page.fetch(`/api/images/${loadingId}`);
      assert.equal(response.status, 200);
      const version = JSON.parse(response.body).versions.find(
        (version) => version.kind === 'compressed',
      );
      const held = report.loading.pausedResponses[0];
      const header = (name) =>
        held.headers.find((header) => header.name.toLowerCase() === name)
          ?.value;
      assert.equal(held.status, 200);
      assert.equal(header('content-type'), version.mime);
      assert.equal(Number(header('content-length')), version.byteSize);
      report.loading.detail = await page.evaluate(() => {
        const image = document.querySelector('[data-testid="detail-preview"]');
        return {
          src: image?.src,
          complete: image?.complete,
          naturalWidth: image?.naturalWidth,
          selected: document
            .querySelector(
              '[data-testid="detail-body"] [role="tab"][aria-selected="true"]',
            )
            ?.textContent.trim(),
        };
      });
      assert.equal(report.loading.detail.src, loadingUrl);
      assert.equal(
        report.loading.detail.naturalWidth,
        0,
        'Paused real bytes have not populated the decoded image cache',
      );
      assert.equal(report.loading.detail.complete, false);
      assert.equal(report.loading.detail.selected, '压缩图');
      report.stage = 'recovery:loading-viewer-skeleton';
      await page.click(entry);
      await page.waitForSelector(
        `${viewer} .yarl__slide_current [aria-label="正在加载图片"]`,
      );
      const state = await viewerState(page);
      assert.equal(state.id, loadingId);
      assert.equal(state.kind, 'compressed');
      assert.equal(state.decoded, false);
      await viewerShot(page, config, report, 'real-delivery-loading-390');
      await collectLoadingEvents();
      assert.ok(
        report.loading.requests.some((request) => request.type === 'Image'),
        'CDP records the actual compressed Image request',
      );
      assert.deepEqual(
        report.loading.browserEvents,
        [],
        'The held successful delivery has no browser runtime or resource error',
      );
      report.stage = 'recovery:loading-release-and-decode';
      for (const requestId of paused)
        await page.cdp('Fetch.continueRequest', { requestId });
      paused.clear();
      await waitViewerImage(page, loadingId, 'compressed');
      await page.waitForSelector(
        `${viewer} .yarl__slide_current [aria-label="正在加载图片"]`,
        { state: 'hidden', timeout: 10000 },
      );
      report.loading.skeletonHidden = await page.evaluate(
        () =>
          document.querySelector(
            '[data-testid="image-viewer"] .yarl__slide_current [aria-label="正在加载图片"]',
          ) === null,
      );
      assert.equal(
        report.loading.skeletonHidden,
        true,
        'Natural decode removes the current loading Skeleton from the actual DOM',
      );
      report.loading.delivered = await page.evaluate(
        (url) =>
          performance
            .getEntriesByName(url)
            .filter((entry) => entry.entryType === 'resource')
            .map((entry) => ({
              name: entry.name,
              initiatorType: entry.initiatorType,
              responseStatus: entry.responseStatus,
              transferSize: entry.transferSize,
              encodedBodySize: entry.encodedBodySize,
              decodedBodySize: entry.decodedBodySize,
              duration: entry.duration,
            })),
        loadingUrl,
      );
      assert.ok(
        report.loading.delivered.some(
          (delivery) =>
            delivery.responseStatus === 200 &&
            delivery.transferSize > 0 &&
            delivery.encodedBodySize === version.byteSize,
        ),
        'A real network transfer of the stored compressed bytes completes before natural decoding succeeds',
      );
      await collectLoadingEvents();
      assert.deepEqual(report.loading.browserEvents, []);
    } finally {
      try {
        for (const requestId of paused)
          await page.cdp('Fetch.continueRequest', { requestId });
      } finally {
        await page.cdp('Fetch.disable');
      }
    }
    await closeViewer(page);

    report.stage = 'recovery:neighbors-transport-error';

    // Reject a real neighbor response, then retry the actual server response.
    await openViewerSource(page, config, 7);
    await monitorViewerRequests(page);
    await page.evaluate(() => {
      const original = window.fetch;
      let used = false;
      window.fetch = async (...args) => {
        const response = await original(...args);
        if (
          !used &&
          new URL(String(args[0]), location.href).pathname.endsWith(
            '/neighbors',
          )
        ) {
          used = true;
          throw new TypeError(
            'Verification: real neighbor response lost at fetch boundary',
          );
        }
        return response;
      };
    });
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForFunction(() =>
      document
        .querySelector('[data-testid="image-viewer"]')
        ?.textContent.includes('浏览上下文需要刷新'),
    );
    await waitViewerImage(page, viewerId(7), 'compressed');
    await viewerShot(page, config, report, 'neighbors-transport-error-390');
    await page.click(button('刷新浏览上下文'));
    await page.waitForFunction(
      () =>
        !document
          .querySelector('[data-testid="image-viewer"]')
          ?.textContent.includes('浏览上下文需要刷新'),
    );
    await restoreViewerFetch(page);
    await closeViewer(page);

    // Actual delivery rejection of an adjacent image must keep the current one.
    report.stage = 'recovery:adjacent-delivery-error';
    await page.cdp('Network.setBlockedURLs', {
      urls: [`*${'/i/'}${viewerId(8)}?type=compressed*`],
    });
    try {
      await openViewerSource(page, config, 7);
      await waitViewerNeighbors(page, viewerId(7));
      await page.keyboard.press('ArrowRight');
      await page.waitForSelector('[data-testid="viewer-navigation-error"]');
      await page.waitForFunction(() =>
        document
          .querySelector('[data-testid="viewer-navigation-error"]')
          ?.contains(document.activeElement),
      );
      const beforeArrows = await viewerState(page);
      assert.equal(beforeArrows.id, viewerId(7));
      assert.equal(beforeArrows.kind, 'compressed');
      await waitViewerImage(page, viewerId(7), 'compressed');
      const beforeArrowRequests = await page.evaluate(() => {
        window.__viewerErrorDialog = document.querySelector(
          '[data-testid="viewer-navigation-error"]',
        );
        return window.__viewerRequests.filter(
          (request) =>
            request.path.endsWith('/neighbors') ||
            ['/api/images/issue185-006', '/api/images/issue185-008'].includes(
              request.path,
            ),
        ).length;
      });
      report.errorDialogArrows = [];
      for (const key of ['ArrowLeft', 'ArrowRight']) {
        await page.keyboard.press(key);
        await settleViewer(page);
        const current = await viewerState(page);
        assert.equal(current.id, beforeArrows.id);
        assert.equal(current.kind, beforeArrows.kind);
        assert.equal(
          current.src,
          beforeArrows.src,
          'Arrow input in the failure dialog preserves the actual current image',
        );
        const dialog = await page.evaluate(() => {
          const current = document.querySelector(
            '[data-testid="viewer-navigation-error"]',
          );
          return {
            same: current === window.__viewerErrorDialog,
            focused: !!current?.contains(document.activeElement),
            requests: window.__viewerRequests.filter(
              (request) =>
                request.path.endsWith('/neighbors') ||
                [
                  '/api/images/issue185-006',
                  '/api/images/issue185-008',
                ].includes(request.path),
            ).length,
          };
        });
        assert.equal(dialog.same, true, 'The same failure dialog stays open');
        assert.equal(
          dialog.focused,
          true,
          'Focus stays inside the failure dialog',
        );
        assert.equal(
          dialog.requests,
          beforeArrowRequests,
          'Failure-dialog arrows never start background neighbor or target reads',
        );
        report.errorDialogArrows.push({ key, current, dialog });
      }
      for (const theme of ['light', 'dark']) {
        await setDetail171Theme(page, theme);
        for (const width of [390, 1440]) {
          await setDetail171Viewport(page, width);
          await viewerShot(
            page,
            config,
            report,
            `adjacent-error-${theme}-${width}`,
          );
          const targets = await page.evaluate(() =>
            [
              ...document.querySelectorAll(
                '[data-testid="viewer-navigation-error"] button',
              ),
            ].map((button) => {
              const rect = button.getBoundingClientRect();
              const hit = document.elementFromPoint(
                rect.x + rect.width / 2,
                rect.y + rect.height / 2,
              );
              return {
                name: button.textContent.trim(),
                width: rect.width,
                height: rect.height,
                inViewport:
                  rect.left >= 0 &&
                  rect.top >= 0 &&
                  rect.right <= innerWidth &&
                  rect.bottom <= innerHeight,
                reachable: button === hit || button.contains(hit),
              };
            }),
          );
          assert.deepEqual(
            targets.map((target) => target.name),
            ['返回当前图片', '关闭大图'],
          );
          assert.ok(
            targets.every(
              (target) =>
                target.width >= 44 &&
                target.height >= 44 &&
                target.inViewport &&
                target.reachable,
            ),
            'Error recovery actions are visible actual 44px pointer targets',
          );
          report.layouts.push({
            state: 'viewer-adjacent-error',
            theme,
            width,
            targets,
          });
        }
      }
      await page.click(button('返回当前图片'));
      await page.waitForSelector('[data-testid="viewer-navigation-error"]', {
        state: 'hidden',
      });
      await waitViewerImage(page, viewerId(7), 'compressed');
      report.stage = 'recovery:adjacent-error-escape-boundary';
      await page.keyboard.press('ArrowRight');
      await page.waitForSelector('[data-testid="viewer-navigation-error"]');
      await page.waitForFunction(() =>
        document
          .querySelector('[data-testid="viewer-navigation-error"]')
          ?.contains(document.activeElement),
      );
      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-testid="viewer-navigation-error"]', {
        state: 'hidden',
      });
      await settleViewer(page);
      const afterEscape = await viewerState(page);
      assert.equal(afterEscape.id, beforeArrows.id);
      assert.equal(afterEscape.kind, beforeArrows.kind);
      assert.equal(afterEscape.src, beforeArrows.src);
      assert.equal(afterEscape.decoded, true);
      const focusInViewer = await page.evaluate(
        () => !!document.activeElement?.closest('[data-testid="image-viewer"]'),
      );
      report.errorDialogEscape = { current: afterEscape, focusInViewer };
      assert.equal(
        focusInViewer,
        true,
        'Escape dismisses only the failure dialog and restores viewer focus',
      );
      await closeViewer(page, true);
    } finally {
      await page.evaluate(() => delete window.__viewerErrorDialog);
      await page.cdp('Network.setBlockedURLs', { urls: [] });
    }
    report.checks.push(
      'Missing real compressed bytes, held network delivery, zero saved versions, lost real neighbor response and blocked real adjacent delivery have explicit recoverable states. Reading errors retain selected kind/current identity; no original/thumbnail fallback occurs. Both ArrowLeft toward a readable preceding image and ArrowRight inside the focused failure dialog retain the same dialog, actual current src/id/version and focus without starting background neighbor or target reads. The return-current action works; reopening the real delivery error then pressing Escape dismisses only the error dialog, retains current bytes and viewer focus, and a second Escape returns to the original detail entry.',
    );

    for (const state of [
      'private',
      'storage-disabled',
      'trashed',
      'deleting',
      'query-detached',
    ]) {
      report.stage = `recovery:current-${state}`;
      if (state === 'private')
        await sql(
          `UPDATE media_images SET visibility='public' WHERE id='${viewerId(7)}'`,
        );
      await openViewerSource(
        page,
        config,
        7,
        state === 'private'
          ? viewerQuery.replace('visibility=private&', '')
          : viewerQuery,
      );
      await waitViewerNeighbors(page, viewerId(7));
      try {
        if (state === 'storage-disabled')
          await sql(
            `UPDATE storage_configs SET enabled=0 WHERE id='${viewerStorage}'`,
          );
        else if (state === 'trashed')
          await sql(
            `UPDATE media_images SET trashed_at=${Date.now()} WHERE id='${viewerId(7)}'`,
          );
        else if (state === 'deleting')
          await sql(
            `UPDATE media_images SET trashed_at=${Date.now()},deletion_status='deleting' WHERE id='${viewerId(7)}'`,
          );
        else if (state === 'query-detached')
          await sql(
            `UPDATE media_images SET visibility='public' WHERE id='${viewerId(7)}'`,
          );
        else
          await sql(
            `UPDATE media_images SET visibility='private' WHERE id='${viewerId(7)}'`,
          );
        await notifyViewer(page);
        if (state === 'private') {
          await page.waitForFunction(
            async (id) =>
              (await (await fetch(`/api/images/${id}`)).json()).visibility ===
              'private',
            viewerId(7),
          );
          await waitViewerImage(page, viewerId(7), 'compressed');
          assert.equal(
            (await page.fetch(`/i/${viewerId(7)}?type=compressed`)).status,
            200,
            'Effective owner can still read newly private content',
          );
        } else if (state === 'query-detached') {
          await page.waitForFunction(() =>
            document
              .querySelector('[data-testid="image-viewer"]')
              ?.textContent.includes('浏览上下文需要刷新'),
          );
          await waitViewerImage(page, viewerId(7), 'compressed');
        } else {
          const reason =
            state === 'storage-disabled'
              ? '停用'
              : state === 'trashed'
                ? '回收站'
                : '删除';
          await page.waitForFunction(
            (reason) =>
              document
                .querySelector(
                  '[data-testid="image-viewer"] .yarl__slide_current [data-testid="viewer-placeholder"]',
                )
                ?.textContent.includes(reason),
            reason,
          );
          assert.equal(
            await page.evaluate(
              () =>
                !!document.querySelector(
                  '[data-testid="image-viewer"] .yarl__slide_current img',
                ),
            ),
            false,
            'Unavailable current image no longer renders its content',
          );
          await viewerShot(page, config, report, `current-${state}`);
          if (state === 'storage-disabled') continue;
          await page.keyboard.press('ArrowRight');
          await waitViewerImage(page, viewerId(8), 'compressed');
        }
      } finally {
        await sql(
          `UPDATE storage_configs SET enabled=1 WHERE id='${viewerStorage}'`,
        );
        await sql(
          `UPDATE media_images SET visibility='private',trashed_at=NULL,deletion_status=NULL WHERE id='${viewerId(7)}'`,
        );
        await notifyViewer(page);
        await closeViewer(page);
      }
    }
    report.checks.push(
      'Real persisted public/private changes preserve owner access; storage disable/trash/deleting remove current content on the next actual status update with reasons. Known neighbor identity remains usable; a query-detached image requires context refresh. Fixture states are restored between cases.',
    );

    // Hold a real neighbor response across close/reopen. The old response is
    // released only after the newer explicit-original viewer is displaying.
    report.stage = 'recovery:late-response-after-reopen';
    await page.goto(`${config.origin}/library?${viewerQuery}`);
    await page.waitForSelector('[data-testid="library-gallery"]');
    await findViewerCard(page, 7);
    await page.click(button(`查看图片：${viewerName(7)}`));
    await page.waitForSelector('[data-testid="detail-body"]');
    await monitorViewerRequests(page);
    await page.evaluate(() => {
      const original = window.fetch;
      let used = false;
      window.fetch = async (...args) => {
        const response = await original(...args);
        if (
          !used &&
          new URL(String(args[0]), location.href).pathname.endsWith(
            '/neighbors',
          )
        ) {
          used = true;
          await new Promise((resolve) => {
            window.__viewerRelease = resolve;
          });
        }
        return response;
      };
    });
    await page.click(entry);
    await waitViewerImage(page, viewerId(7), 'compressed');
    await page.waitForFunction(
      () => typeof window.__viewerRelease === 'function',
    );
    await closeViewer(page);
    await page.click('loc=role:tab[name="原图"]');
    await page.click(entry);
    await waitViewerImage(page, viewerId(7), 'original');
    await page.evaluate(() => window.__viewerRelease());
    await settleViewer(page);
    await waitViewerImage(page, viewerId(7), 'original');
    await restoreViewerFetch(page);
    await closeViewer(page);
    report.checks.push(
      'A held real neighbor response released after closing/reopening cannot replace the new explicit original version or change its current image.',
    );
  } finally {
    await restoreViewerFetch(page);
    await page.cdp('Network.setBlockedURLs', { urls: [] });
    await page.cdp('Network.setCacheDisabled', { cacheDisabled: false });
  }
}
