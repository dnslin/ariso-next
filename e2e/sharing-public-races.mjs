import assert from 'node:assert/strict';
import { waitForPaint } from './sharing-public-page.mjs';

export async function verifySharingPublicRaces({
  page,
  config,
  report,
  session,
  layouts,
}) {
  const {
    updateShare,
    open,
    loaded,
    ensureVisible,
    instrument,
    hiddenNames,
    traffic,
    hidePage,
  } = session;
  const { capture } = layouts;
  const record = (scenario, detail = {}) =>
    report.checks.push({ scenario, ...detail });
  report.stage = 'late-responses';
  await updateShare({ enabled: 1, show_name: 1, layout: 'grid' });
  await open();
  await loaded(40);
  await ensureVisible();
  await capture('grid-names');
  await instrument();
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = async (...args) => {
      if (String(args[0]).includes('/items')) {
        const response = await original(...args);
        window.__shareLateNames = (await response.clone().json()).items.some(
          (item) => 'displayName' in item,
        );
        await new Promise((resolve) => {
          window.__releaseShareItems = resolve;
        });
        window.fetch = original;
        return response;
      }
      return original(...args);
    };
  });
  await page.click('[data-testid="share-load-more"]');
  await page.waitForFunction(() => !!window.__releaseShareItems);
  await capture('loading-more');
  assert.equal(await page.evaluate(() => window.__shareLateNames), true);
  await updateShare({ show_name: 0 });
  await ensureVisible();
  await page.waitForFunction(
    (names) =>
      !names.some((name) =>
        document.querySelector('main').textContent.includes(name),
      ),
    config.names,
    { timeout: 15000 },
  );
  await page.evaluate(() => window.__releaseShareItems());
  await waitForPaint(page);
  await hiddenNames();
  await loaded(40);
  record(
    'Late pre-policy list response cannot restore display names after showName turns off',
  );
  await page.evaluate(() => {
    const original = window.fetch;
    let held = false;
    window.fetch = async (...args) => {
      if (String(args[0]).endsWith('/refresh') && !held) {
        held = true;
        const response = await original(...args);
        window.__shareHeldResponse = await response.clone().json();
        await new Promise((resolve) => {
          window.__releaseShareRefresh = resolve;
        });
        return response;
      }
      return original(...args);
    };
  });
  await ensureVisible();
  await page.waitForFunction(() => !!window.__releaseShareRefresh, undefined, {
    timeout: 15000,
  });
  const heldRequestCount = (await traffic()).filter((entry) =>
    entry.url.endsWith('/refresh'),
  ).length;
  await page.evaluate(() => {
    window.__shareHoldStarted = Date.now();
  });
  await page.waitForFunction(
    () => Date.now() - window.__shareHoldStarted >= 5500,
    undefined,
    { timeout: 10000 },
  );
  assert.equal(
    (await traffic()).filter((entry) => entry.url.endsWith('/refresh')).length,
    heldRequestCount,
    'A pending refresh is not overlapped by the next poll',
  );
  // Visibility changes cancel the obsolete batch; a fresh generation sees revocation.
  await hidePage();
  await updateShare({ enabled: 0 });
  await ensureVisible();
  await page.waitForSelector('[data-testid="share-state"]');
  assert.equal(
    await page.evaluate(
      () => document.querySelectorAll('[data-share-item]').length,
    ),
    0,
  );
  await page.evaluate(() => window.__releaseShareRefresh());
  await waitForPaint(page);
  assert.equal(
    await page.evaluate(
      () => document.querySelectorAll('[data-share-item]').length,
    ),
    0,
  );
  assert.equal(
    await page.evaluate(
      (name) => document.querySelector('main').textContent.includes(name),
      config.albums.public.name,
    ),
    false,
  );
  await capture('revoked');
  record(
    'No overlapping state checks; revocation clears all data and late authorized refresh cannot refill it',
  );
  await updateShare({ enabled: 1 });
}
