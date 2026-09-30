import assert from 'node:assert/strict';
import { join } from 'node:path';
import { verifyLargeLibrarySelection } from './library-selection.mjs';

/** Real disposable SQLite records and the existing production list endpoint. */
export async function verifyLibraryScale({ page, config, sql, report }) {
  const prefix = 'library173-scale-';
  const search = 'issue173-scale-';
  const count = 2400;
  const size = 80;
  const record = {
    status: 'failed',
    records: count,
    pageSize: size,
    samples: [],
    keyboard: [],
    limitations: [
      'Heap measurements describe this Ego Chromium process after explicit GC, with no image bytes or thumbnail elements in this fixture.',
      'No universal heap threshold is assumed. Growth includes retained lightweight image records, query pages, layout positions and small request-observation records.',
      'The DOM bound is checked for this fixed 1440×1080 viewport; it is not a maximum for arbitrary viewport sizes.',
    ],
  };
  report.scale = record;
  const loaded = (expected) =>
    page.waitForFunction(
      (expected) =>
        Number(
          document.querySelector('[data-testid="library-list"]')?.dataset
            .loadedCount,
        ) === expected &&
        !document.querySelector('[data-testid="library-loading"]'),
      expected,
    );
  const settled = () =>
    page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  async function sample(batch) {
    await settled();
    await page.cdp('HeapProfiler.collectGarbage');
    const heap = await page.cdp('Runtime.getHeapUsage');
    const layout = await page.evaluate(() => {
      const main = document.querySelector('main');
      const gallery = document.querySelector('[data-testid="library-gallery"]');
      const list = document.querySelector('[data-testid="library-list"]');
      return {
        loaded: Number(list.dataset.loadedCount),
        cardNodes: gallery.querySelectorAll('[data-testid="library-card"]')
          .length,
        totalDomNodes: document.querySelectorAll('*').length,
        galleryHeight: gallery.getBoundingClientRect().height,
        mainWidth: main.clientWidth,
        mainScrollWidth: main.scrollWidth,
        scrollTop: main.scrollTop,
        scrollHeight: main.scrollHeight,
        focusedId:
          document.activeElement?.closest('[data-image-id]')?.dataset.imageId ??
          null,
        requestCount: window.__libraryScale.requests.length,
        responseBytes: window.__libraryScale.requests.reduce(
          (sum, entry) => sum + entry.bytes,
          0,
        ),
      };
    });
    assert.equal(layout.loaded, batch * size);
    assert.ok(
      layout.cardNodes <= 85,
      `Batch ${batch}: at most 80 visible/overscan cards + 5 focus/boundary cards; actual ${layout.cardNodes}`,
    );
    assert.ok(
      layout.mainScrollWidth <= layout.mainWidth,
      'Long gallery must not overflow horizontally',
    );
    assert.equal(
      layout.requestCount,
      batch,
      'Exactly one list request per batch',
    );
    const result = {
      batch,
      ...layout,
      heapUsedBytes: heap.usedSize,
      heapTotalBytes: heap.totalSize,
    };
    record.samples.push(result);
    return result;
  }
  try {
    const [storage] = await sql(
      'SELECT id FROM storage_configs WHERE enabled = 1 LIMIT 1',
    );
    assert.ok(storage, 'Scale fixture needs the disposable default storage');
    const created = 1801000000000;
    for (let start = 0; start < count; start += 400) {
      const values = Array.from(
        { length: Math.min(400, count - start) },
        (_, offset) => {
          const index = start + offset;
          const suffix = String(index).padStart(4, '0');
          return `('${prefix}${suffix}','${storage.id}','${search}${suffix}.png','${search}${suffix}.png','private','png','image/png',640,480,${1000 + index},'static','ready',${created - index},${created})`;
        },
      );
      await sql(
        `INSERT INTO media_images (id,storage_id,original_name,display_name,visibility,format,mime,width,height,byte_size,classification,processing_status,created_at,updated_at) VALUES ${values.join(',')}`,
      );
    }
    await page.cdp('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 1080,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await page.goto(
      `${config.origin}/library?${new URLSearchParams({ q: search, pageSize: String(size) })}`,
    );
    await loaded(size);
    if (
      await page.evaluate(
        () =>
          document.querySelector('[data-testid="library-list"]').dataset
            .loadingMode !== 'more',
      )
    ) {
      await page.click('loc=role:button[name*="图片加载方式"]');
      await page.click('loc=role:option[name="加载更多"]');
      await page.waitForFunction(
        () =>
          document.querySelector('[data-testid="library-list"]').dataset
            .loadingMode === 'more',
      );
      await loaded(size);
    }
    await page.click('loc=role:radio[name="网格"]');
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="library-list"]').dataset
          .layout === 'grid',
    );
    await page.evaluate(
      ({ prefix, search, size }) => {
        const original = window.fetch;
        window.__libraryScale = { original, requests: [] };
        window.fetch = async (input, init) => {
          const url = new URL(String(input), location.href);
          if (
            url.pathname !== '/api/images' ||
            url.searchParams.get('q') !== search
          )
            return original(input, init);
          const response = await original(input, init);
          const result = await response.clone().json();
          const batch = window.__libraryScale.requests.length;
          window.__libraryScale.requests.push({
            url: url.href,
            status: response.status,
            requestedSize: Number(url.searchParams.get('pageSize')),
            count: result.items?.length ?? null,
            total: result.total,
            firstId: result.items?.at(0)?.id,
            lastId: result.items?.at(-1)?.id,
            ordered:
              result.items?.every(
                (item, index) =>
                  item.id ===
                  `${prefix}${String(batch * size + index).padStart(4, '0')}`,
              ) ?? false,
            bytes: new TextEncoder().encode(JSON.stringify(result)).length,
          });
          return response;
        };
      },
      { prefix, search, size },
    );
    await page.click('loc=role:button[name="刷新图库"]');
    await page.waitForFunction(
      () => window.__libraryScale.requests.length === 1,
    );
    await loaded(size);
    const baseline = await sample(1);
    for (let batch = 2; batch <= count / size; batch++) {
      await page.evaluate(() => {
        const main = document.querySelector('main');
        main.scrollTop = main.scrollHeight;
      });
      await page.click('[data-testid="library-load-more"]');
      await loaded(batch * size);
      if (batch % 5 === 0) await sample(batch);
    }
    record.requests = await page.evaluate(() => window.__libraryScale.requests);
    assert.equal(record.requests.length, 30);
    for (const [index, request] of record.requests.entries()) {
      assert.equal(
        request.status,
        200,
        `Batch ${index + 1} must be a real successful read`,
      );
      assert.equal(request.requestedSize, size);
      assert.equal(request.count, size);
      assert.equal(request.total, count);
      assert.equal(
        request.ordered,
        true,
        `Batch ${index + 1} must continue exact fixture order without missing or duplicate IDs`,
      );
    }
    assert.equal(
      await page.evaluate(
        () => !!document.querySelector('[data-testid="library-load-more"]'),
      ),
      false,
    );
    const last = record.samples.at(-1);
    record.heapGrowthBytes = last.heapUsedBytes - baseline.heapUsedBytes;
    record.heapGrowthBytesPerAdditionalImage =
      record.heapGrowthBytes / (count - size);
    record.domNodeGrowth = last.totalDomNodes - baseline.totalDomNodes;
    record.loadedCache = {
      pages: 30,
      lightweightRecords: count,
      thumbnails: 0,
    };

    // Cross the boundary of the initially mounted window using real keyboard events.
    await page.evaluate(() => {
      document.querySelector('main').scrollTop = 0;
    });
    await settled();
    const boundary = await page.evaluate((count) => {
      const positions = [
        ...document.querySelectorAll(
          '[data-testid="library-gallery"] [aria-posinset]',
        ),
      ]
        .map((node) => Number(node.getAttribute('aria-posinset')) - 1)
        .filter((index) => index < count - 1);
      return Math.max(...positions);
    }, count);
    assert.ok(boundary >= 0 && boundary < count - 4);
    const id = (index) => `${prefix}${String(index).padStart(4, '0')}`;
    assert.equal(
      await page.evaluate(
        (id) => !!document.querySelector(`[data-image-id="${id}"]`),
        id(boundary + 1),
      ),
      false,
      'Next keyboard target initially lies outside the mounted window',
    );
    await page.focus(
      `[data-image-id="${id(boundary)}"] button[aria-label^="查看图片"]`,
    );
    for (let offset = 1; offset <= 3; offset++) {
      await page.keyboard.press('Tab');
      await page.waitForFunction(
        (expected) =>
          document.activeElement?.closest('[data-image-id]')?.dataset
            .imageId === expected,
        id(boundary + offset),
      );
      assert.equal(
        await page.evaluate(() => document.activeElement?.getAttribute('type')),
        'checkbox',
      );
      await page.keyboard.press('Tab');
      assert.match(
        await page.evaluate(() =>
          document.activeElement?.getAttribute('aria-label'),
        ),
        /^查看图片/,
      );
      assert.equal(
        await page.evaluate(
          () =>
            document.activeElement?.closest('[data-image-id]')?.dataset.imageId,
        ),
        id(boundary + offset),
      );
      record.keyboard.push({
        direction: 'Tab checkbox/detail',
        id: id(boundary + offset),
      });
    }
    for (let offset = 2; offset >= 0; offset--) {
      await page.keyboard.press('Shift+Tab');
      assert.equal(
        await page.evaluate(() => document.activeElement?.getAttribute('type')),
        'checkbox',
      );
      await page.keyboard.press('Shift+Tab');
      await page.waitForFunction(
        (expected) =>
          document.activeElement?.closest('[data-image-id]')?.dataset
            .imageId === expected,
        id(boundary + offset),
      );
      record.keyboard.push({
        direction: 'Shift+Tab',
        id: id(boundary + offset),
      });
    }
    assert.ok(
      await page.evaluate(
        () =>
          document.querySelectorAll('[data-testid="library-card"]').length <=
          85,
      ),
    );
    await page.waitForFunction(() => {
      const card = document.activeElement?.closest(
        '[data-testid="library-card"]',
      );
      return (
        card && getComputedStyle(card).boxShadow.includes('0px 0px 0px 2px')
      );
    });
    record.focusRing = await page.evaluate(
      () =>
        getComputedStyle(
          document.activeElement.closest('[data-testid="library-card"]'),
        ).boxShadow,
    );
    await page.screenshot({
      path: join(config.output, 'library-query-scale-2400.png'),
    });
    report.screenshots?.push('library-query-scale-2400.png');
    await verifyLargeLibrarySelection({ page, config, report, count, prefix });
    record.status = 'passed';
    report.checks.push(
      '2,400 real SQLite images load in 30 exact 80-item requests; sampled virtual DOM stays bounded; post-GC heap growth is recorded without an invented limit; Tab/Shift+Tab cross the virtual-window boundary in item order.',
    );
  } catch (error) {
    record.error = String(error.stack ?? error);
    throw error;
  } finally {
    await page.evaluate(() => {
      if (window.__libraryScale) {
        window.fetch = window.__libraryScale.original;
        delete window.__libraryScale;
      }
    });
    await sql(`DELETE FROM media_images WHERE id GLOB '${prefix}*'`);
  }
}
