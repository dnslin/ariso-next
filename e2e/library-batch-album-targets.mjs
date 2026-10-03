import assert from 'node:assert/strict';
import { batchAlbumIds } from './library-batch-fixture.mjs';

export async function verifyAlbumTargetLayouts(
  context,
  widths = [360, 390, 430, 768, 1440],
) {
  const { page, report, choose, action, target, visit, layouts } = context;
  await visit();
  for (const index of [0, 1, 2, 3]) await choose(index);
  report.activeCheck = 'target-selection-and-responsive';
  await action('添加到相册', 4);
  assert.equal(
    await page.evaluate(
      () => document.querySelector('[data-testid="batch-submit"]').disabled,
    ),
    true,
  );
  await page.fill('input[aria-label="搜索目标相册"]', 'Issue 177 相册');
  await target(batchAlbumIds[0]);
  await layouts('one-target', [390, 1440]);
  await target(batchAlbumIds[1]);
  await layouts('add-albums', widths);
}

export async function verifyShortBatchMenu(context) {
  const {
    page,
    report,
    button,
    settle,
    selected,
    choose,
    visit,
    resize,
    shot,
  } = context;
  await visit();
  for (const index of [0, 1, 2, 3]) await choose(index);
  await resize(390, 560);
  await page.click(button('操作已选 4 张图片'));
  await page.waitForSelector('[role="menu"][aria-label="已选图片操作"]');
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) =>
          animation.playState !== 'running' ||
          animation.effect?.getTiming().iterations === Infinity,
      ),
  );
  const menuGeometry = () =>
    page.evaluate(() => {
      const popup = document.querySelector('[data-slot="dropdown-popover"]');
      const menu = popup.querySelector('[role="menu"]');
      const main = document.querySelector('main').getBoundingClientRect();
      const bounds = popup.getBoundingClientRect();
      const active = document.activeElement?.closest('[role="menuitem"]');
      const activeRect = active?.getBoundingClientRect();
      return {
        popup: {
          top: bounds.top,
          bottom: bounds.bottom,
          left: bounds.left,
          right: bounds.right,
        },
        boundary: {
          top: main.top,
          bottom: main.bottom,
          left: main.left,
          right: main.right,
        },
        scrollHeight: popup.scrollHeight,
        clientHeight: popup.clientHeight,
        menuScrollHeight: menu.scrollHeight,
        menuClientHeight: menu.clientHeight,
        items: [...menu.querySelectorAll('[role="menuitem"]')].map((node) => ({
          name: node.textContent.trim(),
          height: node.getBoundingClientRect().height,
        })),
        active: active?.textContent.trim(),
        activeRect: activeRect
          ? { top: activeRect.top, bottom: activeRect.bottom }
          : null,
      };
    });
  const initial = await menuGeometry();
  report.shortMenu = { initial };
  assert.ok(
    initial.popup.top >= initial.boundary.top &&
      initial.popup.bottom <= initial.boundary.bottom,
    'Short viewport keeps the menu inside the shared main boundary',
  );
  assert.ok(
    initial.popup.left >= initial.boundary.left &&
      initial.popup.right <= initial.boundary.right,
  );
  assert.ok(
    initial.items.every((item) => item.height >= 44),
    'Short viewport retains every action target height',
  );
  await page.keyboard.press('End');
  await settle();
  const last = await menuGeometry();
  report.shortMenu.last = last;
  assert.equal(
    last.active,
    '清空全部选择',
    'Keyboard End reaches the final menu action',
  );
  assert.ok(
    last.activeRect.top >= last.popup.top &&
      last.activeRect.bottom <= last.popup.bottom,
    'The focused last menu action is scrolled into the visible menu',
  );
  await shot(
    'selection-menu-end',
    390,
    await page.evaluate(() =>
      document.documentElement.classList.contains('dark') ? 'dark' : 'light',
    ),
  );
  await page.keyboard.press('Escape');
  await page.waitForSelector('[role="menu"]', { state: 'hidden' });
  await selected(4);
  await resize(1440);
  report.checks.push(
    'A 390×560 selected menu keeps 44px action targets inside the shared main boundary and keyboard End scrolls the final action into view without changing the selection.',
  );
}

