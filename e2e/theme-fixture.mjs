import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { identitySql } from './identity-session.mjs';
import { quote } from './analytics-fixture.mjs';

/** Two real fixture photos, a public album and non-zero chart data. */
export async function createThemeFixture(page, config) {
  const sql = (statement) => identitySql(config, statement);
  const suffix = randomUUID();
  const storageId = `theme-${suffix}`;
  const albumId = `theme-album-${suffix}`;
  const token = `theme${suffix.replaceAll('-', '')}`;
  const localPath = `theme197-${suffix}`;
  const ids = [randomUUID(), randomUUID()];
  const root = join(config.dataDirectory, 'storage', localPath);
  const directory = join(root, 'ariso', storageId, 'theme197');
  const now = Date.now();
  // The runner owns this isolated database. Ownership records precede bytes.
  await sql(
    `INSERT INTO storage_configs(id,name,type,enabled,local_path,created_at,updated_at) VALUES(${quote(storageId)},'Issue 197 主题照片','local',1,${quote(localPath)},${now},${now})`,
  );
  await sql(
    `INSERT INTO albums(id,name,description,created_at,updated_at) VALUES(${quote(albumId)},'Issue 197 明暗照片','主题验证独立素材',${now},${now})`,
  );
  await sql(
    `INSERT INTO album_shares(id,album_id,token,enabled,layout,show_name,auth_revision,created_at,updated_at) VALUES(${quote(randomUUID())},${quote(albumId)},${quote(token)},1,'grid',1,1,${now},${now})`,
  );
  await mkdir(directory, { recursive: true });
  for (const [index, id] of ids.entries()) {
    const format = index ? 'jpg' : 'png';
    const mime = index ? 'image/jpeg' : 'image/png';
    const bytes = await readFile(
      join(
        config.projectDirectory,
        `tests/fixtures/runtime/images/sample.${format}`,
      ),
    );
    const name = `Issue 197 ${index ? 'JPEG' : 'PNG'} 原色照片.${format}`;
    await sql(
      `INSERT INTO media_images(id,storage_id,original_name,display_name,visibility,format,mime,width,height,byte_size,classification,processing_status,created_at,updated_at) VALUES(${quote(id)},${quote(storageId)},${quote(name)},${quote(name)},'public',${quote(format)},${quote(mime)},640,480,${bytes.length},'static','ready',${now + index},${now})`,
    );
    for (const kind of ['original', 'thumbnail']) {
      const objectId = randomUUID();
      const filename = `${id}-${kind}.${format}`;
      await sql(
        `INSERT INTO media_objects(id,image_id,storage_id,key,purpose,status,byte_size,byte_size_confirmed_at,format,mime,created_at,updated_at) VALUES(${quote(objectId)},${quote(id)},${quote(storageId)},${quote(`theme197/${filename}`)},${quote(kind)},'stored',${bytes.length},${now},${quote(format)},${quote(mime)},${now},${now})`,
      );
      await sql(
        `INSERT INTO media_versions(image_id,kind,object_id,width,height,byte_size,format,mime,created_at) VALUES(${quote(id)},${quote(kind)},${quote(objectId)},640,480,${bytes.length},${quote(format)},${quote(mime)},${now})`,
      );
      await writeFile(join(directory, filename), bytes);
    }
    await sql(
      `INSERT INTO album_images(album_id,image_id,joined_at) VALUES(${quote(albumId)},${quote(id)},${now + index})`,
    );
  }
  const response = await page.fetch('/api/analytics/overview?days=7');
  const overview = JSON.parse(response.body);
  const date = overview.range.endDate;
  const timezone = overview.timezone;
  const dailyWhere = `date=${quote(date)} AND timezone=${quote(timezone)} AND version='original'`;
  const [originalDaily] = await sql(
    `SELECT count FROM analytics_daily WHERE ${dailyWhere}`,
  );
  for (const [index, id] of ids.entries()) {
    const count = (index + 1) * 7;
    await sql(
      `INSERT INTO analytics_image_daily(image_id,date,timezone,count) VALUES(${quote(id)},${quote(date)},${quote(timezone)},${count})`,
    );
    await sql(
      `INSERT INTO analytics_image_totals(image_id,original_count,compressed_count,watermark_count) VALUES(${quote(id)},${count},0,0)`,
    );
  }
  await sql(
    `INSERT INTO analytics_daily(date,timezone,version,count) VALUES(${quote(date)},${quote(timezone)},'original',21) ON CONFLICT(date,timezone,version) DO UPDATE SET count=count+21`,
  );
  return {
    ids,
    albumId,
    storageId,
    token,
    async dispose() {
      await sql(`DELETE FROM album_shares WHERE album_id=${quote(albumId)}`);
      await sql(`DELETE FROM album_images WHERE album_id=${quote(albumId)}`);
      await sql(`DELETE FROM albums WHERE id=${quote(albumId)}`);
      for (const id of ids) {
        await sql(`DELETE FROM media_versions WHERE image_id=${quote(id)}`);
        await sql(`DELETE FROM media_objects WHERE image_id=${quote(id)}`);
        await sql(`DELETE FROM media_images WHERE id=${quote(id)}`);
      }
      for (const id of ids) {
        await sql(
          `DELETE FROM analytics_image_daily WHERE image_id=${quote(id)}`,
        );
        await sql(
          `DELETE FROM analytics_image_totals WHERE image_id=${quote(id)}`,
        );
      }
      if (originalDaily)
        await sql(
          `UPDATE analytics_daily SET count=${originalDaily.count} WHERE ${dailyWhere}`,
        );
      else await sql(`DELETE FROM analytics_daily WHERE ${dailyWhere}`);
      await sql(`DELETE FROM storage_configs WHERE id=${quote(storageId)}`);
      await rm(root, { recursive: true, force: true });
    },
  };
}
