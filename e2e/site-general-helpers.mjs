import assert from 'node:assert/strict';
import { join } from 'node:path';
import { identitySql } from './identity-session.mjs';
import {
  resizeViewport,
  setTheme,
  readGeometry,
  assertGeometry,
} from './browser-geometry.mjs';

export const screen = '[data-testid="site-general"]';
export const field = (name) => `#site-${name}`;
export const button = (name) => `loc=role:button[name="${name}"]`;
export const editableSite = ({ name, description, publicUrl, timeZone }) => ({
  name,
  description,
  publicUrl,
  timeZone,
});
export const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;

export async function siteGeneralTools(page, config, report) {
  const sql = (statement) => identitySql(config, statement);
  async function request(path, method = 'GET', value, address = config.origin) {
    const { cookies } = await page.cdp('Network.getCookies', {
      urls: [address],
    });
    const response = await fetch(`${address}${path}`, {
      method,
      headers: {
        cookie: cookies.map(({ name, value }) => `${name}=${value}`).join('; '),
        Origin: address,
        ...(value === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(value === undefined ? {} : { body: JSON.stringify(value) }),
      signal: AbortSignal.timeout(10000),
    });
    const body = await response.json();
    assert.ok(
      response.ok,
      `${method} ${path}: ${response.status} ${JSON.stringify(body)}`,
    );
    return body;
  }
  const read = () => request('/api/settings/site');
  const patch = (value) => request('/api/settings/site', 'PATCH', value);
  async function state(value) {
    await page.waitForSelector(`${screen}[data-state="${value}"]`);
  }
  async function open() {
    await page.goto(`${config.origin}/settings/general`);
    await state('ready');
    assert.equal(
      await page.evaluate(() =>
        document.querySelector('main h1').textContent.trim(),
      ),
      '站点设置',
    );
  }
  async function values() {
    return page.evaluate(() =>
      Object.fromEntries(
        ['name', 'description', 'publicUrl', 'timeZone'].map((name) => [
          name,
          document.querySelector(`#site-${name}`).value,
        ]),
      ),
    );
  }
  async function fill(value) {
    for (const [name, input] of Object.entries(value))
      await page.fill(field(name), input);
  }
  async function save(keyboard = false) {
    const held = await siteFault(page, { mode: 'write-hold' });
    try {
      if (keyboard) {
        await page.focus(button('保存站点信息'));
        await page.keyboard.press('Enter');
      } else await page.click(button('保存站点信息'));
      await held.wait('releaseWrite');
      assert.equal((await held.observed()).requests[0].status, 200);
      await state('saving');
      await enabled(false);
      await held.release('releaseWrite');
      await state('ready');
      await page.waitForFunction(() =>
        document.body.textContent.includes('站点信息已保存'),
      );
    } finally {
      await held.dispose();
    }
  }
  async function evidence(name, width = 390, theme = 'light', height) {
    await resizeViewport(page, width, height);
    await setTheme(page, theme);
    await page.waitForFunction(() => document.fonts.status === 'loaded');
    const geometry = await readGeometry(page);
    assertGeometry(geometry, `site/${name}/${width}/${theme}`);
    const screenshot = `site-general-${name}-${theme}-${width}${height ? `x${height}` : ''}.png`;
    await page.screenshot({ path: join(config.output, screenshot) });
    report.layouts.push({
      name,
      theme,
      height: height ?? (width >= 1200 ? 1080 : 844),
      screenshot,
      ...geometry,
    });
  }
  async function reveal(selector, name, width = 390, theme = 'light', height) {
    await resizeViewport(page, width, height);
    await setTheme(page, theme);
    function area(selector) {
      const bounds = document.querySelector(selector).getBoundingClientRect();
      const main = document.querySelector('main').getBoundingClientRect();
      const footer = document
        .querySelector('.shell-footer')
        .getBoundingClientRect();
      return {
        visible:
          bounds.top >= main.top &&
          bounds.bottom <= Math.min(main.bottom, footer.top),
        delta: bounds.top - main.top - 12,
        x: main.left + main.width / 2,
        y: main.top + Math.min(main.height, footer.top - main.top) / 2,
      };
    }
    const before = await page.evaluate(area, selector);
    if (!before.visible) {
      await page.mouse.move(before.x, before.y, {
        label: 'move into settings content',
      });
      await page.mouse.wheel(0, before.delta, {
        label: 'reveal settings state region',
      });
    }
    await page.waitForFunction((selector) => {
      const bounds = document.querySelector(selector).getBoundingClientRect();
      const main = document.querySelector('main').getBoundingClientRect();
      const footer = document
        .querySelector('.shell-footer')
        .getBoundingClientRect();
      return (
        bounds.top >= main.top &&
        bounds.bottom <= Math.min(main.bottom, footer.top)
      );
    }, selector);
    await evidence(name, width, theme, height);
  }
  async function enabled(enabled) {
    const controls = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '#site-settings-form input,#site-settings-form textarea,#site-save',
        ),
      ].map((node) => ({
        name: node.name || node.textContent,
        disabled: node.disabled,
      })),
    );
    assert.ok(controls.length >= 5, 'Four fields and the save action exist');
    for (const item of controls)
      assert.equal(item.disabled, !enabled, `${item.name}: editable boundary`);
  }
  return {
    sql,
    request,
    read,
    patch,
    state,
    open,
    values,
    fill,
    save,
    evidence,
    reveal,
    enabled,
  };
}

