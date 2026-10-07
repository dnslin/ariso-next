import assert from 'node:assert/strict';
import { identitySql } from './identity-session.mjs';
import { accountRequest } from './account-auth.mjs';
import { oauthFault } from './oauth-transport.mjs';
import { oauthDialog } from './oauth-page.mjs';
import { setTheme } from './browser-geometry.mjs';

export async function readOAuthSettings(page, config, report) {
  const response = await accountRequest(
    page,
    report,
    config.width,
    '/api/settings/github',
  );
  assert.equal(response.status, 200);
  return response.payload;
}

async function persistedSecret(config) {
  const [row] = await identitySql(
    config,
    'SELECT client_secret_encrypted AS secret FROM identity_github_settings WHERE id=1',
  );
  return row?.secret ?? null;
}

export async function saveOAuthDraft(page, ui, { clientId, secret, enabled }) {
  await ui.open();
  await ui.fill(clientId, secret);
  await ui.enabled(enabled);
  await page.click('[data-testid="oauth-save"]');
  await ui.saved();
}

async function verifyClosedSettingsUnknown(page, config, report, ui, secret) {
  await ui.open();
  await ui.fill('browser-oauth-final', secret);
  const sourceScroll = await ui.scroll();
  const fault = await oauthFault(page, {
    path: '/api/settings/github',
    method: 'PATCH',
    lose: true,
    failReconcile: true,
  });
  try {
    await page.click('[data-testid="oauth-save"]');
    assert.equal(
      (await fault.result()).status,
      200,
      'The closed unknown editor follows a real committed PATCH',
    );
    await page.waitForSelector(`${oauthDialog}[data-state="unknown"]`);
    report.stage = 'closed-configuration-unknown';
    await page.waitForFunction(
      () =>
        document.activeElement ===
        document.querySelector('[data-testid="oauth-reload"]'),
    );
    await page.keyboard.press('Escape');
    await page.waitForSelector(oauthDialog, { state: 'detached' });
    await page.waitForSelector(
      '[data-testid="oauth-settings"][data-state="unknown"]',
    );
    await page.waitForFunction(
      () =>
        document.activeElement ===
        document.querySelector('[data-testid="oauth-settings-reload"]'),
    );
    assert.deepEqual(
      await ui.scroll(),
      sourceScroll,
      'Closing an unknown editor preserves source scrolling',
    );
    assert.equal(
      await page.evaluate((secret) => {
        const summary = document.querySelector(
          '[data-testid="oauth-settings"]',
        );
        return (
          document.querySelector('[data-testid="account-github-config"]') ===
            null &&
          !document.querySelector('#oauth-client-secret') &&
          !summary.textContent.includes(secret) &&
          summary.textContent.includes('待核对') &&
          summary.textContent.includes('上次读取')
        );
      }, secret),
      true,
      'Unknown persists outside the editor; the Secret draft is discarded and configuration cannot reopen for another PATCH',
    );
    const previousReads = await page.evaluate(
      () => window.__oauthFault.observed.reads,
    );
    await page.click('[data-testid="oauth-settings-reload"]');
    await page.waitForFunction(
      (previous) =>
        window.__oauthFault.observed.reads > previous &&
        window.__oauthFault.observed.readStatus === 200,
      previousReads,
    );
    await page.waitForSelector(
      '[data-testid="oauth-settings"][data-state="unknown"]',
    );
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector('[data-testid="account-github-config"]') ===
          null,
      ),
      true,
      'A failed real main-page read keeps the configuration mutation action absent',
    );
    assert.equal(
      (await fault.result()).requests,
      1,
      'Closing and failed reconciliation attempt only the original PATCH, including after the one-shot fault is consumed',
    );
    await ui.geometry('configuration-unknown-closed-light');
    await setTheme(page, 'dark');
    await ui.geometry('configuration-unknown-closed-dark');
    await setTheme(page, 'light');
  } finally {
    await fault.dispose();
  }
  await page.click('[data-testid="oauth-settings-reload"]');
  await page.waitForSelector(
    '[data-testid="oauth-settings"][data-state="ready"]',
  );
  await page.waitForFunction(
    () =>
      !document.querySelector('[data-testid="account-github-config"]').disabled,
  );
  await ui.open();
  await page.waitForSelector(`${oauthDialog}[data-state="editing"]`);
  assert.deepEqual(
    await page.evaluate(() => ({
      clientId: document.querySelector('#oauth-client-id').value,
      secret: document.querySelector('#oauth-client-secret').value,
      canSave: !document.querySelector('[data-testid="oauth-save"]').disabled,
    })),
    { clientId: 'browser-oauth-final', secret: '', canSave: true },
    'A successful main-page GET restores editing from actual saved values with an empty Secret field',
  );
  await ui.close();
  assert.deepEqual((await readOAuthSettings(page, config, report)).saved, {
    enabled: false,
    clientId: 'browser-oauth-final',
    hasSecret: true,
  });
  report.checks.push(
    'Closing unknown configuration discards its Secret draft while retaining only the unresolved-operation marker on the main section; failed real readback blocks reopening and repeat PATCH; successful main readback restores editing from actual values with an empty Secret.',
  );
}

