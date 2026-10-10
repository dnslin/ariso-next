import assert from 'node:assert/strict';
import { resizeViewport } from './browser-geometry.mjs';
import {
  visibleThemeTrigger,
  expectThemeEntries,
  expectPreference,
  cycleTheme,
  emulateSystem,
  expectTheme,
  chooseTheme,
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
      await chooseTheme(page, resolved, resolved);
      await expectThemeEntries(page, true);
      await themeEvidence(page, config, report, 'settings', width, resolved);
      await chooseTheme(page, 'system', resolved);
      await themeEvidence(
        page,
        config,
        report,
        'settings-system',
        width,
        resolved,
      );
      await chooseTheme(page, resolved, resolved, true);
      const selector = await visibleThemeTrigger(page);
      await page.focus(selector);
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await page.waitForFunction(
        (selector) =>
          document.querySelector(selector).matches(':focus-visible'),
        selector,
      );
      const focus = await page.evaluate((selector) => {
        const button = document.querySelector(selector);
        const style = getComputedStyle(button);
        const rect = button.getBoundingClientRect();
        const offset = Number.parseFloat(
          style.getPropertyValue('--tw-ring-offset-width'),
        );
        const spread = offset + 2;
        let clipped =
          rect.top < spread ||
          rect.left < spread ||
          rect.bottom + spread > innerHeight ||
          rect.right + spread > innerWidth;
        for (
          let parent = button.parentElement;
          parent;
          parent = parent.parentElement
        ) {
          const ancestorStyle = getComputedStyle(parent);
          const bounds = parent.getBoundingClientRect();
          if (ancestorStyle.overflowX !== 'visible')
            clipped ||=
              rect.left - spread < bounds.left ||
              rect.right + spread > bounds.right;
          if (ancestorStyle.overflowY !== 'visible')
            clipped ||=
              rect.top - spread < bounds.top ||
              rect.bottom + spread > bounds.bottom;
        }
        return { shadow: style.boxShadow, offset, clipped };
      }, selector);
      assert.ok(
        focus.shadow.includes(`0px 0px 0px ${focus.offset + 2}px`),
        'HeroUI renders its real 2px focus ring outside the ring offset',
      );
      assert.equal(
        focus.clipped,
        false,
        'Header focus ring is visible within the viewport and ancestor clipping regions',
      );
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
  await resizeViewport(page, 390, 480);
  await chooseTheme(page, 'light', 'light', true);
  for (const mode of ['dark', 'system', 'light']) {
    assert.equal(await cycleTheme(page, true), mode);
    await expectThemeEntries(page, true);
  }
  await themeEvidence(
    page,
    config,
    report,
    'short-header-keyboard',
    390,
    'light',
    480,
  );
  report.checks.push(
    'desktop/mobile/360/430/768 three icon states, one visible 44px header target, keyboard cycle with retained focus and short viewport',
  );

  for (const width of [1440, 390]) {
    await resizeViewport(page, width);
    for (const resolved of ['light', 'dark']) {
      await page.goto(`${config.origin}/settings/general`);
      await page.waitForSelector(
        '[data-testid="site-general"][data-state="ready"]',
      );
      await chooseTheme(page, resolved, resolved);
      await page.goto(`${config.origin}/forgot-password`);
      await page.waitForSelector('.public-shell');
      await expectTheme(page, resolved, resolved);
      await expectThemeEntries(page, false);
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
    '/settings/general/branding',
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
    for (const resolved of ['light', 'dark']) {
      await emulateSystem(page, resolved);
      await page.goto(`${config.origin}/library`);
      await page.waitForSelector('[data-testid="library-list"]');
      await chooseTheme(page, resolved, resolved);
      for (const route of routes) {
        await page.goto(`${config.origin}${route}`);
        await page.waitForSelector('main');
        await page.waitForLoadState();
        await expectTheme(page, resolved, resolved);
        const structure = await page.evaluate(() => ({
          public: !!document.querySelector('.public-shell'),
          admin: !!document.querySelector('.admin-shell'),
          filteredImages: [...document.querySelectorAll('img')]
            .filter((image) => getComputedStyle(image).filter !== 'none')
            .map((image) => image.getAttribute('alt')),
        }));
        assert.equal(
          structure.public || structure.admin,
          true,
          `${route} uses a shared shell`,
        );
        await expectThemeEntries(page, structure.admin);
        if (structure.admin) await expectPreference(page, resolved);
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
    }
  }
  // Public login redirects an authenticated owner. End the isolated test session
  // with the real sign-out endpoint before checking the actual anonymous page.
  await page.goto(`${config.origin}/library`);
  await page.waitForSelector('[data-testid="library-list"]');
  await chooseTheme(
    page,
    'system',
    await page.evaluate(() =>
      matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    ),
  );
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
      await emulateSystem(page, resolved);
      await expectTheme(page, resolved, 'system');
      await expectThemeEntries(page, false);
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
