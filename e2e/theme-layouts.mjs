import assert from 'node:assert/strict';
import { resizeViewport } from './browser-geometry.mjs';
import {
  settingsTrigger,
  publicTrigger,
  dialog,
  radio,
  emulateSystem,
  expectTheme,
  openTheme,
  chooseTheme,
  closeTheme,
  themeEvidence,
} from './theme-helpers.mjs';

export async function verifyThemeLayouts(page, config, report) {
  for (const width of [1440, 390, 360, 430, 768]) {
    await resizeViewport(page, width);
    await page.goto(`${config.origin}/settings/general`);
    await page.waitForSelector(
      '[data-testid="site-general"][data-state="ready"]',
    );
    await page.snapshot();
    for (const resolved of ['light', 'dark']) {
      await emulateSystem(page, resolved);
      await openTheme(page);
      await chooseTheme(page, resolved, resolved);
      const targets = await page.evaluate(
        (dialog) =>
          [...document.querySelectorAll(`${dialog} input[type="radio"]`)].map(
            (node) => {
              const target = node.closest('label') ?? node;
              const rect = target.getBoundingClientRect();
              return { width: rect.width, height: rect.height };
            },
          ),
        dialog,
      );
      for (const target of targets)
        assert.ok(
          target.width >= 44 && target.height >= 44,
          'Each complete preference row is at least a 44px click target',
        );
      await themeEvidence(
        page,
        config,
        report,
        'settings-dialog',
        width,
        resolved,
      );
      await closeTheme(page);
      await themeEvidence(page, config, report, 'settings', width, resolved);
      if (width === 1440 || width === 390) {
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Tab');
        await page.waitForFunction(
          (selector) =>
            document.querySelector(selector).matches(':focus-visible'),
          settingsTrigger,
        );
        const focus = await page.evaluate((selector) => {
          const style = getComputedStyle(document.querySelector(selector));
          return {
            width: style.outlineWidth,
            style: style.outlineStyle,
            offset: style.outlineOffset,
          };
        }, settingsTrigger);
        assert.deepEqual(focus, {
          width: '2px',
          style: 'solid',
          offset: '-2px',
        });
        await themeEvidence(
          page,
          config,
          report,
          'settings-focused',
          width,
          resolved,
        );
      }
    }
  }
  await resizeViewport(page, 390, 480);
  await openTheme(page, settingsTrigger, true);
  await page.focus(radio('light'));
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(
    (selector) => document.querySelector(selector).checked === true,
    radio('dark'),
  );
  await expectTheme(page, 'dark', 'dark');
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(
    (selector) => document.querySelector(selector).checked === true,
    radio('system'),
  );
  await expectTheme(page, 'dark', 'system');
  for (let index = 0; index < 5; index++) {
    await page.keyboard.press('Tab');
    assert.equal(
      await page.evaluate(
        (dialog) =>
          document.querySelector(dialog).contains(document.activeElement),
        dialog,
      ),
      true,
      'Keyboard focus remains in the appearance dialog',
    );
  }
  await themeEvidence(
    page,
    config,
    report,
    'short-dialog-keyboard',
    390,
    'dark',
    480,
  );
  await closeTheme(page);
  report.checks.push(
    'desktop/mobile/360/430/768 light and dark, 44px preference rows, short viewport, keyboard radio selection, focus containment and Escape restoration',
  );

  for (const width of [1440, 390]) {
    await resizeViewport(page, width);
    await page.goto(`${config.origin}/forgot-password`);
    await page.waitForSelector(publicTrigger);
    await page.snapshot();
    for (const resolved of ['light', 'dark']) {
      await openTheme(page, publicTrigger, true);
      await chooseTheme(page, resolved, resolved);
      await themeEvidence(
        page,
        config,
        report,
        'public-dialog',
        width,
        resolved,
      );
      await closeTheme(page, publicTrigger);
      await themeEvidence(page, config, report, 'public', width, resolved);
    }
  }
}

export async function verifyThemeConsumers(page, config, report, fixture) {
  const routes = [
    '/dashboard',
    '/upload',
    '/library',
    '/albums',
    '/tags',
    '/shares',
    '/trash',
    `/albums/${fixture.albumId}`,
    `/shares/${fixture.albumId}`,
    `/settings/storage/${fixture.storageId}`,
    `/s/${fixture.token}`,
    '/analytics',
    '/settings/storage',
    '/settings/storage/new',
    '/settings/general',
    '/settings/processing',
    '/settings/account',
    '/settings/api',
    '/settings/api/usage',
    '/settings/email',
    '/',
    '/forgot-password',
    '/reset-password',
    '/s/issue197-missing',
  ];
  for (const width of [1440, 390]) {
    await resizeViewport(page, width);
    await page.goto(`${config.origin}/`);
    await page.waitForSelector(publicTrigger);
    for (const resolved of ['light', 'dark']) {
      await openTheme(page, publicTrigger);
      await chooseTheme(page, resolved, resolved);
      await closeTheme(page, publicTrigger);
      for (const route of routes) {
        await page.goto(`${config.origin}${route}`);
        await page.waitForSelector('main');
        await page.waitForLoadState();
        await expectTheme(page, resolved, resolved);
        const structure = await page.evaluate(() => ({
          public: !!document.querySelector('.public-shell'),
          admin: !!document.querySelector('.admin-shell'),
          publicTrigger: document.querySelectorAll(
            '[data-testid="theme-public-trigger"]',
          ).length,
          filteredImages: [...document.querySelectorAll('img')]
            .filter((image) => getComputedStyle(image).filter !== 'none')
            .map((image) => image.getAttribute('alt')),
        }));
        assert.equal(
          structure.public || structure.admin,
          true,
          `${route} uses a shared shell`,
        );
        if (structure.public)
          assert.equal(
            structure.publicTrigger,
            1,
            `${route} reuses one public appearance entry`,
          );
        assert.deepEqual(
          structure.filteredImages,
          [],
          `${route} keeps photos unfiltered`,
        );
        await themeEvidence(
          page,
          config,
          report,
          `consumer-${route === '/' ? 'home' : route.slice(1).replaceAll('/', '-')}`,
          width,
          resolved,
        );
      }
      await page.goto(`${config.origin}/`);
      await page.waitForSelector(publicTrigger);
    }
  }
  // Public login redirects an authenticated owner. End the isolated test session
  // with the real sign-out endpoint before checking the actual anonymous page.
  const signOut = await page.fetch('/api/auth/sign-out', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(signOut.status, 200);
  for (const width of [1440, 390]) {
    await resizeViewport(page, width);
    await page.goto(`${config.origin}/login`);
    await page.waitForSelector('#email');
    await page.snapshot();
    for (const resolved of ['light', 'dark']) {
      await openTheme(page, publicTrigger);
      await chooseTheme(page, resolved, resolved);
      await closeTheme(page, publicTrigger);
      await themeEvidence(
        page,
        config,
        report,
        'consumer-login',
        width,
        resolved,
      );
    }
  }
  report.checks.push(
    'all implemented top-level admin routes, settings categories, new-storage, API usage, public homepage/recovery/invalid-share and anonymous login consume the same light/dark preference',
  );
  report.limitations.push(
    'The matrix covers actual fixture album/share/storage detail pages and populated photo/chart/error/disabled representatives, not every unrelated business state. Initialized fixture redirects /setup; empty-install setup remains covered separately by the existing runtime suite.',
  );
}
