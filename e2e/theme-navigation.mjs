import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { identitySql } from './identity-session.mjs';
import { resizeViewport } from './browser-geometry.mjs';
import {
  settingsTrigger,
  openTheme,
  chooseTheme,
  closeTheme,
} from './theme-helpers.mjs';

const search = 'input[aria-label="搜索标签名称"]';

async function settledTags(page) {
  await page.waitForFunction(
    () =>
      document.querySelector('#tags-title') &&
      document.querySelector(
        '[data-testid="tags-list"],[data-testid="tags-empty"],[data-testid="tags-error"]',
      ) &&
      !document.querySelector('[data-testid="tags-loading"]'),
  );
}

async function beginTrace(page) {
  await page.evaluate(() => {
    const trace = { states: [], frames: 0, mutations: 0 };
    const visible = (node) => {
      if (!node || !node.getClientRects().length) return false;
      const style = getComputedStyle(node);
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0'
      );
    };
    let previous;
    const sample = (source) => {
      const title = document.querySelector('#tags-title');
      const header = title?.parentElement.parentElement;
      const state = {
        path: location.pathname,
        admin: visible(document.querySelector('.admin-shell')),
        public: visible(document.querySelector('.public-shell')),
        publicEntry: visible(
          document.querySelector('[data-testid="theme-public-trigger"]'),
        ),
        headerCreate: [...(header?.querySelectorAll('button') ?? [])].some(
          (button) =>
            visible(button) && button.textContent.trim() === '新建标签',
        ),
        pending: !!document.querySelector('[data-testid="tags-loading"]'),
        error: !!document.querySelector('[data-testid="tags-error"]'),
        theme: document.documentElement.classList.contains('dark')
          ? 'dark'
          : 'light',
      };
      const signature = JSON.stringify(state);
      if (signature !== previous) {
        trace.states.push({ at: performance.now(), source, ...state });
        previous = signature;
      }
    };
    const observer = new MutationObserver(() => {
      trace.mutations++;
      sample('mutation');
    });
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
    });
    let frame;
    const tick = () => {
      trace.frames++;
      sample('frame');
      frame = requestAnimationFrame(tick);
    };
    sample('start');
    frame = requestAnimationFrame(tick);
    window.__themeNavigation = {
      trace,
      stop() {
        observer.disconnect();
        cancelAnimationFrame(frame);
        sample('finish');
        delete window.__themeNavigation;
        return trace;
      },
    };
  });
}

async function endTrace(page, report, details, empty) {
  await page.waitForFunction(async () => {
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    return true;
  });
  const trace = await page.evaluate(() => window.__themeNavigation.stop());
  report.navigation.transitions.push({ ...details, ...trace });
  assert.ok(trace.frames > 0, 'Soft navigation is observed in rendered frames');
  for (const state of trace.states) {
    assert.equal(
      state.admin,
      true,
      `Management shell remains visible: ${JSON.stringify(state)}`,
    );
    assert.equal(
      state.public || state.publicEntry,
      false,
      'Management navigation never exposes a public page or theme entry',
    );
    assert.equal(
      state.theme,
      details.theme,
      'Soft navigation retains the selected theme',
    );
    if (empty)
      assert.equal(
        state.headerCreate,
        false,
        'A zero-tag page never flashes a header creation action',
      );
    if (state.pending || state.error)
      assert.equal(
        state.headerCreate,
        false,
        'Pending or failed tag reads do not expose a header creation action',
      );
  }
}

async function clickNavigation(page, width, path, waitForData = true) {
  let navigation = '.shell-navigation nav';
  if (width < 1200) {
    await page.click('button[aria-label="菜单"]');
    await page.waitForSelector('[role="dialog"][aria-label="导航菜单"]');
    navigation = '[role="dialog"][aria-label="导航菜单"] nav';
  }
  await page.click(`${navigation} a[href="${path}"]`);
  await page.waitForFunction((path) => location.pathname === path, path);
  if (width < 1200)
    await page.waitForSelector('[role="dialog"][aria-label="导航菜单"]', {
      state: 'hidden',
    });
  if (path === '/tags' && waitForData) await settledTags(page);
  else if (path === '/tags') await page.waitForSelector('#tags-title');
  else
    await page.waitForSelector(
      '[data-testid="site-general"][data-state="ready"]',
    );
}

