/* global taskSpace, config */
const assert = (await import('node:assert/strict')).default;
const { unexpectedSharingErrors } = await import(config.sharingErrorsScript);
const { writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { installBrowserErrors, readBrowserErrors } = await import(
  config.errorsScript
);
const moduleUrl = (file) => new URL(file, config.sharingErrorsScript).href;
const { createSharingPublicPage } = await import(
  moduleUrl('./sharing-public-page.mjs')
);
const { createSharingPublicLayouts } = await import(
  moduleUrl('./sharing-public-layouts.mjs')
);
const { verifySharingPublicRepresentatives } = await import(
  moduleUrl('./sharing-public-representatives.mjs')
);
const { verifySharingPublicPagination } = await import(
  moduleUrl('./sharing-public-pagination.mjs')
);
const { verifySharingPublicRecoveries } = await import(
  moduleUrl('./sharing-public-recovery.mjs')
);
const { verifySharingPublicRaces } = await import(
  moduleUrl('./sharing-public-races.mjs')
);
const task = await taskSpace(config.spaceId);
const page = task.page(config.pageLabel ?? 'p1');
const report = {
  status: 'failed',
  taskSpaceId: task.spaceId,
  phase: config.sharingPublicPhase ?? 'full',
  scope: 'production anonymous sharing page, cropped DTO and refresh',
  checks: [],
  layouts: [],
  limitations: [
    'Physical phones, software keyboards, nonzero safe area and Release containers were not exercised. Anonymous lightbox belongs to T-SHR-04.',
  ],
};
const session = createSharingPublicPage({ task, page, config });
const layouts = createSharingPublicLayouts({ page, config, report });
const scene = { page, config, report, session, layouts };
let errorScript;

try {
  errorScript = await installBrowserErrors(page);
  if (
    !config.sharingPublicPhase ||
    config.sharingPublicPhase === 'representative'
  )
    await verifySharingPublicRepresentatives(scene);
  if (!config.sharingPublicPhase || config.sharingPublicPhase === 'behavior') {
    await verifySharingPublicPagination(scene);
    await verifySharingPublicRecoveries(scene);
  }
  if (!config.sharingPublicPhase || config.sharingPublicPhase === 'race')
    await verifySharingPublicRaces(scene);
  if (config.sharingPublicPhase === 'recovery')
    await verifySharingPublicRecoveries(scene);
  const errors = await readBrowserErrors(page);
  const unexpected = unexpectedSharingErrors(
    errors,
    `${config.origin}/i/${config.statusIds.missing}?type=thumbnail`,
  );
  assert.deepEqual(unexpected, [], 'No unexpected runtime or resource errors');
  report.expectedThumbnailErrors = errors.length - unexpected.length;
  report.status = 'passed';
} catch (error) {
  let message = String(error.stack ?? error);
  for (const token of Object.values(config.albums).map((album) => album.token))
    message = message.replaceAll(token, '[redacted]');
  report.error = message;
  await page.screenshot({
    path: join(config.output, 'sharing-public-failure.png'),
  });
  throw new Error(message);
} finally {
  await session.close();
  if (errorScript)
    await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
      identifier: errorScript,
    });
  await writeFile(
    join(config.output, 'sharing-public.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
console.log(JSON.stringify(report));
