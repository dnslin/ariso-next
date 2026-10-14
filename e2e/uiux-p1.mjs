/* global taskSpace, config */
const assert = (await import('node:assert/strict')).default;
const { writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const moduleUrl = (name) => new URL(name, config.identitySessionScript).href;
const { signInToLibrary } = await import(moduleUrl('./library-login.mjs'));
const { installBrowserErrors, readBrowserErrors, isBrowserControlStop } =
  await import(config.errorsScript);
const { runUiuxP1Settings } = await import(moduleUrl('./uiux-p1-settings.mjs'));
const { runUiuxP1Return } = await import(moduleUrl('./uiux-p1-return.mjs'));
const { runUiuxP1Upload } = await import(moduleUrl('./uiux-p1-upload.mjs'));
const { runUiuxP1Storage } = await import(moduleUrl('./uiux-p1-storage.mjs'));
const page = (await taskSpace(config.spaceId)).page(config.pageLabel ?? 'p1');
const report = { status: 'failed', checks: [], workflows: {} };
let failure, errorScript;
try {
  await page.goto(`${config.origin}/library`);
  if (new URL(await page.url()).pathname === '/login')
    await signInToLibrary(page, config, report);
  await page.waitForSelector('[data-testid="library-list"]');
  errorScript = await installBrowserErrors(page);
  const flows = [
    [
      'settings',
      () => runUiuxP1Settings(page, config.origin, { output: config.output }),
    ],
    [
      'upload',
      () => runUiuxP1Upload(page, config.origin, { output: config.output }),
    ],
    [
      'return',
      () =>
        runUiuxP1Return(page, config.origin, {
          imageId: report.workflows.upload.imageIds[0],
          output: config.output,
        }),
    ],
    ['storage', () => runUiuxP1Storage(page, config)],
  ];
  for (const [name, run] of flows) {
    report.workflows[name] = await run();
    report.checks.push(...report.workflows[name].checks);
    assert.deepEqual(
      await readBrowserErrors(page),
      [],
      `${name}: no browser errors`,
    );
    console.log(`PASS uiux-p1 ${name}`);
    await writeFile(
      join(config.output, 'uiux-p1.json'),
      JSON.stringify(report, null, 2),
    );
  }
  report.status = 'passed';
} catch (error) {
  failure = error;
  report.error = error.stack ?? String(error);
  if (!isBrowserControlStop(error))
    await page
      .screenshot({ path: join(config.output, 'uiux-p1-failure.png') })
      .catch(() => {});
} finally {
  if (!failure || !isBrowserControlStop(failure)) {
    report.browserErrors = await readBrowserErrors(page);
    if (errorScript)
      await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
        identifier: errorScript,
      });
  }
  await writeFile(
    join(config.output, 'uiux-p1.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
if (failure) throw failure;
