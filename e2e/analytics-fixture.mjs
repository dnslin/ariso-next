import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const quote = (value) =>
  value === null
    ? 'NULL'
    : typeof value === 'number'
      ? String(value)
      : `'${String(value).replaceAll("'", "''")}'`;
const accessTables = [
  'analytics_daily',
  'analytics_image_daily',
  'analytics_image_totals',
];

/** Actual local objects and UUID records belong to the disposable runner only. */
export async function analyticsFixture(config, tools) {
  const fixture = {
    ids: Array.from({ length: 12 }, () => randomUUID()),
    storages: [],
    directories: [],
    storageRoots: [],
    snapshot: {},
    uploaded: null,
  };
  for (const table of accessTables)
    fixture.snapshot[table] = await tools.sql(`SELECT * FROM ${table}`);
  fixture.clearAccess = async () => {
    for (const table of accessTables) await tools.sql(`DELETE FROM ${table}`);
  };
  fixture.dispose = async () => {
    for (const id of [...fixture.ids, fixture.uploaded].filter(Boolean)) {
      for (const table of [
        'media_versions',
        'media_metadata',
        'album_images',
        'image_tags',
        'media_objects',
        'media_jobs',
      ])
        await tools.sql(`DELETE FROM ${table} WHERE image_id=${quote(id)}`);
      await tools.sql(`DELETE FROM media_images WHERE id=${quote(id)}`);
    }
    await fixture.clearAccess();
    for (const table of accessTables) {
      const rows = fixture.snapshot[table];
      if (rows.length) {
        const columns = Object.keys(rows[0]);
        await tools.sql(
          `INSERT INTO ${table} (${columns.join(',')}) VALUES ${rows.map((row) => `(${columns.map((column) => quote(row[column])).join(',')})`).join(',')}`,
        );
      }
    }
    for (const storage of fixture.storages) {
      await tools.sql(
        `DELETE FROM upload_sessions WHERE storage_id=${quote(storage.id)}`,
      );
      await tools.sql(
        `DELETE FROM upload_submissions WHERE storage_id=${quote(storage.id)}`,
      );
      await tools.sql(
        `DELETE FROM storage_configs WHERE id=${quote(storage.id)}`,
      );
    }
    for (const directory of fixture.storageRoots)
      await rm(directory, { recursive: true, force: true });
  };
  fixture.seed = async () => {
    const bytes = await readFile(
      join(config.projectDirectory, 'tests/fixtures/runtime/images/sample.png'),
    );
    for (const name of ['Issue 179 独立对象存储', 'Issue 179 已停用存储']) {
      const storage = await tools.request('/api/storages', 'POST', {
        type: 'local',
        name,
        localPath: `analytics179-${randomUUID()}`,
      });
      fixture.storages.push(storage);
      const [saved] = await tools.sql(
        `SELECT local_path FROM storage_configs WHERE id=${quote(storage.id)}`,
      );
      fixture.storageRoots.push(
        join(config.dataDirectory, 'storage', saved.local_path),
      );
      const directory = join(
        config.dataDirectory,
        'storage',
        saved.local_path,
        'ariso',
        storage.id,
        'analytics179',
      );
      fixture.directories.push(directory);
      await mkdir(directory, { recursive: true });
    }
    // One asset traverses the real public upload/worker contract. Its temporary
    // once-only key stays in memory and is never included in reports or logs.
    const token = await tools.request('/api/upload-tokens', 'POST', {
      name: 'Issue 179 浏览器上传',
    });
    try {
      const form = new FormData();
      form.append('file', new Blob([bytes]), 'analytics179-upload.png');
      form.append('storageId', fixture.storages[0].id);
      form.append('visibility', 'private');
      const response = await fetch(`${config.origin}/api/upload`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token.key}` },
        body: form,
        signal: AbortSignal.timeout(60_000),
      });
      const result = await response.json();
      fixture.uploaded = result.imageId;
      assert.equal(
        response.status,
        201,
        'Real private upload completes its worker',
      );
      assert.ok(result.imageId);
      assert.equal(result.status, 'ready');
      assert.equal(result.processing.status, 'succeeded');
      assert.ok(result.versions.original.url);
    } finally {
      await tools.request(`/api/upload-tokens/${token.token.id}`, 'DELETE');
    }
    const now = Date.now();
    const images = [],
      objects = [],
      versions = [];
    for (const [index, id] of fixture.ids.entries()) {
      if (index === 2) continue; // Persisted historical ID with no media entity.
      const storageIndex = index === 3 ? 1 : 0;
      const name =
        index === 0
          ? `Issue 179 长名称 ${'摄影素材与公开访问历史'.repeat(12)}.png`
          : `Issue 179 图片 ${index}.png`;
      images.push(
        `(${quote(id)},${quote(fixture.storages[storageIndex].id)},${quote(`${id}.png`)},${quote(name)},'private','png','image/png',640,480,${bytes.length},'static','${index === 10 ? 'failed' : 'ready'}',${index === 1 ? now : 'NULL'},${now + index},${now})`,
      );
      for (const kind of ['original', 'thumbnail']) {
        const object = randomUUID();
        const filename = `${id}-${kind}.png`;
        await writeFile(
          join(fixture.directories[storageIndex], filename),
          bytes,
        );
        objects.push(
          `(${quote(object)},${quote(id)},${quote(fixture.storages[storageIndex].id)},${quote(`analytics179/${filename}`)},'${kind}','stored',${bytes.length},${now},'png','image/png',${now},${now})`,
        );
        versions.push(
          `(${quote(id)},'${kind}',${quote(object)},640,480,${bytes.length},'png','image/png',${now})`,
        );
      }
    }
    await tools.sql(
      `INSERT INTO media_images (id,storage_id,original_name,display_name,visibility,format,mime,width,height,byte_size,classification,processing_status,trashed_at,created_at,updated_at) VALUES ${images.join(',')}`,
    );
    await tools.sql(
      `INSERT INTO media_objects (id,image_id,storage_id,key,purpose,status,byte_size,byte_size_confirmed_at,format,mime,created_at,updated_at) VALUES ${objects.join(',')}`,
    );
    await tools.sql(
      `INSERT INTO media_versions (image_id,kind,object_id,width,height,byte_size,format,mime,created_at) VALUES ${versions.join(',')}`,
    );
    await tools.sql(
      `INSERT INTO media_objects (id,image_id,storage_id,key,purpose,status,byte_size,byte_size_confirmed_at,created_at,updated_at,next_cleanup_at) VALUES (${quote(randomUUID())},${quote(fixture.ids[0])},${quote(fixture.storages[0].id)},'analytics179/pending-known','temporary','cleanup_failed',1536,${now},${now},${now},${now + 3600000}),(${quote(randomUUID())},${quote(fixture.ids[0])},${quote(fixture.storages[0].id)},'analytics179/pending-unknown','temporary','writing',NULL,NULL,${now},${now},NULL)`,
    );
    const [job] = await tools.sql(
      `SELECT snapshot FROM media_jobs WHERE image_id=${quote(fixture.uploaded)} LIMIT 1`,
    );
    assert.ok(job, 'Upload persisted a real processing snapshot');
    await tools.sql(
      `INSERT INTO media_jobs (id,image_id,kind,scope,snapshot,expected_versions,status,error,step,created_at,updated_at,finished_at) VALUES (${quote(randomUUID())},${quote(fixture.ids[9])},'process','thumbnail',${quote(job.snapshot)},'["thumbnail"]','failed','thumbnail: 验证重处理失败','thumbnail',${now},${now},${now})`,
    );
    await tools.sql(
      `UPDATE storage_configs SET enabled=0 WHERE id=${quote(fixture.storages[1].id)}`,
    );
    await fixture.seedAccess();
  };
  fixture.seedAccess = async () => {
    await fixture.clearAccess();
    const overview = await tools.request('/api/analytics/overview?days=7');
    const dates = [0, 14, 59].map((offset) => {
      const value = new Date(`${overview.range.endDate}T00:00:00Z`);
      value.setUTCDate(value.getUTCDate() - offset);
      return value.toISOString().slice(0, 10);
    });
    const values = [];
    for (const [index, id] of fixture.ids.entries())
      for (const [period, date] of dates.entries())
        values.push(
          `(${quote(id)},${quote(date)},${quote(period === 1 ? 'UTC' : overview.timezone)},${(12 - index) * (period + 1)})`,
        );
    await tools.sql(
      `INSERT INTO analytics_image_daily (image_id,date,timezone,count) VALUES ${values.join(',')}`,
    );
    await tools.sql(
      "INSERT INTO analytics_daily (date,timezone,version,count) SELECT date,timezone,'original',sum(count) FROM analytics_image_daily GROUP BY date,timezone",
    );
    await tools.sql(
      'INSERT INTO analytics_image_totals (image_id,original_count) SELECT image_id,sum(count) FROM analytics_image_daily GROUP BY image_id',
    );
  };
  return fixture;
}
