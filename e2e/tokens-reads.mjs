import assert from 'node:assert/strict';
import { identitySql } from './identity-session.mjs';
import { resizeViewport, setTheme } from './browser-geometry.mjs';
import {
  createTokensPage,
  tokenControl,
  tokensSignIn,
} from './tokens-page.mjs';
import { tokensReadFault, tokensExpiryFault } from './tokens-transport.mjs';

export async function verifyTokensReads(page, config, report) {
  const ui = createTokensPage(page, config, report);
  for (const theme of ['light', 'dark']) {
    await setTheme(page, theme);
    for (const width of config.width ? [config.width] : [1440, 390]) {
      await resizeViewport(page, width);
      const pending = await tokensReadFault(page, true);
      try {
        await page.reload();
        await page.waitForSelector(
          '[data-testid="api-page"][data-state="loading"]',
        );
        assert.equal((await pending.result()).status, 200);
        assert.equal(
          await page.evaluate(
            () =>
              document.querySelector('[data-testid="api-create-open"]')
                .disabled,
          ),
          true,
          'Loading disables create against unknown existing IDs',
        );
        await ui.geometry(`loading-${theme}`, width);
        await pending.release();
        await page.waitForSelector(
          '[data-testid="api-page"][data-state="ready"]',
        );
      } finally {
        await pending.dispose();
      }
      const lost = await tokensReadFault(page, false);
      try {
        await page.reload();
        await page.waitForSelector(
          '[data-testid="api-page"][data-state="error"]',
        );
        assert.equal((await lost.result()).status, 200);
        assert.equal(
          await page.evaluate(() =>
            document.querySelector('[data-testid="api-list"]'),
          ),
          null,
          'Failed reads never masquerade as an empty or stale list',
        );
        await ui.geometry(`read-error-${theme}`, width);
      } finally {
        await lost.dispose();
      }
      await page.click(tokenControl('load-retry'));
      await page.waitForSelector(
        '[data-testid="api-page"][data-state="ready"]',
      );
    }
  }
  await setTheme(page, 'light');
  report.checks.push(
    'Held actual GET responses show loading; dropped actual list responses show a read error and retry; failed reads expose no stale management actions or false empty state.',
  );
}

export async function verifyTokensSessionExpiry(
  page,
  config,
  report,
  registerSecret,
) {
  const ui = createTokensPage(page, config, report);
  const width = config.width ?? 1440;
  await resizeViewport(page, width);
  const snapshot = await ui.openCreate('会话失效清理明文');
  await page.click(tokenControl('create-submit'));
  const key = await ui.secret();
  registerSecret(key);
  const fault = await tokensExpiryFault(page);
  try {
    await identitySql(
      config,
      `UPDATE session SET expires_at=${Date.now() - 1}`,
    );
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await fault.release();
    await page.waitForFunction(
      () =>
        location.pathname === '/login' ||
        document.querySelector('[data-testid="api-page"]')?.dataset.state ===
          'session',
    );
    assert.equal(
      await page.evaluate(() =>
        document.querySelector('[data-testid="api-secret"]'),
      ),
      null,
      'Real session expiry discards the once-only key immediately',
    );
    const state = new URL(await page.url());
    if (state.pathname === '/login') {
      assert.equal(state.searchParams.get('returnTo'), '/settings/api');
      assert.equal(state.searchParams.get('reason'), 'expired');
    } else {
      await ui.stateGeometry('session-expired', width);
      await page.click('loc=role:link[name="重新登录"]');
      await page.waitForSelector('#password');
      assert.equal(
        new URL(await page.url()).searchParams.get('returnTo'),
        '/settings/api',
      );
    }
  } finally {
    await fault.dispose();
  }
  // Reuse the delivered real login flow, then return to the API destination.
  await tokensSignIn(page, config, report, width);
  assert.equal(
    await page.evaluate(() =>
      document.querySelector('[data-testid="api-secret"]'),
    ),
    null,
    'Signing back in never reconstructs the key',
  );
  assert.equal(snapshot.url, `${config.origin}/settings/api`);
  report.checks.push(
    'An actual expired Cookie session clears an open key modal and reaches real credential login; signing back in has no way to recover the full key.',
  );
}
