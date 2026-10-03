/* global taskSpace, config */
const assert = (await import('node:assert/strict')).default;
const { writeFile, readFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { identitySql } = await import(config.identitySessionScript);
const {
  seedReprocess,
  cleanReprocess,
  readVersions,
  readJobs,
  reprocessIds,
  quote,
} = await import(
  new URL('./library-batch-reprocess-fixture.mjs', config.libraryDetailScript)
    .href
);
const { reprocessHelpers, workspace } = await import(
  new URL('./library-batch-reprocess-helpers.mjs', config.libraryDetailScript)
    .href
);
const { signInToLibrary } = await import(
  new URL('./library-login.mjs', config.libraryDetailScript).href
);
const { readProcessingSettings, enableProcessing, restoreProcessingSettings } =
  await import(
    new URL('./library-detail-171-helpers.mjs', config.libraryDetailScript).href
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
  origin: config.origin,
  checks: [],
  layouts: [],
  screenshots: [],
  figma: {
    operation: ['387:6074', '387:6018'],
    scopes: ['521:10712', '521:10141'],
    failedOnlyAll: ['521:11136', '521:10257'],
    result: ['388:7246', '388:7454'],
  },
  limitations: [
    'Real worker evidence uses disposable local storage and installed ImageMagick/ExifTool. Controlled persisted queued/running/failure snapshots are explicitly rendering evidence.',
    'Design acceptance is recorded separately by an independent reviewer; browser assertions and screenshot count are not design acceptance.',
    'Physical mobile, nonzero safe area, release images and containers are outside local verification.',
  ],
};
const h = reprocessHelpers({ page, config, report });
const preferenceKey = 'ariso:library-preferences:v1';
let savedPreference, settings, fixture, errorScript;
let quality;
try {
  await page.goto(`${config.origin}/library?q=issue186-&pageSize=20`);
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
  settings = await readProcessingSettings(sql);
  [{ quality }] = await sql('SELECT quality FROM media_settings WHERE id=1');
  await enableProcessing(sql);
  fixture = await seedReprocess(config, sql);
  await h.resize(1440);

  await h.visit([reprocessIds[0], reprocessIds[1]]);
  await h.layouts('scope', [360, 390, 430, 768, 1440]);
  await h.resize(390, 500);
  await page.focus('[data-testid="batch-reprocess-scope-watermark"] input');
  await page.keyboard.press('Space');
  const short = await page.evaluate(() => {
    const submit = document
      .querySelector('[data-testid="batch-submit"]')
      .getBoundingClientRect();
    return {
      height: innerHeight,
      submitBottom: submit.bottom,
      radioChecked: document.querySelector(
        '[data-testid="batch-reprocess-scope-watermark"] input',
      )?.checked,
    };
  });
  assert.equal(short.radioChecked, true, 'Scope is keyboard selectable');
  await page.focus('[data-testid="batch-submit"]');
  assert.ok(
    await page.evaluate(
      () =>
        document
          .querySelector('[data-testid="batch-submit"]')
          .getBoundingClientRect().bottom <= innerHeight,
    ),
    'Short viewport scroll keeps submit reachable',
  );
  await page.screenshot({
    path: join(config.output, 'library-reprocess-scope-dark-390-short.png'),
  });
  report.screenshots.push('library-reprocess-scope-dark-390-short.png');
  await page.keyboard.press('Escape');
  await page.waitForSelector(workspace, { state: 'hidden' });
  assert.equal(
    await page.evaluate(() =>
      document.activeElement?.getAttribute('aria-label'),
    ),
    '操作已选 2 张图片',
    'Dismissal returns focus to selection source',
  );
  report.checks.push(
    'Actual combined library page renders all four scope choices in both themes at 360/390/430/768/1440; radio selection and Escape focus return work with a 390×500 short viewport.',
  );

  // A known failed original may only retry all. The succeeding job below is real.
  await sql(
    `UPDATE media_images SET processing_status='failed' WHERE id=${quote(reprocessIds[0])}`,
  );
  await h.visit([reprocessIds[0]]);
  for (const scope of ['compressed', 'thumbnail', 'watermark'])
    assert.ok(
      await page.evaluate(
        (scope) =>
          document.querySelector(
            `[data-testid="batch-reprocess-scope-${scope}"] input`,
          )?.disabled,
        scope,
      ),
      'Failed image disables single-version scope',
    );
  await h.layouts('failed-only-all');
  await h.monitor();
  const original = (await readVersions(sql, reprocessIds[0])).find(
    (row) => row.kind === 'original',
  ).object_id;
  await h.submit();
  await h.terminal([reprocessIds[0]]);
  let jobs = await readJobs(sql);
  const first = jobs.find((job) => job.image_id === reprocessIds[0]);
  assert.equal(first.status, 'succeeded');
  assert.equal(first.scope, 'all');
  assert.equal((await readVersions(sql, reprocessIds[0])).length, 4);
  assert.equal(
    (await readVersions(sql, reprocessIds[0])).find(
      (row) => row.kind === 'original',
    ).object_id,
    original,
  );
  const polls = (await h.traffic()).filter(
    (entry) => entry.request.mode === 'check',
  ).length;
  assert.ok(polls > 0, 'Real accepted task progress was actually checked');
  const firstApply = (await h.batchTraffic()).find(
    (entry) => entry.request.mode === 'apply',
  ).request;
  for (const entry of (await h.traffic()).filter(
    (entry) => entry.request.mode === 'check',
  ))
    assert.deepEqual(
      entry.request.command,
      firstApply.command,
      'Progress checks preserve the accepted exact UUID',
    );
  await page.waitForTimeout(4200);
  assert.equal(
    (await h.traffic()).filter((entry) => entry.request.mode === 'check')
      .length,
    polls,
    'Terminal job stops polling',
  );
  await h.layouts('real-success');
  await h.close();
  report.checks.push(
    'A failed original allows only all; a real batch acceptance invokes ImageMagick and succeeds, publishes all three derived versions, preserves the original object and stops progress polling after terminal state.',
  );

  // Every request snapshots the settings actually saved at its own acceptance.
  for (const [index, scope] of [
    'compressed',
    'thumbnail',
    'watermark',
  ].entries()) {
    const before = await readVersions(sql, reprocessIds[0]);
    await sql(`UPDATE media_settings SET quality=${70 + index} WHERE id=1`);
    await h.visit([reprocessIds[0]]);
    await h.monitor();
    await h.submit(scope);
    await h.terminal([reprocessIds[0]]);
    const after = await readVersions(sql, reprocessIds[0]);
    for (const row of before)
      assert.equal(
        after.find((value) => value.kind === row.kind).object_id ===
          row.object_id,
        row.kind !== scope,
        `Only ${scope} is replaced`,
      );
    const request = (await h.batchTraffic())[0].request;
    const [job] = await sql(
      `SELECT status,snapshot FROM media_jobs WHERE id=${quote(request.command.taskIds[reprocessIds[0]])}`,
    );
    assert.equal(job.status, 'succeeded');
    assert.equal(JSON.parse(job.snapshot).quality, 70 + index);
    assert.deepEqual(JSON.parse(first.snapshot).quality, quality);
    await h.close();
  }
  report.checks.push(
    'Three real single-version jobs preserve every unselected published version. Each acceptance captures the independently changed latest quality; the earlier all-scope snapshot remains unchanged.',
  );

  // Mixed selection must not silently upgrade a failed original to all.
  await sql(
    `UPDATE media_images SET processing_status='failed' WHERE id=${quote(reprocessIds[1])}`,
  );
  await sql(
    `CREATE TRIGGER issue186_hold AFTER INSERT ON media_jobs WHEN NEW.image_id=${quote(reprocessIds[0])} BEGIN UPDATE media_jobs SET next_attempt_at=${Date.now() + 3600000} WHERE id=NEW.id; END`,
  );
  await h.visit([reprocessIds[0], reprocessIds[1]]);
  await h.monitor();
  await h.submit('watermark');
  await page.waitForSelector(
    `[data-batch-result-id="${reprocessIds[0]}"][data-job-status="queued"]`,
  );
  await page.waitForSelector(
    `[data-batch-result-id="${reprocessIds[1]}"][data-result-status="failed"]`,
  );
  await h.layouts('mixed-conflict');
  const mixed = (await h.batchTraffic()).filter(
    (entry) => entry.request.mode === 'apply',
  );
  assert.equal(mixed[0].request.command.scope, 'watermark');
  assert.equal(
    mixed[0].response.results.find((row) => row.id === reprocessIds[1]).code,
    'MEDIA_REPROCESS_SCOPE',
  );
  assert.equal(
    (await readJobs(sql)).filter((row) => row.image_id === reprocessIds[1])
      .length,
    0,
  );
  await sql('DROP TRIGGER issue186_hold');
  const heldWatermark = mixed[0].request.command.taskIds[reprocessIds[0]];
  await sql(
    `UPDATE media_jobs SET status='failed',error='Controlled persisted watermark execution failure' WHERE id=${quote(heldWatermark)}`,
  );
  await page.waitForSelector(
    `[data-task-id="${heldWatermark}"][data-job-status="failed"]`,
  );
  await page.click('[data-testid="batch-retained"]');
  await h.layouts('retained-conflict');
  await h.resize(390, 500);
  const shortFooter = await page.evaluate(() =>
    [...document.querySelectorAll('footer.shell-footer button')].map((node) => {
      const rect = node.getBoundingClientRect();
      const hit = document
        .elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
        ?.closest('button');
      return {
        name: node.textContent.trim(),
        target: node.dataset.testid,
        hit: hit?.dataset.testid,
        ownHit: hit === node,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        bottom: rect.bottom,
        scrollWidth: node.scrollWidth,
        scrollHeight: node.scrollHeight,
      };
    }),
  );
  for (const control of shortFooter) {
    assert.ok(
      control.x >= 0 &&
        control.x + control.width <= 390 &&
        control.y >= 0 &&
        control.bottom <= 500,
      'Every multi-failure footer action stays in the 390×500 short viewport',
    );
    assert.ok(
      control.width >= 44 &&
        control.height >= 44 &&
        control.scrollWidth <= control.width + 1 &&
        control.scrollHeight <= control.height + 1,
      `Short footer ${control.name} keeps its complete label within a 44px click target`,
    );
    assert.equal(
      control.ownHit,
      true,
      `Short footer ${control.name} native pointer hits its own button`,
    );
  }
  report.shortFailureFooter = shortFooter;
  await page.screenshot({
    path: join(
      config.output,
      'library-reprocess-retained-conflict-dark-390-short.png',
    ),
  });
  report.screenshots.push(
    'library-reprocess-retained-conflict-dark-390-short.png',
  );
  await h.resize(390);
  const allRetryTarget = await page.evaluate(() => {
    const node = document.querySelector('[data-testid="batch-retry-all"]');
    const rect = node.getBoundingClientRect();
    return {
      target: node.dataset.testid,
      hit: document
        .elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
        ?.closest('button')?.dataset.testid,
    };
  });
  assert.equal(
    allRetryTarget.hit,
    allRetryTarget.target,
    'Native pointer hits the explicit all retry button without adjacent label overlap',
  );
  await page.click('[data-testid="batch-retry-all"]');
  await page.waitForFunction(
    () =>
      window.__reprocessTraffic.filter(
        (entry) => entry.request.mode === 'apply',
      ).length >= 2,
  );
  assert.deepEqual(
    (await h.batchTraffic()).filter(
      (entry) => entry.request.mode === 'apply',
    )[1].request.ids,
    [reprocessIds[1]],
    'The actual all retry immediately sends only the rejected image',
  );
  await h.terminal([reprocessIds[1]]);
  const allRetry = (await h.batchTraffic()).filter(
    (entry) => entry.request.mode === 'apply',
  )[1].request;
  assert.deepEqual(allRetry.ids, [reprocessIds[1]]);
  assert.equal(allRetry.command.scope, 'all');
  await page.click('[data-testid="batch-retained"]');
  await page.click(
    '[data-testid="batch-task-retry"][data-retry-scope="watermark"]',
  );
  await page.waitForFunction(
    (id) =>
      document.querySelector(`[data-batch-result-id="${id}"]`)?.dataset
        .jobStatus === 'succeeded',
    reprocessIds[0],
    { timeout: 30000 },
  );
  const watermarkRetry = (await h.batchTraffic()).filter(
    (entry) => entry.request.mode === 'apply',
  )[2].request;
  assert.deepEqual(watermarkRetry.ids, [reprocessIds[0]]);
  assert.equal(watermarkRetry.command.scope, 'watermark');
  assert.notEqual(
    watermarkRetry.command.taskIds[reprocessIds[0]],
    heldWatermark,
  );
  assert.notEqual(
    allRetry.command.taskIds[reprocessIds[1]],
    mixed[0].request.command.taskIds[reprocessIds[1]],
  );
  const mixedJobs = await readJobs(sql);
  for (const taskId of [
    allRetry.command.taskIds[reprocessIds[1]],
    watermarkRetry.command.taskIds[reprocessIds[0]],
  ])
    assert.equal(
      mixedJobs.find((job) => job.id === taskId).status,
      'succeeded',
    );
  await h.close();
  report.checks.push(
    'Mixed watermark selection accepts the ready image and rejects the failed original without widening. The isolated accepted watermark is held and marked failed solely for rendering/client callback verification. Explicit all retry sends only the rejected image; then explicit original-watermark retry sends only its failed task with a new UUID, preserving its original scope even after the all action. Both new requests complete with the actual worker.',
  );

  // Lose a successful response. Check preserves the exact original UUID and never applies again.
  await h.visit([reprocessIds[2]]);
  await h.monitor('lose');
  await h.submit('thumbnail');
  await page.waitForSelector('[data-testid="batch-check"]');
  const lost = (await h.batchTraffic())[0].request;
  await page.evaluate(() => {
    window.__reprocessFault = 'check-lose';
  });
  await page.click('[data-testid="batch-check"]');
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="library-batch"]')
        .getAttribute('aria-busy') !== 'true' &&
      !!document.querySelector('[data-testid="batch-check"]'),
  );
  await h.layouts('unknown-read-error');
  assert.equal(
    await page.evaluate(
      () => !!document.querySelector('[data-testid="batch-retry"]'),
    ),
    false,
    'Unknown receipt has no write retry',
  );
  await page.click('[data-testid="batch-check"]');
  await h.terminal([reprocessIds[2]]);
  const reconciled = await h.batchTraffic();
  assert.equal(
    reconciled.filter((entry) => entry.request.mode === 'apply').length,
    1,
  );
  for (const entry of reconciled.filter(
    (entry) => entry.request.mode === 'check',
  ))
    assert.deepEqual(entry.request.command, lost.command);
  assert.equal(
    (await readJobs(sql)).filter(
      (job) => job.id === lost.command.taskIds[reprocessIds[2]],
    ).length,
    1,
  );
  await h.close();
  report.checks.push(
    'Successful real apply response loss remains unknown; losing the first real read-only check still exposes only check. Recovery queries the same UUID, never reapplies, and finds exactly one persisted worker job.',
  );
  await h.visit([reprocessIds[2]]);
  await h.monitor('never-sent');
  await h.submit('thumbnail');
  await page.waitForSelector('[data-testid="batch-check"]');
  const neverSent = (await h.batchTraffic())[0].request;
  await sql(
    `UPDATE media_images SET original_name='outside-query.png',display_name='outside-query.png' WHERE id=${quote(reprocessIds[2])}`,
  );
  await page.click('[data-testid="batch-check"]');
  await page.waitForFunction((id) => {
    const row = document.querySelector(`[data-batch-result-id="${id}"]`);
    return (
      row?.dataset.resultStatus === 'unknown' &&
      document
        .querySelector('[data-testid="library-batch"]')
        .getAttribute('aria-busy') !== 'true'
    );
  }, reprocessIds[2]);
  const missingReceipt = (await h.batchTraffic()).find(
    (entry) => entry.request.mode === 'check',
  );
  assert.equal(missingReceipt.response.results[0].status, 'unknown');
  assert.equal(missingReceipt.response.results[0].inQuery, false);
  assert.deepEqual(missingReceipt.request.command, neverSent.command);
  assert.equal(
    await page.evaluate(
      () => !!document.querySelector('[data-testid="library-selection"]'),
    ),
    false,
    'Unknown item proven outside the original query is removed from selection',
  );
  assert.equal(
    await page.evaluate(
      () =>
        !!document.querySelector(
          '[data-testid="batch-retry"],[data-testid="batch-task-retry"]',
        ),
    ),
    false,
    'Unconfirmed task remains read-only after selection removal',
  );
  assert.equal(
    (await readJobs(sql)).filter(
      (job) => job.id === neverSent.command.taskIds[reprocessIds[2]],
    ).length,
    0,
  );
  await sql(
    `UPDATE media_images SET original_name=${quote(`${reprocessIds[2]}.png`)},display_name=${quote(`${reprocessIds[2]}.png`)} WHERE id=${quote(reprocessIds[2])}`,
  );
  await h.close();
  report.checks.push(
    'An apply interrupted before backend acceptance has no persisted UUID. Renaming that isolated image out of the real saved query makes the actual exact-UUID check return unknown/inQuery=false: selection clears while the original UUID remains read-only and no write retry appears.',
  );

  // Delay claim, not the worker tool: render deterministic queue/progress states.
  await sql(
    `CREATE TRIGGER issue186_hold AFTER INSERT ON media_jobs WHEN NEW.image_id LIKE 'issue186-%' BEGIN UPDATE media_jobs SET next_attempt_at=${Date.now() + 3600000} WHERE id=NEW.id; END`,
  );
  await h.visit([reprocessIds[0]]);
  await h.monitor('hold');
  await page.click('[data-testid="batch-submit"]');
  await page.waitForFunction(() => !!window.__reprocessRelease);
  assert.ok(
    await page.evaluate(
      () =>
        document
          .querySelector('[data-testid="library-batch"]')
          .getAttribute('aria-busy') === 'true' &&
        !document.querySelector('[data-testid="batch-submit"]') &&
        document.querySelector('[data-testid="batch-done"]').disabled &&
        !document.querySelector(
          '[data-testid="batch-retry"],[data-testid="batch-task-retry"]',
        ),
    ),
    'Actual in-flight acceptance replaces scope submit with a busy result; return is disabled and no duplicate write control exists',
  );
  assert.equal(
    (await h.batchTraffic()).filter((entry) => entry.request.mode === 'apply')
      .length,
    1,
    'Only one actual apply is in flight',
  );
  await h.layouts('submitting');
  await page.evaluate(() => window.__reprocessRelease());
  await page.waitForSelector('[data-job-status="queued"]');
  const queued = (await h.batchTraffic())[0].request.command.taskIds[
    reprocessIds[0]
  ];
  await h.layouts('persisted-queued');
  await sql(
    `UPDATE media_jobs SET status='running',step='thumbnail' WHERE id=${quote(queued)}`,
  );
  await page.waitForSelector('[data-job-status="running"]');
  await h.layouts('persisted-running');
  await page.evaluate(() => {
    window.__reprocessFault = 'status-lose';
  });
  await page.waitForSelector('[data-testid="batch-progress-check"]', {
    timeout: 10000,
  });
  const statusReads = (await h.traffic()).filter(
    (entry) => entry.request.mode === 'check',
  ).length;
  await page.waitForTimeout(2200);
  assert.equal(
    (await h.traffic()).filter((entry) => entry.request.mode === 'check')
      .length,
    statusReads,
    'Progress transport error stops auto polling',
  );
  await h.layouts('progress-read-error');
  await page.focus('[data-testid="batch-progress-check"]');
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-testid="batch-progress-check"]', {
    state: 'hidden',
  });
  await sql(
    `UPDATE media_jobs SET status='failed',error='Controlled persisted rendering failure' WHERE id=${quote(queued)}`,
  );
  await page.waitForSelector('[data-job-status="failed"]');
  await h.layouts('persisted-execution-failure');
  await sql('DROP TRIGGER issue186_hold');
  await sql(
    `UPDATE media_jobs SET status='queued',error=NULL,next_attempt_at=NULL WHERE id=${quote(queued)}`,
  );
  await h.close();
  const checksAfterClose = (await h.traffic()).filter(
    (entry) =>
      entry.request.mode === 'check' &&
      entry.request.command.taskIds[reprocessIds[0]] === queued,
  ).length;
  await page.waitForFunction(
    async (id) => {
      const response = await fetch(`/api/images/${id}`);
      if (!response.ok)
        throw new Error(`Real completion detail HTTP ${response.status}`);
      return (await response.json()).processingJob?.status === 'succeeded';
    },
    reprocessIds[0],
    { timeout: 30000 },
  );
  const [closedJob] = await sql(
    `SELECT status FROM media_jobs WHERE id=${quote(queued)}`,
  );
  assert.equal(closedJob.status, 'succeeded');
  assert.equal(
    (await h.traffic()).filter(
      (entry) =>
        entry.request.mode === 'check' &&
        entry.request.command.taskIds[reprocessIds[0]] === queued,
    ).length,
    checksAfterClose,
    'Closing stops UI polling for this exact UUID while the real worker continues',
  );
  report.checks.push(
    'Real acceptance is delayed only by an isolated database claim time. Persisted queued/running/failed are rendering evidence; real progress response loss stops auto polling and keyboard retry reads again. After restoring queued eligibility and closing the panel, the actual worker completes the same job.',
  );

  // Real tool failure retains published versions; explicit new task retries it.
  const id = reprocessIds[2];
  const [source] = await sql(
    `SELECT key FROM media_objects WHERE id=${quote(`${id}-original`)}`,
  );
  const sourcePath = join(fixture.root, source.key);
  const bytes = await readFile(sourcePath);
  const versions = await readVersions(sql, id);
  try {
    await writeFile(
      sourcePath,
      'Issue 186 deliberately corrupt original for actual tool failure',
    );
    await h.visit([id]);
    await h.monitor();
    await h.submit();
    await h.terminal([id]);
    assert.equal(
      await page.evaluate(
        (id) =>
          document.querySelector(`[data-batch-result-id="${id}"]`).dataset
            .jobStatus,
        id,
      ),
      'failed',
    );
    assert.deepEqual(
      await readVersions(sql, id),
      versions,
      'Actual tool failure preserves old published versions',
    );
    await h.layouts('real-execution-failure', [1440, 390], ['light']);
    await writeFile(sourcePath, bytes);
    await page.click('[data-testid="batch-retained"]');
    await page.click('[data-testid="batch-task-retry"]');
    await page.waitForFunction(
      (id) =>
        document.querySelector(`[data-batch-result-id="${id}"]`)?.dataset
          .jobStatus === 'succeeded',
      id,
      { timeout: 30000 },
    );
    await h.terminal([id]);
    const writes = (await h.batchTraffic()).filter(
      (entry) => entry.request.mode === 'apply',
    );
    assert.equal(writes.length, 2);
    assert.notEqual(
      writes[0].request.command.taskIds[id],
      writes[1].request.command.taskIds[id],
    );
    const [retried] = await sql(
      `SELECT status FROM media_jobs WHERE id=${quote(writes[1].request.command.taskIds[id])}`,
    );
    assert.equal(retried.status, 'succeeded');
    await h.close();
  } finally {
    await writeFile(sourcePath, bytes);
  }
  report.checks.push(
    'A deliberately corrupt isolated original causes a real ImageMagick execution failure. Published object references stay fixed; restoring bytes and explicitly retrying creates a new task UUID that succeeds.',
  );
  report.errors = await assertNoBrowserErrors(page);
  report.persistedJobs = (await readJobs(sql)).map((job) => ({
    id: job.id,
    imageId: job.image_id,
    scope: job.scope,
    status: job.status,
    quality: JSON.parse(job.snapshot).quality,
    error: job.error,
  }));
  report.status = 'passed';
} catch (error) {
  report.error = error.stack ?? String(error);
  report.traffic = await h.traffic();
  report.failureJobs = await sql(
    "SELECT id,image_id,scope,status,next_attempt_at,started_at,error FROM media_jobs WHERE image_id LIKE 'issue186-%'",
  );
  report.failureState = await page.evaluate(() => ({
    selection:
      document.querySelector('[data-testid="library-selection"]')
        ?.textContent ?? null,
    busy: document
      .querySelector('[data-testid="library-batch"]')
      ?.getAttribute('aria-busy'),
    controls: [...document.querySelectorAll('[data-testid^="batch-"]')]
      .filter((node) => node.tagName === 'BUTTON')
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          testId: node.dataset.testid,
          name: node.textContent.trim(),
          disabled: node.disabled,
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        };
      }),
  }));
  await page.screenshot({
    path: join(config.output, 'library-reprocess-failure.png'),
  });
  throw error;
} finally {
  await page.evaluate(() => {
    window.__reprocessRelease?.();
    if (window.__reprocessOriginalFetch)
      window.fetch = window.__reprocessOriginalFetch;
  });
  await sql('DROP TRIGGER IF EXISTS issue186_hold');
  if (settings) await restoreProcessingSettings(sql, settings);
  if (quality !== undefined)
    await sql(`UPDATE media_settings SET quality=${quality} WHERE id=1`);
  if (fixture) await cleanReprocess(sql, fixture);
  if (savedPreference !== undefined)
    await page.evaluate(
      ({ key, saved }) =>
        saved === null
          ? localStorage.removeItem(key)
          : localStorage.setItem(key, saved),
      { key: preferenceKey, saved: savedPreference },
    );
  if (errorScript)
    await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
      identifier: errorScript,
    });
  await writeFile(
    join(config.output, 'library-reprocess.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
console.log(report);
