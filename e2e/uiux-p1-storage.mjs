import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { identitySql } from './identity-session.mjs';
import { resizeViewport } from './browser-geometry.mjs';

/** Persisted local objects and deferred jobs exercise real reference queries. */
export async function runUiuxP1Storage(page, config) {
  const sql = (statement) => identitySql(config, statement);
  const created = Date.now();
  const storage = await page.evaluate(async (name) => {
    const response = await fetch('/api/storages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'local', name, localPath: name }),
    });
    if (!response.ok) throw new Error(`Storage fixture: ${response.status}`);
    return response.json();
  }, `p1-reference-${randomUUID()}`);
  const records = [
    { id: randomUUID(), name: '林间光影.png', status: 'ready', trashed: false },
    {
      id: randomUUID(),
      name: '山间晨雾.png',
      status: 'processing',
      trashed: false,
    },
    { id: randomUUID(), name: '海岸日落.png', status: 'ready', trashed: true },
  ];
  const directory = join(
    config.dataDirectory,
    'storage',
    storage.localPath,
    'ariso',
    storage.id,
    'p1-references',
  );
  await mkdir(directory, { recursive: true });
  const bytes = await readFile(
    join(config.projectDirectory, 'tests/fixtures/runtime/images/sample.png'),
  );
  const report = { checks: [], storageId: storage.id };
  try {
    for (const record of records) {
      await sql(
        `INSERT INTO media_images (id,storage_id,original_name,display_name,visibility,format,mime,width,height,byte_size,classification,processing_status,trashed_at,deletion_status,created_at,updated_at) VALUES ('${record.id}','${storage.id}','${record.name}','${record.name}','private','png','image/png',640,480,${bytes.length},'static','${record.status}',${record.trashed ? created : 'NULL'},${record.trashed ? "'cleanup_failed'" : 'NULL'},${created},${created})`,
      );
      for (const kind of ['original', 'thumbnail']) {
        const object = randomUUID();
        const filename = `${record.id}-${kind}.png`;
        await writeFile(join(directory, filename), bytes);
        await sql(
          `INSERT INTO media_objects (id,image_id,storage_id,key,purpose,status,byte_size,format,mime,created_at,updated_at) VALUES ('${object}','${record.id}','${storage.id}','p1-references/${filename}','${kind}','stored',${bytes.length},'png','image/png',${created},${created})`,
        );
        await sql(
          `INSERT INTO media_versions (image_id,kind,object_id,width,height,byte_size,format,mime,created_at) VALUES ('${record.id}','${kind}','${object}',640,480,${bytes.length},'png','image/png',${created})`,
        );
      }
      if (record.trashed)
        await sql(
          `INSERT INTO media_cleanup_jobs (id,image_id,status,error,created_at,updated_at) VALUES ('${randomUUID()}','${record.id}','failed','验证清理失败','${created}','${created}')`,
        );
      else
        await sql(
          `INSERT INTO media_jobs (id,image_id,kind,scope,snapshot,expected_versions,status,next_attempt_at,created_at,updated_at) VALUES ('${randomUUID()}','${record.id}','process','all','{}','["thumbnail"]','queued',${created + 86400000},${created},${created})`,
        );
    }
    const source = `/settings/storage/${storage.id}?view=references`;
    for (const width of [1440, 390]) {
      await resizeViewport(page, width);
      await page.goto(`${config.origin}${source}`);
      await page.waitForSelector('[data-testid="storage-reference-view"]');
      await page.click('loc=role:link[name="查看图库"]');
      await page.waitForSelector('[data-testid="library-list"]');
      assert.equal(
        await page.evaluate(() =>
          new URLSearchParams(location.search).get('storageId'),
        ),
        storage.id,
      );
      const listed = await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            '[data-testid="library-list"] [data-image-id]',
          ),
        ].map((e) => e.dataset.imageId),
      );
      assert.ok(
        listed.length > 0 &&
          listed.every((id) => records.some((r) => r.id === id)),
        'Storage destination contains only this storage images',
      );
      await page.click(`a[href="${source}"]`);
      await page.waitForSelector('[data-testid="storage-reference-view"]');
      await page.click('button:text-is("查看处理任务（2）")');
      await page.waitForSelector('a[aria-label="查看任务图片：林间光影.png"]');
      assert.ok(
        await page.evaluate(() =>
          document
            .querySelector('[data-testid="storage-reference-view"]')
            .textContent.includes('重处理 · 等待处理 · 图片：已就绪'),
        ),
      );
      await page.screenshot({
        path: join(config.output, `uiux-p1-storage-${width}.png`),
      });
      await page.click('a[aria-label="查看任务图片：林间光影.png"]');
      await page.waitForSelector('[data-testid="detail-body"]');
      assert.equal(
        await page.evaluate(() =>
          new URLSearchParams(location.search).get('image'),
        ),
        records[0].id,
      );
      await page.click('button[aria-label="关闭图片详情"]');
      await page.waitForFunction(
        () => !new URLSearchParams(location.search).has('image'),
      );
      await page.click(`a[href="${source}"]`);
      await page.waitForSelector('[data-testid="storage-reference-view"]');
      await page.click('loc=role:link[name="查看删除清理"]');
      await page.waitForSelector('[data-testid="trash-detail"]');
      assert.equal(await page.evaluate(() => location.pathname), '/trash');
      assert.equal(
        await page.evaluate(() =>
          new URLSearchParams(location.search).get('image'),
        ),
        records[2].id,
      );
      report.checks.push(`storage-object-and-task-navigation-${width}`);
    }
    return report;
  } finally {
    const ids = records.map((r) => `'${r.id}'`).join(',');
    for (const table of [
      'media_versions',
      'media_objects',
      'media_jobs',
      'media_cleanup_jobs',
      'media_images',
    ])
      await sql(
        `DELETE FROM ${table} WHERE ${table === 'media_images' ? 'id' : 'image_id'} IN (${ids})`,
      );
    await rm(directory, { recursive: true });
    await page.evaluate(async (id) => {
      await fetch(`/api/storages/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      });
      const response = await fetch(`/api/storages/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(`Storage cleanup: ${response.status}`);
    }, storage.id);
  }
}
