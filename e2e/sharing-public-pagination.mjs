import assert from 'node:assert/strict';
import { resizeViewport } from './browser-geometry.mjs';
import { json, waitForPaint } from './sharing-public-page.mjs';

export async function verifySharingPublicPagination({
  page,
  config,
  report,
  session,
  layouts,
}) {
  const {
    open,
    loaded,
    instrument,
    traffic,
    hidePage,
    ensureVisible,
    awaitRefresh,
    sql,
    publicPath,
    path,
  } = session;
  const { capture } = layouts;
  const record = (scenario, detail = {}) =>
    report.checks.push({ scenario, ...detail });
  report.stage = 'pagination-refresh';
  await descriptionRecovery({ page, config, report, session });
  await open();
  await loaded(40);
  await instrument();
  for (const count of [80, 120, 124]) {
    await page.click('[data-testid="share-load-more"]');
    await loaded(count);
  }
  const listRequests = (await traffic()).filter((entry) =>
    entry.url.includes('/items'),
  );
  assert.deepEqual(
    listRequests.map((entry) => entry.response.items.length),
    [40, 40, 4],
  );
  assert.equal(
    await page.evaluate(
      () => !!document.querySelector('[data-testid="share-load-more"]'),
    ),
    false,
  );
  await page.waitForFunction(
    (ids) => {
      const requests = (window.__shareTraffic ?? []).filter((entry) =>
        entry.url.includes('/refresh'),
      );
      return requests.some((first, index) => {
        const second = requests[index + 1];
        return (
          first.status === 200 &&
          first.finishedAt &&
          second?.status === 200 &&
          second.finishedAt &&
          first.body.ids.length === 80 &&
          second.body.ids.length === 44 &&
          new Set([...first.body.ids, ...second.body.ids]).size ===
            ids.length &&
          ids.every((id) =>
            [...first.body.ids, ...second.body.ids].includes(id),
          )
        );
      });
    },
    config.publicIds,
    { timeout: 15000 },
  );
  const refreshRequests = (await traffic()).filter((entry) =>
    entry.url.includes('/refresh'),
  );
  const fullCycleStart = refreshRequests.findIndex(
    (first, index) =>
      first.status === 200 &&
      first.finishedAt &&
      first.body.ids.length === 80 &&
      refreshRequests[index + 1]?.status === 200 &&
      refreshRequests[index + 1]?.finishedAt &&
      refreshRequests[index + 1]?.body.ids.length === 44,
  );
  const fullCycle = refreshRequests.slice(fullCycleStart, fullCycleStart + 2);
  record('Observed pagination refresh requests', {
    requests: refreshRequests.map((entry) => ({
      size: entry.body.ids.length,
      startedAt: entry.startedAt,
      hidden: entry.hidden,
      finishedAt: entry.finishedAt,
      status: entry.status,
      returned: entry.response?.items.length,
      total: entry.response?.total,
      showName: entry.response?.showName,
      layout: entry.response?.layout,
      error: entry.error,
    })),
  });
  assert.ok(refreshRequests.every((entry) => entry.body.ids.length <= 80));
  assert.ok(refreshRequests.some((entry) => entry.body.ids.length === 80));
  assert.ok(refreshRequests.some((entry) => entry.body.ids.length === 44));
  assert.deepEqual(
    [...new Set(fullCycle.flatMap((entry) => entry.body.ids))].sort(),
    [...config.publicIds].sort(),
  );
  assert.ok(
    fullCycle[1].startedAt >= fullCycle[0].finishedAt,
    'Refresh batches are sequential',
  );
  assert.ok(
    fullCycle[0].startedAt - listRequests.at(-1).finishedAt >= 4000,
    'Visible polling is scheduled at five seconds rather than continuous',
  );
  assert.equal(
    await page.evaluate(
      () => document.querySelectorAll('[data-share-item]').length < 124,
    ),
    true,
    'Segmented rendering does not mount entire large album',
  );
  record(
    '40 member batches, ID deduplication and bounded 80+44 refresh with segmented rendering',
    {
      pageSizes: [40, 40, 4],
      refreshSizes: fullCycle.map((entry) => entry.body.ids.length),
    },
  );
  await page.mouse.move(200, 300);
  await page.mouse.wheel(0, -100000, {
    label: 'show the fully loaded summary',
  });
  await waitForPaint(page);
  assert.equal(
    await page.evaluate(() =>
      document
        .querySelector('main')
        .textContent.includes('已显示全部 124 张图片'),
    ),
    true,
  );
  await capture('all-loaded');
  const hiddenCount = (await traffic()).filter((entry) =>
    entry.url.includes('/refresh'),
  ).length;
  await hidePage();
  await session.waitWhileHidden(Date.now() + 5500);
  await ensureVisible();
  await awaitRefresh(hiddenCount);
  const visibility = await page.evaluate(() => window.__shareVisibility);
  assert.deepEqual(
    visibility.map((event) => event.hidden),
    [true, false],
  );
  const [hidden, visible] = visibility;
  assert.ok(
    visible.at - hidden.at >= 5500,
    'The actual document remained hidden',
  );
  const afterResume = (await traffic()).filter((entry) =>
    entry.url.includes('/refresh'),
  );
  assert.equal(
    afterResume.filter((entry) => entry.hidden).length,
    0,
    'Hidden visibility starts no new polling request',
  );
  const resumed = afterResume.find((entry) => entry.startedAt >= visible.at);
  assert.ok(resumed);
  assert.ok(
    resumed.startedAt - visible.at < 2000,
    'Visibility restoration checks immediately',
  );
  record(
    'Hidden visibility stops polling and resume immediately checks loaded members',
    {
      visibility: 'real browser tab activation and production requests',
      events: visibility,
    },
  );
  await sql(
    `UPDATE media_images SET visibility='private' WHERE id='${config.publicIds[10]}'`,
  );
  await sql(
    `UPDATE media_images SET trashed_at=${Date.now()} WHERE id='${config.publicIds[11]}'`,
  );
  await sql(
    `DELETE FROM album_images WHERE album_id='${config.albums.public.id}' AND image_id='${config.publicIds[12]}'`,
  );
  await sql(
    `UPDATE media_images SET processing_status='ready' WHERE id='${config.statusIds.pending}'`,
  );
  const previous = (await traffic()).filter(
    (entry) => entry.url.includes('/refresh') && entry.finishedAt,
  ).length;
  await ensureVisible();
  await awaitRefresh(previous);
  await loaded(121);
  for (const id of config.publicIds.slice(10, 13))
    assert.equal(
      await page.evaluate(
        (id) => !!document.querySelector(`[data-share-item="${id}"]`),
        id,
      ),
      false,
    );
  await page.mouse.move(200, 300);
  await page.mouse.wheel(0, -100000, { label: 'return to album start' });
  await page.waitForFunction(
    (id) =>
      document
        .querySelector(`[data-share-item="${id}"]`)
        ?.getAttribute('data-share-status') === 'ready',
    config.statusIds.pending,
  );
  record(
    'Next refresh removes private/trashed/removed members and updates processing in the original position',
  );
  await capture('members-removed');
  await open();
  await loaded(40);
  await instrument();
  const first = json(await page.fetch(`${publicPath}/items`));
  await sql(
    `DELETE FROM album_images WHERE album_id='${config.albums.public.id}' AND image_id='${first.nextCursor}'`,
  );
  await page.click('[data-testid="share-load-more"]');
  await page.waitForSelector('[data-testid="share-refresh"]');
  assert.equal(
    await page.evaluate(
      () => !!document.querySelector('[data-testid="share-items"]'),
    ),
    false,
    'Invalid cursor uses the designed recovery state instead of old cards',
  );
  assert.equal(
    await page.evaluate(
      () => !!document.querySelector('[data-testid="share-load-error"]'),
    ),
    false,
    'Cursor recovery does not also claim that old gallery content is displayed',
  );
  await capture('invalid-cursor');
  await page.click('[data-testid="share-refresh"]');
  await loaded(40);
  assert.equal(
    await page.evaluate(
      () => !!document.querySelector('[data-testid="share-refresh"]'),
    ),
    false,
  );
  record(
    'Removed public anchor hides old cards and restores the real first page after explicit refresh',
  );
  await open('rateLimited');
  for (let attempt = 0; attempt < 20; attempt++) {
    const response = await page.fetch(`${path('rateLimited')}/unlock`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'wrong-password' }),
    });
    assert.equal(response.status, 401);
  }
  await page.fill('[data-testid="share-password-input"]', config.password);
  const started = Date.now();
  await page.click('[data-testid="share-password-submit"]');
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[role="alert"]')].some((node) =>
      /稍后|等待|秒/.test(node.textContent),
    ),
  );
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelector('[data-testid="share-password-submit"]')
          .disabled,
    ),
    true,
  );
  await capture('rate-limited');
  await page.waitForFunction(
    () =>
      !document.querySelector('[data-testid="share-password-submit"]').disabled,
    undefined,
    { timeout: 65000 },
  );
  assert.ok(
    Date.now() - started >= 55000,
    'UI honors production Retry-After rather than a fake countdown',
  );
  await page.click('[data-testid="share-password-submit"]');
  await page.waitForSelector('[data-testid="share-items"]');
  record(
    'Production HTTP 429 countdown blocks retry until real limiter window and then unlock succeeds',
  );
}

