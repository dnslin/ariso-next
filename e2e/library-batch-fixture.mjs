import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const batchImageId = (index) =>
  `issue177-${String(index).padStart(3, '0')}`;
export const batchImageName = (index) => `${batchImageId(index)}.png`;
export const batchAlbumIds = ['issue177-album-a', 'issue177-album-b'];
export const batchTagIds = ['issue177-tag-a', 'issue177-tag-b'];

/** All files and records live only in the runner's disposable production DATA_DIR. */
export async function seedLibraryBatch(config, sql) {
  const [storage] = await sql(
    "SELECT id, local_path FROM storage_configs WHERE enabled = 1 AND type = 'local' LIMIT 1",
  );
  assert.ok(storage, 'The real setup creates its default local storage');
  const directory = join(
    config.dataDirectory,
    'storage',
    storage.local_path,
    'ariso',
    storage.id,
    'issue177-batch',
  );
  await mkdir(directory, { recursive: true });
  const png = await readFile(
    join(config.projectDirectory, 'tests/fixtures/runtime/images/sample.png'),
  );
  const created = 1810000000000;
  const ids = Array.from({ length: 201 }, (_, index) => batchImageId(index));
  await sql(
    `INSERT INTO media_images (id,storage_id,original_name,display_name,visibility,format,mime,width,height,byte_size,classification,processing_status,created_at,updated_at) VALUES ${ids.map((id, index) => `('${id}','${storage.id}','${id}.png','${id}.png','${index === 0 ? 'public' : 'private'}','png','image/png',640,480,${png.length},'static','ready',${created - index * 1000},${created})`).join(',')}`,
  );
  const objects = [];
  const versions = [];
  for (const id of ids) {
    for (const kind of ['original', 'thumbnail']) {
      const objectId = `${id}-${kind}`;
      const filename = `${objectId}.png`;
      await writeFile(join(directory, filename), png);
      objects.push(
        `('${objectId}','${id}','${storage.id}','issue177-batch/${filename}','${kind}','stored',${png.length},'png','image/png',${created},${created})`,
      );
      versions.push(
        `('${id}','${kind}','${objectId}',640,480,${png.length},'png','image/png',${created})`,
      );
    }
  }
  await sql(
    `INSERT INTO media_objects (id,image_id,storage_id,key,purpose,status,byte_size,format,mime,created_at,updated_at) VALUES ${objects.join(',')}`,
  );
  await sql(
    `INSERT INTO media_versions (image_id,kind,object_id,width,height,byte_size,format,mime,created_at) VALUES ${versions.join(',')}`,
  );
  await sql(
    `INSERT INTO albums (id,name,description,created_at,updated_at) VALUES ${['a', 'b', 'c'].map((suffix) => `('issue177-album-${suffix}','${suffix === 'c' ? 'Issue 177 并发删除相册' : `Issue 177 相册 ${suffix.toUpperCase()}`}','批量真实验证',${created},${created})`).join(',')}`,
  );
  await sql(
    `INSERT INTO tags (id,display_name,normalized_key,created_at,updated_at) VALUES ${['a', 'b', 'c'].map((suffix) => `('issue177-tag-${suffix}','Issue 177 标签 ${suffix.toUpperCase()}','issue177-tag-${suffix}',${created},${created})`).join(',')}`,
  );
  await sql(
    `INSERT INTO albums (id,name,description,created_at,updated_at) VALUES ${Array.from({ length: 21 }, (_, index) => `('issue177-page-album-${index}','Issue 177 分页相册 ${String(index).padStart(2, '0')}','目标分页验证',${created - 1},${created - 1})`).join(',')}`,
  );
  await sql(
    `INSERT INTO tags (id,display_name,normalized_key,created_at,updated_at) VALUES ${Array.from({ length: 21 }, (_, index) => `('issue177-page-tag-${index}','Issue 177 分页标签 ${String(index).padStart(2, '0')}','issue177-page-tag-${index}',${created - 1},${created - 1})`).join(',')}`,
  );
  const originalJoinedAt = created - 86400000;
  await sql(
    `INSERT INTO album_images (album_id,image_id,joined_at) VALUES ${batchAlbumIds.map((albumId) => `('${albumId}','${batchImageId(0)}',${originalJoinedAt})`).join(',')}`,
  );
  return { ids, directory, originalJoinedAt, bytes: png.length };
}

export async function readLibraryBatchSnapshot(sql, directory) {
  return {
    images: await sql(
      "SELECT id, storage_id, visibility, processing_status, trashed_at FROM media_images WHERE id LIKE 'issue177-%' ORDER BY id",
    ),
    objects: await sql(
      "SELECT id, image_id, key, purpose, status, byte_size FROM media_objects WHERE image_id LIKE 'issue177-%' ORDER BY id",
    ),
    albums: await sql(
      "SELECT album_id,image_id,joined_at FROM album_images WHERE image_id LIKE 'issue177-%' ORDER BY image_id,album_id",
    ),
    tags: await sql(
      "SELECT image_id,tag_id FROM image_tags WHERE image_id LIKE 'issue177-%' ORDER BY image_id,tag_id",
    ),
    files: (await readdir(directory)).sort(),
  };
}

export async function cleanLibraryBatch(sql, fixture) {
  await sql('DROP TRIGGER IF EXISTS issue177_batch_failure');
  await sql('DROP TRIGGER IF EXISTS issue177_restore_failure');
  await sql('DROP TRIGGER IF EXISTS issue177_visibility_failure');
  for (const table of [
    'media_versions',
    'media_objects',
    'image_tags',
    'album_images',
  ])
    await sql(`DELETE FROM ${table} WHERE image_id LIKE 'issue177-%'`);
  await sql("DELETE FROM media_images WHERE id LIKE 'issue177-%'");
  await sql(
    "DELETE FROM tags WHERE id LIKE 'issue177-%' OR display_name = 'Issue 177 快建标签'",
  );
  await sql("DELETE FROM albums WHERE id LIKE 'issue177-%'");
  if (fixture) await rm(fixture.directory, { recursive: true, force: true });
}
