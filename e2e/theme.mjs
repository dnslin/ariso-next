/* global taskSpace, config */
const assert = (await import('node:assert/strict')).default;
const { writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { signInToLibrary } = await import(
  new URL('./library-login.mjs', config.identitySessionScript).href
);
const { installBrowserErrors, readBrowserErrors } = await import(
  config.errorsScript
);
const { verifyThemeBehavior } = await import(
  new URL('./theme-behavior.mjs', config.identitySessionScript).href
);
const { verifyThemeLayouts, verifyThemeConsumers } = await import(
  new URL('./theme-layouts.mjs', config.identitySessionScript).href
);
const task = await taskSpace(config.spaceId);
const page = task.page(config.pageLabel ?? 'p1');
const phase = config.themePhase;
assert.ok(
  phase === undefined ||
    ['representative', 'behavior', 'consumers'].includes(phase),
  'Unknown theme phase',
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
    'Uses the runner disposable production database and owner. Viewport emulation, runtime behavior and screenshots do not replace independent design review or final human acceptance.',
  ],
};
let failure, originalTheme, errorScript, requestScript, fixture;
try {
  await page.goto(`${config.origin}/library`);
  await page.waitForFunction(
    () =>
      location.pathname === '/login' ||
      !!document.querySelector('[data-testid="library-list"]'),
  );
  if (new URL(await page.url()).pathname === '/login')
    await signInToLibrary(page, config, report);
  originalTheme = await page.evaluate(() => localStorage.getItem('theme'));
  errorScript = await installBrowserErrors(page);
  // Persist observation across real document navigations in this one isolated
  // test origin. All requests still reach the unchanged production server.
  ({ identifier: requestScript } = await page.cdp(
    'Page.addScriptToEvaluateOnNewDocument',
    {
      source: `(() => {
      const original = window.fetch;
      window.fetch = (...args) => {
        const input = args[0];
        const url = new URL(typeof input === 'string' ? input : input.url, location.href);
        const method = (args[1]?.method ?? input.method ?? 'GET').toUpperCase();
        if (url.pathname === '/api/settings/site' && method === 'PATCH') {
          const requests = JSON.parse(sessionStorage.getItem('__issue197ThemePatches') ?? '[]');
          requests.push({ path: url.pathname, method });
          sessionStorage.setItem('__issue197ThemePatches', JSON.stringify(requests));
        }
        return original(...args);
      };
    })();`,
    },
  ));
  await page.evaluate(() =>
    sessionStorage.removeItem('__issue197ThemePatches'),
  );
  const scenes = [
    ['behavior', () => verifyThemeBehavior(task, page, config, report)],
    ['representative', () => verifyThemeLayouts(page, config, report)],
    [
      'consumers',
      async () => {
        const { createThemeFixture } = await import(
          new URL('./theme-fixture.mjs', config.identitySessionScript).href
        );
        fixture = await createThemeFixture(page, config);
        const { verifyThemeContent } = await import(
          new URL('./theme-content.mjs', config.identitySessionScript).href
        );
        await verifyThemeContent(task, page, config, fixture, report);
        await verifyThemeConsumers(page, config, report, fixture);
      },
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
      `Theme ${name}: no hydration, runtime or resource errors`,
    );
  }
  assert.deepEqual(
    await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem('__issue197ThemePatches') ?? '[]'),
    ),
    [],
    'Theme never submits site PATCH requests',
  );
  report.checks.push('no site PATCH, no hydration/runtime/resource errors');
  report.status = 'passed';
} catch (error) {
  failure = error;
  report.error = error.stack ?? String(error);
} finally {
  try {
    await fixture?.dispose();
    if (fixture) report.fixtureRestored = true;
  } catch (error) {
    report.status = 'failed';
    report.fixtureCleanupError = error.stack ?? String(error);
    failure = failure
      ? new AggregateError(
          [failure, error],
          'Theme test and offline fixture restoration failed',
        )
      : error;
  }
  // Never touch the browser again after a stop/error. The parent runner owns
  // the task space and keeps it available for inspection and human acceptance.
  if (!failure) {
    try {
      await page.evaluate((theme) => {
        if (theme === null) localStorage.removeItem('theme');
        else localStorage.setItem('theme', theme);
        sessionStorage.removeItem('__issue197ThemePatches');
      }, originalTheme);
      await page.cdp('Emulation.setEmulatedMedia', { features: [] });
      for (const identifier of [errorScript, requestScript])
        if (identifier)
          await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
            identifier,
          });
    } catch (error) {
      failure = error;
      report.status = 'failed';
      report.cleanupError = error.stack ?? String(error);
    }
  }
  report.finishedAt = new Date().toISOString();
  await writeFile(
    join(config.output, 'theme.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
if (failure) throw failure;
console.log({
  theme: report.status,
  phase: report.phase,
  report: join(config.output, 'theme.json'),
});
