import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { verifyResultPresentation } from './trash-result-presentation.mjs';

export async function verifyBatchOutcomes(context) {
  const {
    page,
    sql,
    report,
    fixture,
    resize,
    select,
    button,
    loaded,
    installBatchTraffic,
    action,
    verifyConfirmation,
    waitBatch,
    waitSummary,
    screenshot,
    item,
    approvedStateScreenshots,
    resultPage,
    selected,
    restoreBatchTraffic,
  } = context;
  await resize(1440);
  // A real database registration failure affects one selected item, not the others.
  report.activeCheck = 'approved-per-item-failures';
  await sql(
    "CREATE TRIGGER issue178_cleanup_failure BEFORE INSERT ON media_cleanup_jobs WHEN NEW.image_id = 'issue177-200' BEGIN SELECT RAISE(ABORT,'issue178 registration failed'); END",
  );
  let brokenFile = join(fixture.directory, 'issue177-001-original.png');
  const brokenBytes = await readFile(brokenFile);
  await rm(brokenFile);
  await mkdir(brokenFile);
  for (let index = 0; index < 20; index++) await select(index);
  await page.click(button('下一页'));
  await loaded(80);
  await page.click(button('下一页'));
  await loaded(41);
  await select(200);
  await installBatchTraffic();
  await action('永久删除所选', 21);
  await verifyConfirmation(21);
  await page.click('[data-testid="trash-batch-submit"]');
  await waitBatch();
  await waitSummary(19, 21);
  await page.waitForFunction(
    () =>
      document.querySelector(
        '[data-testid="trash-batch-table"] [data-image-id="issue177-001"]',
      )?.dataset.state === 'failed',
    undefined,
    { timeout: 15000 },
  );
  const failed = await sql(
    "SELECT image_id,status FROM media_cleanup_jobs WHERE image_id IN ('issue177-000','issue177-001','issue177-200') ORDER BY image_id",
  );
  assert.deepEqual(failed, [
    { image_id: 'issue177-000', status: 'succeeded' },
    { image_id: 'issue177-001', status: 'failed' },
  ]);
  const failedCleanup = JSON.parse(
    (await page.fetch('/api/images/issue177-001/cleanup')).body,
  );
  assert.equal(failedCleanup.remaining.length, 1);
  assert.ok(failedCleanup.remaining[0].error);
  await verifyResultPresentation(context, 21);
  const failedBody = await page.evaluate(
    () =>
      document.querySelector(
        '[data-testid="trash-batch-table"] [data-image-id="issue177-001"] [data-testid="trash-batch-item-details"]',
      ).textContent,
  );
  assert.ok(failedBody.includes(failedCleanup.remaining[0].error));
  assert.ok(failedBody.includes('重试剩余对象'));
  await screenshot('batch-partial', 1440, 'light');
  await resize(390);
  await page.click(item('trash-batch-item-trigger', 'issue177-001', true));
  await page.waitForFunction(
    () =>
      document
        .querySelector(
          '[data-testid="trash-batch-accordion"] [data-testid="trash-batch-item-trigger"][data-image-id="issue177-001"]',
        )
        .getAttribute('aria-expanded') === 'true',
  );
  assert.ok(
    (
      await page.evaluate(
        () =>
          document.querySelector(
            '[data-testid="trash-batch-accordion"] [data-image-id="issue177-001"] [data-testid="trash-batch-item-details"]',
          ).textContent,
      )
    ).includes(failedCleanup.remaining[0].error),
  );
  await screenshot('batch-cleanup-failure-expanded', 390, 'dark');
  await approvedStateScreenshots('approved-cleanup-failure');
  await resize(390);
  await resultPage(2);
  await page.click(item('trash-batch-item-trigger', 'issue177-200', true));
  await page.waitForFunction(
    () =>
      document
        .querySelector(
          '[data-testid="trash-batch-accordion"] [data-testid="trash-batch-item-trigger"][data-image-id="issue177-200"]',
        )
        .getAttribute('aria-expanded') === 'true',
  );
  const rejectionBody = await page.evaluate(
    () =>
      document.querySelector(
        '[data-testid="trash-batch-accordion"] [data-image-id="issue177-200"] [data-testid="trash-batch-item-details"]',
      ).textContent,
  );
  const rejection = await page.evaluate(() =>
    window.__trashResponses[0].results.find((row) => row.id === 'issue177-200'),
  );
  assert.equal(rejection.status, 'failed');
  assert.ok(rejectionBody.includes(rejection.message));
  assert.ok(rejectionBody.includes(rejection.code));
  assert.ok(rejectionBody.includes('重新提交'));
  await screenshot('batch-rejected-expanded', 390, 'light');
  await approvedStateScreenshots('approved-rejected');
  await page.click('[data-testid="trash-batch-done"]');
  await selected(1);
  assert.equal(
    await page.evaluate(() =>
      document
        .querySelector('[aria-label^="操作已选"]')
        ?.getAttribute('aria-label'),
    ),
    '操作已选 1 张图片',
  );
  await sql('DROP TRIGGER issue178_cleanup_failure');
  await page.click(button('查看本次清理结果'));
  await resize(1440);
  await resultPage(2);
  await page.click(item('trash-batch-item-retry', 'issue177-200'));
  await waitBatch();
  await waitSummary(20, 21);
  let partialTraffic = await page.evaluate(() =>
    window.__trashTraffic.filter((entry) => entry.mode === 'apply'),
  );
  assert.deepEqual(partialTraffic.at(-1).ids, ['issue177-200']);
  assert.equal(partialTraffic.at(-1).command.type, 'delete-permanent');
  await rm(brokenFile, { recursive: true });
  await writeFile(brokenFile, brokenBytes);
  brokenFile = null;
  await resultPage(1);
  await page.click(item('trash-batch-item-retry-cleanup', 'issue177-001'));
  await waitBatch();
  await waitSummary(21, 21);
  partialTraffic = await page.evaluate(() =>
    window.__trashTraffic.filter((entry) => entry.mode === 'apply'),
  );
  assert.deepEqual(partialTraffic.at(-1).ids, ['issue177-001']);
  assert.equal(partialTraffic.at(-1).command.type, 'retry-cleanup');
  assert.deepEqual(partialTraffic.at(-1).command.attempts, {
    'issue177-001': {
      taskId: failedCleanup.jobId,
      cycle: failedCleanup.cycle,
    },
  });
  await restoreBatchTraffic();
  report.checks.push(
    '21项真实结果分页：数据库受理失败和Local目录故障在item正文可见；逐项重新提交与剩余对象重试分别只发送该ID，并保留原任务周期基线。',
  );
}

