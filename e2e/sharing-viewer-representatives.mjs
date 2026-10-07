import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resizeViewport } from './browser-geometry.mjs';

export async function verifySharingViewerRepresentatives({
  page,
  config,
  report,
  session,
  viewing,
}) {
  report.stage = 'viewer-representatives';
  const { open, close, capture, imageLoaded, record } = viewing;
  await resizeViewport(page, 1440);
  await session.updateShare({ enabled: 1, show_name: 0, layout: 'grid' });
  await session.open();
  await session.loaded(40);
  await open();
  await imageLoaded();
  await capture('hidden-name');
  await session.hiddenNames();
  await capture('short-viewport', [390], ['light', 'dark'], 420);
  await close();
  await session.updateShare({ show_name: 1, layout: 'masonry' });
  await resizeViewport(page, 1440);
  await session.open();
  await session.loaded(40);
  await open();
  await imageLoaded();
  await capture('visible-name');
  await close();
  record(
    'Desktop and 360/390/430/768, light/dark, hidden/visible names and short viewport representative captures',
  );

  // This image has never been current or a preloaded neighbor in earlier samples.
  const imageId = config.publicIds[25];
  await resizeViewport(page, 1440);
  await page.mouse.move(700, 500);
  await page.mouse.wheel(0, 100000, {
    label: 'reach an unviewed shared image',
  });
  await page.waitForSelector(`[data-share-open="${imageId}"]`);
  const [object] = await session.sql(
    `SELECT o.key,s.id,s.local_path FROM media_versions v JOIN media_objects o ON o.id=v.object_id JOIN storage_configs s ON s.id=o.storage_id WHERE v.image_id='${imageId}' AND v.kind='original'`,
  );
  const path = join(
    config.dataDirectory,
    'storage',
    object.local_path,
    'ariso',
    object.id,
    object.key,
  );
  const bytes = await readFile(path);
  const previewUrl = `${config.origin}/i/${imageId}?type=original`;
  report.expectedPreviewErrors ??= [];
  report.expectedPreviewErrors.push(previewUrl);
  try {
    await rm(path);
    await page.evaluate(() => performance.clearResourceTimings());
    await open(imageId);
    await page.waitForSelector('[data-testid="share-viewer-error"]');
    const requested = await page.evaluate(
      (id) =>
        performance
          .getEntriesByType('resource')
          .map((entry) => entry.name)
          .filter((url) => url.includes(`/i/${id}?`)),
      imageId,
    );
    assert.ok(
      requested.includes(previewUrl),
      'The unviewed preview really requests the missing bytes',
    );
    assert.ok(
      requested.every((url) => url === previewUrl),
      'A failed chosen preview never requests another version',
    );
    await capture('preview-error', [390, 1440], ['light', 'dark']);
    await writeFile(path, bytes);
    await page.click(
      '[data-testid="share-viewer-error"] button:has-text("重新加载")',
    );
    await imageLoaded();
    await page.waitForSelector('[data-testid="share-viewer-error"]', {
      state: 'hidden',
    });
    await close();
    record(
      'Real missing preview bytes on an unviewed image show the approved error; retry reads the same original version after restoration without fallback',
    );
  } finally {
    await writeFile(path, bytes);
  }
  await session.updateShare({ show_name: 0, layout: 'grid' });
}
