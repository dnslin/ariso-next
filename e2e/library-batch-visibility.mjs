import assert from 'node:assert/strict';
import { batchImageId, batchAlbumIds } from './library-batch-fixture.mjs';

export async function verifyVisibilitySuccess(context) {
  const {
    page,
    config,
    sql,
    report,
    submit,
    loaded,
    choose,
    action,
    done,
    monitor,
    traffic,
    expectResults,
    observeVisibilitySubmit,
    readVisibilitySubmit,
    visibilityToast,
    toastLayouts,
  } = context;
  report.visibilitySuccess = [];
  const ids = [batchImageId(80), batchImageId(81)];
  for (const visibility of ['public', 'private']) {
    report.activeCheck = `${visibility}-changed-unchanged-toast`;
    const inverse = visibility === 'public' ? 'private' : 'public';
    await sql(
      `UPDATE media_images SET visibility='${visibility}' WHERE id='${ids[0]}'`,
    );
    await sql(
      `UPDATE media_images SET visibility='${inverse}' WHERE id='${ids[1]}'`,
    );
    const added = [];
    if (visibility === 'public') {
      await page.goto(
        `${config.origin}/library?q=issue177-&pageSize=80&page=2`,
      );
      await loaded(80);
    } else {
      for (const id of ids) {
        await sql(
          `INSERT INTO album_images(album_id,image_id,joined_at) VALUES('${batchAlbumIds[0]}','${id}',1712345678901)`,
        );
        added.push(id);
      }
      await page.goto(
        `${config.origin}/albums/${batchAlbumIds[0]}?q=issue177-08&pageSize=80&page=1`,
      );
      await loaded(2);
    }
    const sourceUrl = await page.url();
    await choose(80);
    await choose(81);
    await action(visibility === 'public' ? '设为公开' : '设为私有', 2);
    await observeVisibilitySubmit();
    await monitor('hold');
    await page.click(submit);
    await page.waitForFunction(
      () => typeof window.__batchRelease === 'function',
    );
    const pending = await page.evaluate(() => ({
      dialog: !!document.querySelector(
        '[role="dialog"][data-testid="library-batch"]',
      ),
      disabled: document.querySelector('[data-testid="batch-submit"]')
        ?.disabled,
      text: document.querySelector('[data-testid="batch-submit"]')?.textContent,
    }));
    assert.equal(pending.dialog, true);
    assert.equal(pending.disabled, true);
    assert.ok(pending.text.includes('正在设置'));
    await page.evaluate(() => window.__batchRelease());
    await done();
    const transitions = await readVisibilitySubmit();
    await expectResults({ changed: 1, unchanged: 1 });
    const sent = await traffic();
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].request.ids, ids);
    assert.deepEqual(sent[0].request.command, {
      type: 'visibility',
      visibility,
    });
    const toast = await visibilityToast(visibility, 1, 1, sourceUrl);
    assert.deepEqual(
      await sql(
        `SELECT id,visibility FROM media_images WHERE id IN ('${ids.join("','")}') ORDER BY id`,
      ),
      ids.map((id) => ({ id, visibility })),
    );
    await toastLayouts(`${visibility}-success-toast`, toast);
    report.visibilitySuccess.push({
      visibility,
      ids,
      toast,
      results: sent[0].response.results,
      pending,
      transitions,
    });
    for (const id of added)
      await sql(
        `DELETE FROM album_images WHERE album_id='${batchAlbumIds[0]}' AND image_id='${id}'`,
      );
  }
  report.checks.push(
    'Real public/private writes report one changed and one unchanged item in the native success Toast, clear actual selection, retain the exact original library page or album route, and render readable 44px feedback in desktop/mobile light/dark themes.',
  );
}

