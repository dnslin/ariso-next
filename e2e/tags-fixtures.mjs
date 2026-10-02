import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// All rows and files belong to verify-browser's disposable data directory.
export async function createTagFixtures(config, sql) {
  await sql('DELETE FROM image_tags');
  await sql('DELETE FROM tags');
  const names = [
    'Go',
    '旅行',
    '生活',
    '灵感',
    '作品',
    '建筑',
    '自然',
    '植物',
    '人物',
  ];
  const counts = [0, 3, 172, 94, 48, 37, 63, 22, 18];
  const created = Date.parse('2026-09-18T00:00:00+08:00');
  const directory = join(
    config.dataDirectory,
    'storage',
    'issue176',
    'ariso',
    'issue176-storage',
    'tags',
  );
  await mkdir(directory, { recursive: true });
  const png = await readFile(
    join(config.projectDirectory, 'tests/fixtures/runtime/images/sample.png'),
  );
  await sql(
    `INSERT INTO storage_configs (id,name,type,enabled,local_path,created_at,updated_at) VALUES ('issue176-storage','标签验证存储','local',1,'issue176',${created},${created})`,
  );
  await sql(
    `INSERT INTO media_images (id,storage_id,original_name,display_name,visibility,format,mime,width,height,byte_size,classification,processing_status,created_at,updated_at) VALUES ${Array.from({ length: 173 }, (_, index) => `('issue176-image-${index}','issue176-storage','标签图片${index}.png','标签图片${index}.png','private','png','image/png',640,480,${png.length},'static','ready',${created - index},${created})`).join(',')}`,
  );
  await sql(
    `UPDATE media_images SET trashed_at=${created} WHERE id='issue176-image-172'`,
  );
  for (let index = 0; index < 3; index++) {
    const id = `issue176-image-${index}`;
    await writeFile(join(directory, `${id}.png`), png);
    await sql(
      `INSERT INTO media_objects (id,image_id,storage_id,key,purpose,status,byte_size,format,mime,created_at,updated_at) VALUES ('object-${id}','${id}','issue176-storage','tags/${id}.png','thumbnail','stored',${png.length},'png','image/png',${created},${created})`,
    );
    await sql(
      `INSERT INTO media_versions (image_id,kind,object_id,width,height,byte_size,format,mime,created_at) VALUES ('${id}','thumbnail','object-${id}',64,48,${png.length},'png','image/png',${created})`,
    );
  }
  await sql(
    `INSERT INTO tags (id,display_name,normalized_key,created_at,updated_at) VALUES ${names.map((name, index) => `('issue176-tag-${index}','${name}','${name === 'Go' ? 'go' : name}',${created - index * 86400000},${created - index * 86400000})`).join(',')}`,
  );
  for (let index = 1; index < names.length; index++)
    await sql(
      `INSERT INTO image_tags (image_id,tag_id) VALUES ${Array.from({ length: counts[index] }, (_, image) => `('issue176-image-${image}','issue176-tag-${index}')`).join(',')}`,
    );
  await sql(
    "INSERT INTO image_tags (image_id,tag_id) VALUES ('issue176-image-172','issue176-tag-0'),('issue176-image-172','issue176-tag-1')",
  );
  return { names, counts, directory };
}
