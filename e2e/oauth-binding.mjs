import assert from 'node:assert/strict';
import { identitySql } from './identity-session.mjs';
import { accountRequest, accountSignIn } from './account-auth.mjs';
import { oauthFault } from './oauth-transport.mjs';
import { unlinkDialog } from './oauth-page.mjs';
import { resizeViewport, setTheme } from './browser-geometry.mjs';

export async function seedUIBinding(config) {
  assert.deepEqual(
    await identitySql(
      config,
      "SELECT id FROM account WHERE provider_id='github'",
    ),
    [],
    'Only the disposable UI fixture receives a temporary binding',
  );
  const now = Date.now();
  await identitySql(
    config,
    `INSERT INTO account(id,account_id,provider_id,user_id,github_login,created_at,updated_at) SELECT 'oauth-ui-fixture','181-ui','github',id,'browser-oauth-owner',${now},${now} FROM user`,
  );
}

export async function assertCredentialPreserved(config) {
  const rows = await identitySql(
    config,
    "SELECT provider_id AS provider, password IS NOT NULL AS hasPassword FROM account WHERE provider_id='credential'",
  );
  assert.deepEqual(
    rows,
    [{ provider: 'credential', hasPassword: 1 }],
    'GitHub actions retain the one actual credential account',
  );
}

export async function verifyLoginVisibility(page, config, report, enabled) {
  const logout = await accountRequest(
    page,
    report,
    config.width,
    '/api/auth/sign-out',
    'POST',
    {},
  );
  assert.equal(logout.status, 200);
  await page.goto(`${config.origin}/login`);
  await page.waitForSelector('#password');
  await page.waitForFunction(
    (expected) =>
      !!document.querySelector('[data-testid="login-github"]') === expected,
    enabled,
  );
  report.checks.push(
    `Anonymous GitHub login entry follows actual effective configuration (${enabled ? 'enabled' : 'disabled'}). No external authorization is attempted with fixture credentials.`,
  );
  await accountSignIn(page, config, report, config.credentials, config.width);
}

async function openUnlink(page) {
  await page.focus('[data-testid="account-github-unlink"]');
  await page.keyboard.press('Enter');
  await page.waitForSelector(unlinkDialog);
}

async function closeUnlink(page) {
  await page.keyboard.press('Escape');
  await page.waitForSelector(unlinkDialog, { state: 'hidden' });
  await page.waitForFunction(
    () =>
      document.activeElement ===
      document.querySelector('[data-testid="account-github-unlink"]'),
  );
}

