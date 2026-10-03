import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  viewerId,
  viewerName,
  viewerQuery,
} from './library-viewer-fixtures.mjs';
import {
  closeViewer,
  entry,
  findViewerCard,
  openViewerDirect,
  restoreViewerFetch,
  viewerShot,
  viewerState,
  waitViewerImage,
} from './library-viewer-helpers.mjs';
import {
  setDetail171Theme,
  setDetail171Viewport,
} from './library-detail-171-helpers.mjs';
import { signInToLibrary } from './library-login.mjs';

async function reprocess(page, id) {
  const endpoint = `/api/images/${id}`;
  const accepted = await page.fetch(`${endpoint}/reprocess`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scope: 'compressed' }),
  });
  assert.equal(accepted.status, 202, accepted.body);
  const receipt = JSON.parse(accepted.body);
  await page.waitForFunction(
    async ({ endpoint, jobId }) => {
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error(`Detail HTTP ${response.status}`);
      const detail = await response.json();
      return (
        detail.processingJob?.id === jobId &&
        ['succeeded', 'failed', 'cancelled'].includes(
          detail.processingJob.status,
        )
      );
    },
    { endpoint, jobId: receipt.jobId },
    { timeout: 30000 },
  );
  const detail = JSON.parse((await page.fetch(endpoint)).body);
  assert.equal(detail.processingJob.id, receipt.jobId);
  assert.equal(detail.processingJob.status, 'succeeded');
  assert.deepEqual(detail.processingJob.generatedVersions, ['compressed']);
  return detail;
}

