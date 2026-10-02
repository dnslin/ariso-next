import assert from 'node:assert/strict';
import { join } from 'node:path';
import { viewerId, viewerName } from './library-viewer-fixtures.mjs';
import {
  setDetail171Theme,
  setDetail171Viewport,
} from './library-detail-171-helpers.mjs';
import {
  button,
  closeViewer,
  entry,
  monitorViewerRequests,
  restoreViewerFetch,
  viewerShot,
  viewerState,
  waitViewerImage,
} from './library-viewer-helpers.mjs';

export async function verifyViewerConsumers({ page, config, report }) {
  await setDetail171Theme(page, 'light');
  report.consumerTheme = 'light';
  const created = await page.fetch('/api/albums', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Issue 185 查看器消费验证',
      description: 'Disposable browser data',
    }),
  });
  assert.equal(created.status, 201);
  const album = JSON.parse(created.body).album;
  try {
    for (const index of [7, 8]) {
      const joined = await page.fetch(
        `/api/images/${viewerId(index)}/collections`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ albumIds: [album.id] }),
        },
      );
      assert.equal(joined.status, 200);
    }
    const albumPage = await page.fetch(
      `/api/images?scope=album&albumId=${encodeURIComponent(album.id)}&pageSize=20&page=1`,
    );
    assert.equal(albumPage.status, 200);
    report.albumSequence = JSON.parse(albumPage.body).items.map(
      (item) => item.id,
    );
    assert.deepEqual(report.albumSequence, [viewerId(8), viewerId(7)]);
    await setDetail171Viewport(page, 1440);
    await page.goto(`${config.origin}/albums/${album.id}`);
    await page.waitForSelector(
      `[data-testid="library-card"][data-image-id="${viewerId(8)}"]`,
    );
    await page.click(button(`查看图片：${viewerName(8)}`));
    await page.waitForSelector('[data-testid="detail-body"]');
    const url = await page.url();
    await monitorViewerRequests(page);
    await page.click(entry);
    await waitViewerImage(page, viewerId(8), 'compressed');
    await page.waitForFunction(() =>
      window.__viewerRequests.some((request) =>
        request.path.endsWith('/neighbors'),
      ),
    );
    const query = await page.evaluate(
      () =>
        window.__viewerRequests.find((request) =>
          request.path.endsWith('/neighbors'),
        ).query,
    );
    assert.equal(new URLSearchParams(query).get('scope'), 'album');
    assert.equal(new URLSearchParams(query).get('albumId'), album.id);
    await page.waitForFunction(() =>
      [
        ...document.querySelectorAll('[data-testid="image-viewer"] button'),
      ].some((node) => node.textContent.trim() === '下一张' && !node.disabled),
    );
    await page.click(button('下一张'));
    await waitViewerImage(page, viewerId(7), 'compressed');
    assert.equal(await page.url(), url);
    await viewerShot(page, config, report, 'album-consumer-1440');
    await closeViewer(page);
    await page.click(button('关闭图片详情'));
    assert.equal(new URL(await page.url()).pathname, `/albums/${album.id}`);
    await restoreViewerFetch(page);
  } finally {
    await restoreViewerFetch(page);
    assert.equal(
      (await page.fetch(`/api/albums/${album.id}`, { method: 'DELETE' }))
        .status,
      200,
    );
  }
  // This second consumer is reached through a real accepted upload and worker,
  // rather than fabricating a successful queue row in application state.
  await setDetail171Viewport(page, 390);
  await page.goto(`${config.origin}/upload`);
  const input = 'input[aria-label="选择图片文件"]';
  await page.waitForSelector(input, { state: 'attached' });
  await page.setInputFiles(input, [
    join(config.projectDirectory, 'tests/fixtures/runtime/images/sample.png'),
  ]);
  await page.waitForSelector(
    '[data-testid="upload-item"][data-state="queued"]',
  );
  await page.click(button('开始上传'));
  await page.waitForSelector(
    '[data-testid="upload-item"][data-state="ready"]',
    { timeout: 30000 },
  );
  const item = await page.evaluate(() => {
    const row = document.querySelector(
      '[data-testid="upload-item"][data-state="ready"]',
    );
    return { id: row.dataset.imageId, queueId: row.dataset.queueId };
  });
  const row = `[data-testid="upload-item"][data-queue-id="${item.queueId}"]`;
  await page.click(`${row} button:text-is("查看详情")`);
  await page.waitForSelector('[data-testid="detail-body"]');
  await page.click('loc=role:tab[name="缩略图"]');
  await monitorViewerRequests(page);
  await page.click(entry);
  await waitViewerImage(page, item.id, 'thumbnail');
  report.uploadViewerCaption = (await viewerState(page)).info;
  assert.ok(
    report.uploadViewerCaption.startsWith('缩略图 · WebP · '),
    'Actual uploaded WEBP thumbnail uses the designed WebP format caption',
  );
  assert.equal(
    await page.evaluate(() =>
      window.__viewerRequests.some((request) =>
        request.path.endsWith('/neighbors'),
      ),
    ),
    false,
    'Upload detail has no fabricated library browsing context',
  );
  await viewerShot(page, config, report, 'upload-consumer-390');
  await closeViewer(page, true);
  await page.click(button('关闭图片详情'));
  await page.waitForSelector(`${row}[data-state="ready"]`);
  assert.equal(new URL(await page.url()).pathname, '/upload');
  assert.equal(
    await page.evaluate(
      (selector) => document.querySelector(selector).dataset.imageId,
      row,
    ),
    item.id,
  );
  await restoreViewerFetch(page);
  report.checks.push(
    'Album content consumes the shared viewer with actual album-only neighbor query and keeps its route on close. A real uploaded/processed ready queue item opens the same viewer with explicit thumbnail and zero neighbor requests, then returns to the unchanged ready upload row.',
  );
}