async function verifyClosedUnlinkUnknown(page, config, report, ui, committed) {
  await openUnlink(page);
  const sourceScroll = await ui.scroll();
  const fault = await oauthFault(page, {
    path: '/api/account/github',
    method: 'DELETE',
    reject: !committed,
    lose: committed,
    failReconcile: true,
  });
  try {
    await page.click('[data-testid="account-github-unlink-confirm"]');
    const response = await fault.result();
    if (committed)
      assert.equal(
        response.status,
        200,
        'Closed unknown unlink follows a real committed DELETE',
      );
    else
      assert.deepEqual(
        await identitySql(
          config,
          "SELECT account_id AS accountId FROM account WHERE provider_id='github'",
        ),
        [{ accountId: '181-ui' }],
        'The rejected delivery did not send a DELETE or alter the seeded relation',
      );
    await page.waitForSelector(`${unlinkDialog}[data-state="unknown"]`);
    await page.keyboard.press('Escape');
    await page.waitForSelector(unlinkDialog, { state: 'hidden' });
    await page.waitForSelector(
      '[data-testid="account-github"][data-state="unknown"]',
    );
    await page.waitForFunction(
      () =>
        document.activeElement ===
        document.querySelector('[data-testid="account-github-reload"]'),
    );
    assert.deepEqual(
      await ui.scroll(),
      sourceScroll,
      'Closing unknown unlink preserves source scrolling',
    );
    assert.equal(
      await page.evaluate(() => {
        const summary = document.querySelector(
          '[data-testid="account-github"]',
        );
        return (
          document.querySelector('[data-testid="account-github-unlink"]')
            .disabled &&
          (document.querySelector('[data-testid="account-github-link"]')
            ?.disabled ??
            true) &&
          summary.textContent.includes('待核对') &&
          summary.textContent.includes('上次读取')
        );
      }),
      true,
      'The main binding section retains unknown and prevents reopening or starting another binding mutation',
    );
    const previousReads = await page.evaluate(
      () => window.__oauthFault.observed.reads,
    );
    await page.click('[data-testid="account-github-reload"]');
    await page.waitForFunction(
      (previous) =>
        window.__oauthFault.observed.reads > previous &&
        window.__oauthFault.observed.readStatus === 200,
      previousReads,
    );
    await page.waitForSelector(
      '[data-testid="account-github"][data-state="unknown"]',
    );
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector('[data-testid="account-github-unlink"]')
            .disabled,
      ),
      true,
      'Failed main-page readback keeps repeat DELETE unavailable',
    );
    assert.equal(
      (await fault.result()).requests,
      1,
      'Closing and failed reconciliation attempt only the original DELETE, including after the one-shot fault is consumed',
    );
    await ui.geometry(
      `unlink-unknown-closed-${committed ? 'committed' : 'not-sent'}-light`,
    );
    await setTheme(page, 'dark');
    await ui.geometry(
      `unlink-unknown-closed-${committed ? 'committed' : 'not-sent'}-dark`,
    );
    await setTheme(page, 'light');
  } finally {
    await fault.dispose();
  }
  await page.click('[data-testid="account-github-reload"]');
  await page.waitForSelector(
    `[data-testid="account-github"][data-state="${committed ? 'unbound' : 'bound'}"]`,
  );
  assert.deepEqual(
    (await accountRequest(page, report, config.width, '/api/account/github'))
      .payload.binding,
    committed ? null : { accountId: '181-ui', login: 'browser-oauth-owner' },
    'Recovery reflects the actual surviving or deleted relation',
  );
  assert.equal(
    await page.evaluate(
      () => !!document.querySelector('[data-testid="github-unlink"]'),
    ),
    false,
    'Main-page recovery does not reopen an old confirmation dialog',
  );
  if (!committed) {
    await openUnlink(page);
    await page.waitForSelector(`${unlinkDialog}[data-state="editing"]`);
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector(
            '[data-testid="account-github-unlink-confirm"]',
          ).disabled,
      ),
      false,
      'Only confirmed surviving binding permits a new deliberate unlink',
    );
    await closeUnlink(page);
  }
  await assertCredentialPreserved(config);
  report.checks.push(
    `Closing ${committed ? 'committed' : 'unsent'} unknown unlink preserves the main unresolved marker and blocks repeat DELETE through failed real readbacks; successful GET restores the actual ${committed ? 'unbound' : 'bound'} state without reopening stale confirmation.`,
  );
}