// A same-origin canvas reads the actual decoded pixels, rather than React keys
// or version metadata. The fresh reference is independently fetched as a blob.
async function pixels(page, freshPath) {
  return page.evaluate(async (freshPath) => {
    let image = document.querySelector(
      '[data-testid="image-viewer"] .yarl__slide_current img',
    );
    let objectUrl;
    try {
      if (freshPath) {
        const response = await fetch(freshPath, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Delivery HTTP ${response.status}`);
        objectUrl = URL.createObjectURL(await response.blob());
        image = new Image();
        image.src = objectUrl;
        await image.decode();
      }
      if (!image?.complete || !image.naturalWidth) return null;
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 32;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0, 32, 32);
      return {
        width: image.naturalWidth,
        height: image.naturalHeight,
        rgba: [...context.getImageData(0, 0, 32, 32).data],
      };
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  }, freshPath ?? null);
}

async function observeRefresh(page, id) {
  await restoreViewerFetch(page);
  await page.evaluate((id) => {
    window.__viewerFetch = window.fetch;
    window.__viewerRefreshDetails = [];
    window.fetch = async (...args) => {
      const response = await window.__viewerFetch(...args);
      if (
        new URL(String(args[0]), location.href).pathname ===
          `/api/images/${id}` &&
        response.ok
      )
        window.__viewerRefreshDetails.push(await response.clone().json());
      return response;
    };
    performance.clearResourceTimings();
    const channel = new BroadcastChannel('ariso:library-changed');
    channel.postMessage('changed');
    channel.close();
  }, id);
}

async function verifyPollingOwner(context) {
  const { page, config, sql, report } = context;
  const id = viewerId(7);
  const [job] = await sql(
    `SELECT id,status,next_attempt_at FROM media_jobs WHERE image_id='${id}' ORDER BY created_at DESC LIMIT 1`,
  );
  // This existing real job is temporarily a future queued rendering fixture.
  // The worker cannot claim it; this proves observer ownership, not execution.
  await sql(
    `UPDATE media_jobs SET status='queued',next_attempt_at=${Date.now() + 3600000} WHERE id='${job.id}'`,
  );
  try {
    await page.goto(`${config.origin}/library?${viewerQuery}`);
    await page.waitForSelector('[data-testid="library-gallery"]');
    await findViewerCard(page, 7);
    await page.click(`loc=role:button[name="查看图片：${viewerName(7)}"]`);
    await page.waitForSelector('[data-testid="detail-body"]');
    await page.evaluate((id) => {
      window.__viewerFetch = window.fetch;
      window.__viewerStatusRequests = [];
      window.fetch = async (...args) => {
        if (
          new URL(String(args[0]), location.href).pathname ===
          '/api/images/status'
        ) {
          const ids = JSON.parse(args[1].body).ids;
          if (ids.length === 1 && ids[0] === id)
            window.__viewerStatusRequests.push(performance.now());
        }
        return window.__viewerFetch(...args);
      };
    }, id);
    await page.click(entry);
    await waitViewerImage(page, id, 'compressed');
    async function intervalRequests() {
      await page.evaluate(() => {
        window.__viewerStatusRequests = [];
        window.__viewerStatusStarted = performance.now();
      });
      // Two actual 2-second polling periods distinguish one observer from two.
      await page.waitForFunction(
        () => performance.now() - window.__viewerStatusStarted >= 4400,
      );
      return page.evaluate(() => window.__viewerStatusRequests);
    }
    const viewerRequests = await intervalRequests();
    await page.keyboard.press('ArrowRight');
    await waitViewerImage(page, viewerId(8), 'compressed');
    const adjacentRequests = await intervalRequests();
    await closeViewer(page);
    const detailRequests = await intervalRequests();
    report.pollingOwner = {
      viewerRequests,
      adjacentRequests,
      detailRequests,
      fixture: 'Future queued persisted job; no simulated worker success',
    };
    assert.ok(
      viewerRequests.length >= 2 && viewerRequests.length <= 3,
      `Only the visible viewer owns current-ID status polling; observed ${viewerRequests.length} POSTs over two periods`,
    );
    assert.ok(
      detailRequests.length >= 2 && detailRequests.length <= 3,
      'Closing the viewer restores exactly one detail status observer',
    );
    assert.deepEqual(
      adjacentRequests,
      [],
      'Browsing an adjacent picture keeps the source detail status observer paused',
    );
    report.checks.push(
      'A controlled future queued job makes active-state POSTs observable: only the visible viewer polls current-ID status, and closing restores the detail observer. This is observer ownership evidence, not actual worker execution.',
    );
  } finally {
    await restoreViewerFetch(page);
    await sql(
      `UPDATE media_jobs SET status='${job.status}',next_attempt_at=${job.next_attempt_at ?? 'NULL'} WHERE id='${job.id}'`,
    );
  }
}

async function verifyExpiredViewer(context) {
  const { page, config, sql, report } = context;
  const id = viewerId(7);
  await openViewerDirect(page, config, id, 'compressed');
  await waitViewerImage(page, id, 'compressed');
  const returnTo =
    new URL(await page.url()).pathname + new URL(await page.url()).search;
  await page.events();
  await sql(`UPDATE session SET expires_at=${Date.now() - 1}`);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(() => location.pathname === '/login');
  const expired = new URL(await page.url());
  const events = await page.events();
  const viewerRequests = new Map();
  for (const { method, params } of events) {
    if (method !== 'Network.requestWillBeSent') continue;
    const path = new URL(params.request.url).pathname;
    if (path === `/api/images/${id}` && params.request.method === 'GET')
      viewerRequests.set(params.requestId, { path, method: 'GET' });
    if (
      path === '/api/images/status' &&
      params.request.method === 'POST' &&
      params.request.postData
    ) {
      const { ids } = JSON.parse(params.request.postData);
      if (ids.length === 1 && ids[0] === id)
        viewerRequests.set(params.requestId, { path, method: 'POST', ids });
    }
  }
  const unauthorized = events
    .filter(
      ({ method, params }) =>
        method === 'Network.responseReceived' &&
        params.response.status === 401 &&
        viewerRequests.has(params.requestId),
    )
    .map(({ params }) => ({
      ...viewerRequests.get(params.requestId),
      url: params.response.url,
      status: params.response.status,
    }));
  report.expiredViewer = {
    reason: expired.searchParams.get('reason'),
    returnTo,
    unauthorized,
    requests: [...viewerRequests.values()],
  };
  assert.ok(
    unauthorized.length,
    'An actual viewer current-detail or single-current-ID status read receives HTTP 401 before redirecting',
  );
  assert.equal(expired.searchParams.get('reason'), 'expired');
  assert.equal(expired.searchParams.get('returnTo'), returnTo);
  assert.equal(
    await page.evaluate(
      () => !!document.querySelector('[data-testid="image-viewer"]'),
    ),
    false,
  );
  await signInToLibrary(page, config, report);
  report.checks.push(
    'An actual expired isolated SQLite session makes the viewer refresh return 401, removes the viewer and redirects to login with the original detail returnTo; real sign-in restores the isolated test session.',
  );
}

async function verifyFailedPreviewReplacement(context) {
  const { page, config, report } = context;
  const id = 'issue185-unreadable';
  await openViewerDirect(page, config, id, 'compressed');
  await page.waitForFunction(() =>
    document
      .querySelector(
        '[data-testid="image-viewer"] .yarl__slide_current [data-testid="viewer-placeholder"]',
      )
      ?.textContent.includes('失败'),
  );
  const before = await viewerState(page);
  const completed = await reprocess(page, id);
  await observeRefresh(page, id);
  await page.waitForFunction(
    (jobId) =>
      window.__viewerRefreshDetails.some(
        (detail) =>
          detail.processingJob?.id === jobId &&
          detail.processingJob.status === 'succeeded',
      ),
    completed.processingJob.id,
  );
  await waitViewerImage(page, id, 'compressed');
  const after = await viewerState(page);
  const expected = await pixels(
    page,
    completed.versions.find((version) => version.kind === 'compressed')
      .previewPath,
  );
  assert.deepEqual(
    await pixels(page),
    expected,
    'A new real publication clears the previous delivery/decode failure and naturally displays the actual new pixels',
  );
  assert.equal(
    await page.evaluate(
      () =>
        !!document.querySelector(
          '[data-testid="image-viewer"] .yarl__slide_current [data-testid="viewer-placeholder"]',
        ),
    ),
    false,
  );
  report.failedPreviewReplacement = {
    before,
    after,
    jobId: completed.processingJob.id,
  };
  await viewerShot(page, config, report, 'refresh-error-recovered-390');
  await restoreViewerFetch(page);
  await closeViewer(page);
  report.checks.push(
    'The current compressed delivery initially fails because its real file is absent. A successful real reprocess publishes readable bytes; the existing broadcast clears the saved failure and displays independently checked new pixels without retry, version change or closing.',
  );
}

export async function verifyViewerRefresh(context) {
  const { page, config, sql, fixtures, report } = context;
  const [settings] = await sql(
    'SELECT compression_enabled,output_format,quality,max_edge FROM media_settings WHERE id=1',
  );
  const failures = [];
  report.refresh = [];
  await setDetail171Theme(page, 'light');
  await setDetail171Viewport(page, 390);
  await page.cdp('Network.enable');
  await page.cdp('Network.setCacheDisabled', { cacheDisabled: false });
  try {
    for (const sameSize of [false, true]) {
      const id = viewerId(sameSize ? 21 : 7);
      const name = sameSize
        ? 'same-dimensions-and-byte-size'
        : 'changed-dimensions';
      report.stage = `refresh:${name}`;
      await sql(
        `UPDATE media_settings SET compression_enabled=1,output_format='jpeg',quality=82,max_edge=${sameSize ? 'NULL' : '640'} WHERE id=1`,
      );
      async function original(color) {
        const path = join(fixtures.directory, `${id}-original.png`);
        await promisify(execFile)('magick', [
          '-size',
          '120x90',
          `xc:${color}`,
          '-strip',
          path,
        ]);
        const bytes = (await readFile(path)).length;
        await sql(
          `UPDATE media_objects SET byte_size=${bytes},width=120,height=90 WHERE id='${id}-original'`,
        );
        await sql(
          `UPDATE media_versions SET byte_size=${bytes},width=120,height=90 WHERE image_id='${id}' AND kind='original'`,
        );
        await sql(
          `UPDATE media_images SET byte_size=${bytes},width=120,height=90 WHERE id='${id}'`,
        );
      }
      // Only disposable test source bytes change. Both publications below are
      // produced by real POSTs, the worker and ImageMagick, not injected jobs.
      if (sameSize) {
        await original('red');
        await reprocess(page, id);
      }
      await openViewerDirect(page, config, id, 'compressed');
      await waitViewerImage(page, id, 'compressed');
      const before = await pixels(page);
      const beforeVersion = JSON.parse(
        (await page.fetch(`/api/images/${id}`)).body,
      ).versions.find((version) => version.kind === 'compressed');
      const [beforeObject] = await sql(
        `SELECT object_id FROM media_versions WHERE image_id='${id}' AND kind='compressed'`,
      );
      await viewerShot(page, config, report, `refresh-${name}-before-390`);
      if (sameSize) await original('blue');
      const completed = await reprocess(page, id);
      const afterVersion = completed.versions.find(
        (version) => version.kind === 'compressed',
      );
      const [afterObject] = await sql(
        `SELECT object_id FROM media_versions WHERE image_id='${id}' AND kind='compressed'`,
      );
      assert.notEqual(afterObject.object_id, beforeObject.object_id);
      assert.equal(afterVersion.previewPath, beforeVersion.previewPath);
      if (sameSize) {
        assert.equal(afterVersion.width, beforeVersion.width);
        assert.equal(afterVersion.height, beforeVersion.height);
        assert.equal(afterVersion.byteSize, beforeVersion.byteSize);
      }
      const expected = await pixels(page, afterVersion.previewPath);
      assert.notDeepEqual(
        expected.rgba,
        before.rgba,
        'The real replacement changes decoded pixels',
      );
      const evidence = {
        name,
        id,
        jobId: completed.processingJob.id,
        beforeVersion,
        afterVersion,
        beforeObject,
        afterObject,
        before,
        expected,
      };
      report.refresh.push(evidence);
      await observeRefresh(page, id);
      await page.waitForFunction(
        (jobId) =>
          window.__viewerRefreshDetails.some(
            (detail) =>
              detail.processingJob?.id === jobId &&
              detail.processingJob.status === 'succeeded',
          ),
        completed.processingJob.id,
      );
      try {
        await page.waitForFunction(
          (expected) => {
            const image = document.querySelector(
              '[data-testid="image-viewer"] .yarl__slide_current img',
            );
            if (!image?.complete || !image.naturalWidth) return false;
            const canvas = document.createElement('canvas');
            canvas.width = 32;
            canvas.height = 32;
            const context = canvas.getContext('2d');
            context.drawImage(image, 0, 0, 32, 32);
            const actual = context.getImageData(0, 0, 32, 32).data;
            return (
              image.naturalWidth === expected.width &&
              image.naturalHeight === expected.height &&
              expected.rgba.every((value, index) => value === actual[index])
            );
          },
          expected,
          { timeout: 10000 },
        );
      } catch (error) {
        evidence.error = String(error);
        failures.push(
          `${name}: metadata refreshed, but open viewer pixels did not match the newly published real delivery`,
        );
      }
      evidence.actual = await pixels(page);
      evidence.state = await viewerState(page);
      evidence.deliveries = await page.evaluate(
        (id) =>
          performance
            .getEntriesByType('resource')
            .filter(
              (entry) =>
                entry.initiatorType === 'img' &&
                new URL(entry.name).pathname === `/i/${id}`,
            )
            .map((entry) => ({
              name: entry.name,
              responseStatus: entry.responseStatus,
              transferSize: entry.transferSize,
            })),
        id,
      );
      assert.ok(
        evidence.deliveries.some(
          (delivery) =>
            delivery.responseStatus === 200 && delivery.transferSize > 0,
        ),
        'The refreshed img performs a real successful delivery transfer under normal browser caching',
      );
      assert.equal(evidence.state.id, id);
      assert.equal(evidence.state.kind, 'compressed');
      await viewerShot(page, config, report, `refresh-${name}-after-390`);
      await restoreViewerFetch(page);
      await closeViewer(page);
    }
    report.stage = 'refresh:failed-preview-replacement';
    await verifyFailedPreviewReplacement(context);
    report.stage = 'refresh:polling-owner';
    try {
      await verifyPollingOwner(context);
    } catch (error) {
      report.pollingOwnerError = String(error.stack ?? error);
      failures.push(String(error));
    }
    report.stage = 'refresh:expired-session';
    await verifyExpiredViewer(context);
    assert.deepEqual(
      failures,
      [],
      'Published replacements refresh the actual open viewer pixels without close, navigation or retry',
    );
    report.checks.push(
      'Real compressed reprocessing refreshes the open current picture through the existing library broadcast, preserving image identity and selected kind. Both dimension-changing output and same-dimension/same-byte-size JPEG output are compared with actual independently fetched decoded delivery pixels; no successful worker state or business response is fabricated.',
    );
  } finally {
    await restoreViewerFetch(page);
    await sql(
      `UPDATE media_settings SET compression_enabled=${settings.compression_enabled},output_format='${settings.output_format}',quality=${settings.quality},max_edge=${settings.max_edge ?? 'NULL'} WHERE id=1`,
    );
    await page.cdp('Network.setCacheDisabled', { cacheDisabled: false });
  }
}
