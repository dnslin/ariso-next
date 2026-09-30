import assert from 'node:assert/strict';

export async function verifyDetailReconciliation({
  page,
  config,
  sql,
  report,
  imageId = 'library-007',
}) {
  const [record] = await sql(
    `SELECT display_name FROM media_images WHERE id = '${imageId}'`,
  );
  await page.goto(`${config.origin}/library?image=${imageId}`);
  await page.waitForSelector('[data-testid="detail-body"]');
  await page.click('loc=role:button[name="删除图片"]');
  await page.waitForSelector('[data-testid="trash-confirm"]');
  await sql(
    `UPDATE media_images SET display_name = '核对后的真实名称.png' WHERE id = '${imageId}'`,
  );
  await page.evaluate((id) => {
    const original = window.fetch;
    let reads = 0;
    window.__reconciliationReads = [];
    window.__restoreReconciliation = () => {
      window.fetch = original;
      window.__reconciliationReads.forEach((resolve) => resolve());
    };
    window.fetch = async (...args) => {
      const path = new URL(String(args[0]), location.href).pathname;
      if (path === `/api/images/${id}/trash`)
        throw new TypeError('Verification: write never reached server');
      const response = await original(...args);
      if (path === `/api/images/${id}` && ++reads > 1)
        await new Promise((resolve) =>
          window.__reconciliationReads.push(resolve),
        );
      return response;
    };
  }, imageId);
  try {
    await page.click('loc=role:button[name="确认删除图片"]');
    await page.waitForFunction(() =>
      document
        .querySelector('[data-testid="trash-confirm"]')
        ?.textContent.includes('记录状态尚未改变'),
    );
    await page.click('loc=role:button[name="关闭"]');
    await page.waitForSelector('[data-testid="trash-confirm"]', {
      state: 'hidden',
    });
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector('[data-testid="detail-body"] h2')?.textContent,
      ),
      '核对后的真实名称.png',
      'Reconciliation updates the visible detail cache before any later fetch completes',
    );
    report.checks.push(
      'A rejected write reconciles the real renamed record into the visible detail cache while later background reads remain held.',
    );
  } finally {
    await page.evaluate(() => window.__restoreReconciliation());
    await sql(
      `UPDATE media_images SET display_name = '${record.display_name.replaceAll("'", "''")}' WHERE id = '${imageId}'`,
    );
  }
}
