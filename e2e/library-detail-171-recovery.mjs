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
  prepareDetail171Versions,
  restoreDetail171Fetch,
} from './library-detail-171-helpers.mjs';
import { verifyReprocessLayout } from './library-detail-171-layouts.mjs';

export async function verifyDetail171Recovery({ page, config, sql, report }) {
  await prepareDetail171Versions({ page, sql });
  const settings = await readProcessingSettings(sql);
  try {
    await enableProcessing(sql);
    // Lose a real accepted POST response; never replace it with fabricated API data.
    await openDetail171(page, config);
    await page.click('[data-testid="reprocess-scope-thumbnail"]');
    await page.waitForSelector(confirmation);
    const [priorCount] = await sql(
      `SELECT COUNT(*) AS count FROM media_jobs WHERE image_id='${image}' AND kind='process'`,
    );
    const beforeSingle = await readVersionObjects(sql);
    await page.evaluate((image) => {
      const original = window.fetch;
      window.__detail171Fetch = original;
      window.__detail171LostPosts = 0;
      window.__detail171LostReceipt = null;
      window.__detail171LostRelease = undefined;
      window.__detail171LostHoldUsed = false;
      window.__detail171LostReadFailure = true;
      window.__detail171LostReads = 0;
      window.__detail171LostDetails = 0;
      window.fetch = async (...args) => {
        const path = new URL(String(args[0]), location.href).pathname;
        if (path === `/api/images/${image}` && window.__detail171LostReceipt)
          window.__detail171LostDetails++;
        if (
          path === `/api/images/${image}` &&
          window.__detail171LostReceipt &&
          !window.__detail171LostHoldUsed
        ) {
          window.__detail171LostHoldUsed = true;
          await new Promise((resolve) => {
            window.__detail171LostRelease = resolve;
          });
        }
        if (
          path === `/api/images/${image}` &&
          window.__detail171LostReceipt &&
          window.__detail171LostReadFailure
        ) {
          window.__detail171LostReads++;
          throw new TypeError('Verification: detail read lost in transport');
        }
        const response = await original(...args);
        if (path === `/api/images/${image}/reprocess`) {
          window.__detail171LostPosts++;
          window.__detail171LostReceipt = await response.clone().json();
          if (response.status !== 202)
            throw new Error(
              `Real reprocess did not accept: ${response.status}`,
            );
          throw new TypeError(
            'Verification: accepted response lost in transport',
          );
        }
        return response;
      };
    }, image);
    await page.click(`${confirmation} [data-testid="reprocess-submit"]`);
    await page.waitForFunction(() => !!window.__detail171LostReceipt);
    await page.waitForFunction(() =>
      document
        .querySelector('[data-testid="reprocess-confirmation"] [role="alert"]')
        ?.textContent.includes('提交结果待核对'),
    );
    await page.waitForFunction(
      () => typeof window.__detail171LostRelease === 'function',
    );
    assert.equal(
      await page.evaluate(() => {
        const dialog = document.querySelector(
          '[data-testid="reprocess-confirmation"]',
        );
        const cancel = dialog.querySelector(
          '[data-slot="alert-dialog-footer"] button:first-child',
        );
        return (
          dialog.getAttribute('aria-busy') === 'true' &&
          cancel.disabled &&
          dialog.querySelector('[data-testid="reprocess-submit"]').disabled
        );
      }),
      true,
      'Pending confirmation disables both actions',
    );
    await page.keyboard.press('Escape');
    await page.waitForSelector(confirmation);
    assert.equal(
      await page.evaluate(() =>
        document
          .querySelector('[data-testid="reprocess-confirmation"]')
          .getAttribute('aria-busy'),
      ),
      'true',
      'Escape cannot cancel an in-flight real submission',
    );
    const receipt = await page.evaluate(() => window.__detail171LostReceipt);
    assert.equal(receipt.scope, 'thumbnail');
    // The UI read is deliberately disconnected. Observe the actual worker
    // through the saved native fetch; no success response is invented.
    await page.waitForFunction(
      async ({ endpoint, job }) => {
        const response = await window.__detail171Fetch(endpoint);
        if (!response.ok) throw new Error(`Detail HTTP ${response.status}`);
        const detail = await response.json();
        return (
          detail.processingJob?.id === job &&
          ['succeeded', 'failed'].includes(detail.processingJob.status)
        );
      },
      { endpoint, job: receipt.jobId },
      { timeout: 30000 },
    );
    await page.evaluate(() => window.__detail171LostRelease());
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="reprocess-confirmation"]')
          ?.getAttribute('aria-busy') === 'false',
    );
    await page.waitForFunction(() =>
      document
        .querySelector('[data-testid="reprocess-confirmation"]')
        ?.innerText.includes('详情核对失败：连接中断'),
    );
    assert.equal(
      await page.evaluate(() => {
        const dialog = document.querySelector(
          '[data-testid="reprocess-confirmation"]',
        );
        const cancel = dialog.querySelector(
          '[data-slot="alert-dialog-footer"] button:first-child',
        );
        const verify = [...dialog.querySelectorAll('button')].find(
          (node) => node.textContent.trim() === '核对详情',
        );
        return (
          !cancel.disabled &&
          dialog.querySelector('[data-testid="reprocess-submit"]').disabled &&
          !!verify &&
          !verify.disabled
        );
      }),
      true,
      'Lost detail read retains the popup, enables cancel/verification and disables resubmission',
    );
    await verifyReprocessLayout(
      { page, config, report },
      'reprocess-confirm-read-error',
    );
    const failedReads = await page.evaluate(() => window.__detail171LostReads);
    await page.focus(`${confirmation} [data-slot="alert-dialog-body"] button`);
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      (before) => window.__detail171LostReads > before,
      failedReads,
    );
    await page.waitForFunction(() => {
      const verify = document.querySelector(
        '[data-testid="reprocess-confirmation"] [data-slot="alert-dialog-body"] button',
      );
      return !!verify && !verify.disabled;
    });
    assert.ok(
      await page.evaluate(() =>
        document
          .querySelector('[data-testid="reprocess-confirmation"]')
          .innerText.includes('详情核对失败：连接中断'),
      ),
    );
    assert.equal(await page.evaluate(() => window.__detail171LostPosts), 1);
    await page.click(
      `${confirmation} [data-slot="alert-dialog-footer"] button:first-child`,
    );
    await page.waitForSelector(confirmation, { state: 'hidden' });
    assert.equal(
      await page.evaluate(() => {
        const selected = document.querySelector(
          '[data-testid="reprocess-scope-thumbnail"] input',
        );
        return (
          selected.checked &&
          document.querySelector(
            '.shell-footer [data-testid="reprocess-submit"]',
          ).disabled &&
          document
            .querySelector('[data-testid="detail-reprocess"]')
            .innerText.includes('提交结果待核对') &&
          document
            .querySelector('main')
            .innerText.includes('图片详情读取失败') &&
          [...document.querySelectorAll('main button')].some(
            (button) =>
              button.textContent.trim() === '刷新详情' &&
              button.getClientRects().length > 0,
          ) &&
          [
            ...document.querySelectorAll(
              '[data-slot="radio-content"][data-testid^="reprocess-scope-"] input',
            ),
          ].every((input) => input.disabled)
        );
      }),
      true,
      'Cancel after a lost GET preserves unknown/error/scope and exposes real detail-read retry while all scopes are disabled',
    );
    await page.waitForFunction(
      () => document.activeElement?.dataset.testid === 'detail-workspace-title',
    );
    await page.evaluate(() => {
      window.__detail171LostReadFailure = false;
    });
    const realReads = await page.evaluate(() => window.__detail171LostDetails);
    await page.focus(button('核对详情'));
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      (before) => window.__detail171LostDetails > before,
      realReads,
    );
    await page.waitForSelector(`${workspace}[data-job-status="succeeded"]`);
    await page.waitForSelector(confirmation, { state: 'hidden' });
    assert.equal(
      await page.evaluate(() =>
        document
          .querySelector('[data-testid="detail-workspace-title"]')
          .textContent.trim(),
      ),
      '重新处理完成',
    );
    assert.equal(
      await page.evaluate(() => {
        const result = document.querySelector(
          '[data-testid="detail-reprocess"]',
        );
        const rows = [...result.querySelectorAll('dl > div')];
        return (
          !result.innerText.includes('提交结果待核对') &&
          !document
            .querySelector('main')
            .innerText.includes('图片详情读取失败') &&
          rows.length === 1 &&
          rows[0].querySelector('dt').textContent === '缩略图' &&
          rows[0].textContent.includes('已更新')
        );
      }),
      true,
      'A successful verification claims the new matching terminal job and shows its actual thumbnail result',
    );
    assert.equal(await page.evaluate(() => window.__detail171LostPosts), 1);
    await verifyReprocessLayout(
      { page, config, report },
      'reprocess-recovered-success',
    );
    const single = JSON.parse((await page.fetch(endpoint)).body);
    assert.equal(single.processingJob.id, receipt.jobId);
    assert.equal(single.processingJob.scope, receipt.scope);
    assert.equal(single.processingJob.status, 'succeeded');
    assert.deepEqual(single.processingJob.expectedVersions, ['thumbnail']);
    const afterSingle = await readVersionObjects(sql);
    for (const kind of ['original', 'compressed', 'watermark'])
      assert.equal(
        afterSingle.find((value) => value.kind === kind).object_id,
        beforeSingle.find((value) => value.kind === kind).object_id,
      );
    assert.notEqual(
      afterSingle.find((value) => value.kind === 'thumbnail').object_id,
      beforeSingle.find((value) => value.kind === 'thumbnail').object_id,
    );
    assert.equal(await page.evaluate(() => window.__detail171LostPosts), 1);
    const [afterCount] = await sql(
      `SELECT COUNT(*) AS count FROM media_jobs WHERE image_id='${image}' AND kind='process'`,
    );
    assert.equal(afterCount.count, priorCount.count + 1);
    report.checks.push(
      'A real accepted thumbnail-only response and its follow-up detail read are disconnected at fetch transport; pending dialog actions and Escape cannot cancel, the retained popup shows the GET error with cancel/explicit keyboard verification, and cancel exposes cached scope plus parent retry with choices disabled. Successful detail verification claims the new matching terminal receipt and displays its actual success without another POST. The browser submits once and the DB gains one real job; actual worker success replaces only thumbnail while original/compressed/watermark object IDs remain unchanged.',
    );
  } finally {
    await restoreDetail171Fetch(page);
    await restoreProcessingSettings(sql, settings);
  }
}
