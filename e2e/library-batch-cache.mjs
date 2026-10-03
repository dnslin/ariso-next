import assert from 'node:assert/strict';
import { batchImageId } from './library-batch-fixture.mjs';

// The gallery virtualizes cards; collect through real scrolling rather than assuming
// every loaded image is mounted at once.
async function loadedCards(page, settle) {
  const seen = new Map();
  const previous = await page.evaluate(
    () => document.querySelector('main').scrollTop,
  );
  await page.evaluate(() => document.querySelector('main').scrollTo(0, 0));
  for (let step = 0; step < 100; step++) {
    await settle();
    const frame = await page.evaluate(() => {
      const main = document.querySelector('main');
      const cards = [...document.querySelectorAll('[data-image-id]')].map(
        (node) => ({
          id: node.dataset.imageId,
          position: Number(
            node.closest('[aria-posinset]').getAttribute('aria-posinset'),
          ),
          public: node.textContent.includes('公开'),
        }),
      );
      const bottom =
        main.scrollTop + main.clientHeight >= main.scrollHeight - 1;
      if (!bottom) main.scrollBy(0, main.clientHeight * 0.75);
      return { cards, bottom };
    });
    for (const item of frame.cards) seen.set(item.id, item);
    if (frame.bottom) {
      await page.evaluate(
        (top) => document.querySelector('main').scrollTo(0, top),
        previous,
      );
      await settle();
      return [...seen.values()].sort(
        (left, right) => left.position - right.position,
      );
    }
  }
  assert.fail('The real loaded gallery did not reach its scroll boundary');
}

async function verifyConfirmedChunk(context) {
  const {
    page,
    sql,
    loaded,
    choose,
    action,
    submit,
    monitor,
    done,
    selected,
    button,
    traffic,
    report,
    settle,
  } = context;
  await page.click('loc=role:button[name="图片加载方式"]');
  await page.click('loc=role:option[name="加载更多"]');
  await loaded(80);
  for (const count of [160, 201]) {
    await page.click('[data-testid="library-load-more"]');
    await loaded(count);
  }
  await choose(0);
  await action('全选已加载', 1);
  await action('设为公开', 201);
  await monitor();
  await page.evaluate((id) => {
    const original = window.fetch;
    window.fetch = async (...args) => {
      const response = await original(...args);
      const url = new URL(String(args[0]), location.href);
      if (url.pathname === '/api/images/batch') {
        const body = JSON.parse(args[1].body);
        if (body.mode === 'apply' && body.ids.includes(id))
          throw new TypeError('Verification: last real batch response lost');
      }
      return response;
    };
  }, batchImageId(200));
  await page.click(submit);
  await done();
  await page.waitForSelector('[data-testid="batch-check"]');
  await page.click('[data-testid="batch-return"]');
  await loaded(201);
  await selected(1);
  const confirmed = await loadedCards(page, settle);
  assert.equal(confirmed.length, 201);
  assert.ok(
    confirmed.slice(0, 200).every((item) => item.public),
    'The confirmed first 200 are updated even while the final response is unknown',
  );
  assert.equal(
    confirmed[200].public,
    false,
    'The unknown result is not guessed from the submitted command',
  );
  assert.equal(
    (await traffic()).length,
    2,
    'No unknown write is automatically replayed',
  );
  await page.click(button('查看待核对结果'));
  await page.click('[data-testid="batch-check"]');
  await done();
  await selected(0);
  const requests = await traffic();
  assert.deepEqual(
    requests.map((entry) => ({
      mode: entry.request.mode,
      count: entry.request.ids.length,
    })),
    [
      { mode: 'apply', count: 200 },
      { mode: 'apply', count: 1 },
      { mode: 'check', count: 1 },
    ],
  );
  assert.equal(
    (await loadedCards(page, settle)).find(
      (item) => item.id === batchImageId(200),
    ).public,
    true,
  );
  report.confirmedChunkCache = {
    firstConfirmed: 200,
    unknown: 1,
    requestModes: requests.map((entry) => entry.request.mode),
  };
  // Reset this scenario's own visibility fixture before its independent pagination check.
  await sql(
    "UPDATE media_images SET visibility='private' WHERE id LIKE 'issue177-%' AND id <> 'issue177-000'",
  );
}