export async function verifyVisibilityFailures(context) {
  const {
    page,
    config,
    sql,
    report,
    submit,
    loaded,
    selected,
    choose,
    action,
    visit,
    done,
    monitor,
    traffic,
    layouts,
    expectResults,
    assertNoVisibilityToast,
    visibilityToast,
    toastLayouts,
  } = context;
  const ids = [batchImageId(0), batchImageId(1), batchImageId(80)];
  const failedIds = ids.slice(1);
  report.visibilityFailures = [];
  for (const visibility of ['public', 'private']) {
    report.activeCheck = `${visibility}-cross-page-failures-and-success-toast`;
    const original = visibility === 'public' ? 'private' : 'public';
    await sql(
      `UPDATE media_images SET visibility = '${original}' WHERE id IN ('${ids.join("','")}')`,
    );
    await visit();
    await choose(0);
    await choose(1);
    await page.click('nav[aria-label="图库分页"] button:has-text("下一页")');
    await loaded(80);
    await choose(80);
    await selected(3);
    const sourceUrl = await page.url();
    await action(visibility === 'public' ? '设为公开' : '设为私有', 3);
    await sql(
      `CREATE TRIGGER issue177_visibility_failure BEFORE UPDATE OF visibility ON media_images WHEN OLD.id IN ('${failedIds.join("','")}') AND NEW.visibility = '${visibility}' BEGIN SELECT RAISE(ABORT, 'Issue 177 real per-image visibility write failure'); END`,
    );
    await monitor();
    await page.click(submit);
    await done();
    const results = await expectResults({ changed: 1, failed: 2 });
    await assertNoVisibilityToast();
    const failures = results.filter((row) => row.status === 'failed');
    const initial = await traffic();
    assert.equal(initial.length, 1);
    assert.deepEqual(initial[0].request.ids, ids);
    assert.deepEqual(initial[0].request.command, {
      type: 'visibility',
      visibility,
    });
    assert.deepEqual(
      failures.map((row) => row.id),
      failedIds,
    );
    assert.ok(failures.every((row) => row.inQuery && row.message));
    const initialVisibility = await sql(
      `SELECT id,visibility FROM media_images WHERE id IN ('${ids.join("','")}') ORDER BY id`,
    );
    assert.deepEqual(
      initialVisibility,
      ids.map((id, index) => ({
        id,
        visibility: index ? original : visibility,
      })),
      'The first image commits while both actual failed writes retain their original visibility',
    );
    assert.equal(
      await page.evaluate(
        () =>
          !!document.querySelector(
            '[role="dialog"][data-testid="library-batch"]',
          ),
      ),
      false,
      'The initial mixed attempt shows the full result summary',
    );
    await layouts(`${visibility}-failed-summary`, [390, 1440]);
    await page.click('[data-testid="batch-view-failures"]');
    await page.waitForSelector(
      'section[data-testid="library-batch"][data-batch-view="retained"]',
    );
    await page.waitForFunction(() => {
      const image = document.querySelector('[data-testid="library-batch"] img');
      return image?.complete && image.naturalWidth > 0;
    });
    const retained = await page.evaluate(() => {
      const workspace = document.querySelector('[data-testid="library-batch"]');
      const sample = [...workspace.children].find((node) =>
        node.querySelector('img'),
      );
      const thumbnail = sample?.querySelector('img');
      return {
        view: workspace.dataset.batchView,
        title: workspace.querySelector('h1')?.textContent.replace(/\s+/g, ''),
        summary: workspace.querySelector('[data-testid="batch-summary"]')
          ?.textContent,
        sample: sample?.textContent,
        thumbnail: thumbnail
          ? {
              src: thumbnail.getAttribute('src'),
              loaded: thumbnail.complete && thumbnail.naturalWidth > 0,
            }
          : null,
        rows: [...workspace.querySelectorAll('[data-batch-result-id]')].map(
          (node) => ({
            id: node.dataset.batchResultId,
            status: node.dataset.resultStatus,
            text: node.textContent,
          }),
        ),
        retryEnabled:
          document.querySelector('[data-testid="batch-retry"]')?.disabled ===
          false,
      };
    });
    assert.equal(
      (await traffic()).length,
      initial.length,
      'Viewing the visibility retained page never sends an apply or check request',
    );
    assert.equal(retained.view, 'retained');
    assert.equal(retained.title, '保留2张失败项');
    assert.equal(retained.summary, '当前页1张 · 其他页1张');
    assert.deepEqual(
      retained.rows.map((row) => row.id),
      failedIds,
    );
    assert.ok(retained.rows.every((row) => row.status === 'failed'));
    assert.ok(
      retained.rows[0].text.includes('第1页'),
      'The retained first-page failure keeps its actual source page',
    );
    assert.ok(
      retained.rows[1].text.includes('第2页'),
      'The retained second-page failure keeps its actual source page',
    );
    assert.ok(
      failedIds.some((id) => retained.sample?.includes(`${id}.png`)) &&
        !retained.sample.includes(`${ids[0]}.png`),
      'The retained sample identifies an actual failed image rather than the initial successful sample',
    );
    assert.ok(
      retained.thumbnail?.loaded,
      'The retained sample uses its real readable thumbnail',
    );
    const sampleId = failedIds.find((id) =>
      retained.sample.includes(`${id}.png`),
    );
    const sampleUrl = new URL(retained.thumbnail.src, config.origin);
    assert.equal(sampleUrl.pathname, `/i/${sampleId}`);
    assert.equal(sampleUrl.searchParams.get('type'), 'thumbnail');
    assert.ok(
      retained.rows.every((row) =>
        row.text.includes(
          failures.find((failure) => failure.id === row.id).message,
        ),
      ),
      'The retained page shows each actual server failure cause',
    );
    assert.equal(retained.retryEnabled, true);
    await layouts(`${visibility}-retained-failures`, [390, 1440]);
    await sql('DROP TRIGGER issue177_visibility_failure');
    await page.click('[data-testid="batch-retry"]');
    await done();
    const completed = await traffic();
    assert.equal(completed.length, 2);
    assert.deepEqual(
      completed[1].request.ids,
      failedIds,
      'Explicit visibility retry writes only the valid failed IDs',
    );
    assert.deepEqual(completed[1].request.command, initial[0].request.command);
    assert.deepEqual(
      completed.map((entry) => entry.request.mode),
      ['apply', 'apply'],
    );
    assert.deepEqual(
      completed[1].response.results.map((row) => row.id),
      failedIds,
    );
    assert.ok(
      completed[1].response.results.every((row) => row.status === 'changed'),
    );
    const finalVisibility = await sql(
      `SELECT id,visibility FROM media_images WHERE id IN ('${ids.join("','")}') ORDER BY id`,
    );
    assert.deepEqual(
      finalVisibility,
      ids.map((id) => ({ id, visibility })),
    );
    const toast = await visibilityToast(visibility, 2, 0, sourceUrl);
    await toastLayouts(`${visibility}-retry-success-toast`, toast);
    report.visibilityFailures.push({
      visibility,
      ids,
      failedIds,
      initialVisibility,
      finalVisibility,
      retained,
      requests: completed.map((entry) => ({
        ids: entry.request.ids,
        mode: entry.request.mode,
        statuses: entry.response.results.map((row) => row.status),
      })),
      toast,
    });
  }
  report.checks.push(
    'Actual public/private UPDATE failures return one committed image and two retained failures across pages; viewing the dedicated retained page performs no request and shows an actual failed sample, one current-page/one other-page failure and actual causes; explicit retry sends only failed IDs, persists all three target visibility values, returns to the exact original page with a native two-changed success Toast and clears the real selection.',
  );
}

