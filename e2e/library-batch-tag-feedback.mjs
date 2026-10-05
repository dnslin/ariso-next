import assert from 'node:assert/strict';
import { batchImageId, batchTagIds } from './library-batch-fixture.mjs';

export async function tagCompletion(
  context,
  type,
  changed,
  unchanged,
  sourceUrl,
) {
  const { page, selected, report } = context;
  const title = type === 'add-tags' ? '添加标签完成' : '移除标签完成';
  const description = `${changed}张已修改 · ${unchanged}张无需修改`;
  report.tagCompletionStep = 'notification';
  await page.waitForFunction(
    ({ title, description }) => {
      const toast = document.querySelector(
        '[data-slot="toast"][data-frontmost="true"]',
      );
      return (
        !document.querySelector('[data-testid="library-batch"]') &&
        toast?.querySelector('[data-slot="toast-title"]')?.textContent ===
          title &&
        toast?.querySelector('[data-slot="toast-description"]')?.textContent ===
          description
      );
    },
    { title, description },
  );
  await selected(0);
  assert.equal(await page.url(), sourceUrl);
  report.tagCompletionStep = 'source-focus';
  await page.waitForFunction(() =>
    document.activeElement?.matches('[data-testid="library-toolbar"] input'),
  );
  report.tagCompletionStep = 'complete';
  return { title, description, sourceUrl };
}

export async function submitTagsWithToast(context, type, count, sourceUrl) {
  const { page, submit, monitor, done } = context;
  await page.evaluate(() => {
    window.__tagSubmitTransitions = [];
    window.__tagSubmitObserver = new MutationObserver(() => {
      const workspace = document.querySelector('[data-testid="library-batch"]');
      if (workspace && workspace.dataset.batchView !== 'tag-choose')
        window.__tagSubmitTransitions.push(
          workspace.querySelector('h1')?.textContent,
        );
    });
    window.__tagSubmitObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-batch-view'],
    });
  });
  try {
    await monitor('hold');
    await page.click(submit);
    await page.waitForFunction(
      () => typeof window.__batchRelease === 'function',
    );
    const pending = await page.evaluate(() => ({
      view: document.querySelector('[data-testid="library-batch"]')?.dataset
        .batchView,
      busy: document
        .querySelector('[data-testid="library-batch"]')
        ?.getAttribute('aria-busy'),
      submitDisabled: document.querySelector('[data-testid="batch-submit"]')
        ?.disabled,
      searchDisabled: document.querySelector('input[aria-label="搜索目标标签"]')
        ?.disabled,
      targetDisabled: [
        ...document.querySelectorAll('[data-target-id] input'),
      ].every((node) => node.disabled),
      targetCount: document.querySelectorAll('[data-target-id] input').length,
    }));
    assert.equal(pending.view, 'tag-choose');
    assert.equal(pending.busy, 'true');
    assert.equal(pending.submitDisabled, true);
    assert.equal(pending.searchDisabled, true);
    assert.ok(pending.targetCount > 0);
    assert.equal(pending.targetDisabled, true);
    await page.evaluate(() => window.__batchRelease());
    await done();
    const feedback = await tagCompletion(context, type, count, 0, sourceUrl);
    const transitions = await page.evaluate(
      () => window.__tagSubmitTransitions,
    );
    assert.deepEqual(
      transitions,
      [],
      'Successful tag writes keep the chooser until returning with Toast, without flashing a success result',
    );
    return { pending, feedback, transitions };
  } finally {
    await page.evaluate(() => window.__tagSubmitObserver?.disconnect());
  }
}

async function prepareTagCommand(context, type) {
  const { sql, visit, choose, action, target, page } = context;
  const ids = [batchImageId(0), batchImageId(1)];
  if (type === 'remove-tags')
    await sql(
      `INSERT INTO image_tags(image_id,tag_id) VALUES ${ids.map((id) => `('${id}','${batchTagIds[0]}')`).join(',')}`,
    );
  await visit();
  const sourceUrl = await page.url();
  for (const index of [0, 1]) await choose(index);
  await action(type === 'add-tags' ? '添加标签' : '移除标签', 2);
  await target(batchTagIds[0]);
  return { ids, sourceUrl };
}