export async function verifyUnknownAndUnsent(context) {
  const {
    page,
    sql,
    report,
    resize,
    selectAll,
    installBatchTraffic,
    action,
    waitBatch,
    screenshot,
    approvedStateScreenshots,
    item,
    resultPage,
    waitSummary,
    restoreBatchTraffic,
  } = context;
  report.activeCheck = 'approved-unknown-and-unsent';
  await resize(1440);
  await selectAll();
  await installBatchTraffic(true);
  await action('永久删除所选', 201);
  await page.click('[data-testid="trash-batch-submit"]');
  await waitBatch();
  await page.waitForSelector('[data-testid="trash-batch-check"]');
  let traffic = await page.evaluate(() => window.__trashTraffic);
  assert.deepEqual(
    traffic.filter((x) => x.mode === 'apply').map((x) => x.ids.length),
    [200],
  );
  assert.equal(
    (
      await sql(
        "SELECT deletion_status FROM media_images WHERE id='issue177-200'",
      )
    )[0].deletion_status,
    null,
  );
  await screenshot('batch-unknown', 1440, 'light');
  await screenshot('batch-unknown', 390, 'dark');
  await approvedStateScreenshots('approved-unknown');
  await resize(390);
  await page.click(item('trash-batch-item-trigger', 'issue177-000', true));
  await page.waitForSelector(
    item('trash-batch-item-check', 'issue177-000', true),
  );
  await page.click(item('trash-batch-item-check', 'issue177-000', true));
  await waitBatch();
  traffic = await page.evaluate(() => window.__trashTraffic);
  assert.equal(traffic.filter((entry) => entry.mode === 'apply').length, 1);
  assert.deepEqual(traffic.at(-1).ids, ['issue177-000']);
  assert.equal(traffic.at(-1).mode, 'check');
  await resultPage(11);
  await page.click(item('trash-batch-item-trigger', 'issue177-200', true));
  const continueButton = item('trash-batch-item-retry', 'issue177-200', true);
  assert.equal(
    await page.evaluate((selector) => {
      const control = document.querySelector(selector);
      return (
        control.disabled || control.getAttribute('aria-disabled') === 'true'
      );
    }, continueButton),
    true,
  );
  await screenshot('approved-unsent-disabled', 390, 'dark');
  await screenshot('approved-unsent-disabled-short', 430, 'light', 430);
  await approvedStateScreenshots('approved-unsent-disabled');
  await resize(390);
  await page.click('[data-testid="trash-batch-check"]');
  await waitBatch();
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="trash-batch-check"]'),
  );
  traffic = await page.evaluate(() => window.__trashTraffic);
  assert.equal(traffic.filter((x) => x.mode === 'apply').length, 1);
  assert.equal(
    traffic
      .filter((x) => x.mode === 'check')
      .every((x) => x.command.type === 'delete-permanent'),
    true,
  );
  assert.equal(
    (
      await sql(
        "SELECT deletion_status FROM media_images WHERE id='issue177-200'",
      )
    )[0].deletion_status,
    null,
  );
  assert.equal(
    await page.evaluate((selector) => {
      const control = document.querySelector(selector);
      return (
        control.disabled || control.getAttribute('aria-disabled') === 'true'
      );
    }, continueButton),
    false,
  );
  await screenshot('approved-unsent-enabled', 390, 'light');
  await page.click(continueButton);
  await waitBatch();
  await waitSummary(201, 201);
  report.completedTasks = await sql(
    "SELECT status,count(*) AS count FROM media_cleanup_jobs WHERE image_id LIKE 'issue177-%' GROUP BY status",
  );
  assert.deepEqual(report.completedTasks, [
    { status: 'succeeded', count: 201 },
  ]);
  traffic = await page.evaluate(() => window.__trashTraffic);
  assert.deepEqual(
    traffic.filter((x) => x.mode === 'apply').map((x) => x.ids.length),
    [200, 1],
  );
  assert.deepEqual(
    traffic.filter((entry) => entry.mode === 'apply').at(-1).ids,
    ['issue177-200'],
  );
  await restoreBatchTraffic();
  await resultPage(1);
  await approvedStateScreenshots('approved-completed');
  await screenshot('batch-completed', 1440, 'dark');
  await page.click('[data-testid="trash-batch-done"]');
  await page.waitForSelector('[data-testid="trash-empty"]');
  report.checks.push(
    '201项200+1分批；失联停止后续；持久任务只读核对；未发送显式继续；仅全部清理移除',
  );
}
