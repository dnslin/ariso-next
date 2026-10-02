import assert from 'node:assert/strict';
import { quote } from './library-detail-171-helpers.mjs';
import {
  viewerId,
  viewerName,
  viewerQuery,
} from './library-viewer-fixtures.mjs';
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
  viewerShot,
  viewerState,
  waitViewerImage,
} from './library-viewer-helpers.mjs';

export async function verifyViewerPendingNavigation({ page, config, report }) {
  await page.goto(`${config.origin}/library?${viewerQuery}`);
  await page.waitForSelector('[data-testid="library-gallery"]');
  await findViewerCard(page, 7);
  await page.click(button(`查看图片：${viewerName(7)}`));
  await page.waitForSelector('[data-testid="detail-body"]');
  await monitorViewerRequests(page);
  await page.evaluate((target) => {
    const original = window.fetch;
    let used = false;
    window.fetch = async (...args) => {
      const response = await original(...args);
      if (
        !used &&
        new URL(String(args[0]), location.href).pathname ===
          `/api/images/${target}`
      ) {
        used = true;
        await new Promise((resolve) => {
          window.__viewerRelease = resolve;
        });
      }
      return response;
    };
  }, viewerId(8));
  try {
    await page.click(entry);
    await waitViewerImage(page, viewerId(7), 'compressed');
    await page.waitForFunction(
      () => typeof window.__viewerRelease === 'function',
    );
    const before = await viewerState(page);
    await page.click(button('下一张'));
    await page.waitForFunction(() =>
      document
        .querySelector('[data-testid="image-viewer"]')
        ?.textContent.includes('正在读取下一张图片'),
    );
    const pendingFocus = await page.evaluate(
      () => !!document.activeElement?.closest('[data-testid="image-viewer"]'),
    );
    report.pendingNavigationFocus = { whileReading: pendingFocus };
    assert.equal(
      pendingFocus,
      true,
      'Pending navigation disables its button while retaining viewer focus',
    );
    await page.focus('[data-testid="image-viewer"] .yarl__container');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await settleViewer(page);
    report.pendingNavigation = await viewerState(page);
    await viewerShot(page, config, report, 'pending-navigation-repeated-arrow');
    assert.equal(
      report.pendingNavigation.src,
      before.src,
      'Repeated arrow input while actual target read is held must preserve the visible current image, not merely its outer dataset',
    );
    assert.equal(report.pendingNavigation.id, viewerId(7));
    await page.evaluate(() => window.__viewerRelease());
    await waitViewerImage(page, viewerId(8), 'compressed');
    report.pendingNavigationFocus.afterSuccess = await page.evaluate(
      () => !!document.activeElement?.closest('[data-testid="image-viewer"]'),
    );
    assert.equal(report.pendingNavigationFocus.afterSuccess, true);
    await closeViewer(page);
  } finally {
    await restoreViewerFetch(page);
  }
  report.checks.push(
    'Holding the actual neighbor detail response while pressing ArrowRight repeatedly preserves the visible current slide URL. Releasing the response performs one successful transition to the intended next image.',
  );
}

