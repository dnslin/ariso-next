import assert from 'node:assert/strict';
import {
  batchImageId,
  batchImageName,
  batchAlbumIds,
} from './library-batch-fixture.mjs';

export async function verifyAlbumMixedResults(context) {
  const {
    page,
    sql,
    report,
    submit,
    selected,
    choose,
    action,
    target,
    visit,
    done,
    returnToLibrary,
    monitor,
    layouts,
    expectResults,
  } = context;
  await visit();
  for (const index of [0, 1, 2, 3]) await choose(index);
  await sql(
    `UPDATE media_images SET visibility = 'private' WHERE id = '${batchImageId(0)}'`,
  );
  report.activeCheck = 'four-item-mixed-design-result';
  await action('添加到相册', 4);
  await target(batchAlbumIds[0]);
  await target(batchAlbumIds[1]);
  await sql(
    `CREATE TRIGGER issue177_batch_failure BEFORE INSERT ON album_images WHEN NEW.image_id = '${batchImageId(3)}' AND NEW.album_id = '${batchAlbumIds[1]}' BEGIN SELECT RAISE(ABORT, 'Issue 177 representative second relationship failure'); END`,
  );
  await monitor('hold');
  await page.click(submit);
  await page.waitForFunction(() => typeof window.__batchRelease === 'function');
  assert.equal(
    await page.evaluate(() =>
      document.querySelector('#batch-title').textContent.includes('操作完成'),
    ),
    false,
    'Held actual response cannot show a completed title',
  );
  await page.evaluate(() => window.__batchRelease());
  await done();
  await expectResults({ changed: 2, unchanged: 1, failed: 1 });
  await layouts('mixed-results');
  await sql('DROP TRIGGER issue177_batch_failure');
  await returnToLibrary();
  await selected(1);
}

