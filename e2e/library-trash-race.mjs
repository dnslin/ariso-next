import assert from 'node:assert/strict';
import { join } from 'node:path';

// Keep the actual pre-write GET and actual POST responses independently pending.
// No successful response data is invented; faults discard real server responses.
async function holdConcurrentReads(page, mode) {
  await page.evaluate((mode) => {
    const original = window.fetch;
    const state = {
      reads: 0,
      writes: [],
      oldReadSettled: false,
      oldReadAborted: false,
      releaseOld: null,
      releaseWrite: null,
      loseReconciliation: mode === 'lost-write',
    };
    window.__trashRace = state;
    window.__restoreTrashRace = () => {
      window.fetch = original;
    };
    window.fetch = async (...args) => {
      const path = new URL(String(args[0]), location.href).pathname;
      const method = args[1]?.method ?? 'GET';
      const oldRead =
        path === '/api/images/library-007' &&
        method === 'GET' &&
        state.reads++ === 0;
      const write =
        path === '/api/images/library-007/trash' && method === 'POST';
      if (oldRead) {
        const signal = args[1]?.signal;
        state.oldReadAborted = signal?.aborted ?? false;
        signal?.addEventListener(
          'abort',
          () => {
            state.oldReadAborted = true;
          },
          { once: true },
        );
      }
      const response = await original(...args);
      if (oldRead) {
        await new Promise((resolve) => {
          state.releaseOld = resolve;
        });
        state.oldReadSettled = true;
        if (mode !== 'late-success')
          throw new TypeError('Verification: pre-write detail response lost');
      } else if (write) {
        state.writes.push(response.status);
        await new Promise((resolve) => {
          state.releaseWrite = resolve;
        });
        if (mode === 'lost-write')
          throw new TypeError('Verification: committed trash response lost');
      } else if (
        path === '/api/images/library-007' &&
        method === 'GET' &&
        state.loseReconciliation
      ) {
        throw new TypeError('Verification: first reconciliation response lost');
      }
      return response;
    };
  }, mode);
}

export async function verifyLibraryTrashRace({ page, config, sql, report }) {
  const button = (name) => `loc=role:button[name="${name}"]`;
  for (const mode of ['normal', 'lost-write', 'late-success']) {
    await sql(
      "UPDATE media_images SET trashed_at = NULL WHERE id = 'library-007'",
    );
    await page.goto(`${config.origin}/library?image=library-007`);
    await page.waitForSelector('[data-testid="detail-body"]');
    await holdConcurrentReads(page, mode);
    try {
      await page.click(button('刷新详情'));
      await page.waitForFunction(
        () => typeof window.__trashRace.releaseOld === 'function',
      );
      await page.click(button('回收图片'));
      await page.waitForSelector('[data-testid="trash-confirm"]');
      await page.click(button('确认回收'));
      await page.waitForFunction(
        () => typeof window.__trashRace.releaseWrite === 'function',
      );
      assert.deepEqual(
        await page.evaluate(() => window.__trashRace.writes),
        [200],
      );
      assert.notEqual(
        (
          await sql(
            "SELECT trashed_at FROM media_images WHERE id = 'library-007'",
          )
        )[0].trashed_at,
        null,
      );
      if (mode !== 'late-success') {
        await page.evaluate(() => window.__trashRace.releaseOld());
        await page.waitForFunction(() => window.__trashRace.oldReadSettled);
        await page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        );
        assert.equal(
          await page.evaluate(
            () => !!document.querySelector('[data-testid="trash-confirm"]'),
          ),
          true,
          `${mode}: failure of the pre-write GET must not unmount the in-flight trash action`,
        );
      }
      await page.evaluate(() => window.__trashRace.releaseWrite());
      if (mode === 'lost-write') {
        await page.waitForSelector(button('重新核对'));
        assert.equal(
          await page.evaluate(
            () => !!document.querySelector('[data-testid="detail-preview"]'),
          ),
          false,
          'Unknown write result must not expose the stale readable preview',
        );
        await page.evaluate(() => {
          window.__trashRace.loseReconciliation = false;
        });
        await page.click(button('重新核对'));
      }
      await page.waitForFunction(
        () => !document.querySelector('[data-testid="library-detail"]'),
      );
      if (mode === 'late-success') {
        await page.evaluate(() => window.__trashRace.releaseOld());
        await page.waitForFunction(() => window.__trashRace.oldReadSettled);
        await page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        );
      }
      assert.equal(new URL(await page.url()).searchParams.has('image'), false);
      assert.equal(
        await page.evaluate(
          () => !!document.querySelector('[data-image-id="library-007"]'),
        ),
        false,
      );
      assert.deepEqual(
        await page.evaluate(() => window.__trashRace.writes),
        [200],
        'Exactly one real write; reconciliation never retries POST',
      );
      report.trashRaces ??= [];
      report.trashRaces.push({
        mode,
        oldReadAborted: await page.evaluate(
          () => window.__trashRace.oldReadAborted,
        ),
      });
      report.checks.push(
        `Pre-write GET race (${mode}): confirmed trash survives old-read completion, removes detail/card, and sends exactly one real POST${mode === 'lost-write' ? ' after explicit unknown-result reconciliation' : ''}.`,
      );
    } catch (error) {
      report.trashRaceFailure = {
        mode,
        url: await page.url(),
        state: await page.evaluate(() => ({
          reads: window.__trashRace.reads,
          writes: window.__trashRace.writes,
          oldReadSettled: window.__trashRace.oldReadSettled,
          oldReadAborted: window.__trashRace.oldReadAborted,
          confirmationPresent: !!document.querySelector(
            '[data-testid="trash-confirm"]',
          ),
          text: document.querySelector('[data-testid="library-detail"]')
            ?.textContent,
        })),
      };
      await page.screenshot({
        path: join(config.output, `trash-race-${mode}-failure.png`),
      });
      throw error;
    } finally {
      await page.evaluate(() => {
        window.__trashRace.releaseOld?.();
        window.__trashRace.releaseWrite?.();
        window.__restoreTrashRace();
      });
    }
  }
  await sql(
    "UPDATE media_images SET trashed_at = NULL WHERE id = 'library-007'",
  );
}
