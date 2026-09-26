import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const button = (name) => `loc=role:button[name="${name}"]`;
const versions = ['original', 'compressed', 'thumbnail', 'watermark'];

async function dailyCounts(sql) {
  return sql(
    'SELECT version, SUM(count) AS count FROM analytics_daily GROUP BY version ORDER BY version',
  );
}

// Also called after the runner has stopped and restarted the production server:
// the final shutdown flush must not reveal delayed owner/private increments.
export async function verifyM2Analytics({ sql, state }) {
  for (const image of state.images) {
    const totals = await sql(
      `SELECT original_count, compressed_count, watermark_count FROM analytics_image_totals WHERE image_id='${image.id}'`,
    );
    const daily = await sql(
      `SELECT COALESCE(SUM(count),0) AS count FROM analytics_image_daily WHERE image_id='${image.id}'`,
    );
    assert.deepEqual(
      totals,
      image.expectedOriginalCount
        ? [
            {
              original_count: image.expectedOriginalCount,
              compressed_count: 0,
              watermark_count: 0,
            },
          ]
        : [],
      `${image.id}: only successful anonymous public originals enter cumulative statistics`,
    );
    assert.equal(daily[0].count, image.expectedOriginalCount);
  }
  const expected = new Map(
    state.analyticsBefore.map((row) => [row.version, row.count]),
  );
  const increment = state.images.reduce(
    (sum, image) => sum + image.expectedOriginalCount,
    0,
  );
  expected.set('original', (expected.get('original') ?? 0) + increment);
  assert.deepEqual(
    await dailyCounts(sql),
    [...expected]
      .map(([version, count]) => ({ version, count }))
      .sort((a, b) => a.version.localeCompare(b.version)),
    'Site daily counts equal baseline plus anonymous public original deliveries',
  );
}