export async function verifyAlbumCrossPageRetry(context) {
  const {
    page,
    sql,
    report,
    fixture,
    submit,
    selected,
    action,
    target,
    done,
    returnToLibrary,
    monitor,
    traffic,
    resize,
    shot,
    layouts,
    selectAll201,
    expectResults,
  } = context;
  report.activeCheck = '201-cross-page-mixed-and-retry';
  await selectAll201();
  await action('添加到相册', 201);
  await target(batchAlbumIds[0]);
  await target(batchAlbumIds[1]);
  await sql(
    `CREATE TRIGGER issue177_batch_failure BEFORE INSERT ON album_images WHEN NEW.image_id = '${batchImageId(150)}' AND NEW.album_id = '${batchAlbumIds[1]}' BEGIN SELECT RAISE(ABORT, 'Issue 177 real second relationship failure'); END`,
  );
  await monitor('hold');
  await page.click(submit);
  await page.waitForFunction(() => typeof window.__batchRelease === 'function');
  assert.equal(
    await page.evaluate(
      () =>
        document
          .querySelector('[data-testid="library-batch"]')
          .getAttribute('aria-busy') === 'true',
    ),
    true,
  );
  await shot('applying', 1440, 'dark');
  await page.evaluate(() => window.__batchRelease());
  await done();
  let sent = await traffic();
  assert.deepEqual(
    sent.map((entry) => entry.request.ids.length),
    [200, 1],
  );
  assert.deepEqual(
    sent.flatMap((entry) => entry.request.ids).sort(),
    fixture.ids,
  );
  assert.ok(sent.every((entry) => entry.request.mode === 'apply'));
  const mixed = await expectResults({
    changed: 199,
    unchanged: 1,
    failed: 1,
  });
  const failed = mixed.find((row) => row.status === 'failed');
  assert.equal(failed.id, batchImageId(150));
  assert.equal(failed.inQuery, true);
  assert.deepEqual(
    await sql(
      `SELECT album_id FROM album_images WHERE image_id = '${failed.id}'`,
    ),
    [],
    'Second relationship failure rolls back the entire image relation change',
  );
  await layouts('cross-page-results', [390, 1440]);
  const beforeRetainedRead = (await traffic()).length;
  await page.click('[data-testid="batch-retained"]');
  await page.waitForFunction(
    () => document.querySelectorAll('[data-batch-result-id]').length === 1,
  );
  assert.equal(
    (await traffic()).length,
    beforeRetainedRead,
    'Viewing retained failures does not send any apply or check request',
  );
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelector('[data-batch-result-id]')?.dataset.batchResultId,
    ),
    failed.id,
  );
  await layouts('valid-failure-before-retry', [390, 1440]);
  report.mixed = {
    requestSizes: sent.map((entry) => entry.request.ids.length),
    statuses: { changed: 199, unchanged: 1, failed: 1 },
    failed,
  };
  await page.click('[data-testid="batch-retry"]');
  await done();
  sent = await traffic();
  assert.deepEqual(
    sent.at(-1).request.ids,
    [failed.id],
    'A failed retry still sends only the retained ID',
  );
  assert.deepEqual(
    sent.at(-1).request.command,
    sent[0].request.command,
    'A failed retry retains both original album targets',
  );
  assert.equal(sent.at(-1).response.results[0].status, 'failed');
  assert.deepEqual(
    await page.evaluate(() =>
      [...document.querySelectorAll('[data-batch-result-id]')].map((node) => ({
        id: node.dataset.batchResultId,
        status: node.dataset.resultStatus,
      })),
    ),
    [{ id: failed.id, status: 'failed' }],
    'A failed retry renders only its valid failed result',
  );
  await layouts('retry-still-failed', [390, 1440]);
  const beforeSecondRead = (await traffic()).length;
  await page.click('[data-testid="batch-retained"]');
  await page.waitForSelector('[data-testid="batch-retry"]');
  assert.equal(
    (await traffic()).length,
    beforeSecondRead,
    'Viewing the still-retained retry result does not write',
  );
  await sql('DROP TRIGGER issue177_batch_failure');
  await page.click('[data-testid="batch-retry"]');
  await done();
  sent = await traffic();
  assert.deepEqual(
    sent.at(-1).request.ids,
    [failed.id],
    'Retry writes only the valid failed selection',
  );
  assert.equal(sent.at(-1).response.results[0].status, 'changed');
  const retryView = await page.evaluate(() => ({
    ids: [...document.querySelectorAll('[data-batch-result-id]')].map(
      (node) => node.dataset.batchResultId,
    ),
    summary: document
      .querySelector('[data-testid="library-batch"] [role="status"]')
      ?.textContent.replace(/\s+/g, ' ')
      .trim(),
    changedRows: document.querySelectorAll(
      '[data-batch-result-id][data-result-status="changed"]',
    ).length,
    failedRows: document.querySelectorAll(
      '[data-batch-result-id][data-result-status="failed"]',
    ).length,
  }));
  assert.deepEqual(
    retryView.ids,
    [failed.id],
    'Successful retry renders only its one explicit ID',
  );
  assert.equal(
    retryView.summary,
    '本次重试1张 · 1已修改 · 0无需修改 · 0失败',
    'Retry summary describes only this attempt',
  );
  assert.equal(retryView.changedRows, 1);
  assert.equal(retryView.failedRows, 0);
  report.retryView = retryView;
  for (const width of [390, 1440]) {
    await resize(width);
    await page.hover(`[data-batch-result-id="${failed.id}"]`);
    await shot('valid-failure-after-retry', width, 'dark');
  }
  assert.equal(
    (
      await sql(
        "SELECT count(*) AS count FROM album_images WHERE image_id LIKE 'issue177-%'",
      )
    )[0].count,
    402,
  );
  await returnToLibrary();
  await selected(0);
  report.checks.push(
    '201 cross-page explicit IDs split into 200+1; real multi-target transaction returns 199 changed, one unchanged and one failed; the failed image has neither relation, remains selected across pages, and retry submits only its ID.',
  );
}

