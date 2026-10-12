import assert from 'node:assert/strict';
import { disabledStorageId } from './trash-query-helpers.mjs';
import { verifySearchToolbarLayouts } from './search-toolbar-layout.mjs';

export async function verifyQueryLayouts(
  context,
  widths = [1440, 390, 360, 430, 768],
  count = 80,
) {
  const { page, report, resize, theme, loaded, screenshot } = context;
  await page.click('loc=role:button[name="回收站规则"]');
  await page.waitForSelector('[role="dialog"][aria-label="回收站规则"]');
  assert.match(
    await page.evaluate(
      () =>
        document.querySelector('[role="dialog"][aria-label="回收站规则"]')
          .textContent,
    ),
    /仍占用存储空间，不会自动清理/,
  );
  await page.keyboard.press('Escape');
  await page.waitForSelector('[role="dialog"][aria-label="回收站规则"]', {
    state: 'hidden',
  });
  await page.waitForFunction(
    () => document.activeElement?.getAttribute('aria-label') === '回收站规则',
  );
  for (const width of widths)
    for (const mode of width === 1440 || width === 390
      ? ['light', 'dark']
      : ['light']) {
      await resize(width);
      await theme(mode);
      await loaded(count);
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
          searchIcon: (() => {
            const icon = document.querySelector(
              '[data-slot="search-field-search-icon"]',
            );
            const input = document.querySelector(
              'input[aria-label="搜索回收图片名称"]',
            );
            const bounds = icon?.getBoundingClientRect();
            return {
              visible:
                !!bounds &&
                bounds.width > 0 &&
                bounds.height > 0 &&
                getComputedStyle(icon).visibility !== 'hidden' &&
                icon.classList.contains('lucide-search'),
              right: bounds?.right,
              textStart: input
                ? input.getBoundingClientRect().left +
                  Number.parseFloat(getComputedStyle(input).paddingLeft)
                : undefined,
            };
          })(),
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
      assert.equal(
        layout.searchIcon.visible,
        true,
        'Trash search renders the visible Lucide search icon',
      );
      assert.ok(
        layout.searchIcon.right + 8 <= layout.searchIcon.textStart + 1,
        'Trash search keeps at least 8px between the icon and text, within 1px rounding tolerance',
      );
      report.layouts.push({ ...layout, theme: mode });
      await screenshot('list', width, mode);
      if (width === 1440) {
        const selector =
          '[data-testid="trash-list"] > li > button[data-trash-open] >> nth=0';
        const readRow = () =>
          page.evaluate(() => {
            const row = document.querySelector('[data-trash-open]');
            const style = getComputedStyle(row);
            return {
              bounds: row.getBoundingClientRect().toJSON(),
              background: style.backgroundColor,
              transform: style.transform,
              hover: style.getPropertyValue('--button-bg-hover').trim(),
              default: style.getPropertyValue('--default').trim(),
            };
          });
        await page.mouse.move(10, 10);
        const normal = await readRow();
        await page.hover(selector);
        await page.waitForFunction(
          () =>
            getComputedStyle(document.querySelector('[data-trash-open]'))
              .backgroundColor !== 'rgba(0, 0, 0, 0)',
        );
        const hovered = await readRow();
        assert.deepEqual(
          hovered.bounds,
          normal.bounds,
          'Hover cannot resize or move a trash record',
        );
        assert.notEqual(
          hovered.hover,
          hovered.default,
          'Record hover uses a local neutral token, not the global default',
        );
        assert.match(hovered.hover, /5%/);
        await screenshot('row-hover', width, mode);
        await page.focus(selector);
        await page.keyboard.press('Tab');
        await page.keyboard.press('Shift+Tab');
        const focused = await page.evaluate(() => {
          const row = document.querySelector('[data-trash-open]');
          return {
            active: document.activeElement === row,
            visible: row.getAttribute('data-focus-visible'),
            shadow: getComputedStyle(row).boxShadow,
          };
        });
        assert.equal(focused.active, true);
        assert.equal(focused.visible, 'true');
        assert.notEqual(focused.shadow, 'none');
        report.layouts.push({
          state: 'row-hover-focus',
          theme: mode,
          normal,
          hovered,
          focused,
        });
      }
    }
}
export async function verifyRepresentativeQuery(context) {
  const {
    sql,
    page,
    config,
    loaded,
    report,
    select,
    selected,
    resize,
    theme,
    screenshot,
  } = context;
  // Leave lazy trash previews before restoring their fixture records.
  await page.goto('about:blank');
  report.fixtureTransitions.push({
    scenario: 'representative-query',
    event: 'restore-started-after-leaving-page',
    at: Date.now(),
  });
  await sql(
    "UPDATE media_images SET trashed_at=NULL WHERE id LIKE 'issue177-%' AND id > 'issue177-007'",
  );
  report.fixtureTransitions.push({
    scenario: 'representative-query',
    event: 'restore-completed',
    at: Date.now(),
  });
  await page.goto(`${config.origin}/trash?pageSize=40&page=1`);
  await loaded(8);
  report.layouts.push(
    ...(await verifySearchToolbarLayouts(page, {
      output: config.output,
      name: 'trash-toolbar-idle',
    })),
  );
  await verifyQueryLayouts(context, [1440, 390], 8);
  await select(0);
  await selected(1);
  report.layouts.push(
    ...(await verifySearchToolbarLayouts(page, {
      output: config.output,
      name: 'trash-toolbar-selected',
      selected: true,
    })),
  );
  for (const width of [390, 1440]) {
    await resize(width);
    for (const mode of ['light', 'dark']) {
      await theme(mode);
      const selectedRow = await page.evaluate(() => {
        const row = document.querySelector(
          '[data-trash-image-id="issue177-000"]',
        );
        return {
          selected: row.dataset.selected,
          shadow: getComputedStyle(row).boxShadow,
        };
      });
      assert.equal(selectedRow.selected, 'true');
      assert.notEqual(
        selectedRow.shadow,
        'none',
        'Selection has a persistent outline distinct from neutral hover',
      );
      await screenshot('row-selected', width, mode);
      report.layouts.push({
        state: 'row-selected',
        width,
        theme: mode,
        ...selectedRow,
      });
    }
  }
  await select(0);
  await selected(0);
}
export async function verifyEmptyInvalidQuery(context) {
  const { page, sql, report } = context;
  // Restoring fixtures must not invalidate previews still used by this page.
  await page.goto('about:blank');
  report.fixtureTransitions.push({
    scenario: 'empty-invalid-query',
    event: 'restore-started-after-leaving-page',
    at: Date.now(),
  });
  await sql(
    "UPDATE media_images SET trashed_at=NULL WHERE id LIKE 'issue177-%'",
  );
  report.fixtureTransitions.push({
    scenario: 'empty-invalid-query',
    event: 'restore-completed',
    at: Date.now(),
  });
  await verifyInvalidQuery(context, 0);
}
export async function verifyDefaultInvalidQuery(context) {
  await verifyInvalidQuery(context, 40);
}
export async function verifyApprovedQueries(context) {
  const {
    page,
    sql,
    config,
    fixture,
    report,
    loaded,
    select,
    selected,
    button,
    screenshot,
    resize,
    approvedStateScreenshots,
  } = context;
  report.activeCheck = 'approved-query-controls';
  await sql(
    `INSERT INTO storage_configs (id,name,type,enabled,local_path,created_at,updated_at) VALUES ('${disabledStorageId}','Issue 178 已停用筛选存储','local',0,'issue178-filter',1810000000000,1810000000000)`,
  );
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
async function verifyInvalidQuery(
  { page, config, report, screenshot, button, loaded },
  count,
) {
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
export async function verifyCancelledConfirmation(context) {
  const { page, sql, report, select, action, verifyConfirmation } = context;
  await select(0);
  await action('永久删除所选', 1);
  await verifyConfirmation(1);
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-testid="trash-batch-confirm"]', {
    state: 'hidden',
  });
  await page.waitForFunction(
    () => document.activeElement?.getAttribute('aria-label') === '永久删除所选',
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
