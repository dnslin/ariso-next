import assert from 'node:assert/strict';
import { batchImageId } from './library-batch-fixture.mjs';

/** Hold or discard a real list response after confirmed writes, never replace it with fixture JSON. */
export async function verifyBatchRefreshFeedback(context) {
  const {
    page,
    sql,
    report,
    visit,
    choose,
    action,
    monitor,
    submit,
    done,
    selected,
    visibilityToast,
    observeVisibilitySubmit,
    readVisibilitySubmit,
  } = context;
  const ids = [batchImageId(0), batchImageId(1)];
  report.refreshFeedback = [];
  for (const outcome of ['hold', 'lose']) {
    report.activeCheck = `confirmed-visibility-list-refresh-${outcome}`;
    await sql(
      `UPDATE media_images SET visibility='private' WHERE id IN ('${ids.join("','")}')`,
    );
    await visit();
    const sourceUrl = await page.url();
    for (const index of [0, 1]) await choose(index);
    await action('设为公开', 2);
    await observeVisibilitySubmit();
    await monitor('hold');
    await page.evaluate((outcome) => {
      const original = window.fetch;
      window.__batchRefreshRead = null;
      window.__batchRefreshRelease = null;
      window.fetch = async (...args) => {
        const url = new URL(String(args[0]), location.href);
        if (url.pathname !== '/api/images') return original(...args);
        window.fetch = original;
        const response = await original(...args);
        window.__batchRefreshRead = {
          url: url.href,
          status: response.status,
          outcome,
        };
        if (outcome === 'lose')
          throw new TypeError(
            'Verification: real list refresh response lost after confirmed write',
          );
        await new Promise((resolve) => {
          window.__batchRefreshRelease = resolve;
        });
        return response;
      };
    }, outcome);
    try {
      await page.click(submit);
      await page.waitForFunction(
        () => typeof window.__batchRelease === 'function',
      );
      await page.evaluate(() => window.__batchRelease());
      if (outcome === 'hold') {
        await page.waitForFunction(
          () => typeof window.__batchRefreshRelease === 'function',
        );
        const pending = await page.evaluate(() => ({
          dialog: !!document.querySelector(
            '[role="dialog"][data-testid="library-batch"]',
          ),
          submitDisabled: document.querySelector('[data-testid="batch-submit"]')
            ?.disabled,
          completed: [
            ...document.querySelectorAll('[data-slot="toast-title"]'),
          ].some((node) => node.textContent === '批量设为公开完成'),
        }));
        assert.equal(
          pending.dialog,
          true,
          'Keep confirmation open until the real list refresh finishes',
        );
        assert.equal(pending.submitDisabled, true);
        assert.equal(pending.completed, false);
        await page.evaluate(() => window.__batchRefreshRelease());
        await done();
        await visibilityToast('public', 2, 0, sourceUrl);
      } else {
        await page.waitForFunction(() => {
          const toast = document.querySelector(
            '[data-slot="toast"][data-frontmost="true"]',
          );
          return (
            !document.querySelector('[data-testid="library-batch"]') &&
            toast?.querySelector('[data-slot="toast-title"]')?.textContent ===
              '批量设为公开完成' &&
            toast
              ?.querySelector('[data-slot="toast-description"]')
              ?.textContent.includes('列表刷新失败')
          );
        });
        const description = await page.evaluate(
          () =>
            document.querySelector(
              '[data-slot="toast"][data-frontmost="true"] [data-slot="toast-description"]',
            ).textContent,
        );
        assert.match(description, /2张已修改 · 0张无需修改/);
        assert.match(description, /列表刷新失败/);
        await selected(0);
        assert.equal(await page.url(), sourceUrl);
        await page.waitForFunction(() =>
          document.activeElement?.matches(
            '[data-testid="library-toolbar"] input',
          ),
        );
      }
      const read = await page.evaluate(() => window.__batchRefreshRead);
      assert.equal(
        read.status,
        200,
        'Refresh evidence comes from the successful actual HTTP response',
      );
      await readVisibilitySubmit();
      assert.deepEqual(
        await sql(
          `SELECT id,visibility FROM media_images WHERE id IN ('${ids.join("','")}') ORDER BY id`,
        ),
        ids.map((id) => ({ id, visibility: 'public' })),
      );
      report.refreshFeedback.push(read);
    } finally {
      await page.evaluate(() => {
        window.__batchRefreshRelease?.();
        window.__visibilityObserver?.disconnect();
      });
    }
  }
  report.checks.push(
    'Confirmed real writes wait for a held successful list GET before completion; losing that successful GET retains truthful write counts and explains refresh failure, closes the workspace and returns focus without pretending the writes failed.',
  );
}
