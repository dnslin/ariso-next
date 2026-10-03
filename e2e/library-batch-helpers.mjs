import assert from 'node:assert/strict';
import { join } from 'node:path';
import { batchImageName } from './library-batch-fixture.mjs';
import { verifyToastTextLayout } from './toast-layout.mjs';

export function createBatchHelpers({ page, config, report }) {
  const button = (name) => `loc=role:button[name="${name}"]`;
  const batch = '[data-testid="library-batch"]';
  const submit = '[data-testid="batch-submit"]';
  const sessionEvidenceKey = 'ariso:issue177-browser:session-evidence';
  async function settle() {
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  }
  async function loaded(count) {
    await page.waitForFunction(
      (count) =>
        Number(
          document.querySelector('[data-testid="library-list"]')?.dataset
            .loadedCount,
        ) === count &&
        document
          .querySelector('[data-testid="library-gallery"]')
          ?.getAttribute('aria-busy') === 'false',
      count,
    );
    await settle();
  }
  async function selected(count) {
    await page.waitForFunction((count) => {
      const trigger = document.querySelector(
        '[data-testid="library-selection"] button[aria-label^="操作已选"]',
      );
      return count
        ? trigger?.getAttribute('aria-label') === `操作已选 ${count} 张图片`
        : !document.querySelector('[data-testid="library-selection"]');
    }, count);
  }
  async function choose(index) {
    const name = batchImageName(index);
    await page.hover(button(`查看图片：${name}`));
    await page.click(`label:has(input[aria-label="选择图片：${name}"])`);
  }
  async function action(name, count) {
    await selected(count);
    await page.click(button(`操作已选 ${count} 张图片`));
    await page.waitForSelector('[role="menu"][aria-label="已选图片操作"]');
    const actions = await page.evaluate(() =>
      [...document.querySelectorAll('[role="menuitem"]')]
        .filter((node) => node.getAttribute('aria-disabled') !== 'true')
        .map((node) => node.textContent.trim()),
    );
    const index = actions.indexOf(name);
    assert.ok(index >= 0, `The actual menu exposes an enabled ${name} action`);
    for (let step = 0; step <= index; step++)
      await page.keyboard.press(step === 0 ? 'Home' : 'ArrowDown');
    await page.waitForFunction(
      (name) =>
        document.activeElement
          ?.closest('[role="menuitem"]')
          ?.textContent.trim() === name,
      name,
    );
    const visible = await page.evaluate(() => {
      const item = document.activeElement
        .closest('[role="menuitem"]')
        .getBoundingClientRect();
      const popup = document
        .querySelector('[data-slot="dropdown-popover"]')
        .getBoundingClientRect();
      return item.top >= popup.top && item.bottom <= popup.bottom;
    });
    assert.equal(visible, true, `The complete ${name} click target is visible`);
    await page.click(`loc=role:menuitem[name="${name}"]`);
    if (!['全选当前页', '全选已加载', '清空全部选择'].includes(name))
      await page.waitForSelector(batch);
    await settle();
  }
  async function target(id) {
    const present = await page.evaluate(
      (id) => !!document.querySelector(`[data-target-id="${id}"]`),
      id,
    );
    if (!present && id.startsWith('issue177-')) {
      const albums = id.includes('album');
      const query =
        id === 'issue177-album-c'
          ? 'Issue 177 并发删除相册'
          : albums
            ? 'Issue 177 相册'
            : 'Issue 177 标签';
      await page.fill(
        `input[aria-label="搜索目标${albums ? '相册' : '标签'}"]`,
        query,
      );
    }
    await page.waitForSelector(`[data-target-id="${id}"]`);
    await page.click(`label:has(input[aria-label$=" · ${id}"])`);
    await settle();
    assert.equal(
      await page.evaluate(
        (id) =>
          document.querySelector(`[data-target-id="${id}"] input`)?.checked,
        id,
      ),
      true,
      `The actual target ${id} was checked`,
    );
  }
  async function visit(query = 'q=issue177-&pageSize=80&page=1') {
    await page.goto(`${config.origin}/library?${query}`);
    await loaded(80);
  }
  async function done() {
    await page.waitForFunction(() => {
      const workspace = document.querySelector('[data-testid="library-batch"]');
      const result =
        document.querySelector(
          '[data-testid="batch-results"],[data-testid="batch-summary"]',
        ) || workspace?.textContent.includes('图片已移入回收站');
      if (!workspace)
        return (
          !!document.querySelector('[data-testid="library-list"]') &&
          [...document.querySelectorAll('[data-slot="toast-title"]')].some(
            (node) =>
              [
                '批量设为公开完成',
                '批量设为私有完成',
                '添加标签完成',
                '移除标签完成',
              ].includes(node.textContent),
          )
        );
      return (
        !!result &&
        (workspace?.getAttribute('aria-busy') === 'false' ||
          (workspace?.getAttribute('aria-busy') === null &&
            document.querySelector('[data-testid="batch-done"]')?.disabled ===
              false))
      );
    });
    await settle();
  }
  async function returnToLibrary() {
    if (
      !(await page.evaluate(
        () => !!document.querySelector('[data-testid="library-batch"]'),
      ))
    ) {
      await selected(0);
      return;
    }
    const returning = await page.evaluate(
      () => !!document.querySelector('[data-testid="batch-return"]'),
    );
    await page.click(
      returning ? '[data-testid="batch-return"]' : '[data-testid="batch-done"]',
    );
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="library-batch"]'),
    );
    await settle();
  }
  async function monitor(mode = null) {
    await page.evaluate((mode) => {
      const original = window.__batchOriginalFetch ?? window.fetch;
      window.__batchOriginalFetch = original;
      window.__batchTraffic = [];
      window.__batchFault = mode;
      window.__batchRelease = null;
      window.fetch = async (...args) => {
        const url = new URL(String(args[0]), location.href);
        if (url.pathname !== '/api/images/batch') return original(...args);
        const request = JSON.parse(args[1].body);
        const entry = { request };
        window.__batchTraffic.push(entry);
        const response = await original(...args);
        entry.status = response.status;
        entry.response = await response.clone().json();
        if (request.mode === 'apply' && window.__batchFault === 'hold') {
          window.__batchFault = null;
          await new Promise((resolve) => {
            window.__batchRelease = resolve;
          });
        } else if (
          request.mode === 'check' &&
          window.__batchFault === 'check-lose'
        ) {
          window.__batchFault = null;
          throw new TypeError(
            'Verification: actual read-only check response lost',
          );
        } else if (request.mode === 'apply' && window.__batchFault === 'lose') {
          window.__batchFault = null;
          throw new TypeError(
            'Verification: successful real batch response lost at fetch boundary',
          );
        }
        return response;
      };
    }, mode);
  }
  const traffic = () => page.evaluate(() => window.__batchTraffic);
  async function resize(width, height = width >= 1200 ? 1080 : 844) {
    await page.cdp('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 768,
    });
    await page.waitForFunction((width) => innerWidth === width, width);
    await settle();
  }
  async function waitForSessionWindow() {
    for (let attempt = 0; attempt < 3; attempt++) {
      const evidence = await page.evaluate(
        (key) => ({
          requests: JSON.parse(sessionStorage.getItem(key) ?? '[]'),
          limited: [...document.querySelectorAll('[role="alert"]')].some(
            (node) => node.textContent.includes('会话核对失败（HTTP 429）'),
          ),
        }),
        sessionEvidenceKey,
      );
      if (!evidence.limited) return;
      const last = evidence.requests.findLast((entry) => entry.status === 429);
      assert.ok(
        last &&
          Number.isFinite(last.retryAfterSeconds) &&
          last.retryAfterSeconds > 0,
        'A real session 429 provides its actual X-Retry-After window',
      );
      const until = last.at + last.retryAfterSeconds * 1000;
      const remaining = Math.max(0, until - Date.now());
      report.sessionWaits.push({
        observedRequests: evidence.requests.length,
        retryAfterSeconds: last.retryAfterSeconds,
        remainingMilliseconds: remaining,
      });
      await page.waitForFunction((until) => Date.now() >= until, until, {
        timeout: remaining + 2000,
      });
      const before = evidence.requests.length;
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page.waitForFunction(
        ({ key, before }) =>
          JSON.parse(sessionStorage.getItem(key) ?? '[]').length > before,
        { key: sessionEvidenceKey, before },
      );
      await settle();
    }
    assert.equal(
      await page.evaluate(() =>
        [...document.querySelectorAll('[role="alert"]')].some((node) =>
          node.textContent.includes('会话核对失败（HTTP 429）'),
        ),
      ),
      false,
      'Session UI recovers through its normal focus check after the production rate window',
    );
  }
  async function shot(state, width, theme) {
    await waitForSessionWindow();
    const filename = `library-batch-${state}-${theme}-${width}.png`;
    await page.screenshot({ path: join(config.output, filename) });
    report.screenshots.push(filename);
  }
  async function layouts(state, widths = [360, 390, 430, 768, 1440]) {
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
        await resize(width);
        const layout = await page.evaluate(() => {
          const workspace = document.querySelector(
            '[data-testid="library-batch"]',
          );
          const controls = [
            ...workspace.querySelectorAll('button,a,input[type="checkbox"]'),
          ]
            .map((node) =>
              node.tagName === 'INPUT' ? (node.closest('label') ?? node) : node,
            )
            .filter((node) => node.getClientRects().length)
            .map((node) => {
              const rect = node.getBoundingClientRect();
              return {
                name:
                  node.getAttribute('aria-label') || node.textContent?.trim(),
                width: rect.width,
                height: rect.height,
              };
            });
          const submit =
            document.querySelector(
              'footer.shell-footer button[data-testid^="batch-"]',
            ) ??
            document.querySelector(
              '[role="dialog"] [data-testid="batch-submit"],[role="dialog"] [data-testid="batch-done"]',
            );
          const rect = submit?.getBoundingClientRect();
          return {
            width: innerWidth,
            height: innerHeight,
            documentWidth: document.documentElement.scrollWidth,
            mainWidth: document.querySelector('main').clientWidth,
            mainScrollWidth: document.querySelector('main').scrollWidth,
            controls,
            submitVisible:
              !submit || (rect.top >= 0 && rect.bottom <= innerHeight),
          };
        });
        assert.ok(
          layout.documentWidth <= width &&
            layout.mainScrollWidth <= layout.mainWidth,
          `${state}/${theme}/${width} has no horizontal overflow`,
        );
        assert.ok(
          layout.submitVisible,
          `${state}/${theme}/${width} keeps the fixed submit reachable`,
        );
        for (const control of layout.controls)
          assert.ok(
            control.width >= 43 && control.height >= 43,
            `${control.name} has a 44px click target: ${control.width}×${control.height}`,
          );
        if (state === 'one-target') {
          const unchecked = await page.evaluate(() => {
            const card = [
              ...document.querySelectorAll('[data-target-id]'),
            ].find((node) => !node.querySelector('input')?.checked);
            const control = card?.querySelector(
              '[data-slot="checkbox-control"]',
            );
            if (!control) return null;
            const rect = control.getBoundingClientRect();
            const style = getComputedStyle(control);
            return {
              width: rect.width,
              height: rect.height,
              border: [
                style.borderTopWidth,
                style.borderRightWidth,
                style.borderBottomWidth,
                style.borderLeftWidth,
              ],
              borderStyle: style.borderTopStyle,
            };
          });
          assert.ok(
            unchecked,
            'One-target representative contains an actual unchecked control',
          );
          assert.equal(unchecked.width, 16);
          assert.equal(unchecked.height, 16);
          assert.deepEqual(unchecked.border, ['1px', '1px', '1px', '1px']);
          assert.equal(unchecked.borderStyle, 'solid');
          layout.uncheckedControl = unchecked;
        }
        if (
          await page.evaluate(
            () =>
              document.querySelector('[data-testid="library-batch"]')?.dataset
                .batchView === 'tag-choose',
          )
        )
          layout.tags = await tagGeometry();
        report.layouts.push({ state, theme, ...layout });
        await shot(state, width, theme);
      }
    }
    await resize(1440);
  }
  async function selectAll201() {
    await visit();
    await choose(0);
    for (const [number, previous, count] of [
      [1, 1, 80],
      [2, 80, 160],
      [3, 160, 201],
    ]) {
      await action('全选当前页', previous);
      await selected(count);
      if (number < 3) {
        await page.click(
          'nav[aria-label="图库分页"] button:has-text("下一页")',
        );
        await loaded(number === 1 ? 80 : 41);
      }
    }
  }
  async function pickFirstTwo(name) {
    await visit();
    await choose(0);
    await choose(1);
    await action(name, 2);
  }
  async function expectResults(expected) {
    const sent = await traffic();
    const actual = sent.flatMap((entry) => entry.response?.results ?? []);
    assert.equal(
      actual.length,
      Object.values(expected).reduce((sum, count) => sum + count, 0),
    );
    for (const [status, count] of Object.entries(expected)) {
      assert.equal(
        actual.filter((row) => row.status === status).length,
        count,
        `${status} actual per-image result count`,
      );
      const rendered = await page.evaluate(
        (status) => ({
          rows: document.querySelectorAll('[data-batch-result-id]').length,
          count: document.querySelectorAll(
            `[data-batch-result-id][data-result-status="${status}"]`,
          ).length,
          summary:
            document.querySelector('[data-testid="batch-summary"]')
              ?.textContent ??
            document.querySelector('[data-testid="library-batch"]')
              ?.textContent ??
            document.querySelector(
              '[data-slot="toast"][data-frontmost="true"] [data-slot="toast-description"]',
            )?.textContent,
        }),
        status,
      );
      if (rendered.rows)
        assert.equal(
          rendered.count,
          count,
          `${status} results render in the real workspace`,
        );
      else
        assert.match(
          rendered.summary,
          new RegExp(
            `${count}张${status === 'changed' ? '(?:已修改|已恢复|已回收)' : status === 'unchanged' ? '无需修改' : '失败'}`,
          ),
          `${status} real summary matches its per-image outcomes`,
        );
    }
    return actual;
  }

  async function tagGeometry() {
    const geometry = await page.evaluate(() => {
      const workspace = document.querySelector(
        '[data-batch-view="tag-choose"]',
      );
      const grid = workspace.querySelector('[data-testid="batch-target-grid"]');
      const footer = document.querySelector('[data-testid="batch-tag-footer"]');
      const cancel = footer.querySelector('[data-testid="batch-cancel"]');
      const submit = footer.querySelector('[data-testid="batch-submit"]');
      const rect = (node) => node.getBoundingClientRect().toJSON();
      return {
        width: innerWidth,
        height: innerHeight,
        workspace: rect(workspace),
        footer: rect(footer),
        summary: footer.querySelector('p').textContent,
        cancel: rect(cancel),
        submit: rect(submit),
        buttonGroup: rect(submit.parentElement),
        columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
        context: [...workspace.querySelectorAll('img')].map((node) => ({
          width: rect(node).width,
          height: rect(node).height,
          decorative: !!node.closest('[aria-hidden="true"]'),
        })),
        cards: [...grid.querySelectorAll('[data-target-id]')].map((node) => {
          const label = node.querySelector('input').closest('label');
          const name = label.querySelector('span.font-medium');
          const fragments = [];
          const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT);
          let text;
          while ((text = walker.nextNode())) {
            if (!text.textContent.trim()) continue;
            const range = document.createRange();
            range.selectNodeContents(text);
            for (const fragment of range.getClientRects())
              if (fragment.width && fragment.height)
                fragments.push(fragment.toJSON());
          }
          return {
            id: node.dataset.targetId,
            rect: rect(label),
            text: label.textContent,
            nameFont: getComputedStyle(name).fontSize,
            fragments,
          };
        }),
      };
    });
    assert.ok(geometry.workspace.width <= 960);
    assert.equal(
      geometry.columns,
      geometry.width >= 1024 ? 3 : geometry.width >= 640 ? 2 : 1,
    );
    assert.equal(geometry.cancel.width, 112);
    assert.equal(geometry.cancel.height, 48);
    assert.equal(geometry.submit.height, 48);
    if (geometry.width >= 640) assert.equal(geometry.submit.width, 180);
    else
      assert.ok(
        Math.abs(
          geometry.submit.width +
            geometry.cancel.width +
            12 -
            geometry.buttonGroup.width,
        ) < 1,
        'Mobile submit uses the space after the 112px cancel target',
      );
    assert.ok(
      geometry.cancel.top >= 0 &&
        geometry.submit.top >= 0 &&
        geometry.cancel.bottom <= geometry.height &&
        geometry.submit.bottom <= geometry.height,
      'Both tag footer actions remain reachable',
    );
    for (const image of geometry.context) {
      assert.equal(image.width, 48);
      assert.equal(image.height, 48);
      assert.equal(image.decorative, true);
    }
    for (const card of geometry.cards) {
      assert.ok(card.rect.height >= 64);
      assert.equal(card.nameFont, '14px');
      assert.ok(card.text.includes(card.id));
      assert.ok(!card.text.includes('创建于'));
      for (const rect of card.fragments)
        assert.ok(
          rect.left >= card.rect.left - 1 &&
            rect.right <= card.rect.right + 1 &&
            rect.top >= card.rect.top - 1 &&
            rect.bottom <= card.rect.bottom + 1,
          'Every long tag name and ID fragment stays readable inside its real card',
        );
    }
    return geometry;
  }

  async function observeVisibilitySubmit() {
    await page.evaluate(() => {
      window.__visibilityTransitions = [];
      const record = () => {
        const workspace = document.querySelector(
          '[data-testid="library-batch"]',
        );
        const overview =
          workspace?.dataset.batchView === 'overview' ||
          !!workspace?.querySelector('[data-testid="batch-summary"]');
        if (overview)
          window.__visibilityTransitions.push({
            overview: true,
            title: workspace?.querySelector('h1')?.textContent,
          });
      };
      window.__visibilityObserver = new MutationObserver(record);
      window.__visibilityObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-batch-view', 'aria-busy'],
      });
      record();
    });
  }
  async function readVisibilitySubmit() {
    const transitions = await page.evaluate(() => {
      window.__visibilityObserver.disconnect();
      return window.__visibilityTransitions;
    });
    assert.deepEqual(
      transitions,
      [],
      'Normal successful visibility work never flashes an overview before returning with Toast',
    );
    return transitions;
  }
  async function assertNoVisibilityToast() {
    assert.equal(
      await page.evaluate(() =>
        [...document.querySelectorAll('[data-slot="toast-title"]')].some(
          (node) =>
            ['批量设为公开完成', '批量设为私有完成'].includes(node.textContent),
        ),
      ),
      false,
      'Failed, unknown and unsent work never announces completed visibility',
    );
  }

  async function setTheme(theme) {
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
  }
  async function visibilityToast(visibility, changed, unchanged, sourceUrl) {
    const title = `批量设为${visibility === 'public' ? '公开' : '私有'}完成`;
    const description = `${changed}张已修改 · ${unchanged}张无需修改`;
    await page.waitForFunction(
      ({ title, description }) => {
        const toast = document.querySelector(
          '[data-slot="toast"][data-frontmost="true"]',
        );
        return (
          !document.querySelector('[data-testid="library-batch"]') &&
          toast?.querySelector('[data-slot="toast-title"]')?.textContent ===
            title &&
          toast?.querySelector('[data-slot="toast-description"]')
            ?.textContent === description
        );
      },
      { title, description },
    );
    await page.hover('[data-slot="toast"][data-frontmost="true"]');
    assert.equal(
      await page.url(),
      sourceUrl,
      'Completed visibility work returns to the exact original route and page',
    );
    await selected(0);
    return { title, description, sourceUrl };
  }
  async function toastLayouts(state, expected, widths = [390, 1440]) {
    for (const theme of ['light', 'dark']) {
      await setTheme(theme);
      for (const width of widths) {
        await resize(width);
        await page.hover('[data-slot="toast"][data-frontmost="true"]');
        const toast = await verifyToastTextLayout(page);
        assert.ok(
          toast,
          'The real success Toast remains visible during the viewport comparison',
        );
        assert.equal(toast.title, expected.title);
        const rendered = await page.evaluate(() => {
          const toast = document.querySelector(
            '[data-slot="toast"][data-frontmost="true"]',
          );
          const node = toast.querySelector('[data-slot="toast-description"]');
          const rect = toast.getBoundingClientRect();
          const close = toast
            .querySelector('[data-slot="toast-close"]')
            .getBoundingClientRect();
          const fragments = [];
          const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
          let text;
          while ((text = walker.nextNode())) {
            const range = document.createRange();
            range.selectNodeContents(text);
            for (const fragment of range.getClientRects())
              if (fragment.width && fragment.height)
                fragments.push(fragment.toJSON());
          }
          return {
            description: node.textContent,
            rect: rect.toJSON(),
            close: close.toJSON(),
            fragments,
            workspace: !!document.querySelector(
              '[data-testid="library-batch"]',
            ),
            documentWidth: document.documentElement.scrollWidth,
            width: innerWidth,
          };
        });
        assert.equal(rendered.description, expected.description);
        assert.equal(rendered.workspace, false);
        assert.ok(rendered.documentWidth <= width);
        assert.ok(rendered.rect.left >= 0 && rendered.rect.right <= width);
        assert.ok(rendered.close.width >= 44 && rendered.close.height >= 44);
        assert.ok(rendered.fragments.length > 0);
        for (const rect of rendered.fragments) {
          assert.ok(
            rect.left >= rendered.rect.left - 1 &&
              rect.right <= rendered.rect.right + 1 &&
              rect.top >= rendered.rect.top - 1 &&
              rect.bottom <= rendered.rect.bottom + 1,
            'Every actual Toast description line fits its surface',
          );
          assert.equal(
            rect.left < rendered.close.right &&
              rect.right > rendered.close.left &&
              rect.top < rendered.close.bottom &&
              rect.bottom > rendered.close.top,
            false,
            'The close target does not cover the actual changed/unchanged text',
          );
        }
        report.layouts.push({
          state,
          theme,
          width,
          toast,
          description: rendered,
        });
        await shot(state, width, theme);
      }
    }
    await page.focus(
      '[data-slot="toast"][data-frontmost="true"] [data-slot="toast-close"]',
    );
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      (title) =>
        ![...document.querySelectorAll('[data-slot="toast-title"]')].some(
          (node) => node.textContent === title,
        ),
      expected.title,
    );
    await resize(1440);
  }

  return {
    batch,
    submit,
    button,
    settle,
    loaded,
    selected,
    choose,
    action,
    target,
    visit,
    done,
    returnToLibrary,
    monitor,
    traffic,
    resize,
    shot,
    layouts,
    selectAll201,
    pickFirstTwo,
    expectResults,
    tagGeometry,
    observeVisibilitySubmit,
    readVisibilitySubmit,
    assertNoVisibilityToast,
    setTheme,
    visibilityToast,
    toastLayouts,
  };
}
