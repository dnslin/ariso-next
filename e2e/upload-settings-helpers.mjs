import assert from 'node:assert/strict';
import { join } from 'node:path';
import { identitySql } from './identity-session.mjs';
import {
  resizeViewport,
  setTheme,
  readGeometry,
  assertGeometry,
} from './browser-geometry.mjs';

export const limitsField = (name) =>
  `[data-field="${name}"] input:not([type="hidden"])`;
export const limitsId = (name) => `[data-testid="upload-limits-${name}"]`;
export const limitsInput = ({ maxFileMiB, batchSize, queueLimit }) => ({
  maxFileMiB,
  batchSize,
  queueLimit,
});

// Faults act only at the browser fetch boundary. Lost responses follow an actual
// committed PATCH; held responses are released explicitly, never retried.
function boundary(fault) {
  const original = window.__limitsOriginalFetch ?? window.fetch;
  window.__limitsOriginalFetch = original;
  window.__limitsBrowser = { requests: [], fault, used: false };
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  window.__limitsRelease = release;
  window.fetch = async (...args) => {
    const path = new URL(
      typeof args[0] === 'string' ? args[0] : args[0].url,
      location.href,
    ).pathname;
    const method = args[1]?.method ?? 'GET';
    const relevant = [
      '/api/settings/upload',
      '/api/settings/site',
      '/upload/settings',
    ].includes(path);
    const state = window.__limitsBrowser;
    const record = relevant
      ? {
          path,
          method,
          ...(typeof args[1]?.body === 'string'
            ? { body: JSON.parse(args[1].body) }
            : {}),
        }
      : null;
    if (record) state.requests.push(record);
    if (
      path === '/api/settings/upload' &&
      method === 'GET' &&
      state.fault?.failReads
    ) {
      record.controlledNetworkFailure = true;
      throw new TypeError('Verification: upload settings read connection lost');
    }
    if (
      path === '/api/settings/upload' &&
      method === 'PATCH' &&
      !state.used &&
      state.fault?.validation
    ) {
      args[1] = {
        ...args[1],
        body: JSON.stringify({ ...JSON.parse(args[1].body), maxFileMiB: 0 }),
      };
      record.actualBody = JSON.parse(args[1].body);
      state.used = true;
    }
    if (
      path === '/api/settings/upload' &&
      method === 'PATCH' &&
      !state.used &&
      state.fault?.gateway
    ) {
      state.used = true;
      record.controlledGateway = true;
      return new Response('<h1>Verification gateway unavailable</h1>', {
        status: 503,
      });
    }
    const response = await original(...args);
    if (record) {
      record.status = response.status;
      if (response.headers.get('content-type')?.includes('application/json'))
        record.response = await response.clone().json();
    }
    if (
      path === '/api/settings/upload' &&
      ((method === 'GET' && state.fault?.holdReads) ||
        (method === 'PATCH' && state.fault?.holdSave))
    ) {
      record.held = true;
      await gate;
      record.released = true;
    }
    if (
      path === '/api/settings/upload' &&
      method === 'PATCH' &&
      !state.used &&
      state.fault?.lost
    ) {
      state.used = true;
      record.responseLost = true;
      if (state.fault.concurrent) {
        const concurrent = await original('/api/settings/upload', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(state.fault.concurrent),
        });
        if (!concurrent.ok)
          throw new Error('Real concurrent upload settings edit failed');
      }
      throw new TypeError(
        'Verification: committed upload settings response lost',
      );
    }
    return response;
  };
}

