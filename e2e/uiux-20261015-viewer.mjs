import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { identitySql } from './identity-session.mjs';
import {
  seedViewerFixtures,
  viewerId,
  viewerName,
  viewerQuery,
} from './library-viewer-fixtures.mjs';
import {
  button,
  closeViewer,
  entry,
  findViewerCard,
  monitorViewerRequests,
  restoreViewerFetch,
  viewerState,
  waitViewerImage,
  waitViewerNeighbors,
} from './library-viewer-helpers.mjs';
import { setDetail171Viewport } from './library-detail-171-helpers.mjs';

const search = 'input[aria-label="搜索图片名称"]';

async function observePending(page) {
  await page.evaluate(() => {
    window.__uiuxPendingObserver?.disconnect();
    window.__uiuxPending = { started: null, visible: null, finished: null };
    const observer = new MutationObserver(() => {
      const state = window.__uiuxPending;
      const pending = [...document.querySelectorAll('[role="status"]')].find(
        (node) => /^正在读取(?:下一张|上一张)图片…$/.test(node.textContent),
      );
      const now = performance.now();
      if (pending && state.started === null) state.started = now;
      if (pending && state.visible === null) {
        const rect = pending.getBoundingClientRect();
        if (rect.width > 100 && rect.height > 20) state.visible = now;
      }
      if (!pending && state.started !== null && state.finished === null)
        state.finished = now;
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
    });
    window.__uiuxPendingObserver = observer;
  });
}

async function holdDetail(page, id) {
  await page.evaluate((id) => {
    const original = window.fetch;
    window.__viewerFetch ??= original;
    let held = false;
    window.fetch = async (...args) => {
      const response = await original(...args);
      if (
        !held &&
        new URL(String(args[0]), location.href).pathname === `/api/images/${id}`
      ) {
        held = true;
        await new Promise((resolve) => {
          window.__viewerRelease = resolve;
        });
      }
      return response;
    };
  }, id);
}

async function pendingState(page) {
  return page.evaluate(() => {
    const root = document.querySelector('[data-testid="image-viewer"]');
    const pending = [...root.querySelectorAll('[role="status"]')].find((node) =>
      /^正在读取(?:下一张|上一张)图片…$/.test(node.textContent),
    );
    const rect = pending?.getBoundingClientRect();
    const spinner = pending?.querySelector('[data-slot="spinner"]');
    return {
      ...window.__uiuxPending,
      text: pending?.textContent,
      visible: window.__uiuxPending.visible,
      inViewport:
        rect &&
        rect.x >= 0 &&
        rect.y >= 0 &&
        rect.right <= innerWidth &&
        rect.bottom <= innerHeight,
      spinner: !!spinner,
      spinnerAnimation: spinner && getComputedStyle(spinner).animationName,
      closeEnabled: !root.querySelector('[aria-label="关闭大图"]').disabled,
      arrowsDisabled: ['上一张', '下一张'].every(
        (label) => root.querySelector(`[aria-label="${label}"]`).disabled,
      ),
    };
  });
}

async function verifyControls(page, config, report) {
  for (const width of [1440, 390]) {
    await setDetail171Viewport(page, width);
    await page.goto(`${config.origin}/library?${viewerQuery}`);
    await page.waitForSelector('[data-testid="library-gallery"]');
    await page.fill(search, viewerName(7));
    assert.equal(
      new URL(await page.url()).searchParams.get('q'),
      'issue185-query-',
    );
    assert.equal(
      await page.evaluate(
        () => !!document.querySelector('[aria-label="清除搜索"]'),
      ),
      false,
    );
    await page.screenshot({
      path: join(config.output, `uiux-search-active-${width}.png`),
    });
    await page.press(search, 'Enter');
    await page.waitForFunction(
      (name) => new URL(location.href).searchParams.get('q') === name,
      viewerName(7),
    );
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="library-list"]')?.dataset
          .loadedCount === '1',
    );
    await page.fill(search, '');
    await page.click(button('搜索图库图片'));
    await page.waitForFunction(
      () => new URL(location.href).searchParams.get('q') === '',
    );
    const indicator = await page.evaluate(() => {
      const sort = [...document.querySelectorAll('[data-slot="select"]')].find(
        (node) =>
          node.querySelector('button')?.textContent.includes('上传时间'),
      );
      const icon = sort?.querySelector(
        '[data-slot="select-default-indicator"]',
      );
      return {
        text: sort?.querySelector('button')?.textContent,
        visible: !!icon?.getClientRects().length,
        gap:
          icon.getBoundingClientRect().left -
          sort
            .querySelector('[data-slot="select-value"]')
            .getBoundingClientRect().right,
      };
    });
    assert.match(indicator.text, /上传时间 ↑/);
    assert.equal(
      indicator.visible,
      true,
      'Sort direction and dropdown indicator are both visible',
    );
    assert.ok(
      indicator.gap >= 4,
      'Sort text and dropdown indicator do not overlap',
    );
    await page.click('loc=role:button[name*="图片排序"]');
    await page.click('loc=role:option[name="文件大小 ↓"]');
    await page.waitForFunction(
      () => new URL(location.href).searchParams.get('sort') === 'size_desc',
    );
    await page.screenshot({
      path: join(config.output, `uiux-controls-${width}.png`),
    });
  }
  report.checks.push(
    'Desktop/mobile search has no clear cross, typing does not submit, Enter and the search icon submit, deleting the text and submitting clears the query. Sorting retains its direction and a separate dropdown indicator.',
  );
}

