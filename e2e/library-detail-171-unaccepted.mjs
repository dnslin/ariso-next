import assert from 'node:assert/strict';
import {
  image,
  endpoint,
  workspace,
  confirmation,
  button,
  openDetail171,
  readVersionObjects,
  readProcessingSettings,
  enableProcessing,
  restoreProcessingSettings,
  restoreDetail171Fetch,
} from './library-detail-171-helpers.mjs';
import { verifyReprocessLayout } from './library-detail-171-layouts.mjs';

// This scenario never sends its failed POST to the server. The successful GET
// is still the actual endpoint: no new matching job means explicit recovery.
export async function verifyDetail171Unaccepted({ page, config, sql, report }) {
  const settings = await readProcessingSettings(sql);
  try {
    await enableProcessing(sql);
    await openDetail171(page, config);
    const before = JSON.parse((await page.fetch(endpoint)).body);
    const objects = await readVersionObjects(sql);
    const [beforeJobs] = await sql(
      `SELECT COUNT(*) AS count FROM media_jobs WHERE image_id='${image}' AND kind='process'`,
    );
    await page.click('[data-testid="reprocess-scope-thumbnail"]');
    await page.waitForSelector(confirmation);
    await page.evaluate((image) => {
      const original = window.fetch;
      window.__detail171Fetch = original;
      window.__detail171UnacceptedPosts = 0;
      window.__detail171UnacceptedReadFailure = true;
      window.__detail171UnacceptedReads = 0;
      window.fetch = async (...args) => {
        const path = new URL(String(args[0]), location.href).pathname;
        if (path === `/api/images/${image}/reprocess`) {
          window.__detail171UnacceptedPosts++;
          throw new TypeError(
            'Verification: disconnected before POST reached server',
          );
        }
        if (
          path === `/api/images/${image}` &&
          window.__detail171UnacceptedPosts
        ) {
          window.__detail171UnacceptedReads++;
          if (window.__detail171UnacceptedReadFailure)
            throw new TypeError('Verification: detail connection unavailable');
        }
        return original(...args);
      };
    }, image);
    await page.click(`${confirmation} [data-testid="reprocess-submit"]`);
    await page.waitForFunction(() => {
      const dialog = document.querySelector(
        '[data-testid="reprocess-confirmation"]',
      );
      return (
        dialog?.getAttribute('aria-busy') === 'false' &&
        dialog.innerText.includes('详情核对失败：连接中断')
      );
    });
    assert.equal(
      await page.evaluate(() => {
        const dialog = document.querySelector(
          '[data-testid="reprocess-confirmation"]',
        );
        const resume = [...dialog.querySelectorAll('button')].find(
          (node) => node.textContent.trim() === '重新选择处理范围',
        );
        return (
          dialog.querySelector('[data-testid="reprocess-submit"]').disabled &&
          (!resume || resume.disabled)
        );
      }),
      true,
      'Failed verification cannot unlock an unknown POST',
    );
    await page.evaluate(() => {
      window.__detail171UnacceptedReadFailure = false;
    });
    const reads = await page.evaluate(() => window.__detail171UnacceptedReads);
    await page.focus(button('核对详情'));
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      (reads) => window.__detail171UnacceptedReads > reads,
      reads,
    );
    await page.waitForSelector(button('重新选择处理范围'));
    assert.equal(
      await page.evaluate(() => {
        const dialog = document.querySelector(
          '[data-testid="reprocess-confirmation"]',
        );
        return (
          dialog.innerText.includes('提交结果待核对') &&
          !dialog.innerText.includes('详情核对失败') &&
          dialog.querySelector('[data-testid="reprocess-submit"]').disabled
        );
      }),
      true,
      'An unchanged actual latest job keeps unknown until the user chooses recovery',
    );
    const verified = JSON.parse((await page.fetch(endpoint)).body);
    assert.equal(
      verified.processingJob?.id ?? null,
      before.processingJob?.id ?? null,
    );
    assert.equal(verified.activeJob, null);
    await verifyReprocessLayout(
      { page, config, report },
      'reprocess-confirm-unknown',
    );
    assert.equal(
      await page.evaluate(() => window.__detail171UnacceptedPosts),
      1,
    );
    await page.focus(button('重新选择处理范围'));
    await page.keyboard.press('Enter');
    await page.waitForSelector(confirmation, { state: 'hidden' });
    await page.waitForSelector(`${workspace} [role="radiogroup"]`);
    await page.waitForFunction(
      () =>
        document.activeElement ===
        document.querySelector('[data-testid="reprocess-scope-all"] input'),
    );
    assert.equal(
      await page.evaluate(() => {
        const selected = document.querySelector(
          '[data-testid="reprocess-scope-all"] input',
        );
        const submit = document.querySelector(
          '.shell-footer [data-testid="reprocess-submit"]',
        );
        return (
          selected.checked &&
          !submit.disabled &&
          !document
            .querySelector('[data-testid="detail-reprocess"]')
            .innerText.includes('提交结果待核对')
        );
      }),
      true,
      'Explicit recovery resets to all and unlocks range selection without submitting',
    );
    assert.equal(
      await page.evaluate(() => window.__detail171UnacceptedPosts),
      1,
    );
    const [afterJobs] = await sql(
      `SELECT COUNT(*) AS count FROM media_jobs WHERE image_id='${image}' AND kind='process'`,
    );
    assert.equal(afterJobs.count, beforeJobs.count);
    assert.deepEqual(await readVersionObjects(sql), objects);
    report.checks.push(
      'A POST disconnected before reaching the server creates no job. Failed detail verification cannot resume or submit; a real successful GET with unchanged latest job keeps unknown and exposes explicit range recovery. That keyboard action resets to all without another POST, job or object change.',
    );
  } finally {
    await restoreDetail171Fetch(page);
    await restoreProcessingSettings(sql, settings);
  }
}
