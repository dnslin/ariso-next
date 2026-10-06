/* global taskSpace, config */
const assert = (await import('node:assert/strict')).default;
const { writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { identitySql } = await import(config.identitySessionScript);
const { seedLibraryBatch, cleanLibraryBatch } = await import(
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
  taskSpaceId: task.spaceId,
  checks: [],
  layouts: [],
  screenshots: [],
  browserChecks: [],
  fixtureTransitions: [],
};
let errorScript;
let savedTheme;
let peer;
let peerErrorScript;
const { createTrashHelpers, disabledStorageId, progressJobId } = await import(
  new URL('./trash-query-helpers.mjs', config.libraryDetailScript).href
);
const {
  verifyQueryLayouts,
  verifyRepresentativeQuery,
  verifyApprovedQueries,
  verifyEmptyInvalidQuery,
  verifyDefaultInvalidQuery,
  verifyCancelledConfirmation,
} = await import(
  new URL('./trash-query-scenarios.mjs', config.libraryDetailScript).href
);
const { verifyBatchOutcomes, verifyUnknownAndUnsent } = await import(
  new URL('./trash-batch-outcomes.mjs', config.libraryDetailScript).href
);
const { verifyFilterConsumers } = await import(
  new URL('./trash-filter-consumers.mjs', config.libraryDetailScript).href
);
const { verifyApprovedProgress } = await import(
  new URL('./trash-batch-progress.mjs', config.libraryDetailScript).href
);
const {
  verifyTrashQueryRefresh,
  verifySingleCleanupCycles,
  verifyBatchCleanupCycles,
  restoreReviewTraffic,
} = await import(
  new URL('./trash-review-fixes.mjs', config.libraryDetailScript).href
);
const reviewFixes = [
  verifyTrashQueryRefresh,
  verifySingleCleanupCycles,
  verifyBatchCleanupCycles,
];
const helpers = createTrashHelpers({ page, config, report });
const approvedResults = [
  verifyBatchOutcomes,
  verifyUnknownAndUnsent,
  verifyFilterConsumers,
];
const scenariosByPhase = {
  full: [
    verifyQueryLayouts,
    verifyApprovedQueries,
    verifyBatchOutcomes,
    verifyUnknownAndUnsent,
    verifyEmptyInvalidQuery,
    verifyFilterConsumers,
    verifyApprovedProgress,
    ...reviewFixes,
  ],
  representative: [verifyRepresentativeQuery],
  'query-error': [verifyDefaultInvalidQuery],
  confirmation: [verifyCancelledConfirmation],
  'approved-ui': [
    verifyApprovedQueries,
    ...approvedResults,
    verifyApprovedProgress,
    ...reviewFixes,
  ],
  'approved-results': approvedResults,
  'approved-query': [verifyApprovedQueries],
  'review-fixes': reviewFixes,
  'approved-progress': [verifyApprovedProgress],
};
report.phase = config.trashPhase ?? 'full';
const scenarios = scenariosByPhase[report.phase];
assert.ok(scenarios, `Unknown trash verification phase: ${report.phase}`);
async function captureFailure(error) {
  report.error = error.stack ?? String(error);
  report.failureTasks = await sql(
    "SELECT image_id,status,cycle,error FROM media_cleanup_jobs WHERE image_id LIKE 'issue177-%'",
  );
  report.failureView = await page.snapshot({ scope: 'full_page' });
  await page.screenshot({
    path: join(config.output, 'trash-query-batch-failure.png'),
  });
}
async function checkBrowserErrors(current, label, boundary) {
  const evidence = await current.evaluate(() => ({
    at: Date.now(),
    url: location.href,
    previews: performance
      .getEntriesByType('resource')
      .filter((entry) => new URL(entry.name).pathname.startsWith('/api/trash/'))
      .map((entry) => ({
        path: new URL(entry.name).pathname + new URL(entry.name).search,
        status: entry.responseStatus ?? null,
        startedAt: performance.timeOrigin + entry.startTime,
        duration: entry.duration,
      })),
  }));
  const check = {
    scenario: report.activeCheck,
    page: label,
    boundary,
    ...evidence,
  };
  report.browserChecks.push(check);
  try {
    return await assertNoBrowserErrors(current);
  } catch (error) {
    check.errors = error.actual;
    throw error;
  }
}
try {
  await page.goto(`${config.origin}/library`);
  await page.waitForFunction(
    () =>
      location.pathname === '/login' ||
      !!document.querySelector('[data-testid="library-list"]'),
  );
  if (new URL(await page.url()).pathname === '/login')
    await signInToLibrary(page, config, report);
  savedTheme = await page.evaluate(() => localStorage.getItem('theme'));
  errorScript = await installBrowserErrors(page);
  if (scenarios.some((verify) => reviewFixes.includes(verify))) {
    peer = await task.newPage();
    await peer.goto(`${config.origin}/trash`);
    await peer.waitForSelector('#trash-title');
    peerErrorScript = await installBrowserErrors(peer);
  }
  for (const verify of scenarios) {
    report.activeCheck = verify.name;
    const fixture = await seedLibraryBatch(config, sql);
    try {
      await sql(
        "UPDATE media_images SET trashed_at=1811000000000 WHERE id LIKE 'issue177-%'",
      );
      await page.goto(`${config.origin}/trash?q=issue177-&pageSize=80&page=1`);
      await helpers.loaded(80);
      await verify({ page, peer, config, sql, report, fixture, ...helpers });
      report.errors = await checkBrowserErrors(
        page,
        'main',
        'scenario-completed',
      );
      if (peer)
        report.peerErrors = await checkBrowserErrors(
          peer,
          'peer',
          'scenario-completed',
        );
    } catch (error) {
      await captureFailure(error);
      throw error;
    } finally {
      await helpers.restoreBatchTraffic();
      await restoreReviewTraffic(page);
      await page.goto(`${config.origin}/settings/processing`);
      if (peer) await peer.goto(`${config.origin}/settings/processing`);
      report.fixtureTransitions.push({
        scenario: report.activeCheck,
        event: 'cleanup-started-after-leaving-pages',
        at: Date.now(),
      });
      await sql('DROP TRIGGER IF EXISTS issue178_cleanup_failure');
      await sql(`DELETE FROM media_jobs WHERE id='${progressJobId}'`);
      await sql(
        "DELETE FROM media_cleanup_jobs WHERE image_id LIKE 'issue177-%'",
      );
      await cleanLibraryBatch(sql, fixture);
      await sql(`DELETE FROM storage_configs WHERE id='${disabledStorageId}'`);
      report.fixtureTransitions.push({
        scenario: report.activeCheck,
        event: 'cleanup-completed',
        at: Date.now(),
      });
    }
  }
  report.errors = await checkBrowserErrors(
    page,
    'main',
    'all-fixtures-cleaned',
  );
  if (peer)
    report.peerErrors = await checkBrowserErrors(
      peer,
      'peer',
      'all-fixtures-cleaned',
    );
  report.status = 'passed';
} catch (error) {
  if (Array.isArray(error.actual) && error.actual.every((entry) => entry.kind))
    report.errors = error.actual;
  if (!report.error) await captureFailure(error);
  throw error;
} finally {
  if (savedTheme !== undefined) {
    const restored = await page.evaluate((saved) => {
      if (saved === null) localStorage.removeItem('theme');
      else localStorage.setItem('theme', saved);
      return localStorage.getItem('theme');
    }, savedTheme);
    assert.equal(restored, savedTheme);
    report.restoredTheme = restored;
  }
  await helpers.restoreBatchTraffic();
  await restoreReviewTraffic(page);
  if (peer) {
    if (peerErrorScript)
      await peer.cdp('Page.removeScriptToEvaluateOnNewDocument', {
        identifier: peerErrorScript,
      });
    await peer.close();
  }
  if (errorScript)
    await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
      identifier: errorScript,
    });
  await writeFile(
    join(config.output, 'trash-query-batch.json'),
    JSON.stringify(report, null, 2),
  );
}
