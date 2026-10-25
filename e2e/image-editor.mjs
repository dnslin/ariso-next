/* global taskSpace, config */
const assert = (await import('node:assert/strict')).default;
const { randomUUID } = await import('node:crypto');
const { writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const load = (file) => import(new URL(file, config.libraryDetailScript).href);
const { createImageWorkflowFixture, waitForImageWorkflow } = await load(
  './image-workflows-fixture.mjs',
);
const { createImageWorkflowPage } = await load('./image-workflows-page.mjs');
const { signInToLibrary } = await load('./library-login.mjs');
const { verifyEditorLeave } = await load('./image-editor-navigation.mjs');
const { resizeViewport, setTheme } = await load('./browser-geometry.mjs');
const { visibleThemeTrigger, chooseTheme } = await load('./theme-helpers.mjs');
const { installBrowserErrors, assertNoBrowserErrors, isBrowserControlStop } =
  await import(config.errorsScript);
const {
  editor,
  verifyEditorReturn,
  verifyServerPreviews,
  verifyCopyAcceptance,
  verifyOverwriteVersions,
  verifyBatchStopAndResume,
  verifyBatchReview,
  verifyTemplateLifecycle,
  button,
  saveButton,
  field,
  readyEditor,
  drawMask,
  chooseColor,
  settleRows,
  observeEditFetch,
  readTraffic,
  restoreFetch,
  capture,
  holdFixtureOriginal,
  assertFaultErrors,
  removeCopy,
} = await load('./image-editor-helpers.mjs');

assert.ok(
  Number.isInteger(config.spaceId) && config.spaceId > 0,
  'The runner owns the existing Ego TaskSpace',
);
const task = await taskSpace(config.spaceId);
const page = task.page(config.pageLabel ?? 'p1');
const report = {
  status: 'failed',
  origin: config.origin,
  taskSpaceId: task.spaceId,
  checks: [],
  layouts: [],
  limitations: [
    'All source pictures use real owner upload and the installed media worker in a disposable Local standalone. No seeded media rows or mocked job states replace product behavior.',
    'The lost-response scenario drops one real accepted POST response only in this browser target, then requires a GET of that same request ID. This is a controlled transport scenario, not a claim about a real network incident.',
    'The stop/resume check briefly holds the first real acceptance response, allowing a native UI stop action before another POST. The worker and its result remain real; the original fetch is always restored.',
    'The partial failure temporarily renames one uploaded fixture original within its own Local directory, restores it in finally, and retries the same server task. Only exact source-URL errors in that fault window are permitted.',
    'Anonymous browser verification uses a unique localhost subdomain with isolated host Cookies in the same Ego profile, not a separate BrowserContext.',
    'Viewport/theme/keyboard checks cover Chromium. Physical mobile devices, other engines, Figma acceptance, external R2/SeaweedFS and deployment are separate evidence.',
  ],
};
const copies = new Set(),
  templateIds = new Set();
let fixture, visitor, preference, errorScript, sourceHold, failure;
const remember = (jobs) => {
  for (const job of jobs)
    if (job.resultImageId && job.resultImageId !== job.sourceImageId)
      copies.add(job.resultImageId);
};
async function jobsFor(rows) {
  const jobs = await Promise.all(
    rows.map((row) => fixture.json(`/api/media/edits/${row.requestId}`)),
  );
  remember(jobs);
  return jobs;
}

try {
  report.stage = 'owner-and-real-fixture';
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
  preference = await page.evaluate(
    (selector) => document.querySelector(selector).dataset.theme,
    theme,
  );
  const system = await page.evaluate(() =>
    matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  );
  if (preference !== 'system') await chooseTheme(page, 'system', system);
  await setTheme(page, 'light');
  errorScript = await installBrowserErrors(page);
  fixture = await createImageWorkflowFixture(page, config, report);
  const ui = createImageWorkflowPage(page, config, report, fixture);
  const privateBefore = await fixture.detail(fixture.privateImage.id);
  assert.equal(
    new URL(
      privateBefore.versions.find((version) => version.kind === 'original')
        .links.url,
      config.origin,
    ).origin,
    config.origin,
    'Fixture delivery stays on the disposable owner origin',
  );
  const sourceBefore = await fixture.bytes(
    privateBefore.versions.find((version) => version.kind === 'original').links
      .url,
  );
  const unsupported = await fixture.json(
    `/api/images/${fixture.gifImage.id}/edit`,
  );
  assert.ok(unsupported.unavailableReason);
  assert.equal(unsupported.sourceUrl, null);
  report.checks.push({
    scenario: 'unsupported-gif-has-no-edit-source',
    reason: unsupported.unavailableReason,
  });

  report.stage = 'anonymous-source-authorization';
  const privateContext = await fixture.json(
    `/api/images/${privateBefore.id}/edit`,
  );
  visitor = await task.newPage();
  const anonymous = new URL(config.origin);
  anonymous.hostname = `editor-visitor-${randomUUID().slice(0, 8)}.localhost`;
  await visitor.goto(`${anonymous.origin}/login`);
  assert.equal(
    JSON.parse((await visitor.fetch('/api/auth/get-session')).body),
    null,
  );
  const denied = await visitor.fetch(privateContext.sourceUrl);
  assert.equal(
    denied.status,
    401,
    'An anonymous browser cannot read the private editable source',
  );
  report.checks.push({
    scenario: 'anonymous-edit-source-denied',
    anonymousOrigin: anonymous.origin,
    status: denied.status,
  });
  await visitor.close();
  visitor = undefined;
  await task.cdp('Target.activateTarget', { targetId: page.targetId });

  report.stage = 'library-batch-entry-return-state';
  await verifyEditorReturn({ page, report, fixture, ui });

  report.stage = 'unsaved-workspace-navigation';
  await verifyEditorLeave({ page, config, report, fixture, ui });

  report.stage = 'single-real-canvas-and-server-previews';
  await resizeViewport(page, 1440, 1000);
  await ui.openDetail(fixture.privateImage);
  await ui.more('编辑图片');
  await readyEditor(page);
  await observeEditFetch(page, [privateBefore.id]);
  const canvas = await drawMask(page);
  await page.click(button('纯色遮挡'));
  await chooseColor(page, '#4A8B80', report);
  await page.click(button('水印'));
  await page.fill(await field(page, '水印文字'), 'EDIT');
  await capture(page, config, report, 'single-edit');
  await verifyServerPreviews({ page, report, canvas });

  report.stage = 'template-create-and-layout';
  await page.click(`${editor} [data-editor] > header button:has-text("模板")`);
  await page.waitForSelector('[data-testid="image-editor-template-dialog"]');
  const templateName = `${fixture.prefix} 编辑模板`;
  await page.fill(
    await field(
      page,
      '模板名称',
      '[data-testid="image-editor-template-dialog"]',
    ),
    templateName,
  );
  await page.click(
    '[data-testid="image-editor-template-dialog"] [data-slot="checkbox-content"]:has-text("打码区域")',
  );
  await page.click(button('保存模板'));
  await page.waitForSelector('[data-testid="image-editor-template-dialog"]', {
    state: 'hidden',
  });
  const savedTemplate = await waitForImageWorkflow(
    () => fixture.json('/api/media/edit-templates'),
    (value) =>
      value.templates.some((template) => template.name === templateName),
    'Template is persisted by the real endpoint',
  );
  const template = savedTemplate.templates.find(
    (item) => item.name === templateName,
  );
  templateIds.add(template.id);
  assert.equal(template.recipe.regions.length, 1);
  assert.equal(template.recipe.watermark.text, 'EDIT');
  await page.click(button('编辑模板'));
  await readyEditor(page, 'templates');
  await capture(
    page,
    config,
    report,
    'templates',
    button('编辑图片并创建模板'),
  );
  await page.click(button('编辑图片并创建模板'));
  await readyEditor(page);

  report.stage = 'copy-lost-response-and-idempotency';
  await observeEditFetch(page, [privateBefore.id], true);
  await page.click(saveButton);
  const copyRows = await settleRows(page, 1);
  const copyTraffic = await readTraffic(page),
    [copyJob] = await jobsFor(copyRows);
  await verifyCopyAcceptance({
    fixture,
    report,
    privateBefore,
    sourceBefore,
    copyTraffic,
    copyJob,
  });
  await capture(page, config, report, 'single-results', button('完成'));
  await restoreFetch(page);
  await page.click(button('完成'));
  await page.waitForSelector(editor, { state: 'hidden' });
  report.checks.push({
    scenario: 'accepted-copy-leaves-without-discarding-server-job',
    requestId: copyJob.requestId,
  });

  report.stage = 'overwrite-published-roles-and-size';
  await verifyOverwriteVersions({
    page,
    config,
    report,
    fixture,
    templateName,
  });

  report.stage = 'batch-proportional-review-and-adjustment';
  await verifyBatchReview({
    page,
    config,
    report,
    fixture,
    template,
    templateName,
  });

  report.stage = 'batch-stop-and-resume-real-acceptance';
  remember(await verifyBatchStopAndResume({ page, report, fixture }));

  report.stage = 'real-private-local-source-failure-and-retry';
  await assertNoBrowserErrors(page);
  const heldContext = await fixture.json(
    `/api/images/${fixture.privateImage.id}/edit`,
  );
  sourceHold = await holdFixtureOriginal(
    config,
    fixture,
    fixture.privateImage.id,
    heldContext.sourceObjectId,
  );
  report.sourceFault = {
    imageId: sourceHold.imageId,
    sourceObjectId: sourceHold.sourceObjectId,
    path: sourceHold.path,
    held: sourceHold.held,
    startedAt: new Date().toISOString(),
  };
  await observeEditFetch(page, [
    fixture.publicImage.id,
    fixture.privateImage.id,
  ]);
  try {
    await page.click(saveButton);
    const rows = await settleRows(page, 2, ['succeeded', 'failed']);
    assert.equal(rows.filter((row) => row.status === 'succeeded').length, 1);
    assert.equal(rows.filter((row) => row.status === 'failed').length, 1);
    const jobs = await jobsFor(rows),
      failed = jobs.find((job) => job.status === 'failed'),
      succeeded = jobs.find((job) => job.status === 'succeeded');
    assert.equal(failed.sourceImageId, fixture.privateImage.id);
    report.partial = { failed, succeeded };
    await page.waitForFunction(
      (url) =>
        [...document.images]
          .filter((image) => image.src === url)
          .every((image) => image.complete),
      new URL(heldContext.sourceUrl, config.origin).href,
    );
    await page.screenshot({
      path: join(config.output, 'image-editor-real-partial-failure.png'),
    });
  } finally {
    await sourceHold.restore();
    report.sourceFault.restoredAt = new Date().toISOString();
  }
  await assertFaultErrors(
    page,
    new URL(heldContext.sourceUrl, config.origin).href,
    report,
  );
  await page.click(button('仅重试失败的 1 张'));
  const retried = await jobsFor(await settleRows(page, 2));
  const recovered = retried.find(
    (job) => job.sourceImageId === fixture.privateImage.id,
  );
  assert.equal(recovered.jobId, report.partial.failed.jobId);
  assert.equal(recovered.resultImageId, report.partial.failed.resultImageId);
  assert.equal(
    retried.find((job) => job.sourceImageId === fixture.publicImage.id)
      .resultImageId,
    report.partial.succeeded.resultImageId,
  );
  assert.equal(
    (await readTraffic(page)).posts.length,
    2,
    'Retry uses the same task endpoint, not another copy POST',
  );
  report.checks.push({
    scenario: 'real-source-failure-restored-and-same-task-retry',
    partial: report.partial,
    retried,
  });
  await capture(page, config, report, 'batch-results', button('完成'));
  await restoreFetch(page);

  report.stage = 'template-rename-and-delete';
  await verifyTemplateLifecycle({
    page,
    report,
    fixture,
    template,
    templateName,
  });
  templateIds.delete(template.id);
  report.browserErrors = await assertNoBrowserErrors(page);
  report.status = 'passed';
} catch (error) {
  failure = error;
  report.error = error.stack ?? String(error);
  if (!isBrowserControlStop(error)) {
    try {
      await page.screenshot({
        path: join(config.output, 'image-editor-failure.png'),
      });
      const snapshot = await page.snapshot();
      report.failureSnapshot = config.credentials?.password
        ? snapshot.replaceAll(config.credentials.password, '[redacted]')
        : snapshot;
    } catch (diagnostic) {
      report.diagnosticError = diagnostic.stack ?? String(diagnostic);
    }
  }
} finally {
  let controlStopped = isBrowserControlStop(failure);
  const cleanup = async (label, operation, browser = false) => {
    if (browser && controlStopped) return;
    try {
      await operation();
    } catch (error) {
      (report.cleanupErrors ??= []).push({
        label,
        error: error.stack ?? String(error),
      });
      failure ??= error;
      report.status = 'failed';
      controlStopped ||= isBrowserControlStop(error);
    }
  };
  if (sourceHold)
    await cleanup('restore-private-held-source', async () => {
      await sourceHold.restore();
      if (report.sourceFault)
        report.sourceFault.restoredAt ??= new Date().toISOString();
    });
  if (!controlStopped) {
    await cleanup(
      'stop-not-submitted-before-cleanup',
      async () => {
        const visible = await page.evaluate(() =>
          [...document.querySelectorAll('button')].some(
            (node) =>
              node.getClientRects().length &&
              node.textContent.trim() === '停止尚未提交的图片' &&
              !node.disabled,
          ),
        );
        if (visible) await page.click(button('停止尚未提交的图片'));
      },
      true,
    );
    await cleanup(
      'read-final-owned-edit-requests',
      async () => {
        const traffic = await readTraffic(page);
        if (traffic && fixture) {
          remember(traffic.posts.map((post) => post.result).filter(Boolean));
          for (const post of traffic.posts.filter((item) => !item.result)) {
            const response = await fixture.response(
              `/api/media/edits/${post.input.requestId}`,
            );
            assert.ok([200, 404].includes(response.status));
            if (response.status === 200) remember([await response.json()]);
          }
        }
        await restoreFetch(page);
      },
      true,
    );
    if (visitor) await cleanup('anonymous-page', () => visitor.close(), true);
    if (fixture) {
      for (const id of templateIds)
        await cleanup(
          `template-${id}`,
          async () => {
            const response = await fixture.response(
              `/api/media/edit-templates/${id}`,
              { method: 'DELETE' },
            );
            assert.ok([200, 404].includes(response.status));
            if (response.status === 200)
              assert.equal((await response.json()).deleted, true);
          },
          true,
        );
      for (const id of copies)
        await cleanup(
          `copied-image-${id}`,
          () => removeCopy(fixture, id),
          true,
        );
      await cleanup(
        'formal-source-fixture-and-settings',
        () => fixture.dispose(),
        true,
      );
    }
    if (preference)
      await cleanup(
        'owner-theme',
        async () => {
          await resizeViewport(page, 1440, 1000);
          await page.goto(`${config.origin}/library`);
          await page.waitForSelector('[data-testid="library-list"]');
          await setTheme(page, 'light');
          if (preference !== 'system')
            await chooseTheme(page, preference, preference);
        },
        true,
      );
    if (errorScript)
      await cleanup(
        'browser-error-observer',
        () =>
          page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
            identifier: errorScript,
          }),
        true,
      );
  }
  report.cleanup = {
    copiedImageIds: [...copies],
    sourceRestored: !sourceHold || !!report.sourceFault?.restoredAt,
    fixtureDisposed:
      !!fixture &&
      !controlStopped &&
      !report.cleanupErrors?.some(
        (item) => item.label === 'formal-source-fixture-and-settings',
      ),
  };
  if (controlStopped)
    report.cleanupDeferredToRunner =
      'Browser control was stopped; no further browser or HTTP cleanup was attempted. The runner owns disposable runtime removal.';
  await writeFile(
    join(config.output, 'image-editor.json'),
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