async function screenshot(page, config, report, state, width, theme) {
  const path = join(
    config.output,
    `theme-navigation-${state}-${theme}-${width}.png`,
  );
  await page.screenshot({ path });
  report.navigation.screenshots.push({ state, width, theme, path });
}

async function emptyNavigation(page, config, report) {
  for (const width of [1440, 390]) {
    await resizeViewport(page, width);
    for (const theme of ['light', 'dark']) {
      await page.cdp('Emulation.setEmulatedMedia', {
        features: [
          { name: 'prefers-color-scheme', value: theme },
          { name: 'prefers-reduced-motion', value: 'no-preference' },
        ],
      });
      await page.goto(`${config.origin}/settings/general`);
      await page.waitForSelector(
        '[data-testid="site-general"][data-state="ready"]',
      );
      await page.snapshot();
      await openTheme(page, settingsTrigger, true);
      await chooseTheme(page, theme, theme);
      await closeTheme(page);
      for (const [visit, path] of [
        ['enter', '/tags'],
        ['return', '/settings/general'],
        ['reenter', '/tags'],
        ['repeat', '/tags'],
      ]) {
        if (visit === 'enter')
          await page.evaluate(() => {
            const original = window.fetch;
            window.fetch = async (...args) => {
              const response = await original(...args);
              if (
                new URL(String(args[0]), location.href).pathname ===
                  '/api/tags' &&
                (args[1]?.method ?? 'GET') === 'GET'
              ) {
                await new Promise((resolve) => {
                  window.__themeTagRelease = resolve;
                });
                window.fetch = original;
                delete window.__themeTagRelease;
              }
              return response;
            };
          });
        await beginTrace(page);
        await clickNavigation(page, width, path, visit !== 'enter');
        if (visit === 'enter') {
          await page.waitForFunction(
            () =>
              !!document.querySelector('[data-testid="tags-loading"]') &&
              typeof window.__themeTagRelease === 'function',
          );
          await screenshot(page, config, report, 'empty-pending', width, theme);
          await page.evaluate(() => window.__themeTagRelease());
          await settledTags(page);
          await screenshot(page, config, report, 'empty-ready', width, theme);
        }
        if (path === '/tags')
          assert.equal(
            await page.evaluate(() =>
              document
                .querySelector('[data-testid="tags-empty"]')
                ?.textContent.includes('还没有标签'),
            ),
            true,
          );
        await endTrace(
          page,
          report,
          { width, theme, visit, path, fixture: 'empty' },
          true,
        );
      }
    }
  }
}

