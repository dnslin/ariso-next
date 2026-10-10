import assert from 'node:assert/strict';
import {
  analyticsBoundary,
  analyticsClock,
  number,
} from './analytics-helpers.mjs';
import { quote } from './analytics-fixture.mjs';
import { resizeViewport, setTheme } from './browser-geometry.mjs';
import { signInToLibrary } from './library-login.mjs';

const dialog = '[data-testid="image-statistics-dialog"]';
const state = (name) => `[data-testid="image-statistics-${name}"]`;
const retry = 'loc=role:button[name="重试统计"]';

/** Single-image observations use real rows; every injected response is recorded.
 * The caller supplies its stop-aware page, including for finally cleanup. */
export async function analyticsImageStatistics(
  page,
  config,
  tools,
  fixture,
  report,
) {
  const id = fixture.ids[0];
  const path = `/api/analytics/images/${id}`;
  const source = `[data-testid="analytics-popular"] li[data-image-id="${id}"] button`;
  const clock = await analyticsClock(page);
  report.imageStatistics = { injections: [], reconciled: [] };
  const detail = report.imageStatistics;
  let boundary;

  async function open() {
    await tools.open('/analytics?days=30');
    await page.focus(source);
    await page.keyboard.press('Enter');
    await page.waitForSelector(dialog);
  }
  async function ready() {
    await page.waitForSelector(state('total'));
    await page.waitForFunction(() => {
      const chart = document.querySelector(
        '[data-testid="image-statistics-chart"]',
      );
      const svg = chart?.querySelector('svg.recharts-surface');
      return (
        svg &&
        Math.abs(svg.getBoundingClientRect().width - chart.clientWidth) <= 1
      );
    });
  }
  async function close() {
    await page.keyboard.press('Escape');
    await page.waitForSelector(dialog, { state: 'hidden' });
    await page.waitForFunction(
      (id) => document.activeElement?.closest('li')?.dataset.imageId === id,
      id,
    );
  }
  async function capture(name, width = 390, theme = 'light', height) {
    await resizeViewport(page, width, height);
    await setTheme(page, theme);
    await page.waitForFunction(() => {
      const chart = document.querySelector(
        '[data-testid="image-statistics-chart"]',
      );
      if (!chart) return true;
      const svg = chart.querySelector('svg.recharts-surface');
      return (
        svg &&
        Math.abs(svg.getBoundingClientRect().width - chart.clientWidth) <= 1
      );
    });
    await tools.evidence(`image-${name}`, width, theme, height);
    const layout = await page.evaluate((selector) => {
      const node = document.querySelector(selector);
      const rect = node.getBoundingClientRect();
      const footer = node
        .querySelector('[data-slot="modal-footer"]')
        .getBoundingClientRect();
      const chart = node.querySelector(
        '[data-testid="image-statistics-chart"]',
      );
      const svg = chart?.querySelector('svg.recharts-surface');
      const bounds = (element) => {
        const { left, right, top, bottom } = element.getBoundingClientRect();
        return { left, right, top, bottom };
      };
      return {
        width: rect.width,
        top: rect.top,
        bottom: rect.bottom,
        footerBottom: footer.bottom,
        overflow: node.scrollWidth > node.clientWidth,
        viewportHeight: innerHeight,
        chart: chart ? bounds(chart) : null,
        svg: svg ? bounds(svg) : null,
        ticks: [
          ...node.querySelectorAll(
            '.recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value',
          ),
        ].map((tick) => ({ text: tick.textContent, ...bounds(tick) })),
      };
    }, dialog);
    assert.ok(Math.abs(layout.width - Math.min(740, width - 32)) <= 1);
    assert.equal(layout.overflow, false);
    assert.ok(layout.top >= 15 && layout.bottom <= layout.viewportHeight - 15);
    assert.ok(layout.footerBottom <= layout.viewportHeight - 15);
    if (layout.chart) {
      assert.deepEqual(
        layout.ticks.map((tick) => tick.text),
        ['近7天', '近30天', '近90天'],
      );
      for (const tick of layout.ticks) {
        assert.ok(
          tick.left >= Math.max(layout.chart.left, layout.svg.left) - 1 &&
            tick.right <= Math.min(layout.chart.right, layout.svg.right) + 1 &&
            tick.top >= Math.max(layout.chart.top, layout.svg.top) - 1 &&
            tick.bottom <= Math.min(layout.chart.bottom, layout.svg.bottom) + 1,
          `${tick.text} glyph bounds fit inside both the SVG and chart without clipping`,
        );
      }
    }
    detail.layouts ??= [];
    detail.layouts.push({ name, width, theme, height, ...layout });
  }
  async function install(specification, reload = true) {
    detail.injections.push(specification);
    boundary = await analyticsBoundary(
      page,
      { path, ...specification },
      reload,
    );
  }
  async function cleanup() {
    if (!boundary) return;
    detail.requests ??= [];
    detail.requests.push(...(await boundary.read()));
    await boundary.dispose();
    boundary = undefined;
  }

  try {
    report.detailStep = 'real-reconciliation';
    await open();
    await ready();
    for (const imageId of [
      id,
      fixture.ids[1],
      fixture.ids[3],
      fixture.uploaded,
    ]) {
      const actual = await tools.request(`/api/analytics/images/${imageId}`);
      const [counts] = await tools.sql(
        `SELECT coalesce(sum(original_count),0) original, coalesce(sum(compressed_count),0) compressed, coalesce(sum(watermark_count),0) watermark FROM analytics_image_totals WHERE image_id=${quote(imageId)}`,
      );
      assert.deepEqual(actual.cumulative, {
        ...counts,
        total: counts.original + counts.compressed + counts.watermark,
      });
      assert.deepEqual(
        actual.periods.map(({ days }) => days),
        [7, 30, 90],
      );
      for (const period of actual.periods) {
        const [row] = await tools.sql(
          `SELECT coalesce(sum(count),0) total, coalesce(max(timezone != ${quote(actual.timezone)}),0) old FROM analytics_image_daily WHERE image_id=${quote(imageId)} AND date BETWEEN ${quote(period.startDate)} AND ${quote(period.endDate)}`,
        );
        assert.equal(period.total, row.total);
        assert.equal(period.containsOldTimezone, Boolean(row.old));
      }
      detail.reconciled.push({
        imageId,
        cumulative: actual.cumulative,
        periods: actual.periods,
      });
    }
    const actual = await tools.request(path);
    const rendered = await page.evaluate(() => ({
      total: document
        .querySelector('[data-testid="image-statistics-total"] [role="img"]')
        .getAttribute('aria-label'),
      versions: [
        ...document.querySelectorAll(
          '[data-testid="image-statistics-versions"] dd:not([aria-hidden])',
        ),
      ].map((node) => node.textContent.replace(/\s/g, '')),
      periods: document
        .querySelector('[data-testid="image-statistics-chart"]')
        .getAttribute('aria-label'),
    }));
    assert.equal(rendered.total, number(actual.cumulative.total));
    assert.deepEqual(
      rendered.versions,
      ['original', 'compressed', 'watermark'].map(
        (key) => `${number(actual.cumulative[key])}次`,
      ),
    );
    assert.equal(
      rendered.periods,
      actual.periods
        .map((period) => `近${period.days}天 ${number(period.total)}次`)
        .join('，'),
    );
    for (const theme of ['light', 'dark'])
      for (const width of [1440, 390]) await capture('normal', width, theme);
    await capture('short', 390, 'light', 400);
    await page.focus(state('name'));
    await page.keyboard.press('End');
    await page.waitForFunction(() => {
      const name = document.querySelector(
        '[data-testid="image-statistics-name"]',
      );
      return name.scrollTop > 0;
    });
    detail.longName = await page.evaluate(() => {
      const name = document.querySelector(
        '[data-testid="image-statistics-name"]',
      );
      return {
        text: name.textContent,
        height: name.clientHeight,
        lineHeight: parseFloat(getComputedStyle(name).lineHeight),
        fullHeight: name.scrollHeight,
      };
    });
    assert.ok(detail.longName.height <= detail.longName.lineHeight * 2 + 1);
    assert.ok(detail.longName.fullHeight > detail.longName.height);
    assert.ok(
      detail.longName.text.includes('摄影素材与公开访问历史'.repeat(12)),
    );
    await page.keyboard.press('Home');
    const body = `${dialog} [data-slot="modal-body"]`;
    assert.equal(
      await page.evaluate((selector) => {
        const node = document.querySelector(selector);
        return (
          node.scrollHeight > node.clientHeight &&
          getComputedStyle(node).overflowY === 'auto'
        );
      }, body),
      true,
      'Short view scrolls its body while keeping the footer available',
    );
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      assert.equal(
        await page.evaluate(
          (selector) =>
            document.querySelector(selector).contains(document.activeElement),
          dialog,
        ),
        true,
      );
    }
    await capture('keyboard-focus-short', 390, 'dark', 400);
    await page.hover(body);
    await page.mouse.wheel(0, 1000, { label: '查看短视口图表末端' });
    await page.waitForFunction((selector) => {
      const node = document.querySelector(selector);
      return node.scrollTop + node.clientHeight >= node.scrollHeight - 1;
    }, body);
    await capture('short-body-end', 390, 'dark', 400);
    await capture('narrow', 360, 'light');
    await resizeViewport(page, 1440);
    detail.hoverAppearance = [];
    for (const label of ['累计访问口径', '关闭图片统计']) {
      await page.hover(`loc=role:button[name="${label}"]`);
      await page.waitForFunction(
        (label) =>
          [...document.querySelectorAll('button')].some(
            (node) =>
              node.getAttribute('aria-label') === label &&
              node.getAttribute('data-hovered') === 'true' &&
              getComputedStyle(node).color ===
                getComputedStyle(
                  document.querySelector(
                    '[data-testid="image-statistics-dialog"]',
                  ),
                ).color,
          ),
        label,
      );
      const appearance = await page.evaluate((label) => {
        const node = [...document.querySelectorAll('button')].find(
          (node) => node.getAttribute('aria-label') === label,
        );
        const css = getComputedStyle(node);
        return {
          label,
          color: css.color,
          background: css.backgroundColor,
          transform: css.transform,
        };
      }, label);
      assert.equal(appearance.background, 'rgba(0, 0, 0, 0)');
      assert.equal(appearance.transform, 'none');
      detail.hoverAppearance.push(appearance);
    }
    await capture('hover-close', 1440, 'light');
    const chart = `${state('chart')} [role="application"]`;
    report.detailStep = 'keyboard-chart-focus';
    await page.focus(chart);
    // With click-triggered tooltips, focus presets index zero without showing
    // it. Move right to activate the tooltip, then return and read every point.
    for (const [key, period, step] of [
      ['ArrowRight', actual.periods[1], 'activate-30'],
      ['ArrowLeft', actual.periods[0], 'read-7'],
      ['ArrowRight', actual.periods[1], 'read-30'],
      ['ArrowRight', actual.periods[2], 'read-90'],
    ]) {
      report.detailStep = `keyboard-chart-${step}`;
      await page.keyboard.press(key);
      await page.waitForFunction(({ days, total }) => {
        const text = document.querySelector(
          '[data-testid="image-statistics-chart"] [role="status"]',
        )?.textContent;
        return (
          text?.includes(`近${days}天`) &&
          text.includes(`${new Intl.NumberFormat('zh-CN').format(total)} 次`)
        );
      }, period);
    }
    report.detailStep = 'keyboard-chart-capture';
    await capture('keyboard-chart', 1440, 'light');
    report.detailStep = 'keyboard-period-scope';
    await resizeViewport(page, 390);
    await page.focus('loc=role:button[name="周期范围"]');
    await page.keyboard.press('Space');
    await page.waitForFunction(() =>
      [...document.querySelectorAll('[role="dialog"]')].some((node) =>
        node.textContent.includes('三个点表示周期合计，不是逐日趋势'),
      ),
    );
    await tools.evidence('image-period-scope', 390, 'light');
    await page.keyboard.press('Escape');
    detail.pressedAppearance = [];
    for (const label of ['统计说明', '关闭图片统计']) {
      const selector = `loc=role:button[name="${label}"]`;
      await page.focus(selector);
      let held = false;
      try {
        await page.keyboard.down('Space');
        held = true;
        await page.waitForFunction(
          (label) =>
            [...document.querySelectorAll('button')].some(
              (node) =>
                node.getAttribute('aria-label') === label &&
                node.getAttribute('data-pressed') === 'true',
            ),
          label,
        );
        const appearance = await page.evaluate((label) => {
          const node = [...document.querySelectorAll('button')].find(
            (node) => node.getAttribute('aria-label') === label,
          );
          const css = getComputedStyle(node);
          return {
            label,
            transform: css.transform,
            background: css.backgroundColor,
          };
        }, label);
        assert.equal(appearance.transform, 'none');
        assert.equal(appearance.background, 'rgba(0, 0, 0, 0)');
        detail.pressedAppearance.push(appearance);
      } finally {
        if (held) await page.keyboard.up('Space');
      }
      if (label === '统计说明') {
        await page.waitForSelector('loc=role:dialog[name="统计说明"]');
        await page.keyboard.press('Escape');
      }
    }
    await page.waitForSelector(dialog, { state: 'hidden' });
    await page.waitForFunction(
      (id) => document.activeElement?.closest('li')?.dataset.imageId === id,
      id,
    );
    report.checks.push(
      'Single-image API totals and all 7/30/90 overlapping periods reconcile with real SQLite for private, recycled, disabled-storage and zero-access uploaded records. Rendered versions/counts, keyboard chart values, scope, responsive themes, short scrolling and trapped focus are checked.',
    );

    report.detailStep = 'initial-read-abort';
    await install({ hold: true });
    await open();
    await page.waitForSelector(state('loading'));
    assert.equal(
      await page.evaluate(
        () =>
          !!document.querySelector(
            '[data-testid="image-statistics-total"],[data-testid="image-statistics-zero"]',
          ),
      ),
      false,
    );
    await capture('loading', 390, 'light');
    await page.waitForFunction(
      (path) =>
        window.__analytics179.requests.some(
          (request) => request.path === path && request.held,
        ),
      path,
    );
    const scroll = await page.evaluate(
      () => document.getElementById('main-content').scrollTop,
    );
    await close();
    assert.equal(
      await page.evaluate(
        () => document.getElementById('main-content').scrollTop,
      ),
      scroll,
    );
    assert.equal(
      (await boundary.read()).findLast((request) => request.path === path)
        .aborted,
      true,
    );
    await boundary.configure({});
    await boundary.release();
    const imageReads = (await boundary.read()).filter(
      (request) => request.path === path,
    ).length;
    await clock.tick();
    assert.equal(
      await page.evaluate(
        () =>
          !!document.querySelector('[data-testid="image-statistics-dialog"]'),
      ),
      false,
    );
    assert.equal(
      (await boundary.read()).filter((request) => request.path === path).length,
      imageReads,
      'Closed image query has no remaining polling observer',
    );
    await cleanup();

    report.detailStep = 'first-error-retry';
    await install({ status: 500 });
    await open();
    await page.waitForSelector(state('error'));
    assert.equal(
      await page.evaluate(
        () =>
          !!document.querySelector(
            '[data-testid="image-statistics-total"],[data-testid="image-statistics-zero"]',
          ),
      ),
      false,
    );
    await capture('first-error', 390, 'dark');
    const beforeRetry = (await boundary.read()).length;
    await page.focus(retry);
    await page.evaluate(() => {
      window.__imageRetryTrusted = false;
      document
        .querySelector('[data-testid="image-statistics-error"] button')
        .addEventListener(
          'keydown',
          (event) => {
            if (event.code === 'Space' && event.isTrusted)
              window.__imageRetryTrusted = true;
          },
          { once: true },
        );
    });
    await boundary.configure({});
    await page.keyboard.press('Space');
    await ready();
    assert.equal(await page.evaluate(() => window.__imageRetryTrusted), true);
    assert.ok(
      (await boundary.read())
        .slice(beforeRetry)
        .some((request) => request.path === path && request.status === 200),
    );
    await boundary.configure({ path, status: 500 });
    await clock.tick();
    await page.waitForSelector(state('stale'));
    assert.equal(
      await page.evaluate(() =>
        document
          .querySelector('[data-testid="image-statistics-total"] [role="img"]')
          .getAttribute('aria-label'),
      ),
      number(actual.cumulative.total),
    );
    assert.match(
      await page.evaluate(
        () =>
          document.querySelector('[data-testid="image-statistics-updated"]')
            .textContent,
      ),
      /上次/,
    );
    await capture('stale', 1440, 'light');
    await cleanup();
    report.checks.push(
      'First read never fabricates zero; trusted Space retry sends a new successful single-image GET. A failed same-ID refresh retains its real old totals/update time. Closing a held first read aborts it, restores ranking focus/scroll and late delivery cannot reopen the dialog.',
    );

    report.detailStep = 'health-and-real-zero';
    for (const [name, health] of [
      [
        'waiting',
        {
          ...actual.health,
          status: 'waiting',
          pendingKeys: 1,
          pendingEvents: 2,
        },
      ],
      [
        'backlogged',
        {
          ...actual.health,
          status: 'backlogged',
          lastError: '验证：写入暂不可用',
        },
      ],
      [
        'incomplete',
        {
          ...actual.health,
          status: 'incomplete',
          incomplete: true,
          dropped: 3,
        },
      ],
    ]) {
      await install({ override: { health } });
      await open();
      await page.waitForSelector(state(name));
      await capture(name, 390, 'light');
      await cleanup();
    }
    await page.goto(`${config.origin}/library?image=${fixture.uploaded}`);
    await page.waitForSelector('[data-testid="detail-statistics-entry"]');
    await page.click('[data-testid="detail-statistics-entry"]');
    await page.waitForSelector(state('zero'));
    assert.equal(
      await page.evaluate(() =>
        document
          .querySelector('[data-testid="image-statistics-total"] [role="img"]')
          .getAttribute('aria-label'),
      ),
      '0',
    );
    await capture('real-zero', 390, 'light');
    await page.keyboard.press('Escape');
    await page.waitForSelector(dialog, { state: 'hidden' });

    report.detailStep = 'digit-motion';
    await install({});
    await open();
    await ready();
    await page.cdp('Emulation.setEmulatedMedia', {
      features: [
        { name: 'prefers-color-scheme', value: 'light' },
        { name: 'prefers-reduced-motion', value: 'no-preference' },
      ],
    });
    await page.evaluate(() => {
      window.__imageDigitTransitions = [];
      for (const type of ['transitionrun', 'transitionend'])
        document
          .querySelector('[data-testid="image-statistics-total"]')
          .addEventListener(type, (event) => {
            if (event.target.dataset.testid === 'rolling-number-wheel')
              window.__imageDigitTransitions.push({
                type,
                property: event.propertyName,
                elapsed: event.elapsedTime,
              });
          });
    });
    await boundary.configure({
      path,
      override: {
        cumulative: {
          ...actual.cumulative,
          original: actual.cumulative.original + 1,
          total: actual.cumulative.total + 1,
        },
      },
    });
    await clock.tick();
    await page.waitForFunction(() =>
      window.__imageDigitTransitions.some(
        (event) => event.type === 'transitionend',
      ),
    );
    detail.motion = await page.evaluate(() => ({
      events: window.__imageDigitTransitions,
      durations: [
        ...document.querySelectorAll('[data-testid="rolling-number-wheel"]'),
      ].map((node) => getComputedStyle(node).transitionDuration),
    }));
    assert.ok(
      detail.motion.events.some(
        (event) =>
          event.type === 'transitionrun' && event.property === 'transform',
      ),
    );
    assert.ok(
      detail.motion.events.some(
        (event) =>
          event.type === 'transitionend' &&
          Math.abs(event.elapsed - 0.28) < 0.005,
      ),
    );
    await page.cdp('Emulation.setEmulatedMedia', {
      features: [
        { name: 'prefers-color-scheme', value: 'light' },
        { name: 'prefers-reduced-motion', value: 'reduce' },
      ],
    });
    await boundary.configure({
      path,
      override: {
        cumulative: {
          ...actual.cumulative,
          original: actual.cumulative.original + 2,
          total: actual.cumulative.total + 2,
        },
      },
    });
    await clock.tick();
    await page.waitForFunction(
      (total) =>
        document
          .querySelector('[data-testid="image-statistics-total"] [role="img"]')
          .getAttribute('aria-label') ===
        new Intl.NumberFormat('zh-CN').format(total),
      actual.cumulative.total + 2,
    );
    detail.reducedMotion = await page.evaluate(() =>
      [
        ...document.querySelectorAll('[data-testid="rolling-number-wheel"]'),
      ].every(
        (node) =>
          getComputedStyle(node).transitionProperty === 'none' &&
          node.getAnimations().length === 0,
      ),
    );
    assert.equal(detail.reducedMotion, true);
    await cleanup();
    report.checks.push(
      'Explicit number-update fixtures produce real transform transitionrun/end events lasting 280ms; reduced-motion displays the final number without active digit animations. Health states and genuine no-access upload remain distinct from read failure.',
    );

    report.detailStep = 'missing-record';
    const missing = await page.fetch(`/api/analytics/images/${fixture.ids[2]}`);
    assert.equal(missing.status, 404);
    detail.actualMissingStatus = missing.status;
    await install({ status: 404 });
    await open();
    await page.waitForSelector(state('missing'));
    assert.equal(
      await page.evaluate(
        () =>
          !!document.querySelector(
            '[data-testid="image-statistics-total"],[data-testid="image-statistics-chart"]',
          ),
      ),
      false,
    );
    await capture('missing', 390, 'light');
    await close();
    await cleanup();

    // These pages have only one analytics observer. Their own single-image
    // 401 must end the session; overview/usage cannot mask a broken handler.
    detail.sessionExpiry = [];
    for (const [route, imageId, entry] of [
      ['library', fixture.uploaded, 'detail-statistics-entry'],
      ['trash', fixture.ids[1], 'trash-statistics-entry'],
    ]) {
      report.detailStep = `real-session-expiry-${route}`;
      await page.goto(`${config.origin}/${route}?image=${imageId}`);
      await page.waitForSelector(`[data-testid="${entry}"]`);
      await page.click(`[data-testid="${entry}"]`);
      await ready();
      const key = `analytics179-image-expiry-${route}`;
      await page.evaluate((key) => {
        const original = window.fetch;
        const events = [];
        const save = (event) => {
          events.push({ sequence: events.length, ...event });
          sessionStorage.setItem(key, JSON.stringify(events));
        };
        sessionStorage.setItem(key, '[]');
        window.fetch = async (...args) => {
          const url = new URL(
            typeof args[0] === 'string' ? args[0] : args[0].url,
            location.href,
          );
          const tracked = /^\/api\/(analytics|images|library|trash)(\/|$)/.test(
            url.pathname,
          );
          if (tracked) save({ type: 'start', path: url.pathname });
          const response = await original(...args);
          if (tracked)
            save({
              type: 'response',
              path: url.pathname,
              status: response.status,
            });
          return response;
        };
      }, key);
      const signedOut = await page.fetch('/api/auth/sign-out', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      assert.equal(signedOut.status, 200);
      await clock.tick();
      await page.waitForFunction(
        () =>
          location.pathname === '/login' &&
          new URLSearchParams(location.search).get('reason') === 'expired',
      );
      assert.equal(
        await page.evaluate(
          () =>
            !!document.querySelector(
              '[data-testid="image-statistics-dialog"],[data-testid="image-statistics-total"]',
            ),
        ),
        false,
      );
      const requests = await page.evaluate(
        (key) => JSON.parse(sessionStorage.getItem(key)),
        key,
      );
      const expired = requests.find(
        (event) =>
          event.type === 'response' &&
          event.path === `/api/analytics/images/${imageId}` &&
          event.status === 401,
      );
      assert.ok(expired, 'The actual single-image hook received HTTP401');
      assert.deepEqual(
        requests.filter(
          (event) =>
            event.sequence > expired.sequence && event.type === 'start',
        ),
        [],
        'Clearing session caches must not restart disabled observers',
      );
      detail.sessionExpiry.push({
        route,
        requests,
        returnTo: new URL(await page.url()).searchParams.get('returnTo'),
      });
      await page.evaluate((key) => sessionStorage.removeItem(key), key);
      await page.goto(`${config.origin}/library`);
      await signInToLibrary(page, config, report);
    }
    report.checks.push(
      'A deleted historical ID returns real HTTP404; its narrowly injected UI state hides all numbers and closes to the source. Library and trash statistics each receive actual HTTP401 after sign-out, hide private numbers and return to expired login; request traces survive navigation and prove cache clearing starts no new protected request.',
    );
  } finally {
    try {
      await cleanup();
    } finally {
      await clock.remove();
    }
  }
}
