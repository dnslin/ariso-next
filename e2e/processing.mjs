/* global taskSpace, config */
const { default: assert } = await import('node:assert/strict');
const { writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { processingTools } = await import(
  new URL('./processing-helpers.mjs', config.identitySessionScript).href
);
const { verifyProcessingSettings } = await import(
  new URL('./processing-settings.mjs', config.identitySessionScript).href
);
const { verifyProcessingPreview } = await import(
  new URL('./processing-preview.mjs', config.identitySessionScript).href
);
const { verifyProcessingRecovery } = await import(
  new URL('./processing-recovery.mjs', config.identitySessionScript).href
);
const { verifyProcessingLayouts } = await import(
  new URL('./processing-layout.mjs', config.identitySessionScript).href
);
const { installBrowserErrors, readBrowserErrors } = await import(
  config.errorsScript
);
const task = await taskSpace(config.spaceId);
const page = task.page(config.pageLabel ?? 'p1');
const report = {
  status: 'failed',
  taskSpaceId: task.spaceId,
  origin: config.origin,
  phase: config.processingPhase ?? 'all',
  checks: [],
  layouts: [],
  browserErrors: [],
  limitations: [
    'Only the runner’s disposable production runtime and database are changed. The manual preview and its data are untouched.',
    'Held or lost fetch responses are real server responses; successful rules, task IDs and results are never fabricated.',
    'Cancellation tests verify actual DELETE settlement and recovery. The existing media-tools integration suite verifies encoder shutdown while work is active.',
    'Physical touch, soft keyboard and nonzero device safe areas are outside the current acceptance scope.',
  ],
};
let tools;
let original;
let errorScript;
let verificationError;
try {
  errorScript = await installBrowserErrors(page);
  tools = await processingTools(page, config, report);
  original = tools.editable(await tools.settings());
  const phase = config.processingPhase;
  const stages = [
    ['representative', () => verifyProcessingLayouts(page, tools, report)],
    ['settings', () => verifyProcessingSettings(page, config, tools, report)],
    ['preview', () => verifyProcessingPreview(page, config, tools, report)],
    ['recovery', () => verifyProcessingRecovery(page, config, tools, report)],
  ];
  for (const [name, run] of stages) {
    if (phase !== undefined && phase !== name) continue;
    report.stage = name;
    await run();
    const errors = await readBrowserErrors(page);
    report.browserErrors.push(...errors);
    assert.deepEqual(
      errors,
      [],
      `Processing ${name} has no browser runtime/resource errors`,
    );
  }
  if (config.processingNavigationFixtures) {
    const storages = await tools.request('/api/storages');
    if (!storages.some((item) => item.type === 'local'))
      await tools.request('/api/storages', 'POST', {
        type: 'local',
        name: 'Processing navigation Local',
        localPath: 'processing-navigation',
      });
    if (!storages.some((item) => item.type === 's3'))
      await tools.request('/api/storages', 'POST', {
        type: 's3',
        name: 'Processing navigation S3',
        endpoint: 'http://127.0.0.1:1',
        region: 'test',
        bucket: 'processing-navigation',
        enabled: false,
      });
  }
  report.status = 'passed';
} catch (error) {
  verificationError = error;
  report.error = error.stack ?? String(error);
  await page.screenshot({
    path: join(config.output, 'processing-failure.png'),
  });
} finally {
  try {
    try {
      if (original) {
        await tools.request('/api/settings/media', 'PATCH', original);
        assert.deepEqual(
          tools.editable(await tools.settings()),
          original,
          'Restore the exact original independent runtime settings',
        );
        report.originalSettingsRestored = true;
      }
    } catch (error) {
      report.status = 'failed';
      report.cleanupError = error.stack ?? String(error);
      verificationError = verificationError
        ? new AggregateError(
            [verificationError, error],
            'Processing verification and fixture restoration both failed',
          )
        : error;
    }
    if (tools) report.browserRequests = await tools.browser();
    report.browserErrors.push(...(await readBrowserErrors(page)));
    if (errorScript)
      await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
        identifier: errorScript,
      });
  } finally {
    report.finishedAt = new Date().toISOString();
    await writeFile(
      join(config.output, 'processing.json'),
      `${JSON.stringify(report, null, 2)}\n`,
    );
  }
}
if (verificationError) throw verificationError;
console.log({
  processing: report.status,
  phase: report.phase,
  report: join(config.output, 'processing.json'),
});
