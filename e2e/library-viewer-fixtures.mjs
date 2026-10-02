import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { quote } from './library-detail-171-helpers.mjs';

export const viewerStorage = 'issue185-storage';
export const viewerId = (index) => `issue185-${String(index).padStart(3, '0')}`;
export const viewerName = (index) => `issue185-query-${index}.png`;
export const viewerQuery =
  'q=issue185-query-&visibility=private&sort=uploaded_asc&pageSize=20&page=1';

// All records and bytes belong to verify-browser's disposable DATA_DIR. The
// same ImageMagick runtime used by media produces real PNG/WebP versions; no
// business response is substituted and no worker completion is fabricated.
export async function seedViewerFixtures(config, sql) {
  const directory = join(
    config.dataDirectory,
    'storage/default/ariso',
    viewerStorage,
    'viewer-fixtures',
  );
  await mkdir(directory, { recursive: true });
  const run = promisify(execFile);
  await run('magick', [
    join(config.projectDirectory, 'tests/fixtures/runtime/images/sample.png'),
    '-resize',
    '1200x900!',
    join(directory, 'original.png'),
  ]);
  await run('magick', [
    join(directory, 'original.png'),
    '-quality',
    '85',
    join(directory, 'compressed.webp'),
  ]);
  await run('magick', [
    join(directory, 'original.png'),
    '-resize',
    '400x300',
    '-quality',
    '85',
    join(directory, 'thumbnail.webp'),
  ]);
  await run('magick', [
    join(directory, 'original.png'),
    '-fill',
    '#ffffff80',
    '-draw',
    'rectangle 940,800 1160,860',
    join(directory, 'watermark.png'),
  ]);
  const assets = {};
  for (const [kind, format, width, height] of [
    ['original', 'png', 1200, 900],
    ['compressed', 'webp', 1200, 900],
    ['thumbnail', 'webp', 400, 300],
    ['watermark', 'png', 1200, 900],
  ]) {
    const bytes = await readFile(join(directory, `${kind}.${format}`));
    assets[kind] = { bytes, format, mime: `image/${format}`, width, height };
  }
  const created = 1700000000000;
  await sql(
    `INSERT INTO storage_configs (id,name,type,enabled,local_path,created_at,updated_at) VALUES ('${viewerStorage}','Issue 185 独立测试存储','local',1,'default',${created},${created})`,
  );
  async function image(id, name, asset, options = {}) {
    await sql(
      `INSERT INTO media_images (id,storage_id,original_name,display_name,visibility,format,mime,width,height,byte_size,animated,classification,processing_status,created_at,updated_at) VALUES (${quote(id)},'${viewerStorage}',${quote(name)},${quote(name)},'private',${quote(asset.format)},${quote(asset.mime)},${asset.width},${asset.height},${asset.bytes.length},${options.animated ? 1 : 0},${quote(options.classification ?? 'static')},${quote(options.status ?? 'ready')},${created + (options.index ?? 100) * 1000},${created})`,
    );
  }
  async function version(id, kind, asset, { missing = false } = {}) {
    const filename = `${id}-${kind}.${asset.format}`;
    if (!missing) await writeFile(join(directory, filename), asset.bytes);
    const object = `${id}-${kind}`;
    await sql(
      `INSERT INTO media_objects (id,image_id,storage_id,key,purpose,status,byte_size,width,height,format,mime,created_at,updated_at) VALUES (${quote(object)},${quote(id)},'${viewerStorage}',${quote(`viewer-fixtures/${filename}`)},${quote(kind)},'stored',${asset.bytes.length},${asset.width},${asset.height},${quote(asset.format)},${quote(asset.mime)},${created},${created})`,
    );
    await sql(
      `INSERT INTO media_versions (image_id,kind,object_id,width,height,byte_size,format,mime,created_at) VALUES (${quote(id)},${quote(kind)},${quote(object)},${asset.width},${asset.height},${asset.bytes.length},${quote(asset.format)},${quote(asset.mime)},${created})`,
    );
  }
  for (let index = 0; index < 25; index++) {
    const id = viewerId(index);
    await image(id, viewerName(index), assets.original, { index });
    for (const kind of Object.keys(assets))
      await version(id, kind, assets[kind]);
  }
  // This delivery URL is reserved for the loading scenario so no earlier
  // detail, version or neighbor check can populate Chromium's decoded cache.
  await image('issue185-loading', 'issue185-loading.png', assets.original);
  for (const kind of ['original', 'compressed'])
    await version('issue185-loading', kind, assets[kind]);
  // Legacy/imported records can lack dimensions while their real bytes remain
  // valid. Both image and object/version metadata intentionally stay NULL.
  const noDimensions = (asset) => ({ ...asset, width: null, height: null });
  await image(
    'issue185-no-dimensions',
    'issue185-no-dimensions.png',
    noDimensions(assets.original),
  );
  for (const kind of ['original', 'compressed'])
    await version('issue185-no-dimensions', kind, noDimensions(assets[kind]));
  await run('magick', [
    join(directory, 'original.png'),
    '-resize',
    '320x240!',
    join(directory, 'partial-thumbnail.webp'),
  ]);
  const partialThumbnail = {
    bytes: await readFile(join(directory, 'partial-thumbnail.webp')),
    format: 'webp',
    mime: 'image/webp',
    width: null,
    height: 240,
  };
  await image(
    'issue185-partial-dimensions',
    'issue185-partial-dimensions.png',
    assets.original,
  );
  await version('issue185-partial-dimensions', 'original', assets.original);
  await version('issue185-partial-dimensions', 'thumbnail', partialThumbnail);
  const formatDirectory = join(
    config.projectDirectory,
    'tests/fixtures/media-formats',
  );
  for (const [id, file, format, mime, classification] of [
    ['issue185-animation', 'animated.gif', 'gif', 'image/gif', 'animated'],
    ['issue185-apng', 'animated.png', 'apng', 'image/apng', 'animated'],
    ['issue185-svg', 'static.svg', 'svg', 'image/svg+xml', 'preview_only'],
    ['issue185-heic', 'alpha.heic', 'heic', 'image/heic', 'preview_only'],
  ]) {
    const original = {
      bytes: await readFile(join(formatDirectory, file)),
      format,
      mime,
      width: 64,
      height: 48,
    };
    await image(id, file, original, {
      classification,
      animated: classification === 'animated',
    });
    await version(id, 'original', original);
    const preview = {
      bytes: await readFile(join(formatDirectory, 'static.webp')),
      format: 'webp',
      mime: 'image/webp',
      width: 64,
      height: 48,
    };
    await version(id, 'thumbnail', preview);
  }
  for (const [id, options, kinds] of [
    ['issue185-failed', { status: 'failed' }, ['original', 'thumbnail']],
    ['issue185-missing', {}, ['original', 'thumbnail']],
    ['issue185-empty', { status: 'failed' }, []],
    ['issue185-unreadable', {}, ['original', 'compressed', 'thumbnail']],
  ]) {
    await image(id, `${id}.png`, assets.original, options);
    for (const kind of kinds)
      await version(id, kind, assets[kind], {
        missing: id === 'issue185-unreadable' && kind === 'compressed',
      });
  }
  // A stored-but-unpublished candidate has real bytes and no media_versions
  // pointer. It must not become a saved version through a viewer fallback.
  await writeFile(join(directory, 'candidate.webp'), assets.compressed.bytes);
  await sql(
    `INSERT INTO media_objects (id,image_id,storage_id,key,purpose,status,byte_size,width,height,format,mime,created_at,updated_at) VALUES ('issue185-candidate','issue185-empty','${viewerStorage}','viewer-fixtures/candidate.webp','compressed','stored',${assets.compressed.bytes.length},1200,900,'webp','image/webp',${created},${created})`,
  );
  const result = await sql(
    `SELECT count(*) AS count FROM media_images WHERE storage_id='${viewerStorage}'`,
  );
  assert.equal(result[0].count, 36);
  return {
    directory,
    async cleanup() {
      await sql(`DELETE FROM media_versions WHERE image_id LIKE 'issue185-%'`);
      await sql(
        `DELETE FROM media_objects WHERE storage_id='${viewerStorage}'`,
      );
      await sql(`DELETE FROM media_images WHERE storage_id='${viewerStorage}'`);
      await sql(`DELETE FROM storage_configs WHERE id='${viewerStorage}'`);
      await rm(directory, { recursive: true, force: true });
    },
  };
}