export async function verifyThemeNavigation(page, config, report) {
  assert.equal(
    new URL(await page.url()).origin,
    new URL(config.origin).origin,
    'Navigation fixture stays on the runner-owned origin',
  );
  const response = await page.fetch('/api/tags');
  assert.equal(response.status, 200);
  const initial = JSON.parse(response.body);
  report.navigation = {
    precondition: {
      origin: config.origin,
      initialTagCount: initial.total,
      requiresZeroTags: true,
      reducedMotion: 'no-preference',
    },
    transitions: [],
    search: [],
    screenshots: [],
  };
  assert.equal(
    initial.total,
    0,
    'Theme navigation empty-state fixture requires zero actual tags; existing tags are preserved and must be handled by the runner fixture owner',
  );
  await emptyNavigation(page, config, report);

  const name = `主题导航 ${randomUUID()}`;
  const created = await page.fetch('/api/tags', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  assert.equal(created.status, 201);
  const result = JSON.parse(created.body);
  assert.equal(result.reused, false);
  const id = result.tag.id;
  report.navigation.fixtureTagId = id;
  try {
    for (const width of [1440, 390]) {
      await resizeViewport(page, width);
      for (const theme of ['light', 'dark']) {
        await page.goto(`${config.origin}/settings/general`);
        await page.waitForSelector(settingsTrigger);
        await openTheme(page, settingsTrigger, true);
        await chooseTheme(page, theme, theme);
        await closeTheme(page);
        await beginTrace(page);
        await clickNavigation(page, width, '/tags');
        await page.waitForFunction(
          (id) =>
            [...document.querySelectorAll(`[data-testid="tag-${id}"]`)].some(
              (node) =>
                node.checkVisibility({
                  checkOpacity: true,
                  checkVisibilityCSS: true,
                }),
            ),
          id,
        );
        await screenshot(page, config, report, 'populated', width, theme);
        await endTrace(
          page,
          report,
          { width, theme, visit: 'enter', path: '/tags', fixture: 'populated' },
          false,
        );
        await page.focus(search);
        await beginTrace(page);
        let typed = '';
        for (const character of '主题导航') {
          typed += character;
          await page.keyboard.type(character);
          await page.waitForFunction(
            (value) => new URL(location.href).searchParams.get('q') === value,
            typed,
          );
          const state = await page.evaluate(
            (selector) => ({
              value: document.querySelector(selector)?.value,
              focused:
                document.activeElement === document.querySelector(selector),
            }),
            search,
          );
          report.navigation.search.push({ width, theme, ...state });
          assert.equal(
            state.focused,
            true,
            'Each typed search character preserves focus',
          );
          assert.equal(
            state.value,
            typed,
            'Each character is retained in the real search control',
          );
        }
        await settledTags(page);
        assert.equal(
          await page.evaluate(
            (selector) => document.querySelector(selector).value,
            search,
          ),
          '主题导航',
        );
        await page.keyboard.press('ControlOrMeta+A');
        await page.keyboard.press('Backspace');
        await settledTags(page);
        assert.equal(
          await page.evaluate(
            (selector) =>
              document.activeElement === document.querySelector(selector) &&
              document.querySelector(selector).value === '' &&
              !new URL(location.href).searchParams.has('q'),
            search,
          ),
          true,
          'Clearing search preserves focus and removes the query',
        );
        await page.keyboard.press('Tab');
        assert.equal(
          await page.evaluate(
            (selector) =>
              document.activeElement === document.querySelector(selector),
            search,
          ),
          false,
          'Real Tab leaves the search field',
        );
        await endTrace(
          page,
          report,
          {
            width,
            theme,
            visit: 'search-clear-blur',
            path: '/tags',
            fixture: 'populated',
          },
          false,
        );

        await clickNavigation(page, width, '/settings/general');
        await page.evaluate(() => {
          const original = window.fetch;
          window.__themeTagReadRestore = () => {
            window.fetch = original;
            delete window.__themeTagReadRestore;
          };
          window.fetch = async (...args) => {
            const url = new URL(String(args[0]), location.href);
            const response = await original(...args);
            if (
              url.pathname === '/api/tags' &&
              (args[1]?.method ?? 'GET') === 'GET'
            )
              throw new TypeError('Verification: real tag list response lost');
            return response;
          };
        });
        await beginTrace(page);
        await clickNavigation(page, width, '/tags');
        await page.waitForSelector('[data-testid="tags-error"]');
        assert.equal(
          await page.evaluate(
            () => !!document.querySelector('[data-testid="tags-empty"]'),
          ),
          false,
        );
        await page.evaluate(() => window.__themeTagReadRestore());
        await page.click('loc=role:button[name="重新加载"]');
        await page.waitForFunction(
          (id) =>
            [...document.querySelectorAll(`[data-testid="tag-${id}"]`)].some(
              (node) =>
                node.checkVisibility({
                  checkOpacity: true,
                  checkVisibilityCSS: true,
                }),
            ),
          id,
        );
        await page.waitForSelector('[data-testid="tags-error"]', {
          state: 'hidden',
        });
        await endTrace(
          page,
          report,
          {
            width,
            theme,
            visit: 'error-real-retry',
            path: '/tags',
            fixture: 'populated',
          },
          false,
        );
      }
    }
  } finally {
    // Cleanup never operates the browser, including after a hard stop.
    await identitySql(
      config,
      `DELETE FROM tags WHERE id='${id.replaceAll("'", "''")}'`,
    );
    report.navigation.cleanup = 'Offline deleted own fixture tag';
  }
}
