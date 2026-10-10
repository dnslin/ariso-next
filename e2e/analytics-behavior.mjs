import assert from 'node:assert/strict';
import { analyticsBoundary, number } from './analytics-helpers.mjs';
import { resizeViewport } from './browser-geometry.mjs';

const periodControl = (days) =>
  `loc=css:[role="radiogroup"][aria-label="统计周期"] button[role="radio"] >> nth=${[7, 30, 90].indexOf(days)}`;

async function period(page, days, report) {
  report.behaviorStep = `period-${days}-focus`;
  await page.focus(periodControl(days));
  report.behaviorStep = `period-${days}-keyboard-space`;
  await page.keyboard.press('Space');
  report.behaviorStep = `period-${days}-result`;
  await page.waitForFunction(
    (days) =>
      new URLSearchParams(location.search).get('days') === String(days) &&
      !!document.querySelector('[data-testid="analytics-overview"]'),
    days,
  );
}

async function pointerPeriod(page, days, report) {
  const selector = `[role="radiogroup"][aria-label="统计周期"] button[role="radio"]:nth-child(${[7, 30, 90].indexOf(days) + 1})`;
  report.behaviorStep = `period-${days}-hover`;
  await page.hover(selector);
  report.behaviorStep = `period-${days}-hit-test`;
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
  report.behaviorStep = `period-${days}-pointer-click`;
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

async function refreshDuringPointerPress(page, tools, report) {
  for (const width of [360, 390, 1440]) {
    report.behaviorStep = `refresh-during-pointer-${width}`;
    await tools.open();
    await resizeViewport(page, width);
    await tools.evidence('refresh-normal', width, 'light');
    const boundary = await analyticsBoundary(page, {
      path: '/api/analytics/overview',
      hold: true,
      days: 7,
    });
    const selector =
      '[aria-label="统计周期"] button[role="radio"]:nth-child(2)';
    let pressed = false;
    try {
      await page.hover(selector);
      const before = await page.evaluate((selector) => {
        const rect = document.querySelector(selector).getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      }, selector);
      await page.mouse.move(
        before.x + before.width / 2,
        before.y + before.height / 2,
      );
      await page.mouse.down({ button: 'left', clickCount: 1 });
      pressed = true;
      // Explicitly trigger the real production refresh while the native press
      // is in progress; only the overview response delivery is held.
      await page.evaluate(() =>
        document.querySelector('button[aria-label="刷新访问统计"]').click(),
      );
      await page.waitForFunction(
        () =>
          window.__analytics179.requests.some(({ held }) => held) &&
          !!document.querySelector('[data-testid="overview-refreshing"]'),
      );
      const during = await page.evaluate((selector) => {
        const button = document.querySelector(selector).getBoundingClientRect();
        const status = document.querySelector(
          '[data-testid="overview-refreshing"]',
        );
        const rect = status.getBoundingClientRect();
        const metadata = status.parentElement.getBoundingClientRect();
        const metrics = document
          .querySelector('[data-testid="analytics-metrics"]')
          .getBoundingClientRect();
        return {
          button: {
            x: button.x,
            y: button.y,
            width: button.width,
            height: button.height,
          },
          status: { top: rect.top, bottom: rect.bottom, height: rect.height },
          metadataBottom: metadata.bottom,
          metricsTop: metrics.top,
          lastFlushedVisible: !!document.querySelector(
            '[data-testid="analytics-last-flushed"]',
          ),
        };
      }, selector);
      assert.deepEqual(
        during.button,
        before,
        'Refresh feedback cannot move a period button during a native press',
      );
      assert.equal(
        during.status.height,
        16,
        'Refresh feedback stays on one line on desktop and phone',
      );
      assert.ok(during.status.top >= during.metadataBottom);
      assert.ok(
        during.status.bottom <= during.metricsTop,
        'Refresh feedback does not overlap current metrics',
      );
      assert.equal(during.lastFlushedVisible, true);
      await tools.evidence('refresh-inflight', width, 'light');
      await page.mouse.up({ button: 'left', clickCount: 1 });
      pressed = false;
      await page.waitForFunction(
        () =>
          new URLSearchParams(location.search).get('days') === '30' &&
          document
            .querySelector('[data-testid="analytics-versions"] h2')
            ?.textContent.includes('30 天'),
      );
      assert.equal(
        await page.evaluate(
          (selector) =>
            document.querySelector(selector).getAttribute('aria-checked'),
          selector,
        ),
        'true',
      );
      assert.equal(
        await page.evaluate(
          () =>
            !!document.querySelector('[aria-label="统计周期"] [data-pressed]'),
        ),
        false,
      );
      const actual = await tools.request('/api/analytics/overview?days=30');
      const rendered = await page.evaluate(() =>
        [
          ...document.querySelectorAll('[data-testid="analytics-versions"] dd'),
        ].map((node) => node.textContent.trim()),
      );
      assert.deepEqual(
        rendered,
        [
          actual.versions.original,
          actual.versions.compressed,
          actual.versions.watermark,
        ].map((value) => `${number(value)} 次`),
      );
      (report.refreshPointer ??= []).push({
        width,
        before,
        during,
        requests: await boundary.read(),
      });
    } finally {
      try {
        if (pressed) await page.mouse.up({ button: 'left', clickCount: 1 });
      } finally {
        await boundary.dispose();
      }
    }
  }
  report.checks.push(
    'A delayed real refresh between native pointerdown/up preserves period geometry at 360/390/1440, leaves last-flush metadata visible, fits feedback on one line without metrics overlap, and the same pointer release selects and loads the actual 30-day report.',
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
  await refreshDuringPointerPress(page, tools, report);
  report.behaviorStep = 'initial-overview';
  await tools.open();
  const observations = [];
  const fixed = await tools.request('/api/analytics/overview?days=7');
  const usageBefore = await tools.request('/api/analytics/usage');
  const [history] = await tools.sql(
    `SELECT sum(original_count+compressed_count+watermark_count) total,
      sum(CASE WHEN image_id='${fixture.ids[2]}' THEN original_count+compressed_count+watermark_count ELSE 0 END) deleted_total
      FROM analytics_image_totals`,
  );
  assert.ok(history.deleted_total > 0);
  assert.equal(
    fixed.cumulative.total,
    history.total,
    'Cumulative accesses retain permanently deleted image history',
  );
  for (const days of [7, 30, 90]) {
    if (days === 7) await period(page, days, report);
    else {
      await pointerPeriod(page, days, report);
      report.behaviorStep = `period-${days}-result`;
      await page.waitForFunction(
        (days) =>
          new URLSearchParams(location.search).get('days') === String(days) &&
          !!document.querySelector('[data-testid="analytics-overview"]'),
        days,
      );
      assert.equal(
        await page.evaluate(
          (days) =>
            [...document.querySelectorAll('[aria-label="统计周期"] button')]
              .find((button) => button.textContent.trim() === `${days} 天`)
              .getAttribute('aria-checked'),
          days,
        ),
        'true',
      );
      assert.equal(
        await page.evaluate(
          () =>
            !!document.querySelector('[aria-label="统计周期"] [data-pressed]'),
        ),
        false,
        'Native pointer operation leaves no period button pressed',
      );
    }
    report.behaviorStep = `period-${days}-reconciliation`;
    const actual = await tools.request(`/api/analytics/overview?days=${days}`);
    const [persisted] = await tools.sql(
      `SELECT coalesce(sum(count),0) total FROM analytics_daily WHERE date BETWEEN '${actual.range.startDate}' AND '${actual.range.endDate}'`,
    );
    assert.equal(actual.versions.total, persisted.total);
    const [periodHistory] = await tools.sql(
      `SELECT sum(count) total,
        sum(CASE WHEN image_id='${fixture.ids[2]}' THEN count ELSE 0 END) deleted_total
        FROM analytics_image_daily WHERE date BETWEEN '${actual.range.startDate}' AND '${actual.range.endDate}'`,
    );
    assert.ok(periodHistory.deleted_total > 0);
    assert.equal(
      actual.versions.total,
      periodHistory.total,
      'Period totals and trend retain permanently deleted image history',
    );
    const ranked = await tools.sql(
      `SELECT daily.image_id imageId,sum(daily.count) count
        FROM analytics_image_daily daily JOIN media_images image ON image.id=daily.image_id
        WHERE daily.date BETWEEN '${actual.range.startDate}' AND '${actual.range.endDate}'
        GROUP BY daily.image_id HAVING sum(daily.count)>0
        ORDER BY count DESC,daily.image_id ASC LIMIT 10`,
    );
    assert.deepEqual(
      actual.popular.map(({ imageId, count }) => ({ imageId, count })),
      ranked,
      'Top ten contain only existing media entities, ordered by actual retained visits',
    );
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
        entry: node.querySelector('button')?.getAttribute('aria-label') ?? null,
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
    assert.deepEqual(
      rendered.popular.map(({ entry }) => entry),
      actual.popular.map(
        (item) =>
          `查看${item.state === 'recycled' ? `已回收图片 · ${item.shortId}` : item.displayName}统计，${number(item.count)}次访问`,
      ),
      'Every ranking action exposes its real image identity and visit count',
    );
    assert.equal(rendered.popular.length, 10);
    assert.equal(
      rendered.popular.some(({ id }) => id === fixture.ids[2]),
      false,
      'Permanently deleted image is absent, rather than rendered as a placeholder',
    );
    assert.ok(
      rendered.popular.some(({ id }) => id === fixture.ids[10]),
      'The next eligible image fills the tenth place after deletion exclusion',
    );
    const recycled = rendered.popular.find(({ id }) => id === fixture.ids[1]);
    assert.equal(recycled.image, null);
    const disabled = rendered.popular.find(({ id }) => id === fixture.ids[3]);
    assert.equal(disabled.image, null);
    assert.ok(
      rendered.popular
        .find(({ id }) => id === fixture.ids[0])
        .text.includes('摄影素材与公开访问历史'.repeat(12)),
    );
    report.behaviorStep = `period-${days}-daily-values`;
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
    report.behaviorStep = `period-${days}-return-overview`;
    await tools.open(`/analytics?days=${days}`);
  }
  report.behaviorStep = 'storage-usage';
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
  const usagePresentation = await page.evaluate(() => ({
    cards: [...document.querySelectorAll('[data-storage-id]')].map((node) => ({
      id: node.dataset.storageId,
      state: node.parentElement.querySelector('h2 [data-slot="chip"]')
        ?.textContent,
      stateClass: node.parentElement.querySelector('h2 [data-slot="chip"]')
        ?.className,
      pending: node.querySelector('[data-slot="chip"]')?.textContent ?? null,
      completeBar: !!node.querySelector('[data-testid="usage-composition"]'),
    })),
    summary: document.querySelector('[data-testid="usage-total"]').textContent,
    text: document.querySelector('[data-testid="analytics-page"]').textContent,
  }));
  for (const item of usageAfter.storages) {
    const card = usagePresentation.cards.find(({ id }) => id === item.id);
    assert.equal(card.state, item.enabled ? '已启用' : '已停用');
    assert.ok(
      card.stateClass.includes(
        item.enabled ? 'chip--success' : 'chip--default',
      ),
    );
    assert.equal(card.pending !== null, item.unconfirmedObjects > 0);
    assert.equal(
      card.completeBar,
      item.confirmationStatus === 'confirmed' && item.knownBytes > 0,
    );
  }
  assert.ok(usagePresentation.summary.includes('总量待确认'));
  for (const removed of [
    '查看各存储中 Ariso 图片对象的当前占用',
    '四类互斥，合计为当前已确认占用',
    '停用不会清零',
    '受理永久删除后仍占空间',
  ])
    assert.ok(!usagePresentation.text.includes(removed));
  report.checks.push(
    '7/30/90 URL, trend/versions/popular and keyboard-accessible complete daily rows agree with actual SQLite. Today/cumulative/current usage stay fixed. Permanently deleted images are excluded before the ten-item limit, with the next image filling their place; their accesses remain in cumulative totals and daily trends. Recycled/private/disabled-storage history and full names remain. Four disjoint usage groups and unknown objects never imply a complete total.',
  );

  report.behaviorStep = 'period-race';
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

  report.behaviorStep = 'keyboard-chart';
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
      report.behaviorStep = `${view}-scope-${width}`;
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
      if (view === 'usage') {
        const text = await page.evaluate(
          (selector) => document.querySelector(selector).textContent,
          dialog,
        );
        for (const rule of [
          '总占用尚未确认，不显示完整比例',
          '停用不清零',
          '成功清理对象后才减少',
          '已登记候选、旧对象、上传临时及探测对象',
        ]) {
          assert.ok(text.includes(rule), `Usage scope retains ${rule}`);
        }
      }
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
