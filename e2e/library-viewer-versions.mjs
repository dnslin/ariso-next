import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { promisify } from 'node:util';
import { viewerId } from './library-viewer-fixtures.mjs';
import { setDetail171Viewport } from './library-detail-171-helpers.mjs';
import {
  button,
  closeViewer,
  entry,
  kindNames,
  monitorViewerRequests,
  openViewerDirect,
  restoreViewerFetch,
  settleViewer,
  viewer,
  viewerShot,
  viewerState,
  waitViewerImage,
} from './library-viewer-helpers.mjs';

export async function verifyViewerVersions({ page, config, sql, report }) {
  report.stage = 'versions:default-and-explicit-selection';
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
      await closeViewer(page, true);
      await page.click(`loc=role:tab[name="${kindNames[kind]}"]`);
      await page.click(entry);
      await waitViewerImage(page, viewerId(7), kind);
      const selected = detail.versions.find((version) => version.kind === kind);
      const state = await viewerState(page);
      const delivered = await page.fetch(state.src);
      assert.equal(delivered.status, 200);
      assert.equal(delivered.headers['content-type'], selected.mime);
      assert.equal(
        Number(delivered.headers['content-length']),
        selected.byteSize,
      );
      assert.equal(
        await page.evaluate(
          () =>
            document.querySelector(
              '[data-testid="image-viewer"] [role="tab"]',
            ) === null,
        ),
        true,
        'Version choice stays in detail',
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
  } finally {
    await restoreViewerFetch(page);
    await sql(
      `UPDATE media_settings SET default_link_version='${settings.default_link_version}' WHERE id=1`,
    );
  }
  report.checks.push(
    'Direct URL detail makes zero neighbor calls and opens compressed while the real site default link is watermark. Selecting each saved version in detail is inherited by the immersive viewer, whose actual delivery MIME and byte length match the saved metadata. Selection never changes the default; the viewer has no version/download/share/slideshow controls.',
  );

  for (const id of ['issue185-animation', 'issue185-apng']) {
    report.stage = `versions:${id}:animation`;
    await openViewerDirect(page, config, id);
    await waitViewerImage(page, id, 'original');
    const animation = await page.evaluate(() => {
      const image = document.querySelector(
        '[data-testid="image-viewer"] .yarl__slide_current img',
      );
      const rect = image.getBoundingClientRect();
      const scale = Math.min(
        rect.width / image.naturalWidth,
        rect.height / image.naturalHeight,
      );
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      return {
        width: image.naturalWidth,
        height: image.naturalHeight,
        clip: {
          x: Math.ceil(rect.left + (rect.width - width) / 2 + 1),
          y: Math.ceil(rect.top + (rect.height - height) / 2 + 1),
          width: Math.floor(width - 2),
          height: Math.floor(height - 2),
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
    report.stage = `versions:${id}:saved-preview`;
    await openViewerDirect(page, config, id);
    await waitViewerImage(page, id, 'thumbnail');
    assert.equal(
      await page.evaluate(() =>
        document
          .querySelector('[data-testid="image-viewer"]')
          .getAttribute('aria-label'),
      ),
      '大图查看（静态预览）',
    );
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
    // HEIC detail may already have original selected implicitly. Select a
    // different saved tab first so the explicit-original event really occurs.
    await page.click('loc=role:tab[name="缩略图"]');
    await page.click('loc=role:tab[name="原图"]');
    report.stage = `versions:${id}:explicit-original`;
    await page.click(entry);
    await page.waitForSelector(
      '[data-testid="image-viewer"] .yarl__slide_current [data-testid="viewer-placeholder"]',
    );
    assert.equal((await viewerState(page)).kind, 'original');
    assert.match((await viewerState(page)).placeholder, /附件|格式|预览/);
    assert.equal(
      (await viewerState(page)).decoded,
      false,
      'Explicit attachment-only original cannot silently substitute the thumbnail',
    );
    await closeViewer(page);
  }
  report.stage = 'versions:failed-saved-original';
  await openViewerDirect(page, config, 'issue185-failed');
  await waitViewerImage(page, 'issue185-failed', 'original');
  await closeViewer(page);
  report.stage = 'versions:missing-saved-original';
  await openViewerDirect(page, config, 'issue185-missing');
  await waitViewerImage(page, 'issue185-missing', 'original');
  await closeViewer(page);
  for (const kind of ['compressed', 'watermark'])
    assert.equal(
      await page.evaluate(
        (name) =>
          [
            ...document.querySelectorAll(
              '[data-testid="detail-body"] [role="tab"]',
            ),
          ]
            .find((node) => node.textContent.trim() === name)
            ?.getAttribute('aria-disabled'),
        kindNames[kind],
      ),
      'true',
      'Absent versions are disabled in detail instead of silently substituted',
    );
  report.stage = 'versions:missing-reopen-for-keyboard';
  await page.click(entry);
  await waitViewerImage(page, 'issue185-missing', 'original');
  report.stage = 'versions:missing-tab-containment';
  await page.focus(button('关闭大图'));
  report.keyboardFocus ??= [];
  for (const key of [
    'Tab',
    'Tab',
    'Tab',
    'Shift+Tab',
    'Shift+Tab',
    'Shift+Tab',
  ]) {
    await page.keyboard.press(key);
    await settleViewer(page);
    const focus = await page.evaluate(() => ({
      tag: document.activeElement?.tagName,
      label: document.activeElement?.getAttribute('aria-label'),
      inViewer: !!document.activeElement?.closest(
        '[data-testid="image-viewer"]',
      ),
    }));
    report.keyboardFocus.push({ context: 'direct-original', key, ...focus });
    assert.equal(focus.inViewer, true, `${key} stays inside the direct viewer`);
  }
  report.stage = 'versions:missing-escape-and-entry-focus';
  await closeViewer(page, true);
  report.stage = 'versions:focused-entry-tooltip-resize';
  await page.waitForSelector('[role="tooltip"]');
  const readTooltipViewport = () =>
    page.evaluate(() => ({
      innerWidth,
      innerHeight,
      clientWidth: document.documentElement.clientWidth,
      clientHeight: document.documentElement.clientHeight,
      scrollWidth: document.documentElement.scrollWidth,
      bodyClientWidth: document.body.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      visualWidth: window.visualViewport?.width,
      visualHeight: window.visualViewport?.height,
      visualScale: window.visualViewport?.scale,
      activeTestId: document.activeElement?.dataset.testid,
      tooltipPresent: !!document.querySelector('[role="tooltip"]'),
    }));
  report.tooltipResize = { before: await readTooltipViewport() };
  await setDetail171Viewport(page, 390, 400);
  await page.waitForSelector('[role="tooltip"]', { state: 'hidden' });
  report.tooltipResize.after = await readTooltipViewport();
  const viewport = report.tooltipResize.after;
  assert.equal(viewport.innerWidth, 390);
  assert.equal(viewport.innerHeight, 400);
  assert.equal(viewport.clientWidth, 390);
  assert.equal(viewport.clientHeight, 400);
  assert.ok(
    viewport.scrollWidth <= viewport.clientWidth,
    'Focused entry tooltip cannot expand the document viewport after resize',
  );
  assert.ok(
    viewport.bodyScrollWidth <= viewport.bodyClientWidth,
    'Resize preserves the actual body width without horizontal overflow',
  );
  assert.equal(viewport.visualScale, 1);
  assert.equal(
    await page.evaluate(() => document.activeElement?.dataset.testid),
    'detail-viewer-entry',
    'Window resize closes the entry tooltip without moving the returned focus',
  );
  report.checks.push(
    'Real GIF/APNG visible pixels animate. SVG/HEIC default to their saved WebP preview; explicitly selecting attachment-only original in detail shows a reason without substituting another kind. Missing versions are disabled in detail. Failed images retain saved original. Three Tab and three Shift+Tab operations keep actual focus inside the direct viewer; Escape closes it and returns to the detail entry. Resizing the focused entry closes its tooltip without viewport expansion or moving focus.',
  );
  report.stage = 'versions:completed';
}
