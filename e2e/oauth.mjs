/* global taskSpace, config */
const { default: assert } = await import('node:assert/strict');
const { randomBytes } = await import('node:crypto');
const { writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const oauthModule = (name) =>
  new URL(`./${name}.mjs`, config.identitySessionScript).href;
const [
  { accountSignIn, accountRequest },
  { createOAuthPage, verifyCallbackCopy },
  {
    readOAuthSettings,
    saveOAuthDraft,
    verifyOAuthSettings,
    verifyCurrentCallback,
  },
  {
    seedUIBinding,
    assertCredentialPreserved,
    verifyLoginVisibility,
    verifyGithubBinding,
  },
  { verifyOAuthReads },
  { resizeViewport, setTheme },
  { installBrowserErrors, readBrowserErrors },
] = await Promise.all([
  import(oauthModule('account-auth')),
  import(oauthModule('oauth-page')),
  import(oauthModule('oauth-settings')),
  import(oauthModule('oauth-binding')),
  import(oauthModule('oauth-reads')),
  import(oauthModule('browser-geometry')),
  import(config.errorsScript),
]);
assert.ok(
  ['before', 'after', 'enabled'].includes(config.oauthPhase),
  'OAuth suite requires an explicit lifecycle phase',
);
const task = await taskSpace(config.spaceId);
assert.equal(
  task.ownership,
  'agent',
  'Browser control is required to continue',
);
const page = task.page(config.pageLabel ?? 'p1');
const secrets = {
  first: randomBytes(24).toString('hex'),
  replacement: randomBytes(24).toString('hex'),
  final: randomBytes(24).toString('hex'),
};
const sensitive = [config.credentials.password, ...Object.values(secrets)];
const safe = (value) =>
  sensitive.reduce(
    (text, secret) => text.replaceAll(secret, '[redacted]'),
    String(value),
  );
const report = {
  status: 'failed',
  taskSpaceId: task.spaceId,
  origin: config.origin,
  phase: config.oauthPhase,
  checks: [],
  layouts: [],
  screenshots: [],
  requests: [],
  realGithubOAuth: 'unverified',
  limitations: [
    'Only the runner’s disposable production runtime/database are modified; the manual preview is untouched.',
    'A seeded GitHub account proves UI binding state and production unlinking only. It is not evidence of real GitHub OAuth authorization, token exchange or GitHub login.',
    'Held/lost delivery faults retain actual HTTP writes and reads; no successful server response is fabricated.',
    'Callback publicUrl readback is verified here; external callback authorization and provider exchange remain separate verification.',
  ],
};
const ui = createOAuthPage(page, config, report);
let errorScript;
let failure;
try {
  errorScript = await installBrowserErrors(page);
  await resizeViewport(page, config.width ?? 1440);
  await accountSignIn(page, config, report, config.credentials, config.width);
  await setTheme(page, 'light');
  await ui.ready();
  if (config.oauthPhase === 'before') {
    report.stage = 'disabled-representative';
    await ui.layouts('unbound-disabled', true);
    await verifyCallbackCopy(
      page,
      config,
      report,
      ui,
      (await readOAuthSettings(page, config, report)).callbackUrl,
    );
    report.stage = 'configuration';
    await verifyOAuthSettings(page, config, report, ui, secrets);
    await verifyCurrentCallback(page, config, report);
    await seedUIBinding(config);
    await page.reload();
    await ui.ready();
    await verifyOAuthReads(page, config, report, ui);
    await assertCredentialPreserved(config);
    report.stage = 'saved-disabled';
    await verifyLoginVisibility(page, config, report, false);
    await ui.layouts('bound-saved-disabled', true);
    report.restartExpected = {
      enabled: false,
      clientId: 'browser-oauth-final',
      hasSecret: true,
    };
  } else if (config.oauthPhase === 'after') {
    report.stage = 'disabled-effective';
    const settings = await readOAuthSettings(page, config, report);
    assert.deepEqual(settings.saved, {
      enabled: false,
      clientId: 'browser-oauth-final',
      hasSecret: true,
    });
    assert.deepEqual(settings.effective, settings.saved);
    assert.equal(
      settings.pendingRestart,
      false,
      'The real same-data restart applies the saved disabled configuration',
    );
    assert.deepEqual(
      (await accountRequest(page, report, config.width, '/api/account/github'))
        .payload.binding,
      { accountId: '181-ui', login: 'browser-oauth-owner' },
      'Disabled configuration retains the existing GitHub relation',
    );
    await verifyLoginVisibility(page, config, report, false);
    await ui.layouts('bound-effective-disabled');
    await saveOAuthDraft(page, ui, {
      clientId: 'browser-oauth-final',
      secret: '',
      enabled: true,
    });
    const saved = await readOAuthSettings(page, config, report);
    assert.equal(saved.saved.enabled, true);
    assert.equal(
      saved.effective.enabled,
      false,
      'Saving enablement does not change process-effective login before restart',
    );
    assert.equal(saved.pendingRestart, true);
    report.checks.push(
      'First real process restart applies disabled saved configuration and retains the binding; explicit UI re-enable saves while effective remains disabled until the next restart.',
    );
  } else {
    report.stage = 'enabled-effective';
    const settings = await readOAuthSettings(page, config, report);
    assert.deepEqual(settings.saved, {
      enabled: true,
      clientId: 'browser-oauth-final',
      hasSecret: true,
    });
    assert.deepEqual(settings.effective, settings.saved);
    assert.equal(settings.pendingRestart, false);
    await verifyLoginVisibility(page, config, report, true);
    await ui.ready();
    report.stage = 'binding-unlink';
    await verifyGithubBinding(page, config, report, ui);
    report.checks.push(
      'Second real process restart applies enablement and exposes the anonymous GitHub entry; UI-only seeded account is removed through the actual protected unlink endpoint.',
    );
  }
  report.browserErrors = await readBrowserErrors(page);
  assert.deepEqual(
    report.browserErrors,
    [],
    'OAuth pages have no browser runtime or resource errors',
  );
  report.status = 'passed';
} catch (error) {
  failure = error;
  report.error = safe(error.stack ?? String(error));
  report.stoppedForUserControl =
    /user has taken control|space.*(?:inactive|unassigned)/i.test(
      String(error),
    );
  if (!report.stoppedForUserControl) await ui.screenshot('failure');
} finally {
  if (errorScript && !report.stoppedForUserControl)
    await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
      identifier: errorScript,
    });
  report.finishedAt = new Date().toISOString();
  await writeFile(
    join(
      config.output,
      `oauth-${config.width ?? 'all'}-${config.oauthPhase}.json`,
    ),
    `${safe(JSON.stringify(report, null, 2))}\n`,
  );
}
if (failure) throw new Error(report.error);
console.log({
  oauth: report.status,
  phase: config.oauthPhase,
  report: join(
    config.output,
    `oauth-${config.width ?? 'all'}-${config.oauthPhase}.json`,
  ),
});