export async function verifyAlbumRemoval(context) {
  const {
    page,
    sql,
    report,
    submit,
    target,
    done,
    returnToLibrary,
    monitor,
    pickFirstTwo,
    expectResults,
  } = context;
  await sql(
    `INSERT INTO album_images(album_id,image_id,joined_at) VALUES ${batchAlbumIds.map((albumId) => `('${albumId}','${batchImageId(1)}',1712345678901)`).join(',')}`,
  );
  report.activeCheck = 'four-relations-and-album-default';
  await pickFirstTwo('从相册移除');
  await target(batchAlbumIds[0]);
  await target(batchAlbumIds[1]);
  await monitor();
  await page.click(submit);
  await done();
  await expectResults({ changed: 2 });
  assert.deepEqual(
    await sql(
      `SELECT * FROM album_images WHERE image_id IN ('${batchImageId(0)}','${batchImageId(1)}')`,
    ),
    [],
  );
  await returnToLibrary();
}

export async function verifyCurrentAlbumRemoval(context) {
  const {
    page,
    config,
    sql,
    report,
    fixture,
    submit,
    loaded,
    selected,
    choose,
    action,
    done,
    returnToLibrary,
    monitor,
    expectResults,
  } = context;
  await sql(
    `INSERT INTO album_images(album_id,image_id,joined_at) VALUES ${fixture.ids
      .slice(1)
      .map((id) => `('${batchAlbumIds[0]}','${id}',1712345678901)`)
      .join(',')}`,
  );
  await page.goto(
    `${config.origin}/albums/${batchAlbumIds[0]}?pageSize=80&page=1`,
  );
  await loaded(80);
  await page.fill('input[aria-label="搜索图片名称"]', batchImageName(2));
  await page.press('input[aria-label="搜索图片名称"]', 'Enter');
  await loaded(1);
  await choose(2);
  await action('从相册移除', 1);
  assert.equal(
    await page.evaluate(
      (id) =>
        document.querySelector(`[data-target-id="${id}"] input`)?.checked ??
        document.querySelector(`[data-target-id="${id}"]`)?.checked,
      batchAlbumIds[0],
    ),
    true,
    'Album remove defaults to the current album',
  );
  await monitor();
  await page.click(submit);
  await done();
  const albumRemoval = await expectResults({ changed: 1 });
  assert.equal(albumRemoval[0].inQuery, false);
  await returnToLibrary();
  await selected(0);
  assert.equal(
    (
      await sql(
        `SELECT count(*) AS count FROM album_images WHERE album_id = '${batchAlbumIds[0]}' AND image_id = '${batchImageId(2)}'`,
      )
    )[0].count,
    0,
  );
  report.checks.push(
    'Library executes add/remove album and add/remove tag against real relationships, including a tag created and selected through the shared real quick-create UI; album page defaults removal to its current album and removes the successful out-of-query item from selection.',
  );
}

export async function verifyDeletedAlbumTarget(context) {
  const {
    page,
    sql,
    report,
    submit,
    button,
    selected,
    target,
    done,
    returnToLibrary,
    monitor,
    pickFirstTwo,
    expectResults,
  } = context;
  await sql(
    `DELETE FROM album_images WHERE image_id IN ('${batchImageId(0)}','${batchImageId(1)}')`,
  );
  report.activeCheck = 'concurrent-target-deletion';
  await pickFirstTwo('添加到相册');
  await target('issue177-album-c');
  const deleted = await page.fetch('/api/albums/issue177-album-c', {
    method: 'DELETE',
  });
  assert.equal(deleted.status, 200);
  await monitor();
  await page.click(submit);
  await done();
  const targetFailures = await expectResults({ failed: 2 });
  assert.deepEqual(
    await sql(
      `SELECT * FROM album_images WHERE image_id IN ('${batchImageId(0)}','${batchImageId(1)}')`,
    ),
    [],
  );
  await returnToLibrary();
  await selected(2);
  await page.click(button('操作已选 2 张图片'));
  await page.click('loc=role:menuitem[name="查看已选清单"]');
  await page.waitForSelector('[data-testid="library-selected-panel"]');
  assert.equal(
    await page.evaluate(
      (message) =>
        document
          .querySelector('[data-testid="library-selected-panel"]')
          .textContent.includes(`上次批量操作失败：${message}`),
      targetFailures[0].message,
    ),
    true,
    'Returning to the selected list retains the actual failure cause',
  );
  await page.keyboard.press('Escape');
  report.checks.push(
    'Deleting the selected real album after the workspace opens returns per-image target failures without creating any relationship and preserves both valid selected images.',
  );
}
