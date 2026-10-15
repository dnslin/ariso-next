import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { activateLibraryAction } from './library-action-controls.mjs';

const button = (name) => `loc=role:button[name="${name}"]`;

export async function runUiux20261015Collections(page, config) {
  const prefix = `界面复核${randomUUID().slice(0, 8)}`;
  const report = { status: 'passed', checks: [], screenshots: [] };
  const tags = [];
  const albums = [];
  const images = [];
  const request = async (path, method = 'GET', body, expected = 200) => {
    const response = await page.fetch(path, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    assert.equal(
      response.status,
      expected,
      `${method} ${path}: ${response.body}`,
    );
    return JSON.parse(response.body);
  };
  const viewport = async (width, height = 900) => {
    await page.cdp('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 768,
    });
    await page.waitForFunction((width) => innerWidth === width, width);
  };
  const screenshot = async (name) => {
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({ path: join(config.output, name) });
    report.screenshots.push(name);
  };
  const visibleFilters = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-trash-filter]')]
        .filter((node) => node.getClientRects().length)
        .map((node) => node.dataset.trashFilter),
    );
  const libraryReady = () =>
    page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="library-gallery"]')
          ?.getAttribute('aria-busy') === 'false' &&
        document.querySelectorAll('[data-testid="library-card"]').length === 2,
    );
  try {
    for (let index = 0; index < 21; index++) {
      const result = await request(
        '/api/tags',
        'POST',
        { name: `${prefix}旅行${index}` },
        201,
      );
      tags.push(result.tag.id);
    }
    for (const width of [1440, 390]) {
      await viewport(width);
      await page.goto(`${config.origin}/dashboard`);
      if (width < 768) await page.click(button('菜单'));
      await page.click('loc=role:link[name="标签"]');
      await page.waitForSelector('input[aria-label="搜索标签名称"]');
      const before = await page.evaluate(() => history.length);
      await page.fill('input[aria-label="搜索标签名称"]', `${prefix}旅`);
      await page.fill('input[aria-label="搜索标签名称"]', `${prefix}旅行`);
      await page.waitForFunction(
        (q) => new URLSearchParams(location.search).get('q') === q,
        `${prefix}旅行`,
      );
      assert.equal(await page.evaluate(() => history.length), before);
      // Use the actual browser IME composition path, then commit the same Chinese text.
      await page.focus('input[aria-label="搜索标签名称"]');
      await page.cdp('Input.imeSetComposition', {
        text: '中',
        selectionStart: 1,
        selectionEnd: 1,
      });
      await page.cdp('Input.insertText', { text: '中' });
      await page.waitForFunction(() =>
        document
          .querySelector('input[aria-label="搜索标签名称"]')
          .value.endsWith('中'),
      );
      await page.fill('input[aria-label="搜索标签名称"]', `${prefix}旅行`);
      await page.waitForFunction(
        (q) => new URLSearchParams(location.search).get('q') === q,
        `${prefix}旅行`,
      );
      await page.evaluate(() => history.back());
      await page.waitForFunction(() => location.pathname === '/dashboard');
      await page.goto(
        `${config.origin}/tags?q=${encodeURIComponent(prefix)}&pageSize=20`,
      );
      await page.waitForFunction(() =>
        [...document.querySelectorAll('button')].some(
          (node) => node.textContent.trim() === '下一页' && !node.disabled,
        ),
      );
      const first = await page.url();
      await page.click(button('下一页'));
      await page.waitForFunction(
        () => new URLSearchParams(location.search).get('page') === '2',
      );
      await page.evaluate(() => history.back());
      await page.waitForURL(first);
      await page.fill('input[aria-label="搜索标签名称"]', '');
      await page.waitForFunction(
        () => !new URLSearchParams(location.search).has('q'),
      );
      await screenshot(`uiux-r01-tags-${width}.png`);
    }
    report.checks.push(
      'R01: search and Chinese IME input replace history; clearing resets page; pagination remains reversible, desktop/mobile.',
    );

    const settings = await request('/upload/settings');
    assert.ok(settings.defaultStorageId);
    await viewport(390, 844);
    await page.goto(`${config.origin}/trash`);
    await page.waitForSelector('[data-testid="trash-filters"]');
    assert.deepEqual(await visibleFilters(), []);
    await page.click(button('添加条件'));
    await page.click('loc=role:menuitem[name="处理状态"]');
    assert.deepEqual(await visibleFilters(), ['status']);
    await page.click('[data-trash-filter="status"] button[aria-haspopup]');
    await page.click('loc=role:option[name="已就绪"]');
    await page.waitForFunction(
      () => new URLSearchParams(location.search).get('status') === 'ready',
    );
    await page.click(button('移除处理状态条件'));
    await page.waitForFunction(
      () => !new URLSearchParams(location.search).has('status'),
    );
    assert.deepEqual(await visibleFilters(), []);
    await page.waitForFunction(
      () => document.activeElement?.textContent.trim() === '添加条件',
    );
    assert.equal(
      await page.evaluate(() => document.activeElement?.textContent.trim()),
      '添加条件',
    );
    await screenshot('uiux-r06-trash-default-390.png');
    await page.goto(
      `${config.origin}/trash?storageId=${encodeURIComponent(settings.defaultStorageId)}&deletionStatus=none`,
    );
    await page.waitForSelector('[data-testid="trash-filters"]');
    assert.deepEqual(await visibleFilters(), ['storageId', 'deletionStatus']);
    await screenshot('uiux-r06-trash-source-390.png');
    for (const width of [430, 768, 1440]) {
      await viewport(width, width === 430 ? 640 : 900);
      if (width >= 768)
        assert.deepEqual(await visibleFilters(), [
          'storageId',
          'status',
          'deletionStatus',
        ]);
      await screenshot(`uiux-r06-trash-source-${width}.png`);
    }
    report.checks.push(
      'R06: mobile begins with no unused fields, adds/removes a condition and returns focus; source conditions stay visible; 768/1440 preserve three fields.',
    );

    for (let index = 0; index < 2; index++) {
      const { album } = await request(
        '/api/albums',
        'POST',
        { name: `${prefix}同名相册`, description: '' },
        201,
      );
      albums.push(album);
    }
    await page.goto(`${config.origin}/upload`);
    await page.waitForSelector('input[aria-label="选择图片文件"]', {
      state: 'attached',
    });
    const source = join(
      config.projectDirectory,
      'tests/fixtures/media-formats/source.png',
    );
    await page.setInputFiles('input[aria-label="选择图片文件"]', [
      source,
      source,
    ]);
    await page.waitForFunction(
      () =>
        document.querySelectorAll(
          '[data-testid="upload-item"][data-state="queued"]',
        ).length === 2,
    );
    await page.click(button('开始上传'));
    await page.waitForFunction(
      () =>
        document.querySelectorAll(
          '[data-testid="upload-item"][data-state="ready"]',
        ).length === 2,
      undefined,
      { timeout: 60000 },
    );
    images.push(
      ...(await page.evaluate(() =>
        [...document.querySelectorAll('[data-testid="upload-item"]')].map(
          (node) => node.dataset.imageId,
        ),
      )),
    );
    for (const [index, id] of images.entries())
      await request(`/api/images/${id}`, 'PATCH', {
        displayName: `${prefix}图片${index}`,
      });
    for (const width of [1440, 390]) {
      await viewport(width);
      await page.goto(
        `${config.origin}/library?q=${encodeURIComponent(prefix)}`,
      );
      await libraryReady();
      for (let index = 0; index < 2; index++) {
        await page.hover(button(`查看图片：${prefix}图片${index}`));
        await page.click(
          `label:has(input[aria-label="选择图片：${prefix}图片${index}"])`,
        );
      }
      await activateLibraryAction(page, '添加到相册', 2);
      await page.fill('input[aria-label="搜索目标相册"]', prefix);
      for (const album of albums) {
        await page.waitForSelector(`[data-target-id="${album.id}"]`);
        await page.click(`[data-target-id="${album.id}"] label`);
      }
      await page.evaluate(() => {
        window.__uiuxCollectionsFetch = window.fetch;
        let intercepted = false;
        window.fetch = async (input, init) => {
          if (
            !intercepted &&
            new URL(String(input), location.href).pathname ===
              '/api/images/batch' &&
            init?.method === 'POST'
          ) {
            const body = JSON.parse(init.body);
            if (body.mode === 'apply') {
              intercepted = true;
              // Submit one real image, inject a known failure for the other without writing it.
              const response = await window.__uiuxCollectionsFetch(input, {
                ...init,
                body: JSON.stringify({ ...body, ids: body.ids.slice(0, 1) }),
              });
              const result = await response.json();
              return Response.json({
                results: [
                  ...result.results,
                  {
                    id: body.ids[1],
                    status: 'failed',
                    inQuery: true,
                    message: '浏览器验证：本项未写入，可重试',
                  },
                ],
              });
            }
          }
          return window.__uiuxCollectionsFetch(input, init);
        };
      });
      await page.click('[data-testid="batch-submit"]');
      await page.waitForSelector('[data-testid="batch-target-summary"]');
      const text = await page.evaluate(
        () =>
          document.querySelector('[data-testid="batch-target-summary"]')
            .textContent,
      );
      for (const album of albums)
        assert.ok(text.includes(`${album.name} · ${album.id.slice(0, 8)}`));
      await page.click(button('查看目标相册完整编号'));
      for (const album of albums)
        await page.waitForFunction(
          (id) =>
            [...document.querySelectorAll('[data-slot="accordion-body"]')].some(
              (node) =>
                node.textContent.includes(id) && node.getClientRects().length,
            ),
          album.id,
        );
      await screenshot(`uiux-r08-batch-targets-${width}.png`);
      await page.click('[data-testid="batch-retained"]');
      await page.click('[data-testid="batch-retry"]');
      await page.waitForSelector('[data-testid="library-batch"]', {
        state: 'hidden',
      });
      await page.evaluate(() => {
        window.fetch = window.__uiuxCollectionsFetch;
        delete window.__uiuxCollectionsFetch;
      });
      for (const id of images)
        await request(`/api/images/${id}/collections`, 'PATCH', {
          albumIds: [],
        });
    }
    report.checks.push(
      'R08: real uploads and selected same-name albums retain names/short IDs in partial failure; full IDs expand; failed-only retry closes with existing success behavior on desktop/mobile. Unknown/check target retention is additionally covered by controller tests.',
    );
    return report;
  } finally {
    await page.evaluate(() => {
      if (window.__uiuxCollectionsFetch) {
        window.fetch = window.__uiuxCollectionsFetch;
        delete window.__uiuxCollectionsFetch;
      }
    });
    for (const id of tags) await request(`/api/tags/${id}`, 'DELETE');
    for (const album of albums)
      await request(`/api/albums/${album.id}`, 'DELETE');
    for (const id of images) {
      await request(`/api/images/${id}/trash`, 'POST');
      const response = await page.fetch(`/api/images/${id}`, {
        method: 'DELETE',
      });
      assert.ok([200, 202].includes(response.status), response.body);
      await page.waitForFunction(
        async (id) => {
          const response = await fetch(`/api/images/${id}/cleanup`);
          return response.ok && (await response.json()).status === 'succeeded';
        },
        id,
        { timeout: 30000 },
      );
    }
  }
}
