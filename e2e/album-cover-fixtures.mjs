import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function createAlbumCoverFixtures(
  config,
  sql,
  albumId,
  directory,
) {
  const png = await readFile(
    join(config.projectDirectory, 'tests/fixtures/runtime/images/sample.png'),
  );
  const created = 1800000000000;
  await sql(
    `INSERT INTO storage_configs (id,name,type,enabled,local_path,created_at,updated_at) VALUES ('issue180-storage','封面验证存储','local',1,'issue180',${created},${created})`,
  );
  await mkdir(directory, { recursive: true });
  const ids = [
    albumId,
    'issue180-empty',
    'issue180-private',
    ...['pending', 'processing', 'failed', 'disabled', 'missing'].map(
      (status) => `issue180-${status}`,
    ),
  ];
  await sql(
    `INSERT INTO albums (id,name,description,created_at,updated_at) VALUES ${ids.map((id) => `('${id}','${id === albumId ? '封面验证旅行' : id}','独立浏览器验证数据',${created},${created})`).join(',')}`,
  );
  for (let index = 0; index < 45; index++) {
    const id = `issue180-${String(index).padStart(3, '0')}`;
    await sql(
      `INSERT INTO media_images (id,storage_id,original_name,display_name,visibility,format,mime,width,height,byte_size,classification,processing_status,created_at,updated_at) VALUES ('${id}','issue180-storage','${id}.png','${id}.png','${index < 40 ? 'private' : 'public'}','png','image/png',640,480,${png.length},'static','ready',${created - index},${created})`,
    );
    await sql(
      `INSERT INTO media_objects (id,image_id,storage_id,key,purpose,status,byte_size,format,mime,created_at,updated_at) VALUES ('object-${id}','${id}','issue180-storage','cover/${id}.png','thumbnail','stored',${png.length},'png','image/png',${created},${created})`,
    );
    await sql(
      `INSERT INTO media_versions (image_id,kind,object_id,width,height,byte_size,format,mime,created_at) VALUES ('${id}','thumbnail','object-${id}',64,48,${png.length},'png','image/png',${created})`,
    );
    await writeFile(join(directory, `${id}.png`), png);
    // Public 040 and 041 share the same join time and must break ties by ID.
    const joined = index < 40 ? created + 1000 - index : created;
    await sql(
      `INSERT INTO album_images (album_id,image_id,joined_at) VALUES ('${albumId}','${id}',${joined})`,
    );
  }
  await sql(
    `INSERT INTO album_images (album_id,image_id,joined_at) VALUES ('issue180-private','issue180-000',${created})`,
  );
  for (const status of [
    'pending',
    'processing',
    'failed',
    'disabled',
    'missing',
  ]) {
    const id = `issue180-status-${status}`;
    await sql(
      `INSERT INTO media_images (id,storage_id,original_name,display_name,visibility,format,mime,width,height,byte_size,classification,processing_status,created_at,updated_at) VALUES ('${id}','issue180-storage','${id}.png','${id}.png','public','png','image/png',640,480,${png.length},'static','${['pending', 'processing', 'failed'].includes(status) ? status : 'ready'}',${created},${created})`,
    );
    await sql(
      `INSERT INTO album_images (album_id,image_id,joined_at) VALUES ('issue180-${status}','${id}',${created + 1}),('issue180-${status}','issue180-042',${created})`,
    );
    if (status === 'missing') {
      await sql(
        `INSERT INTO media_objects (id,image_id,storage_id,key,purpose,status,byte_size,format,mime,created_at,updated_at) VALUES ('object-${id}','${id}','issue180-storage','cover/missing.png','thumbnail','stored',${png.length},'png','image/png',${created},${created})`,
      );
      await sql(
        `INSERT INTO media_versions (image_id,kind,object_id,width,height,byte_size,format,mime,created_at) VALUES ('${id}','thumbnail','object-${id}',64,48,${png.length},'png','image/png',${created})`,
      );
    }
  }
}
