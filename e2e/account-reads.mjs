import assert from 'node:assert/strict';
import { identitySql } from './identity-session.mjs';
import { resizeViewport, setTheme } from './browser-geometry.mjs';
import { accountRequest, accountSignIn } from './account-auth.mjs';
import { accountReadFault, accountExpiryFault } from './account-transport.mjs';
import { accountButton as button, createAccountPage } from './account-page.mjs';

async function readError(page, ui, name, width) {
  const fault = await accountReadFault(page, false);
  try {
    await page.reload();
    await page.waitForSelector('[data-testid="account-load-error"]');
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector('[data-testid="account-page"]').dataset.state,
      ),
      'error',
    );
    assert.equal((await fault.result()).status, 200);
    assert.equal(
      await page.evaluate(() =>
        document.querySelector('[data-testid="account-change-email"]'),
      ),
      null,
      'A failed account read does not expose editing from stale shell email',
    );
    await page.waitForSelector(button('重新读取'));
    await ui.geometry(name, width);
  } finally {
    await fault.dispose();
  }
}

export async function verifyAccountReads(page, config, report, credentials) {
  const ui = createAccountPage(page, config, report);
  const widths = config.width ? [config.width] : [1440, 390];
  for (const theme of ['light', 'dark']) {
    await setTheme(page, theme);
    for (const width of widths) {
      await resizeViewport(page, width);
      const fault = await accountReadFault(page, true);
      try {
        await page.reload();
        await page.waitForSelector('[data-testid="account-loading"]');
        assert.equal((await fault.result()).status, 200);
        assert.equal(
          await page.evaluate(() =>
            document.querySelector('[data-testid="account-change-email"]'),
          ),
          null,
          'Account editing waits for the real account read',
        );
        await ui.geometry(`loading-${theme}-${width}`, width);
        await fault.release();
        await page.waitForSelector('[data-testid="account-email"]');
      } finally {
        await fault.dispose();
      }
      await readError(page, ui, `read-error-${theme}-${width}`, width);
      await page.click(button('重新读取'));
      await page.waitForSelector('[data-testid="account-email"]');
      assert.equal(
        (await accountRequest(page, report, width, '/api/account')).payload
          .email,
        credentials.email,
      );
    }
  }
  const width = config.width ?? 1440;
  await resizeViewport(page, width);
  await setTheme(page, 'light');
  await readError(page, ui, 'before-session-expiry', width);
  // Delay the background session read so the explicit account retry delivers
  // its actual 401 before either reader can replace the existing error UI.
  const fault = await accountExpiryFault(page);
  try {
    await identitySql(
      config,
      `UPDATE session SET expires_at=${Date.now() - 1}`,
    );
    await page.click(button('重新读取'));
    await page.waitForSelector(
      '[data-testid="account-page"][data-state="session"]',
    );
    assert.equal((await fault.result()).status, 401);
    await page.waitForFunction(
      () =>
        document.querySelector(
          '[data-testid="account-load-error"] [role="alert"]',
        )?.textContent === '请重新登录后管理账号。',
    );
    for (const theme of ['light', 'dark']) {
      await setTheme(page, theme);
      await ui.geometry(`session-expired-${theme}`, width);
    }
  } finally {
    await fault.dispose();
  }
  await page.click('loc=role:link[name="重新登录"]');
  await page.waitForSelector('#password');
  const login = new URL(await page.url());
  assert.equal(login.pathname, '/login');
  assert.equal(login.searchParams.get('reason'), 'expired');
  assert.equal(login.searchParams.get('returnTo'), '/settings/account');
  await accountSignIn(page, config, report, credentials, width);
  await setTheme(page, 'light');
  report.checks.push(
    'Held real account reads expose loading; lost real read responses expose an explicit retry without stale editing; real expired-session account retry returns 401, shows the session notice and preserves the account destination through credential login.',
  );
}
