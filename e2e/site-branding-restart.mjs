/* global taskSpace, config */
const assert = (await import('node:assert/strict')).default;
const { readFile, writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { assertBrandConsumers } = await import(
  new URL('./site-branding-consumers.mjs', config.identitySessionScript).href
);
const { brandingTools, restoreBrandingFixture } = await import(
  new URL('./site-branding-helpers.mjs', config.identitySessionScript).href
);
const { identitySql } = await import(config.identitySessionScript);
const { signInToLibrary } = await import(
  new URL('./library-login.mjs', config.identitySessionScript).href
);
const task = await taskSpace(config.spaceId);
const page = task.page(config.pageLabel ?? 'p1');
const expected = JSON.parse(
  await readFile(
    join(config.output, 'site-branding-restart-input.json'),
    'utf8',
  ),
);
const { settings: baseline, original } = JSON.parse(
  await readFile(join(config.output, 'site-branding-baseline.json'), 'utf8'),
);
const report = {
  status: 'failed',
  taskSpaceId: task.spaceId,
  checks: [],
  layouts: [],
};
const tools = brandingTools(page, config, report);
let failure;
try {
  await page.goto(config.origin);
  await page.fetch('/api/auth/sign-out', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  await assertBrandConsumers(page, config, expected, report);
  await page.goto(`${config.origin}/library?page=1`);
  await page.waitForSelector('#email');
  await signInToLibrary(page, config, report);
  const actual = await tools.api();
  for (const field of [
    'name',
    'description',
    'logoUrl',
    'logoMime',
    'faviconUrl',
    'faviconMime',
  ])
    assert.equal(actual[field], expected[field], `Restart preserves ${field}`);
  await tools.open();
  for (const kind of ['logo', 'favicon']) {
    assert.equal(
      (await page.fetch(expected[`${kind}Url`])).status,
      200,
      'Restart retains real brand file',
    );
    await tools.api(`/api/settings/site/branding/${kind}`, 'DELETE');
  }
  await tools.api('/api/settings/site', 'PATCH', {
    name: baseline.name,
    description: baseline.description,
    publicUrl: baseline.publicUrl,
    timeZone: baseline.timeZone,
  });
  await page.goto(config.origin);
  await page.waitForSelector('#home-heading');
  assert.equal(
    await page.evaluate(
      () => document.querySelector('[data-testid="site-logo"] img') !== null,
    ),
    false,
    'Deletion restores built-in home branding',
  );
  assert.equal(
    await page.evaluate(
      () => document.querySelector('#home-heading').textContent,
    ),
    baseline.name,
  );
  assert.equal(
    await page.evaluate(() =>
      [...document.querySelectorAll('link[rel="icon"]')].some((node) =>
        new URL(node.href).pathname.startsWith('/branding/'),
      ),
    ),
    false,
  );
  report.checks.push(
    'Actual process restart preserves both persisted brand files, metadata and consumers; deletion restores built-in branding without stale Logo/Favicon.',
  );
  report.restored = true;
  report.status = 'passed';
} catch (error) {
  failure = error;
  report.error = error.stack ?? String(error);
} finally {
  try {
    await restoreBrandingFixture(config, original);
    await identitySql(
      config,
      `DELETE FROM albums WHERE id='${expected.albumId}'`,
    );
    report.originalSiteRestored = true;
  } catch (error) {
    report.status = 'failed';
    report.cleanupError = error.stack ?? String(error);
    failure = failure
      ? new AggregateError(
          [failure, error],
          'Branding restart verification and fixture restoration failed',
        )
      : error;
  }
  await writeFile(
    join(config.output, 'site-branding-restart.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
if (failure) throw failure;
console.log({ siteBrandingRestart: report.status, restored: report.restored });
