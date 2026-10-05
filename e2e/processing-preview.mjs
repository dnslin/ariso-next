import assert from 'node:assert/strict';
import { join } from 'node:path';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readBrowserErrors } from './browser-errors.mjs';
import { testId, quote, field } from './processing-helpers.mjs';

export async function verifyProcessingPreview(page, config, tools, report) {
  const {
    request,
    settings,
    editable,
    open,
    fill,
    value,
    switchTo,
    monitor,
    browser,
    create,
    result,
    previewState,
    previewControls,
    chooseFile,
    sql,
    businessState,
    evidence,
    scrollDetails,
  } = tools;
  const fillNumber = async (name, number) => {
    await page.focus(field(name));
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type(String(number));
    await page.keyboard.press('Tab');
    assert.equal(await value(name), String(number));
  };
  const terminalControls = async () => {
    const controls = await previewControls();
    assert.equal(controls.fileDisabled, false);
    assert.equal(controls.picker.disabled, false);
    assert.equal(controls.picker.text, '更换测试图');
    assert.deepEqual(
      controls.targets.map((row) => row.target),
      ['original', 'thumbnail', 'compressed', 'watermark'],
    );
    assert.ok(controls.targets.every((row) => !row.disabled));
    assert.equal(controls.cancelCount, 0);
    assert.deepEqual(
      controls.footer.find((row) => row.testId === 'processing-preview-create'),
      {
        testId: 'processing-preview-create',
        text: '生成预览',
        disabled: false,
      },
    );
    return controls;
  };
  const resultDetails = async (state) => {
    const details = await scrollDetails([
      `${testId('preview')} code`,
      testId('preview-result'),
    ]);
    await evidence(`${state}-result`, 390, 'dark');
    Object.assign(report.layouts.at(-1), details);
  };
  await request('/api/settings/media', 'PATCH', {
    compressionEnabled: true,
    outputFormat: 'webp',
    maxEdge: null,
    watermarkMode: 'off',
    watermarkAssetId: null,
    defaultLinkVersion: 'compressed',
    defaultVisibility: 'public',
    quality: 82,
  });
  await open();
  await switchTo('启用水印', true);
  await page.click('[data-watermark-mode="text"]');
  await fill('watermarkText', 'Ariso 未保存');
  await fillNumber('quality', 61);
  await fillNumber('watermarkOpacity', 64);
  const savedBefore = editable(await settings());
  assert.equal(savedBefore.defaultVisibility, 'public');
  const businessBefore = await businessState();
  await monitor();
  await page.click(testId('preview-open'));
  await page.waitForSelector(testId('preview'));
  await evidence('preview-empty', 390);
  const results = [];
  const sources = join(config.projectDirectory, 'tests/fixtures/media-formats');
  for (const target of ['original', 'compressed', 'thumbnail', 'watermark']) {
    const row = await create(target);
    results.push(
      await result(
        row,
        target === 'original' ? join(sources, 'source.png') : undefined,
      ),
    );
    const [stored] = await sql(
      `SELECT snapshot,target FROM media_previews WHERE id=${quote(row.id)}`,
    );
    const snapshot = JSON.parse(stored.snapshot);
    assert.equal(stored.target, target);
    assert.equal(snapshot.quality, 61);
    assert.equal(snapshot.watermarkText, 'Ariso 未保存');
    assert.equal(snapshot.watermarkOpacity, 64);
    assert.equal(snapshot.defaultVisibility, 'private');
    assert.equal('defaultLinkVersion' in snapshot, false);
    assert.equal('concurrency' in snapshot, false);
    const sent = (await browser()).requests.findLast(
      (item) => item.path === '/api/media/previews' && item.method === 'POST',
    );
    assert.equal(sent.status, 202);
    assert.equal(Object.keys(sent.options.settings).length, 17);
    assert.equal('defaultVisibility' in sent.options.settings, false);
    assert.equal('defaultLinkVersion' in sent.options.settings, false);
    assert.equal('concurrency' in sent.options.settings, false);
    assert.equal(sent.options.target, target);
    assert.equal(
      results.at(-1).mime,
      target === 'original' ? 'image/png' : 'image/webp',
    );
    await terminalControls();
  }
  for (const target of ['original', 'compressed', 'thumbnail', 'watermark']) {
    await page.click(`[data-preview-target="${target}"]`);
    await page.waitForSelector(
      `[data-preview-target="${target}"][aria-pressed="true"]`,
    );
    const controls = await terminalControls();
    assert.equal(
      controls.targets.find((row) => row.target === target).pressed,
      true,
    );
  }
  await evidence('preview-success', 1440);
  assert.deepEqual(editable(await settings()), savedBefore);
  assert.deepEqual(await businessState(), businessBefore);
  assert.equal(
    (await browser()).requests.filter(
      (row) => row.path === '/api/settings/media' && row.method === 'PATCH',
    ).length,
    0,
  );
  report.checks.push({
    check:
      'All four targets generate actual owner-only image bytes from the complete unsaved 17-field rendering form, even when saved visibility is public. Natural image size and Content-Type/Length agree with real result metadata. Settings and business media/upload rows remain unchanged.',
    results,
  });

  const previous = await previewState();
  const sameNameDirectory = join(config.output, 'processing-same-name');
  await mkdir(sameNameDirectory, { recursive: true });
  const sameNameFile = join(sameNameDirectory, 'source.png');
  await copyFile(join(sources, 'second.png'), sameNameFile);
  await terminalControls();
  await page.setInputFiles(testId('preview-file'), [sameNameFile]);
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="processing-preview"]')?.dataset
        .stale === 'true',
  );
  assert.equal((await previewState()).id, previous.id);
  await terminalControls();
  report.checks.push({
    check:
      'Choosing different actual bytes under the same file name marks the previous result stale without changing its task ID.',
  });
  await page.click(testId('preview-return'));
  await page.waitForSelector(`${testId('editor')}[data-state="ready"]`);
  assert.equal(await value('quality'), '61');
  await fillNumber('quality', 59);
  await page.click(testId('preview-open'));
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="processing-preview"]')?.dataset
        .stale === 'true',
  );
  const stale = await previewState();
  assert.equal(stale.id, previous.id);
  assert.equal(stale.target, 'watermark');
  await chooseFile('static.svg');
  assert.equal((await previewState()).id, previous.id);
  await evidence('preview-stale', 390, 'dark');
  const svg = await create('original', 'static.svg');
  await result(svg, join(sources, 'static.svg'));
  await page.click('[data-preview-target="compressed"]');
  const svgStale = await previewState();
  assert.equal(svgStale.id, svg.id);
  assert.equal(svgStale.target, 'original');
  assert.equal(svgStale.stale, 'true');
  assert.equal(
    await page.evaluate(
      () =>
        !!document.querySelector(
          '[data-testid="processing-preview-result"] img',
        ),
    ),
    false,
  );
  await evidence('preview-svg-stale', 390, 'dark');
  await resultDetails('preview-svg-stale');
  report.checks.push({
    check:
      'Returning retains unsaved form values. Editing parameters or selecting another file/target only marks the old result stale. SVG keeps its original result identity and attachment behavior after selecting compressed.',
  });

  for (const target of ['compressed', 'watermark']) {
    const row = await create(target, 'animated.gif');
    assert.equal(row.status, 'succeeded');
    assert.equal(row.result, null);
    assert.match(row.unavailableReason, /动画|仅支持预览/);
    assert.equal(row.resultUrl, null);
    assert.equal(
      await page.evaluate(
        () =>
          !!document.querySelector(
            '[data-testid="processing-preview-result"] img',
          ),
      ),
      false,
    );
    if (target === 'compressed') {
      await evidence('preview-gif-unavailable', 390, 'dark');
      const details = await scrollDetails([
        `${testId('preview')} [data-slot="card"]:last-child`,
      ]);
      await evidence('preview-gif-unavailable-status', 390, 'dark');
      Object.assign(report.layouts.at(-1), details);
    }
    report.checks.push({
      check: `Actual animated GIF ${target} result is explicitly unavailable; no thumbnail or static image is substituted.`,
      id: row.id,
      unavailableReason: row.unavailableReason,
    });
  }
  const animated = await create('original', 'animated.gif');
  await result(animated, join(sources, 'animated.gif'));
  const thumbnail = await create('thumbnail', 'animated.gif');
  await result(thumbnail);
  assert.equal(thumbnail.result.mime, 'image/webp');
  await evidence('preview-gif-thumbnail', 390);
  await resultDetails('preview-gif-thumbnail');

  // A real original can succeed even when this browser cannot decode its format.
  const errorsBeforeHeic = await readBrowserErrors(page);
  report.browserErrors.push(...errorsBeforeHeic);
  assert.deepEqual(
    errorsBeforeHeic,
    [],
    'Earlier previews have no unexpected resource errors',
  );
  await page.evaluate(() => {
    const original = URL.createObjectURL;
    window.__processingCreatedBlobs = [];
    window.__processingRestoreObjectUrls = () => {
      URL.createObjectURL = original;
    };
    URL.createObjectURL = (blob) => {
      const url = original.call(URL, blob);
      window.__processingCreatedBlobs.push({
        url,
        type: blob.type,
        size: blob.size,
      });
      return url;
    };
  });
  try {
    const heic = await create('original', 'alpha.heic');
    assert.equal(heic.status, 'succeeded');
    assert.equal(heic.target, 'original');
    assert.equal(heic.result.format, 'HEIC');
    assert.equal(heic.result.mime, 'image/heic');
    assert.deepEqual(
      { width: heic.result.width, height: heic.result.height },
      { width: 64, height: 48 },
    );
    const savedPath = join(config.output, 'processing-original-alpha.heic');
    const response = await page.fetch(heic.resultUrl, { saveAs: savedPath });
    assert.equal(response.status, 200);
    assert.equal(response.headers['content-type'], 'image/heic');
    assert.equal(
      response.headers['content-length'],
      String(heic.result.byteSize),
    );
    const actual = await readFile(savedPath);
    const source = await readFile(join(sources, 'alpha.heic'));
    assert.equal(actual.length, heic.result.byteSize);
    const sourceDigest = createHash('sha256').update(source).digest('hex');
    assert.equal(
      createHash('sha256').update(actual).digest('hex'),
      sourceDigest,
    );
    await page.waitForFunction((url) => {
      const root = document.querySelector(
        '[data-testid="processing-preview-result"]',
      );
      const link = root?.querySelector('a[download]');
      return (
        root?.textContent.includes('当前浏览器无法直接显示这个原图格式') &&
        link?.getAttribute('href') === url &&
        link.textContent.includes('读取原文件')
      );
    }, heic.resultUrl);
    const created = await page.evaluate(() => window.__processingCreatedBlobs);
    const blob = created.find(
      (item) =>
        item.type === 'image/heic' && item.size === heic.result.byteSize,
    );
    assert.ok(
      blob,
      'The displayed original uses the actual HEIC response Blob',
    );
    const errors = await readBrowserErrors(page);
    report.expectedResourceErrors ??= [];
    report.expectedResourceErrors.push(
      ...errors.map((error) => ({
        ...error,
        scenario: 'original-heic-undecodable',
        previewId: heic.id,
      })),
    );
    assert.ok(
      errors.length > 0,
      'Capture the actual HEIC image decoder resource error',
    );
    for (const error of errors) {
      assert.equal(error.kind, 'error');
      assert.equal(error.message, `Resource failed: ${blob.url}`);
    }
    await evidence('preview-original-heic-undecodable', 390, 'dark');
    await resultDetails('preview-original-heic-undecodable');
    report.checks.push({
      check:
        'Actual HEIC original succeeds with its real ID and format/dimensions/byte size. Authenticated result bytes have the original file SHA-256; the real browser decoder failure is recorded explicitly and the page offers its same-ID original-file read instead of substituting a thumbnail.',
      previewId: heic.id,
      result: heic.result,
      originalSha256: sourceDigest,
      expectedResourceErrors: errors,
    });
  } finally {
    await page.evaluate(() => window.__processingRestoreObjectUrls());
  }

  // Preview references must not adopt or extend an uncommitted watermark asset.
  await page.click(testId('preview-return'));
  await page.click('[data-watermark-mode="image"]');
  await page.setInputFiles(testId('asset-file'), [join(sources, 'alpha.png')]);
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="processing-asset"]')?.dataset
        .assetId,
  );
  const assetId = await page.evaluate(
    () =>
      document.querySelector('[data-testid="processing-asset"]').dataset
        .assetId,
  );
  const beforeAsset = await request(`/api/media/watermark-assets/${assetId}`);
  await page.click(testId('preview-open'));
  const imageWatermark = await create('watermark');
  await result(imageWatermark);
  const afterAsset = await request(`/api/media/watermark-assets/${assetId}`);
  assert.equal(afterAsset.expiresAt, beforeAsset.expiresAt);
  assert.ok(afterAsset.expiresAt);
  assert.equal((await settings()).watermarkAssetId, null);
  assert.deepEqual(
    await sql(
      `SELECT * FROM media_watermark_preview_refs WHERE preview_id=${quote(imageWatermark.id)}`,
    ),
    [],
  );
  report.checks.push({
    check:
      'Real image-watermark preview uses its temporary asset without adoption, expiry extension or leaked preview reference.',
    assetId,
    expiresAt: afterAsset.expiresAt,
  });
}
