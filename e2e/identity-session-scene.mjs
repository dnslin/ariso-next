/* global taskSpace, config */
const assert = (await import('node:assert/strict')).default;
const { writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { verifyIdentitySession, verifyLoginFailures } = await import(
  config.identitySessionScript
);
const { resizeViewport } = await import(
  new URL('./browser-geometry.mjs', config.identitySessionScript).href
);
const { installBrowserErrors, readBrowserErrors, isBrowserControlStop } =
  await import(config.errorsScript);
const task = await taskSpace(config.spaceId);
const report = {
  status: 'failed',
  taskSpaceId: task.spaceId,
  width: 1440,
  checks: [],
  browserErrors: [],
};
const safe = (error) =>
  String(error.stack ?? error).replaceAll(
    config.credentials.password,
    '[redacted]',
  );

// Reuse the original scenarios, but stop their browser finally operations after
// takeover. Their database cleanup and this adapter's report remain offline.
function stopAware(control) {
  return new Proxy(control, {
    get(target, key) {
      const value = target[key];
      if (key === 'keyboard' || key === 'mouse') return stopAware(value);
      if (typeof value !== 'function') return value;
      return async (...args) => {
        if (report.stoppedForUserControl)
          throw new Error('Browser control stopped; cleanup remains offline.');
        try {
          return await value.apply(target, args);
        } catch (error) {
          if (isBrowserControlStop(error)) report.stoppedForUserControl = true;
          throw error;
        }
      };
    },
  });
}
const page = stopAware(task.page(config.pageLabel ?? 'p1'));
let errorScript, failure;
try {
  errorScript = await installBrowserErrors(page);
  await resizeViewport(page, 1440, 844);
  report.stage = 'session';
  await verifyIdentitySession(page, config, report.checks);
  report.stage = 'login-failures';
  await verifyLoginFailures(page, config, report.checks);
  report.browserErrors = await readBrowserErrors(page);
  assert.deepEqual(
    report.browserErrors,
    [],
    'No identity browser runtime/resource errors',
  );
  report.status = 'passed';
} catch (error) {
  failure = error;
  report.error = safe(error);
  report.stoppedForUserControl ||= isBrowserControlStop(error);
} finally {
  try {
    if (errorScript && !report.stoppedForUserControl)
      await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
        identifier: errorScript,
      });
  } catch (error) {
    report.status = 'failed';
    report.cleanupError = safe(error);
    failure ??= error;
  }
  await writeFile(
    join(config.output, 'identity-session-1440.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
if (failure) throw new Error(report.error ?? report.cleanupError);
// Focused runs retain the caller's existing TaskSpace and selected page.
console.log({
  identitySession: report.status,
  width: report.width,
  report: join(config.output, 'identity-session-1440.json'),
});
