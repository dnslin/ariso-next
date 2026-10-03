/* global taskSpace, config */
const assert = (await import('node:assert/strict')).default;
const { writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { identitySql } = await import(config.identitySessionScript);
const { tagNameSchema } = await import(
  new URL('../src/server/collections/validation.ts', config.libraryDetailScript)
    .href
);
const {
  batchImageId,
  batchImageName,
  batchAlbumIds,
  batchTagIds,
  seedLibraryBatch,
  readLibraryBatchSnapshot,
  cleanLibraryBatch,
} = await import(
  new URL('./library-batch-fixture.mjs', config.libraryDetailScript).href
);
const { signInToLibrary } = await import(
  new URL('./library-login.mjs', config.libraryDetailScript).href
);
const { installBrowserErrors, assertNoBrowserErrors } = await import(
  config.errorsScript
);
const { verifyToastTextLayout } = await import(
  new URL('./toast-layout.mjs', config.libraryDetailScript).href
);
const task = await taskSpace(config.spaceId);
const page = task.page(config.pageLabel ?? 'p1');
const sql = (statement) => identitySql(config, statement);
const report = {
  status: 'failed',
  phase: config.libraryBatchPhase ?? 'full',
  taskSpaceId: task.spaceId,
  origin: config.origin,
  checks: [],
  layouts: [],
  screenshots: [],
  limitations: [
    'Ego Chromium responsive/keyboard checks; physical devices and Release containers are outside this local task.',
  ],
};
const button = (name) => `loc=role:button[name="${name}"]`;
const batch = '[data-testid="library-batch"]';
const submit = '[data-testid="batch-submit"]';
const preferenceKey = 'ariso:library-preferences:v1';
let fixture;
let savedPreference;
let errorScript;
let sessionScript;
const sessionEvidenceKey = 'ariso:issue177-browser:session-evidence';
report.sessionWaits = [];

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
      (id) => document.querySelector(`[data-target-id="${id}"] input`)?.checked,
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
        limited: [...document.querySelectorAll('[role="alert"]')].some((node) =>
          node.textContent.includes('会话核对失败（HTTP 429）'),
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
              name: node.getAttribute('aria-label') || node.textContent?.trim(),
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
          const card = [...document.querySelectorAll('[data-target-id]')].find(
            (node) => !node.querySelector('input')?.checked,
          );
          const control = card?.querySelector('[data-slot="checkbox-control"]');
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
      await page.click('nav[aria-label="图库分页"] button:has-text("下一页")');
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
    const workspace = document.querySelector('[data-batch-view="tag-choose"]');
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
async function verifyTagTargetReads(count) {
  report.activeCheck = 'tag-target-loading-error-empty-retry';
  const selectedTargets = async (disabled) => {
    await page.waitForFunction(
      (disabled) =>
        document.querySelector('[data-testid="batch-submit"]').disabled ===
        disabled,
      disabled,
    );
    const state = await page.evaluate(() => ({
      disabled: document.querySelector('[data-testid="batch-submit"]').disabled,
      count: [...document.querySelectorAll('[role="status"]')].find((node) =>
        /已选\s*2\s*个标签/.test(node.textContent),
      )?.textContent,
      footer: document.querySelector('[data-testid="batch-tag-footer"] p')
        .textContent,
    }));
    assert.equal(state.disabled, disabled);
    assert.ok(state.count, 'Target reads retain both explicit tag selections');
    assert.match(
      state.footer,
      new RegExp(`${count}\\s*张图片\\s*×\\s*2\\s*个标签`),
    );
  };
  await page.evaluate(() => {
    const original = window.fetch;
    window.__tagTargetRead = null;
    window.__tagTargetRelease = null;
    window.fetch = async (...args) => {
      const url = new URL(String(args[0]), location.href);
      if (url.pathname !== '/api/tags') return original(...args);
      window.fetch = original;
      const response = await original(...args);
      window.__tagTargetRead = { url: url.href, status: response.status };
      await new Promise((resolve) => {
        window.__tagTargetRelease = resolve;
      });
      return response;
    };
  });
  await page.fill('input[aria-label="搜索目标标签"]', 'Issue 177 分页标签');
  await page.waitForFunction(
    () => typeof window.__tagTargetRelease === 'function',
  );
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[role="status"]')].some(
      (node) =>
        node.getClientRects().length &&
        node.textContent.includes('正在读取标签目标'),
    ),
  );
  await selectedTargets(true);
  await layouts('tag-target-loading', [390, 1440]);
  const held = await page.evaluate(() => window.__tagTargetRead);
  assert.equal(
    held.status,
    200,
    'Loading holds the successful real target response',
  );
  await page.evaluate(() => {
    window.__tagTargetRelease();
    window.__tagTargetRelease = null;
  });
  await page.waitForSelector('[data-target-id="issue177-page-tag-0"]');
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="batch-submit"]').disabled,
  );
  await selectedTargets(false);
  await page.evaluate(() => {
    const original = window.fetch;
    window.__tagTargetRead = null;
    window.fetch = async (...args) => {
      const url = new URL(String(args[0]), location.href);
      if (url.pathname !== '/api/tags') return original(...args);
      window.fetch = original;
      const response = await original(...args);
      window.__tagTargetRead = {
        url: url.href,
        status: response.status,
        discarded: true,
      };
      throw new TypeError('Verification: actual tag target read response lost');
    };
  });
  await page.fill('input[aria-label="搜索目标标签"]', 'Issue 177');
  await page.waitForSelector(
    '[role="alert"]:has-text("actual tag target read response lost")',
  );
  await selectedTargets(true);
  await layouts('tag-target-error', [390, 1440]);
  const lost = await page.evaluate(() => window.__tagTargetRead);
  assert.equal(
    lost.status,
    200,
    'Error discards the real successful target response',
  );
  assert.equal(lost.discarded, true);
  await page.click(button('重试读取目标'));
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll('[role="alert"]')].some((node) =>
        node.textContent.includes('目标读取失败'),
      ) && !document.querySelector('[data-testid="batch-submit"]').disabled,
  );
  for (const id of batchTagIds) {
    await page.waitForSelector(`[data-target-id="${id}"]`);
    assert.equal(
      await page.evaluate(
        (id) =>
          document.querySelector(`[data-target-id="${id}"] input`).checked,
        id,
      ),
      true,
    );
  }
  await selectedTargets(false);
  await page.fill(
    'input[aria-label="搜索目标标签"]',
    'issue177-no-tag-target-exists',
  );
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[role="status"]')].some(
      (node) =>
        node.getClientRects().length &&
        node.textContent.includes('没有匹配目标，请修改搜索条件。'),
    ),
  );
  assert.equal(
    await page.evaluate(
      () => document.querySelectorAll('[data-target-id]').length,
    ),
    0,
  );
  await selectedTargets(false);
  await layouts('tag-target-empty', [390, 1440]);
  await page.fill('input[aria-label="搜索目标标签"]', 'Issue 177 标签');
  for (const id of batchTagIds) {
    await page.waitForSelector(`[data-target-id="${id}"]`);
    assert.equal(
      await page.evaluate(
        (id) =>
          document.querySelector(`[data-target-id="${id}"] input`).checked,
        id,
      ),
      true,
    );
  }
  await selectedTargets(false);
  report.tagTargetReads = { held, lost, selectedIds: batchTagIds };
  report.checks.push(
    'Real held/lost tag GET responses show loading/error with submission disabled and retain both selected tags; explicit retry restores actual checked targets. An actual empty search keeps the explicit command and original-query recovery preserves both IDs. Desktop/mobile light/dark screenshots cover all three states.',
  );
}

