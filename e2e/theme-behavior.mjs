import assert from 'node:assert/strict';
import { identitySql } from './identity-session.mjs';
import { resizeViewport } from './browser-geometry.mjs';
import { uploadSettingsTools } from './upload-settings-helpers.mjs';
import { installBrowserErrors, readBrowserErrors } from './browser-errors.mjs';
import { verifyThemeNavigation } from './theme-navigation.mjs';
import {
  visibleThemeTrigger,
  expectPreference,
  cycleTheme,
  emulateSystem,
  expectTheme,
  chooseTheme,
} from './theme-helpers.mjs';

export async function verifyThemeBehavior(task, page, config, report) {
  const upload = await uploadSettingsTools(page, config, report);
  const original = await identitySql(
    config,
    'SELECT * FROM site_settings WHERE id=1',
  );
  const columns = await identitySql(
    config,
    "SELECT m.name AS table_name,p.name AS column_name FROM sqlite_master m JOIN pragma_table_info(m.name) p WHERE m.type='table' AND lower(p.name) LIKE '%theme%'",
  );
  assert.deepEqual(columns, [], 'SQLite has no theme preference columns');
  await resizeViewport(page, 1440);
  await emulateSystem(page, 'dark');
  await page.evaluate(() => localStorage.removeItem('theme'));
  await page.goto(`${config.origin}/settings/general`);
  await page.waitForSelector(
    '[data-testid="site-general"][data-state="ready"]',
  );
  await expectTheme(page, 'dark');
  await page.snapshot();
  await expectPreference(page, 'system');
  await emulateSystem(page, 'light');
  await expectTheme(page, 'light');
  await expectPreference(page, 'system');
  for (const next of ['light', 'dark', 'system', 'light'])
    assert.equal(
      await cycleTheme(page, true),
      next,
      'Real button cycles light → dark → system → light',
    );
  for (const mode of ['light', 'dark']) {
    await chooseTheme(page, mode, mode);
    await emulateSystem(page, mode === 'light' ? 'dark' : 'light');
    await expectTheme(page, mode, mode);
  }
  await chooseTheme(page, 'system', 'light');
  await emulateSystem(page, 'dark');
  await expectTheme(page, 'dark', 'system');
  report.checks.push(
    'default system, real UI three preferences, live system changes and explicit preference precedence',
  );

  const html = await page.fetch('/settings/general');
  assert.equal(html.status, 200);
  const serverTrigger = await page.evaluate((html) => {
    const root = new DOMParser().parseFromString(html, 'text/html');
    return [...root.querySelectorAll('[data-testid="theme-trigger"]')].map(
      (button) => ({
        disabled: button.hasAttribute('disabled'),
        label: button.getAttribute('aria-label'),
        preference: button.getAttribute('data-theme'),
        text: button.textContent.trim(),
        icon: !!button.querySelector('svg'),
      }),
    );
  }, html.body);
  assert.equal(
    serverTrigger.length,
    2,
    'Server renders the two responsive header locations',
  );
  for (const trigger of serverTrigger)
    assert.deepEqual(
      trigger,
      {
        disabled: true,
        label: '正在读取浏览器偏好',
        preference: null,
        text: '',
        icon: false,
      },
      'Server render disables the icon placeholder without guessing a preference',
    );
  report.checks.push(
    'server-rendered header icon placeholders are disabled and do not guess a selected preference',
  );

  await page.fill('#site-name', 'Issue 197 未保存站点草稿');
  const uploadInputs = await upload.inputs();
  await upload.fill({ maxFileMiB: 37 });
  // The NumberField helper commits with Tab, which focuses the next numeric
  // field. Move focus directly to the real action before Ego can wheel it into
  // view; React Aria intentionally treats a focused number field's wheel as input.
  const trigger = await visibleThemeTrigger(page);
  await page.focus(trigger);
  await page.waitForFunction(
    (selector) => document.activeElement === document.querySelector(selector),
    trigger,
  );
  assert.deepEqual(await upload.inputs(), {
    ...uploadInputs,
    maxFileMiB: '37',
  });
  const draft = await page.evaluate(() => ({
    name: document.querySelector('#site-name').value,
    upload: [
      ...document.querySelectorAll(
        '#upload-limits-form input:not([type="hidden"])',
      ),
    ].map((node) => node.value),
  }));
  // Keyboard activation of the fixed header consumes no wheel input.
  const scroll = await page.evaluate(() => ({
    main: document.querySelector('main').scrollTop,
    window: scrollY,
  }));
  await chooseTheme(page, 'light', 'light', true);
  const preserved = await page.evaluate(() => ({
    name: document.querySelector('#site-name').value,
    upload: [
      ...document.querySelectorAll(
        '#upload-limits-form input:not([type="hidden"])',
      ),
    ].map((node) => node.value),
    main: document.querySelector('main').scrollTop,
    window: scrollY,
  }));
  assert.equal(preserved.name, draft.name);
  assert.deepEqual(preserved.upload, draft.upload);
  assert.equal(preserved.main, scroll.main);
  assert.equal(preserved.window, scroll.window);
  assert.equal(new URL(await page.url()).pathname, '/settings/general');
  assert.equal(
    await page.evaluate(
      () =>
        !!document.querySelector(
          '[role="dialog"][aria-label="放弃未保存的修改?"]',
        ),
    ),
    false,
  );
  report.checks.push(
    'theme changes preserve both independent unsaved forms, current route, scroll and trigger focus',
  );
  // Restore the original fields through their real controls before navigation;
  // the test never persists either form or suppresses its leave guard.
  await page.fill('#site-name', original[0].name);
  await upload.fill(uploadInputs);
  await page.reload();
  await page.waitForSelector(await visibleThemeTrigger(page));
  await expectTheme(page, 'light', 'light');
  await page.goto(`${config.origin}/`);
  await page.waitForSelector('.public-shell');
  assert.equal(
    await page.evaluate(
      () => document.querySelectorAll('[data-testid="theme-trigger"]').length,
    ),
    0,
    'Public pages expose no theme control',
  );
  await expectTheme(page, 'light', 'light');
  report.checks.push(
    'explicit preference survives real reload and navigation from admin to public page',
  );

  const other = await task.newPage();
  await installBrowserErrors(other);
  await other.goto(`${config.origin}/forgot-password`);
  await other.waitForSelector('.public-shell');
  await emulateSystem(other, 'light');
  await expectTheme(other, 'light', 'light');
  await page.snapshot();
  await page.goto(`${config.origin}/library`);
  await page.waitForSelector('[data-testid="library-list"]');
  await chooseTheme(page, 'dark', 'dark');
  await expectTheme(other, 'dark', 'dark');
  await other.goto(`${config.origin}/library`);
  await other.waitForSelector('[data-testid="library-list"]');
  await other.snapshot();
  await chooseTheme(other, 'system', 'light');
  await expectTheme(page, 'dark', 'system');
  await emulateSystem(other, 'dark');
  await expectTheme(other, 'dark', 'system');
  const errors = await readBrowserErrors(other);
  report.browserErrors.push(...errors);
  assert.deepEqual(
    errors,
    [],
    'Cross-tab preference page has no hydration/runtime/resource errors',
  );
  await other.close();
  report.checks.push(
    'two real tabs synchronize preferences both ways while system resolves independently in each tab',
  );
  assert.deepEqual(
    await identitySql(config, 'SELECT * FROM site_settings WHERE id=1'),
    original,
    'Theme interactions do not mutate site settings or their timestamp',
  );
  await verifyThemeNavigation(page, config, report);
}
