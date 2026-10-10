import assert from 'node:assert/strict';
import { join } from 'node:path';
import { identitySql } from './identity-session.mjs';
import {
  resizeViewport,
  setTheme,
  readGeometry,
  assertGeometry,
} from './browser-geometry.mjs';

export const screen = '[data-testid="site-branding"]';
export const control = (kind, action) =>
  `[data-testid="branding-${kind}-${action}"]`;

const fixtureColumns =
  'name,description,public_url,time_zone,logo_key,logo_mime,favicon_key,favicon_mime,updated_at';
export async function readBrandingFixture(config) {
  return (
    await identitySql(
      config,
      `SELECT ${fixtureColumns} FROM site_settings WHERE id=1`,
    )
  )[0];
}

// Restore this suite's disposable database without touching a stopped Ego page.
export async function restoreBrandingFixture(config, original) {
  const value = (input) =>
    input === null ? 'NULL' : `'${String(input).replaceAll("'", "''")}'`;
  await identitySql(
    config,
    `UPDATE site_settings SET ${Object.entries(original)
      .map(([column, input]) => `${column}=${value(input)}`)
      .join(',')} WHERE id=1`,
  );
  assert.deepEqual(await readBrandingFixture(config), original);
}

export function brandingTools(page, config, report) {
  async function api(path = '/api/settings/site', method = 'GET', body) {
    const response = await page.fetch(path, {
      method,
      ...(body === undefined
        ? {}
        : {
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          }),
    });
    assert.equal(response.status, 200, `${method} ${path}: ${response.body}`);
    return JSON.parse(response.body);
  }
  const state = (phase) =>
    page.waitForSelector(`${screen}[data-phase="${phase}"]`);
  async function open() {
    await page.goto(`${config.origin}/settings/general/branding`);
    await page.waitForSelector(`${screen}[data-state="ready"]`);
  }
  async function choose(kind, file = 'source.png') {
    await page.setInputFiles(control(kind, 'file'), [
      join(config.projectDirectory, 'tests/fixtures/media-formats', file),
    ]);
    await state('selected');
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector('[data-testid="site-branding"]').dataset.kind,
      ),
      kind,
    );
  }
  async function save(kind) {
    await page.click(control(kind, 'save'));
    await page.waitForSelector(`[data-testid="branding-${kind}"]`);
    return api();
  }
  async function evidence(name, width = 390, theme = 'light', height) {
    await resizeViewport(page, width, height);
    await setTheme(page, theme);
    await page.waitForFunction(
      () =>
        document.fonts.status === 'loaded' &&
        !document
          .getAnimations()
          .some((animation) => animation.playState === 'running'),
    );
    const geometry = await readGeometry(page);
    assertGeometry(geometry, `branding/${name}/${width}/${theme}`);
    const screenshot = `site-branding-${name}-${theme}-${width}${height ? `x${height}` : ''}.png`;
    await page.screenshot({ path: join(config.output, screenshot) });
    report.layouts.push({ name, theme, screenshot, ...geometry });
  }
  return { api, state, open, choose, save, evidence };
}

// The page fetch boundary injects explicit failures. Successful mutations
// always reach the production service; counters prove no automatic replay.
export async function brandingFault(page, specification = {}, reload = false) {
  function install(specification) {
    const original = window.fetch;
    const state = {
      original,
      requests: [],
      reads: 0,
      writes: 0,
      release: null,
      fault: specification,
    };
    window.__brandingFault = state;
    window.fetch = async (...args) => {
      const input = args[0];
      const path = new URL(
        typeof input === 'string' ? input : input.url,
        location.href,
      ).pathname;
      const method = (
        args[1]?.method ??
        (typeof input === 'string' ? 'GET' : input.method) ??
        'GET'
      ).toUpperCase();
      if (path === '/api/settings/site' && method === 'GET') {
        state.reads++;
        if (state.fault.readError)
          throw new TypeError('Verification: branding read unavailable');
        const response = await original(...args);
        if (state.fault.readHold)
          await new Promise((resolve) => {
            state.release = resolve;
          });
        state.requests.push({ path, method, status: response.status });
        return response;
      }
      if (
        path.startsWith('/api/settings/site/branding/') &&
        ['PUT', 'DELETE'].includes(method)
      ) {
        state.writes++;
        if (state.fault.unsent) {
          state.requests.push({ path, method, unsent: true });
          throw new TypeError('Verification: branding request unsent');
        }
        const response = await original(...args);
        state.requests.push({ path, method, status: response.status });
        if (state.fault.hold || state.fault.lost)
          await new Promise((resolve) => {
            state.release = resolve;
          });
        if (state.fault.lost)
          throw new TypeError(
            'Verification: branding response lost after real commit',
          );
        return response;
      }
      return original(...args);
    };
  }
  let identifier;
  if (reload)
    ({ identifier } = await page.cdp('Page.addScriptToEvaluateOnNewDocument', {
      source: `(${install.toString()})(${JSON.stringify(specification)});`,
    }));
  else await page.evaluate(install, specification);
  return {
    observed: () =>
      page.evaluate(() => ({
        reads: window.__brandingFault.reads,
        writes: window.__brandingFault.writes,
        requests: window.__brandingFault.requests,
      })),
    wait: () =>
      page.waitForFunction(
        () => typeof window.__brandingFault?.release === 'function',
      ),
    release: () =>
      page.evaluate(() => {
        window.__brandingFault.release?.();
        window.__brandingFault.release = null;
      }),
    update: (value) =>
      page.evaluate(
        (value) => Object.assign(window.__brandingFault.fault, value),
        value,
      ),
    async dispose() {
      if (identifier)
        await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
          identifier,
        });
      await page.evaluate(() => {
        const state = window.__brandingFault;
        if (!state) return;
        state.release?.();
        window.fetch = state.original;
        delete window.__brandingFault;
      });
    },
  };
}

export async function watchBlobUrls(page) {
  await page.evaluate(() => {
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    window.__brandingBlobs = { created: [], revoked: [] };
    URL.createObjectURL = (...args) => {
      const url = create(...args);
      window.__brandingBlobs.created.push(url);
      return url;
    };
    URL.revokeObjectURL = (url) => {
      window.__brandingBlobs.revoked.push(url);
      revoke(url);
    };
  });
}

export async function assertBlobReleased(page, url, scenario) {
  await page.waitForFunction(
    (url) => window.__brandingBlobs.revoked.includes(url),
    url,
  );
  assert.equal(
    await page.evaluate(
      (url) =>
        window.__brandingBlobs.revoked.filter((value) => value === url).length,
      url,
    ),
    1,
    `${scenario}: revoke the selected Blob exactly once`,
  );
}
