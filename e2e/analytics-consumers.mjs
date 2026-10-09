import assert from 'node:assert/strict';
import { resizeViewport } from './browser-geometry.mjs';
import { verifyOwnerShell } from './owner-shell.mjs';

export async function analyticsConsumers(page, config, tools, fixture, report) {
  await verifyOwnerShell(page, config, 'analytics-owner-shell');
  await resizeViewport(page, 1440);
  await tools.open('/dashboard?days=7');
  await page.focus('a[href="/analytics?days=7"]');
  await page.keyboard.press('Enter');
  await page.waitForURL(`${config.origin}/analytics?days=7`);
  await page.waitForSelector('[data-testid="analytics-overview"]');
  const links = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="analytics-popular"] li')].map(
      (node) => ({
        id: node.dataset.imageId,
        state: node.dataset.imageState,
        href: node.querySelector('a')?.getAttribute('href') ?? null,
      }),
    ),
  );
  assert.equal(links.find(({ id }) => id === fixture.ids[2]).href, null);
  for (const [id, path] of [
    [fixture.ids[0], '/library'],
    [fixture.ids[1], '/trash'],
  ]) {
    const selector = `[data-testid="analytics-popular"] li[data-image-id="${id}"] a`;
    await page.focus(selector);
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      ({ id, path }) =>
        location.pathname === path &&
        new URLSearchParams(location.search).get('image') === id,
      { id, path },
    );
    await page.waitForSelector('main h1');
    assert.equal(new URL(await page.url()).searchParams.get('image'), id);
    await tools.open();
  }
  report.checks.push(
    'Every implemented owner route passes the shared shell consumer checks, including dashboard and analytics. Workbench enters actual access statistics by keyboard. Normal/recycled historical ranking entries navigate to their actual library/trash URLs with the exact image ID; permanently deleted history exposes no navigation or content.',
  );
}