async function verifyTagRetryAfterAlbumError() {
  report.activeCheck = 'tag-retry-after-current-album-cache-error';
  const albumPath = `/api/albums/${batchAlbumIds[0]}`;
  await page.goto(
    `${config.origin}/albums/${batchAlbumIds[0]}?q=issue177-000&pageSize=80&page=1`,
  );
  await loaded(1);
  const sourceUrl = await page.url();
  await choose(0);
  await monitor();
  await page.evaluate((albumPath) => {
    const original = window.fetch;
    window.__collectionReadRequests = [];
    window.__collectionReadFault = albumPath;
    window.fetch = async (...args) => {
      const url = new URL(String(args[0]), location.href);
      if (!/^\/api\/(?:albums|tags)(?:\/|$)/.test(url.pathname))
        return original(...args);
      const entry = {
        path: url.pathname,
        query: url.search,
        method: args[1]?.method ?? 'GET',
      };
      window.__collectionReadRequests.push(entry);
      const lost = window.__collectionReadFault === url.pathname;
      if (lost) window.__collectionReadFault = null;
      const response = await original(...args);
      entry.status = response.status;
      if (lost) {
        entry.discarded = true;
        throw new TypeError(
          `Verification: actual collection read response lost ${url.pathname}`,
        );
      }
      return response;
    };
  }, albumPath);
  await action('从相册移除', 1);
  await page.waitForSelector(
    '[role="alert"]:has-text("actual collection read response lost")',
  );
  const albumReads = await page.evaluate(() => window.__collectionReadRequests);
  assert.ok(
    albumReads.some(
      (entry) =>
        entry.path === albumPath && entry.status === 200 && entry.discarded,
    ),
    'The current-album cache error comes from its discarded successful real GET',
  );
  assert.equal(
    await page.evaluate(
      () => document.querySelector('[data-testid="batch-submit"]').disabled,
    ),
    true,
  );
  await returnToLibrary();
  await selected(1);
  assert.equal(await page.url(), sourceUrl);
  await action('添加标签', 1);
  await page.waitForSelector(`[data-target-id="${batchTagIds[0]}"]`);
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelectorAll(
          '[data-batch-view="tag-choose"] [role="alert"]',
        ).length,
    ),
    0,
    'The current-album cached error never appears as a tag-target error',
  );
  assert.equal(
    await page.evaluate(
      (albumId) => !!document.querySelector(`[data-target-id="${albumId}"]`),
      batchAlbumIds[0],
    ),
    false,
    'The cached album is not injected into actual tag targets',
  );
  await target(batchTagIds[0]);
  await target(batchTagIds[1]);
  await page.evaluate(() => {
    window.__collectionReadFault = '/api/tags';
  });
  await page.fill('input[aria-label="搜索目标标签"]', 'Issue 177 标签 A');
  await page.waitForSelector(
    '[role="alert"]:has-text("actual collection read response lost /api/tags")',
  );
  assert.equal(
    await page.evaluate(
      () => document.querySelector('[data-testid="batch-submit"]').disabled,
    ),
    true,
  );
  const tagErrorReads = await page.evaluate(
    () => window.__collectionReadRequests,
  );
  assert.ok(
    tagErrorReads.some(
      (entry) =>
        entry.path === '/api/tags' && entry.status === 200 && entry.discarded,
    ),
  );
  await layouts('tag-album-cache-read-error', [390, 1440]);
  await page.evaluate(() => {
    window.__collectionReadRequests = [];
  });
  await page.click(button('重试读取目标'));
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll('[role="alert"]')].some((node) =>
        node.textContent.includes('目标读取失败'),
      ) && !document.querySelector('[data-testid="batch-submit"]').disabled,
  );
  const retryReads = await page.evaluate(() => window.__collectionReadRequests);
  report.tagAlbumCacheRetry = {
    sourceUrl,
    albumReads,
    tagErrorReads,
    retryReads,
    selectedIds: batchTagIds,
  };
  assert.deepEqual(
    retryReads.map((entry) => entry.path),
    ['/api/tags'],
    'Retrying tag targets never refetches the disabled cached current-album query',
  );
  assert.equal(retryReads[0].method, 'GET');
  assert.equal(retryReads[0].status, 200);
  assert.equal(
    new URLSearchParams(retryReads[0].query).get('q'),
    'Issue 177 标签 A',
  );
  await page.fill('input[aria-label="搜索目标标签"]', 'Issue 177 标签');
  for (const id of batchTagIds) {
    await page.waitForSelector(`[data-target-id="${id}"]`);
    assert.equal(
      await page.evaluate(
        (id) =>
          document.querySelector(`[data-target-id="${id}"] input`).checked,
        id,
      ),
      true,
      'Tag retry retains both explicit choices despite an unrelated cached album error',
    );
  }
  assert.deepEqual(
    await traffic(),
    [],
    'Target reads, retry and cancellation never submit a batch mutation',
  );
  await page.click('[data-testid="batch-cancel"]');
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="library-batch"]'),
  );
  await selected(1);
  assert.equal(await page.url(), sourceUrl);
  await action('清空全部选择', 1);
  await selected(0);
  report.checks.push(
    'On a real album route, a discarded successful current-album GET creates its query-cache error. Closing removal and opening tags hides the unrelated album error and identity; discarding a real tag GET and explicitly retrying fetches only tags, preserves both chosen IDs and sends no batch mutation.',
  );
}

