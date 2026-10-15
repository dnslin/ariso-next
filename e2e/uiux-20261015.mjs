/* global taskSpace, config */
const assert = (await import('node:assert/strict')).default;
const { writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const moduleUrl = (name) => new URL(name, config.identitySessionScript).href;
const { signInToLibrary } = await import(moduleUrl('./library-login.mjs'));
const { installBrowserErrors, readBrowserErrors, isBrowserControlStop } =
  await import(config.errorsScript);
const { runUiux20261015Settings } = await import(
  moduleUrl('./uiux-20261015-settings.mjs')
);
const { runUiux20261015Collections } = await import(
  moduleUrl('./uiux-20261015-collections.mjs')
);
const { runUiux20261015Upload } = await import(
  moduleUrl('./uiux-20261015-upload.mjs')
);
const { runUiux20261015Viewer } = await import(
  moduleUrl('./uiux-20261015-viewer.mjs')
);
const { runUiux20261015Metadata } = await import(
  moduleUrl('./uiux-20261015-metadata.mjs')
);
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
    ['settings', runUiux20261015Settings],
    ['collections', runUiux20261015Collections],
    ['upload', runUiux20261015Upload],
    ['viewer', runUiux20261015Viewer],
    ['metadata', runUiux20261015Metadata],
  ];
  for (const [name, run] of flows) {
    if (config.uiux20261015Phase && config.uiux20261015Phase !== name) continue;
    report.workflows[name] = await run(page, config);
    report.checks.push(...report.workflows[name].checks);
    assert.deepEqual(
      await readBrowserErrors(page),
      [],
      `${name}: no browser errors`,
    );
    console.log(`PASS uiux-20261015 ${name}`);
    await writeFile(
      join(config.output, 'uiux-20261015.json'),
      JSON.stringify(report, null, 2),
    );
  }
  report.status = 'passed';
} catch (error) {
  failure = error;
  report.error = error.stack ?? String(error);
  if (!isBrowserControlStop(error))
    await page
      .screenshot({ path: join(config.output, 'uiux-20261015-failure.png') })
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
    join(config.output, 'uiux-20261015.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
if (failure) throw failure;
