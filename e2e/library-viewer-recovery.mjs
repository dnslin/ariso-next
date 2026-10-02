import assert from 'node:assert/strict';
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

    await openViewerDirect(page, config, viewerId(7));
    await waitViewerImage(page, viewerId(7), 'compressed');
    await page.cdp('Network.emulateNetworkConditions', {
      offline: false,
      latency: 3000,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    try {
      await page.click(`${viewer} [role="tab"]:text-is("水印图")`);
      await page.waitForSelector(
        `${viewer} .yarl__slide_current [aria-label="正在加载图片"]`,
      );
      await viewerShot(page, config, report, 'real-delivery-loading-390');
    } finally {
      await page.cdp('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      });
    }
    await waitViewerImage(page, viewerId(7), 'watermark');
    await closeViewer(page);

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
    await page.cdp('Network.setBlockedURLs', {
      urls: [`*${'/i/'}${viewerId(8)}?type=compressed*`],
    });
    try {
      await openViewerSource(page, config, 7);
      await page.waitForFunction(() =>
        [
          ...document.querySelectorAll('[data-testid="image-viewer"] button'),
        ].some(
          (node) => node.textContent.trim() === '下一张' && !node.disabled,
        ),
      );
      await page.click(button('下一张'));
      await page.waitForSelector('[data-testid="viewer-navigation-error"]');
      assert.equal((await viewerState(page)).id, viewerId(7));
      assert.equal((await viewerState(page)).kind, 'compressed');
      await page.keyboard.press('ArrowRight');
      assert.equal(
        (await viewerState(page)).id,
        viewerId(7),
        'Arrow inside the failure dialog never navigates its background',
      );
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
        }
      }
      await page.click(button('返回当前图片'));
      await page.waitForSelector('[data-testid="viewer-navigation-error"]', {
        state: 'hidden',
      });
      await waitViewerImage(page, viewerId(7), 'compressed');
      const supported = await page.evaluate(
        () =>
          !!document.querySelector(
            '[data-testid="image-viewer"] button[aria-label="全屏"]',
          ),
      );
      if (supported) {
        await page.click(button('全屏'));
        await page.waitForFunction(() => !!document.fullscreenElement);
        await page.click(button('下一张'));
        await page.waitForSelector('[data-testid="viewer-navigation-error"]');
        const errorLayer = await page.evaluate(() => {
          const dialog = document.querySelector(
            '[data-testid="viewer-navigation-error"]',
          );
          const button = [...dialog.querySelectorAll('button')].find(
            (node) => node.textContent.trim() === '返回当前图片',
          );
          const rect = button.getBoundingClientRect();
          const hit = document.elementFromPoint(
            rect.x + rect.width / 2,
            rect.y + rect.height / 2,
          );
          return {
            insideFullscreen: document.fullscreenElement.contains(dialog),
            recoveryVisible: !!hit && button.contains(hit),
            rect: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
            },
          };
        });
        assert.equal(
          errorLayer.insideFullscreen,
          true,
          'Error portal remains inside the fullscreen subtree',
        );
        assert.equal(
          errorLayer.recoveryVisible,
          true,
          'Fullscreen recovery button is actually visible and hit-testable',
        );
        await viewerShot(page, config, report, 'fullscreen-adjacent-error');
        await page.click(button('返回当前图片'));
        await page.waitForSelector('[data-testid="viewer-navigation-error"]', {
          state: 'hidden',
        });
        await page.click(button('退出全屏'));
        await page.waitForFunction(() => !document.fullscreenElement);
      }
      await closeViewer(page);
    } finally {
      await page.cdp('Network.setBlockedURLs', { urls: [] });
    }
    report.checks.push(
      'Missing real compressed bytes, held network delivery, zero saved versions, lost real neighbor response and blocked real adjacent delivery have explicit recoverable states. Reading errors retain selected kind/current identity; no original/thumbnail fallback occurs; error-dialog arrow input does not reach background navigation.',
    );

    for (const state of [
      'private',
      'storage-disabled',
      'trashed',
      'deleting',
      'query-detached',
    ]) {
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
          await page.waitForFunction(() =>
            [
              ...document.querySelectorAll(
                '[data-testid="image-viewer"] button',
              ),
            ].some(
              (node) => node.textContent.trim() === '下一张' && !node.disabled,
            ),
          );
          await page.click(button('下一张'));
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
