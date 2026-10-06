/* global taskSpace, config */
const assert = (await import('node:assert/strict')).default;
const { writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { installBrowserErrors, readBrowserErrors } = await import(
  config.errorsScript
);
const moduleUrl = (file) => new URL(file, config.sharingErrorsScript).href;
const { createSharingPublicPage } = await import(
  moduleUrl('./sharing-public-page.mjs')
);
const { createSharingViewerPage } = await import(
  moduleUrl('./sharing-viewer-page.mjs')
);
const { verifySharingViewerRepresentatives } = await import(
  moduleUrl('./sharing-viewer-representatives.mjs')
);
const { verifySharingViewerInteractions } = await import(
  moduleUrl('./sharing-viewer-interactions.mjs')
);
const { verifySharingViewerRevocations } = await import(
  moduleUrl('./sharing-viewer-revocation.mjs')
);
const { verifySharingViewerRaces } = await import(
  moduleUrl('./sharing-viewer-races.mjs')
);
const task = await taskSpace(config.spaceId);
const page = task.page(config.pageLabel ?? 'p1');
const report = {
  status: 'failed',
  taskSpaceId: task.spaceId,
  phase: config.sharingViewerPhase ?? 'full',
  scope:
    'Production anonymous image viewer, bounded public neighbors and real revocation',
  checks: [],
  layouts: [],
  limitations: [
    'Physical phones, software keyboards, nonzero safe area and Release containers are outside this browser run.',
  ],
};
const session = createSharingPublicPage({ task, page, config });
const scene = { task, page, config, report, session };
scene.viewing = createSharingViewerPage(scene);
let errorScript;
const redact = (text) => {
  for (const token of Object.values(config.albums).map((album) => album.token))
    text = text.replaceAll(token, '[redacted]');
  return text.replace(/\/s\/[A-Za-z0-9_-]+/g, '/s/[redacted]');
};
try {
  errorScript = await installBrowserErrors(page);
  // A focused run can start on another suite's document and theme handler.
  await session.open();
  // Ego keeps protocol events across documents, including stopped fixtures.
  const entryErrors = await readBrowserErrors(page);
  report.previousPageErrors = entryErrors.filter(
    (error) => new URL(error.url).origin !== config.origin,
  );
  const currentEntryErrors = entryErrors.filter(
    (error) => new URL(error.url).origin === config.origin,
  );
  const phases = {
    representative: verifySharingViewerRepresentatives,
    interactions: verifySharingViewerInteractions,
    revocation: verifySharingViewerRevocations,
    race: verifySharingViewerRaces,
  };
  if (config.sharingViewerPhase) {
    assert.ok(config.sharingViewerPhase in phases, 'Known viewer phase');
    await phases[config.sharingViewerPhase](scene);
  } else for (const verify of Object.values(phases)) await verify(scene);
  const errors = [...currentEntryErrors, ...(await readBrowserErrors(page))];
  const expectedResources = [
    `${config.origin}/i/${config.statusIds.missing}?type=thumbnail`,
    ...(report.expectedPreviewErrors ?? []),
  ];
  const unexpected = errors.filter(
    (error) =>
      !(
        error.kind === 'error' &&
        expectedResources.some(
          (url) => error.message === `Resource failed: ${url}`,
        )
      ) &&
      !(
        error.kind === 'console.error' &&
        (report.expectedConsoleErrors ?? []).includes(error.message)
      ),
  );
  assert.deepEqual(unexpected, [], 'No unexpected runtime or resource errors');
  report.expectedErrorsObserved = errors.length - unexpected.length;
  report.status = 'passed';
} catch (error) {
  report.error = redact(String(error.stack ?? error));
  await page.screenshot({
    path: join(config.output, 'sharing-viewer-failure.png'),
  });
  throw new Error(report.error);
} finally {
  await session.close();
  if (errorScript)
    await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
      identifier: errorScript,
    });
  await writeFile(
    join(config.output, 'sharing-viewer.json'),
    `${redact(JSON.stringify(report, null, 2))}\n`,
  );
}
console.log(redact(JSON.stringify(report)));
