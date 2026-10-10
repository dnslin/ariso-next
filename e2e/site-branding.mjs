/* global taskSpace, config */
const assert = (await import('node:assert/strict')).default;
const { writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { brandingTools, readBrandingFixture, restoreBrandingFixture } =
  await import(
    new URL('./site-branding-helpers.mjs', config.identitySessionScript).href
  );
const { verifyBrandingLayouts } = await import(
  new URL('./site-branding-layouts.mjs', config.identitySessionScript).href
);
const { verifyBrandingBehavior } = await import(
  new URL('./site-branding-behavior.mjs', config.identitySessionScript).href
);
const { verifyBrandingRecovery } = await import(
  new URL('./site-branding-recovery.mjs', config.identitySessionScript).href
);
const { verifyBrandingConsumers } = await import(
  new URL('./site-branding-consumers.mjs', config.identitySessionScript).href
);
const { signInToLibrary } = await import(
  new URL('./library-login.mjs', config.identitySessionScript).href
);
const { installBrowserErrors, readBrowserErrors } = await import(
  config.errorsScript
);
const { identitySql } = await import(config.identitySessionScript);
const task = await taskSpace(config.spaceId);
const page = task.page(config.pageLabel ?? 'p1');
const phase = config.siteBrandingPhase;
assert.ok(
  phase === undefined ||
    ['representative', 'behavior', 'recovery', 'consumers'].includes(phase),
);
const report = {
  status: 'failed',
  taskSpaceId: task.spaceId,
  origin: config.origin,
  phase: phase ?? 'all',
  checks: [],
  layouts: [],
  limitations: [
    'Only the runner disposable production app, owner and database are changed; user acceptance preview data is untouched.',
    'Failures are explicit page transport injections or real production validation/session failures; successful writes reach the real service.',
    'Browser geometry and screenshots do not substitute design comparison or human acceptance; Release/container/device tests are separate.',
  ],
};
const tools = brandingTools(page, config, report);
let baseline,
  original,
  failure,
  errorScript,
  retainedForRestart = false;
async function signIn() {
  await page.goto(`${config.origin}/library?page=1`);
  await page.waitForFunction(
    () =>
      location.pathname === '/login' ||
      !!document.querySelector('[data-testid="library-list"]'),
  );
  if (new URL(await page.url()).pathname === '/login')
    await signInToLibrary(page, config, report);
}
try {
  await signIn();
  errorScript = await installBrowserErrors(page);
  baseline = await tools.api();
  original = await readBrandingFixture(config);
  assert.equal(
    baseline.logoUrl,
    null,
    'Independent branding suite starts without another task asset',
  );
  assert.equal(baseline.faviconUrl, null);
  const scenes = [
    ['representative', () => verifyBrandingLayouts(page, tools, report)],
    ['behavior', () => verifyBrandingBehavior(page, config, tools, report)],
    [
      'recovery',
      async () => {
        await verifyBrandingRecovery(page, config, tools, report);
        await signIn();
      },
    ],
    ['consumers', () => verifyBrandingConsumers(page, config, tools, report)],
  ];
  for (const [name, run] of scenes) {
    if (phase !== undefined && phase !== name) continue;
    report.stage = name;
    await run();
    const errors = await readBrowserErrors(page);
    report.browserErrors ??= [];
    report.browserErrors.push(...errors);
    assert.deepEqual(
      errors.filter(
        (error) =>
          !report.expectedResourceFailures?.some(
            (url) =>
              error.kind === 'error' &&
              error.message === `Resource failed: ${url}`,
          ),
      ),
      [],
      `Branding ${name}: no unexpected runtime/resource errors`,
    );
  }
  if (phase === undefined || phase === 'consumers') {
    await writeFile(
      join(config.output, 'site-branding-baseline.json'),
      `${JSON.stringify({ settings: baseline, original }, null, 2)}\n`,
    );
    retainedForRestart = true;
  }
  report.status = 'passed';
} catch (error) {
  failure = error;
  report.error = error.stack ?? String(error);
} finally {
  try {
    if (original && !retainedForRestart) {
      await restoreBrandingFixture(config, original);
      report.originalSiteRestored = true;
    }
    if (report.fixtureAlbumId && !retainedForRestart)
      await identitySql(
        config,
        `DELETE FROM albums WHERE id='${report.fixtureAlbumId}'`,
      );
    if (!failure && errorScript)
      await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
        identifier: errorScript,
      });
  } catch (error) {
    report.status = 'failed';
    report.cleanupError = error.stack ?? String(error);
    failure = failure
      ? new AggregateError(
          [failure, error],
          'Branding verification and fixture restoration failed',
        )
      : error;
  }
  report.finishedAt = new Date().toISOString();
  await writeFile(
    join(config.output, 'site-branding.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
if (failure) throw failure;
console.log({
  siteBranding: report.status,
  phase: report.phase,
  report: join(config.output, 'site-branding.json'),
});
