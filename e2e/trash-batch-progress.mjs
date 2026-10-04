import assert from 'node:assert/strict';
import { progressJobId } from './trash-query-helpers.mjs';

export async function verifyApprovedProgress(context) {
  const {
    page,
    sql,
    report,
    fixture,
    resize,
    select,
    action,
    waitBatch,
    restoreBatchTraffic,
    item,
    screenshot,
  } = context;
  report.activeCheck = 'approved-progress-submitting';
  const id = fixture.ids[0];
  const now = Date.now();
  await sql(
    `INSERT INTO media_jobs (id,image_id,kind,scope,snapshot,expected_versions,status,created_at,updated_at) VALUES ('${progressJobId}','${id}','process','all','{}','[]','running',${now},${now})`,
  );
  await resize(1440);
  await select(0);
  await action('永久删除所选', 1);
  await page.waitForSelector('[data-testid="trash-batch-confirm"]');
  await page.evaluate(() => {
    const original = window.fetch;
    window.__trashOriginalFetch = original;
    window.__trashTraffic = [];
    window.__trashProgressReceived = false;
    window.fetch = async (...args) => {
      const path = new URL(String(args[0]), location.href).pathname;
      if (path !== '/api/images/batch') return original(...args);
      const body = JSON.parse(args[1].body);
      window.__trashTraffic.push(body);
      const response = await original(...args);
      if (body.mode === 'apply') {
        window.__trashProgressActualResponse = await response.clone().json();
        await new Promise((resolve) => {
          window.__trashProgressRelease = resolve;
          window.__trashProgressReceived = true;
        });
      }
      return response;
    };
  });
  await page.click('[data-testid="trash-batch-submit"]');
  await page.waitForFunction(
    () =>
      window.__trashProgressReceived &&
      document
        .querySelector('[data-testid="trash-batch"]')
        ?.getAttribute('aria-busy') === 'true',
  );
  const accepted = await page.evaluate(
    () => window.__trashProgressActualResponse.results[0],
  );
  assert.equal(accepted.id, id);
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.cleanup.status, 'queued');
  assert.equal(accepted.cleanup.waitingForWrites, true);
  assert.deepEqual(
    await page.evaluate(() =>
      window.__trashTraffic.map((request) => ({
        ids: request.ids,
        mode: request.mode,
      })),
    ),
    [{ ids: [id], mode: 'apply' }],
  );
  await page.waitForSelector(
    '[data-testid="trash-batch"] [data-slot="spinner"]',
  );
  assert.equal(
    await page.evaluate(
      (id) =>
        document.querySelector(
          `[data-testid="trash-batch-table"] tr[data-image-id="${id}"]`,
        )?.dataset.state,
      id,
    ),
    'waiting',
  );
  async function pictures(state) {
    for (const width of [1440, 390]) {
      await resize(width);
      if (width === 390) {
        const trigger = item('trash-batch-item-trigger', id, true);
        const expanded = await page.evaluate(
          (selector) =>
            document.querySelector(selector)?.getAttribute('aria-expanded'),
          trigger,
        );
        if (expanded !== 'true') await page.click(trigger);
        await page.waitForFunction(
          (selector) =>
            document.querySelector(selector)?.getAttribute('aria-expanded') ===
            'true',
          trigger,
        );
      }
      for (const mode of ['light', 'dark'])
        await screenshot(state, width, mode);
    }
  }
  await pictures('approved-progress-submitting');
  await page.evaluate(() => window.__trashProgressRelease());
  await waitBatch();
  await restoreBatchTraffic();
  report.activeCheck = 'approved-progress-waiting-for-writes';
  await page.waitForFunction(
    (id) =>
      document.querySelector(
        `[data-testid="trash-batch-table"] tr[data-image-id="${id}"]`,
      )?.dataset.state === 'queued',
    id,
  );
  const queued = JSON.parse(
    (await page.fetch(`/api/images/${id}/cleanup`)).body,
  );
  assert.equal(queued.status, 'queued');
  assert.equal(queued.waitingForWrites, true);
  assert.equal(queued.remaining.length, 2);
  assert.ok(
    await page.evaluate(
      (id) =>
        document
          .querySelector(
            `[data-testid="trash-batch-table"] tr[data-image-id="${id}"]`,
          )
          ?.textContent.includes('等待写入结束'),
      id,
    ),
  );
  await pictures('approved-progress-waiting-for-writes');
  // The accepted task already owns both real files. Defer only the original's
  // next attempt; the production worker alone updates cleanup task status.
  await sql(
    `UPDATE media_objects SET next_cleanup_at=${Date.now() + 300000} WHERE image_id='${id}' AND purpose='original'`,
  );
  await sql(
    `UPDATE media_jobs SET status='cancelled' WHERE id='${progressJobId}'`,
  );
  report.activeCheck = 'approved-progress-running';
  await page.waitForFunction(
    async (id) => {
      const response = await fetch(`/api/images/${id}/cleanup`);
      if (!response.ok) return false;
      const task = await response.json();
      return (
        task.status === 'running' &&
        task.deletedObjects === 1 &&
        task.remaining.length === 1
      );
    },
    id,
    { timeout: 30000 },
  );
  await page.waitForFunction((id) => {
    const row = document.querySelector(
      `[data-testid="trash-batch-table"] tr[data-image-id="${id}"]`,
    );
    return (
      row?.dataset.state === 'running' &&
      row.textContent.includes('已清理 1 / 2 个对象')
    );
  }, id);
  const running = JSON.parse(
    (await page.fetch(`/api/images/${id}/cleanup`)).body,
  );
  assert.equal(running.status, 'running');
  assert.equal(running.waitingForWrites, false);
  assert.equal(running.deletedObjects, 1);
  assert.equal(running.totalObjects, 2);
  assert.equal(running.remaining.length, 1);
  assert.equal(running.remaining[0].purpose, 'original');
  assert.ok(running.remaining[0].nextAttemptAt);
  await pictures('approved-progress-running');
  await sql(
    `UPDATE media_objects SET next_cleanup_at=NULL WHERE image_id='${id}'`,
  );
  await page.waitForFunction(
    (id) =>
      document.querySelector(
        `[data-testid="trash-batch-table"] tr[data-image-id="${id}"]`,
      )?.dataset.state === 'succeeded',
    id,
    { timeout: 30000 },
  );
  const succeeded = JSON.parse(
    (await page.fetch(`/api/images/${id}/cleanup`)).body,
  );
  assert.equal(succeeded.status, 'succeeded');
  assert.equal(succeeded.waitingForWrites, false);
  assert.equal(succeeded.remaining.length, 0);
  assert.equal(
    (
      await sql(`SELECT count(*) AS count FROM media_images WHERE id='${id}'`)
    )[0].count,
    0,
  );
  report.progressTasks = {
    accepted: accepted.cleanup,
    queued,
    running,
    succeeded,
  };
  report.checks.push(
    '一项真实永久删除：只延迟已收到的真实受理响应保留提交中Spinner；活动写责任保持queued等待；未来next_cleanup_at使production worker进入running并真实清理1/2；到期后实际完成。Table/展开Accordion各浅深截图，不写清理任务状态或伪造HTTP。',
  );
}
