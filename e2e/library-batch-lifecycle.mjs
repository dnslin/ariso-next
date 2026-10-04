import assert from 'node:assert/strict';
import {
  batchImageId,
  batchImageName,
  batchAlbumIds,
  batchTagIds,
  readLibraryBatchSnapshot,
} from './library-batch-fixture.mjs';

export async function verifyBatchLifecycle(context) {
  const {
    page,
    config,
    sql,
    report,
    fixture,
    before,
    submit,
    selected,
    action,
    done,
    returnToLibrary,
    monitor,
    traffic,
    layouts,
    pickFirstTwo,
    expectResults,
    choose,
    loaded,
    resize,
    setTheme,
    shot,
  } = context;
  await sql(`DELETE FROM album_images WHERE image_id='${batchImageId(0)}'`);
  report.activeCheck = 'trash-restore-preserves-surviving-data';
  const joinedAt = 1712345678901;
  await sql(
    `INSERT INTO album_images (album_id,image_id,joined_at) VALUES ('${batchAlbumIds[0]}','${batchImageId(0)}',${joinedAt}),('${batchAlbumIds[1]}','${batchImageId(0)}',${joinedAt})`,
  );
  await sql(
    `INSERT INTO image_tags (image_id,tag_id) VALUES ('${batchImageId(0)}','${batchTagIds[0]}'),('${batchImageId(0)}','${batchTagIds[1]}')`,
  );
  // The shared selection menu also serves the real album detail route.
  await page.goto(`${config.origin}/albums/${batchAlbumIds[0]}`);
  await loaded(1);
  await choose(0);
  for (const width of [1440, 390]) {
    await resize(width);
    for (const theme of ['light', 'dark']) {
      await setTheme(theme);
      await page.click('loc=role:button[name="操作已选 1 张图片"]');
      await page.waitForSelector('[role="menu"][aria-label="已选图片操作"]');
      const items = await page.evaluate(() =>
        [...document.querySelectorAll('[role="menuitem"]')].map((item) =>
          item.textContent.trim(),
        ),
      );
      assert.equal(items.includes('永久删除所选'), false);
      assert.ok(items.includes('移入回收站'));
      await shot('album-shared-menu', width, theme);
      await page.keyboard.press('Escape');
      await page.waitForSelector('[role="menu"][aria-label="已选图片操作"]', {
        state: 'hidden',
      });
    }
  }
  report.checks.push(
    'Shared selection menu checked on the real album detail route in desktop/mobile light/dark; permanent deletion remains exclusive to trash.',
  );
  await page.goto(`${config.origin}/library?q=issue177-&pageSize=80&page=1`);
  await loaded(80);
  await resize(1440);
  await pickFirstTwo('移入回收站');
  await layouts('trash-confirm', [390, 1440]);
  await monitor();
  await page.click(submit);
  await done();
  await expectResults({ changed: 2 });
  assert.equal(
    (
      await sql(
        `SELECT count(*) AS count FROM media_images WHERE id IN ('${batchImageId(0)}','${batchImageId(1)}') AND trashed_at IS NOT NULL`,
      )
    )[0].count,
    2,
  );
  await layouts('trash-success', [390, 1440]);
  await returnToLibrary();
  await selected(0);
  const trashBefore = await readLibraryBatchSnapshot(sql, fixture.directory);
  assert.deepEqual(trashBefore.files, before.files);
  assert.deepEqual(trashBefore.objects, before.objects);
  assert.equal((await page.fetch(`/i/${batchImageId(0)}`)).status, 404);
  assert.equal(
    (
      await page.fetch(`/api/albums/${batchAlbumIds[0]}`, {
        method: 'DELETE',
      })
    ).status,
    200,
  );
  assert.equal(
    (await page.fetch(`/api/tags/${batchTagIds[0]}`, { method: 'DELETE' }))
      .status,
    200,
  );
  // Extend this independent trash fixture so selection truly spans six real pages.
  const trashedAt = 1820000000000;
  await sql(
    `UPDATE media_images SET trashed_at = ${trashedAt} WHERE id LIKE 'issue177-%'`,
  );
  await page.goto(`${config.origin}/trash`);
  await page.waitForSelector('[data-testid="trash-list"]');
  await page.click('loc=role:button[name="选择记录"]');
  for (let number = 1; number <= 5; number++) {
    await page.waitForSelector(
      `[data-testid="trash-record-${batchImageId((number - 1) * 40)}"]`,
    );
    await page.click('label:has(input[aria-label="全选当前页回收记录"])');
    await page.waitForFunction(
      (count) =>
        document
          .querySelector('[data-testid="library-selection"]')
          ?.textContent.includes(`共选 ${count} 张`),
      number * 40,
    );
    await page.click('loc=role:button[name="下一页"]');
  }
  await page.waitForSelector(
    `[data-testid="trash-record-${batchImageId(200)}"]`,
  );
  await page.click(
    `label:has(input[aria-label="选择回收图片：${batchImageName(200)}"])`,
  );
  await page.waitForFunction(() =>
    document
      .querySelector('[data-testid="library-selection"]')
      ?.textContent.includes('共选 201 张'),
  );
  await action('恢复所选', 201);
  await layouts('restore', [390, 1440]);
  await sql(
    `CREATE TRIGGER issue177_restore_failure BEFORE UPDATE OF trashed_at ON media_images WHEN OLD.id = '${batchImageId(150)}' AND NEW.trashed_at IS NULL BEGIN SELECT RAISE(ABORT, 'Issue 177 actual per-image restore failure'); END`,
  );
  await monitor();
  await page.click(submit);
  await done();
  await expectResults({ changed: 200, failed: 1 });
  await layouts('restore-mixed-summary', [390, 1440]);
  await page.click('[data-testid="batch-view-failures"]');
  await page.waitForSelector('[data-testid="batch-results"]');
  await layouts('restore-valid-failure', [390, 1440]);
  let sent = await traffic();
  assert.deepEqual(
    sent.map((entry) => entry.request.ids.length),
    [200, 1],
  );
  assert.deepEqual(
    sent.flatMap((entry) => entry.request.ids).sort(),
    fixture.ids,
  );
  await sql('DROP TRIGGER issue177_restore_failure');
  await page.click('[data-testid="batch-retry"]');
  await done();
  sent = await traffic();
  assert.deepEqual(
    sent.at(-1).request.ids,
    [batchImageId(150)],
    'Restore retry includes only the valid failed item',
  );
  assert.equal(sent.at(-1).response.results[0].status, 'changed');
  await layouts('restore-summary', [390, 1440]);
  const after = await readLibraryBatchSnapshot(sql, fixture.directory);
  assert.deepEqual(
    after.images.map((row) => row.id),
    before.images.map((row) => row.id),
  );
  assert.ok(after.images.every((row) => row.trashed_at === null));
  assert.deepEqual(after.objects, before.objects);
  assert.deepEqual(after.files, before.files);
  assert.deepEqual(
    after.images.map(({ id, visibility }) => ({ id, visibility })),
    trashBefore.images.map(({ id, visibility }) => ({ id, visibility })),
    'Restore retains each original pre-trash visibility',
  );
  assert.deepEqual(
    await sql(
      `SELECT album_id,joined_at FROM album_images WHERE image_id = '${batchImageId(0)}'`,
    ),
    [{ album_id: batchAlbumIds[1], joined_at: joinedAt }],
  );
  assert.deepEqual(
    await sql(
      `SELECT tag_id FROM image_tags WHERE image_id = '${batchImageId(0)}'`,
    ),
    [{ tag_id: batchTagIds[1] }],
  );
  report.dataPreservation = {
    imageIds: 201,
    objects: after.objects.length,
    files: after.files.length,
    survivingAlbum: batchAlbumIds[1],
    originalJoinedAt: joinedAt,
    survivingTag: batchTagIds[1],
    requestSizes: sent.map((entry) => entry.request.ids.length),
  };
  await returnToLibrary();
  await selected(0);
  report.checks.push(
    'Batch trash retains stored files and relations while external content refuses reads; 201 explicitly selected trash records span six pages and restore in 200+1 batches, one actual per-image restore failure remains selected and explicit retry writes only its ID, with identical IDs, 402 objects/files, original visibility and surviving album/tag relationships plus original joined_at; deleted targets stay deleted.',
  );
}