// Transport injection is confined to this page. Successful responses always
// come from the production server, including writes whose response is lost.
export async function siteFault(page, specification, reload = false) {
  function initialize(specification) {
    const original = window.fetch;
    const state = {
      original,
      previous: window.__siteGeneralFault,
      requests: [],
      releaseWrite: null,
      releaseRead: null,
      reads: 0,
      writes: 0,
    };
    window.__siteGeneralFault = state;
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
      if (path !== (specification.path ?? '/api/settings/site'))
        return original(...args);
      if (
        method === 'PATCH' &&
        ['write-hold', 'lost', 'unsent'].includes(specification.mode)
      ) {
        state.writes++;
        if (specification.mode !== 'unsent') {
          const response = await original(...args);
          state.requests.push({ method, status: response.status });
          await new Promise((resolve) => {
            state.releaseWrite = resolve;
          });
          if (specification.mode === 'write-hold') return response;
        }
        throw new TypeError('Verification: site response connection lost');
      }
      if (method === 'GET') {
        state.reads++;
        const response = await original(...args);
        state.requests.push({ method, status: response.status });
        if (
          specification.mode === 'read-error' ||
          specification.check === 'error'
        )
          throw new TypeError('Verification: site read connection lost');
        if (
          specification.mode === 'read-hold' ||
          specification.check === 'hold'
        )
          await new Promise((resolve) => {
            state.releaseRead = resolve;
          });
        return response;
      }
      return original(...args);
    };
  }
  let identifier;
  if (reload)
    ({ identifier } = await page.cdp('Page.addScriptToEvaluateOnNewDocument', {
      source: `(${initialize.toString()})(${JSON.stringify(specification)});`,
    }));
  else await page.evaluate(initialize, specification);
  return {
    async observed() {
      return page.evaluate(() => ({
        requests: window.__siteGeneralFault.requests,
        reads: window.__siteGeneralFault.reads,
        writes: window.__siteGeneralFault.writes,
      }));
    },
    async wait(which) {
      await page.waitForFunction(
        (which) => typeof window.__siteGeneralFault?.[which] === 'function',
        which,
      );
    },
    async release(which) {
      await page.evaluate((which) => {
        window.__siteGeneralFault?.[which]?.();
        window.__siteGeneralFault[which] = null;
      }, which);
    },
    async dispose() {
      try {
        if (identifier)
          await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
            identifier,
          });
      } finally {
        await page.evaluate(() => {
          const state = window.__siteGeneralFault;
          if (!state) return;
          state.releaseWrite?.();
          state.releaseRead?.();
          window.fetch = state.original;
          if (state.previous) window.__siteGeneralFault = state.previous;
          else delete window.__siteGeneralFault;
        });
      }
    },
  };
}
