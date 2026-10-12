import assert from 'node:assert/strict';
import { batchImageId, batchTagIds } from './library-batch-fixture.mjs';

export async function tagCompletion(
  context,
  type,
  changed,
  unchanged,
  sourceUrl,
  selectionCount = changed + unchanged,
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
  await selected(selectionCount);
  assert.equal(await page.url(), sourceUrl);
  report.tagCompletionStep = 'source-focus';
  await page.waitForFunction(
    (label) => document.activeElement?.getAttribute('aria-label') === label,
    type === 'add-tags' ? '添加标签' : '更多图片操作',
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
      if (workspace && workspace.dataset.batchPhase !== 'choose')
        window.__tagSubmitTransitions.push(
          workspace.querySelector('h1')?.textContent,
        );
    });
    window.__tagSubmitObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-batch-phase'],
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
        .batchPhase,
      busy: document
        .querySelector('[data-testid="library-batch"] [aria-busy]')
        ?.getAttribute('aria-busy'),
      submitDisabled: document.querySelector('[data-testid="batch-submit"]')
        ?.disabled,
      searchDisabled: document.querySelector('input[aria-label="搜索目标标签"]')
        ?.disabled,
      targetDisabled: [
        ...document.querySelectorAll('[data-target-id] input'),
      ].every((node) => node.disabled),
      targetCount: document.querySelectorAll('[data-target-id] input').length,
      source: (() => {
        const source = document.querySelector(
          '[data-testid="library-selection"] button[aria-label="添加标签"]',
        );
        return {
          disabled: source.disabled,
          pending: source.getAttribute('data-pending'),
          ariaDisabled: source.getAttribute('aria-disabled'),
        };
      })(),
    }));
    assert.equal(pending.view, 'choose');
    assert.equal(pending.busy, 'true');
    assert.equal(pending.submitDisabled, true);
    assert.equal(pending.searchDisabled, true);
    assert.ok(pending.targetCount > 0);
    assert.equal(pending.targetDisabled, true);
    assert.deepEqual(pending.source, {
      disabled: false,
      pending: 'true',
      ariaDisabled: 'true',
    });
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
  await page.fill('input[aria-label="搜索目标标签"]', 'Issue 177 标签');
  await page.waitForSelector(`[data-target-id="${batchTagIds[0]}"]`);
  if (type === 'add-tags')
    await page.fill(
      '[data-testid="batch-create-tag"] input',
      '失败时保留的新标签草稿',
    );
  return { ids, sourceUrl };
}

async function assertRetainedTagDraft(page, type) {
  assert.equal(
    await page.evaluate(
      () => document.querySelector('input[aria-label="搜索目标标签"]').value,
    ),
    'Issue 177 标签',
  );
  assert.equal(
    await page.evaluate(
      (id) => document.querySelector(`[data-target-id="${id}"] input`).checked,
      batchTagIds[0],
    ),
    true,
  );
  if (type === 'add-tags')
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector('[data-testid="batch-create-tag"] input')
            .value,
      ),
      '失败时保留的新标签草稿',
    );
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
    await assertRetainedTagDraft(page, type);
    await assertNoTagToast(page);
    await sql('DROP TRIGGER issue177_tag_failure');
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
    await tagCompletion(context, type, 1, 0, sourceUrl, 2);
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
  const { page, report, submit, monitor, traffic, done, layouts, resize } =
    context;
  const { ids, sourceUrl } = await prepareTagCommand(context, type);
  report.activeCheck = `${type}-lost-response-and-read-only-check`;
  await monitor('lose');
  await page.click(submit);
  await page.waitForSelector('[data-testid="batch-check"]');
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="library-batch"] [aria-busy]')
        ?.getAttribute('aria-busy') === 'false',
  );
  await assertRetainedTagDraft(page, type);
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
  await page.evaluate(() => {
    window.__batchFault = 'check-lose';
  });
  await page.click('[data-testid="batch-check"]');
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="batch-check"]')?.textContent ===
        '再次核对' &&
      document.querySelector('[data-testid="batch-check"]')?.disabled === false,
  );
  await resize(1440);
  for (const dismiss of ['close', 'footer', 'escape', 'backdrop']) {
    report.tagUnknownStep = `${type}-${dismiss}-ready`;
    await page.focus('button[aria-label="关闭批量操作"]');
    await page.waitForFunction(() => {
      const drawer = document.querySelector('[data-slot="drawer-dialog"]');
      const backdrop = drawer?.closest('[data-slot="drawer-backdrop"]');
      return (
        drawer?.contains(document.activeElement) &&
        backdrop &&
        !backdrop.hasAttribute('data-entering') &&
        !backdrop.hasAttribute('data-exiting')
      );
    });
    report.tagUnknownStep = `${type}-${dismiss}-dismiss`;
    if (dismiss === 'close')
      await page.click('button[aria-label="关闭批量操作"]');
    else if (dismiss === 'footer')
      await page.click('[data-testid="batch-return"]');
    else if (dismiss === 'escape') await page.keyboard.press('Escape');
    else {
      const point = await page.evaluate(() => {
        const bounds = document
          .querySelector('[data-slot="drawer-dialog"]')
          .getBoundingClientRect();
        return { x: bounds.left / 2, y: bounds.top + 40 };
      });
      await page.mouse.click(point.x, point.y, {
        label: 'close unknown tag drawer',
      });
    }
    await page.waitForSelector('[data-testid="library-batch"]', {
      state: 'hidden',
    });
    await page.waitForFunction(
      () => !document.querySelector('[data-slot="drawer-backdrop"]'),
    );
    report.tagUnknownStep = `${type}-${dismiss}-reopen`;
    assert.equal(await page.url(), sourceUrl);
    await page.focus('[data-testid="library-toolbar"] input');
    await page.keyboard.press('Tab');
    assert.equal(
      await page.evaluate(
        () => !!document.activeElement?.closest('[role="dialog"]'),
      ),
      false,
      `${dismiss}: closing the drawer releases the background focus trap`,
    );
    await page.click('loc=role:button[name="查看待核对结果"]');
    await page.waitForSelector('[data-testid="batch-check"]');
    await assertRetainedTagDraft(page, type);
    assert.deepEqual(
      await page.evaluate(() => ({
        check: document.querySelector('[data-testid="batch-check"]')
          ?.textContent,
        unknown: document.querySelectorAll('[data-result-status="unknown"]')
          .length,
        submit: !!document.querySelector('[data-testid="batch-submit"]'),
      })),
      { check: '再次核对', unknown: 2, submit: false },
    );
    assert.equal(
      (await traffic()).length,
      2,
      'Hide/reopen sends no batch request',
    );
  }
  report.tagUnknownStep = `${type}-layouts`;
  await layouts(`${type}-unknown-reopened`);
  report.tagUnknownStep = `${type}-final-check`;
  await page.click('[data-testid="batch-check"]');
  await done();
  const checked = await traffic();
  assert.deepEqual(
    checked.map((entry) => entry.request.mode),
    ['apply', 'check', 'check'],
  );
  assert.deepEqual(checked[1].request.ids, ids);
  assert.deepEqual(checked[2].request.ids, ids);
  assert.ok(
    checked[2].response.results.every(
      (result) => result.status === 'unchanged',
    ),
  );
  await tagCompletion(context, type, 0, 2, sourceUrl);
  report.tagUnknownStep = `${type}-complete`;
  report.checks.push(
    `${type}: lost apply/check responses preserve the frozen result and chooser draft; X, footer, Escape and backdrop each release the modal and reopen without replaying a write. Explicit read-only recheck confirms the same IDs, returns with truthful unchanged counts and restores focus.`,
  );
}
