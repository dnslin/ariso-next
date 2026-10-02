import assert from 'node:assert/strict';
import { copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { captureRelationLayout } from './upload-relation-layouts.mjs';
import { resizeViewport, setTheme } from './browser-geometry.mjs';

/** Frozen submissions retain actual IDs when current names or targets change. */
export async function verifyUploadRelationSubmissions(
  { page, config, sql, report, api, step },
  { a2, t2, quickAlbum, quickTag, open, closeChoices, remove },
) {
  const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
  const button = (name) => `loc=role:button[name="${name}"]`;
  const input = 'input[aria-label="选择图片文件"]';
  const summarySelector = (id) =>
    `[data-testid="upload-frozen-submission"][data-submission-id="${id}"]`;
  async function screenshot(name, width, theme) {
    await setTheme(page, theme);
    await resizeViewport(page, width);
    await captureRelationLayout({ page, config, report }, name, width, theme);
  }
  async function summary(id) {
    return page.evaluate((selector) => {
      const node = document.querySelector(selector);
      return node
        ? {
            albums: JSON.parse(node.dataset.albumIds),
            tags: JSON.parse(node.dataset.tagIds),
            groups: JSON.parse(node.dataset.groups),
            text: node.textContent,
          }
        : null;
    }, summarySelector(id));
  }
  async function start(files, previousIds = []) {
    step('start real submission', { files: files.length, previousIds });
    await page.setInputFiles(input, files);
    await page.waitForFunction(
      (count) =>
        document.querySelectorAll('[data-state="queued"]').length === count,
      files.length,
    );
    await page.click(button('开始上传'));
    await page.waitForFunction(
      ({ previous, count }) =>
        document.querySelectorAll('[data-state="queued"]').length === 0 &&
        [
          ...document.querySelectorAll(
            '[data-testid="upload-frozen-submission"][data-submission-id]',
          ),
        ].some((node) => !previous.includes(node.dataset.submissionId)) &&
        document.querySelectorAll('[data-testid="upload-item"]').length ===
          count,
      {
        previous: previousIds,
        count: files.length + (previousIds.length ? 3 : 0),
      },
    );
    const id = await page.evaluate(
      (previous) =>
        [
          ...document.querySelectorAll(
            '[data-testid="upload-frozen-submission"][data-submission-id]',
          ),
        ].find((node) => !previous.includes(node.dataset.submissionId)).dataset
          .submissionId,
      previousIds,
    );
    const [submission] = await sql(
      `SELECT * FROM upload_submissions WHERE id=${literal(id)}`,
    );
    await page.waitForSelector(summarySelector(submission.id));
    return submission;
  }
  let installed = false;
  try {
    const filesDirectory = join(config.output, 'relation-files');
    await mkdir(filesDirectory, { recursive: true });
    const files = [];
    for (let index = 0; index < 3; index++) {
      const path = join(filesDirectory, `relation-${index}.png`);
      await copyFile(
        join(
          config.projectDirectory,
          'tests/fixtures/runtime/images/sample.png',
        ),
        path,
      );
      files.push(path);
    }
    // Hold actual native sends; releasing a slot still performs the real HTTP upload.
    await page.evaluate(() => {
      const nativeOpen = XMLHttpRequest.prototype.open;
      const nativeSend = XMLHttpRequest.prototype.send;
      window.__relationPending = [];
      window.__restoreRelationXHR = () => {
        XMLHttpRequest.prototype.open = nativeOpen;
        XMLHttpRequest.prototype.send = nativeSend;
      };
      XMLHttpRequest.prototype.open = function (method, path, ...rest) {
        this.__relationPath = String(path);
        return nativeOpen.call(this, method, path, ...rest);
      };
      XMLHttpRequest.prototype.send = function (body) {
        if (!this.__relationPath?.includes('/api/uploads/sessions/'))
          return nativeSend.call(this, body);
        window.__relationPending.push({
          path: this.__relationPath,
          send: () => nativeSend.call(this, body),
        });
      };
    });
    installed = true;
    await page.click('loc=role:button[name*="可见性"]');
    await page.click('loc=role:option[name="公开"]');
    const first = await start(files);
    assert.equal(first.visibility, 'public');
    const frozen = await summary(first.id);
    assert.deepEqual([...frozen.albums].sort(), [a2.id, quickAlbum.id].sort());
    assert.deepEqual([...frozen.tags].sort(), [t2.id, quickTag.id].sort());
    assert.deepEqual(frozen.groups, [2, 1]);
    assert.ok(
      frozen.text.includes('快速相册') && frozen.text.includes('快速标签'),
    );
    assert.deepEqual(
      JSON.parse(first.album_ids).sort(),
      [...frozen.albums].sort(),
    );
    assert.deepEqual(JSON.parse(first.tag_ids).sort(), [...frozen.tags].sort());
    const [{ id: acceptedSession }] = await sql(
      `SELECT id FROM upload_sessions WHERE submission_id=${literal(first.id)} AND group_index=0 LIMIT 1`,
    );
    await page.waitForFunction(
      (id) => window.__relationPending.some((item) => item.path.includes(id)),
      acceptedSession,
    );
    await page.evaluate((id) => {
      const index = window.__relationPending.findIndex((item) =>
        item.path.includes(id),
      );
      window.__relationPending.splice(index, 1)[0].send();
    }, acceptedSession);
    await page.waitForSelector('[data-state="ready"]', { timeout: 60000 });
    const [accepted] = await sql(
      `SELECT image_id FROM upload_sessions WHERE id=${literal(acceptedSession)}`,
    );
    assert.ok(accepted.image_id);
    assert.deepEqual(
      (
        await sql(
          `SELECT album_id FROM album_images WHERE image_id=${literal(accepted.image_id)} ORDER BY album_id`,
        )
      ).map((row) => row.album_id),
      [a2.id, quickAlbum.id].sort(),
    );
    assert.deepEqual(
      (
        await sql(
          `SELECT tag_id FROM image_tags WHERE image_id=${literal(accepted.image_id)} ORDER BY tag_id`,
        )
      ).map((row) => row.tag_id),
      [t2.id, quickTag.id].sort(),
    );

    await api(`/api/albums/${quickAlbum.id}`, 'PATCH', {
      name: '相册后来更名',
    });
    await sql(
      `UPDATE tags SET display_name='标签后来更名', normalized_key='标签后来更名' WHERE id=${literal(quickTag.id)}`,
    );
    await open('albums');
    await page.waitForFunction(() =>
      document
        .querySelector('[data-testid="upload-albums"]')
        ?.textContent.includes('相册后来更名'),
    );
    await closeChoices('albums');
    await open('tags');
    await page.waitForFunction(() =>
      document
        .querySelector('[data-testid="upload-tags"]')
        ?.textContent.includes('标签后来更名'),
    );
    await closeChoices('tags');
    assert.deepEqual(
      await summary(first.id),
      frozen,
      'Collection refresh cannot rewrite names or IDs frozen at the first start',
    );
    await remove('albums', a2.id);
    await remove('tags', t2.id);
    await api('/api/settings/upload', 'PATCH', { batchSize: 1 });
    await page.click('loc=role:button[name*="可见性"]');
    await page.click('loc=role:option[name="私有"]');
    const second = await start(files.slice(0, 2), [first.id]);
    const nextFrozen = await summary(second.id);
    assert.deepEqual(nextFrozen.albums, [quickAlbum.id]);
    assert.deepEqual(nextFrozen.tags, [quickTag.id]);
    assert.deepEqual(nextFrozen.groups, [1, 1]);
    assert.ok(
      nextFrozen.text.includes('相册后来更名') &&
        nextFrozen.text.includes('标签后来更名') &&
        nextFrozen.text.includes('私有'),
    );
    assert.equal(second.visibility, 'private');
    assert.equal(second.batch_size, 1);
    assert.equal(
      (
        await sql(
          `SELECT batch_size FROM upload_submissions WHERE id=${literal(first.id)}`,
        )
      )[0].batch_size,
      2,
    );
    assert.deepEqual(await summary(first.id), frozen);
    for (const theme of ['light', 'dark'])
      for (const width of [360, 390, 430, 768, 1440])
        await screenshot('two-frozen', width, theme);
    report.checks.push(
      'Three real files freeze groups 2/1 and both selected relations. Later names, visibility and batch-size changes only enter a second real submission with groups 1/1; refreshing choices leaves the original summary identical.',
    );

    await api(`/api/albums/${a2.id}`, 'DELETE');
    const replacementAlbum = (
      await api('/api/albums', 'POST', { name: a2.name }, 201)
    ).album;
    await sql(`DELETE FROM tags WHERE id=${literal(t2.id)}`);
    const replacementTag = (
      await api('/api/tags', 'POST', { name: t2.displayName }, 201)
    ).tag;
    assert.notEqual(replacementAlbum.id, a2.id);
    assert.notEqual(replacementTag.id, t2.id);
    // Four remaining sends may become available in later groups; wait on actual
    // terminal states, not a guessed fixed number of scheduling ticks.
    const deadline = Date.now() + 60000;
    while (true) {
      const [{ n }] = await sql(
        `SELECT count(*) AS n FROM upload_sessions WHERE submission_id IN (${literal(first.id)},${literal(second.id)}) AND state NOT IN ('accepted','failed','cancelled','expired')`,
      );
      if (!n) break;
      assert.ok(
        Date.now() < deadline,
        'All real upload sessions settle after native sends are released',
      );
      await page.waitForFunction(
        () =>
          window.__relationPending.length > 0 ||
          [...document.querySelectorAll('[data-testid="upload-item"]')].every(
            (node) =>
              ['ready', 'upload-failed', 'processing-failed'].includes(
                node.dataset.state,
              ),
          ),
        undefined,
        { timeout: 15000 },
      );
      await page.evaluate(() =>
        window.__relationPending.splice(0).forEach((item) => item.send()),
      );
    }
    await page.waitForFunction(
      () =>
        document.querySelectorAll('[data-state="ready"]').length === 3 &&
        document.querySelectorAll('[data-state="upload-failed"]').length === 2,
      undefined,
      { timeout: 60000 },
    );
    assert.deepEqual(
      await sql(
        `SELECT state, count(*) AS n FROM upload_sessions WHERE submission_id=${literal(first.id)} GROUP BY state ORDER BY state`,
      ),
      [
        { state: 'accepted', n: 1 },
        { state: 'failed', n: 2 },
      ],
    );
    assert.deepEqual(
      await sql(
        `SELECT error_code FROM upload_sessions WHERE submission_id=${literal(first.id)} AND state='failed'`,
      ),
      [
        { error_code: 'COLLECTION_TARGET_REMOVED' },
        { error_code: 'COLLECTION_TARGET_REMOVED' },
      ],
    );
    assert.equal(
      (
        await sql(
          `SELECT count(*) AS n FROM album_images WHERE album_id=${literal(replacementAlbum.id)}`,
        )
      )[0].n,
      0,
    );
    assert.equal(
      (
        await sql(
          `SELECT count(*) AS n FROM image_tags WHERE tag_id=${literal(replacementTag.id)}`,
        )
      )[0].n,
      0,
    );
    assert.equal(
      (
        await sql(
          `SELECT count(*) AS n FROM upload_sessions WHERE submission_id=${literal(second.id)} AND state='accepted'`,
        )
      )[0].n,
      2,
    );
    assert.equal(
      (
        await sql(
          `SELECT count(*) AS n FROM media_images WHERE id=${literal(accepted.image_id)}`,
        )
      )[0].n,
      1,
    );
    assert.deepEqual(await summary(first.id), frozen);
    await screenshot('deleted-target-results', 390, 'dark');
    report.checks.push(
      'Deleting old album/tag IDs and recreating their names leaves the accepted original image intact, fails the other two old files with COLLECTION_TARGET_REMOVED, attaches no image to replacements, and allows both unrelated second-submission files to reach ready.',
    );
  } finally {
    if (installed) await page.evaluate(() => window.__restoreRelationXHR());
  }
}
