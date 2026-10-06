/* global taskSpace, config */
const assert = (await import('node:assert/strict')).default;
const { writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { identitySql } = await import(config.identitySessionScript);
const { seedLibraryBatch, readLibraryBatchSnapshot, cleanLibraryBatch } =
  await import(
    new URL('./library-batch-fixture.mjs', config.libraryDetailScript).href
  );
const { signInToLibrary } = await import(
  new URL('./library-login.mjs', config.libraryDetailScript).href
);
const { installBrowserErrors, assertNoBrowserErrors } = await import(
  config.errorsScript
);
const task = await taskSpace(config.spaceId);
const page = task.page(config.pageLabel ?? 'p1');
const sql = (statement) => identitySql(config, statement);
const report = {
  status: 'failed',
  phase: config.libraryBatchPhase ?? 'full',
  taskSpaceId: task.spaceId,
  origin: config.origin,
  checks: [],
  layouts: [],
  screenshots: [],
  limitations: [
    'Ego Chromium responsive/keyboard checks; physical devices and Release containers are outside this local task.',
  ],
};
const preferenceKey = 'ariso:library-preferences:v1';
let savedPreference;
let errorScript;
let sessionScript;
const sessionEvidenceKey = 'ariso:issue177-browser:session-evidence';
report.sessionWaits = [];
const { createBatchHelpers } = await import(
  new URL('./library-batch-helpers.mjs', config.libraryDetailScript).href
);
const {
  verifyAlbumTargetLayouts,
  verifyShortBatchMenu,
  verifyAlbumTargetReads,
} = await import(
  new URL('./library-batch-album-targets.mjs', config.libraryDetailScript).href
);
const {
  verifyAlbumMixedResults,
  verifyAlbumCrossPageRetry,
  verifyAlbumRemoval,
  verifyCurrentAlbumRemoval,
  verifyDeletedAlbumTarget,
} = await import(
  new URL('./library-batch-albums.mjs', config.libraryDetailScript).href
);
const {
  verifyTagTargets,
  verifyTagTargetStates,
  verifyTagRetryAfterAlbumError,
} = await import(
  new URL('./library-batch-tags.mjs', config.libraryDetailScript).href
);
const {
  verifyVisibilitySuccess,
  verifyVisibilityFailures,
  verifyVisibilityRecovery,
} = await import(
  new URL('./library-batch-visibility.mjs', config.libraryDetailScript).href
);
const { verifyBatchLifecycle } = await import(
  new URL('./library-batch-lifecycle.mjs', config.libraryDetailScript).href
);
const { verifyBatchCache } = await import(
  new URL('./library-batch-cache.mjs', config.libraryDetailScript).href
);

const { verifyTagFailures, verifyTagUnknown } = await import(
  new URL('./library-batch-tag-feedback.mjs', config.libraryDetailScript).href
);
const { verifyBatchRefreshFeedback } = await import(
  new URL('./library-batch-refresh.mjs', config.libraryDetailScript).href
);
const helpers = createBatchHelpers({ page, config, report });
const feedbackScenarios = [
  verifyVisibilitySuccess,
  verifyVisibilityFailures,
  verifyBatchRefreshFeedback,
];
const tagOutcomeScenarios = [
  (context) => verifyTagFailures(context, 'add-tags'),
  (context) => verifyTagFailures(context, 'remove-tags'),
  (context) => verifyTagUnknown(context, 'add-tags'),
  (context) => verifyTagUnknown(context, 'remove-tags'),
];
const tagScenarios = [
  ...tagOutcomeScenarios,
  verifyTagTargetStates,
  verifyTagTargets,
  verifyTagRetryAfterAlbumError,
];
const scenariosByPhase = {
  full: [
    verifyShortBatchMenu,
    verifyAlbumTargetLayouts,
    verifyAlbumTargetReads,
    verifyAlbumMixedResults,
    verifyAlbumCrossPageRetry,
    verifyAlbumRemoval,
    (context) => verifyTagTargets(context, [0, 1]),
    ...tagOutcomeScenarios,
    verifyCurrentAlbumRemoval,
    verifyDeletedAlbumTarget,
    verifyVisibilityRecovery,
    ...feedbackScenarios,
    verifyBatchLifecycle,
    verifyBatchCache,
  ],
  'review-fixes': [
    verifyBatchCache,
    (context) => verifyTagTargets(context, [0, 1]),
    ...tagOutcomeScenarios,
    ...feedbackScenarios,
  ],
  cache: [verifyBatchCache],
  recovery: [verifyVisibilityRecovery],
  lifecycle: [verifyBatchLifecycle],
  representative: [(context) => verifyAlbumTargetLayouts(context, [390, 1440])],
  visibility: feedbackScenarios,
  feedback: [...feedbackScenarios, ...tagScenarios],
  'tag-states': tagScenarios,
};
const scenarios = scenariosByPhase[report.phase];
assert.ok(scenarios, `Unknown batch verification phase: ${report.phase}`);

try {
  await page.goto(`${config.origin}/library?q=issue177-&pageSize=80&page=1`);
  await page.waitForFunction(
    () =>
      location.pathname === '/login' ||
      !!document.querySelector('[data-testid="library-list"]'),
  );
  if (new URL(await page.url()).pathname === '/login')
    await signInToLibrary(page, config, report);
  savedPreference = await page.evaluate(
    (key) => localStorage.getItem(key),
    preferenceKey,
  );
  await page.evaluate(
    (key) =>
      localStorage.setItem(
        key,
        JSON.stringify({ layout: 'grid', loadingMode: 'pages' }),
      ),
    preferenceKey,
  );
  errorScript = await installBrowserErrors(page);
  await page.evaluate(
    (key) => sessionStorage.removeItem(key),
    sessionEvidenceKey,
  );
  ({ identifier: sessionScript } = await page.cdp(
    'Page.addScriptToEvaluateOnNewDocument',
    {
      source: `(() => {
    const original = window.fetch;
    window.fetch = async (...args) => {
      const response = await original(...args);
      if (new URL(String(args[0]), location.href).pathname === '/api/auth/get-session') {
        const key = '${sessionEvidenceKey}';
        const requests = JSON.parse(sessionStorage.getItem(key) ?? '[]');
        requests.push({at:Date.now(),status:response.status,retryAfterSeconds:response.status === 429 ? Number(response.headers.get('x-retry-after')) : null});
        sessionStorage.setItem(key, JSON.stringify(requests));
      }
      return response;
    };
  })();`,
    },
  ));
  await helpers.resize(1440);

  for (const verify of scenarios) {
    // Fresh records make every scenario's preparation independent of previous writes.
    const fixture = await seedLibraryBatch(config, sql);
    try {
      const before = await readLibraryBatchSnapshot(sql, fixture.directory);
      assert.equal(before.images.length, 201);
      assert.equal(before.files.length, 402);
      await page.goto(
        `${config.origin}/library?q=issue177-&pageSize=80&page=1`,
      );
      await helpers.loaded(80);
      await verify({ page, config, sql, report, fixture, before, ...helpers });
    } finally {
      await page.evaluate(() => {
        window.__visibilityObserver?.disconnect();
        window.__tagSubmitObserver?.disconnect();
        window.__tagTargetRelease?.();
      });
      await cleanLibraryBatch(sql, fixture);
    }
  }
  const sessionResponses = await page.evaluate(
    (key) => JSON.parse(sessionStorage.getItem(key) ?? '[]'),
    sessionEvidenceKey,
  );
  report.sessionRateLimit = {
    observedResponses: sessionResponses.length,
    limitedResponses: sessionResponses.filter((entry) => entry.status === 429),
    waits: report.sessionWaits,
  };
  report.errors = await assertNoBrowserErrors(page);
  report.status = 'passed';
} catch (error) {
  report.error = error.stack ?? String(error);
  try {
    report.failureFocus = await page.evaluate(() => ({
      tag: document.activeElement?.tagName,
      label: document.activeElement?.getAttribute('aria-label'),
      testId: document.activeElement?.getAttribute('data-testid'),
      connected: document.activeElement?.isConnected,
    }));
    await page.screenshot({
      path: join(config.output, 'library-batch-failure.png'),
    });
  } catch (screenshotError) {
    report.screenshotError = screenshotError.stack ?? String(screenshotError);
  }
  throw error;
} finally {
  await page.evaluate(() => {
    window.__visibilityObserver?.disconnect();
    window.__tagSubmitObserver?.disconnect();
    window.__tagTargetRelease?.();
  });
  if (savedPreference !== undefined)
    await page.evaluate(
      ({ key, saved }) => {
        if (saved === null) localStorage.removeItem(key);
        else localStorage.setItem(key, saved);
      },
      { key: preferenceKey, saved: savedPreference },
    );
  if (sessionScript) {
    await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
      identifier: sessionScript,
    });
    await page.evaluate(
      (key) => sessionStorage.removeItem(key),
      sessionEvidenceKey,
    );
  }
  if (errorScript)
    await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
      identifier: errorScript,
    });
  await writeFile(
    join(config.output, 'library-batch.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
console.log(report);