export async function uploadSettingsTools(page, config, report) {
  await page.goto(config.origin);
  async function authenticate() {
    const existing = await page.fetch('/api/auth/get-session');
    if (
      existing.status === 200 &&
      JSON.parse(existing.body)?.user?.email === config.credentials.email
    )
      return;
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await page.fetch('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(config.credentials),
      });
      if (response.status !== 429) {
        assert.equal(response.status, 200, 'Real owner sign-in');
        return;
      }
      const retryAfter = Number(
        response.headers['retry-after'] ?? response.headers['x-retry-after'],
      );
      assert.ok(retryAfter > 0 && retryAfter <= 60);
      await page.waitForFunction(
        (deadline) => Date.now() >= deadline,
        Date.now() + retryAfter * 1000,
        { timeout: retryAfter * 1000 + 1000 },
      );
    }
    assert.fail('Owner sign-in did not recover within actual retry windows');
  }
  await authenticate();
  const request = async (path, method = 'GET', body) => {
    const { cookies } = await page.cdp('Network.getCookies', {
      urls: [config.origin],
    });
    const response = await fetch(`${config.origin}${path}`, {
      method,
      headers: {
        cookie: cookies.map((item) => `${item.name}=${item.value}`).join('; '),
        origin: config.origin,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30000),
    });
    const value = await response.json();
    assert.ok(
      response.ok,
      `${method} ${path}: ${response.status} ${JSON.stringify(value)}`,
    );
    return value;
  };
  const open = async () => {
    await page.goto(`${config.origin}/settings/general`);
    await page.waitForSelector(`${limitsId('editor')}[data-state="ready"]`);
    await page.waitForFunction(
      () =>
        !document.querySelector('[data-testid="upload-limits-save"]').disabled,
    );
  };
  const fill = async (values) => {
    for (const [name, value] of Object.entries(values)) {
      await page.fill(limitsField(name), String(value));
      // Finish the actual NumberField editing interaction before another action.
      await page.keyboard.press('Tab');
      await page.waitForFunction(
        ({ name, value }) =>
          new FormData(document.querySelector('#upload-limits-form')).get(
            name,
          ) === String(value),
        { name, value },
      );
    }
  };
  const inputs = () =>
    page.evaluate(() =>
      Object.fromEntries(
        ['maxFileMiB', 'batchSize', 'queueLimit'].map((name) => [
          name,
          document.querySelector(
            `[data-field="${name}"] input:not([type="hidden"])`,
          ).value,
        ]),
      ),
    );
  const monitor = (fault = null) => page.evaluate(boundary, fault);
  const install = async (fault) => {
    const { identifier } = await page.cdp(
      'Page.addScriptToEvaluateOnNewDocument',
      { source: `(${boundary.toString()})(${JSON.stringify(fault)})` },
    );
    return () =>
      page.cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier });
  };
  const browser = () => page.evaluate(() => window.__limitsBrowser);
  const release = () => page.evaluate(() => window.__limitsRelease());
  const evidence = async (state, width = 1440, theme = 'light', height) => {
    await resizeViewport(page, width, height);
    await setTheme(page, theme);
    await page.mouse.move(5, 5);
    await page.waitForFunction(() =>
      [...document.querySelectorAll('[data-slot="toast"]')].every(
        (toast) =>
          !toast.hasAttribute('data-entering') &&
          !toast.hasAttribute('data-exiting') &&
          toast
            .getAnimations({ subtree: true })
            .every((animation) => animation.playState !== 'running'),
      ),
    );
    // HeroUI shrinks collapsed older notifications. Expand the real stack before
    // measuring every exposed close button; keep the shared 44px assertion.
    const stacked = await page.evaluate(
      () =>
        document.querySelectorAll('[data-slot="toast"]:not([data-hidden])')
          .length > 1,
    );
    if (stacked) {
      await page.hover('[data-slot="toast"][data-frontmost="true"]');
      await page.waitForFunction(() =>
        [
          ...document.querySelectorAll(
            '[data-slot="toast"]:not([data-hidden])',
          ),
        ].every(
          (toast) =>
            toast.hasAttribute('data-expanded') &&
            toast
              .getAnimations({ subtree: true })
              .every((animation) => animation.playState !== 'running'),
        ),
      );
    }
    await page.waitForFunction(() => document.fonts.status === 'loaded');
    const geometry = await readGeometry(page);
    assertGeometry(geometry, state);
    const screenshot = `upload-settings-${state}-${theme}-${width}${height ? `x${height}` : ''}.png`;
    await page.screenshot({ path: join(config.output, screenshot) });
    report.layouts.push({
      state,
      theme,
      height: height ?? (width >= 1200 ? 1080 : 844),
      ...geometry,
      screenshot,
    });
    await page.mouse.move(5, 5);
    await page.waitForFunction(
      () =>
        !document
          .querySelector('[data-slot="toast-region"]')
          ?.hasAttribute('data-expanded') &&
        [...document.querySelectorAll('[data-slot="toast"]')].every((toast) =>
          toast
            .getAnimations({ subtree: true })
            .every((animation) => animation.playState !== 'running'),
        ),
    );
  };
  const save = async () => {
    const previous =
      (await browser())?.requests.filter((r) => r.method === 'PATCH').length ??
      0;
    await page.click(limitsId('save'));
    await page.waitForFunction((previous) => {
      const patches =
        window.__limitsBrowser?.requests.filter((r) => r.method === 'PATCH') ??
        [];
      return (
        patches.length > previous &&
        patches.at(-1).status === 200 &&
        !document.querySelector('[data-testid="upload-limits-save"]').disabled
      );
    }, previous);
  };
  return {
    request,
    open,
    fill,
    inputs,
    monitor,
    install,
    browser,
    release,
    evidence,
    save,
    authenticate,
    sql: (statement) => identitySql(config, statement),
  };
}