export async function verifyOAuthSettings(page, config, report, ui, secrets) {
  const initial = await readOAuthSettings(page, config, report);
  assert.deepEqual(initial.saved, {
    enabled: false,
    clientId: '',
    hasSecret: false,
  });
  assert.deepEqual(initial.effective, initial.saved);
  assert.equal(initial.pendingRestart, false);

  await ui.open();
  await ui.enabled(true);
  await page.click('[data-testid="oauth-save"]');
  await page.waitForSelector('#oauth-client-id[aria-invalid="true"]');
  await page.waitForFunction(
    () => document.activeElement?.id === 'oauth-client-id',
  );
  await ui.geometry('required-configuration');
  await ui.close();

  await saveOAuthDraft(page, ui, {
    enabled: false,
    clientId: 'browser-oauth-initial',
    secret: secrets.first,
  });
  let state = await readOAuthSettings(page, config, report);
  assert.deepEqual(state.saved, {
    enabled: false,
    clientId: 'browser-oauth-initial',
    hasSecret: true,
  });
  assert.deepEqual(state.effective, initial.effective);
  assert.equal(state.pendingRestart, true);
  const firstCiphertext = await persistedSecret(config);
  assert.ok(
    firstCiphertext && firstCiphertext !== secrets.first,
    'The persisted Secret is encrypted, not plaintext',
  );

  await ui.open();
  assert.equal(
    await page.evaluate(
      () => document.querySelector('#oauth-client-secret').value,
    ),
    '',
    'Readback never puts a saved Secret or mask into an editable value',
  );
  await ui.fill('browser-oauth-keep', '');
  const keep = await oauthFault(page, {
    path: '/api/settings/github',
    method: 'PATCH',
    hold: true,
  });
  try {
    const sourceScroll = await ui.scroll();
    await page.click('[data-testid="oauth-save"]');
    assert.equal((await keep.result()).status, 200);
    await page.waitForSelector(`${oauthDialog}[data-state="saving"]`);
    assert.equal(
      await page.evaluate(
        (root) =>
          [
            ...document
              .querySelector(root)
              .querySelectorAll('form input,form button'),
          ].every((node) => node.matches(':disabled')),
        oauthDialog,
      ),
      true,
      'Pending save disables form controls',
    );
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    assert.equal(
      (await keep.result()).requests,
      1,
      'Pending keys never submit a second settings write',
    );
    await ui.geometry('configuration-saving-light');
    await setTheme(page, 'dark');
    await ui.geometry('configuration-saving-dark');
    await setTheme(page, 'light');
    await keep.release();
    await ui.saved();
    assert.deepEqual(
      await ui.scroll(),
      sourceScroll,
      'Successful save preserves the account source scrolling',
    );
    assert.equal((await keep.result()).input.secret, 'keep');
  } finally {
    await keep.dispose();
  }
  assert.equal(
    await persistedSecret(config),
    firstCiphertext,
    'Blank Secret is omitted and preserves the existing ciphertext',
  );

  await saveOAuthDraft(page, ui, {
    enabled: false,
    clientId: 'browser-oauth-replace',
    secret: secrets.replacement,
  });
  const replaced = await persistedSecret(config);
  assert.ok(
    replaced &&
      replaced !== firstCiphertext &&
      replaced !== secrets.replacement,
    'Replacement changes the actual encrypted value',
  );
  await ui.open();
  await page.click('[data-testid="oauth-secret-clear"]');
  await page.waitForSelector('[data-testid="oauth-clear-dialog"]');
  await page.click('[data-testid="oauth-secret-clear-confirm"]');
  await page.waitForSelector('[data-testid="oauth-clear-dialog"]', {
    state: 'hidden',
  });
  assert.equal(
    await persistedSecret(config),
    replaced,
    'Confirming clear only changes the draft before Save',
  );
  const clear = await oauthFault(page, {
    path: '/api/settings/github',
    method: 'PATCH',
  });
  try {
    await page.click('[data-testid="oauth-save"]');
    await ui.saved();
    assert.equal((await clear.result()).input.secret, 'clear');
  } finally {
    await clear.dispose();
  }
  assert.equal(await persistedSecret(config), null);
  assert.equal(
    (await readOAuthSettings(page, config, report)).saved.hasSecret,
    false,
  );

  // A real SQLite error retains the draft and reads back before permitting closure.
  await identitySql(
    config,
    "CREATE TRIGGER reject_oauth_browser_settings BEFORE UPDATE ON identity_github_settings BEGIN SELECT RAISE(ABORT, 'injected OAuth settings write failure'); END",
  );
  try {
    await ui.open();
    await ui.fill('browser-oauth-error', secrets.first);
    await page.click('[data-testid="oauth-save"]');
    await page.waitForFunction(
      (root) => document.querySelector(root)?.textContent.includes('HTTP 500'),
      oauthDialog,
    );
    await page.waitForSelector(`${oauthDialog}[data-state="verified"]`);
    assert.equal(
      await page.evaluate(
        ({ id, secret }) =>
          document.querySelector('#oauth-client-id').value === id &&
          document.querySelector('#oauth-client-secret').value === secret,
        { id: 'browser-oauth-error', secret: secrets.first },
      ),
      true,
      'A rejected real write preserves both input values',
    );
    assert.equal(
      await page.evaluate(
        () => document.querySelector('[data-testid="oauth-save"]') === null,
      ),
      true,
      'Readback completes without offering another uncertain write',
    );
    const rejected = await readOAuthSettings(page, config, report);
    assert.deepEqual(rejected.saved, {
      enabled: false,
      clientId: 'browser-oauth-replace',
      hasSecret: false,
    });
    assert.deepEqual(rejected.effective, initial.effective);
    await ui.geometry('configuration-server-error');
    report.stage = 'configuration-server-error-close';
    await ui.close();
  } finally {
    await identitySql(config, 'DROP TRIGGER reject_oauth_browser_settings');
  }

  report.stage = 'configuration-unknown-open';
  await ui.open();
  await ui.fill('browser-oauth-final', secrets.final);
  const unknown = await oauthFault(page, {
    path: '/api/settings/github',
    method: 'PATCH',
    lose: true,
    failReconcile: true,
  });
  try {
    await page.click('[data-testid="oauth-save"]');
    assert.equal(
      (await unknown.result()).status,
      200,
      'Unknown Save starts from a real successful write',
    );
    await page.waitForSelector(`${oauthDialog}[data-state="unknown"]`);
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector('[data-testid="oauth-save"]')?.disabled ??
          true,
      ),
      true,
      'Unknown Save offers reconciliation without resubmission',
    );
    assert.equal(
      await page.evaluate(
        ({ id, secret }) =>
          document.querySelector('#oauth-client-id')?.value === id &&
          document.querySelector('#oauth-client-secret')?.value === secret,
        { id: 'browser-oauth-final', secret: secrets.final },
      ),
      true,
    );
    await page.click('[data-testid="oauth-reload"]');
    await page.waitForFunction(() => window.__oauthFault.observed.reads > 0);
    await page.waitForSelector(`${oauthDialog}[data-state="unknown"]`);
    await ui.geometry('configuration-unknown');
    assert.equal((await unknown.result()).requests, 1);
  } finally {
    await unknown.dispose();
  }
  await page.click('[data-testid="oauth-reload"]');
  await page.waitForSelector('[data-testid="oauth-verified-summary"]');
  await page.waitForFunction(
    () =>
      document.activeElement ===
      document.querySelector('[data-testid="oauth-close"]'),
  );
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelector('[data-testid="oauth-save"]')?.disabled ?? true,
    ),
    true,
    'A public readback cannot certify that a submitted Secret matches and does not enable blind re-save',
  );
  await ui.close();
  state = await readOAuthSettings(page, config, report);
  assert.deepEqual(state.saved, {
    enabled: false,
    clientId: 'browser-oauth-final',
    hasSecret: true,
  });
  assert.deepEqual(state.effective, initial.effective);
  assert.equal(state.pendingRestart, true);
  await ui.open();
  assert.equal(
    await page.evaluate(
      () => document.querySelector('#oauth-client-secret').value,
    ),
    '',
  );
  await ui.close();
  await verifyClosedSettingsUnknown(
    page,
    config,
    report,
    ui,
    secrets.replacement,
  );
  report.checks.push(
    'Real encrypted persistence; blank Secret omission, explicit replacement and confirmed draft-only clearing; required fields; pending single submission; rejected-write input retention; lost successful Save and failed readback remain unknown until explicit reconciliation.',
  );
}

export async function verifyCurrentCallback(page, config, report) {
  const nextPublicUrl = `http://callback-${new URL(config.origin).port}.localhost:${new URL(config.origin).port}`;
  try {
    await identitySql(
      config,
      `UPDATE site_settings SET public_url='${nextPublicUrl}' WHERE id=1`,
    );
    const updated = await readOAuthSettings(page, config, report);
    assert.equal(
      updated.callbackUrl,
      `${nextPublicUrl}/api/auth/callback/github`,
      'A new read immediately consumes the current site public URL',
    );
    report.checks.push(
      'Changing only site.publicUrl updates callback readback in the next real request without an OAuth configuration restart.',
    );
  } finally {
    await identitySql(
      config,
      `UPDATE site_settings SET public_url='${config.origin}' WHERE id=1`,
    );
  }
}
