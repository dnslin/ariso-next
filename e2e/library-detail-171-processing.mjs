import assert from 'node:assert/strict';
import {
  image,
  endpoint,
  workspace,
  confirmation,
  button,
  readVersionObjects,
  readProcessingSettings,
  enableProcessing,
  restoreProcessingSettings,
  restoreDetail171Fetch,
} from './library-detail-171-helpers.mjs';
import { verifyReprocessLayout } from './library-detail-171-layouts.mjs';

export async function verifyDetail171Processing({ page, config, sql, report }) {
  const settings = await readProcessingSettings(sql);
  const [before] = await sql(
    `SELECT processing_status FROM media_images WHERE id='${image}'`,
  );
  try {
    await enableProcessing(sql);
    // Every successful response below is from the real worker and actual tools.
    const saved = await readVersionObjects(sql);
    await sql(
      `UPDATE media_images SET processing_status='failed' WHERE id='${image}'`,
    );
    // Open the real failed filter through a selected source card. The starting
    // failure is controlled; the following retry and its completion are real.
    await page.goto(`${config.origin}/library?status=failed`);
    await page.waitForSelector(`[data-image-id="${image}"]`);
    await page.hover(button('查看图片：中文下载样本.png'));
    await page.click(
      'label:has(input[aria-label="选择图片：中文下载样本.png"])',
    );
    await page.waitForSelector('[data-testid="library-selection"]');
    await page.click(button('查看图片：中文下载样本.png'));
    await page.waitForSelector('[data-testid="detail-body"]');
    await page.click('[data-testid="detail-version-entry"]');
    await page.waitForSelector('[data-testid="detail-versions"]');
    await page.click(button('重新处理'));
    await page.waitForSelector(`${workspace} [role="radiogroup"]`);
    // Navigation starts a new page runtime; observe the actual request again.
    await page.evaluate((image) => {
      const original = window.fetch;
      window.__detail171Fetch = original;
      window.__detail171Posts = [];
      window.__detail171Statuses = [];
      window.fetch = async (...args) => {
        const path = new URL(String(args[0]), location.href).pathname;
        if (path === `/api/images/${image}/reprocess`)
          window.__detail171Posts.push(args[1]?.body);
        if (path === '/api/images/status')
          window.__detail171Statuses.push(JSON.parse(args[1].body).ids);
        return original(...args);
      };
    }, image);
    await page.click('[data-testid="reprocess-submit"]');
    await page.waitForSelector(`${workspace}[data-job-status="succeeded"]`, {
      timeout: 30000,
    });
    const completed = JSON.parse((await page.fetch(endpoint)).body);
    assert.equal(completed.processingJob.status, 'succeeded');
    assert.equal(completed.processingJob.scope, 'all');
    assert.deepEqual(completed.processingJob.expectedVersions, [
      'compressed',
      'thumbnail',
      'watermark',
    ]);
    const replaced = await readVersionObjects(sql);
    assert.equal(
      replaced.find((value) => value.kind === 'original').object_id,
      saved.find((value) => value.kind === 'original').object_id,
    );
    for (const kind of ['compressed', 'thumbnail', 'watermark'])
      assert.notEqual(
        replaced.find((value) => value.kind === kind).object_id,
        saved.find((value) => value.kind === kind)?.object_id,
      );
    assert.equal(await page.evaluate(() => window.__detail171Posts.length), 1);
    const polls = await page.evaluate(() => window.__detail171Statuses);
    for (const ids of polls) assert.ok(ids.length <= 80);
    // Two polling periods prove a terminal task stops requesting current-ID status.
    const currentPolls = polls.filter(
      (ids) => ids.length === 1 && ids[0] === image,
    ).length;
    await page.waitForTimeout(4200);
    assert.equal(
      await page.evaluate(
        (image) =>
          window.__detail171Statuses.filter(
            (ids) => ids.length === 1 && ids[0] === image,
          ).length,
        image,
      ),
      currentPolls,
    );
    await verifyReprocessLayout({ page, config, report }, 'reprocess-success');
    // Reopen the action on the same mounted image after its confirmed success.
    await page.click(button('查看图片详情'));
    await page.waitForSelector('[data-testid="detail-body"]');
    await page.click('[data-testid="detail-version-entry"]');
    await page.waitForSelector('[data-testid="detail-versions"]');
    await page.click(button('重新处理'));
    await page.waitForSelector(`${workspace} [role="radiogroup"]`);
    await page.click('[data-testid="reprocess-scope-thumbnail"]');
    await page.waitForSelector(confirmation);
    await page.click(`${confirmation} [data-testid="reprocess-submit"]`);
    await page.waitForSelector(`${workspace}[data-job-status="succeeded"]`, {
      timeout: 30000,
    });
    const repeated = JSON.parse((await page.fetch(endpoint)).body);
    assert.notEqual(repeated.processingJob.id, completed.processingJob.id);
    assert.equal(repeated.processingJob.scope, 'thumbnail');
    const repeatedVersions = await readVersionObjects(sql);
    for (const kind of ['original', 'compressed', 'watermark'])
      assert.equal(
        repeatedVersions.find((value) => value.kind === kind).object_id,
        replaced.find((value) => value.kind === kind).object_id,
      );
    assert.notEqual(
      repeatedVersions.find((value) => value.kind === 'thumbnail').object_id,
      replaced.find((value) => value.kind === 'thumbnail').object_id,
    );
    assert.equal(await page.evaluate(() => window.__detail171Posts.length), 2);
    report.checks.push(
      'Confirmed successful receipt resets when reopening the version-page reprocess action on the same image; a second real thumbnail-only job completes without closing/reloading and preserves all unselected versions.',
    );
    await page.click(button('返回图库'));
    await page.waitForFunction(
      () => !new URL(location.href).searchParams.has('image'),
    );
    assert.equal(
      new URL(await page.url()).searchParams.get('status'),
      'failed',
    );
    await page.waitForSelector('[data-testid="library-selection"]', {
      state: 'hidden',
    });
    await page.waitForSelector('button[data-refresh-available="true"]');
    await page.click(button('刷新图库'));
    await page.waitForFunction(
      (image) => !document.querySelector(`[data-image-id="${image}"]`),
      image,
    );
    report.checks.push(
      'Real all-scope retry from a selected failed-filter card runs ImageMagick, creates compressed/thumbnail/text-watermark versions and succeeds in UI; original stays fixed, derived object IDs change, submission occurs once, status batches remain ≤80 and current-ID polling stops. Completion marks list refresh available, reconciliation removes the no-longer-failed selection, and manual refresh excludes the image from the real failed query.',
    );
  } finally {
    await restoreDetail171Fetch(page);
    await restoreProcessingSettings(sql, settings);
    await sql(
      `UPDATE media_images SET processing_status='${before.processing_status}' WHERE id='${image}'`,
    );
  }
}