export async function verifyGithubBinding(page, config, report, ui) {
  const binding = await accountRequest(
    page,
    report,
    config.width,
    '/api/account/github',
  );
  assert.equal(binding.status, 200);
  assert.deepEqual(binding.payload.binding, {
    accountId: '181-ui',
    login: 'browser-oauth-owner',
  });
  await page.waitForFunction(() =>
    document
      .querySelector('[data-testid="account-github-login"]')
      ?.textContent.includes('browser-oauth-owner'),
  );
  await ui.layouts('bound');
  const widths =
    config.width === 1440
      ? [1440]
      : config.width === 390
        ? [360, 390, 430, 768]
        : [1440, 360, 390, 430, 768];
  for (const theme of ['light', 'dark']) {
    await setTheme(page, theme);
    for (const width of widths) {
      await resizeViewport(page, width);
      await openUnlink(page);
      await ui.geometry(`unlink-confirmation-${theme}`, width);
      await page.focus('[data-testid="account-github-unlink-confirm"]');
      await page.keyboard.press('Tab');
      assert.equal(
        await page.evaluate(
          (selector) => !!document.activeElement?.closest(selector),
          unlinkDialog,
        ),
        true,
        'GitHub unlink confirmation traps focus',
      );
      await closeUnlink(page);
    }
    if (widths.includes(390)) {
      await resizeViewport(page, 390, 400);
      await openUnlink(page);
      await page.focus('[data-testid="account-github-unlink-confirm"]');
      await page.evaluate(() =>
        document.activeElement.scrollIntoView({ block: 'center' }),
      );
      assert.equal(
        await page.evaluate(() => {
          const rect = document.activeElement.getBoundingClientRect();
          return rect.top >= 0 && rect.bottom <= innerHeight;
        }),
        true,
        'Short viewport keeps the unlink confirmation reachable',
      );
      await ui.geometry(`unlink-short-${theme}`, 390);
      await closeUnlink(page);
    }
  }
  await resizeViewport(page, config.width ?? 1440);
  await setTheme(page, 'light');

  await identitySql(
    config,
    "CREATE TRIGGER reject_oauth_browser_unlink BEFORE DELETE ON account WHEN OLD.provider_id='github' BEGIN SELECT RAISE(ABORT, 'injected GitHub unlink failure'); END",
  );
  try {
    await openUnlink(page);
    await page.click('[data-testid="account-github-unlink-confirm"]');
    await page.waitForFunction(
      (root) => document.querySelector(root)?.textContent.includes('HTTP 500'),
      unlinkDialog,
    );
    assert.deepEqual(
      (await accountRequest(page, report, config.width, '/api/account/github'))
        .payload.binding,
      binding.payload.binding,
    );
    await ui.geometry('unlink-real-server-error');
    await closeUnlink(page);
  } finally {
    await identitySql(config, 'DROP TRIGGER reject_oauth_browser_unlink');
  }

  // No request was sent; an unavailable readback must never offer a blind retry.
  await openUnlink(page);
  const rejected = await oauthFault(page, {
    path: '/api/account/github',
    method: 'DELETE',
    reject: true,
    failReconcile: true,
  });
  try {
    await page.click('[data-testid="account-github-unlink-confirm"]');
    await rejected.result();
    await page.waitForSelector(`${unlinkDialog}[data-state="unknown"]`);
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector(
            '[data-testid="account-github-unlink-confirm"]',
          )?.disabled ?? true,
      ),
      true,
    );
    await page.click('[data-testid="account-github-reload"]');
    await page.waitForFunction(() => window.__oauthFault.observed.reads > 0);
    await page.waitForSelector(`${unlinkDialog}[data-state="unknown"]`);
    await ui.geometry('unlink-unknown-not-sent');
    assert.equal((await rejected.result()).requests, 1);
  } finally {
    await rejected.dispose();
  }
  await page.click('[data-testid="account-github-reload"]');
  await page.waitForSelector(`${unlinkDialog}[data-state="editing"]`);
  await page.waitForFunction(
    (root) => document.querySelector(root).textContent.includes('尚未解除'),
    unlinkDialog,
  );
  await closeUnlink(page);

  await verifyClosedUnlinkUnknown(page, config, report, ui, false);
  await openUnlink(page);
  const committed = await oauthFault(page, {
    path: '/api/account/github',
    method: 'DELETE',
    hold: true,
    lose: true,
    failReconcile: true,
  });
  try {
    await page.click('[data-testid="account-github-unlink-confirm"]');
    assert.equal((await committed.result()).status, 200);
    await page.waitForSelector(`${unlinkDialog}[data-state="saving"]`);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    assert.equal(
      (await committed.result()).requests,
      1,
      'Pending unlink never performs a second DELETE',
    );
    await ui.geometry('unlink-pending-light');
    await setTheme(page, 'dark');
    await ui.geometry('unlink-pending-dark');
    await setTheme(page, 'light');
    await committed.release();
    await page.waitForSelector(`${unlinkDialog}[data-state="unknown"]`);
    await ui.geometry('unlink-unknown-committed');
  } finally {
    await committed.dispose();
  }
  await page.click('[data-testid="account-github-reload"]');
  await page.waitForSelector(unlinkDialog, { state: 'hidden' });
  await page.waitForSelector(
    '[data-testid="account-github"][data-state="unbound"]',
  );
  assert.equal(new URL(await page.url()).pathname, '/settings/account');
  await assertCredentialPreserved(config);
  assert.deepEqual(
    (await accountRequest(page, report, config.width, '/api/account/github'))
      .payload,
    { binding: null },
  );

  // A second UI-only seed covers closing after a committed DELETE, as well as
  // the existing in-modal reconciliation. It is removed by the real endpoint.
  await seedUIBinding(config);
  await page.reload();
  await ui.ready();
  await verifyClosedUnlinkUnknown(page, config, report, ui, true);

  // Exercise the real production link endpoint without navigating to GitHub.
  const link = await accountRequest(
    page,
    report,
    config.width,
    '/api/account/github/link',
    'POST',
  );
  assert.equal(link.status, 200);
  const url = new URL(link.payload.url);
  assert.equal(url.origin, 'https://github.com');
  assert.equal(url.pathname, '/login/oauth/authorize');
  assert.equal(url.searchParams.get('client_id'), 'browser-oauth-final');
  assert.equal(
    url.searchParams.get('redirect_uri'),
    `${config.origin}/api/auth/callback/github`,
  );
  assert.ok(url.searchParams.get('state'));
  await ui.layouts('unbound-enabled');
  report.checks.push(
    'Seeded UI-only GitHub relation renders username and survives process configuration changes; real failed DELETE retains it; unsent DELETE plus unavailable readback stays unknown; committed DELETE plus lost response reconciles to unbound; credential is preserved; production link generates fixed GitHub authorization/state without contacting external GitHub.',
  );
}
