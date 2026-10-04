import assert from 'node:assert/strict';
import { join } from 'node:path';
import { batchImageId } from './library-batch-fixture.mjs';

export const disabledStorageId = 'issue178-filter-storage';
export const progressJobId = 'issue178-batch-progress-writer';

export function createTrashHelpers({ page, config, report }) {
  const button = (name) => `loc=role:button[name="${name}"]`;
  async function settle() {
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  }
  async function resize(width, height = width >= 1200 ? 1080 : 844) {
    await page.cdp('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 768,
    });
    await settle();
  }
  async function theme(value) {
    await page.evaluate((value) => {
      localStorage.setItem('theme', value);
      document.documentElement.classList.toggle('dark', value === 'dark');
      document.documentElement.classList.toggle('light', value === 'light');
      document.documentElement.style.colorScheme = value;
    }, value);
    await settle();
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter(
            (animation) =>
              animation.effect?.getTiming().iterations !== Infinity,
          )
          .map((animation) =>
            animation.finished.then(
              () => {},
              () => {},
            ),
          ),
      ),
    );
  }
  async function screenshot(state, width, mode, height) {
    await resize(width, height);
    await theme(mode);
    const layout = await page.evaluate(() => {
      const shell = document.querySelector('.shell-content');
      const controls = [
        ...document.querySelectorAll(
          '[data-testid="trash-filters"] button[aria-haspopup], [data-testid="trash-batch-item-trigger"], [data-testid="trash-batch-item-check"], [data-testid="trash-batch-item-retry"], [data-testid="trash-batch-item-retry-cleanup"]',
        ),
      ].filter((control) => control.getBoundingClientRect().height > 0);
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        mainOverflow: !!shell && shell.scrollWidth > shell.clientWidth,
        targets: controls.map((control) => ({
          testId: control.dataset.testid ?? 'trash-filter',
          height: control.getBoundingClientRect().height,
        })),
      };
    });
    assert.equal(layout.overflow, false, `${state} document overflow`);
    assert.equal(layout.mainOverflow, false, `${state} content overflow`);
    assert.ok(
      layout.targets.every((control) => control.height >= 44),
      `${state} targets must be at least 44px`,
    );
    report.layouts.push({ state, width, theme: mode, ...layout });
    const filename = `trash-${state}-${mode}-${width}${height ? `-${height}` : ''}.png`;
    await page.screenshot({ path: join(config.output, filename) });
    report.screenshots.push({
      file: filename,
      state,
      width,
      height: height ?? (width >= 1200 ? 1080 : 844),
      theme: mode,
    });
  }
  async function approvedStateScreenshots(state) {
    for (const width of [1440, 390, 360, 430, 768])
      for (const mode of ['light', 'dark'])
        await screenshot(
          state,
          width,
          mode,
          [360, 430, 768].includes(width) ? 430 : undefined,
        );
  }
  async function loaded(count) {
    await page.waitForFunction(
      (count) =>
        document.querySelectorAll('[data-testid="trash-list"] > li').length ===
          count &&
        !document.querySelector('[data-testid="trash-error"]') &&
        !document.querySelector('[data-testid="trash-list"] [disabled]'),
      count,
    );
    await settle();
  }
  async function selected(count) {
    await page.waitForFunction(
      (count) =>
        count
          ? document
              .querySelector('[aria-label^="操作已选"]')
              ?.getAttribute('aria-label') === `操作已选 ${count} 张图片`
          : !document.querySelector('[data-testid="library-selection"]'),
      count,
    );
  }
  async function ensureSelection() {
    if (
      !(await page.evaluate(
        () =>
          !!document.querySelector('input[aria-label="全选当前页回收记录"]'),
      ))
    )
      await page.click(button('选择记录'));
  }
  async function select(index) {
    await ensureSelection();
    await page.click(
      `label:has(input[aria-label="选择回收图片：${batchImageId(index)}.png"])`,
    );
  }
  async function action(name, count) {
    await selected(count);
    await page.click(button(`操作已选 ${count} 张图片`));
    await page.waitForSelector('[role="menu"][aria-label="已选图片操作"]');
    if (name === '永久删除所选') {
      await page.waitForFunction(
        () =>
          document
            .querySelector('[role="menuitem"][data-key="delete-permanent"]')
            ?.getBoundingClientRect().height >= 44,
      );
      const height = await page.evaluate(
        () =>
          document
            .querySelector('[role="menuitem"][data-key="delete-permanent"]')
            .getBoundingClientRect().height,
      );
      assert.ok(height >= 44, `permanent delete target ${height}`);
    }
    await page.click(`loc=role:menuitem[name="${name}"]`);
  }
  async function selectAll() {
    await ensureSelection();
    let count = 0;
    for (const [index, size] of [80, 80, 41].entries()) {
      await loaded(size);
      await page.click('label:has(input[aria-label="全选当前页回收记录"])');
      count += size;
      await selected(count);
      if (index < 2) await page.click(button('下一页'));
    }
  }
  async function installBatchTraffic(loseFirstApply = false) {
    await page.evaluate((loseFirstApply) => {
      const original = window.fetch;
      window.__trashOriginalFetch = original;
      window.__trashTraffic = [];
      window.__trashResponses = [];
      let lose = loseFirstApply;
      window.fetch = async (...args) => {
        const url = new URL(String(args[0]), location.href);
        if (url.pathname !== '/api/images/batch') return original(...args);
        const body = JSON.parse(args[1].body);
        window.__trashTraffic.push(body);
        const response = await original(...args);
        window.__trashResponses.push(await response.clone().json());
        if (body.mode === 'apply' && lose) {
          lose = false;
          throw new TypeError('Issue178: real accepted response lost');
        }
        return response;
      };
    }, loseFirstApply);
  }
  async function restoreBatchTraffic() {
    await page.evaluate(() => {
      window.__trashProgressRelease?.();
      delete window.__trashProgressRelease;
      if (window.__trashOriginalFetch) {
        window.fetch = window.__trashOriginalFetch;
        delete window.__trashOriginalFetch;
      }
    });
  }
  async function resultPage(value) {
    const current = await page.evaluate(() =>
      Number(
        document
          .querySelector('#trash-results-title')
          .textContent.match(/第(\d+)页/)[1],
      ),
    );
    for (let pageNumber = current; pageNumber !== value;) {
      const next = pageNumber < value;
      await page.click(button(next ? '下一页' : '上一页'));
      pageNumber += next ? 1 : -1;
      await page.waitForFunction(
        (pageNumber) =>
          document
            .querySelector('#trash-results-title')
            ?.textContent.includes(`第${pageNumber}页`),
        pageNumber,
      );
    }
    await settle();
  }
  const item = (testId, id, mobile = false) =>
    `[data-testid="trash-batch-${mobile ? 'accordion' : 'table'}"] [data-testid="${testId}"][data-image-id="${id}"]`;
  async function waitSummary(completed, total) {
    await page.waitForFunction(
      ({ completed, total }) =>
        document
          .querySelector('[data-testid="trash-batch-summary"]')
          ?.textContent.includes(`已清理 ${completed} / ${total} 张`),
      { completed, total },
      { timeout: 30000 },
    );
  }
  async function waitBatch() {
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="trash-batch"]')
          ?.getAttribute('aria-busy') === 'false',
    );
    await settle();
  }
  async function verifyConfirmation(count) {
    await page.waitForSelector('[data-testid="trash-batch-confirm"]');
    assert.ok(
      await page.evaluate(
        (count) =>
          document
            .querySelector('[data-testid="trash-batch-confirm"]')
            .textContent.includes(
              `仅处理本次选定的${count}张图片，逐项返回结果；不会清空全部筛选结果`,
            ),
        count,
      ),
    );
    await screenshot('batch-confirm', 1440, 'light');
    await screenshot('batch-confirm', 390, 'dark');
  }

  return {
    button,
    settle,
    resize,
    theme,
    screenshot,
    approvedStateScreenshots,
    loaded,
    selected,
    ensureSelection,
    select,
    action,
    selectAll,
    installBatchTraffic,
    restoreBatchTraffic,
    resultPage,
    item,
    waitSummary,
    waitBatch,
    verifyConfirmation,
  };
}
