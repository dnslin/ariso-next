import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { progressJobId } from './trash-query-helpers.mjs';

async function waitCleanup(page, id, status, cycle) {
  await page.waitForFunction(
    async ({ id, status, cycle }) => {
      const response = await fetch(`/api/images/${id}/cleanup`);
      if (!response.ok) return false;
      const task = await response.json();
      return task.status === status && task.cycle === cycle;
    },
    { id, status, cycle },
    { timeout: 30000 },
  );
  const response = await page.fetch(`/api/images/${id}/cleanup`);
  assert.equal(response.status, 200);
  return JSON.parse(response.body);
}

async function observeCleanupRequests(page, id) {
  await page.evaluate((id) => {
    const original = window.fetch;
    window.__reviewOriginalFetch = original;
    window.__reviewCleanupRequests = [];
    window.fetch = async (...args) => {
      const path = new URL(String(args[0]), location.href).pathname;
      const method = args[1]?.method ?? 'GET';
      const response = await original(...args);
      if (path.startsWith(`/api/images/${id}/cleanup`) && method === 'POST') {
        window.__reviewCleanupRequests.push({
          path,
          method,
          status: response.status,
          task: await response.clone().json(),
        });
      }
      return response;
    };
  }, id);
}

export async function restoreReviewTraffic(page) {
  await page.evaluate(() => {
    if (window.__reviewOriginalFetch) {
      window.fetch = window.__reviewOriginalFetch;
      delete window.__reviewOriginalFetch;
    }
  });
}

async function makeOriginalFail(fixture) {
  const path = join(fixture.directory, `${fixture.ids[0]}-original.png`);
  const bytes = await readFile(path);
  await rm(path);
  await mkdir(path);
  return { path, bytes };
}

async function restoreOriginal({ path, bytes }) {
  await rm(path, { recursive: true });
  await writeFile(path, bytes);
}

export async function verifyTrashQueryRefresh(context) {
  const { page, peer, config, report, loaded, button, screenshot } = context;
  report.activeCheck = 'review-query-cache';
  const search = 'input[aria-label="搜索回收图片名称"]';
  for (const id of ['issue177-000', 'issue177-001']) {
    await page.fill(search, id);
    await page.keyboard.press('Enter');
    await loaded(1);
  }
  const restore = await peer.fetch('/api/images/batch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ids: ['issue177-000'],
      query: 'scope=trash&q=issue177-000',
      command: { type: 'restore' },
      mode: 'apply',
    }),
  });
  assert.equal(restore.status, 200);
  assert.equal(JSON.parse(restore.body).results[0].status, 'changed');
  await page.fill(search, 'issue177-000');
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-testid="trash-empty"]');
  assert.equal(new URL(await page.url()).searchParams.get('q'), 'issue177-000');
  assert.equal(
    await page.evaluate(
      () => document.querySelector('[data-testid="trash-count"]').textContent,
    ),
    '共 0 项',
  );
  await screenshot('review-query-reapplied-empty', 1440, 'light');
  await page.evaluate(() => history.back());
  await page.waitForFunction(
    () => new URL(location.href).searchParams.get('q') === 'issue177-001',
  );
  await loaded(1);
  assert.ok(
    await page.evaluate(
      () =>
        !!document.querySelector('[data-testid="trash-record-issue177-001"]'),
    ),
  );
  await page.click(button('清除搜索'));
  await loaded(80);
  assert.equal(
    await page.evaluate(
      () => document.querySelector('[data-testid="trash-count"]').textContent,
    ),
    '共 200 项',
  );
  await screenshot('review-query-history-clear', 390, 'dark');
  report.reviewQueryRefresh = {
    restore: JSON.parse(restore.body),
    reappliedTotal: 0,
    historyQuery: 'issue177-001',
    clearedTotal: 200,
    origin: config.origin,
  };
  report.checks.push(
    '另一真实窗口恢复A；本页搜索A→B→A主动重新查询得到空结果，后退恢复B，清空查询显示实际200条。',
  );
}

