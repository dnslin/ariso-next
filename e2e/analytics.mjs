/* global taskSpace, config */
const assert = (await import('node:assert/strict')).default;
const { writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const sibling = (name) =>
  new URL(`./${name}.mjs`, config.identitySessionScript).href;
const { analyticsTools } = await import(sibling('analytics-helpers'));
const { analyticsFixture } = await import(sibling('analytics-fixture'));
const { analyticsRepresentative, analyticsBehavior } = await import(
  sibling('analytics-behavior')
);
const { analyticsRecovery } = await import(sibling('analytics-recovery'));
const { analyticsConsumers } = await import(sibling('analytics-consumers'));
const { signInToLibrary } = await import(sibling('library-login'));
const { installBrowserErrors, readBrowserErrors, isBrowserControlStop } =
  await import(config.errorsScript);
const task = await taskSpace(config.spaceId);
const managedPage = task.page(config.pageLabel ?? 'p1');
const phase = config.analyticsPhase;
assert.ok(
  phase === undefined ||
    ['representative', 'behavior', 'recovery', 'consumers'].includes(phase),
  'Unknown analytics phase',
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
    'Only disposable runner records, objects and one private Token upload are used; the manual preview is independent.',
    'HTTP/network/health faults and visibility/timer controls are explicit page-boundary injections; normal analytics responses come from the real production server and are reconciled with SQLite.',
    'Viewport and keyboard emulation do not prove physical touch or software keyboard behavior. Human design acceptance remains separate.',
  ],
};
// A takeover can occur inside a scene's awaited operation. Keep later finally
// blocks offline after that first stop, including fault-injection cleanup.
function stopAwareControl(control) {
  return new Proxy(control, {
    get(target, key) {
      const value = target[key];
      if ((key === 'keyboard' || key === 'mouse') && value)
        return stopAwareControl(value);
      if (typeof value !== 'function') return value;
      return async (...args) => {
        if (report.stoppedForUserControl)
          throw new Error(
            'Browser control stopped; scene cleanup remains offline.',
          );
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
const page = stopAwareControl(managedPage);
let tools, fixture, theme, errorScript, failure;
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
  errorScript = await installBrowserErrors(page);
  tools = analyticsTools(page, config, report);
  fixture = await analyticsFixture(config, tools);
  report.stage = 'fixture';
  await fixture.seed();
  for (const [name, run] of [
    [
      'representative',
      () => analyticsRepresentative(page, config, tools, fixture, report),
    ],
    ['behavior', () => analyticsBehavior(page, config, tools, fixture, report)],
    ['recovery', () => analyticsRecovery(page, config, tools, fixture, report)],
    [
      'consumers',
      () => analyticsConsumers(page, config, tools, fixture, report),
    ],
  ]) {
    if (phase !== undefined && phase !== name) continue;
    report.stage = name;
    await run();
    const errors = await readBrowserErrors(page);
    report.browserErrors.push(...errors);
    assert.deepEqual(
      errors,
      [],
      `Analytics ${name}: no browser runtime/resource errors`,
    );
  }
  report.status = 'passed';
} catch (error) {
  failure = error;
  report.error = error.stack ?? String(error);
  report.stoppedForUserControl ||= isBrowserControlStop(error);
  if (!report.stoppedForUserControl) {
    try {
      report.failureState = await page.evaluate(() => ({
        url: location.href,
        readyState: document.readyState,
        overviewPresent: !!document.querySelector(
          '[data-testid="analytics-overview"]',
        ),
        versionsTitle: document.querySelector(
          '[data-testid="analytics-versions"] h2',
        )?.textContent,
        radios: [
          ...document.querySelectorAll(
            '[role="radiogroup"][aria-label="统计周期"] button[role="radio"]',
          ),
        ].map((button) => {
          const rect = button.getBoundingClientRect();
          const hit = document.elementFromPoint(
            rect.x + rect.width / 2,
            rect.y + rect.height / 2,
          );
          return {
            text: button.textContent,
            checked: button.getAttribute('aria-checked'),
            selected: button.getAttribute('data-selected'),
            disabled: button.disabled,
            focused: document.activeElement === button,
            rect: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
            },
            centerHitIsButton: hit === button,
            centerHitTag: hit?.tagName,
          };
        }),
        analyticsRequests: performance
          .getEntriesByType('resource')
          .filter(({ name }) =>
            new URL(name).pathname.startsWith('/api/analytics/'),
          )
          .map(({ name, startTime, duration }) => ({
            path: new URL(name).pathname + new URL(name).search,
            startTime,
            duration,
          })),
      }));
      report.failureSnapshot = await page.snapshot();
      await page.screenshot({
        path: join(config.output, 'analytics-failure.png'),
      });
    } catch (captureError) {
      report.captureError = String(captureError);
      report.stoppedForUserControl ||= isBrowserControlStop(captureError);
    }
  }
} finally {
  try {
    if (fixture) {
      await fixture.dispose();
      report.fixtureRestored = true;
    }
    if (!failure) {
      if (theme !== undefined)
        await page.evaluate((value) => {
          if (value === null) localStorage.removeItem('theme');
          else localStorage.setItem('theme', value);
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
          'Analytics verification and fixture restoration failed',
        )
      : error;
  }
  report.finishedAt = new Date().toISOString();
  await writeFile(
    join(config.output, 'analytics.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
if (failure) throw failure;
console.log({
  analytics: report.status,
  phase: report.phase,
  layouts: report.layouts.length,
  report: join(config.output, 'analytics.json'),
});
