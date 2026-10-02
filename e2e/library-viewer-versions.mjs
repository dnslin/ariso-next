import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { promisify } from 'node:util';
import { viewerId } from './library-viewer-fixtures.mjs';
import {
  button,
  closeViewer,
  entry,
  kindNames,
  monitorViewerRequests,
  openViewerDirect,
  restoreViewerFetch,
  tab,
  viewer,
  viewerShot,
  viewerState,
  waitViewerImage,
} from './library-viewer-helpers.mjs';

const bytesLabel = (bytes) =>
  bytes >= 1048576
    ? `${(bytes / 1048576).toFixed(1)} MiB`
    : `${(bytes / 1024).toFixed(1)} KiB`;

export async function verifyViewerVersions({ page, config, sql, report }) {
  const [settings] = await sql(
    'SELECT default_link_version FROM media_settings WHERE id=1',
  );
  try {
    await sql(
      "UPDATE media_settings SET default_link_version='watermark' WHERE id=1",
    );
    await page.goto(`${config.origin}/library?image=${viewerId(7)}`);
    await page.waitForSelector('[data-testid="detail-body"]');
    const response = await page.fetch(`/api/images/${viewerId(7)}`);
    assert.equal(response.status, 200);
    const detail = JSON.parse(response.body);
    assert.equal(detail.defaultVersion, 'watermark');
    await monitorViewerRequests(page);
    await page.focus(entry);
    await page.keyboard.press('Enter');
    await waitViewerImage(page, viewerId(7), 'compressed');
    assert.equal(
      await page.evaluate(() =>
        window.__viewerRequests.some((request) =>
          request.path.endsWith('/neighbors'),
        ),
      ),
      false,
      'Direct URL detail must not request neighbors',
    );
    for (const kind of Object.keys(kindNames)) {
      await page.click(tab(kindNames[kind]));
      await waitViewerImage(page, viewerId(7), kind);
      const selected = detail.versions.find((version) => version.kind === kind);
      const state = await viewerState(page);
      assert.ok(
        state.info.toLowerCase().includes(selected.format.toLowerCase()),
        `${kind}: actual format`,
      );
      assert.ok(
        state.info.includes(bytesLabel(selected.byteSize)),
        `${kind}: actual saved byte size`,
      );
    }
    assert.equal(
      await page.evaluate(
        (selector) =>
          [
            ...document.querySelector(selector).querySelectorAll('button,a'),
          ].some((node) =>
            /下载|分享|幻灯片/.test(
              node.getAttribute('aria-label') || node.textContent,
            ),
          ),
        viewer,
      ),
      false,
    );
    assert.equal((await page.fetch(`/api/images/${viewerId(7)}`)).status, 200);
    assert.equal(
      (
        await sql('SELECT default_link_version FROM media_settings WHERE id=1')
      )[0].default_link_version,
      'watermark',
      'Viewer version changes never write default delivery settings',
    );
    await closeViewer(page, true);
    await restoreViewerFetch(page);
    await page.click('loc=role:tab[name="缩略图"]');
    await page.click(entry);
    await waitViewerImage(page, viewerId(7), 'thumbnail');
    await closeViewer(page);
    await page.click('loc=role:tab[name="原图"]');
    await page.click(entry);
    await waitViewerImage(page, viewerId(7), 'original');
    await closeViewer(page);
  } finally {
    await restoreViewerFetch(page);
    await sql(
      `UPDATE media_settings SET default_link_version='${settings.default_link_version}' WHERE id=1`,
    );
  }
  report.checks.push(
    'Direct URL detail makes zero neighbor calls and opens compressed while the real site default link is watermark. Four actual saved versions show their format and byte size; explicit detail original/thumbnail choice carries into the viewer. Version selection never changes the default and the viewer has no download/share/slideshow controls.',
  );

  for (const id of ['issue185-animation', 'issue185-apng']) {
    await openViewerDirect(page, config, id);
    await waitViewerImage(page, id, 'original');
    const animation = await page.evaluate(() => {
      const image = document.querySelector(
        '[data-testid="image-viewer"] .yarl__slide_current img',
      );
      const rect = image.getBoundingClientRect();
      return {
        width: image.naturalWidth,
        height: image.naturalHeight,
        clip: {
          x: Math.ceil(rect.left + 1),
          y: Math.ceil(rect.top + 1),
          width: Math.floor(rect.width - 2),
          height: Math.floor(rect.height - 2),
        },
        viewport: { width: innerWidth, height: innerHeight },
      };
    });
    assert.equal(animation.width, 64);
    assert.equal(animation.height, 48);
    assert.ok(animation.clip.width > 0 && animation.clip.height > 0);
    assert.ok(
      animation.clip.x >= 0 &&
        animation.clip.y >= 0 &&
        animation.clip.x + animation.clip.width <= animation.viewport.width &&
        animation.clip.y + animation.clip.height <= animation.viewport.height,
      'Animation pixels are inside the visible viewport',
    );
    // Canvas drawImage(animated img) deliberately reads the default/first
    // frame. Capture displayed pixels instead (WHATWG canvas image sources):
    // https://html.spec.whatwg.org/multipage/canvas.html#image-sources-for-2d-rendering-contexts
    const frames = new Set();
    const started = Date.now();
    animation.samples = [];
    for (let sample = 0; sample < 12 && frames.size < 2; sample++) {
      const file = `library-viewer-${id}-frame-${sample}.png`;
      const path = join(config.output, file);
      await page.screenshot({ path, clip: animation.clip, scale: 'css' });
      const { stdout } = await promisify(execFile)('magick', [
        path,
        '-format',
        '%#',
        'info:',
      ]);
      const signature = stdout.trim();
      assert.match(signature, /^[a-f0-9]{64}$/i);
      frames.add(signature);
      animation.samples.push({
        file,
        signature,
        elapsedMs: Date.now() - started,
      });
      report.screenshots.push(file);
      if (frames.size < 2) await setTimeout(75);
    }
    animation.frames = [...frames];
    report.animation ??= [];
    report.animation.push({ id, ...animation });
    assert.ok(
      animation.frames.length > 1,
      `${id}: displayed original advances animation pixels`,
    );
    await viewerShot(page, config, report, id);
    await closeViewer(page);
  }
  for (const id of ['issue185-svg', 'issue185-heic']) {
    await openViewerDirect(page, config, id);
    await waitViewerImage(page, id, 'thumbnail');
    assert.equal(
      await page.evaluate(
        (label) =>
          document
            .querySelector(
              `[data-testid="image-viewer"] [role="tab"][aria-disabled="true"]`,
            )
            ?.textContent.trim() === label,
        '原图',
      ),
      true,
      `${id}: attachment-only original is unavailable in the viewer`,
    );
    assert.ok((await viewerState(page)).info.includes('预览'));
    assert.equal(
      await page.evaluate(
        (id) =>
          [
            ...document.querySelectorAll('[data-testid="image-viewer"] img'),
          ].some((image) => image.src.includes(`/i/${id}?type=original`)),
        id,
      ),
      false,
    );
    await viewerShot(page, config, report, id);
    await closeViewer(page);
  }
  await openViewerDirect(page, config, 'issue185-failed');
  await waitViewerImage(page, 'issue185-failed', 'original');
  await closeViewer(page);
  await openViewerDirect(page, config, 'issue185-missing');
  await waitViewerImage(page, 'issue185-missing', 'original');
  for (const kind of ['compressed', 'watermark'])
    assert.equal(
      await page.evaluate(
        (name) =>
          [
            ...document.querySelectorAll(
              '[data-testid="image-viewer"] [role="tab"]',
            ),
          ]
            .find((node) => node.textContent.trim() === name)
            ?.getAttribute('aria-disabled'),
        kindNames[kind],
      ),
      'true',
      'Absent versions are visibly disabled instead of silently substituted',
    );
  await page.focus(button('关闭大图'));
  await page.keyboard.press('Tab');
  assert.equal(
    await page.evaluate(
      () => !!document.activeElement?.closest('[data-testid="image-viewer"]'),
    ),
    true,
    'Tab remains in the open viewer',
  );
  await closeViewer(page, true);
  report.checks.push(
    'Real GIF and APNG original pixels change across frames; SVG/HEIC use existing WebP preview without requesting original. Attachment-only and absent versions disable explicitly. Failed images retain actual saved original; keyboard focus remains in the viewer and Escape returns to its entry.',
  );
}
