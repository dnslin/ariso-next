import assert from 'node:assert/strict';
import {
  analyticsBoundary,
  analyticsClock,
  button,
} from './analytics-helpers.mjs';
import { signInToLibrary } from './library-login.mjs';

async function retryWithKeyboard(
  page,
  boundary,
  label,
  path,
  report,
  accessibleLabel = label,
) {
  const requestCount = (await boundary.read()).length;
  await page.evaluate((label) => {
    const button = [...document.querySelectorAll('button')].find(
      (node) => node.textContent.trim() === label,
    );
    window.__analytics179.retryInput = [];
    for (const type of ['keydown', 'click'])
      button.addEventListener(
        type,
        (event) =>
          window.__analytics179.retryInput.push({
            type,
            key: event.key ?? null,
            code: event.code ?? null,
            trusted: event.isTrusted,
          }),
        { once: true },
      );
  }, label);
  await page.focus(button(accessibleLabel));
  await boundary.configure({});
  await page.keyboard.press('Space');
  try {
    await page.waitForFunction(
      ({ requestCount, path }) => {
        const state = window.__analytics179;
        return (
          state.retryInput.some(
            (event) =>
              event.type === 'keydown' &&
              (event.code === 'Space' || event.key === ' ') &&
              event.trusted,
          ) &&
          state.requests
            .slice(requestCount)
            .some(
              (request) =>
                request.path === path &&
                request.status === 200 &&
                request.finishedAt,
            )
        );
      },
      { requestCount, path },
    );
  } finally {
    report.retryEvents ??= [];
    report.retryEvents.push(
      await page.evaluate(
        ({ requestCount, label }) => ({
          label,
          events: window.__analytics179.retryInput,
          requests: window.__analytics179.requests.slice(requestCount),
        }),
        { requestCount, label },
      ),
    );
  }
}

