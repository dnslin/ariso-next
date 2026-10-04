/* global taskSpace, config */
const assert = (await import('node:assert/strict')).default;
const { mkdir, readFile, rm, writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { identitySql } = await import(config.identitySessionScript);
const { seedLibraryBatch, cleanLibraryBatch, batchImageId } = await import(
  new URL('./library-batch-fixture.mjs', config.libraryDetailScript).href
);
const { signInToLibrary } = await import(
  new URL('./library-login.mjs', config.libraryDetailScript).href
);
const { installBrowserErrors, assertNoBrowserErrors } = await import(
  config.errorsScript
);
const task = await taskSpace(config.spaceId);
const page = task.page(config.pageLabel ?? 'p1');
const sql = (statement) => identitySql(config, statement);
const report = {
  status: 'failed',
  taskSpaceId: task.spaceId,
  checks: [],
  layouts: [],
  screenshots: [],
};
let fixture, errorScript;
const disabledStorageId = 'issue178-filter-storage';
const progressJobId = 'issue178-batch-progress-writer';
let disabledStorageSeeded = false;
let brokenFile;
let brokenBytes;
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
          (animation) => animation.effect?.getTiming().iterations !== Infinity,
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
      () => !!document.querySelector('input[aria-label="全选当前页回收记录"]'),
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
async function seed() {
  fixture = await seedLibraryBatch(config, sql);
  await sql(
    "UPDATE media_images SET trashed_at=1811000000000 WHERE id LIKE 'issue177-%'" +
      (config.trashPhase === 'representative'
        ? " AND id <= 'issue177-007'"
        : ''),
  );
  await page.goto(
    `${config.origin}/trash?${config.trashPhase === 'representative' ? 'pageSize=40&page=1' : 'q=issue177-&pageSize=80&page=1'}`,
  );
  await loaded(config.trashPhase === 'representative' ? 8 : 80);
}
async function cleanup() {
  await sql('DROP TRIGGER IF EXISTS issue178_cleanup_failure');
  await sql(`DELETE FROM media_jobs WHERE id='${progressJobId}'`);
  await sql("DELETE FROM media_cleanup_jobs WHERE image_id LIKE 'issue177-%'");
  await cleanLibraryBatch(sql, fixture);
  if (disabledStorageSeeded) {
    await sql(`DELETE FROM storage_configs WHERE id='${disabledStorageId}'`);
    disabledStorageSeeded = false;
  }
  fixture = null;
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
async function verifyApprovedProgress() {
  report.activeCheck = 'approved-progress-submitting';
  const id = fixture.ids[0];
  const now = Date.now();
  await sql(
    `INSERT INTO media_jobs (id,image_id,kind,scope,snapshot,expected_versions,status,created_at,updated_at) VALUES ('${progressJobId}','${id}','process','all','{}','[]','running',${now},${now})`,
  );
  await resize(1440);
  await select(0);
  await action('永久删除所选', 1);
  await page.waitForSelector('[data-testid="trash-batch-confirm"]');
  await page.evaluate(() => {
    const original = window.fetch;
    window.__trashOriginalFetch = original;
    window.__trashTraffic = [];
    window.__trashProgressReceived = false;
    window.fetch = async (...args) => {
      const path = new URL(String(args[0]), location.href).pathname;
      if (path !== '/api/images/batch') return original(...args);
      const body = JSON.parse(args[1].body);
      window.__trashTraffic.push(body);
      const response = await original(...args);
      if (body.mode === 'apply') {
        window.__trashProgressActualResponse = await response.clone().json();
        await new Promise((resolve) => {
          window.__trashProgressRelease = resolve;
          window.__trashProgressReceived = true;
        });
      }
      return response;
    };
  });
  await page.click('[data-testid="trash-batch-submit"]');
  await page.waitForFunction(
    () =>
      window.__trashProgressReceived &&
      document
        .querySelector('[data-testid="trash-batch"]')
        ?.getAttribute('aria-busy') === 'true',
  );
  const accepted = await page.evaluate(
    () => window.__trashProgressActualResponse.results[0],
  );
  assert.equal(accepted.id, id);
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.cleanup.status, 'queued');
  assert.equal(accepted.cleanup.waitingForWrites, true);
  assert.deepEqual(
    await page.evaluate(() =>
      window.__trashTraffic.map((request) => ({
        ids: request.ids,
        mode: request.mode,
      })),
    ),
    [{ ids: [id], mode: 'apply' }],
  );
  await page.waitForSelector(
    '[data-testid="trash-batch"] [data-slot="spinner"]',
  );
  assert.equal(
    await page.evaluate(
      (id) =>
        document.querySelector(
          `[data-testid="trash-batch-table"] tr[data-image-id="${id}"]`,
        )?.dataset.state,
      id,
    ),
    'waiting',
  );
  async function pictures(state) {
    for (const width of [1440, 390]) {
      await resize(width);
      if (width === 390) {
        const trigger = item('trash-batch-item-trigger', id, true);
        const expanded = await page.evaluate(
          (selector) =>
            document.querySelector(selector)?.getAttribute('aria-expanded'),
          trigger,
        );
        if (expanded !== 'true') await page.click(trigger);
        await page.waitForFunction(
          (selector) =>
            document.querySelector(selector)?.getAttribute('aria-expanded') ===
            'true',
          trigger,
        );
      }
      for (const mode of ['light', 'dark'])
        await screenshot(state, width, mode);
    }
  }
  await pictures('approved-progress-submitting');
  await page.evaluate(() => window.__trashProgressRelease());
  await waitBatch();
  await restoreBatchTraffic();
  report.activeCheck = 'approved-progress-waiting-for-writes';
  await page.waitForFunction(
    (id) =>
      document.querySelector(
        `[data-testid="trash-batch-table"] tr[data-image-id="${id}"]`,
      )?.dataset.state === 'queued',
    id,
  );
  const queued = JSON.parse(
    (await page.fetch(`/api/images/${id}/cleanup`)).body,
  );
  assert.equal(queued.status, 'queued');
  assert.equal(queued.waitingForWrites, true);
  assert.equal(queued.remaining.length, 2);
  assert.ok(
    await page.evaluate(
      (id) =>
        document
          .querySelector(
            `[data-testid="trash-batch-table"] tr[data-image-id="${id}"]`,
          )
          ?.textContent.includes('等待写入结束'),
      id,
    ),
  );
  await pictures('approved-progress-waiting-for-writes');
  // The accepted task already owns both real files. Defer only the original's
  // next attempt; the production worker alone updates cleanup task status.
  await sql(
    `UPDATE media_objects SET next_cleanup_at=${Date.now() + 300000} WHERE image_id='${id}' AND purpose='original'`,
  );
  await sql(
    `UPDATE media_jobs SET status='cancelled' WHERE id='${progressJobId}'`,
  );
  report.activeCheck = 'approved-progress-running';
  await page.waitForFunction(
    async (id) => {
      const response = await fetch(`/api/images/${id}/cleanup`);
      if (!response.ok) return false;
      const task = await response.json();
      return (
        task.status === 'running' &&
        task.deletedObjects === 1 &&
        task.remaining.length === 1
      );
    },
    id,
    { timeout: 30000 },
  );
  await page.waitForFunction((id) => {
    const row = document.querySelector(
      `[data-testid="trash-batch-table"] tr[data-image-id="${id}"]`,
    );
    return (
      row?.dataset.state === 'running' &&
      row.textContent.includes('已清理 1 / 2 个对象')
    );
  }, id);
  const running = JSON.parse(
    (await page.fetch(`/api/images/${id}/cleanup`)).body,
  );
  assert.equal(running.status, 'running');
  assert.equal(running.waitingForWrites, false);
  assert.equal(running.deletedObjects, 1);
  assert.equal(running.totalObjects, 2);
  assert.equal(running.remaining.length, 1);
  assert.equal(running.remaining[0].purpose, 'original');
  assert.ok(running.remaining[0].nextAttemptAt);
  await pictures('approved-progress-running');
  await sql(
    `UPDATE media_objects SET next_cleanup_at=NULL WHERE image_id='${id}'`,
  );
  await page.waitForFunction(
    (id) =>
      document.querySelector(
        `[data-testid="trash-batch-table"] tr[data-image-id="${id}"]`,
      )?.dataset.state === 'succeeded',
    id,
    { timeout: 30000 },
  );
  const succeeded = JSON.parse(
    (await page.fetch(`/api/images/${id}/cleanup`)).body,
  );
  assert.equal(succeeded.status, 'succeeded');
  assert.equal(succeeded.waitingForWrites, false);
  assert.equal(succeeded.remaining.length, 0);
  assert.equal(
    (
      await sql(`SELECT count(*) AS count FROM media_images WHERE id='${id}'`)
    )[0].count,
    0,
  );
  report.progressTasks = {
    accepted: accepted.cleanup,
    queued,
    running,
    succeeded,
  };
  report.checks.push(
    '一项真实永久删除：只延迟已收到的真实受理响应保留提交中Spinner；活动写责任保持queued等待；未来next_cleanup_at使production worker进入running并真实清理1/2；到期后实际完成。Table/展开Accordion各浅深截图，不写清理任务状态或伪造HTTP。',
  );
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
async function verifyResultPresentation(total) {
  await resize(1440);
  await page.waitForSelector('[data-testid="trash-batch-table"] table');
  const desktop = await page.evaluate(() => ({
    rows: document.querySelectorAll(
      '[data-testid="trash-batch-table"] tr[data-image-id]',
    ).length,
    accordionHidden:
      document
        .querySelector('[data-testid="trash-batch-accordion"]')
        .getBoundingClientRect().height === 0,
    duplicateSummary: [
      ...document.querySelectorAll('[data-testid="trash-batch"] dl'),
    ].some((dl) => !dl.closest('[data-testid="trash-batch-item-details"]')),
    permanentExplanation: document
      .querySelector('[data-testid="trash-batch"]')
      .textContent.includes('任务受理后不可恢复。仅处理本次选定'),
  }));
  assert.equal(desktop.rows, Math.min(20, total));
  assert.equal(desktop.accordionHidden, true);
  assert.equal(desktop.duplicateSummary, false);
  assert.equal(desktop.permanentExplanation, false);
  await screenshot('approved-results-table', 1440, 'light');
  await screenshot('approved-results-table', 1440, 'dark');
  await resize(390);
  const accordion = '[data-testid="trash-batch-accordion"]';
  const triggers = await page.evaluate(
    (accordion) =>
      [
        ...document.querySelectorAll(
          `${accordion} [data-testid="trash-batch-item-trigger"]`,
        ),
      ].map((trigger) => ({
        id: trigger.dataset.imageId,
        expanded: trigger.getAttribute('aria-expanded'),
        height: trigger.getBoundingClientRect().height,
        minHeight: getComputedStyle(trigger).minHeight,
      })),
    accordion,
  );
  assert.equal(triggers.length, Math.min(20, total));
  report.accordionTriggers = triggers;
  assert.ok(
    triggers.every(
      (trigger) => trigger.height >= 44 && trigger.expanded === 'false',
    ),
  );
  assert.ok(
    triggers.every((trigger) => trigger.height >= 80),
    `Approved short-name accordion items must be at least 80px: ${JSON.stringify(triggers)}`,
  );
  const first = item('trash-batch-item-trigger', triggers[0].id, true);
  const second = item('trash-batch-item-trigger', triggers[1].id, true);
  await page.focus(first);
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    (id) =>
      document
        .querySelector(
          `[data-testid="trash-batch-accordion"] [data-testid="trash-batch-item-trigger"][data-image-id="${id}"]`,
        )
        ?.getAttribute('aria-expanded') === 'true',
    triggers[0].id,
  );
  await page.focus(second);
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    (id) =>
      document
        .querySelector(
          `[data-testid="trash-batch-accordion"] [data-testid="trash-batch-item-trigger"][data-image-id="${id}"]`,
        )
        ?.getAttribute('aria-expanded') === 'true',
    triggers[1].id,
  );
  assert.deepEqual(
    await page.evaluate(
      (accordion) =>
        [
          ...document.querySelectorAll(`${accordion} [aria-expanded="true"]`),
        ].map((trigger) => trigger.dataset.imageId),
      accordion,
    ),
    [triggers[1].id],
  );
  await screenshot('approved-results-accordion', 390, 'light');
  await screenshot('approved-results-accordion', 390, 'dark');
  await screenshot('approved-results-accordion-short', 360, 'light', 430);
  await page.focus(second);
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    (id) =>
      document
        .querySelector(
          `[data-testid="trash-batch-accordion"] [data-testid="trash-batch-item-trigger"][data-image-id="${id}"]`,
        )
        ?.getAttribute('aria-expanded') === 'false',
    triggers[1].id,
  );
  await resize(1440);
  await resultPage(2);
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelectorAll(
          '[data-testid="trash-batch-table"] tr[data-image-id]',
        ).length,
    ),
    Math.min(20, total - 20),
  );
  await screenshot('approved-results-page-2', 1440, 'light');
  await resultPage(1);
  report.checks.push(
    '真实桌面Table、手机Accordion键盘Enter及单项展开、44px目标、20项结果分页；汇总仅一处且无常驻确认说明。',
  );
}
async function verifyFilterConsumers() {
  const [storage] = await sql(
    "SELECT id,name FROM storage_configs WHERE enabled=1 AND type='local' LIMIT 1",
  );
  for (const { path, active } of [
    { path: '/library', active: '/library' },
    { path: '/albums/issue177-album-a', active: '/albums' },
  ]) {
    await page.goto(`${config.origin}${path}`);
    await page.waitForSelector('[data-testid="library-list"]');
    for (const width of [1440, 390]) {
      await resize(width);
      for (const { category, label, search, option, queryKey, value } of [
        {
          category: 'storages',
          label: '存储位置',
          search: storage.name,
          option: storage.name,
          queryKey: 'storageId',
          value: storage.id,
        },
        {
          category: 'tags',
          label: '标签',
          search: 'Issue 177 标签 A',
          option: 'Issue 177 标签 A',
          queryKey: 'tagId',
          value: 'issue177-tag-a',
        },
      ]) {
        if (
          !(await page.evaluate(
            (category) =>
              !!document.querySelector(`[data-filter-category="${category}"]`),
            category,
          ))
        ) {
          await page.click(button('添加条件'));
          await page.click(`loc=role:menuitem[name="${label}"]`);
        }
        const trigger = `[data-filter-category="${category}"] button[aria-haspopup]`;
        const geometry = await page.evaluate((selector) => {
          const control = document.querySelector(selector);
          return {
            height: control.getBoundingClientRect().height,
            text: control.closest('[data-filter-category]').textContent,
          };
        }, trigger);
        assert.equal(geometry.height, 44);
        assert.ok(
          geometry.text.includes(category === 'tags' ? '标签' : '存储位置'),
        );
        await page.click(trigger);
        await page.fill('input[placeholder="输入名称搜索"]', search);
        await page.waitForSelector(`loc=role:option[name="${option}"]`);
        await page.click(`loc=role:option[name="${option}"]`);
        if (category === 'tags') await page.keyboard.press('Escape');
        await page.waitForFunction(
          ({ queryKey, value }) =>
            new URL(location.href).searchParams
              .getAll(queryKey)
              .includes(value),
          { queryKey, value },
        );
      }
      assert.ok(
        await page.evaluate(
          (active) =>
            [
              ...document.querySelectorAll(
                '.shell-navigation [aria-current="page"]',
              ),
            ].some((link) => new URL(link.href).pathname === active),
          active,
        ),
      );
      await screenshot(
        `approved-consumer-${active.slice(1)}`,
        width,
        width === 1440 ? 'light' : 'dark',
      );
      // Repeat the menu interaction at the other viewport from the same clean route.
      if (width === 1440) {
        await page.goto(`${config.origin}${path}`);
        await page.waitForSelector('[data-testid="library-list"]');
      }
    }
  }
  report.checks.push(
    '图库及相册详情实际回归：桌面/手机默认condition控件仍44px，存储/标签菜单真实查询与选择正常，公共当前导航正确。',
  );
}
async function verifyApprovedQueries() {
  await sql(
    `INSERT INTO storage_configs (id,name,type,enabled,local_path,created_at,updated_at) VALUES ('${disabledStorageId}','Issue 178 已停用筛选存储','local',0,'issue178-filter',1810000000000,1810000000000)`,
  );
  disabledStorageSeeded = true;
  await sql(
    `INSERT INTO media_images (id,storage_id,original_name,display_name,visibility,format,mime,width,height,byte_size,classification,processing_status,created_at,updated_at,trashed_at) VALUES ('issue177-filter-disabled','${disabledStorageId}','issue177-filter-disabled.png','issue177-filter-disabled.png','private','png','image/png',640,480,${fixture.bytes},'static','ready',1810000000000,1810000000000,1811000000000)`,
  );
  async function startSelectedPageTwo() {
    await page.goto(`${config.origin}/trash?q=issue177-&pageSize=80&page=2`);
    await loaded(80);
    await select(80);
    await selected(1);
  }
  async function choose(label, option, key, expected, expectedCount) {
    await startSelectedPageTwo();
    await page.click(
      `[data-testid="trash-filters"] button[aria-haspopup] >> nth=${{ 存储: 0, 处理状态: 1, 删除状态: 2 }[label]}`,
    );
    if (label === '存储')
      await page.fill(
        'input[placeholder="输入名称搜索"]',
        'Issue 178 已停用筛选存储',
      );
    await page.waitForSelector(`loc=role:option[name="${option}"]`);
    await page.click(`loc=role:option[name="${option}"]`);
    await loaded(expectedCount);
    await selected(0);
    const query = new URL(await page.url()).searchParams;
    assert.equal(query.get(key), expected);
    assert.equal(query.get('page'), '1');
    assert.equal(query.get('q'), 'issue177-');
    if (label !== '存储') {
      await page.click(
        `[data-testid="trash-filters"] button[aria-haspopup] >> nth=${{ 处理状态: 1, 删除状态: 2 }[label]}`,
      );
      await page.click(`loc=role:option[name="全部${label}"]`);
      await loaded(80);
      assert.equal(new URL(await page.url()).searchParams.get(key), null);
    }
  }
  await choose('处理状态', '已就绪', 'status', 'ready', 80);
  await choose('删除状态', '已回收', 'deletionStatus', 'none', 80);
  await choose(
    '存储',
    'Issue 178 已停用筛选存储（已停用）',
    'storageId',
    disabledStorageId,
    1,
  );
  assert.ok(
    await page.evaluate(() =>
      document
        .querySelector('[data-testid="trash-list"]')
        .textContent.includes('存储停用'),
    ),
  );
  await screenshot('approved-disabled-storage-filter', 390, 'light');
  await screenshot('approved-disabled-storage-filter', 1440, 'dark');
  await page.click(button('清除搜索'));
  await loaded(1);
  const cleared = new URL(await page.url()).searchParams;
  assert.equal(cleared.get('q'), null);
  assert.equal(cleared.get('storageId'), disabledStorageId);
  await page.click(
    'loc=role:button[name="Issue 178 已停用筛选存储（已停用） 存储"]',
  );
  await page.click(button('清除存储筛选'));
  await loaded(80);
  assert.equal(new URL(await page.url()).searchParams.get('storageId'), null);
  await sql("DELETE FROM media_images WHERE id='issue177-filter-disabled'");
  await sql(`DELETE FROM storage_configs WHERE id='${disabledStorageId}'`);
  disabledStorageSeeded = false;
  await page.goto(
    `${config.origin}/trash?q=issue177-&status=ready&deletionStatus=none&pageSize=80&page=1`,
  );
  await loaded(80);
  for (const size of [20, 40, 80]) {
    await page.click(button('下一页'));
    await loaded(
      Number(new URL(await page.url()).searchParams.get('pageSize')),
    );
    const firstId = await page.evaluate(() =>
      document
        .querySelector('[data-testid="trash-list"] > li > button')
        .dataset.testid.replace('trash-record-', ''),
    );
    await select(Number(firstId.slice(-3)));
    await page.click('loc=role:button[name*="每页条数"]');
    await page.click(`loc=role:option[name="${size}"]`);
    await loaded(size);
    await selected(0);
    const query = new URL(await page.url()).searchParams;
    assert.equal(query.get('pageSize'), String(size));
    assert.equal(query.get('page'), '1');
    assert.equal(query.get('status'), 'ready');
    assert.equal(query.get('deletionStatus'), 'none');
    await page.click(button('下一页'));
    await loaded(size);
    const before = await page.url();
    await page.click('[data-testid="trash-list"] > li > button >> nth=0');
    await page.waitForSelector('[data-testid="trash-detail"]');
    await page.click(button('返回回收站列表'));
    await loaded(size);
    assert.equal(await page.url(), before);
    await screenshot(
      `approved-page-size-${size}`,
      size === 40 ? 390 : 1440,
      'light',
    );
    await resize(1440);
  }
  await page.goto(`${config.origin}/trash?q=issue177-&pageSize=80&page=1`);
  await loaded(80);
  report.filterValueAlignment = await page.evaluate(() =>
    [...document.querySelectorAll('.select__trigger')].map((trigger) => {
      const value = trigger.querySelector('.select__value');
      const controlRect = trigger.getBoundingClientRect();
      const valueRect = value.getBoundingClientRect();
      return {
        text: value.textContent,
        height: controlRect.height,
        valueHeight: valueRect.height,
        centerOffset: Math.abs(
          valueRect.top +
            valueRect.height / 2 -
            (controlRect.top + controlRect.height / 2),
        ),
      };
    }),
  );
  assert.equal(report.filterValueAlignment.length, 3);
  assert.ok(
    report.filterValueAlignment.every((value) => value.centerOffset <= 1),
  );
  report.checks.push(
    '三个真实HeroUI筛选改变URL并重置页1、清选择，已停用存储可筛选；搜索与存储显式清除；20/40/80实际条数、分页和记录返回保留完整查询。',
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
async function verifyInvalidQuery(count) {
  await page.goto(`${config.origin}/trash?status=invalid&page=3`);
  await page.waitForSelector('[data-testid="trash-error"]');
  assert.ok(
    await page.evaluate(() =>
      document
        .querySelector('[data-testid="trash-error"]')
        .textContent.includes('回收查询参数无效，请重置查询'),
    ),
  );
  await screenshot('query-error', 390, 'light');
  await screenshot('query-error', 1440, 'light');
  await page.click(button('重置查询'));
  if (count) await loaded(count);
  else await page.waitForSelector('[data-testid="trash-empty"]');
  report.checks.push('非法查询显示中文恢复提示、保留错误并显式重置');
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
try {
  await page.goto(`${config.origin}/library`);
  await page.waitForFunction(
    () =>
      location.pathname === '/login' ||
      !!document.querySelector('[data-testid="library-list"]'),
  );
  if (new URL(await page.url()).pathname === '/login')
    await signInToLibrary(page, config, report);
  errorScript = await installBrowserErrors(page);
  await seed();
  for (const width of [
    'query-error',
    'confirmation',
    'approved-ui',
    'approved-results',
    'approved-progress',
  ].includes(config.trashPhase)
    ? []
    : config.trashPhase === 'representative'
      ? [1440, 390]
      : [1440, 390, 360, 430, 768])
    for (const mode of width === 1440 || width === 390
      ? ['light', 'dark']
      : ['light']) {
      await resize(width);
      await theme(mode);
      await loaded(config.trashPhase === 'representative' ? 8 : 80);
      const layout = await page.evaluate(() => {
        const shell = document.querySelector('.shell-content');
        const footer = document.querySelector('.shell-footer');
        return {
          width: innerWidth,
          overflow: document.documentElement.scrollWidth > innerWidth,
          mainOverflow: shell.scrollWidth > shell.clientWidth,
          footerBottom: footer?.getBoundingClientRect().bottom,
          searchHeight: document
            .querySelector('input[aria-label="搜索回收图片名称"]')
            ?.getBoundingClientRect().height,
          rows: [
            ...document.querySelectorAll(
              '[data-testid="trash-list"] > li > button',
            ),
          ]
            .slice(0, 3)
            .map((row) => ({
              className: row.className,
              height: row.getBoundingClientRect().height,
              minHeight: getComputedStyle(row).minHeight,
              spacing: getComputedStyle(row).getPropertyValue('--spacing'),
            })),
        };
      });
      assert.equal(layout.overflow, false);
      assert.equal(layout.mainOverflow, false);
      report.layouts.push({ ...layout, theme: mode });
      await screenshot('list', width, mode);
    }
  if (
    ![
      'representative',
      'query-error',
      'confirmation',
      'approved-progress',
    ].includes(config.trashPhase)
  ) {
    if (config.trashPhase !== 'approved-results') {
      report.activeCheck = 'approved-query-controls';
      await verifyApprovedQueries();
      await approvedStateScreenshots('approved-filter-list');
      await resize(390, 480);
      await screenshot('short-list', 390, 'dark', 480);
      await resize(1440);
      await select(0);
      await selected(1);
      await page.click(button('下一页'));
      await loaded(80);
      await selected(1);
      await select(80);
      await selected(2);
      await page.fill('input[aria-label="搜索回收图片名称"]', 'no-match-178');
      await page.keyboard.press('Enter');
      await page.waitForSelector('[data-testid="trash-empty"]');
      await selected(0);
      assert.equal(new URL(await page.url()).searchParams.get('page'), '1');
      await screenshot('filtered-empty', 390, 'light');
      await page.click(button('清除搜索'));
      await loaded(80);
    }
    await resize(1440);
    // A real database registration failure affects one selected item, not the others.
    report.activeCheck = 'approved-per-item-failures';
    await sql(
      "CREATE TRIGGER issue178_cleanup_failure BEFORE INSERT ON media_cleanup_jobs WHEN NEW.image_id = 'issue177-200' BEGIN SELECT RAISE(ABORT,'issue178 registration failed'); END",
    );
    brokenFile = join(fixture.directory, 'issue177-001-original.png');
    brokenBytes = await readFile(brokenFile);
    await rm(brokenFile);
    await mkdir(brokenFile);
    for (let index = 0; index < 20; index++) await select(index);
    await page.click(button('下一页'));
    await loaded(80);
    await page.click(button('下一页'));
    await loaded(41);
    await select(200);
    await installBatchTraffic();
    await action('永久删除所选', 21);
    await verifyConfirmation(21);
    await page.click('[data-testid="trash-batch-submit"]');
    await waitBatch();
    await waitSummary(19, 21);
    await page.waitForFunction(
      () =>
        document.querySelector(
          '[data-testid="trash-batch-table"] [data-image-id="issue177-001"]',
        )?.dataset.state === 'failed',
      undefined,
      { timeout: 15000 },
    );
    const failed = await sql(
      "SELECT image_id,status FROM media_cleanup_jobs WHERE image_id IN ('issue177-000','issue177-001','issue177-200') ORDER BY image_id",
    );
    assert.deepEqual(failed, [
      { image_id: 'issue177-000', status: 'succeeded' },
      { image_id: 'issue177-001', status: 'failed' },
    ]);
    const failedCleanup = JSON.parse(
      (await page.fetch('/api/images/issue177-001/cleanup')).body,
    );
    assert.equal(failedCleanup.remaining.length, 1);
    assert.ok(failedCleanup.remaining[0].error);
    await verifyResultPresentation(21);
    const failedBody = await page.evaluate(
      () =>
        document.querySelector(
          '[data-testid="trash-batch-table"] [data-image-id="issue177-001"] [data-testid="trash-batch-item-details"]',
        ).textContent,
    );
    assert.ok(failedBody.includes(failedCleanup.remaining[0].error));
    assert.ok(failedBody.includes('重试剩余对象'));
    await screenshot('batch-partial', 1440, 'light');
    await resize(390);
    await page.click(item('trash-batch-item-trigger', 'issue177-001', true));
    await page.waitForFunction(
      () =>
        document
          .querySelector(
            '[data-testid="trash-batch-accordion"] [data-testid="trash-batch-item-trigger"][data-image-id="issue177-001"]',
          )
          .getAttribute('aria-expanded') === 'true',
    );
    assert.ok(
      (
        await page.evaluate(
          () =>
            document.querySelector(
              '[data-testid="trash-batch-accordion"] [data-image-id="issue177-001"] [data-testid="trash-batch-item-details"]',
            ).textContent,
        )
      ).includes(failedCleanup.remaining[0].error),
    );
    await screenshot('batch-cleanup-failure-expanded', 390, 'dark');
    await approvedStateScreenshots('approved-cleanup-failure');
    await resize(390);
    await resultPage(2);
    await page.click(item('trash-batch-item-trigger', 'issue177-200', true));
    await page.waitForFunction(
      () =>
        document
          .querySelector(
            '[data-testid="trash-batch-accordion"] [data-testid="trash-batch-item-trigger"][data-image-id="issue177-200"]',
          )
          .getAttribute('aria-expanded') === 'true',
    );
    const rejectionBody = await page.evaluate(
      () =>
        document.querySelector(
          '[data-testid="trash-batch-accordion"] [data-image-id="issue177-200"] [data-testid="trash-batch-item-details"]',
        ).textContent,
    );
    const rejection = await page.evaluate(() =>
      window.__trashResponses[0].results.find(
        (row) => row.id === 'issue177-200',
      ),
    );
    assert.equal(rejection.status, 'failed');
    assert.ok(rejectionBody.includes(rejection.message));
    assert.ok(rejectionBody.includes(rejection.code));
    assert.ok(rejectionBody.includes('重新提交'));
    await screenshot('batch-rejected-expanded', 390, 'light');
    await approvedStateScreenshots('approved-rejected');
    await page.click('[data-testid="trash-batch-done"]');
    await selected(1);
    assert.equal(
      await page.evaluate(() =>
        document
          .querySelector('[aria-label^="操作已选"]')
          ?.getAttribute('aria-label'),
      ),
      '操作已选 1 张图片',
    );
    await sql('DROP TRIGGER issue178_cleanup_failure');
    await page.click(button('查看本次清理结果'));
    await resize(1440);
    await resultPage(2);
    await page.click(item('trash-batch-item-retry', 'issue177-200'));
    await waitBatch();
    await waitSummary(20, 21);
    let partialTraffic = await page.evaluate(() =>
      window.__trashTraffic.filter((entry) => entry.mode === 'apply'),
    );
    assert.deepEqual(partialTraffic.at(-1).ids, ['issue177-200']);
    assert.equal(partialTraffic.at(-1).command.type, 'delete-permanent');
    await rm(brokenFile, { recursive: true });
    await writeFile(brokenFile, brokenBytes);
    brokenFile = null;
    await resultPage(1);
    await page.click(item('trash-batch-item-retry-cleanup', 'issue177-001'));
    await waitBatch();
    await waitSummary(21, 21);
    partialTraffic = await page.evaluate(() =>
      window.__trashTraffic.filter((entry) => entry.mode === 'apply'),
    );
    assert.deepEqual(partialTraffic.at(-1).ids, ['issue177-001']);
    assert.equal(partialTraffic.at(-1).command.type, 'retry-cleanup');
    assert.deepEqual(partialTraffic.at(-1).command.attempts, {
      'issue177-001': {
        taskId: failedCleanup.jobId,
        cycle: failedCleanup.cycle,
      },
    });
    await restoreBatchTraffic();
    report.checks.push(
      '21项真实结果分页：数据库受理失败和Local目录故障在item正文可见；逐项重新提交与剩余对象重试分别只发送该ID，并保留原任务周期基线。',
    );
    await cleanup();
    await seed();
    report.activeCheck = 'approved-unknown-and-unsent';
    await resize(1440);
    await selectAll();
    await installBatchTraffic(true);
    await action('永久删除所选', 201);
    await page.click('[data-testid="trash-batch-submit"]');
    await waitBatch();
    await page.waitForSelector('[data-testid="trash-batch-check"]');
    let traffic = await page.evaluate(() => window.__trashTraffic);
    assert.deepEqual(
      traffic.filter((x) => x.mode === 'apply').map((x) => x.ids.length),
      [200],
    );
    assert.equal(
      (
        await sql(
          "SELECT deletion_status FROM media_images WHERE id='issue177-200'",
        )
      )[0].deletion_status,
      null,
    );
    await screenshot('batch-unknown', 1440, 'light');
    await screenshot('batch-unknown', 390, 'dark');
    await approvedStateScreenshots('approved-unknown');
    await resize(390);
    await page.click(item('trash-batch-item-trigger', 'issue177-000', true));
    await page.waitForSelector(
      item('trash-batch-item-check', 'issue177-000', true),
    );
    await page.click(item('trash-batch-item-check', 'issue177-000', true));
    await waitBatch();
    traffic = await page.evaluate(() => window.__trashTraffic);
    assert.equal(traffic.filter((entry) => entry.mode === 'apply').length, 1);
    assert.deepEqual(traffic.at(-1).ids, ['issue177-000']);
    assert.equal(traffic.at(-1).mode, 'check');
    await resultPage(11);
    await page.click(item('trash-batch-item-trigger', 'issue177-200', true));
    const continueButton = item('trash-batch-item-retry', 'issue177-200', true);
    assert.equal(
      await page.evaluate((selector) => {
        const control = document.querySelector(selector);
        return (
          control.disabled || control.getAttribute('aria-disabled') === 'true'
        );
      }, continueButton),
      true,
    );
    await screenshot('approved-unsent-disabled', 390, 'dark');
    await screenshot('approved-unsent-disabled-short', 430, 'light', 430);
    await approvedStateScreenshots('approved-unsent-disabled');
    await resize(390);
    await page.click('[data-testid="trash-batch-check"]');
    await waitBatch();
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="trash-batch-check"]'),
    );
    traffic = await page.evaluate(() => window.__trashTraffic);
    assert.equal(traffic.filter((x) => x.mode === 'apply').length, 1);
    assert.equal(
      traffic
        .filter((x) => x.mode === 'check')
        .every((x) => x.command.type === 'delete-permanent'),
      true,
    );
    assert.equal(
      (
        await sql(
          "SELECT deletion_status FROM media_images WHERE id='issue177-200'",
        )
      )[0].deletion_status,
      null,
    );
    assert.equal(
      await page.evaluate((selector) => {
        const control = document.querySelector(selector);
        return (
          control.disabled || control.getAttribute('aria-disabled') === 'true'
        );
      }, continueButton),
      false,
    );
    await screenshot('approved-unsent-enabled', 390, 'light');
    await page.click(continueButton);
    await waitBatch();
    await waitSummary(201, 201);
    report.completedTasks = await sql(
      "SELECT status,count(*) AS count FROM media_cleanup_jobs WHERE image_id LIKE 'issue177-%' GROUP BY status",
    );
    assert.deepEqual(report.completedTasks, [
      { status: 'succeeded', count: 201 },
    ]);
    traffic = await page.evaluate(() => window.__trashTraffic);
    assert.deepEqual(
      traffic.filter((x) => x.mode === 'apply').map((x) => x.ids.length),
      [200, 1],
    );
    assert.deepEqual(
      traffic.filter((entry) => entry.mode === 'apply').at(-1).ids,
      ['issue177-200'],
    );
    await restoreBatchTraffic();
    await resultPage(1);
    await approvedStateScreenshots('approved-completed');
    await screenshot('batch-completed', 1440, 'dark');
    await page.click('[data-testid="trash-batch-done"]');
    await page.waitForSelector('[data-testid="trash-empty"]');
    report.checks.push(
      '201项200+1分批；失联停止后续；持久任务只读核对；未发送显式继续；仅全部清理移除',
    );
    if (!['approved-ui', 'approved-results'].includes(config.trashPhase))
      await verifyInvalidQuery(0);
    report.activeCheck = 'approved-filter-consumers';
    await cleanup();
    fixture = await seedLibraryBatch(config, sql);
    await sql(
      "INSERT INTO image_tags (image_id,tag_id) VALUES ('issue177-000','issue177-tag-a')",
    );
    await verifyFilterConsumers();
    if (
      config.trashPhase === undefined ||
      config.trashPhase === 'approved-ui'
    ) {
      await cleanup();
      await seed();
      await verifyApprovedProgress();
    }
  }
  if (config.trashPhase === 'approved-progress') await verifyApprovedProgress();
  if (config.trashPhase === 'query-error') await verifyInvalidQuery(40);
  if (config.trashPhase === 'confirmation') {
    await select(0);
    await action('永久删除所选', 1);
    await verifyConfirmation(1);
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-testid="trash-batch-confirm"]', {
      state: 'hidden',
    });
    await page.waitForFunction(
      () =>
        document.activeElement?.getAttribute('aria-label') ===
        '操作已选 1 张图片',
    );
    assert.deepEqual(
      await sql(
        "SELECT id FROM media_cleanup_jobs WHERE image_id LIKE 'issue177-%'",
      ),
      [],
    );
    report.checks.push(
      '批量确认明确显示真实选择数及不清空筛选结果，Escape取消未受理任何任务',
    );
  }
  report.errors = await assertNoBrowserErrors(page);
  report.status = 'passed';
} catch (error) {
  report.error = error.stack ?? String(error);
  report.failureTasks = await sql(
    "SELECT image_id,status,cycle,error FROM media_cleanup_jobs WHERE image_id LIKE 'issue177-%'",
  );
  report.failureView = await page.snapshot({ scope: 'full_page' });
  await page.screenshot({
    path: join(config.output, 'trash-query-batch-failure.png'),
  });
  throw error;
} finally {
  await restoreBatchTraffic();
  if (fixture) await cleanup();
  if (errorScript)
    await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
      identifier: errorScript,
    });
  await writeFile(
    join(config.output, 'trash-query-batch.json'),
    JSON.stringify(report, null, 2),
  );
}
