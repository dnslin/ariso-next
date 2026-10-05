/* global taskSpace, config */
const { default: assert } = await import('node:assert/strict');
const { writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const accountModule = (name) =>
  new URL(`./account-${name}.mjs`, config.identitySessionScript).href;
const [
  { accountSignIn, accountRequest },
  { createAccountPage, captureAccountLayouts },
  { verifyAccountReads },
  { verifyEmailChanges },
  { verifyPasswordConflict, verifyPasswordChanges },
  { identitySql },
  { resizeViewport, setTheme },
  { installBrowserErrors, readBrowserErrors },
] = await Promise.all([
  import(accountModule('auth')),
  import(accountModule('page')),
  import(accountModule('reads')),
  import(accountModule('email')),
  import(accountModule('password')),
  import(config.identitySessionScript),
  import(new URL('./browser-geometry.mjs', config.identitySessionScript).href),
  import(config.errorsScript),
]);
const task = await taskSpace(config.spaceId);
const page = task.page(config.pageLabel ?? 'p1');
const secrets = [config.credentials.password];
const registerSecret = (...values) => secrets.push(...values);
const report = {
  status: 'failed',
  taskSpaceId: task.spaceId,
  origin: config.origin,
  checks: [],
  layouts: [],
  screenshots: [],
  requests: [],
  business: [],
  secondBrowserContext: 'unverified',
  limitations: [
    'Only the runner’s disposable production runtime/database are modified; the manual preview is untouched.',
    'Held/lost responses come from real writes. Transport injection does not invent successful server results.',
    'Chromium viewport emulation does not constitute physical touch, soft keyboard or safe-area verification.',
    'Separate HTTP Cookie sessions verify revocation; they do not constitute two browser contexts.',
    'The current Ego capability probe can create an empty BrowserContext but rejects Target.createTarget; two navigable browser contexts remain unverified.',
  ],
};
let credentials = {
  email: config.credentials.email,
  password: config.credentials.password,
};
let errorScript;
let failure;
const ui = createAccountPage(page, config, report);
const safe = (value) => {
  let result = String(value);
  for (const secret of secrets)
    result = result.replaceAll(secret, '[redacted]');
  return result;
};
try {
  errorScript = await installBrowserErrors(page);
  await accountSignIn(page, config, report, credentials, config.width);
  assert.deepEqual(
    (await accountRequest(page, report, config.width, '/api/account')).payload,
    { email: credentials.email },
  );
  report.stage = 'responsive';
  await captureAccountLayouts(page, config, report, credentials);
  report.stage = 'account-read';
  await verifyAccountReads(page, config, report, credentials);
  for (const width of config.width ? [config.width] : [1440, 390]) {
    await resizeViewport(page, width);
    await setTheme(page, 'light');
    report.stage = `email-${width}`;
    credentials = await verifyEmailChanges(
      page,
      config,
      report,
      credentials,
      width,
    );
    report.stage = `password-conflict-${width}`;
    credentials = await verifyPasswordConflict(
      page,
      config,
      report,
      credentials,
      width,
      registerSecret,
    );
    report.stage = `password-${width}`;
    credentials = await verifyPasswordChanges(
      page,
      config,
      report,
      credentials,
      width,
      registerSecret,
    );
    report.business.push({ width, status: 'passed', email: credentials.email });
  }
  const rows = await identitySql(
    config,
    'SELECT email, email_verified FROM user',
  );
  assert.deepEqual(rows, [{ email: credentials.email, email_verified: 0 }]);
  report.persistedEmail = credentials.email;
  report.browserErrors = await readBrowserErrors(page);
  assert.deepEqual(
    report.browserErrors,
    [],
    'Account has no browser runtime/resource errors',
  );
  report.status = 'passed';
} catch (error) {
  failure = error;
  report.error = safe(error.stack ?? String(error));
  await ui.screenshot('failure', config.width ?? 'all');
} finally {
  if (errorScript)
    await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
      identifier: errorScript,
    });
  report.finishedAt = new Date().toISOString();
  await writeFile(
    join(
      config.output,
      `account${config.width ? `-${config.width}` : ''}.json`,
    ),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
if (failure) throw new Error(report.error);
console.log({
  account: report.status,
  report: join(
    config.output,
    `account${config.width ? `-${config.width}` : ''}.json`,
  ),
});
