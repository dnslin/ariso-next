/* global taskSpace, config */
const assert = (await import('node:assert/strict')).default;
const { writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { isDeepStrictEqual } = await import('node:util');
const { siteGeneralTools, quote } = await import(
  new URL('./site-general-helpers.mjs', config.identitySessionScript).href
);
const { verifySiteGeneralLayouts } = await import(
  new URL('./site-general-layouts.mjs', config.identitySessionScript).href
);
const { verifySiteGeneralBehavior, verifySiteGeneralAddress } = await import(
  new URL('./site-general-behavior.mjs', config.identitySessionScript).href
);
const { verifySiteGeneralRecovery } = await import(
  new URL('./site-general-recovery.mjs', config.identitySessionScript).href
);
const { verifySiteGeneralConsumers } = await import(
  new URL('./site-general-consumers.mjs', config.identitySessionScript).href
);
const { signInToLibrary } = await import(
  new URL('./library-login.mjs', config.identitySessionScript).href
);
const { saveClipboard, restoreClipboard } = await import(
  new URL('./library-copy-helpers.mjs', config.identitySessionScript).href
);
const { installBrowserErrors, readBrowserErrors } = await import(
  config.errorsScript
);
const task = await taskSpace(config.spaceId);
const page = task.page(config.pageLabel ?? 'p1');
const phase = config.siteGeneralPhase;
assert.ok(
  phase === undefined ||
    ['representative', 'behavior', 'recovery', 'consumers'].includes(phase),
  'Unknown site general phase',
);
const report = {
  status: 'failed',
  taskSpaceId: task.spaceId,
  origin: config.origin,
  phase: phase ?? 'all',
  checks: [],
  layouts: [],
  browserErrors: [],
  limitations: [
    'Only the runner disposable production database and independently initialized owner are used; user preview data is untouched.',
    'Transport injections preserve real successful server responses and commits; unsent requests and Clipboard denials are explicit injected failures.',
    'Viewport emulation does not verify physical phones, touch keyboards or Release containers; human acceptance remains separate.',
    'Complete metadata/brand material consumption and sharing/analytics timezone interpretation belong to their own tasks.',
  ],
};
let tools, original, clipboard, theme, errorScript, failure;
try {
  report.stage = 'owner';
  await page.goto(`${config.origin}/library`);
  await page.waitForFunction(
    () =>
      location.pathname === '/login' ||
      !!document.querySelector('[data-testid="library-list"]'),
  );
  if (new URL(await page.url()).pathname === '/login')
    await signInToLibrary(page, config, report);
  theme = await page.evaluate(() => localStorage.getItem('theme'));
  await page.evaluate(() => localStorage.setItem('theme', 'system'));
  await page.reload();
  await page.waitForSelector('[data-testid="library-list"]');
  errorScript = await installBrowserErrors(page);
  tools = await siteGeneralTools(page, config, report);
  [original] = await tools.sql(
    'SELECT name,description,public_url,time_zone,updated_at FROM site_settings WHERE id=1',
  );
  if (phase === undefined || phase === 'consumers')
    clipboard = await saveClipboard();
  const scenes = [
    ['representative', () => verifySiteGeneralLayouts(page, tools, report)],
    [
      'behavior',
      async () => {
        await verifySiteGeneralBehavior(page, config, tools, report);
        await verifySiteGeneralAddress(page, config, tools, report);
      },
    ],
    ['recovery', () => verifySiteGeneralRecovery(page, config, tools, report)],
    [
      'consumers',
      () => verifySiteGeneralConsumers(page, config, tools, report),
    ],
  ];
  for (const [name, run] of scenes) {
    if (phase !== undefined && phase !== name) continue;
    report.stage = name;
    await run();
    const errors = await readBrowserErrors(page);
    report.browserErrors.push(...errors);
    assert.deepEqual(
      errors,
      [],
      `Site general ${name}: no browser runtime/resource errors`,
    );
  }
  report.status = 'passed';
} catch (error) {
  failure = error;
  report.error = error.stack ?? String(error);
} finally {
  // Database fixture restoration is offline. A stopped Ego page is never
  // claimed or replaced with a new task space to complete cleanup.
  try {
    if (original) {
      await tools.sql(
        `UPDATE site_settings SET name=${quote(original.name)},description=${quote(original.description)},public_url=${quote(original.public_url)},time_zone=${quote(original.time_zone)},updated_at=${original.updated_at} WHERE id=1`,
      );
      assert.deepEqual(
        (
          await tools.sql(
            'SELECT name,description,public_url,time_zone,updated_at FROM site_settings WHERE id=1',
          )
        )[0],
        original,
      );
      report.originalSiteRestored = true;
    }
    if (!failure) {
      if (theme !== undefined)
        await page.evaluate((theme) => {
          if (theme === null) localStorage.removeItem('theme');
          else localStorage.setItem('theme', theme);
        }, theme);
      if (errorScript)
        await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
          identifier: errorScript,
        });
    }
  } catch (error) {
    report.status = 'failed';
    report.cleanupError = error.stack ?? String(error);
    failure = failure
      ? new AggregateError(
          [failure, error],
          'Site verification and fixture restoration failed',
        )
      : error;
  }
  try {
    if (clipboard) {
      await restoreClipboard(clipboard);
      assert.ok(
        isDeepStrictEqual(await saveClipboard(), clipboard),
        'Native clipboard restoration preserves the backed-up value',
      );
      report.clipboardRestored = true;
    }
  } catch (error) {
    report.status = 'failed';
    report.clipboardRestored = false;
    report.clipboardCleanupError = error.stack ?? String(error);
    failure = failure
      ? new AggregateError(
          [failure, error],
          'Site verification and clipboard restoration failed',
        )
      : error;
  }
  report.finishedAt = new Date().toISOString();
  await writeFile(
    join(config.output, 'site-general.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
if (failure) throw failure;
console.log({
  siteGeneral: report.status,
  phase: report.phase,
  report: join(config.output, 'site-general.json'),
});