export async function runUiux20261015Viewer(page, config) {
  const report = { status: 'failed', checks: [], pending: [] };
  const fixtures = await seedViewerFixtures(config, (statement) =>
    identitySql(config, statement),
  );
  try {
    await verifyControls(page, config, report);
    for (const width of [1440, 390]) {
      await setDetail171Viewport(page, width);
      await page.cdp('Emulation.setEmulatedMedia', {
        features: [
          {
            name: 'prefers-reduced-motion',
            value: width === 390 ? 'reduce' : 'no-preference',
          },
        ],
      });
      await page.goto(`${config.origin}/library?${viewerQuery}`);
      await page.waitForSelector('[data-testid="library-gallery"]');
      await findViewerCard(page, 7);
      await page.click(button(`查看图片：${viewerName(7)}`));
      await page.waitForSelector('[data-testid="detail-body"]');
      await monitorViewerRequests(page);
      await holdDetail(page, viewerId(8));
      await page.click(entry);
      await waitViewerImage(page, viewerId(7), 'compressed');
      await waitViewerNeighbors(page, viewerId(7));
      await page.waitForFunction(
        () => typeof window.__viewerRelease === 'function',
      );
      const before = await viewerState(page);
      await observePending(page);
      await page.click(button('下一张'));
      await page.waitForFunction(() => window.__uiuxPending.visible !== null);
      const pending = await pendingState(page);
      assert.ok(
        pending.visible - pending.started >= 150,
        'The visible feedback is delayed, not flashed on every click',
      );
      assert.match(pending.text, /正在读取下一张图片/);
      assert.equal(pending.spinner, true);
      assert.equal(pending.inViewport, true);
      assert.equal(pending.closeEnabled, true);
      assert.equal(pending.arrowsDisabled, true);
      if (width === 390) assert.equal(pending.spinnerAnimation, 'none');
      await page.keyboard.press('ArrowRight');
      assert.equal(
        (await viewerState(page)).src,
        before.src,
        'The previous image stays visible while reading',
      );
      await page.screenshot({
        path: join(config.output, `uiux-viewer-pending-${width}.png`),
      });
      report.pending.push({ width, ...pending });
      await page.evaluate(() => window.__viewerRelease());
      await waitViewerImage(page, viewerId(8), 'compressed');
      await page.waitForFunction(() => window.__uiuxPending.finished !== null);
      await restoreViewerFetch(page);

      // The original image is already decoded; a local round trip exercises
      // the real fast path without replacing server data or image reads.
      await page.waitForSelector('button[aria-label="上一张"]');
      await observePending(page);
      await page.click(button('上一张'));
      await waitViewerImage(page, viewerId(7), 'compressed');
      const fast = await page.evaluate(() => window.__uiuxPending);
      assert.equal(
        fast.visible,
        null,
        'A completed fast read must never show a spinner',
      );
      report.pending.push({ width, fast });

      await page.waitForSelector('button[aria-label="上一张"]');
      await holdDetail(page, viewerId(6));
      await observePending(page);
      await page.click(button('上一张'));
      await page.waitForFunction(() => window.__uiuxPending.visible !== null);
      assert.match((await pendingState(page)).text, /正在读取上一张图片/);
      await closeViewer(page, true);
      await restoreViewerFetch(page);
      assert.equal(
        await page.evaluate(
          () => !!document.querySelector('[data-testid="image-viewer"]'),
        ),
        false,
      );
    }
    report.checks.push(
      'A held real next/previous detail read shows delayed visible feedback, preserves the old image and blocks duplicate navigation. Releasing it removes the status; fast cached navigation does not flash. Escape closes during pending, and reduced motion keeps the status text without rotation.',
    );
    report.status = 'passed';
    return report;
  } catch (error) {
    report.error = String(error.stack ?? error);
    throw error;
  } finally {
    await restoreViewerFetch(page);
    await page.evaluate(() => window.__uiuxPendingObserver?.disconnect());
    await page.cdp('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
    });
    await fixtures.cleanup();
    await writeFile(
      join(config.output, 'uiux-20261015-viewer.json'),
      `${JSON.stringify(report, null, 2)}\n`,
    );
  }
}
