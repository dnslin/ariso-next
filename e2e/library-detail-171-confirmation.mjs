import assert from 'node:assert/strict';
import { join } from 'node:path';
import { verifyDetail171Focus } from './library-detail-171-focus.mjs';
import {
  image,
  endpoint,
  workspace,
  confirmation,
  versionNames,
  openDetail171,
  readProcessingSettings,
  enableProcessing,
  restoreProcessingSettings,
  setDetail171Theme,
  setDetail171Viewport,
} from './library-detail-171-helpers.mjs';
import {
  verifyReprocessLayout,
  measureReprocessConfirmation,
} from './library-detail-171-layouts.mjs';

export async function verifyDetail171Confirmation({
  page,
  config,
  sql,
  report,
}) {
  const settings = await readProcessingSettings(sql);
  try {
    await enableProcessing(sql);
    await verifyDetail171Focus({ page, config, sql, report });
    await openDetail171(page, config);
    await page.waitForSelector(`${workspace} [role="radiogroup"]`);
    assert.equal(
      await page.evaluate(() => document.activeElement?.dataset.testid),
      'detail-workspace-title',
    );
    await verifyReprocessLayout(
      { page, config, report },
      'reprocess-selection',
      [360, 390, 430, 768, 1440],
    );
    const selectionDetail = JSON.parse((await page.fetch(endpoint)).body);
    await page.evaluate((image) => {
      const original = window.fetch;
      window.__detail171ConfirmationFetch = original;
      window.__detail171ConfirmationPosts = 0;
      window.fetch = (...args) => {
        if (
          new URL(String(args[0]), location.href).pathname ===
            `/api/images/${image}/reprocess` &&
          args[1]?.method === 'POST'
        )
          window.__detail171ConfirmationPosts++;
        return original(...args);
      };
    }, image);
    const assertSelected = async (scope) => {
      await page.waitForSelector(confirmation, { state: 'hidden' });
      await page.waitForFunction(
        (scope) =>
          document.activeElement ===
          document.querySelector(
            `[data-testid="reprocess-scope-${scope}"] input`,
          ),
        scope,
      );
      assert.equal(
        await page.evaluate(
          (scope) =>
            document.querySelector(
              `[data-testid="reprocess-scope-${scope}"] input`,
            ).checked,
          scope,
        ),
        true,
      );
      assert.equal(
        await page.evaluate(() =>
          document
            .querySelector('.shell-footer [data-testid="reprocess-submit"]')
            .textContent.trim(),
        ),
        `重新生成${versionNames[scope]}`,
      );
      assert.equal(
        await page.evaluate(() => window.__detail171ConfirmationPosts),
        0,
        'Choosing, canceling and reopening confirmation never submits a job',
      );
    };
    for (const scope of ['compressed', 'watermark', 'thumbnail']) {
      await page.focus(`[data-testid="reprocess-scope-${scope}"] input`);
      await page.keyboard.press('Space');
      await page.waitForSelector(confirmation);
      await page.waitForFunction(
        () =>
          document.activeElement?.textContent.trim() === '取消' &&
          !!document.activeElement.closest(
            '[data-testid="reprocess-confirmation"]',
          ),
      );
      assert.equal(
        await page.evaluate(() => !!document.querySelector('.shell-footer')),
        false,
        `${scope} confirmation removes the whole page footer`,
      );
      const content = await page.evaluate(() => {
        const dialog = document.querySelector(
          '[data-testid="reprocess-confirmation"]',
        );
        const rows = [...dialog.querySelectorAll('dt')].map((node) => [
          node.textContent.trim(),
          node.nextElementSibling.textContent.trim(),
        ]);
        return {
          heading: dialog
            .querySelector('[data-slot="alert-dialog-heading"]')
            .textContent.trim(),
          rows,
          backgroundTitle: document
            .querySelector('[data-testid="detail-workspace-title"]')
            .textContent.trim(),
          fullPageConfirmation: document
            .querySelector('[data-testid="detail-reprocess"]')
            .innerText.includes('本次范围：'),
        };
      });
      assert.equal(content.heading, `重新生成${versionNames[scope]}`);
      assert.equal(content.backgroundTitle, '重新处理这张图片');
      assert.equal(content.fullPageConfirmation, false);
      assert.deepEqual(content.rows, [
        ['更新', versionNames[scope]],
        [
          '保留',
          selectionDetail.versions
            .filter((version) => version.saved && version.kind !== scope)
            .map((version) => versionNames[version.kind])
            .join('、') || '无其他已保存版本',
        ],
      ]);
      if (scope === 'thumbnail') {
        await verifyReprocessLayout(
          { page, config, report },
          'reprocess-confirm-thumbnail',
        );
        for (const height of [400, 280]) {
          await setDetail171Viewport(page, 390, height);
          const measured = await measureReprocessConfirmation(page);
          const scroll = await page.evaluate(() => {
            const main = document.querySelector('main');
            const before = main.scrollTop;
            const body = document.querySelector(
              '[data-testid="reprocess-confirmation"] [data-slot="alert-dialog-body"]',
            );
            body.scrollTop = body.scrollHeight;
            return {
              overflowing: body.scrollHeight > body.clientHeight + 1,
              scrolled: body.scrollTop > 0,
              mainUnchanged: main.scrollTop === before,
            };
          });
          if (height === 280) assert.equal(scroll.overflowing, true);
          if (scroll.overflowing) assert.equal(scroll.scrolled, true);
          assert.equal(
            scroll.mainUnchanged,
            true,
            'Short confirmation scrolls its own body',
          );
          await page.screenshot({
            path: join(
              config.output,
              `detail-171-reprocess-confirm-short-dark-390-${height}.png`,
            ),
          });
          report.layouts.push({
            state: 'detail-171-reprocess-confirm-short',
            theme: 'dark',
            ...measured,
            scroll,
          });
        }
      }
      if (scope === 'compressed')
        await page.click(
          `${confirmation} [data-slot="alert-dialog-footer"] button:first-child`,
        );
      else await page.keyboard.press('Escape');
      await assertSelected(scope);
      // The retained single scope opens the same small dialog from the footer.
      await page.click('.shell-footer [data-testid="reprocess-submit"]');
      await page.waitForSelector(confirmation);
      await page.waitForFunction(
        () =>
          document.activeElement?.textContent.trim() === '取消' &&
          !!document.activeElement.closest(
            '[data-testid="reprocess-confirmation"]',
          ),
      );
      assert.equal(
        await page.evaluate(() => !!document.querySelector('.shell-footer')),
        false,
        `Reopening ${scope} confirmation also removes the whole page footer`,
      );
      await page.keyboard.press('Escape');
      await assertSelected(scope);
    }
    await page.evaluate(() => {
      window.fetch = window.__detail171ConfirmationFetch;
      delete window.__detail171ConfirmationFetch;
      delete window.__detail171ConfirmationPosts;
    });
    await setDetail171Viewport(page, 390);
    await page.click('[data-testid="reprocess-scope-all"]');
    await page.waitForSelector(confirmation, { state: 'hidden' });
    report.checks.push(
      'Single-version selection opens a small real AlertDialog with saved-version update/retain rows and cancel autofocus; cancel/Escape preserve scope, restore its input focus, make no POST, and the retained-scope footer reopens confirmation. Desktop/phone light-dark dialog fits its viewport, hides the shell footer, and short-view content scrolls inside the dialog while both 48px actions stay reachable.',
    );

    const created = await page.fetch('/api/albums', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '单项确认底栏回归' }),
    });
    assert.equal(created.status, 201);
    const albumId = JSON.parse(created.body).album.id;
    try {
      const membership = await page.fetch(`${endpoint}/collections`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          albumIds: [
            ...selectionDetail.albums.map((album) => album.id),
            albumId,
          ],
        }),
      });
      assert.equal(membership.status, 200);
      for (const theme of ['light', 'dark']) {
        await setDetail171Theme(page, theme);
        for (const width of [1440, 390]) {
          await setDetail171Viewport(page, width);
          await page.goto(
            `${config.origin}/albums/${albumId}?image=${image}&detailView=reprocess`,
          );
          await page.waitForSelector(`${workspace} [role="radiogroup"]`);
          await page.focus('[data-testid="reprocess-scope-thumbnail"] input');
          await page.keyboard.press('Space');
          await page.waitForSelector(confirmation);
          const measured = await measureReprocessConfirmation(page);
          await page.screenshot({
            path: join(
              config.output,
              `detail-171-album-confirm-thumbnail-${theme}-${width}.png`,
            ),
          });
          report.layouts.push({
            state: 'detail-171-album-confirm-thumbnail',
            theme,
            ...measured,
          });
          await page.keyboard.press('Escape');
          await page.waitForFunction(
            () =>
              !document.querySelector(
                '[data-testid="reprocess-confirmation"]',
              ) &&
              document
                .querySelector('.shell-footer [data-testid="reprocess-submit"]')
                ?.textContent.trim() === '重新生成缩略图' &&
              document.querySelector(
                '[data-testid="reprocess-scope-thumbnail"] input',
              )?.checked &&
              document.activeElement ===
                document.querySelector(
                  '[data-testid="reprocess-scope-thumbnail"] input',
                ),
          );
          assert.equal(
            new URL(await page.url()).pathname,
            `/albums/${albumId}`,
          );
        }
      }
      report.checks.push(
        'Album reprocess uses the same footer boundary: desktop/phone in both themes remove the whole footer during confirmation, and Escape restores its actions, selected scope, focus and album route.',
      );
    } finally {
      // Delete only this disposable album through the offline SQL bridge, including on browser stop.
      await sql(
        `DELETE FROM albums WHERE id='${albumId.replaceAll("'", "''")}'`,
      );
    }
  } finally {
    await restoreProcessingSettings(sql, settings);
  }
}
