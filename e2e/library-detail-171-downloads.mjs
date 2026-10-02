import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  image,
  endpoint,
  button,
  openDetail171,
  prepareDetail171Versions,
} from './library-detail-171-helpers.mjs';

export async function verifyDetail171Downloads({ page, config, sql, report }) {
  await prepareDetail171Versions({ page, sql });
  await openDetail171(page, config, image, '');
  const labels = {
    original: '原图',
    compressed: '压缩图',
    thumbnail: '缩略图',
    watermark: '水印图',
  };
  for (const kind of Object.keys(labels)) {
    await page.click(`loc=role:tab[name="${labels[kind]}"]`);
    const detail = JSON.parse((await page.fetch(endpoint)).body);
    const version = detail.versions.find((version) => version.kind === kind);
    assert.equal(version.saved, true);
    const head = await page.fetch(version.downloadPath, { method: 'HEAD' });
    assert.equal(head.status, 200);
    const filename = decodeURIComponent(
      head.headers['content-disposition'].match(
        /filename\*=UTF-8''([^;]+)/i,
      )[1],
    );
    const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
    await page.click(button(`下载${labels[kind]}`));
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), filename);
    const path = join(config.output, `detail-171-download-${kind}-${filename}`);
    await download.saveAs(path);
    const [object] = await sql(
      `SELECT o.key,s.id AS storage_id,s.local_path FROM media_versions v JOIN media_objects o ON o.id=v.object_id JOIN storage_configs s ON s.id=o.storage_id WHERE v.image_id='${image}' AND v.kind='${kind}'`,
    );
    assert.deepEqual(
      await readFile(path),
      await readFile(
        join(
          config.dataDirectory,
          'storage',
          object.local_path,
          'ariso',
          object.storage_id,
          object.key,
        ),
      ),
    );
    await page.waitForSelector('loc=role:alertdialog[name="已发起下载"]');
    if (kind === 'original')
      assert.ok(
        await page.evaluate(() =>
          document
            .querySelector('[role="alertdialog"]')
            .textContent.includes('公开原图可能包含 GPS 和拍摄信息'),
        ),
      );
    await page.hover('loc=role:alertdialog[name="已发起下载"]');
    await page.click(button('关闭通知'));
    await page.waitForSelector('loc=role:alertdialog[name="已发起下载"]', {
      state: 'hidden',
    });
  }
  report.checks.push(
    'All four version tabs download actual stored bytes and production Content-Disposition filenames; public original download toast explicitly discloses GPS/photography risk.',
  );
}
