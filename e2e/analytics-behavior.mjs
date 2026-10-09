import assert from 'node:assert/strict';
import { analyticsBoundary, number } from './analytics-helpers.mjs';
import { resizeViewport } from './browser-geometry.mjs';

const periodControl = (days) =>
  `loc=css:[role="radiogroup"][aria-label="统计周期"] button[role="radio"] >> nth=${[7, 30, 90].indexOf(days)}`;

async function period(page, days) {
  await page.focus(periodControl(days));
  await page.keyboard.press('Space');
  await page.waitForFunction(
    (days) =>
      new URLSearchParams(location.search).get('days') === String(days) &&
      !!document.querySelector('[data-testid="analytics-overview"]'),
    days,
  );
}

async function pointerPeriod(page, days) {
  const selector = `[role="radiogroup"][aria-label="统计周期"] button[role="radio"]:nth-child(${[7, 30, 90].indexOf(days) + 1})`;
  await page.hover(selector);
  await page.waitForFunction((selector) => {
    const button = document.querySelector(selector);
    const rect = button.getBoundingClientRect();
    return (
      document.elementFromPoint(
        rect.x + rect.width / 2,
        rect.y + rect.height / 2,
      ) === button
    );
  }, selector);
  const center = await page.evaluate((selector) => {
    const rect = document.querySelector(selector).getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }, selector);
  await page.mouse.click(center.x, center.y, { label: `选择 ${days} 天统计` });
}

async function assertPeriodLayout(page, width) {
  const layout = await page.evaluate(() => {
    const group = document.querySelector('[aria-label="统计周期"]');
    const main = document.querySelector('[data-testid="analytics-metrics"]');
    const rect = (node) => {
      const value = node.getBoundingClientRect();
      return { left: value.left, width: value.width };
    };
    return {
      main: rect(main),
      group: rect(group),
      controls: [...group.querySelectorAll('button')].map(rect),
    };
  });
  assert.ok(Math.abs(layout.group.left - layout.main.left) <= 1);
  assert.ok(Math.abs(layout.controls[0].left - layout.main.left) <= 1);
  for (const [index, control] of layout.controls.entries()) {
    assert.ok(
      Math.abs(
        control.width - (width >= 1200 ? 104 : (layout.group.width - 24) / 3),
      ) <= 1,
      'Desktop periods remain 104px and mobile periods share available space',
    );
    if (index)
      assert.ok(
        Math.abs(
          control.left -
            layout.controls[index - 1].left -
            layout.controls[index - 1].width -
            12,
        ) <= 1,
        'Period controls retain 12px gaps',
      );
  }
}

async function assertScopeLayout(page, width) {
  const layout = await page.evaluate(() => {
    const dialog = document.querySelector(
      '[data-testid="analytics-scope-dialog"]',
    );
    const rect = dialog.getBoundingClientRect();
    const footer = dialog
      .querySelector('[data-slot="modal-footer"]')
      .getBoundingClientRect();
    return {
      width: rect.width,
      left: rect.left,
      top: rect.top,
      bottom: rect.bottom,
      footerBottom: footer.bottom,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
    };
  });
  assert.ok(
    Math.abs(layout.width - (width >= 1200 ? 480 : width - 32)) <= 1,
    'Explanation matches the 480px desktop and 16px mobile margins',
  );
  assert.ok(
    Math.abs(layout.left - (layout.viewportWidth - layout.width) / 2) <= 1,
  );
  assert.ok(layout.top >= 15 && layout.bottom <= layout.viewportHeight - 15);
  assert.ok(
    layout.footerBottom <= layout.viewportHeight - 15,
    'Primary return action remains visible in short viewports',
  );
}