export async function verifyVisibilityRecovery(context) {
  const {
    page,
    sql,
    report,
    submit,
    settle,
    selected,
    action,
    done,
    monitor,
    traffic,
    layouts,
    selectAll201,
    pickFirstTwo,
    expectResults,
    observeVisibilitySubmit,
    readVisibilitySubmit,
    assertNoVisibilityToast,
    visibilityToast,
    toastLayouts,
  } = context;
  await sql(
    "UPDATE media_images SET visibility='private' WHERE id LIKE 'issue177-%'",
  );
  report.activeCheck = '201-visibility-loss-check-unsent';
  await selectAll201();
  await action('设为公开', 201);
  await layouts('public-confirm', [390, 1440]);
  await monitor('lose');
  await page.click(submit);
  await page.waitForSelector('[data-testid="batch-check"]');
  await settle();
  let sent = await traffic();
  assert.equal(
    sent.length,
    1,
    'A lost response never automatically writes or checks again',
  );
  assert.equal(sent[0].request.mode, 'apply');
  assert.equal(sent[0].request.ids.length, 200);
  assert.equal(
    sent[0].response.results.every((row) => row.status === 'changed'),
    true,
  );
  assert.equal(
    (
      await sql(
        "SELECT count(*) AS count FROM media_images WHERE id LIKE 'issue177-%' AND visibility = 'public'",
      )
    )[0].count,
    200,
  );
  assert.equal(
    (
      await sql(
        `SELECT visibility FROM media_images WHERE id = '${batchImageId(200)}'`,
      )
    )[0].visibility,
    'private',
    'The unsent final image is unchanged',
  );
  await assertNoVisibilityToast();
  await layouts('unknown', [390, 1440]);
  await page.evaluate(() => {
    window.__batchFault = 'check-lose';
  });
  await page.click('[data-testid="batch-check"]');
  await page.waitForFunction(
    () =>
      document.querySelector('#batch-title')?.textContent ===
        '暂时无法核对结果' &&
      document
        .querySelector('[data-testid="batch-check"]')
        ?.textContent.includes('再次核对'),
  );
  await assertNoVisibilityToast();
  await layouts('check-failed', [390, 1440]);
  sent = await traffic();
  assert.deepEqual(
    sent.map((entry) => entry.request.mode),
    ['apply', 'check'],
    'A failed read-only check never re-applies the operation',
  );
  assert.equal(sent[1].request.ids.length, 200);
  await page.click('[data-testid="batch-check"]');
  await done();
  sent = await traffic();
  assert.deepEqual(
    sent.map((entry) => entry.request.mode),
    ['apply', 'check', 'check'],
  );
  assert.equal(sent[2].request.ids.length, 200);
  assert.equal(
    sent[2].response.results.every((row) => row.status === 'unchanged'),
    true,
  );
  assert.equal(
    await page.evaluate(() =>
      document
        .querySelector('[data-testid="library-batch"]')
        .textContent.includes('1张尚未提交'),
    ),
    true,
    'Check preserves the single unsent image',
  );
  await assertNoVisibilityToast();
  await page.waitForSelector('[data-testid="batch-retry"]');
  assert.equal(
    await page.evaluate(
      () => document.querySelector('[data-testid="batch-retry"]').disabled,
    ),
    false,
    'The unsent image has an explicit continuation action',
  );
  const continuedSourceUrl = await page.url();
  await page.click('[data-testid="batch-retry"]');
  await done();
  sent = await traffic();
  assert.deepEqual(
    sent.map((entry) => entry.request.mode),
    ['apply', 'check', 'check', 'apply'],
  );
  assert.deepEqual(
    sent[3].request.ids,
    [batchImageId(200)],
    'Explicit continuation submits only the final unsent ID',
  );
  assert.equal(
    (
      await sql(
        "SELECT count(*) AS count FROM media_images WHERE id LIKE 'issue177-%' AND visibility = 'public'",
      )
    )[0].count,
    201,
  );
  const continuedView = await visibilityToast(
    'public',
    1,
    0,
    continuedSourceUrl,
  );
  report.continuedView = continuedView;
  await toastLayouts('public-continued-toast', continuedView);
  report.lostResponse = {
    applied: 200,
    checked: 200,
    explicitlyContinued: sent[3].request.ids,
    modes: sent.map((entry) => entry.request.mode),
  };
  await selected(0);
  await pickFirstTwo('设为私有');
  const privateSourceUrl = await page.url();
  await layouts('private-confirm', [390, 1440]);
  await observeVisibilitySubmit();
  await monitor();
  await page.click(submit);
  await done();
  await readVisibilitySubmit();
  await expectResults({ changed: 2 });
  const privateToast = await visibilityToast('private', 2, 0, privateSourceUrl);
  await toastLayouts('private-two-changed-toast', privateToast);
  assert.deepEqual(
    (
      await sql(
        `SELECT visibility FROM media_images WHERE id IN ('${batchImageId(0)}','${batchImageId(1)}') ORDER BY id`,
      )
    ).map((row) => row.visibility),
    ['private', 'private'],
  );
  report.checks.push(
    'Discarding the real committed first 200-image public response stops the final unsent item; check reads only the 200 unknown IDs; explicit continuation writes only the last ID; private action only changes visibility.',
  );
}