export async function verifyAlbumTargetReads(context) {
  const {
    page,
    report,
    button,
    selected,
    choose,
    action,
    target,
    visit,
    returnToLibrary,
    resize,
    shot,
    layouts,
  } = context;
  await visit();
  for (const index of [0, 1, 2, 3]) await choose(index);
  await action('添加到相册', 4);
  await target(batchAlbumIds[0]);
  await target(batchAlbumIds[1]);
  await resize(390, 400);
  const short = await page.evaluate(() => {
    const rect = document
      .querySelector('[data-testid="batch-submit"]')
      .getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, height: innerHeight };
  });
  assert.ok(short.top >= 0 && short.bottom <= short.height);
  await shot('short', 390, 'dark');
  const firstTargetInput = `[data-target-id="${batchAlbumIds[0]}"] input`;
  await page.focus(firstTargetInput);
  await page.keyboard.press('Space');
  assert.equal(
    await page.evaluate(
      (id) => document.querySelector(`[data-target-id="${id}"] input`).checked,
      batchAlbumIds[0],
    ),
    false,
  );
  await page.keyboard.press('Space');
  assert.equal(
    await page.evaluate(
      (id) => document.querySelector(`[data-target-id="${id}"] input`).checked,
      batchAlbumIds[0],
    ),
    true,
  );
  await resize(1440);
  report.activeCheck = 'target-loading-error-empty-pagination';
  await page.evaluate(() => {
    const original = window.fetch;
    window.__targetRelease = null;
    window.fetch = async (...args) => {
      if (new URL(String(args[0]), location.href).pathname !== '/api/albums')
        return original(...args);
      window.fetch = original;
      const response = await original(...args);
      await new Promise((resolve) => {
        window.__targetRelease = resolve;
      });
      return response;
    };
  });
  await page.fill('input[aria-label="搜索目标相册"]', 'Issue 177 分页相册');
  await page.waitForFunction(
    () => typeof window.__targetRelease === 'function',
  );
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[role="status"]')].some(
      (node) =>
        node.getClientRects().length &&
        node.textContent.includes('正在读取相册目标'),
    ),
  );
  await layouts('target-loading', [390, 1440]);
  await page.evaluate(() => window.__targetRelease());
  await page.waitForSelector('[data-target-id="issue177-page-album-0"]');
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = async (...args) => {
      if (new URL(String(args[0]), location.href).pathname !== '/api/albums')
        return original(...args);
      window.fetch = original;
      await original(...args);
      throw new TypeError('Verification: actual target read response lost');
    };
  });
  await page.fill('input[aria-label="搜索目标相册"]', 'Issue 177');
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[role="alert"]')].some(
      (node) =>
        node.getClientRects().length &&
        node.textContent.includes('目标读取失败'),
    ),
  );
  await layouts('target-error', [390, 1440]);
  assert.equal(
    await page.evaluate(() =>
      document
        .querySelector('[data-testid="library-batch"]')
        .textContent.includes('已选2个目标'),
    ),
    true,
    'A failed read preserves the explicit target selection',
  );
  await page.click(button('重试读取目标'));
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll('[role="alert"]')].some((node) =>
        node.textContent.includes('目标读取失败'),
      ),
  );
  await page.waitForSelector(button('下一页目标'));
  await page.click(button('下一页目标'));
  await page.waitForFunction(() =>
    document
      .querySelector('[aria-label="目标分页"]')
      ?.textContent.includes('2/2'),
  );
  await page.click(button('上一页目标'));
  await page.waitForFunction(() =>
    document
      .querySelector('[aria-label="目标分页"]')
      ?.textContent.includes('1/2'),
  );
  for (const id of batchAlbumIds)
    assert.equal(
      await page.evaluate(
        (id) =>
          document.querySelector(`[data-target-id="${id}"] input`)?.checked,
        id,
      ),
      true,
      'Targets remain selected after target pagination',
    );
  await page.fill(
    'input[aria-label="搜索目标相册"]',
    'issue177-no-target-exists',
  );
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[role="status"]')].some(
      (node) =>
        node.getClientRects().length &&
        node.textContent.includes('没有匹配目标，请修改搜索条件。'),
    ),
  );
  await layouts('target-empty', [390, 1440]);
  await page.fill('input[aria-label="搜索目标相册"]', 'Issue 177 相册');
  await page.waitForSelector(`[data-target-id="${batchAlbumIds[0]}"]`);
  await returnToLibrary();
  await selected(4);
  report.checks.push(
    'Actual held/lost target reads show loading/error, explicit retry recovers without losing selected targets; search returns a real empty list and target paging preserves choices. No-target submit is disabled; two explicit targets render at 360/390/430/768/1440 in light/dark; fixed action remains reachable in a 390×400 short viewport; keyboard Space toggles the actual target checkbox.',
  );
}
