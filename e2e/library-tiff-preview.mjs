import assert from 'node:assert/strict';
import { stat, truncate } from 'node:fs/promises';
import { join } from 'node:path';
import {
  setDetail171Theme,
  setDetail171Viewport,
} from './library-detail-171-helpers.mjs';
import {
  closeViewer,
  entry,
  viewerState,
  viewerShot,
} from './library-viewer-helpers.mjs';

const imageId = 'issue185-tiff';
const previewPath = `/api/images/${imageId}/preview`;
const limit = 50 * 1024 * 1024;

export async function verifyTiffPreview({
  page,
  config,
  sql,
  fixtures,
  report,
}) {
  for (const theme of ['light', 'dark']) {
    await setDetail171Theme(page, theme);
    for (const width of [360, 390, 430, 768, 1440]) {
      report.stage = `tiff-original:${theme}:${width}`;
      await setDetail171Viewport(page, width);
      await page.goto(`${config.origin}/library?image=${imageId}`);
      await page.waitForFunction(() => {
        const img = document.querySelector('[data-testid="detail-preview"]');
        return (
          img?.getAttribute('src') === '/api/images/issue185-tiff/preview' &&
          img.complete &&
          img.naturalWidth === 1200 &&
          img.naturalHeight === 900
        );
      });
      assert.equal(
        await page.evaluate(() =>
          document
            .querySelector('[role="tab"][aria-selected="true"]')
            .textContent.trim(),
        ),
        '原图',
      );
      if ([390, 1440].includes(width))
        await viewerShot(page, config, report, `tiff-detail-${theme}-${width}`);
      await page.click(entry);
      await page.waitForFunction(() => {
        const root = document.querySelector('[data-testid="image-viewer"]');
        const img = root?.querySelector('.yarl__slide_current img');
        return (
          root?.dataset.version === 'original' &&
          img?.getAttribute('src') === '/api/images/issue185-tiff/preview' &&
          img.complete &&
          img.naturalWidth === 1200 &&
          img.naturalHeight === 900
        );
      });
      assert.equal((await viewerState(page)).decoded, true);
      if ([390, 1440].includes(width))
        await viewerShot(page, config, report, `tiff-viewer-${theme}-${width}`);
      await closeViewer(page, true);
      await page.click('loc=role:tab[name="缩略图"]');
      await page.waitForFunction(() => {
        const img = document.querySelector(
          '[role="tabpanel"]:not([inert]) img',
        );
        return img?.complete && img.naturalWidth === 64;
      });
    }
  }
  const preview = await page.fetch(previewPath, { method: 'HEAD' });
  assert.equal(preview.status, 200);
  assert.match(preview.headers['content-type'], /image\/png/);
  const download = await page.fetch(`/i/${imageId}?type=original&download=1`, {
    method: 'HEAD',
  });
  assert.equal(download.status, 200);
  assert.match(download.headers['content-type'], /image\/tiff/);
  assert.match(download.headers['content-disposition'], /attachment/);
  const objectId = `${imageId}-original`;
  const source = join(fixtures.directory, `${imageId}-original.tiff`);
  const originalSize = (await stat(source)).size;
  const setSize = async (byteSize) => {
    await truncate(source, byteSize);
    await sql(
      `UPDATE media_images SET byte_size=${byteSize} WHERE id='${imageId}'`,
    );
    await sql(
      `UPDATE media_versions SET byte_size=${byteSize} WHERE image_id='${imageId}' AND kind='original'`,
    );
    await sql(
      `UPDATE media_objects SET byte_size=${byteSize} WHERE id='${objectId}'`,
    );
  };
  try {
    report.stage = 'tiff-original:above-limit';
    await setSize(limit + 1);
    await page.goto(`${config.origin}/library?image=${imageId}`);
    await page.waitForSelector('[data-testid="detail-body"]');
    await page.click('loc=role:tab[name="原图"]');
    await page.waitForFunction(() =>
      document
        .querySelector('[data-testid="detail-body"]')
        ?.textContent.includes('TIFF 原图超过 50 MiB，请下载后查看。'),
    );
    assert.equal(
      await page.evaluate(
        () => !!document.querySelector('[role="tabpanel"]:not([inert]) img'),
      ),
      false,
    );
    const rejected = await page.fetch(previewPath);
    assert.equal(rejected.status, 413);
    assert.equal(
      JSON.parse(rejected.body).code,
      'TIFF_PREVIEW_DOWNLOAD_REQUIRED',
    );
    await page.click(entry);
    await page.waitForFunction(() =>
      document
        .querySelector('[data-testid="image-viewer"]')
        ?.textContent.includes('TIFF 原图超过 50 MiB，请下载后查看。'),
    );
    const blocked = await viewerState(page);
    assert.equal(blocked.kind, 'original');
    assert.equal(blocked.decoded, false);
    assert.equal(
      await page.evaluate(() =>
        [
          ...document.querySelectorAll('[data-testid="image-viewer"] button'),
        ].some((button) => button.textContent.includes('重试读取')),
      ),
      false,
    );
    await viewerShot(page, config, report, 'tiff-original-download-required');
    await closeViewer(page, true);
    await page.click('loc=role:tab[name="缩略图"]');
    await page.waitForFunction(
      () =>
        document.querySelector('[role="tabpanel"]:not([inert]) img')
          ?.naturalWidth === 64,
    );
    const largeDownload = await page.fetch(
      `/i/${imageId}?type=original&download=1`,
      { method: 'HEAD' },
    );
    assert.equal(largeDownload.status, 200);
    assert.equal(Number(largeDownload.headers['content-length']), limit + 1);
  } finally {
    await setSize(originalSize);
  }
  report.checks.push(
    'Real 1200×900 TIFF original renders as original-resolution PNG at five viewport widths in both themes; existing 64×48 thumbnail remains independent. A valid TIFF padded beyond 50MiB is rejected with HTTP413, detail/viewer show download-only without loading/retry, thumbnail and original attachment download remain available.',
  );
}
