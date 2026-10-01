import assert from 'node:assert/strict';

const button = (name) => `loc=role:button[name="${name}"]`;
const checkbox = 'loc=role:checkbox[name="选择图片：issue180-000.png"]';

/** Exercise one actual album without changing its members or saved cover. */
export async function verifyAlbumCoverWorkspace({
  page,
  report,
  openPicker,
  shot,
}) {
  if (
    await page.evaluate(
      () =>
        document.querySelector('.shell-navigation').dataset.collapsed ===
        'true',
    )
  )
    await page.click(button('展开侧栏'));
  await page.waitForSelector(button('收起侧栏'));
  const originalUrl = await page.url();
  report.workspace = [];
  await page.evaluate(() => {
    window.__albumWorkspaceShell = document.querySelector('.admin-shell');
    window.__albumWorkspaceMain = document.querySelector('#main-content');
    const original = window.fetch;
    window.__albumWorkspaceReads = [];
    window.__albumWorkspaceRestore = () => {
      window.fetch = original;
      delete window.__albumWorkspaceShell;
      delete window.__albumWorkspaceMain;
    };
    window.fetch = async (...args) => {
      const url = new URL(String(args[0]), location.href);
      if (
        url.pathname !== '/api/images' ||
        (args[1]?.method ?? 'GET') !== 'GET'
      )
        return original(...args);
      const request = { url: url.href, settled: false };
      window.__albumWorkspaceReads.push(request);
      try {
        return await original(...args);
      } finally {
        request.settled = true;
      }
    };
  });
  async function state(label) {
    const result = await page.evaluate(() => {
      const shell = document.querySelector('.admin-shell');
      const main = document.querySelector('#main-content');
      const bounds = main.getBoundingClientRect();
      return {
        shells: document.querySelectorAll('.admin-shell').length,
        mains: document.querySelectorAll('main').length,
        mainIds: document.querySelectorAll('#main-content').length,
        skipLinks: document.querySelectorAll('.skip-link[href="#main-content"]')
          .length,
        sameShell: shell === window.__albumWorkspaceShell,
        sameMain: main === window.__albumWorkspaceMain,
        mainVisible: bounds.width > 0 && bounds.height > 0,
        focusedMain: document.activeElement === main,
        collapsed:
          document.querySelector('.shell-navigation').dataset.collapsed,
        selectedIds: [
          ...document.querySelectorAll(
            '[data-testid="library-card"][data-selected="true"]',
          ),
        ].map((card) => card.dataset.imageId),
        scrollTop: main.scrollTop,
        query: location.pathname + location.search,
        reads: window.__albumWorkspaceReads.length,
        pickerPage: document
          .querySelector('[data-slot="pagination-summary"]')
          ?.textContent.trim(),
      };
    });
    report.workspace.push({ state: label, ...result });
    return result;
  }
  function stable(actual) {
    assert.equal(actual.shells, 1, 'Album workspace has one shell');
    assert.equal(actual.mains, 1, 'Album workspace has one main target');
    assert.equal(
      actual.mainIds,
      1,
      'The main-content ID identifies one target',
    );
    assert.equal(actual.skipLinks, 1, 'Album workspace has one skip link');
    assert.equal(
      actual.sameShell,
      true,
      'Opening and returning retain the original shell node',
    );
    assert.equal(
      actual.sameMain,
      true,
      'Opening and returning retain the original main node',
    );
    assert.equal(actual.mainVisible, true, 'The single main target is visible');
  }
  async function cancel() {
    await page.click(button('取消'));
    await page.waitForSelector('[data-testid="album-cover-summary"]');
    await page.waitForFunction(
      () => document.activeElement?.textContent.trim() === '设置封面',
    );
  }
  try {
    await page.focus(checkbox);
    await page.keyboard.press('Space');
    await page.waitForSelector(
      '[data-testid="library-card"][data-image-id="issue180-000"][data-selected="true"]',
    );
    await page.click(button('收起侧栏'));
    await page.waitForSelector(button('展开侧栏'));
    await page.evaluate(() =>
      document.querySelector('#main-content').scrollTo(0, 120),
    );
    const before = await state('collapsed album before opening');
    stable(before);
    assert.equal(before.collapsed, 'true');
    assert.ok(
      before.scrollTop > 0,
      'The retained album has an actual nonzero scroll offset',
    );
    assert.deepEqual(before.selectedIds, ['issue180-000']);

    await openPicker();
    const opened = await state('collapsed picker');
    stable(opened);
    assert.equal(
      opened.collapsed,
      'true',
      'Opening the picker keeps the collapsed sidebar',
    );
    await page.focus('.skip-link');
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      () => document.activeElement === document.querySelector('#main-content'),
    );
    const skipped = await state('keyboard skip to picker main');
    stable(skipped);
    assert.equal(
      skipped.focusedMain,
      true,
      'Enter on the skip link focuses the actual visible main',
    );
    await shot('workspace-collapsed-picker');

    await page.click(button('展开侧栏'));
    await page.waitForSelector(button('收起侧栏'));
    await page.click(button('下一页'));
    await page.waitForSelector(
      '[data-testid="cover-choice"][data-image-id="issue180-041"]',
    );
    const secondPage = await state('expanded picker second page');
    stable(secondPage);
    assert.equal(secondPage.pickerPage, '2/2');
    await cancel();
    const returned = await state('expanded album after cancel');
    stable(returned);
    assert.equal(
      returned.collapsed,
      'false',
      'Picker expansion survives returning to the album',
    );
    assert.deepEqual(
      returned.selectedIds,
      before.selectedIds,
      'The original library selection stays intact',
    );
    assert.ok(
      Math.abs(returned.scrollTop - before.scrollTop) < 2,
      'Cancel restores the original album scroll offset',
    );
    await shot('workspace-expanded-return');

    await openPicker();
    const reopened = await state('reopened picker first page');
    stable(reopened);
    assert.equal(reopened.collapsed, 'false');
    assert.equal(
      reopened.pickerPage,
      '1/2',
      'Reopening starts the picker at page one',
    );
    assert.deepEqual(
      await page.evaluate(() =>
        [...document.querySelectorAll('[aria-label="封面图片分页"] button')]
          .filter((node) => node.textContent.trim() === '上一页')
          .map((node) => node.disabled),
      ),
      [true],
      'Reopened cover pagination has one disabled previous-page button',
    );
    await cancel();
    await page.waitForFunction(() =>
      window.__albumWorkspaceReads.every((request) => request.settled),
    );
    const closed = await state('closed picker before browser focus');
    await page.evaluate(() => {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
      return new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    });
    const inactive = await state('closed picker after browser focus');
    stable(inactive);
    assert.equal(
      inactive.reads,
      closed.reads,
      'Returning to the album leaves no active picker member read on browser focus',
    );
    assert.deepEqual(inactive.selectedIds, before.selectedIds);

    await page.focus(checkbox);
    await page.keyboard.press('Space');
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="library-selection"]'),
    );
    await page.evaluate((url) => {
      document.querySelector('#main-content').scrollTo(0, 0);
      history.replaceState(history.state, '', url);
    }, originalUrl);
    report.checks.push(
      'Album → picker → album keeps the same single visible shell/main, sidebar changes, original selection/scroll, keyboard skip target and cancel focus; reopening resets page one and the closed picker does not read members on browser focus.',
    );
  } finally {
    await page.evaluate(() => window.__albumWorkspaceRestore());
  }
}