export async function analyticsRecovery(page, config, tools, fixture, report) {
  const clock = await analyticsClock(page);
  try {
    let boundary = await analyticsBoundary(page, { hold: true }, true);
    try {
      await page.goto(`${config.origin}/dashboard?days=7`);
      await page.waitForSelector('[data-testid="overview-loading"]');
      await page.waitForSelector('[data-testid="usage-loading"]');
      assert.equal(
        await page.evaluate(
          () => !!document.querySelector('[data-testid="dashboard-metrics"]'),
        ),
        false,
        'No fabricated zeros while the first read is pending',
      );
      await tools.evidence('initial-loading', 390, 'light');
      await page.waitForFunction(
        () =>
          window.__analytics179.requests.filter((record) => record.held)
            .length === 2,
      );
      await boundary.release();
      await page.waitForSelector('[data-testid="dashboard-metrics"]');
      await page.waitForSelector('[data-testid="analytics-usage-summary"]');
      await page.waitForSelector('[data-testid="overview-loading"]', {
        state: 'hidden',
      });
      await page.waitForSelector('[data-testid="usage-loading"]', {
        state: 'hidden',
      });
    } finally {
      await boundary.dispose();
    }

    for (const [scope, path, ready, retry] of [
      [
        'overview',
        '/api/analytics/overview',
        'analytics-usage-summary',
        '重试访问统计',
      ],
      ['usage', '/api/analytics/usage', 'dashboard-metrics', '重试存储占用'],
    ]) {
      boundary = await analyticsBoundary(page, { path, status: 500 }, true);
      try {
        await page.goto(`${config.origin}/dashboard?days=7`);
        await page.waitForSelector(`[data-testid="${scope}-error"]`);
        await page.waitForSelector(`[data-testid="${ready}"]`);
        if (scope === 'overview')
          assert.equal(
            await page.evaluate(
              () =>
                !!document.querySelector('[data-testid="dashboard-metrics"]'),
            ),
            false,
          );
        await tools.evidence(`${scope}-first-read-error`, 390, 'dark');
        await retryWithKeyboard(page, boundary, retry, path, report);
        await page.waitForSelector(`[data-testid="${scope}-error"]`, {
          state: 'hidden',
        });
        await page.waitForSelector('[data-testid="dashboard-metrics"]');
      } finally {
        await boundary.dispose();
      }
    }
    await tools.open();
    const before = await page.evaluate(() => ({
      metrics: document.querySelector('[data-testid="analytics-metrics"]')
        .textContent,
      metadata: document.querySelector('[data-testid="analytics-metadata"]')
        .textContent,
    }));
    boundary = await analyticsBoundary(page, {
      path: '/api/analytics/overview',
      status: 500,
    });
    try {
      await page.focus(button('刷新访问统计'));
      await page.keyboard.press('Space');
      await page.waitForSelector('[data-testid="overview-stale"]');
      const retained = await page.evaluate(() => ({
        metrics: document.querySelector('[data-testid="analytics-metrics"]')
          .textContent,
        status: document.querySelector('[data-testid="overview-stale"]')
          .textContent,
      }));
      assert.equal(retained.metrics, before.metrics);
      assert.ok(
        retained.status.includes(before.metadata.match(/更新于 (\d+:\d+)/)[1]),
      );
      await tools.evidence('refresh-failed-old-data', 1440, 'light');
      await retryWithKeyboard(
        page,
        boundary,
        '重试',
        '/api/analytics/overview',
        report,
        '重试 7 天访问统计',
      );
      await page.waitForSelector('[data-testid="overview-stale"]', {
        state: 'hidden',
      });
    } finally {
      await boundary.dispose();
    }
    await tools.open('/analytics?days=7');
    boundary = await analyticsBoundary(page, {
      path: '/api/analytics/overview',
      days: 30,
      status: 500,
    });
    try {
      await page.waitForSelector('[data-testid="analytics-chart"]');
      await page.evaluate(() => {
        window.__analytics179.continuity = {
          overview: document.querySelector(
            '[data-testid="analytics-overview"]',
          ),
          chart: document.querySelector('[data-testid="analytics-chart"]'),
          periods: document.querySelector('[aria-label="统计周期"]'),
          metrics: document.querySelector('[data-testid="analytics-metrics"]')
            .textContent,
        };
      });
      await page.focus(
        'loc=css:[aria-label="统计周期"] button[role="radio"] >> nth=1',
      );
      await page.keyboard.press('Space');
      await page.waitForSelector('[data-testid="overview-stale"]');
      assert.deepEqual(
        await page.evaluate(() => {
          const before = window.__analytics179.continuity;
          const current = document.querySelector(
            '[data-testid="analytics-overview"]',
          );
          return {
            overview: before.overview === current,
            chart:
              before.chart ===
              document.querySelector('[data-testid="analytics-chart"]'),
            periods:
              before.periods ===
              document.querySelector('[aria-label="统计周期"]'),
            metrics:
              before.metrics ===
              document.querySelector('[data-testid="analytics-metrics"]')
                .textContent,
            requested: current.dataset.requestedDays,
            displayed: current.dataset.displayedDays,
            status: document
              .querySelector('[data-testid="overview-stale"]')
              .textContent.includes('30 天更新失败，当前显示 7 天'),
          };
        }),
        {
          overview: true,
          chart: true,
          periods: true,
          metrics: true,
          requested: '30',
          displayed: '7',
          status: true,
        },
      );
      await tools.evidence('new-period-failed-old-data', 390, 'dark');
      await retryWithKeyboard(
        page,
        boundary,
        '重试',
        '/api/analytics/overview',
        report,
        '重试 30 天访问统计',
      );
      await page.waitForFunction(
        () =>
          document.querySelector('[data-testid="analytics-overview"]')?.dataset
            .displayedDays === '30',
      );
      const retried = (await boundary.read()).filter(
        (request) => request.days === '30',
      );
      assert.ok(retried.some((request) => request.injectedStatus === 500));
      assert.ok(retried.some((request) => request.status === 200));
      assert.equal(
        await page.evaluate(
          () =>
            window.__analytics179.continuity.chart ===
            document.querySelector('[data-testid="analytics-chart"]'),
        ),
        true,
      );
      report.periodFailure = retried;
    } finally {
      await boundary.dispose();
    }
    report.checks.push(
      'Initial overview/usage loading and independent read failures never fabricate zeros. Same-period and new-period failures retain the real old report and update time, including overview/chart/control nodes. A 30-day failure explicitly identifies displayed 7-day data and trusted keyboard retry requests 30 days before updating the same chart.',
    );

    for (const query of ['days=10', 'days=7&days=30', 'days=7&view=unknown']) {
      await page.goto(`${config.origin}/analytics?${query}`);
      await page.waitForFunction(() =>
        document
          .querySelector('main [role="alert"]')
          ?.textContent.includes('查询参数无效'),
      );
      assert.equal(
        await page.evaluate(
          () => !!document.querySelector('[data-testid="analytics-metrics"]'),
        ),
        false,
      );
      await page.focus('loc=role:link[name="重置统计查询"]');
      await page.keyboard.press('Enter');
      await page.waitForURL(`${config.origin}/analytics`);
      await page.waitForSelector('[data-testid="analytics-overview"]');
    }
    report.checks.push(
      'Invalid days, repeated days and an invalid view expose the explicit reset action without presenting a different period as the requested result.',
    );

    const normal = await tools.request('/api/analytics/overview?days=7');
    for (const [name, health, expected] of [
      [
        'waiting',
        {
          ...normal.health,
          status: 'waiting',
          pendingKeys: 1,
          pendingEvents: 2,
        },
        'analytics-waiting',
      ],
      [
        'backlogged',
        {
          ...normal.health,
          status: 'backlogged',
          pendingKeys: 1,
          pendingEvents: 2,
          lastError: '验证：数据库暂不可写',
        },
        'analytics-backlogged',
      ],
      [
        'incomplete',
        {
          ...normal.health,
          status: 'incomplete',
          dropped: 3,
          incomplete: true,
        },
        'analytics-incomplete',
      ],
    ]) {
      boundary = await analyticsBoundary(
        page,
        { path: '/api/analytics/overview', override: { health } },
        true,
      );
      try {
        await tools.open();
        await page.waitForSelector(`[data-testid="${expected}"]`);
        await tools.evidence(name, 390, 'light');
        if (name === 'incomplete') {
          await boundary.configure({
            path: '/api/analytics/overview',
            override: {
              health: {
                ...health,
                pendingKeys: 0,
                pendingEvents: 0,
                lastError: null,
              },
            },
          });
          await page.focus(button('刷新访问统计'));
          await page.keyboard.press('Space');
          await page.waitForSelector('[data-testid="overview-refreshing"]', {
            state: 'hidden',
          });
          await page.waitForSelector('[data-testid="analytics-incomplete"]');
        }
      } finally {
        await boundary.dispose();
      }
    }
    await fixture.clearAccess();
    try {
      await tools.open();
      const zero = await tools.request('/api/analytics/overview?days=7');
      assert.equal(zero.today, 0);
      assert.equal(zero.cumulative.total, 0);
      assert.ok(zero.trend.every(({ count }) => count === 0));
      assert.deepEqual(zero.popular, []);
      await page.waitForFunction(() =>
        document
          .querySelector('[data-testid="analytics-trend"]')
          .textContent.includes('本周期暂无公开图片访问'),
      );
      await tools.evidence('real-zero-access', 390, 'light');
      // Empty rendering is an explicit counts fixture alongside the genuine
      // zero-access response; it cannot be confused with the read-error path.
      boundary = await analyticsBoundary(
        page,
        {
          path: '/api/analytics/overview',
          override: {
            counts: {
              normalImages: 0,
              recycledImages: 0,
              albums: 0,
              initialProcessingFailures: 0,
              reprocessFailures: 0,
            },
          },
        },
        true,
      );
      try {
        await tools.open();
        await page.waitForFunction(() =>
          document
            .querySelector('[data-testid="analytics-trend"]')
            .textContent.includes('图片库为空'),
        );
        await tools.evidence('empty-counts-render-fixture', 1440, 'dark');
      } finally {
        await boundary.dispose();
      }
    } finally {
      await fixture.seedAccess();
    }
    await tools.open('/analytics?days=30');
    await page.waitForSelector('[data-testid="analytics-old-timezone"]');
    await tools.evidence('old-timezone', 390, 'light');
    report.checks.push(
      'Real SQLite zero-access rows produce a zero trend and no invented popular items. Explicit empty-counts rendering stays separate from read failure. Waiting/backlog/incomplete response fixtures expose distinct states; repaired backlog cannot erase the persistent incomplete flag. A real different-timezone historical segment retains its old-timezone explanation.',
    );

    boundary = await analyticsBoundary(page, {}, true);
    try {
      await tools.open();
      await page.waitForFunction(
        () =>
          window.__analytics179.requests.length === 2 &&
          window.__analytics179.requests.every((record) => record.finishedAt),
      );
      assert.equal(
        await clock.count(),
        2,
        'Two active queries register the actual 10,000ms intervals',
      );
      await clock.visible(false);
      await clock.tick();
      assert.equal(
        (await boundary.read()).length,
        2,
        'Hidden query interval skips both endpoints',
      );
      await clock.visible(true);
      await page.waitForFunction(
        () =>
          window.__analytics179.requests.length === 4 &&
          window.__analytics179.requests.every((record) => record.finishedAt),
      );
      await boundary.configure({ path: '/api/analytics/overview', hold: true });
      await clock.tick();
      await page.waitForFunction(() =>
        window.__analytics179.requests.some((record) => record.held),
      );
      const heldCount = (await boundary.read()).filter(
        ({ path }) => path === '/api/analytics/overview',
      ).length;
      await clock.tick();
      await clock.visible(false);
      await clock.visible(true);
      assert.equal(
        (await boundary.read()).filter(
          ({ path }) => path === '/api/analytics/overview',
        ).length,
        heldCount,
        'Interval and restore join the unfinished overview request',
      );
      assert.equal(
        (await boundary.read())
          .filter(({ path }) => path === '/api/analytics/overview')
          .at(-1).aborted,
        false,
      );
      await boundary.release();
      await page.waitForSelector('[data-testid="overview-refreshing"]', {
        state: 'hidden',
      });
      report.visibilityRequests = await boundary.read();
    } finally {
      await boundary.dispose();
    }
    await tools.open('/analytics?days=30');
    const signedOut = await page.fetch('/api/auth/sign-out', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(signedOut.status, 200);
    await page.focus(button('刷新访问统计'));
    await page.keyboard.press('Space');
    await page.waitForFunction(
      () =>
        location.pathname === '/login' &&
        new URLSearchParams(location.search).get('reason') === 'expired',
    );
    assert.equal(
      new URL(await page.url()).searchParams.get('returnTo'),
      '/analytics?days=30',
    );
    assert.equal(
      await page.evaluate(
        () => !!document.querySelector('[data-testid="analytics-metrics"]'),
      ),
      false,
    );
    await page.goto(`${config.origin}/library`);
    await signInToLibrary(page, config, report);
    report.checks.push(
      'The actual registered ten-second poll is exercised with controlled interval ticks and page visibility. Hidden ticks send nothing; restoration immediately reads both endpoints without overlapping or aborting unfinished requests. Real sign-out followed by real HTTP 401 clears the displayed report and returns to login with the complete destination.',
    );
  } finally {
    await clock.remove();
  }
}