async function verifyTagTargets(indices = [0, 1, 2, 3]) {
  report.activeCheck = 'compact-tag-selection-search-create-submit';
  const ids = indices.map(batchImageId);
  assert.deepEqual(
    await sql(
      `SELECT image_id,tag_id FROM image_tags WHERE image_id IN ('${ids.join("','")}')`,
    ),
    [],
  );
  const longId =
    'issue177-tag-very-long-identifier-for-the-compact-layout-verification-177';
  const { displayName: longName, normalizedKey: longKey } = tagNameSchema.parse(
    'Issue 177 标签 这是一段需要完整读取并自然换行的很长标签名称用于手机与桌面验证',
  );
  await sql(
    `INSERT INTO tags(id,display_name,normalized_key,created_at,updated_at) VALUES('${longId}','${longName}','${longKey}',1810000000001,1810000000001)`,
  );
  await visit();
  const sourceUrl = await page.url();
  for (const index of indices) await choose(index);
  await action('添加标签', indices.length);
  await page.waitForSelector('[data-batch-view="tag-choose"]');
  assert.equal(
    await page.evaluate(
      () => document.querySelector('[data-testid="batch-submit"]').disabled,
    ),
    true,
  );
  await page.waitForSelector(
    '[data-testid="batch-target-grid"] [data-target-id]',
  );
  await layouts('tag-zero-target', [390, 1440]);
  await page.fill('input[aria-label="搜索目标标签"]', 'Issue 177 标签');
  await target(batchTagIds[0]);
  await target(batchTagIds[1]);
  await page.waitForSelector(`[data-target-id="${longId}"]`);
  if (['feedback', 'tag-states'].includes(config.libraryBatchPhase))
    await verifyTagTargetReads(indices.length);
  await layouts('add-tags', [390, 430, 768, 1440]);
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelectorAll('[data-batch-view="tag-choose"] img').length,
    ),
    Math.min(ids.length, 3),
  );
  for (const width of [360, 390]) {
    await resize(width, 600);
    const geometry = await tagGeometry();
    report.layouts.push({ state: 'tag-short', theme: 'dark', ...geometry });
    await shot('tag-short', width, 'dark');
  }
  await page.click(button('标签操作说明'));
  await page.waitForSelector('[data-testid="batch-tag-tips"]');
  assert.ok(
    await page.evaluate(() =>
      document
        .querySelector('[data-testid="batch-tag-tips"]')
        .textContent.includes('任一标签失效'),
    ),
  );
  await shot('tag-help', 390, 'dark');
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-testid="batch-tag-tips"]', {
    state: 'hidden',
  });
  assert.equal(
    await page.evaluate(() =>
      document.activeElement?.getAttribute('aria-label'),
    ),
    '标签操作说明',
  );
  await monitor();
  await page.click('[data-testid="batch-cancel"]');
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="library-batch"]'),
  );
  await selected(indices.length);
  assert.equal(
    await page.url(),
    sourceUrl,
    'Cancelling tag target selection retains the original library page',
  );
  assert.deepEqual(
    await traffic(),
    [],
    'Cancelling target selection never sends a batch request',
  );
  await action('添加标签', indices.length);
  await target(batchTagIds[0]);
  await target(batchTagIds[1]);
  await resize(1440);
  await page.fill('input[aria-label="搜索目标标签"]', 'Issue 177 分页标签');
  await page.waitForSelector(
    '[data-testid="batch-target-grid"] [data-target-id]',
  );
  await page.waitForFunction(() => {
    const grid = document.querySelector('[data-testid="batch-target-grid"]');
    const next = [...document.querySelectorAll('button')].find(
      (node) => node.textContent === '下一页目标',
    );
    return (
      !!grid?.querySelector('[data-target-id^="issue177-page-tag-"]') &&
      next?.disabled === false
    );
  });
  await page.click(button('下一页目标'));
  await page.waitForFunction(() =>
    document
      .querySelector('[aria-label="目标分页"]')
      ?.textContent.includes('2/2'),
  );
  const [last] = await sql(
    "SELECT id FROM tags WHERE display_name LIKE 'Issue 177 分页标签%' ORDER BY created_at DESC,id ASC LIMIT 1 OFFSET 20",
  );
  await page.waitForSelector(`[data-target-id="${last.id}"]`);
  await page.focus(`[data-target-id="${last.id}"] input`);
  await page.keyboard.press('Space');
  assert.equal(
    await page.evaluate(
      (id) => document.querySelector(`[data-target-id="${id}"] input`).checked,
      last.id,
    ),
    true,
  );
  await page.keyboard.press('Space');
  assert.equal(
    await page.evaluate(
      (id) => document.querySelector(`[data-target-id="${id}"] input`).checked,
      last.id,
    ),
    false,
  );
  await layouts('tag-target-page-two', [390, 1440]);
  await page.fill('input[aria-label="搜索目标标签"]', 'Issue 177 标签');
  for (const id of batchTagIds) {
    await page.waitForSelector(`[data-target-id="${id}"]`);
    assert.equal(
      await page.evaluate(
        (id) =>
          document.querySelector(`[data-target-id="${id}"] input`).checked,
        id,
      ),
      true,
    );
  }
  await page.click(button('新建标签'));
  await page.waitForSelector('[data-testid="upload-create-tag"]');
  await page.fill(
    '[data-testid="upload-create-tag"] input',
    'Issue 177 快建标签',
  );
  await resize(390);
  await shot('quick-create', 390, 'dark');
  await resize(1440);
  await shot('quick-create', 1440, 'dark');
  await page.click(button('创建标签'));
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="upload-create-tag"]'),
  );
  const [createdTag] = await sql(
    "SELECT id FROM tags WHERE display_name='Issue 177 快建标签'",
  );
  assert.ok(createdTag?.id);
  await page.fill('input[aria-label="搜索目标标签"]', 'Issue 177 快建标签');
  await page.waitForSelector(`[data-target-id="${createdTag.id}"]`);
  assert.equal(
    await page.evaluate(
      (id) => document.querySelector(`[data-target-id="${id}"] input`).checked,
      createdTag.id,
    ),
    true,
  );
  assert.match(
    await page.evaluate(
      () =>
        document.querySelector('[data-testid="batch-tag-footer"] p')
          .textContent,
    ),
    new RegExp(`${ids.length}\\s*张图片\\s*×\\s*3\\s*个标签`),
  );
  await monitor();
  await page.click(submit);
  await done();
  await expectResults({ changed: ids.length });
  const add = await traffic();
  assert.equal(add.length, 1);
  assert.deepEqual(add[0].request.ids, ids);
  assert.deepEqual(add[0].request.command, {
    type: 'add-tags',
    tagIds: [...batchTagIds, createdTag.id],
  });
  assert.equal(
    (
      await sql(
        `SELECT count(*) AS count FROM image_tags WHERE image_id IN ('${ids.join("','")}')`,
      )
    )[0].count,
    ids.length * 3,
  );
  await returnToLibrary();
  await visit();
  for (const index of indices) await choose(index);
  await action('移除标签', ids.length);
  await page.waitForSelector(
    '[data-testid="batch-target-grid"] [data-target-id]',
  );
  await layouts('remove-tags', [390, 1440]);
  await target(batchTagIds[0]);
  await target(batchTagIds[1]);
  await page.fill('input[aria-label="搜索目标标签"]', 'Issue 177 快建标签');
  await page.waitForSelector(`[data-target-id="${createdTag.id}"]`);
  await target(createdTag.id);
  await monitor();
  await page.click(submit);
  await done();
  await expectResults({ changed: ids.length });
  const remove = await traffic();
  assert.equal(remove.length, 1);
  assert.deepEqual(remove[0].request.command, {
    type: 'remove-tags',
    tagIds: [...batchTagIds, createdTag.id],
  });
  assert.deepEqual(remove[0].request.ids, ids);
  assert.deepEqual(
    await sql(
      `SELECT image_id,tag_id FROM image_tags WHERE image_id IN ('${ids.join("','")}')`,
    ),
    [],
  );
  await returnToLibrary();
  await sql(`DELETE FROM tags WHERE id='${longId}'`);
  report.tagFeedback = {
    ids,
    add: add[0].request,
    remove: remove[0].request,
    createdTagId: createdTag.id,
    longId,
  };
  report.checks.push(
    'The approved compact tag chooser renders three/two/one readable columns with 64px cards and 48px context images, 48px natural footer actions, long names/IDs, 360/390×600 scrolling and real Escape/Space focus. Real target search and paging preserve explicit choices; quick creation persists and selects a real tag; add/remove submit the exact three target IDs and persist then remove every image relationship.',
  );
}

