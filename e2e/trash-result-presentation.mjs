import assert from 'node:assert/strict';

export async function verifyResultPresentation(context, total) {
  const { page, report, resize, screenshot, item, resultPage } = context;
  await resize(1440);
  await page.waitForSelector('[data-testid="trash-batch-table"] table');
  const desktop = await page.evaluate(() => ({
    rows: document.querySelectorAll(
      '[data-testid="trash-batch-table"] tr[data-image-id]',
    ).length,
    accordionHidden:
      document
        .querySelector('[data-testid="trash-batch-accordion"]')
        .getBoundingClientRect().height === 0,
    duplicateSummary: [
      ...document.querySelectorAll('[data-testid="trash-batch"] dl'),
    ].some((dl) => !dl.closest('[data-testid="trash-batch-item-details"]')),
    permanentExplanation: document
      .querySelector('[data-testid="trash-batch"]')
      .textContent.includes('任务受理后不可恢复。仅处理本次选定'),
  }));
  assert.equal(desktop.rows, Math.min(20, total));
  assert.equal(desktop.accordionHidden, true);
  assert.equal(desktop.duplicateSummary, false);
  assert.equal(desktop.permanentExplanation, false);
  await screenshot('approved-results-table', 1440, 'light');
  await screenshot('approved-results-table', 1440, 'dark');
  await resize(390);
  const accordion = '[data-testid="trash-batch-accordion"]';
  const triggers = await page.evaluate(
    (accordion) =>
      [
        ...document.querySelectorAll(
          `${accordion} [data-testid="trash-batch-item-trigger"]`,
        ),
      ].map((trigger) => ({
        id: trigger.dataset.imageId,
        expanded: trigger.getAttribute('aria-expanded'),
        height: trigger.getBoundingClientRect().height,
        minHeight: getComputedStyle(trigger).minHeight,
      })),
    accordion,
  );
  assert.equal(triggers.length, Math.min(20, total));
  report.accordionTriggers = triggers;
  assert.ok(
    triggers.every(
      (trigger) => trigger.height >= 44 && trigger.expanded === 'false',
    ),
  );
  assert.ok(
    triggers.every((trigger) => trigger.height >= 80),
    `Approved short-name accordion items must be at least 80px: ${JSON.stringify(triggers)}`,
  );
  const first = item('trash-batch-item-trigger', triggers[0].id, true);
  const second = item('trash-batch-item-trigger', triggers[1].id, true);
  await page.focus(first);
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    (id) =>
      document
        .querySelector(
          `[data-testid="trash-batch-accordion"] [data-testid="trash-batch-item-trigger"][data-image-id="${id}"]`,
        )
        ?.getAttribute('aria-expanded') === 'true',
    triggers[0].id,
  );
  await page.focus(second);
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    (id) =>
      document
        .querySelector(
          `[data-testid="trash-batch-accordion"] [data-testid="trash-batch-item-trigger"][data-image-id="${id}"]`,
        )
        ?.getAttribute('aria-expanded') === 'true',
    triggers[1].id,
  );
  assert.deepEqual(
    await page.evaluate(
      (accordion) =>
        [
          ...document.querySelectorAll(`${accordion} [aria-expanded="true"]`),
        ].map((trigger) => trigger.dataset.imageId),
      accordion,
    ),
    [triggers[1].id],
  );
  await screenshot('approved-results-accordion', 390, 'light');
  await screenshot('approved-results-accordion', 390, 'dark');
  await screenshot('approved-results-accordion-short', 360, 'light', 430);
  await page.focus(second);
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    (id) =>
      document
        .querySelector(
          `[data-testid="trash-batch-accordion"] [data-testid="trash-batch-item-trigger"][data-image-id="${id}"]`,
        )
        ?.getAttribute('aria-expanded') === 'false',
    triggers[1].id,
  );
  await resize(1440);
  await resultPage(2);
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelectorAll(
          '[data-testid="trash-batch-table"] tr[data-image-id]',
        ).length,
    ),
    Math.min(20, total - 20),
  );
  await screenshot('approved-results-page-2', 1440, 'light');
  await resultPage(1);
  report.checks.push(
    '真实桌面Table、手机Accordion键盘Enter及单项展开、44px目标、20项结果分页；汇总仅一处且无常驻确认说明。',
  );
}
