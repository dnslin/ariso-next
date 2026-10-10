import assert from 'node:assert/strict';
import { join } from 'node:path';
import { identitySql } from './identity-session.mjs';
import {
  resizeViewport,
  setTheme,
  readGeometry,
  assertGeometry,
} from './browser-geometry.mjs';

export const root = '[data-testid="analytics-page"]';
export const button = (name) => `loc=role:button[name="${name}"]`;
export const number = (value) => new Intl.NumberFormat('zh-CN').format(value);

export function analyticsTools(page, config, report) {
  const sql = (statement) => identitySql(config, statement);
  async function request(path, method = 'GET', body) {
    const { cookies } = await page.cdp('Network.getCookies', {
      urls: [config.origin],
    });
    const response = await fetch(`${config.origin}${path}`, {
      method,
      headers: {
        cookie: cookies.map(({ name, value }) => `${name}=${value}`).join('; '),
        origin: config.origin,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30_000),
    });
    const value = await response.json();
    assert.ok(response.ok, `${method} ${path} HTTP ${response.status}`);
    return value;
  }
  async function open(path = '/analytics?days=7') {
    await page.goto(`${config.origin}${path}`);
    await page.waitForSelector(root);
    await page.waitForSelector(
      path.includes('view=usage')
        ? '[data-testid="analytics-usage"]'
        : '[data-testid="analytics-overview"]',
    );
  }
  async function evidence(name, width = 390, theme = 'light', height) {
    report.evidenceStep = `${name}:resize`;
    await resizeViewport(page, width, height);
    await setTheme(page, theme);
    report.evidenceStep = `${name}:fonts`;
    await page.waitForFunction(() => document.fonts.status === 'loaded');
    report.evidenceStep = `${name}:modal-viewport`;
    await page.waitForFunction(() => {
      const dialog = document.querySelector(
        '[data-testid="image-statistics-dialog"]',
      );
      const viewport = dialog
        ? Number.parseFloat(
            getComputedStyle(dialog).getPropertyValue(
              '--visual-viewport-height',
            ),
          )
        : innerHeight;
      return (
        !document.querySelector('[data-testid="image-statistics-dialog"]') ||
        Math.abs(viewport - innerHeight) <= 1
      );
    });
    // Wait for the resized compositor frame before capturing CSS-pixel images.
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    report.evidenceStep = `${name}:page-chart`;
    await page.waitForFunction(() =>
      [...document.querySelectorAll('[data-testid="analytics-chart"]')].every(
        (chart) => {
          const svg = chart.querySelector('svg.recharts-surface');
          return (
            svg &&
            Math.abs(svg.getBoundingClientRect().width - chart.clientWidth) <= 1
          );
        },
      ),
    );
    const geometry = await readGeometry(page);
    assertGeometry(geometry, `analytics/${name}/${width}/${theme}`);
    const filename = `analytics-${name}-${theme}-${width}${height ? `x${height}` : ''}.png`;
    await page.screenshot({ path: join(config.output, filename) });
    report.layouts.push({
      name,
      theme,
      height: height ?? (width >= 1200 ? 1080 : 844),
      screenshot: filename,
      ...geometry,
    });
  }
  return { sql, request, open, evidence };
}

/** Advance only the production query's ten-second interval; all other page
 * timers and network requests remain real. Visibility is an explicit fixture. */
export async function analyticsClock(page) {
  const { identifier } = await page.cdp(
    'Page.addScriptToEvaluateOnNewDocument',
    {
      source: `(() => {
      const originalInterval = window.setInterval;
      const originalClear = window.clearInterval;
      const timers = new Map();
      let sequence = 1000000000;
      window.__analytics179Clock = { timers, originalInterval, originalClear };
      window.setInterval = (callback, delay, ...args) => {
        if (delay !== 10000) return originalInterval(callback, delay, ...args);
        const id = ++sequence;
        timers.set(id, () => callback(...args));
        return id;
      };
      window.clearInterval = (id) => { if (!timers.delete(id)) originalClear(id); };
    })();`,
    },
  );
  return {
    tick: () =>
      page.evaluate(() => {
        for (const callback of [...window.__analytics179Clock.timers.values()])
          callback();
      }),
    visible: (value) =>
      page.evaluate((value) => {
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          get: () => (value ? 'visible' : 'hidden'),
        });
        window.dispatchEvent(new Event('visibilitychange'));
      }, value),
    count: () => page.evaluate(() => window.__analytics179Clock.timers.size),
    remove: () =>
      page.cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier }),
  };
}

// Each normal response is fetched from the production endpoint. Overrides are
// explicitly recorded state/fault injections, confined to one browser page.
export async function analyticsBoundary(
  page,
  specification = {},
  reload = false,
) {
  function install(specification) {
    const original = window.fetch;
    const state = { original, specification, requests: [], gates: {} };
    window.__analytics179 = state;
    window.fetch = async (...args) => {
      const url = new URL(
        typeof args[0] === 'string' ? args[0] : args[0].url,
        location.href,
      );
      if (!url.pathname.startsWith('/api/analytics/')) return original(...args);
      const record = {
        path: url.pathname,
        days: url.searchParams.get('days'),
        startedAt: Date.now(),
        aborted: false,
      };
      const requestIndex = state.requests.length;
      state.requests.push(record);
      const signal = args[1]?.signal;
      signal?.addEventListener(
        'abort',
        () => {
          record.aborted = true;
        },
        { once: true },
      );
      const fault = state.specification;
      const target = fault.path === undefined || url.pathname === fault.path;
      if (target && fault.status) {
        record.injectedStatus = fault.status;
        return Response.json(
          { code: 'ANALYTICS_READ_FAILED', message: '验证：统计读取暂不可用' },
          { status: fault.status },
        );
      }
      const response = await original(...args);
      record.status = response.status;
      const value = await response.clone().json();
      record.response = value;
      if (
        target &&
        fault.hold &&
        (!fault.days || record.days === String(fault.days))
      ) {
        record.held = true;
        await new Promise((resolve) => {
          state.gates[requestIndex] = resolve;
        });
        record.released = true;
      }
      if (target && fault.override) {
        record.override = true;
        return Response.json({ ...value, ...fault.override });
      }
      record.finishedAt = Date.now();
      return response;
    };
  }
  let identifier;
  if (reload)
    ({ identifier } = await page.cdp('Page.addScriptToEvaluateOnNewDocument', {
      source: `(${install.toString()})(${JSON.stringify(specification)});`,
    }));
  else await page.evaluate(install, specification);
  return {
    read: () => page.evaluate(() => window.__analytics179.requests),
    configure: (specification) =>
      page.evaluate((value) => {
        window.__analytics179.specification = value;
      }, specification),
    release: () =>
      page.evaluate(() => {
        for (const resolve of Object.values(window.__analytics179.gates))
          resolve();
        window.__analytics179.gates = {};
      }),
    async dispose() {
      if (identifier)
        await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
          identifier,
        });
      await page.evaluate(() => {
        const state = window.__analytics179;
        if (!state) return;
        for (const resolve of Object.values(state.gates)) resolve();
        window.fetch = state.original;
        delete window.__analytics179;
      });
    },
  };
}