export async function verifyViewerDecodeFailures({ page, config, report }) {
  for (const kind of ['compressed', 'watermark']) {
    if (kind === 'compressed') {
      await page.goto(`${config.origin}/library?image=${viewerId(7)}`);
      await page.waitForSelector('[data-testid="detail-body"]');
    } else {
      await openViewerDirect(page, config, viewerId(7));
      await waitViewerImage(page, viewerId(7), 'compressed');
    }
    await page.evaluate(
      ({ id, kind }) => {
        const original = HTMLImageElement.prototype.decode;
        window.__viewerDecode = original;
        window.__viewerDecodeRejected = false;
        HTMLImageElement.prototype.decode = async function () {
          await original.call(this);
          const url = new URL(this.src, location.href);
          if (
            url.pathname === `/i/${id}` &&
            url.searchParams.get('type') === kind
          ) {
            window.__viewerDecodeRejected = true;
            throw new DOMException(
              'Verification: actual image decode rejected',
              'EncodingError',
            );
          }
        };
      },
      { id: viewerId(7), kind },
    );
    try {
      if (kind === 'compressed') await page.click(entry);
      else
        await page.click(
          '[data-testid="image-viewer"] [role="tab"]:text-is("水印图")',
        );
      await page.waitForFunction(
        () =>
          window.__viewerDecodeRejected &&
          document
            .querySelector(
              '[data-testid="image-viewer"] .yarl__slide_current [data-testid="viewer-placeholder"]',
            )
            ?.textContent.includes('失败'),
      );
      assert.equal(
        (await viewerState(page)).kind,
        kind,
        'Decoder failure retains the explicitly selected kind',
      );
      assert.equal(
        await page.evaluate(
          () =>
            !!document.querySelector(
              '[data-testid="image-viewer"] .yarl__slide_current img',
            ),
        ),
        false,
        'A decoder failure cannot leave the image presented as success',
      );
      await viewerShot(page, config, report, `decode-error-${kind}`);
    } finally {
      await page.evaluate(() => {
        HTMLImageElement.prototype.decode = window.__viewerDecode;
        delete window.__viewerDecode;
      });
    }
    await closeViewer(page);
  }
  report.checks.push(
    'Current compressed and explicitly selected watermark use actual delivery bytes, then reject at the browser decode boundary. Both show the selected-version failure without substituting another version or treating the image load event as successful decoding.',
  );
}

export async function verifyViewerDeletedSource({ page, config, sql, report }) {
  const id = viewerId(7);
  const tables = ['media_images', 'media_objects', 'media_versions'];
  const rows = [];
  for (const table of tables)
    rows.push(
      await sql(
        `SELECT * FROM ${table} WHERE ${table === 'media_images' ? 'id' : 'image_id'}='${id}'`,
      ),
    );
  await openViewerSource(page, config, 7);
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[data-testid="image-viewer"] button')].some(
      (node) => node.textContent.trim() === '下一张' && !node.disabled,
    ),
  );
  try {
    await sql(`DELETE FROM media_versions WHERE image_id='${id}'`);
    await sql(`DELETE FROM media_objects WHERE image_id='${id}'`);
    await sql(`DELETE FROM media_images WHERE id='${id}'`);
    assert.equal(
      (await page.fetch(`/api/images/${id}`)).status,
      404,
      'The fixture record is genuinely absent',
    );
    await page.evaluate(() => {
      const channel = new BroadcastChannel('ariso:library-changed');
      channel.postMessage('changed');
      channel.close();
    });
    await page.waitForFunction(() =>
      document
        .querySelector(
          '[data-testid="image-viewer"] .yarl__slide_current [data-testid="viewer-placeholder"]',
        )
        ?.textContent.includes('不存在'),
    );
    await viewerShot(page, config, report, 'current-deleted');
    await page.click(button('下一张'));
    await waitViewerImage(page, viewerId(8), 'compressed');
    await page.click(button('关闭大图'));
    await page.waitForSelector('[data-testid="image-viewer"]', {
      state: 'hidden',
    });
    await page.waitForSelector(button('关闭图片详情'));
    await page.click(button('关闭图片详情'));
    await page.waitForFunction(
      () => !new URL(location.href).searchParams.has('image'),
    );
    await page.waitForFunction(
      () =>
        document.activeElement?.getAttribute('aria-label') === '搜索图片名称',
    );
    assert.equal(
      await page.evaluate(
        (id) =>
          !!document.querySelector(
            `[data-testid="library-card"][data-image-id="${id}"]`,
          ),
        id,
      ),
      false,
      'Lost source card is removed from the real list',
    );
    await viewerShot(page, config, report, 'deleted-source-toolbar-focus');
  } finally {
    for (let index = 0; index < tables.length; index++)
      for (const row of rows[index]) {
        const columns = Object.keys(row);
        await sql(
          `INSERT INTO ${tables[index]} (${columns.join(',')}) VALUES (${columns.map((column) => quote(row[column])).join(',')})`,
        );
      }
  }
  report.checks.push(
    'Deleting the actual disposable current image/version/object records produces a real 404 and removes visible current content. Previously known next image remains navigable; closing through the missing source detail returns focus to the list search toolbar rather than a removed card. Original fixture records are restored afterward.',
  );
}
