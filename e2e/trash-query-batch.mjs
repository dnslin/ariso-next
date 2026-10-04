/* global taskSpace, config */
const assert = (await import('node:assert/strict')).default;
const { writeFile } = await import('node:fs/promises');
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
}
async function screenshot(state, width, mode, height) {
  await resize(width, height);
  await theme(mode);
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
  await sql("DELETE FROM media_cleanup_jobs WHERE image_id LIKE 'issue177-%'");
  await cleanLibraryBatch(sql, fixture);
  fixture = null;
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
  for (const width of ['query-error', 'confirmation'].includes(
    config.trashPhase,
  )
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
    !['representative', 'query-error', 'confirmation'].includes(
      config.trashPhase,
    )
  ) {
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
    await resize(1440);
    // A real database registration failure affects one selected item, not the others.
    await sql(
      "CREATE TRIGGER issue178_cleanup_failure BEFORE INSERT ON media_cleanup_jobs WHEN NEW.image_id = 'issue177-200' BEGIN SELECT RAISE(ABORT,'issue178 registration failed'); END",
    );
    await select(0);
    await page.click(button('下一页'));
    await loaded(80);
    await page.click(button('下一页'));
    await loaded(41);
    await select(200);
    await action('永久删除所选', 2);
    await verifyConfirmation(2);
    await page.click('[data-testid="trash-batch-submit"]');
    await waitBatch();
    await page.waitForFunction(() =>
      document
        .querySelector('[data-testid="trash-batch-summary"]')
        ?.textContent.includes('1张已清理完成'),
    );
    const failed = await sql(
      "SELECT image_id,status FROM media_cleanup_jobs WHERE image_id IN ('issue177-000','issue177-200')",
    );
    assert.deepEqual(failed, [
      { image_id: 'issue177-000', status: 'succeeded' },
    ]);
    await screenshot('batch-partial', 1440, 'light');
    await screenshot('batch-partial', 390, 'dark');
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
    await page.click(button('查看本次结果'));
    await page.click('[data-testid="trash-batch-retry"]');
    await waitBatch();
    await page.waitForFunction(() =>
      document
        .querySelector('[data-testid="trash-batch-summary"]')
        ?.textContent.includes('2张已清理完成'),
    );
    report.checks.push(
      '跨页选择保留、查询改变清空、逐项受理失败保留和显式重试',
    );
    await cleanup();
    await seed();
    await resize(1440);
    await selectAll();
    await page.evaluate(() => {
      const original = window.fetch;
      window.__trashOriginalFetch = original;
      window.__trashTraffic = [];
      let lose = true;
      window.fetch = async (...args) => {
        const url = new URL(String(args[0]), location.href);
        if (url.pathname != '/api/images/batch') return original(...args);
        const body = JSON.parse(args[1].body);
        window.__trashTraffic.push(body);
        const response = await original(...args);
        if (body.mode === 'apply' && lose) {
          lose = false;
          throw new TypeError('Issue178: real accepted response lost');
        }
        return response;
      };
    });
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
    await page.click('[data-testid="trash-batch-retry"]');
    await waitBatch();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="trash-batch-summary"]')
          ?.textContent.includes('201张已清理完成'),
      undefined,
      // Production maintenance cleans at most 20 images per one-second round.
      // 201 real tasks therefore require more than Ego's default ten seconds.
      { timeout: 30000 },
    );
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
    await screenshot('batch-completed', 1440, 'dark');
    await page.click('[data-testid="trash-batch-done"]');
    await page.waitForSelector('[data-testid="trash-empty"]');
    report.checks.push(
      '201项200+1分批；失联停止后续；持久任务只读核对；未发送显式继续；仅全部清理移除',
    );
    await verifyInvalidQuery(0);
  }
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