export async function analyticsRepresentative(
  page,
  config,
  tools,
  fixture,
  report,
) {
  for (const path of ['/analytics?days=7', '/dashboard?days=7']) {
    await tools.open(path);
    for (const theme of ['light', 'dark']) {
      for (const width of path.startsWith('/dashboard')
        ? [390, 1440]
        : [360, 390, 430, 768, 1440]) {
        await tools.evidence(
          path.startsWith('/dashboard') ? 'dashboard' : 'overview',
          width,
          theme,
        );
        await assertPeriodLayout(page, width);
      }
    }
  }
  await tools.open('/analytics?days=7');
  for (const width of [390, 1440]) {
    await resizeViewport(page, width);
    for (const section of ['trend', 'versions', 'popular', 'usage-summary']) {
      await page.hover(`[data-testid="analytics-${section}"] h2`);
      const delta = await page.evaluate(
        (section) =>
          document
            .querySelector(`[data-testid="analytics-${section}"] h2`)
            .getBoundingClientRect().top - 100,
        section,
      );
      await page.mouse.move(width / 2, 300);
      await page.mouse.wheel(0, delta, { label: '对齐统计业务区域' });
      await page.waitForFunction((section) => {
        const top = document
          .querySelector(`[data-testid="analytics-${section}"] h2`)
          .getBoundingClientRect().top;
        const main = document.querySelector('.shell-content');
        return (
          top >= 70 &&
          (top <= 130 ||
            main.scrollTop + main.clientHeight >= main.scrollHeight - 1)
        );
      }, section);
      await tools.evidence(`section-${section}`, width, 'light');
    }
  }
  for (const width of [390, 1440])
    await tools.evidence('overview-short', width, 'dark', 400);
  await tools.open('/analytics?days=30&view=daily');
  for (const width of [390, 1440]) {
    await tools.evidence('daily-30', width, 'light');
    await page.hover('[data-testid="analytics-daily"] tbody tr:last-child');
    await page.mouse.move(width / 2, 300);
    await page.mouse.wheel(0, 500, { label: '查看今日数值与合计' });
    await page.waitForFunction(() => {
      const row = document
        .querySelector('[data-testid="analytics-daily"] tbody tr:last-child')
        .getBoundingClientRect();
      return row.bottom <= innerHeight - 80 && row.top >= 60;
    });
    await tools.evidence('daily-30-today-total', width, 'light');
  }
  await tools.open('/analytics?days=7&view=usage');
  await page.waitForSelector('[data-testid="analytics-usage"]');
  for (const theme of ['light', 'dark'])
    for (const width of [390, 1440])
      await tools.evidence('usage-known-unknown-disabled', width, theme);
  for (const [view, source, label] of [
    ['overview', '统计口径', '访问统计如何计算'],
    ['usage', '占用说明', '存储占用如何计算'],
  ]) {
    await tools.open(
      `/analytics?days=7${view === 'usage' ? '&view=usage' : ''}`,
    );
    await resizeViewport(page, 390);
    await page.click(`loc=role:link[name="${source}"]`);
    await page.waitForSelector(`[role="dialog"][aria-label="${label}"]`);
    await tools.evidence(`${view}-scope`, 390, 'light');
    await assertScopeLayout(page, 390);
    await tools.evidence(`${view}-scope`, 1440, 'light');
    await assertScopeLayout(page, 1440);
    await resizeViewport(page, 390, 400);
    await page.hover(
      '[data-testid="analytics-scope-dialog"] [data-slot="modal-body"]',
    );
    const bodyCenter = await page.evaluate(() => {
      const rect = document
        .querySelector(
          '[data-testid="analytics-scope-dialog"] [data-slot="modal-body"]',
        )
        .getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    await page.mouse.move(bodyCenter.x, bodyCenter.y);
    await page.mouse.wheel(0, 800, { label: '查看统计说明末尾' });
    await page.waitForFunction(() => {
      const body = document.querySelector(
        '[data-testid="analytics-scope-dialog"] [data-slot="modal-body"]',
      );
      return body.scrollTop + body.clientHeight >= body.scrollHeight - 1;
    });
    await tools.evidence(`${view}-scope-short-bottom`, 390, 'light', 400);
    await assertScopeLayout(page, 390);
    await page.keyboard.press('Escape');
    await page.waitForSelector(`[role="dialog"][aria-label="${label}"]`, {
      state: 'hidden',
    });
  }
  report.checks.push(
    'Actual seeded overview/dashboard/daily/usage at 360/390/430/768/1440, both themes, 390/1440×400, no document/main overflow and shared usable click-target minimums. Desktop periods align left at 104px/12px and mobile periods share width. Explanations match 480px desktop/358px phone with short-viewport body scrolling and visible return actions.',
  );
}

export async function analyticsBehavior(page, config, tools, fixture, report) {
  await tools.open();
  const observations = [];
  const fixed = await tools.request('/api/analytics/overview?days=7');
  const usageBefore = await tools.request('/api/analytics/usage');
  for (const days of [7, 30, 90]) {
    if (days === 7) await period(page, days);
    else {
      await pointerPeriod(page, days);
      await page.waitForFunction(
        (days) =>
          new URLSearchParams(location.search).get('days') === String(days) &&
          !!document.querySelector('[data-testid="analytics-overview"]'),
        days,
      );
    }
    const actual = await tools.request(`/api/analytics/overview?days=${days}`);
    const [persisted] = await tools.sql(
      `SELECT coalesce(sum(count),0) total FROM analytics_daily WHERE date BETWEEN '${actual.range.startDate}' AND '${actual.range.endDate}'`,
    );
    assert.equal(actual.versions.total, persisted.total);
    const rendered = await page.evaluate(() => ({
      metrics: [
        ...document.querySelector('[data-testid="analytics-metrics"]').children,
      ].map((card) => card.querySelectorAll('p')[1].textContent.trim()),
      versionTitle: document
        .querySelector('[data-testid="analytics-versions"] h2')
        .textContent.trim(),
      versions: [
        ...document.querySelectorAll('[data-testid="analytics-versions"] dd'),
      ].map((node) => node.textContent.trim()),
      popularTitle: document
        .querySelector('[data-testid="analytics-popular"] h2')
        .textContent.trim(),
      popular: [
        ...document.querySelectorAll('[data-testid="analytics-popular"] li'),
      ].map((node) => ({
        id: node.dataset.imageId,
        state: node.dataset.imageState,
        text: node.textContent,
        href: node.querySelector('a')?.getAttribute('href') ?? null,
        image: node.querySelector('img')?.getAttribute('src') ?? null,
      })),
    }));
    assert.deepEqual(
      rendered.metrics,
      [
        actual.counts.normalImages,
        actual.counts.albums,
        fixed.today,
        fixed.cumulative.total,
      ].map(number),
    );
    assert.ok(rendered.versionTitle.includes(`${days} 天`));
    assert.ok(rendered.popularTitle.includes(`${days} 天`));
    assert.deepEqual(
      rendered.versions,
      [
        actual.versions.original,
        actual.versions.compressed,
        actual.versions.watermark,
      ].map((value) => `${number(value)} 次`),
    );
    assert.deepEqual(
      rendered.popular.map(({ id }) => id),
      actual.popular.map(({ imageId }) => imageId),
    );
    assert.equal(rendered.popular.length, 10);
    const removed = rendered.popular.find(({ id }) => id === fixture.ids[2]);
    assert.ok(removed.text.includes('已删除图片'));
    assert.equal(removed.href, null);
    assert.equal(removed.image, null);
    const recycled = rendered.popular.find(({ id }) => id === fixture.ids[1]);
    assert.equal(recycled.href, `/trash?image=${fixture.ids[1]}`);
    assert.equal(recycled.image, null);
    const disabled = rendered.popular.find(({ id }) => id === fixture.ids[3]);
    assert.equal(disabled.image, null);
    assert.ok(
      rendered.popular
        .find(({ id }) => id === fixture.ids[0])
        .text.includes('摄影素材与公开访问历史'.repeat(12)),
    );
    await page.focus('loc=role:link[name="查看每日数值"]');
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-testid="analytics-daily"]');
    const daily = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '[data-testid="analytics-daily"] tbody tr',
        ),
      ].map((row) => ({
        date: row.dataset.date,
        count: Number(
          row.querySelectorAll('td,th')[1].textContent.replaceAll(',', ''),
        ),
      })),
    );
    assert.deepEqual(
      daily,
      actual.trend.map(({ date, count }) => ({ date, count })),
    );
    assert.equal(
      daily.reduce((sum, row) => sum + row.count, 0),
      actual.versions.total,
    );
    observations.push({
      days,
      range: actual.range,
      total: persisted.total,
      popular: rendered.popular,
      daily,
    });
    await tools.open(`/analytics?days=${days}`);
  }
  const usageAfter = await tools.request('/api/analytics/usage');
  assert.deepEqual(
    usageAfter.storages,
    usageBefore.storages,
    'Current object usage is independent of access period',
  );
  report.reconciledPeriods = observations;

  await page.click('loc=role:link[name="当前存储占用"]');
  await page.waitForSelector('[data-testid="analytics-usage"]');
  const storage = await page.evaluate((id) => {
    const node = document.querySelector(`[data-storage-id="${id}"]`);
    return {
      text: node.textContent,
      completeBar: !!node.querySelector('[data-testid="usage-composition"]'),
      groups: [...node.querySelectorAll('dt')].map((item) => item.textContent),
    };
  }, fixture.storages[0].id);
  assert.equal(
    storage.completeBar,
    false,
    'Unknown objects prevent a misleading complete composition bar',
  );
  assert.ok(storage.text.includes('待核对'));
  assert.deepEqual(storage.groups, [
    '正常原图',
    '正常派生',
    '回收站',
    '处理中／待清理',
  ]);
  const disabled = usageAfter.storages.find(
    ({ id }) => id === fixture.storages[1].id,
  );
  assert.equal(disabled.enabled, false);
  assert.ok(disabled.knownBytes > 0);
  assert.ok(
    await page.evaluate(() =>
      document
        .querySelector('[data-testid="analytics-usage"]')
        .textContent.includes('已停用'),
    ),
  );
  report.checks.push(
    '7/30/90 URL, trend/versions/popular and keyboard-accessible complete daily rows agree with actual SQLite. Today/cumulative/current usage stay fixed. Top ten preserve full names and deleted/recycled/disabled-content boundaries. Four disjoint usage groups and unknown objects never imply a complete total.',
  );

  await tools.open('/analytics?days=7');
  const boundary = await analyticsBoundary(page, {
    path: '/api/analytics/overview',
    hold: true,
    days: 30,
  });
  try {
    await page.focus(periodControl(30));
    await page.keyboard.press('Space');
    await page.waitForFunction(() =>
      window.__analytics179.requests.some(
        (request) => request.days === '30' && request.held,
      ),
    );
    assert.equal(
      await page.evaluate(
        () => !!document.querySelector('[data-testid="analytics-overview"]'),
      ),
      false,
      'Loading a different period does not relabel old numbers',
    );
    await page.focus(periodControl(90));
    await page.keyboard.press('Space');
    await page.waitForFunction(() =>
      document
        .querySelector('[data-testid="analytics-versions"] h2')
        ?.textContent.includes('90 天'),
    );
    assert.ok(
      (await boundary.read()).find(({ days }) => days === '30').aborted,
    );
    await boundary.release();
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="overview-refreshing"]'),
    );
    assert.ok(
      await page.evaluate(() =>
        document
          .querySelector('[data-testid="analytics-versions"] h2')
          .textContent.includes('90 天'),
      ),
    );
    report.periodRace = await boundary.read();
  } finally {
    await boundary.dispose();
  }

  await tools.open();
  await resizeViewport(page, 1440);
  const chart = '[data-testid="analytics-chart"] [role="application"]';
  await page.waitForSelector(chart);
  await page.focus(chart);
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(
    () =>
      !!document.querySelector(
        '[data-testid="analytics-chart"] [role="status"]',
      ),
  );
  const chartText = await page.evaluate(
    () =>
      document.querySelector('[data-testid="analytics-chart"] [role="status"]')
        .textContent,
  );
  assert.match(chartText, /\d{4}-\d{2}-\d{2}.*次/);
  await tools.evidence('keyboard-chart-value', 1440, 'dark');
  report.checks.push(
    'Delayed 30-day response is aborted and cannot replace the latest 90-day report. Recharts arrow-key value includes exact date/count, with a complete equivalent daily table.',
  );

  for (const [view, source, label, explanation] of [
    ['overview', '统计口径', '访问统计如何计算', '每日明细保留 365'],
    ['usage', '占用说明', '存储占用如何计算', '四类对象互斥计数'],
  ]) {
    for (const width of [390, 1440]) {
      await tools.open(
        `/analytics?days=30${view === 'usage' ? '&view=usage' : ''}`,
      );
      await resizeViewport(page, width, 400);
      const trigger = `loc=role:link[name="${source}"]`;
      await page.focus(trigger);
      const before = await page.evaluate(
        () => document.querySelector('.shell-content').scrollTop,
      );
      await page.keyboard.press('Enter');
      const dialog = `[role="dialog"][aria-label="${label}"]`;
      await page.waitForSelector(dialog);
      assert.ok(
        await page.evaluate(
          ({ dialog, explanation }) =>
            document.querySelector(dialog).textContent.includes(explanation),
          { dialog, explanation },
        ),
      );
      for (let index = 0; index < 4; index++) {
        await page.keyboard.press('Tab');
        assert.ok(
          await page.evaluate(
            (dialog) =>
              document.querySelector(dialog).contains(document.activeElement),
            dialog,
          ),
          'Explanation modal contains keyboard focus',
        );
      }
      await tools.evidence(`${view}-scope-short`, width, 'dark', 400);
      await page.keyboard.press('Escape');
      await page.waitForSelector(dialog, { state: 'hidden' });
      await page.waitForFunction(
        (source) => document.activeElement?.textContent.trim() === source,
        source,
      );
      assert.equal(
        await page.evaluate(
          () => document.querySelector('.shell-content').scrollTop,
        ),
        before,
      );
    }
  }
  report.checks.push(
    'Approved access/storage explanations stay usable in short desktop and phone viewports, trap keyboard focus, and Escape restores their source focus and content scroll.',
  );
}