export async function verifySingleCleanupCycles(context) {
  const { page, peer, config, sql, report, fixture, button, screenshot } =
    context;
  report.activeCheck = 'review-single-cleanup-cycles';
  const id = fixture.ids[0];
  await page.goto(`${config.origin}/trash?image=${id}`);
  await page.waitForSelector('[data-testid="trash-detail"]');
  // Fault the object only after its existing preview has loaded.
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[data-testid="trash-detail"] img')].every(
      (image) => image.complete && image.naturalWidth > 0,
    ),
  );
  const original = await makeOriginalFail(fixture);
  await page.click(button('永久删除'));
  await page.waitForSelector('[data-testid="cleanup-modal"]');
  await page.click('[data-testid="cleanup-submit"]');
  const first = await waitCleanup(peer, id, 'failed', 1);
  await page.waitForFunction(() =>
    document
      .querySelector('[data-testid="cleanup-workspace"]')
      ?.textContent.includes('部分文件清理失败'),
  );
  const secondResponse = await peer.fetch(`/api/images/${id}/cleanup/retry`, {
    method: 'POST',
  });
  assert.equal(secondResponse.status, 202);
  assert.equal(JSON.parse(secondResponse.body).cycle, 2);
  const second = await waitCleanup(peer, id, 'failed', 2);
  await restoreOriginal(original);
  await observeCleanupRequests(page, id);
  await page.click('[data-testid="cleanup-check"]');
  await page.waitForFunction(() => window.__reviewCleanupRequests.length === 1);
  const [thirdResponse] = await page.evaluate(
    () => window.__reviewCleanupRequests,
  );
  assert.equal(thirdResponse.status, 202);
  assert.equal(thirdResponse.task.cycle, 3);
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="cleanup-modal"]')
        ?.textContent.includes('永久删除完成'),
    undefined,
    { timeout: 30000 },
  );
  const third = await waitCleanup(peer, id, 'succeeded', 3);
  assert.equal(
    await page.evaluate(() =>
      document
        .querySelector('[data-testid="cleanup-modal"]')
        .textContent.includes('操作结果待核对'),
    ),
    false,
  );
  assert.equal(
    (
      await sql(`SELECT count(*) AS count FROM media_images WHERE id='${id}'`)
    )[0].count,
    0,
  );
  await screenshot('review-single-cycle-three', 1440, 'light');
  await screenshot('review-single-cycle-three', 390, 'dark');
  report.reviewSingleCycles = { first, second, accepted: thirdResponse, third };
  report.checks.push(
    '单图页面保留失败周期1，另一真实窗口重试并实际失败周期2；修复Local文件后本页202明确受理周期3，自动完成且不误报未知。',
  );
}

export async function verifyBatchCleanupCycles(context) {
  const {
    page,
    peer,
    sql,
    report,
    fixture,
    resize,
    select,
    action,
    waitBatch,
    installBatchTraffic,
    button,
    item,
    screenshot,
  } = context;
  report.activeCheck = 'review-batch-cleanup-cycles';
  const id = fixture.ids[0];
  const original = await makeOriginalFail(fixture);
  await resize(1440);
  await select(0);
  await action('永久删除所选', 1);
  await page.click('[data-testid="trash-batch-submit"]');
  await waitBatch();
  const first = await waitCleanup(peer, id, 'failed', 1);
  await page.waitForFunction(
    (id) =>
      document.querySelector(
        `[data-testid="trash-batch-table"] tr[data-image-id="${id}"]`,
      )?.dataset.state === 'failed',
    id,
  );
  const now = Date.now();
  await sql(
    `INSERT INTO media_jobs (id,image_id,kind,scope,snapshot,expected_versions,status,created_at,updated_at) VALUES ('${progressJobId}','${id}','process','all','{}','[]','running',${now},${now})`,
  );
  await installBatchTraffic();
  await page.click(item('trash-batch-item-retry-cleanup', id));
  await waitBatch();
  const accepted = await page.evaluate(
    () => window.__trashResponses.at(-1).results[0],
  );
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.cleanup.cycle, 2);
  assert.equal(accepted.cleanup.waitingForWrites, true);
  await page.click('[data-testid="trash-batch-done"]');
  await page.waitForSelector('[data-testid="trash-list"]');
  await sql(
    `UPDATE media_jobs SET status='cancelled' WHERE id='${progressJobId}'`,
  );
  const second = await waitCleanup(peer, id, 'failed', 2);
  await restoreOriginal(original);
  const thirdResponse = await peer.fetch(`/api/images/${id}/cleanup/retry`, {
    method: 'POST',
  });
  assert.equal(thirdResponse.status, 202);
  assert.equal(JSON.parse(thirdResponse.body).cycle, 3);
  const third = await waitCleanup(peer, id, 'succeeded', 3);
  await page.click(button('查看本次清理结果'));
  await waitBatch();
  await page.waitForFunction(
    (id) => {
      const row = document.querySelector(
        `[data-testid="trash-batch-table"] tr[data-image-id="${id}"]`,
      );
      return (
        row?.dataset.state === 'succeeded' &&
        [...row.querySelectorAll('dt')].find(
          (term) => term.textContent === '周期',
        )?.nextElementSibling.textContent === '3'
      );
    },
    id,
    { timeout: 15000 },
  );
  const requests = await page.evaluate(() => window.__trashTraffic);
  assert.deepEqual(
    requests
      .filter((request) => request.mode === 'apply')
      .map((request) => request.ids),
    [[id]],
  );
  assert.ok(
    requests
      .filter((request) => request.mode === 'check')
      .every((request) => request.command.type === 'delete-permanent'),
  );
  assert.ok(requests.some((request) => request.mode === 'check'));
  assert.equal(
    (
      await sql(`SELECT count(*) AS count FROM media_images WHERE id='${id}'`)
    )[0].count,
    0,
  );
  await screenshot('review-batch-current-cycle', 1440, 'light');
  await resize(390);
  await page.click(item('trash-batch-item-trigger', id, true));
  await page.waitForFunction(
    (id) =>
      document
        .querySelector(
          `[data-testid="trash-batch-accordion"] [data-testid="trash-batch-item-trigger"][data-image-id="${id}"]`,
        )
        ?.getAttribute('aria-expanded') === 'true',
    id,
  );
  await screenshot('review-batch-current-cycle', 390, 'dark');
  report.reviewBatchCycles = { first, accepted, second, third, requests };
  report.checks.push(
    '批量结果真实周期1失败，本页重试周期2等待写入并返回暂停轮询；另一窗口修复并完成周期3，重开结果只读当前任务，展示周期3成功且无自动重复写入。',
  );
}