async function assertNoTagToast(page) {
  assert.equal(
    await page.evaluate(() =>
      [...document.querySelectorAll('[data-slot="toast-title"]')].some((node) =>
        ['添加标签完成', '移除标签完成'].includes(node.textContent),
      ),
    ),
    false,
  );
}

export async function verifyTagFailures(context, type) {
  const { page, sql, report, submit, monitor, done, expectResults, traffic } =
    context;
  const { ids, sourceUrl } = await prepareTagCommand(context, type);
  report.activeCheck = `${type}-known-failure-and-explicit-retry`;
  const operation = type === 'add-tags' ? 'INSERT' : 'DELETE';
  const row = type === 'add-tags' ? 'NEW' : 'OLD';
  await sql(
    `CREATE TRIGGER issue177_tag_failure BEFORE ${operation} ON image_tags WHEN ${row}.image_id='${ids[1]}' BEGIN SELECT RAISE(ABORT, 'Issue 177 actual per-image tag failure'); END`,
  );
  try {
    await monitor();
    await page.click(submit);
    await done();
    const results = await expectResults({ changed: 1, failed: 1 });
    assert.equal(results[1].inQuery, true);
    assert.equal(
      await page.evaluate(
        () => !!document.querySelector('[data-testid="library-batch"]'),
      ),
      true,
    );
    await assertNoTagToast(page);
    await sql('DROP TRIGGER issue177_tag_failure');
    await page.click('[data-testid="batch-retained"]');
    await page.waitForSelector('[data-testid="batch-retry"]');
    assert.equal(
      (await traffic()).length,
      1,
      'Viewing retained tag failures does not submit another request',
    );
    await page.click('[data-testid="batch-retry"]');
    await done();
    const sent = await traffic();
    assert.equal(sent.length, 2);
    assert.deepEqual(sent[1].request.ids, [ids[1]]);
    assert.deepEqual(sent[1].request.command, sent[0].request.command);
    assert.equal(sent[1].response.results[0].status, 'changed');
    await tagCompletion(context, type, 1, 0, sourceUrl);
    const joins = await sql(
      `SELECT image_id FROM image_tags WHERE tag_id='${batchTagIds[0]}' ORDER BY image_id`,
    );
    assert.deepEqual(
      joins,
      type === 'add-tags' ? ids.map((image_id) => ({ image_id })) : [],
    );
    report.checks.push(
      `${type}: actual per-image SQL failure retains its result and valid selection without success Toast; explicit retry sends only the failed ID, persists the requested relationship, returns to the original page and restores focus with truthful Toast counts.`,
    );
  } finally {
    await sql('DROP TRIGGER IF EXISTS issue177_tag_failure');
  }
}

export async function verifyTagUnknown(context, type) {
  const { page, report, submit, monitor, traffic, done } = context;
  const { ids, sourceUrl } = await prepareTagCommand(context, type);
  report.activeCheck = `${type}-lost-response-and-read-only-check`;
  await monitor('lose');
  await page.click(submit);
  await page.waitForSelector('[data-testid="batch-check"]');
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="library-batch"]')
        ?.getAttribute('aria-busy') === 'false',
  );
  await assertNoTagToast(page);
  const lost = await traffic();
  assert.equal(
    lost.length,
    1,
    'Unknown tag outcomes do not automatically replay the write or check',
  );
  assert.deepEqual(lost[0].request.ids, ids);
  assert.ok(
    lost[0].response.results.every((result) => result.status === 'changed'),
  );
  assert.equal(
    await page.evaluate(
      () => document.querySelectorAll('[data-result-status="unknown"]').length,
    ),
    2,
  );
  await page.click('[data-testid="batch-check"]');
  await done();
  const checked = await traffic();
  assert.deepEqual(
    checked.map((entry) => entry.request.mode),
    ['apply', 'check'],
  );
  assert.deepEqual(checked[1].request.ids, ids);
  assert.ok(
    checked[1].response.results.every(
      (result) => result.status === 'unchanged',
    ),
  );
  await tagCompletion(context, type, 0, 2, sourceUrl);
  report.checks.push(
    `${type}: a lost successful real response preserves two unknown results; explicit read-only check confirms the same IDs without repeating the mutation, then returns with two confirmed unchanged items and restored focus.`,
  );
}
