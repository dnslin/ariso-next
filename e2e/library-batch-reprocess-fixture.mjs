import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const reprocessIds = ['issue186-0', 'issue186-1', 'issue186-2'];
export const quote = (value) =>
  value === null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;

/** This fixture belongs exclusively to verify-browser's disposable DATA_DIR. */
export async function seedReprocess(config, sql) {
  const [storage] = await sql(
    "SELECT id,local_path FROM storage_configs WHERE enabled=1 AND type='local' LIMIT 1",
  );
  assert.ok(storage, 'Setup creates real local storage');
  const root = join(
    config.dataDirectory,
    'storage',
    storage.local_path,
    'ariso',
    storage.id,
  );
  const directory = join(root, 'issue186-batch');
  await mkdir(directory, { recursive: true });
  const png = await readFile(
    join(config.projectDirectory, 'tests/fixtures/runtime/images/sample.png'),
  );
  const now = Date.now();
  for (const [index, id] of reprocessIds.entries()) {
    await sql(
      `INSERT INTO media_images (id,storage_id,original_name,display_name,visibility,format,mime,width,height,byte_size,classification,processing_status,created_at,updated_at) VALUES (${quote(id)},${quote(storage.id)},${quote(`${id}.png`)},${quote(`${id}.png`)},'private','png','image/png',640,480,${png.length},'static','ready',${now - index},${now})`,
    );
    for (const kind of ['original', 'thumbnail']) {
      const objectId = `${id}-${kind}`;
      const key = `issue186-batch/${objectId}.png`;
      await writeFile(join(root, key), png);
      await sql(
        `INSERT INTO media_objects (id,image_id,storage_id,key,purpose,status,byte_size,format,mime,created_at,updated_at) VALUES (${quote(objectId)},${quote(id)},${quote(storage.id)},${quote(key)},${quote(kind)},'stored',${png.length},'png','image/png',${now},${now})`,
      );
      await sql(
        `INSERT INTO media_versions (image_id,kind,object_id,width,height,byte_size,format,mime,created_at) VALUES (${quote(id)},${quote(kind)},${quote(objectId)},640,480,${png.length},'png','image/png',${now})`,
      );
    }
  }
  return { root, directory };
}

export const readVersions = (sql, id) =>
  sql(
    `SELECT kind,object_id FROM media_versions WHERE image_id=${quote(id)} ORDER BY kind`,
  );
export const readJobs = (sql) =>
  sql(
    "SELECT id,image_id,scope,status,snapshot,error FROM media_jobs WHERE image_id LIKE 'issue186-%' ORDER BY created_at,id",
  );

export async function cleanReprocess(sql, fixture) {
  await sql('DROP TRIGGER IF EXISTS issue186_hold');
  const objects = await sql(
    "SELECT key FROM media_objects WHERE image_id LIKE 'issue186-%'",
  );
  for (const table of [
    'media_versions',
    'media_metadata',
    'media_objects',
    'media_jobs',
    'media_cleanup_jobs',
  ])
    await sql(`DELETE FROM ${table} WHERE image_id LIKE 'issue186-%'`);
  await sql("DELETE FROM media_images WHERE id LIKE 'issue186-%'");
  for (const object of objects)
    await rm(join(fixture.root, object.key), { force: true });
  await rm(fixture.directory, { recursive: true, force: true });
}
