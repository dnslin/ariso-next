/* global taskSpace, config */
const assert = (await import('node:assert/strict')).default;
const { writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const load = (file) => import(new URL(file, config.libraryDetailScript).href);
const { createImageWorkflowFixture } = await load(
  './image-workflows-fixture.mjs',
);
const { createImageWorkflowPage } = await load('./image-workflows-page.mjs');
const { verifyImageWorkflowDownloads } = await load(
  './image-workflows-download.mjs',
);
const { verifyImageWorkflowSizes } = await load('./image-workflows-sizes.mjs');
const { verifyImageWorkflowShare } = await load('./image-workflows-share.mjs');
const { verifyImageWorkflowReplacement } = await load(
  './image-workflows-replacement.mjs',
);
const { signInToLibrary } = await load('./library-login.mjs');
const { resizeViewport, setTheme } = await load('./browser-geometry.mjs');
const { visibleThemeTrigger, chooseTheme } = await load('./theme-helpers.mjs');
const { installBrowserErrors, assertNoBrowserErrors, isBrowserControlStop } =
  await import(config.errorsScript);
assert.ok(
  Number.isInteger(config.spaceId) && config.spaceId > 0,
  'The runner supplies the existing Ego TaskSpace',
);
const task = await taskSpace(config.spaceId);
const page = task.page(config.pageLabel ?? 'p1');
const report = {
  status: 'failed',
  taskSpaceId: task.spaceId,
  origin: config.origin,
  checks: [],
  layouts: [],
  limitations: [
    'Images enter the real owner upload submission and multipart reception APIs, then run through the installed media worker in the disposable Local standalone runtime. No database fixture substitutes for upload or processing.',
    'The anonymous page uses a unique localhost subdomain with host-isolated cookies in the same Ego profile. Its actual null session and denied ordinary private URL are asserted; it is not a separate Chromium BrowserContext.',
    'The handover check temporarily caps upload speed only on the current browser target. It closes details while the actual selected-file XHR and its server receiving task are pending, then restores normal speed and matches the same XHR receipt to the completed job. This is controlled timing, not an actual network incident.',
    'Chromium viewport, theme, keyboard, geometry and screenshots are local browser evidence. Physical devices, other engines, Figma design acceptance and release deployment are separate checks.',
    'Ego menu pointer activation incorrectly reported an enabled replacement item as disabled or did not open its picker. Detail menu actions use native focus/Enter; replacement arms the SDK FileChooser before Enter and calls its setFiles. This suite does not claim Ego pointer acceptance for that action; independent IAB pointer evidence is recorded separately.',
    'External R2 and SeaweedFS business verification is provided by the separate real-storage verifier.',
  ],
};
let fixture, visitor, preference, errorScript, failure;
try {
  report.stage = 'owner-sign-in';
  await resizeViewport(page, 1440, 1000);
  await page.goto(`${config.origin}/library`);
  await page.waitForFunction(
    () =>
      location.pathname === '/login' ||
      !!document.querySelector('[data-testid="library-list"]'),
  );
  if (new URL(await page.url()).pathname === '/login')
    await signInToLibrary(page, config, report);
  await page.waitForSelector('[data-testid="library-list"]');
  const theme = await visibleThemeTrigger(page);
  await page.waitForFunction(
    (selector) => !!document.querySelector(selector)?.dataset.theme,
    theme,
  );
  preference = await page.evaluate(
    (selector) => document.querySelector(selector).dataset.theme,
    theme,
  );
  const system = await page.evaluate(() =>
    matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  );
  report.stage = 'theme-preparation';
  report.themePreparation = {
    preference,
    storedPreference: await page.evaluate(() => localStorage.getItem('theme')),
    system,
  };
  // The default system preference is valid before next-themes persists a key.
  // chooseTheme also checks persistence, so use it only for an actual change.
  if (preference !== 'system') await chooseTheme(page, 'system', system);
  await setTheme(page, 'light');
  errorScript = await installBrowserErrors(page);
  report.stage = 'formal-upload-fixture';
  fixture = await createImageWorkflowFixture(page, config, report);
  const ui = createImageWorkflowPage(page, config, report, fixture);
  await ui.visit();
  report.initialSnapshot = await page.snapshot();
  const context = { task, page, config, report, fixture, ui };
  report.stage = 'zip-download';
  await verifyImageWorkflowDownloads(context);
  report.stage = 'preset-sizes';
  const sizes = await verifyImageWorkflowSizes(context);
  report.stage = 'private-image-share';
  visitor = await verifyImageWorkflowShare(context);
  report.stage = 'replacement-and-return';
  await verifyImageWorkflowReplacement({ ...context, sizes, visitor });
  report.browserErrors = await assertNoBrowserErrors(page);
  report.status = 'passed';
} catch (error) {
  failure = error;
  report.error = error.stack ?? String(error);
  if (!isBrowserControlStop(error)) {
    try {
      await page.screenshot({
        path: join(config.output, 'image-workflows-failure.png'),
      });
      report.failureSnapshot = await page.snapshot();
    } catch (diagnostic) {
      report.diagnosticError = diagnostic.stack ?? String(diagnostic);
    }
  }
} finally {
  // After user control takeover, do not continue UI or HTTP operations. The
  // parent runner still owns disposal of this temporary application.
  let controlStopped = isBrowserControlStop(failure);
  if (!controlStopped) {
    const cleanup = async (label, operation) => {
      if (controlStopped) return;
      try {
        await operation();
      } catch (error) {
        report.cleanupErrors ??= [];
        report.cleanupErrors.push({
          label,
          error: error.stack ?? String(error),
        });
        failure ??= error;
        report.status = 'failed';
        controlStopped = isBrowserControlStop(error);
      }
    };
    if (visitor)
      await cleanup('anonymous-page', () => visitor.anonymous.close());
    if (fixture)
      await cleanup('formal-business-cleanup-and-settings', () =>
        fixture.dispose(),
      );
    if (preference)
      await cleanup('owner-theme-preference', async () => {
        await resizeViewport(page, 1440, 1000);
        await page.goto(`${config.origin}/library`);
        await page.waitForSelector('[data-testid="library-list"]');
        await setTheme(page, 'light');
        if (preference !== 'system')
          await chooseTheme(page, preference, preference);
      });
    if (errorScript)
      await cleanup('runtime-error-observer', () =>
        page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
          identifier: errorScript,
        }),
      );
  }
  if (controlStopped)
    report.cleanupDeferredToRunner =
      'Browser control was stopped; the parent runner owns the temporary service and data cleanup.';
  await writeFile(
    join(config.output, 'image-workflows.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
if (failure) throw failure;
console.log({
  status: report.status,
  checks: report.checks.length,
  layouts: report.layouts.length,
  taskSpaceId: task.spaceId,
});
