import assert from 'node:assert/strict';
import { image, endpoint, quote } from './library-detail-171-helpers.mjs';

export async function verifyDetail171Fields({ page, sql, report }) {
  const before = JSON.parse((await page.fetch(endpoint)).body);
  const objects = await sql(
    `SELECT id,key,status FROM media_objects WHERE image_id='${image}' ORDER BY id`,
  );
  const patch = (path, body) =>
    page.fetch(path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  try {
    const modified = await patch(endpoint, {
      displayName: '  已修改的显示名称 🌅  ',
      visibility: 'private',
    });
    assert.equal(modified.status, 200);
    const after = JSON.parse(modified.body);
    assert.equal(after.displayName, '已修改的显示名称 🌅');
    assert.equal(after.visibility, 'private');
    assert.equal(after.originalName, before.originalName);
    assert.equal(after.id, before.id);
    assert.deepEqual(
      await sql(
        `SELECT id,key,status FROM media_objects WHERE image_id='${image}' ORDER BY id`,
      ),
      objects,
    );
    assert.equal((await patch(endpoint, {})).status, 400);
    assert.equal(
      (await patch(endpoint, { displayName: '错误\n名称' })).status,
      400,
    );
    assert.equal(
      JSON.parse((await page.fetch(endpoint)).body).displayName,
      after.displayName,
    );
    report.checks.push(
      'Real owner-cookie PATCH trims Unicode displayName and changes visibility without rewriting originalName, ID, object Key or stored state; empty/control-character edits reject without changing data. Edit UI remains design-blocked.',
    );
  } finally {
    assert.equal(
      (
        await patch(endpoint, {
          displayName: before.displayName,
          visibility: before.visibility,
        })
      ).status,
      200,
    );
  }
}

export async function verifyDetail171Collections({ page, sql, report }) {
  const before = JSON.parse((await page.fetch(endpoint)).body);
  const patch = (path, body) =>
    page.fetch(path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const now = Date.now();
  try {
    await sql(
      `INSERT INTO albums (id,name,description,created_at,updated_at) VALUES ('detail-171-album','详情关系验证','',${now},${now})`,
    );
    await sql(
      `INSERT INTO tags (id,display_name,normalized_key,created_at,updated_at) VALUES ('detail-171-tag','详情关系验证','详情关系验证',${now},${now})`,
    );
    const relationships = await patch(`${endpoint}/collections`, {
      albumIds: ['detail-171-album'],
      tagIds: ['detail-171-tag'],
    });
    assert.equal(relationships.status, 200);
    assert.deepEqual(JSON.parse(relationships.body).albums, [
      { id: 'detail-171-album', name: '详情关系验证' },
    ]);
    assert.deepEqual(JSON.parse(relationships.body).tags, [
      { id: 'detail-171-tag', displayName: '详情关系验证' },
    ]);
    const joined = await sql(
      `SELECT joined_at FROM album_images WHERE image_id='${image}' AND album_id='detail-171-album'`,
    );
    assert.equal(
      (await patch(`${endpoint}/collections`, { tagIds: [] })).status,
      200,
    );
    assert.deepEqual(
      await sql(
        `SELECT joined_at FROM album_images WHERE image_id='${image}' AND album_id='detail-171-album'`,
      ),
      joined,
    );
    report.checks.push(
      'Single-image final-set relations use real collection provider transactions; omitted album selection retains its join timestamp while an empty tag set clears tags.',
    );
  } finally {
    const restored = await patch(`${endpoint}/collections`, {
      albumIds: before.albums.map((album) => album.id),
      tagIds: before.tags.map((tag) => tag.id),
    });
    assert.equal(restored.status, 200);
    await sql("DELETE FROM albums WHERE id='detail-171-album'");
    await sql("DELETE FROM tags WHERE id='detail-171-tag'");
  }
}

export async function verifyDetail171Metadata({ page, sql, report }) {
  const before = JSON.parse((await page.fetch(endpoint)).body);
  const previous = await sql(
    `SELECT * FROM media_metadata WHERE image_id='${image}'`,
  );
  try {
    await sql(`DELETE FROM media_metadata WHERE image_id='${image}'`);
    const unread = await page.fetch(`${endpoint}/metadata`);
    assert.equal(unread.status, 200);
    assert.equal(JSON.parse(unread.body), null);
    const read = await page.fetch(`${endpoint}/metadata/read`, {
      method: 'POST',
    });
    assert.equal(read.status, 202);
    await page.waitForFunction(
      async (path) => {
        const response = await fetch(path);
        if (!response.ok)
          throw new Error(`Metadata verification HTTP ${response.status}`);
        const value = await response.json();
        return value?.status === 'succeeded' || value?.status === 'failed';
      },
      `${endpoint}/metadata`,
      { timeout: 30000 },
    );
    const metadata = JSON.parse(
      (await page.fetch(`${endpoint}/metadata`)).body,
    );
    assert.equal(metadata.status, 'succeeded');
    assert.equal(metadata.historical, false);
    assert.ok(metadata.data && Object.keys(metadata.data).length > 0);
    assert.ok(metadata.readAt);
    assert.equal(
      JSON.parse((await page.fetch(endpoint)).body).processingStatus,
      before.processingStatus,
    );
    report.checks.push(
      'Metadata GET distinguishes unread null; existing POST queues real ExifTool read, returns complete grouped JSON and timestamps, and leaves process state unchanged. Tree/search UI remains design-blocked.',
    );
  } finally {
    await sql(`DELETE FROM media_metadata WHERE image_id='${image}'`);
    for (const row of previous) {
      const columns = Object.keys(row);
      await sql(
        `INSERT INTO media_metadata (${columns.join(',')}) VALUES (${columns.map((column) => quote(row[column])).join(',')})`,
      );
    }
  }
}