export async function verifyM2Core({ task, page, config, sql, report }) {
  assert.deepEqual(
    await sql(
      'SELECT compression_enabled,output_format,quality,max_edge,watermark_mode FROM media_settings WHERE id=1',
    ),
    [
      {
        compression_enabled: 1,
        output_format: 'webp',
        quality: 82,
        max_edge: null,
        watermark_mode: 'off',
      },
    ],
    'Initialized media defaults match the M2 contract',
  );
  assert.deepEqual(
    await sql(
      'SELECT s.type,s.enabled FROM storage_settings settings JOIN storage_configs s ON s.id=settings.default_storage_id WHERE settings.id=1',
    ),
    [{ type: 'local', enabled: 1 }],
    'Initialization selects an enabled local default storage',
  );
  // The preceding legacy suite may still have accepted accesses in memory.
  // Let the real five-second flusher settle before taking its persisted baseline.
  await delay(5500);
  const state = { analyticsBefore: await dailyCounts(sql), images: [] };
  const anonymousOrigin = new URL(config.origin);
  anonymousOrigin.hostname = `anonymous-${anonymousOrigin.port}.localhost`;
  assert.notEqual(anonymousOrigin.hostname, new URL(config.origin).hostname);
  const anonymous = await task.newPage();
  const anonymousURL = (url) => {
    const target = new URL(url);
    target.hostname = anonymousOrigin.hostname;
    return target.href;
  };
  const waitState = (name) =>
    page.waitForSelector(`[data-testid="upload-item"][data-state="${name}"]`);
  const menu = async (name) => {
    await page.click(button('更多操作'));
    await page.click(`loc=role:menuitem[name="${name}"]`);
  };
  const upload = async (format, visibility, expectedState = 'ready') => {
    await page.goto(`${config.origin}/upload`);
    await page.waitForSelector('input[type=file]', { state: 'attached' });
    await page.click('loc=role:button[name*="可见性"]');
    await page.click(
      `loc=role:option[name="${visibility === 'public' ? '公开' : '私有'}"]`,
    );
    const source = join(
      config.projectDirectory,
      `tests/fixtures/runtime/images/sample.${format}`,
    );
    await page.setInputFiles('input[type=file]', [source]);
    await waitState('queued');
    await page.click(button('开始上传'));
    await waitState(expectedState);
    const id = await page.evaluate(
      () =>
        document.querySelector('[data-testid="upload-item"]').dataset.imageId,
    );
    assert.ok(id);
    const [saved] = await sql(
      `SELECT visibility,processing_status,display_name FROM media_images WHERE id='${id}'`,
    );
    assert.deepEqual(saved, {
      visibility,
      display_name: 'sample',
      processing_status: expectedState === 'ready' ? 'ready' : 'failed',
    });
    if (expectedState === 'ready') {
      assert.deepEqual(
        await sql(`SELECT status FROM media_jobs WHERE image_id='${id}'`),
        [{ status: 'succeeded' }],
      );
      const savedVersions = await sql(
        `SELECT v.kind,v.format,v.byte_size,o.key,o.storage_id,s.local_path FROM media_versions v JOIN media_objects o ON o.id=v.object_id JOIN storage_configs s ON s.id=o.storage_id WHERE v.image_id='${id}' AND o.status='stored' ORDER BY v.kind`,
      );
      assert.deepEqual(
        savedVersions.map((version) => version.kind),
        ['compressed', 'original', 'thumbnail'],
      );
      for (const version of savedVersions) {
        const file = await readFile(
          join(
            config.dataDirectory,
            'storage',
            version.local_path,
            'ariso',
            version.storage_id,
            version.key,
          ),
        );
        assert.ok(file.length > 0);
        assert.equal(file.length, version.byte_size);
        if (version.kind !== 'original') assert.equal(version.format, 'WEBP');
      }
    }
    const [original] = await sql(
      `SELECT o.key,o.storage_id,s.local_path FROM media_objects o JOIN storage_configs s ON s.id=o.storage_id WHERE o.image_id='${id}' AND o.purpose='original' AND o.status='stored'`,
    );
    assert.ok(original);
    const bytes = await readFile(source);
    assert.deepEqual(
      await readFile(
        join(
          config.dataDirectory,
          'storage',
          original.local_path,
          'ariso',
          original.storage_id,
          original.key,
        ),
      ),
      bytes,
      'Persisted original bytes equal the selected fixture',
    );
    const image = { id, format, visibility, expectedOriginalCount: 0 };
    state.images.push(image);
    return { image, bytes };
  };
  const readBytes = async (browser, url, expected, label) => {
    const file = join(config.output, `${label}.bin`);
    const response = await browser.fetch(url, { saveAs: file });
    assert.equal(response.status, 200, `${label}: successful delivery`);
    assert.deepEqual(
      await readFile(file),
      expected,
      `${label}: unchanged original bytes`,
    );
  };
  try {
    await anonymous.goto(`${anonymousOrigin.origin}/login`);
    await anonymous.waitForSelector('#email');
    assert.equal(
      (await anonymous.fetch('/api/images')).status,
      401,
      'Second browser page has no owner session',
    );
    await page.cdp('Emulation.setDeviceMetricsOverride', {
      width: config.width,
      height: config.width < 768 ? 844 : 1080,
      deviceScaleFactor: 1,
      mobile: config.width < 768,
    });
    for (const format of ['jpg', 'png']) {
      for (const visibility of ['public', 'private']) {
        const { image, bytes } = await upload(format, visibility);
        const { id } = image;
        await page.click(button('查看详情'));
        await page.waitForSelector('[data-testid="detail-body"]');
        await page.click('loc=role:tab[name="原图"]');
        await page.waitForFunction(() => {
          const img = document.querySelector('[data-testid="detail-body"] img');
          return img?.complete && img.naturalWidth > 0;
        });
        await page.click(button('复制链接'));
        await page.waitForSelector('loc=role:dialog[name="复制图片链接"]');
        await page.click('loc=role:button[name*="复制版本"]');
        await page.click('loc=role:option[name="原图"]');
        await page.evaluate(() => {
          const write = navigator.clipboard.writeText.bind(navigator.clipboard);
          window.__m2Copied = null;
          navigator.clipboard.writeText = async (text) => {
            await write(text);
            window.__m2Copied = text;
            navigator.clipboard.writeText = write;
          };
        });
        await page.click(button('复制 URL'));
        await page.waitForFunction(() => typeof window.__m2Copied === 'string');
        const url = await page.evaluate(() => window.__m2Copied);
        assert.equal(new URL(url).pathname, `/i/${id}`);
        assert.equal(new URL(url).searchParams.get('type'), 'original');
        image.url = url;
        await page.click(button('返回详情'));
        const pendingDownload = page.waitForEvent('download', {
          timeout: 30000,
        });
        if (config.width < 768) await menu('下载原图');
        else await page.click(button('下载原图'));
        const download = await pendingDownload;
        const downloadPath = join(
          config.output,
          `m2-${config.width}-${visibility}-${format}-download.${format}`,
        );
        await download.saveAs(downloadPath);
        assert.equal(download.suggestedFilename(), `sample.${format}`);
        assert.deepEqual(await readFile(downloadPath), bytes);
        await readBytes(page, url, bytes, `m2-${id}-owner`);
        const anonymousUrl = anonymousURL(url);
        if (visibility === 'public') {
          await readBytes(
            anonymous,
            anonymousUrl,
            bytes,
            `m2-${id}-anonymous-before`,
          );
          image.expectedOriginalCount++;
          assert.equal(
            (await anonymous.fetch(`/i/${id}?type=thumbnail`)).status,
            200,
          );
          assert.equal(
            (await anonymous.fetch(anonymousUrl, { method: 'HEAD' })).status,
            200,
          );
        } else {
          for (const kind of versions)
            assert.equal(
              (await anonymous.fetch(`/i/${id}?type=${kind}`)).status,
              401,
            );
        }
        await page.screenshot({
          path: join(
            config.output,
            `m2-${config.width}-${visibility}-${format}-detail.png`,
          ),
        });
        await menu('回收图片');
        await page.waitForSelector('[data-testid="trash-confirm"]');
        await page.click(button('确认回收'));
        await page.waitForFunction(
          () => !document.querySelector('[data-testid="trash-confirm"]'),
        );
        assert.ok(
          (await sql(`SELECT trashed_at FROM media_images WHERE id='${id}'`))[0]
            .trashed_at,
        );
        for (const kind of versions) {
          assert.equal((await page.fetch(`/i/${id}?type=${kind}`)).status, 404);
          assert.equal(
            (await anonymous.fetch(`/i/${id}?type=${kind}`)).status,
            visibility === 'public' ? 404 : 401,
          );
        }
        await page.goto(`${config.origin}/trash?image=${id}`);
        await page.waitForSelector('[data-testid="trash-detail"]');
        await page.click(button('恢复图片'));
        await page.waitForSelector('[data-testid="trash-confirm"]');
        await page.click(button('确认恢复'));
        await page.waitForFunction(
          () => !document.querySelector('[data-testid="trash-detail"]'),
        );
        const [restored] = await sql(
          `SELECT id,trashed_at,visibility FROM media_images WHERE id='${id}'`,
        );
        assert.deepEqual(restored, { id, trashed_at: null, visibility });
        await readBytes(page, url, bytes, `m2-${id}-owner-restored`);
        if (visibility === 'public') {
          await readBytes(
            anonymous,
            anonymousUrl,
            bytes,
            `m2-${id}-anonymous-restored`,
          );
          image.expectedOriginalCount++;
        } else assert.equal((await anonymous.fetch(anonymousUrl)).status, 401);
        report.checks.push(
          `${config.width}px ${format}/${visibility}: native File upload, real clipboard URL and downloaded bytes, independent anonymous access, all-version trash rejection and same-ID/same-URL restoration passed.`,
        );
      }
    }
    // Fail the actual final transition after worker-created versions commit.
    // No image, object or job records are manufactured by this scenario.
    await sql(
      "CREATE TRIGGER m2_fail_ready BEFORE UPDATE OF processing_status ON media_images WHEN NEW.processing_status='ready' BEGIN SELECT RAISE(ABORT, 'M2 controlled finalization failure'); END",
    );
    try {
      const { image, bytes } = await upload(
        'png',
        'public',
        'processing-failed',
      );
      const saved = await sql(
        `SELECT v.kind FROM media_versions v JOIN media_objects o ON o.id=v.object_id WHERE v.image_id='${image.id}' AND o.status='stored' ORDER BY v.kind`,
      );
      assert.ok(saved.some((row) => row.kind === 'original'));
      assert.ok(saved.some((row) => row.kind === 'thumbnail'));
      assert.ok(
        (
          await sql(
            `SELECT id FROM media_jobs WHERE image_id='${image.id}' AND status='failed'`,
          )
        ).length,
      );
      await readBytes(
        page,
        `${config.origin}/i/${image.id}?type=original`,
        bytes,
        `m2-${image.id}-failed-owner`,
      );
      for (const { kind } of saved) {
        assert.equal(
          (await page.fetch(`/i/${image.id}?type=${kind}`)).status,
          200,
        );
        assert.equal(
          (await anonymous.fetch(`/i/${image.id}?type=${kind}`)).status,
          409,
        );
      }
      await page.screenshot({
        path: join(config.output, `m2-${config.width}-processing-failed.png`),
      });
      report.checks.push(
        'A real worker finalization failure preserves original and generated versions for the owner, rejects every saved version to the independent anonymous page and contributes no statistics.',
      );
    } finally {
      await sql('DROP TRIGGER m2_fail_ready');
    }
    // Wait for the real periodic batch (including erroneous excluded accesses,
    // if any). The runner repeats exact assertions after graceful shutdown.
    await delay(5500);
    await verifyM2Analytics({ sql, state });
    report.checks.push(
      'Persisted image totals, image daily and site daily aggregates agree exactly: public original anonymous GETs only; owner reads/downloads, private/failed/trashed denials, thumbnail and HEAD accesses excluded.',
    );
    return state;
  } finally {
    await anonymous.close();
  }
}
