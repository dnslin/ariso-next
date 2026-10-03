import assert from 'node:assert/strict';
import { join } from 'node:path';

export const workspace = '[data-testid="library-batch"]';
export const button = (name) => `loc=role:button[name="${name}"]`;

export function reprocessHelpers({ page, config, report }) {
  async function visit(ids) {
    await page.goto(`${config.origin}/library?q=issue186-&pageSize=20`);
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="library-list"]')?.dataset
          .loadedCount === '3' &&
        document
          .querySelector('[data-testid="library-gallery"]')
          ?.getAttribute('aria-busy') === 'false',
    );
    for (const id of ids) {
      await page.hover(button(`查看图片：${id}.png`));
      await page.click(`label:has(input[aria-label="选择图片：${id}.png"])`);
    }
    await page.click(button(`操作已选 ${ids.length} 张图片`));
    await page.waitForSelector('[role="menu"][aria-label="已选图片操作"]');
    await page.click('loc=role:menuitem[name="重新处理"]');
    await page.waitForSelector('[data-testid="batch-reprocess-scope-all"]');
  }
  async function submit(scope = 'all') {
    if (scope !== 'all')
      await page.click(`[data-testid="batch-reprocess-scope-${scope}"]`);
    await page.click('[data-testid="batch-submit"]');
    await page.waitForSelector('[data-batch-result-id]');
  }
  async function terminal(ids) {
    await page.waitForFunction(
      (ids) =>
        ids.every((id) => {
          const node = document.querySelector(`[data-batch-result-id="${id}"]`);
          return (
            node &&
            ['succeeded', 'failed', 'cancelled'].includes(
              node.dataset.jobStatus,
            )
          );
        }),
      ids,
      { timeout: 30000 },
    );
  }
  async function monitor(fault = null) {
    await page.evaluate((fault) => {
      const original = window.__reprocessOriginalFetch ?? window.fetch;
      window.__reprocessOriginalFetch = original;
      window.__reprocessTraffic = [];
      window.__reprocessFault = fault;
      window.fetch = async (...args) => {
        const path = new URL(String(args[0]), location.href).pathname;
        if (path !== '/api/images/batch') return original(...args);
        const request = JSON.parse(args[1].body);
        const entry = { path, request };
        window.__reprocessTraffic.push(entry);
        if (
          request.mode === 'apply' &&
          window.__reprocessFault === 'never-sent'
        ) {
          window.__reprocessFault = null;
          throw new TypeError(
            'Verification: apply transport interrupted before acceptance',
          );
        }
        const response = await original(...args);
        entry.status = response.status;
        entry.response = await response.clone().json();
        if (path === '/api/images/batch' && request.mode === 'apply') {
          if (window.__reprocessFault === 'hold') {
            window.__reprocessFault = null;
            await new Promise((resolve) => {
              window.__reprocessRelease = resolve;
            });
          } else if (window.__reprocessFault === 'lose') {
            window.__reprocessFault = null;
            throw new TypeError(
              'Verification: real batch acceptance response lost',
            );
          }
        } else if (
          request.mode === 'check' &&
          window.__reprocessFault === 'status-lose'
        ) {
          window.__reprocessFault = null;
          throw new TypeError('Verification: real job progress response lost');
        } else if (
          path === '/api/images/batch' &&
          request.mode === 'check' &&
          window.__reprocessFault === 'check-lose'
        ) {
          window.__reprocessFault = null;
          throw new TypeError(
            'Verification: real exact-task check response lost',
          );
        }
        return response;
      };
    }, fault);
  }
  const traffic = () => page.evaluate(() => window.__reprocessTraffic);
  const batchTraffic = async () =>
    (await traffic()).filter((entry) => entry.path === '/api/images/batch');
  async function resize(width, height = width >= 1200 ? 1080 : 844) {
    await page.cdp('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 768,
    });
    await page.waitForFunction(
      ({ width, height }) => innerWidth === width && innerHeight === height,
      { width, height },
    );
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  }
  async function layouts(
    state,
    widths = [1440, 390],
    themes = ['light', 'dark'],
  ) {
    for (const theme of themes) {
      await page.cdp('Emulation.setEmulatedMedia', {
        features: [
          { name: 'prefers-color-scheme', value: theme },
          { name: 'prefers-reduced-motion', value: 'reduce' },
        ],
      });
      await page.waitForFunction(
        (theme) => document.documentElement.classList.contains(theme),
        theme,
      );
      for (const width of widths) {
        await resize(width);
        await page.mouse.move(1, 1, { label: 'clear incidental row hover' });
        const layout = await page.evaluate(() => {
          const root = document.querySelector('[data-testid="library-batch"]');
          const rect = root.getBoundingClientRect();
          const bounds = (node) => {
            if (!node) return null;
            const rect = node.getBoundingClientRect();
            return {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
              bottom: rect.bottom,
            };
          };
          const controls = [
            ...root.querySelectorAll('button,input[type="radio"]'),
          ]
            .filter((node) => node.getClientRects().length)
            .map((node) => {
              const target =
                node.tagName === 'INPUT' ? node.closest('label') : node;
              const bounds = target.getBoundingClientRect();
              return {
                name:
                  node.getAttribute('aria-label') || target.textContent.trim(),
                width: bounds.width,
                height: bounds.height,
              };
            });
          return {
            width: innerWidth,
            height: innerHeight,
            overflow: document.documentElement.scrollWidth > innerWidth,
            root: { left: rect.left, right: rect.right },
            main: bounds(root.closest('main')),
            identityImage: bounds(root.querySelector('img')),
            footer: bounds(document.querySelector('footer.shell-footer')),
            footerControls: [
              ...document.querySelectorAll('footer.shell-footer button'),
            ].map((node) => ({
              name: node.textContent.trim(),
              ...bounds(node),
              scrollWidth: node.scrollWidth,
              scrollHeight: node.scrollHeight,
            })),
            controls,
          };
        });
        assert.equal(
          layout.overflow,
          false,
          `${state} ${theme} ${width}: page has no horizontal overflow`,
        );
        assert.ok(
          layout.root.left >= 0 && layout.root.right <= width,
          `${state}: complete workspace stays horizontally visible`,
        );
        for (const control of layout.controls)
          assert.ok(
            control.width >= 44 && control.height >= 44,
            `${state}: ${control.name} has a 44px click target`,
          );
        for (const control of layout.footerControls) {
          assert.ok(
            control.width >= 44 && control.height >= 44,
            `${state}: footer ${control.name} has a 44px click target`,
          );
          assert.ok(
            control.scrollWidth <= control.width + 1 &&
              control.scrollHeight <= control.height + 1,
            `${state}: complete footer ${control.name} label fits its own click target`,
          );
        }
        const filename = `library-reprocess-${state}-${theme}-${width}.png`;
        await page.screenshot({ path: join(config.output, filename) });
        report.screenshots.push(filename);
        report.layouts.push({ state, theme, ...layout });
      }
    }
  }
  async function close() {
    const selector = await page.evaluate(() =>
      document.querySelector('[data-testid="batch-done"]')
        ? '[data-testid="batch-done"]'
        : '[data-testid="batch-return"]',
    );
    await page.click(selector);
    await page.waitForSelector(workspace, { state: 'hidden' });
  }
  return {
    visit,
    submit,
    terminal,
    monitor,
    traffic,
    batchTraffic,
    resize,
    layouts,
    close,
  };
}