async function observeVisibilitySubmit() {
  await page.evaluate(() => {
    window.__visibilityTransitions = [];
    const record = () => {
      const workspace = document.querySelector('[data-testid="library-batch"]');
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
      [...document.querySelectorAll('[data-slot="toast-title"]')].some((node) =>
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
        toast?.querySelector('[data-slot="toast-description"]')?.textContent ===
          description
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
          workspace: !!document.querySelector('[data-testid="library-batch"]'),
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
async function verifyVisibilitySuccess() {
  report.visibilitySuccess = [];
  const ids = [batchImageId(80), batchImageId(81)];
  for (const visibility of ['public', 'private']) {
    report.activeCheck = `${visibility}-changed-unchanged-toast`;
    const inverse = visibility === 'public' ? 'private' : 'public';
    await sql(
      `UPDATE media_images SET visibility='${visibility}' WHERE id='${ids[0]}'`,
    );
    await sql(
      `UPDATE media_images SET visibility='${inverse}' WHERE id='${ids[1]}'`,
    );
    const added = [];
    if (visibility === 'public') {
      await page.goto(
        `${config.origin}/library?q=issue177-&pageSize=80&page=2`,
      );
      await loaded(80);
    } else {
      for (const id of ids) {
        const existing = await sql(
          `SELECT image_id FROM album_images WHERE album_id='${batchAlbumIds[0]}' AND image_id='${id}'`,
        );
        if (!existing.length) {
          await sql(
            `INSERT INTO album_images(album_id,image_id,joined_at) VALUES('${batchAlbumIds[0]}','${id}',1712345678901)`,
          );
          added.push(id);
        }
      }
      await page.goto(
        `${config.origin}/albums/${batchAlbumIds[0]}?q=issue177-08&pageSize=80&page=1`,
      );
      // Existing full-suite relationships may also include 082–089.
      const rows = await sql(
        `SELECT count(*) AS count FROM album_images WHERE album_id='${batchAlbumIds[0]}' AND image_id LIKE 'issue177-08%'`,
      );
      await loaded(rows[0].count);
    }
    const sourceUrl = await page.url();
    await choose(80);
    await choose(81);
    await action(visibility === 'public' ? '设为公开' : '设为私有', 2);
    await observeVisibilitySubmit();
    await monitor('hold');
    await page.click(submit);
    await page.waitForFunction(
      () => typeof window.__batchRelease === 'function',
    );
    const pending = await page.evaluate(() => ({
      dialog: !!document.querySelector(
        '[role="dialog"][data-testid="library-batch"]',
      ),
      disabled: document.querySelector('[data-testid="batch-submit"]')
        ?.disabled,
      text: document.querySelector('[data-testid="batch-submit"]')?.textContent,
    }));
    assert.equal(pending.dialog, true);
    assert.equal(pending.disabled, true);
    assert.ok(pending.text.includes('正在设置'));
    await page.evaluate(() => window.__batchRelease());
    await done();
    const transitions = await readVisibilitySubmit();
    await expectResults({ changed: 1, unchanged: 1 });
    const sent = await traffic();
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].request.ids, ids);
    assert.deepEqual(sent[0].request.command, {
      type: 'visibility',
      visibility,
    });
    const toast = await visibilityToast(visibility, 1, 1, sourceUrl);
    assert.deepEqual(
      await sql(
        `SELECT id,visibility FROM media_images WHERE id IN ('${ids.join("','")}') ORDER BY id`,
      ),
      ids.map((id) => ({ id, visibility })),
    );
    await toastLayouts(`${visibility}-success-toast`, toast);
    report.visibilitySuccess.push({
      visibility,
      ids,
      toast,
      results: sent[0].response.results,
      pending,
      transitions,
    });
    for (const id of added)
      await sql(
        `DELETE FROM album_images WHERE album_id='${batchAlbumIds[0]}' AND image_id='${id}'`,
      );
  }
  report.checks.push(
    'Real public/private writes report one changed and one unchanged item in the native success Toast, clear actual selection, retain the exact original library page or album route, and render readable 44px feedback in desktop/mobile light/dark themes.',
  );
}

async function verifyVisibilityFailures() {
  const ids = [batchImageId(0), batchImageId(1), batchImageId(80)];
  const failedIds = ids.slice(1);
  report.visibilityFailures = [];
  for (const visibility of ['public', 'private']) {
    report.activeCheck = `${visibility}-cross-page-failures-and-success-toast`;
    const original = visibility === 'public' ? 'private' : 'public';
    await sql(
      `UPDATE media_images SET visibility = '${original}' WHERE id IN ('${ids.join("','")}')`,
    );
    await visit();
    await choose(0);
    await choose(1);
    await page.click('nav[aria-label="图库分页"] button:has-text("下一页")');
    await loaded(80);
    await choose(80);
    await selected(3);
    const sourceUrl = await page.url();
    await action(visibility === 'public' ? '设为公开' : '设为私有', 3);
    await sql(
      `CREATE TRIGGER issue177_visibility_failure BEFORE UPDATE OF visibility ON media_images WHEN OLD.id IN ('${failedIds.join("','")}') AND NEW.visibility = '${visibility}' BEGIN SELECT RAISE(ABORT, 'Issue 177 real per-image visibility write failure'); END`,
    );
    await monitor();
    await page.click(submit);
    await done();
    const results = await expectResults({ changed: 1, failed: 2 });
    await assertNoVisibilityToast();
    const failures = results.filter((row) => row.status === 'failed');
    const initial = await traffic();
    assert.equal(initial.length, 1);
    assert.deepEqual(initial[0].request.ids, ids);
    assert.deepEqual(initial[0].request.command, {
      type: 'visibility',
      visibility,
    });
    assert.deepEqual(
      failures.map((row) => row.id),
      failedIds,
    );
    assert.ok(failures.every((row) => row.inQuery && row.message));
    const initialVisibility = await sql(
      `SELECT id,visibility FROM media_images WHERE id IN ('${ids.join("','")}') ORDER BY id`,
    );
    assert.deepEqual(
      initialVisibility,
      ids.map((id, index) => ({
        id,
        visibility: index ? original : visibility,
      })),
      'The first image commits while both actual failed writes retain their original visibility',
    );
    assert.equal(
      await page.evaluate(
        () =>
          !!document.querySelector(
            '[role="dialog"][data-testid="library-batch"]',
          ),
      ),
      false,
      'The initial mixed attempt shows the full result summary',
    );
    await layouts(`${visibility}-failed-summary`, [390, 1440]);
    await page.click('[data-testid="batch-view-failures"]');
    await page.waitForSelector(
      'section[data-testid="library-batch"][data-batch-view="retained"]',
    );
    await page.waitForFunction(() => {
      const image = document.querySelector('[data-testid="library-batch"] img');
      return image?.complete && image.naturalWidth > 0;
    });
    const retained = await page.evaluate(() => {
      const workspace = document.querySelector('[data-testid="library-batch"]');
      const sample = [...workspace.children].find((node) =>
        node.querySelector('img'),
      );
      const thumbnail = sample?.querySelector('img');
      return {
        view: workspace.dataset.batchView,
        title: workspace.querySelector('h1')?.textContent.replace(/\s+/g, ''),
        summary: workspace.querySelector('[data-testid="batch-summary"]')
          ?.textContent,
        sample: sample?.textContent,
        thumbnail: thumbnail
          ? {
              src: thumbnail.getAttribute('src'),
              loaded: thumbnail.complete && thumbnail.naturalWidth > 0,
            }
          : null,
        rows: [...workspace.querySelectorAll('[data-batch-result-id]')].map(
          (node) => ({
            id: node.dataset.batchResultId,
            status: node.dataset.resultStatus,
            text: node.textContent,
          }),
        ),
        retryEnabled:
          document.querySelector('[data-testid="batch-retry"]')?.disabled ===
          false,
      };
    });
    assert.equal(
      (await traffic()).length,
      initial.length,
      'Viewing the visibility retained page never sends an apply or check request',
    );
    assert.equal(retained.view, 'retained');
    assert.equal(retained.title, '保留2张失败项');
    assert.equal(retained.summary, '当前页1张 · 其他页1张');
    assert.deepEqual(
      retained.rows.map((row) => row.id),
      failedIds,
    );
    assert.ok(retained.rows.every((row) => row.status === 'failed'));
    assert.ok(
      retained.rows[0].text.includes('第1页'),
      'The retained first-page failure keeps its actual source page',
    );
    assert.ok(
      retained.rows[1].text.includes('第2页'),
      'The retained second-page failure keeps its actual source page',
    );
    assert.ok(
      failedIds.some((id) => retained.sample?.includes(`${id}.png`)) &&
        !retained.sample.includes(`${ids[0]}.png`),
      'The retained sample identifies an actual failed image rather than the initial successful sample',
    );
    assert.ok(
      retained.thumbnail?.loaded,
      'The retained sample uses its real readable thumbnail',
    );
    const sampleId = failedIds.find((id) =>
      retained.sample.includes(`${id}.png`),
    );
    const sampleUrl = new URL(retained.thumbnail.src, config.origin);
    assert.equal(sampleUrl.pathname, `/i/${sampleId}`);
    assert.equal(sampleUrl.searchParams.get('type'), 'thumbnail');
    assert.ok(
      retained.rows.every((row) =>
        row.text.includes(
          failures.find((failure) => failure.id === row.id).message,
        ),
      ),
      'The retained page shows each actual server failure cause',
    );
    assert.equal(retained.retryEnabled, true);
    await layouts(`${visibility}-retained-failures`, [390, 1440]);
    await sql('DROP TRIGGER issue177_visibility_failure');
    await page.click('[data-testid="batch-retry"]');
    await done();
    const completed = await traffic();
    assert.equal(completed.length, 2);
    assert.deepEqual(
      completed[1].request.ids,
      failedIds,
      'Explicit visibility retry writes only the valid failed IDs',
    );
    assert.deepEqual(completed[1].request.command, initial[0].request.command);
    assert.deepEqual(
      completed.map((entry) => entry.request.mode),
      ['apply', 'apply'],
    );
    assert.deepEqual(
      completed[1].response.results.map((row) => row.id),
      failedIds,
    );
    assert.ok(
      completed[1].response.results.every((row) => row.status === 'changed'),
    );
    const finalVisibility = await sql(
      `SELECT id,visibility FROM media_images WHERE id IN ('${ids.join("','")}') ORDER BY id`,
    );
    assert.deepEqual(
      finalVisibility,
      ids.map((id) => ({ id, visibility })),
    );
    const toast = await visibilityToast(visibility, 2, 0, sourceUrl);
    await toastLayouts(`${visibility}-retry-success-toast`, toast);
    report.visibilityFailures.push({
      visibility,
      ids,
      failedIds,
      initialVisibility,
      finalVisibility,
      retained,
      requests: completed.map((entry) => ({
        ids: entry.request.ids,
        mode: entry.request.mode,
        statuses: entry.response.results.map((row) => row.status),
      })),
      toast,
    });
  }
  report.checks.push(
    'Actual public/private UPDATE failures return one committed image and two retained failures across pages; viewing the dedicated retained page performs no request and shows an actual failed sample, one current-page/one other-page failure and actual causes; explicit retry sends only failed IDs, persists all three target visibility values, returns to the exact original page with a native two-changed success Toast and clears the real selection.',
  );
}

try {
  await page.goto(`${config.origin}/library?q=issue177-&pageSize=80&page=1`);
  await page.waitForFunction(
    () =>
      location.pathname === '/login' ||
      !!document.querySelector('[data-testid="library-list"]'),
  );
  if (new URL(await page.url()).pathname === '/login')
    await signInToLibrary(page, config, report);
  savedPreference = await page.evaluate(
    (key) => localStorage.getItem(key),
    preferenceKey,
  );
  await page.evaluate(
    (key) =>
      localStorage.setItem(
        key,
        JSON.stringify({ layout: 'grid', loadingMode: 'pages' }),
      ),
    preferenceKey,
  );
  fixture = await seedLibraryBatch(config, sql);
  const before = await readLibraryBatchSnapshot(sql, fixture.directory);
  assert.equal(before.images.length, 201);
  assert.equal(before.files.length, 402);
  errorScript = await installBrowserErrors(page);
  await page.evaluate(
    (key) => sessionStorage.removeItem(key),
    sessionEvidenceKey,
  );
  ({ identifier: sessionScript } = await page.cdp(
    'Page.addScriptToEvaluateOnNewDocument',
    {
      source: `(() => {
    const original = window.fetch;
    window.fetch = async (...args) => {
      const response = await original(...args);
      if (new URL(String(args[0]), location.href).pathname === '/api/auth/get-session') {
        const key = '${sessionEvidenceKey}';
        const requests = JSON.parse(sessionStorage.getItem(key) ?? '[]');
        requests.push({at:Date.now(),status:response.status,retryAfterSeconds:response.status === 429 ? Number(response.headers.get('x-retry-after')) : null});
        sessionStorage.setItem(key, JSON.stringify(requests));
      }
      return response;
    };
  })();`,
    },
  ));
  await resize(1440);

  if (
    !['visibility', 'feedback', 'tag-states'].includes(config.libraryBatchPhase)
  ) {
    report.activeCheck = 'target-selection-and-responsive';
    await visit();
    for (const index of [0, 1, 2, 3]) await choose(index);
    if (config.libraryBatchPhase !== 'representative') {
      report.activeCheck = 'short-selection-menu-keyboard';
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
          const popup = document.querySelector(
            '[data-slot="dropdown-popover"]',
          );
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
            items: [...menu.querySelectorAll('[role="menuitem"]')].map(
              (node) => ({
                name: node.textContent.trim(),
                height: node.getBoundingClientRect().height,
              }),
            ),
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
          document.documentElement.classList.contains('dark')
            ? 'dark'
            : 'light',
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
    await layouts(
      'add-albums',
      config.libraryBatchPhase === 'representative'
        ? [390, 1440]
        : [360, 390, 430, 768, 1440],
    );
    if (config.libraryBatchPhase !== 'representative') {
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
          (id) =>
            document.querySelector(`[data-target-id="${id}"] input`).checked,
          batchAlbumIds[0],
        ),
        false,
      );
      await page.keyboard.press('Space');
      assert.equal(
        await page.evaluate(
          (id) =>
            document.querySelector(`[data-target-id="${id}"] input`).checked,
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
          if (
            new URL(String(args[0]), location.href).pathname !== '/api/albums'
          )
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
          if (
            new URL(String(args[0]), location.href).pathname !== '/api/albums'
          )
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

      await sql(
        `UPDATE media_images SET visibility = 'private' WHERE id = '${batchImageId(0)}'`,
      );
      report.activeCheck = 'four-item-mixed-design-result';
      await action('添加到相册', 4);
      await target(batchAlbumIds[0]);
      await target(batchAlbumIds[1]);
      await sql(
        `CREATE TRIGGER issue177_batch_failure BEFORE INSERT ON album_images WHEN NEW.image_id = '${batchImageId(3)}' AND NEW.album_id = '${batchAlbumIds[1]}' BEGIN SELECT RAISE(ABORT, 'Issue 177 representative second relationship failure'); END`,
      );
      await monitor('hold');
      await page.click(submit);
      await page.waitForFunction(
        () => typeof window.__batchRelease === 'function',
      );
      assert.equal(
        await page.evaluate(() =>
          document
            .querySelector('#batch-title')
            .textContent.includes('操作完成'),
        ),
        false,
        'Held actual response cannot show a completed title',
      );
      await page.evaluate(() => window.__batchRelease());
      await done();
      await expectResults({ changed: 2, unchanged: 1, failed: 1 });
      await layouts('mixed-results');
      await sql('DROP TRIGGER issue177_batch_failure');
      await returnToLibrary();
      await selected(1);
      // Reset only this disposable fixture's successful representative relations.
      await sql(
        `DELETE FROM album_images WHERE image_id IN ('${batchImageId(1)}','${batchImageId(2)}')`,
      );

      report.activeCheck = '201-cross-page-mixed-and-retry';
      await selectAll201();
      await action('添加到相册', 201);
      await target(batchAlbumIds[0]);
      await target(batchAlbumIds[1]);
      await sql(
        `CREATE TRIGGER issue177_batch_failure BEFORE INSERT ON album_images WHEN NEW.image_id = '${batchImageId(150)}' AND NEW.album_id = '${batchAlbumIds[1]}' BEGIN SELECT RAISE(ABORT, 'Issue 177 real second relationship failure'); END`,
      );
      await monitor('hold');
      await page.click(submit);
      await page.waitForFunction(
        () => typeof window.__batchRelease === 'function',
      );
      assert.equal(
        await page.evaluate(
          () =>
            document
              .querySelector('[data-testid="library-batch"]')
              .getAttribute('aria-busy') === 'true',
        ),
        true,
      );
      await shot('applying', 1440, 'dark');
      await page.evaluate(() => window.__batchRelease());
      await done();
      let sent = await traffic();
      assert.deepEqual(
        sent.map((entry) => entry.request.ids.length),
        [200, 1],
      );
      assert.deepEqual(
        sent.flatMap((entry) => entry.request.ids).sort(),
        fixture.ids,
      );
      assert.ok(sent.every((entry) => entry.request.mode === 'apply'));
      const mixed = await expectResults({
        changed: 199,
        unchanged: 1,
        failed: 1,
      });
      const failed = mixed.find((row) => row.status === 'failed');
      assert.equal(failed.id, batchImageId(150));
      assert.equal(failed.inQuery, true);
      assert.deepEqual(
        await sql(
          `SELECT album_id FROM album_images WHERE image_id = '${failed.id}'`,
        ),
        [],
        'Second relationship failure rolls back the entire image relation change',
      );
      await layouts('cross-page-results', [390, 1440]);
      const beforeRetainedRead = (await traffic()).length;
      await page.click('[data-testid="batch-retained"]');
      await page.waitForFunction(
        () => document.querySelectorAll('[data-batch-result-id]').length === 1,
      );
      assert.equal(
        (await traffic()).length,
        beforeRetainedRead,
        'Viewing retained failures does not send any apply or check request',
      );
      assert.equal(
        await page.evaluate(
          () =>
            document.querySelector('[data-batch-result-id]')?.dataset
              .batchResultId,
        ),
        failed.id,
      );
      await layouts('valid-failure-before-retry', [390, 1440]);
      report.mixed = {
        requestSizes: sent.map((entry) => entry.request.ids.length),
        statuses: { changed: 199, unchanged: 1, failed: 1 },
        failed,
      };
      await page.click('[data-testid="batch-retry"]');
      await done();
      sent = await traffic();
      assert.deepEqual(
        sent.at(-1).request.ids,
        [failed.id],
        'A failed retry still sends only the retained ID',
      );
      assert.deepEqual(
        sent.at(-1).request.command,
        sent[0].request.command,
        'A failed retry retains both original album targets',
      );
      assert.equal(sent.at(-1).response.results[0].status, 'failed');
      assert.deepEqual(
        await page.evaluate(() =>
          [...document.querySelectorAll('[data-batch-result-id]')].map(
            (node) => ({
              id: node.dataset.batchResultId,
              status: node.dataset.resultStatus,
            }),
          ),
        ),
        [{ id: failed.id, status: 'failed' }],
        'A failed retry renders only its valid failed result',
      );
      await layouts('retry-still-failed', [390, 1440]);
      const beforeSecondRead = (await traffic()).length;
      await page.click('[data-testid="batch-retained"]');
      await page.waitForSelector('[data-testid="batch-retry"]');
      assert.equal(
        (await traffic()).length,
        beforeSecondRead,
        'Viewing the still-retained retry result does not write',
      );
      await sql('DROP TRIGGER issue177_batch_failure');
      await page.click('[data-testid="batch-retry"]');
      await done();
      sent = await traffic();
      assert.deepEqual(
        sent.at(-1).request.ids,
        [failed.id],
        'Retry writes only the valid failed selection',
      );
      assert.equal(sent.at(-1).response.results[0].status, 'changed');
      const retryView = await page.evaluate(() => ({
        ids: [...document.querySelectorAll('[data-batch-result-id]')].map(
          (node) => node.dataset.batchResultId,
        ),
        summary: document
          .querySelector('[data-testid="library-batch"] [role="status"]')
          ?.textContent.replace(/\s+/g, ' ')
          .trim(),
        changedRows: document.querySelectorAll(
          '[data-batch-result-id][data-result-status="changed"]',
        ).length,
        failedRows: document.querySelectorAll(
          '[data-batch-result-id][data-result-status="failed"]',
        ).length,
      }));
      assert.deepEqual(
        retryView.ids,
        [failed.id],
        'Successful retry renders only its one explicit ID',
      );
      assert.equal(
        retryView.summary,
        '本次重试1张 · 1已修改 · 0无需修改 · 0失败',
        'Retry summary describes only this attempt',
      );
      assert.equal(retryView.changedRows, 1);
      assert.equal(retryView.failedRows, 0);
      report.retryView = retryView;
      for (const width of [390, 1440]) {
        await resize(width);
        await page.hover(`[data-batch-result-id="${failed.id}"]`);
        await shot('valid-failure-after-retry', width, 'dark');
      }
      assert.equal(
        (
          await sql(
            "SELECT count(*) AS count FROM album_images WHERE image_id LIKE 'issue177-%'",
          )
        )[0].count,
        402,
      );
      await returnToLibrary();
      await selected(0);
      report.checks.push(
        '201 cross-page explicit IDs split into 200+1; real multi-target transaction returns 199 changed, one unchanged and one failed; the failed image has neither relation, remains selected across pages, and retry submits only its ID.',
      );

      report.activeCheck = 'four-relations-and-album-default';
      await pickFirstTwo('从相册移除');
      await target(batchAlbumIds[0]);
      await target(batchAlbumIds[1]);
      await monitor();
      await page.click(submit);
      await done();
      await expectResults({ changed: 2 });
      assert.deepEqual(
        await sql(
          `SELECT * FROM album_images WHERE image_id IN ('${batchImageId(0)}','${batchImageId(1)}')`,
        ),
        [],
      );
      await returnToLibrary();
      await verifyTagTargets([0, 1]);
      await page.goto(
        `${config.origin}/albums/${batchAlbumIds[0]}?pageSize=80&page=1`,
      );
      await loaded(80);
      await page.fill('input[aria-label="搜索图片名称"]', batchImageName(2));
      await page.press('input[aria-label="搜索图片名称"]', 'Enter');
      await loaded(1);
      await choose(2);
      await action('从相册移除', 1);
      assert.equal(
        await page.evaluate(
          (id) =>
            document.querySelector(`[data-target-id="${id}"] input`)?.checked ??
            document.querySelector(`[data-target-id="${id}"]`)?.checked,
          batchAlbumIds[0],
        ),
        true,
        'Album remove defaults to the current album',
      );
      await monitor();
      await page.click(submit);
      await done();
      const albumRemoval = await expectResults({ changed: 1 });
      assert.equal(albumRemoval[0].inQuery, false);
      await returnToLibrary();
      await selected(0);
      assert.equal(
        (
          await sql(
            `SELECT count(*) AS count FROM album_images WHERE album_id = '${batchAlbumIds[0]}' AND image_id = '${batchImageId(2)}'`,
          )
        )[0].count,
        0,
      );
      report.checks.push(
        'Library executes add/remove album and add/remove tag against real relationships, including a tag created and selected through the shared real quick-create UI; album page defaults removal to its current album and removes the successful out-of-query item from selection.',
      );

      report.activeCheck = 'concurrent-target-deletion';
      await pickFirstTwo('添加到相册');
      await target('issue177-album-c');
      const deleted = await page.fetch('/api/albums/issue177-album-c', {
        method: 'DELETE',
      });
      assert.equal(deleted.status, 200);
      await monitor();
      await page.click(submit);
      await done();
      const targetFailures = await expectResults({ failed: 2 });
      assert.deepEqual(
        await sql(
          `SELECT * FROM album_images WHERE image_id IN ('${batchImageId(0)}','${batchImageId(1)}')`,
        ),
        [],
      );
      await returnToLibrary();
      await selected(2);
      await page.click(button('操作已选 2 张图片'));
      await page.click('loc=role:menuitem[name="查看已选清单"]');
      await page.waitForSelector('[data-testid="library-selected-panel"]');
      assert.equal(
        await page.evaluate(
          (message) =>
            document
              .querySelector('[data-testid="library-selected-panel"]')
              .textContent.includes(`上次批量操作失败：${message}`),
          targetFailures[0].message,
        ),
        true,
        'Returning to the selected list retains the actual failure cause',
      );
      await page.keyboard.press('Escape');
      report.checks.push(
        'Deleting the selected real album after the workspace opens returns per-image target failures without creating any relationship and preserves both valid selected images.',
      );

      report.activeCheck = '201-visibility-loss-check-unsent';
      await selectAll201();
      await action('设为公开', 201);
      await layouts('public-confirm', [390, 1440]);
      await monitor('lose');
      await page.click(submit);
      await page.waitForSelector('[data-testid="batch-check"]');
      await settle();
      sent = await traffic();
      assert.equal(
        sent.length,
        1,
        'A lost response never automatically writes or checks again',
      );
      assert.equal(sent[0].request.mode, 'apply');
      assert.equal(sent[0].request.ids.length, 200);
      assert.equal(
        sent[0].response.results.every((row) => row.status === 'changed'),
        true,
      );
      assert.equal(
        (
          await sql(
            "SELECT count(*) AS count FROM media_images WHERE id LIKE 'issue177-%' AND visibility = 'public'",
          )
        )[0].count,
        200,
      );
      assert.equal(
        (
          await sql(
            `SELECT visibility FROM media_images WHERE id = '${batchImageId(200)}'`,
          )
        )[0].visibility,
        'private',
        'The unsent final image is unchanged',
      );
      await assertNoVisibilityToast();
      await layouts('unknown', [390, 1440]);
      await page.evaluate(() => {
        window.__batchFault = 'check-lose';
      });
      await page.click('[data-testid="batch-check"]');
      await page.waitForFunction(
        () =>
          document.querySelector('#batch-title')?.textContent ===
            '暂时无法核对结果' &&
          document
            .querySelector('[data-testid="batch-check"]')
            ?.textContent.includes('再次核对'),
      );
      await assertNoVisibilityToast();
      await layouts('check-failed', [390, 1440]);
      sent = await traffic();
      assert.deepEqual(
        sent.map((entry) => entry.request.mode),
        ['apply', 'check'],
        'A failed read-only check never re-applies the operation',
      );
      assert.equal(sent[1].request.ids.length, 200);
      await page.click('[data-testid="batch-check"]');
      await done();
      sent = await traffic();
      assert.deepEqual(
        sent.map((entry) => entry.request.mode),
        ['apply', 'check', 'check'],
      );
      assert.equal(sent[2].request.ids.length, 200);
      assert.equal(
        sent[2].response.results.every((row) => row.status === 'unchanged'),
        true,
      );
      assert.equal(
        await page.evaluate(() =>
          document
            .querySelector('[data-testid="library-batch"]')
            .textContent.includes('1张尚未提交'),
        ),
        true,
        'Check preserves the single unsent image',
      );
      await assertNoVisibilityToast();
      await page.waitForSelector('[data-testid="batch-retry"]');
      assert.equal(
        await page.evaluate(
          () => document.querySelector('[data-testid="batch-retry"]').disabled,
        ),
        false,
        'The unsent image has an explicit continuation action',
      );
      const continuedSourceUrl = await page.url();
      await page.click('[data-testid="batch-retry"]');
      await done();
      sent = await traffic();
      assert.deepEqual(
        sent.map((entry) => entry.request.mode),
        ['apply', 'check', 'check', 'apply'],
      );
      assert.deepEqual(
        sent[3].request.ids,
        [batchImageId(200)],
        'Explicit continuation submits only the final unsent ID',
      );
      assert.equal(
        (
          await sql(
            "SELECT count(*) AS count FROM media_images WHERE id LIKE 'issue177-%' AND visibility = 'public'",
          )
        )[0].count,
        201,
      );
      const continuedView = await visibilityToast(
        'public',
        1,
        0,
        continuedSourceUrl,
      );
      report.continuedView = continuedView;
      await toastLayouts('public-continued-toast', continuedView);
      report.lostResponse = {
        applied: 200,
        checked: 200,
        explicitlyContinued: sent[3].request.ids,
        modes: sent.map((entry) => entry.request.mode),
      };
      await selected(0);
      await pickFirstTwo('设为私有');
      const privateSourceUrl = await page.url();
      await layouts('private-confirm', [390, 1440]);
      await observeVisibilitySubmit();
      await monitor();
      await page.click(submit);
      await done();
      await readVisibilitySubmit();
      await expectResults({ changed: 2 });
      const privateToast = await visibilityToast(
        'private',
        2,
        0,
        privateSourceUrl,
      );
      await toastLayouts('private-two-changed-toast', privateToast);
      assert.deepEqual(
        (
          await sql(
            `SELECT visibility FROM media_images WHERE id IN ('${batchImageId(0)}','${batchImageId(1)}') ORDER BY id`,
          )
        ).map((row) => row.visibility),
        ['private', 'private'],
      );
      report.checks.push(
        'Discarding the real committed first 200-image public response stops the final unsent item; check reads only the 200 unknown IDs; explicit continuation writes only the last ID; private action only changes visibility.',
      );

      await verifyVisibilitySuccess();
      await verifyVisibilityFailures();
      report.activeCheck = 'trash-restore-preserves-surviving-data';
      const joinedAt = 1712345678901;
      await sql(
        `INSERT INTO album_images (album_id,image_id,joined_at) VALUES ('${batchAlbumIds[0]}','${batchImageId(0)}',${joinedAt}),('${batchAlbumIds[1]}','${batchImageId(0)}',${joinedAt})`,
      );
      await sql(
        `INSERT INTO image_tags (image_id,tag_id) VALUES ('${batchImageId(0)}','${batchTagIds[0]}'),('${batchImageId(0)}','${batchTagIds[1]}')`,
      );
      await pickFirstTwo('移入回收站');
      await layouts('trash-confirm', [390, 1440]);
      await monitor();
      await page.click(submit);
      await done();
      await expectResults({ changed: 2 });
      assert.equal(
        (
          await sql(
            `SELECT count(*) AS count FROM media_images WHERE id IN ('${batchImageId(0)}','${batchImageId(1)}') AND trashed_at IS NOT NULL`,
          )
        )[0].count,
        2,
      );
      await layouts('trash-success', [390, 1440]);
      await returnToLibrary();
      await selected(0);
      const trashBefore = await readLibraryBatchSnapshot(
        sql,
        fixture.directory,
      );
      assert.deepEqual(trashBefore.files, before.files);
      assert.deepEqual(trashBefore.objects, before.objects);
      assert.equal((await page.fetch(`/i/${batchImageId(0)}`)).status, 404);
      assert.equal(
        (
          await page.fetch(`/api/albums/${batchAlbumIds[0]}`, {
            method: 'DELETE',
          })
        ).status,
        200,
      );
      assert.equal(
        (await page.fetch(`/api/tags/${batchTagIds[0]}`, { method: 'DELETE' }))
          .status,
        200,
      );
      // Extend this independent trash fixture so selection truly spans six real pages.
      const trashedAt = 1820000000000;
      await sql(
        `UPDATE media_images SET trashed_at = ${trashedAt} WHERE id LIKE 'issue177-%'`,
      );
      await page.goto(`${config.origin}/trash`);
      await page.waitForSelector('[data-testid="trash-list"]');
      for (let number = 1; number <= 5; number++) {
        await page.waitForSelector(
          `[data-testid="trash-record-${batchImageId((number - 1) * 40)}"]`,
        );
        await page.click('label:has(input[aria-label="全选当前页回收记录"])');
        await page.waitForFunction(
          (count) =>
            document
              .querySelector('[data-testid="trash-selection"]')
              ?.textContent.includes(`共选 ${count} 张`),
          number * 40,
        );
        await page.click('loc=role:button[name="下一页"]');
      }
      await page.waitForSelector(
        `[data-testid="trash-record-${batchImageId(200)}"]`,
      );
      await page.click(
        `label:has(input[aria-label="选择回收图片：${batchImageName(200)}"])`,
      );
      await page.waitForFunction(() =>
        document
          .querySelector('[data-testid="trash-selection"]')
          ?.textContent.includes('共选 201 张'),
      );
      await action('恢复所选', 201);
      await layouts('restore', [390, 1440]);
      await sql(
        `CREATE TRIGGER issue177_restore_failure BEFORE UPDATE OF trashed_at ON media_images WHEN OLD.id = '${batchImageId(150)}' AND NEW.trashed_at IS NULL BEGIN SELECT RAISE(ABORT, 'Issue 177 actual per-image restore failure'); END`,
      );
      await monitor();
      await page.click(submit);
      await done();
      await expectResults({ changed: 200, failed: 1 });
      await layouts('restore-mixed-summary', [390, 1440]);
      await page.click('[data-testid="batch-view-failures"]');
      await page.waitForSelector('[data-testid="batch-results"]');
      await layouts('restore-valid-failure', [390, 1440]);
      sent = await traffic();
      assert.deepEqual(
        sent.map((entry) => entry.request.ids.length),
        [200, 1],
      );
      assert.deepEqual(
        sent.flatMap((entry) => entry.request.ids).sort(),
        fixture.ids,
      );
      await sql('DROP TRIGGER issue177_restore_failure');
      await page.click('[data-testid="batch-retry"]');
      await done();
      sent = await traffic();
      assert.deepEqual(
        sent.at(-1).request.ids,
        [batchImageId(150)],
        'Restore retry includes only the valid failed item',
      );
      assert.equal(sent.at(-1).response.results[0].status, 'changed');
      await layouts('restore-summary', [390, 1440]);
      const after = await readLibraryBatchSnapshot(sql, fixture.directory);
      assert.deepEqual(
        after.images.map((row) => row.id),
        before.images.map((row) => row.id),
      );
      assert.ok(after.images.every((row) => row.trashed_at === null));
      assert.deepEqual(after.objects, before.objects);
      assert.deepEqual(after.files, before.files);
      assert.deepEqual(
        after.images.map(({ id, visibility }) => ({ id, visibility })),
        trashBefore.images.map(({ id, visibility }) => ({ id, visibility })),
        'Restore retains each original pre-trash visibility',
      );
      assert.deepEqual(
        await sql(
          `SELECT album_id,joined_at FROM album_images WHERE image_id = '${batchImageId(0)}'`,
        ),
        [{ album_id: batchAlbumIds[1], joined_at: joinedAt }],
      );
      assert.deepEqual(
        await sql(
          `SELECT tag_id FROM image_tags WHERE image_id = '${batchImageId(0)}'`,
        ),
        [{ tag_id: batchTagIds[1] }],
      );
      report.dataPreservation = {
        imageIds: 201,
        objects: after.objects.length,
        files: after.files.length,
        survivingAlbum: batchAlbumIds[1],
        originalJoinedAt: joinedAt,
        survivingTag: batchTagIds[1],
        requestSizes: sent.map((entry) => entry.request.ids.length),
      };
      await returnToLibrary();
      await selected(0);
      report.checks.push(
        'Batch trash retains stored files and relations while external content refuses reads; 201 explicitly selected trash records span six pages and restore in 200+1 batches, one actual per-image restore failure remains selected and explicit retry writes only its ID, with identical IDs, 402 objects/files, original visibility and surviving album/tag relationships plus original joined_at; deleted targets stay deleted.',
      );
    }
  }
  if (['visibility', 'feedback'].includes(config.libraryBatchPhase)) {
    await verifyVisibilitySuccess();
    await verifyVisibilityFailures();
  }
  if (['feedback', 'tag-states'].includes(config.libraryBatchPhase)) {
    await verifyTagTargets();
    await verifyTagRetryAfterAlbumError();
  }
  const sessionResponses = await page.evaluate(
    (key) => JSON.parse(sessionStorage.getItem(key) ?? '[]'),
    sessionEvidenceKey,
  );
  report.sessionRateLimit = {
    observedResponses: sessionResponses.length,
    limitedResponses: sessionResponses.filter((entry) => entry.status === 429),
    waits: report.sessionWaits,
  };
  report.errors = await assertNoBrowserErrors(page);
  report.status = 'passed';
} catch (error) {
  report.error = error.stack ?? String(error);
  try {
    await page.screenshot({
      path: join(config.output, 'library-batch-failure.png'),
    });
  } catch (screenshotError) {
    report.screenshotError = screenshotError.stack ?? String(screenshotError);
  }
  throw error;
} finally {
  await page.evaluate(() => {
    window.__visibilityObserver?.disconnect();
    window.__tagTargetRelease?.();
  });
  if (fixture) await cleanLibraryBatch(sql, fixture);
  if (savedPreference !== undefined)
    await page.evaluate(
      ({ key, saved }) => {
        if (saved === null) localStorage.removeItem(key);
        else localStorage.setItem(key, saved);
      },
      { key: preferenceKey, saved: savedPreference },
    );
  if (sessionScript) {
    await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
      identifier: sessionScript,
    });
    await page.evaluate(
      (key) => sessionStorage.removeItem(key),
      sessionEvidenceKey,
    );
  }
  if (errorScript)
    await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
      identifier: errorScript,
    });
  await writeFile(
    join(config.output, 'library-batch.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
console.log(report);
