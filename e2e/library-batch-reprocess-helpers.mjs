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
      window.__reprocessListTraffic = [];
      window.__reprocessFault = fault;
      window.fetch = async (...args) => {
        const path = new URL(String(args[0]), location.href).pathname;
        if (path === '/api/images') {
          const entry = { path, method: args[1]?.method ?? 'GET' };
          window.__reprocessListTraffic.push(entry);
          const response = await original(...args);
          entry.status = response.status;
          if (window.__reprocessFailRefresh) {
            window.__reprocessFailRefresh = false;
            entry.delayedFailure = true;
            await new Promise((resolve) => {
              window.__reprocessRefreshRelease = resolve;
            });
            throw new TypeError(
              'Verification: terminal list refresh response lost',
            );
          }
          return response;
        }
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
        if (
          request.mode === 'check' &&
          window.__reprocessFault === 'terminal-refresh' &&
          entry.response.results.some(
            (result) =>
              result.status === 'accepted' &&
              ['succeeded', 'failed', 'cancelled'].includes(result.task.status),
          )
        ) {
          window.__reprocessFault = null;
          window.__reprocessFailRefresh = true;
        }
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
  async function explanation(state, widths = [1440, 390], height) {
    for (const theme of ['light', 'dark']) {
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
        await resize(width, height ?? (width >= 1200 ? 1080 : 844));
        const trigger = button('查看处理说明');
        const keyboard = width === 1440 && theme === 'light' && !height;
        const key = state === 'scope' ? 'Enter' : 'Space';
        if (keyboard) {
          await page.focus(trigger);
          await page.keyboard.press(key);
        } else await page.click(trigger);
        await page.waitForSelector('loc=role:dialog[name="处理说明"]');
        await page.waitForFunction(
          () =>
            document
              .querySelector('[role="dialog"][aria-label="处理说明"]')
              ?.closest('.popover')
              ?.getAttribute('data-entering') !== 'true',
        );
        const details = await page.evaluate(() => {
          const node = document.querySelector(
            '[role="dialog"][aria-label="处理说明"]',
          );
          const rect = node.getBoundingClientRect();
          const paragraphs = [...node.querySelectorAll('p')].map((p) =>
            p.textContent.trim(),
          );
          return {
            paragraphs,
            width: rect.width,
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            height: rect.height,
            scrollHeight: node.scrollHeight,
            clientHeight: node.clientHeight,
            overflowY: getComputedStyle(node).overflowY,
          };
        });
        assert.equal(
          details.paragraphs.length,
          4,
          'All four processing rules remain available on demand',
        );
        assert.match(details.paragraphs[0], /受理时使用最新设置/);
        assert.match(details.paragraphs[1], /不会自动扩大范围/);
        assert.match(details.paragraphs[2], /关闭页面不会取消/);
        assert.match(details.paragraphs[3], /全部成功后才替换/);
        assert.ok(
          details.left >= 0 && details.right <= width,
          'Explanation fits the current viewport',
        );
        assert.ok(
          details.top >= 0 &&
            details.bottom <= (height ?? (width >= 1200 ? 1080 : 844)),
          'Explanation stays vertically inside the viewport',
        );
        if (details.scrollHeight > details.clientHeight) {
          assert.equal(
            details.overflowY,
            'auto',
            'Short explanation can scroll',
          );
          await page.mouse.move(
            details.left + details.width / 2,
            details.top + details.height / 2,
          );
          await page.mouse.wheel(0, 400, {
            label: 'scroll processing explanation',
          });
          assert.ok(
            await page.evaluate(
              () =>
                document.querySelector('[role="dialog"][aria-label="处理说明"]')
                  .scrollTop > 0,
            ),
            'Native wheel reaches the lower processing rules',
          );
        }
        const filename = `library-reprocess-${state}-explanation-${theme}-${width}${height ? '-short' : ''}.png`;
        await page.screenshot({ path: join(config.output, filename) });
        report.screenshots.push(filename);
        await page.keyboard.press('Escape');
        await page.waitForSelector('loc=role:dialog[name="处理说明"]', {
          state: 'hidden',
        });
        assert.equal(
          await page.evaluate(() =>
            document.activeElement?.getAttribute('aria-label'),
          ),
          '查看处理说明',
          'Escape returns focus to the explanation trigger',
        );
        assert.ok(
          await page.evaluate(
            () => !!document.querySelector('[data-testid="library-batch"]'),
          ),
          'Escape closes only the explanation and preserves the batch workspace',
        );
        report.explanations ??= [];
        report.explanations.push({
          state,
          theme,
          openedBy: keyboard ? key : 'pointer',
          viewport: { width, height: height ?? (width >= 1200 ? 1080 : 844) },
          ...details,
        });
      }
    }
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
          const statuses = [
            ...root.querySelectorAll('[data-testid="batch-task-status"]'),
          ].map((node) => ({
            state: node.dataset.state,
            text: node.textContent.trim(),
            classes: node.className,
            color: getComputedStyle(node).color,
            background: getComputedStyle(node).backgroundColor,
            icon: !!node.querySelector('svg'),
          }));
          const summary = root.querySelector('[role="status"]');
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
            statuses,
            summary: summary?.textContent.trim() ?? null,
            summaryChips: summary
              ? [...summary.querySelectorAll('.chip')].map((node) =>
                  node.textContent.trim(),
                )
              : [],
            scopeRows: [
              ...root.querySelectorAll(
                '[data-testid^="batch-reprocess-scope-"]',
              ),
            ].map((node) => ({
              ...bounds(node),
              text: node.textContent.trim(),
            })),
            choiceFooter: [
              ...root.querySelectorAll(
                '[data-testid="batch-return"],[data-testid="batch-submit"]',
              ),
            ].map((node) => ({
              ...bounds(node),
              text: node.textContent.trim(),
            })),
            permanentRuleAlert: [
              ...root.querySelectorAll('[role="alert"]'),
            ].some((node) =>
              /每张图片受理时|任务受理不等于/.test(node.textContent),
            ),
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
        assert.equal(
          layout.permanentRuleAlert,
          false,
          'General processing rules do not occupy a permanent alert',
        );
        if (layout.scopeRows.length) {
          assert.equal(
            layout.scopeRows.length,
            4,
            'All four processing scopes remain visible',
          );
          for (const [index, row] of layout.scopeRows.entries()) {
            assert.ok(
              row.height >= 64,
              'Scope uses a comfortable two-line selection row',
            );
            if (index)
              assert.ok(
                row.y >= layout.scopeRows[index - 1].bottom,
                'Scope options form a clear single-column list',
              );
          }
          assert.equal(layout.choiceFooter.length, 2);
          assert.equal(
            layout.choiceFooter[0].y,
            layout.choiceFooter[1].y,
            'Cancel and submit share one footer row',
          );
          assert.ok(
            layout.choiceFooter[1].x >=
              layout.choiceFooter[0].x + layout.choiceFooter[0].width,
            'Primary submit stays beside cancel',
          );
          for (const action of layout.choiceFooter)
            assert.equal(
              action.height,
              48,
              'Choice action keeps its 48px height',
            );
        }
        for (const text of layout.summaryChips)
          assert.doesNotMatch(
            text,
            /\b0\s*张/,
            'Summary omits empty state counts',
          );
        if (layout.summary)
          assert.doesNotMatch(
            layout.summary,
            /\b0\s*张/,
            'Summary hides zero acceptance and stage counts',
          );
        const statusPresentation = {
          succeeded: ['处理完成', 'success'],
          failed: ['处理失败', 'danger'],
          rejected: ['未受理', 'warning'],
          cancelled: ['任务已取消', 'danger'],
          unknown: ['结果待核对', 'warning'],
          unsent: ['尚未提交', 'warning'],
          waiting: ['等待受理', 'warning'],
          queued: ['排队中', 'default'],
          running: ['正在处理', 'accent'],
        };
        for (const status of layout.statuses) {
          const [text, color] = statusPresentation[status.state];
          assert.equal(
            status.text,
            text,
            'Status label reflects the real task stage',
          );
          assert.ok(
            status.icon,
            'Status includes a readable icon in addition to semantic color',
          );
          assert.ok(
            status.classes.split(' ').includes(`chip--${color}`),
            'State uses the matching semantic color',
          );
          assert.notEqual(
            status.background,
            'rgba(0, 0, 0, 0)',
            'Status has a visible soft background',
          );
          assert.notEqual(
            status.color,
            status.background,
            'Status text and background remain distinct',
          );
        }
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
    explanation,
    close,
  };
}
