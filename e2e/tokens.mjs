/* global taskSpace, config */
const { default: assert } = await import('node:assert/strict');
const { writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const tokenModule = (name) =>
  new URL(`./tokens-${name}.mjs`, config.identitySessionScript).href;
const [
  { tokensSignIn, createTokensPage, captureTokensLayouts },
  { verifyTokensCreates, verifyTokensLifecycle },
  { verifyTokensReads, verifyTokensSessionExpiry },
  { verifyTokensConsumers },
  {
    verifyTokenExitRecovery,
    verifyTokenUnknownEntry,
    verifyTokenActionRecovery,
  },
  { verifyTokenKnownFailures },
  { installBrowserErrors, readBrowserErrors },
  { identitySql },
] = await Promise.all([
  import(tokenModule('page')),
  import(tokenModule('behavior')),
  import(tokenModule('reads')),
  import(tokenModule('consumers')),
  import(tokenModule('recovery')),
  import(tokenModule('failures')),
  import(config.errorsScript),
  import(config.identitySessionScript),
]);
const task = await taskSpace(config.spaceId);
const page = task.page(config.pageLabel ?? 'p1');
const secrets = [config.credentials.password];
const registerSecret = (...values) => secrets.push(...values);
const report = {
  status: 'failed',
  taskSpaceId: task.spaceId,
  origin: config.origin,
  phase: config.tokensPhase,
  checks: [],
  layouts: [],
  screenshots: [],
  requests: [],
  business: [],
  clipboard: [],
  limitations: [
    'Only the runner’s disposable production database is modified; the manual preview remains untouched.',
    'Once-only secret screenshots cover the input with a temporary bullet overlay without changing its value or selection; the full value is asserted in memory and never emitted.',
    'Actual Clipboard permission denial and native copy are exercised on the current macOS Ego Lite host.',
    'Chromium viewport emulation does not constitute physical touch, soft keyboard or safe-area verification.',
  ],
};
const ui = createTokensPage(page, config, report);
const safe = (value) => {
  let text = String(value);
  for (const secret of secrets) text = text.replaceAll(secret, '[redacted]');
  return text;
};
let failure, errorScript;
try {
  const [{ time_zone: timeZone }] = await identitySql(
    config,
    'SELECT time_zone FROM site_settings WHERE id=1',
  );
  config.tokensTimeZone = timeZone;
  report.timeZone = timeZone;
  errorScript = await installBrowserErrors(page);
  await tokensSignIn(page, config, report, config.width);
  const phase = config.tokensPhase;
  if (phase === undefined || phase === 'representative') {
    report.stage = 'representative';
    await captureTokensLayouts(page, config, report);
  }
  if (phase === undefined || ['representative', 'behavior'].includes(phase)) {
    report.stage = 'once-only-key';
    await verifyTokensCreates(page, config, report, registerSecret);
  }
  if (phase === undefined || ['behavior', 'lifecycle'].includes(phase)) {
    report.stage = 'lifecycle';
    await verifyTokensLifecycle(page, config, report);
    if (phase !== 'lifecycle') {
      report.stage = 'session-expiry';
      await verifyTokensSessionExpiry(page, config, report, registerSecret);
    }
  }
  if (phase === undefined || phase === 'recovery') {
    report.stage = 'known-failures';
    await verifyTokenKnownFailures(page, config, report, registerSecret);
    report.stage = 'unknown-exit';
    await verifyTokenExitRecovery(page, config, report, registerSecret);
    report.stage = 'reads';
    await verifyTokensReads(page, config, report);
  }
  if (phase === undefined || ['recovery', 'create-recovery'].includes(phase)) {
    report.stage = 'create-unknown';
    await verifyTokenUnknownEntry(page, config, report, registerSecret);
  }
  if (phase === undefined || ['recovery', 'action-recovery'].includes(phase)) {
    report.stage = 'action-recovery';
    await verifyTokenActionRecovery(page, config, report, registerSecret);
  }
  if (phase === undefined || phase === 'consumers') {
    report.stage = 'consumers';
    await verifyTokensConsumers(page, config, report);
  }
  report.browserErrors = await readBrowserErrors(page);
  assert.deepEqual(
    report.browserErrors,
    [],
    'Tokens have no browser runtime or resource errors',
  );
  report.status = 'passed';
} catch (error) {
  failure = error;
  report.error = safe(error.stack ?? String(error));
  await ui.screenshot('failure');
} finally {
  if (errorScript)
    await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
      identifier: errorScript,
    });
  report.finishedAt = new Date().toISOString();
  await writeFile(
    join(config.output, `tokens${config.width ? `-${config.width}` : ''}.json`),
    `${safe(JSON.stringify(report, null, 2))}\n`,
  );
}
if (failure) throw new Error(report.error);
console.log({
  tokens: report.status,
  report: join(
    config.output,
    `tokens${config.width ? `-${config.width}` : ''}.json`,
  ),
});