/** Real mutations must update cached pages without restarting loaded cursor windows. */
export async function verifyBatchCache(context) {
  const {
    page,
    config,
    report,
    loaded,
    choose,
    action,
    selected,
    submit,
    done,
    returnToLibrary,
    monitor,
    shot,
    resize,
    setTheme,
    settle,
  } = context;
  await resize(1440);
  await setTheme('light');
  await verifyConfirmedChunk(context);
  await page.goto(`${config.origin}/library?q=issue177-&pageSize=20&page=1`);
  await loaded(20);
  await choose(1);
  await page.click('nav[aria-label="图库分页"] button:has-text("下一页")');
  await loaded(20);
  await choose(20);
  await action('设为公开', 2);
  await monitor();
  await page.click(submit);
  await done();
  await selected(0);
  await page.click('nav[aria-label="图库分页"] button:has-text("上一页")');
  await loaded(20);
  await page.waitForFunction(
    (id) =>
      document
        .querySelector(`[data-image-id="${id}"]`)
        ?.textContent.includes('公开'),
    batchImageId(1),
  );
  await shot('cache-old-page-current-visibility', 1440, 'light');

  // Use the existing loading-mode control; history and selections stay in the real app.
  await page.click('loc=role:button[name="图片加载方式"]');
  await page.click('loc=role:option[name="加载更多"]');
  await loaded(20);
  await page.click('[data-testid="library-load-more"]');
  await loaded(40);
  await page.click('[data-testid="library-load-more"]');
  await loaded(60);
  const before = (await loadedCards(page, settle)).map((item) => item.id);
  await choose(19);
  await choose(59);
  await action('移入回收站', 2);
  await monitor();
  await page.evaluate(() => {
    const original = window.fetch;
    window.__batchCacheReads = [];
    window.fetch = async (...args) => {
      const url = new URL(String(args[0]), location.href);
      if (url.pathname === '/api/images')
        window.__batchCacheReads.push(url.href);
      return original(...args);
    };
  });
  await page.click(submit);
  await done();
  await returnToLibrary();
  await loaded(58);
  const after = await page.evaluate(() => ({
    reads: window.__batchCacheReads,
    count: document.querySelector('[data-testid="library-count"]').textContent,
  }));
  after.ids = (await loadedCards(page, settle)).map((item) => item.id);
  const removed = [batchImageId(19), batchImageId(59)];
  assert.deepEqual(
    after.ids,
    before.filter((id) => !removed.includes(id)),
  );
  assert.deepEqual(
    after.reads,
    [],
    'Batch removal preserves the loaded window without reading page one again',
  );
  assert.match(after.count, /199.*已加载 58/);
  await shot('cache-loaded-window-after-trash', 1440, 'light');
  await page.click('[data-testid="library-load-more"]');
  await loaded(78);
  const next = await page.evaluate(() => ({
    reads: window.__batchCacheReads,
  }));
  next.ids = (await loadedCards(page, settle)).map((item) => item.id);
  assert.equal(next.reads.length, 1);
  const cursor = JSON.parse(
    Buffer.from(
      new URL(next.reads[0]).searchParams.get('cursor'),
      'base64url',
    ).toString('utf8'),
  );
  assert.equal(
    cursor.id,
    batchImageId(59),
    'Continue with the original server cursor even after its anchor was removed',
  );
  assert.deepEqual(next.ids.slice(0, 58), after.ids);
  assert.deepEqual(
    next.ids.slice(58),
    Array.from({ length: 20 }, (_, index) => batchImageId(60 + index)),
  );
  await shot('cache-continued-original-cursor', 1440, 'light');
  report.cacheSync = {
    removed,
    beforeCount: before.length,
    retainedCount: after.ids.length,
    nextCount: next.ids.length,
    cursor,
  };
  report.checks.push(
    'Batch visibility is current when returning to a previously cached page; loaded 60-image window retains its 58 surviving cards and continues after the unchanged original cursor of a removed anchor, without reloading page one.',
  );
}