async function descriptionRecovery({ page, config, report, session }) {
  const { sql, open, loaded, instrument, awaitRefresh } = session;
  const record = (scenario, detail = {}) =>
    report.checks.push({ scenario, ...detail });
  const longDescription = '长'.repeat(2000);
  await sql(
    `UPDATE albums SET description='${longDescription}' WHERE id='${config.albums.public.id}'`,
  );
  await resizeViewport(page, 390);
  await open();
  await loaded(40);
  await page.waitForFunction(
    (description) =>
      document.querySelector('main').textContent.includes(description),
    longDescription,
  );
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="share-items"]')
        .getBoundingClientRect().top > innerHeight,
  );
  await instrument();
  await awaitRefresh();
  await sql(
    `UPDATE albums SET description='' WHERE id='${config.albums.public.id}'`,
  );
  await page.waitForFunction(
    () => !document.querySelector('main').textContent.includes('长长长'),
    undefined,
    { timeout: 15000 },
  );
  await waitForPaint(page);
  const recovered = await page.evaluate(() => {
    const scroller = document.querySelector('[data-share-scroll]');
    const gallery = document.querySelector('[data-testid="share-items"]');
    const first = gallery.querySelector('[aria-posinset="1"]');
    const second = gallery.querySelector('[aria-posinset="2"]');
    return {
      scrollTop: scroller.scrollTop,
      galleryTop: gallery.getBoundingClientRect().top,
      firstTop: first?.getBoundingClientRect().top,
      secondTop: second?.getBoundingClientRect().top,
      viewportBottom: scroller.getBoundingClientRect().bottom,
    };
  });
  assert.equal(recovered.scrollTop, 0);
  assert.ok(recovered.galleryTop < recovered.viewportBottom);
  assert.equal(
    recovered.secondTop,
    recovered.firstTop,
    'The visible second column mounts after metadata moves the gallery, without scrolling',
  );
  record(
    'Long description clears on refresh and all visible gallery columns recover without a scroll event',
    recovered,
  );
  await sql(
    `UPDATE albums SET description='${config.albums.public.description.replaceAll("'", "''")}' WHERE id='${config.albums.public.id}'`,
  );
}
