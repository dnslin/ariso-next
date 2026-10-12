import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { activateLibraryAction } from './library-action-controls.mjs';

export async function runCollectionReviewRegressions(
  page,
  { origin, output, source },
) {
  const prefix = `review279-${randomUUID().slice(0, 8)}`;
  const button = (name) => `loc=role:button[name="${name}"]`;
  const checks = [];
  const screenshots = [];
  const request = async (url, method = 'GET', body, status = 200) => {
    const response = await page.fetch(url, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    assert.equal(response.status, status, `${method} ${url}: ${response.body}`);
    return JSON.parse(response.body);
  };
  const settings = await request('/upload/settings');
  const storageA = settings.defaultStorageId;
  assert.ok(storageA);
  const storageB = await request(
    '/api/storages',
    'POST',
    { type: 'local', name: prefix, localPath: prefix, enabled: true },
    201,
  );
  const { album } = await request(
    '/api/albums',
    'POST',
    { name: prefix, description: '' },
    201,
  );
  const menu = '[role="menu"][aria-label="已选图片操作"]';
  const selected = (count) =>
    page.waitForSelector(button(`管理选择，已选 ${count} 张`));
  async function choose(index) {
    const name = `${prefix}-${index}`;
    await page.hover(button(`查看图片：${name}`));
    await page.click(`label:has(input[aria-label="选择图片：${name}"])`);
  }
  async function assertRemoveAvailable(count) {
    await selected(count);
    await page.click(button('更多图片操作'));
    await page.waitForSelector(menu);
    assert.ok(
      await page.evaluate(
        (menu) =>
          [...document.querySelectorAll(`${menu} [role="menuitem"]`)].some(
            (node) => node.textContent.trim() === '从相册移除',
          ),
        menu,
      ),
      'Confirmed album membership keeps the remove action available',
    );
    await page.keyboard.press('Escape');
    await page.waitForSelector(menu, { state: 'hidden' });
  }
  try {
    await page.goto(`${origin}/upload?albumId=${album.id}`);
    await page.waitForSelector('input[aria-label="选择图片文件"]', {
      state: 'attached',
    });
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
    await page.evaluate(() => {
      const original = window.__shortcutOriginal;
      window.__reviewOriginal = original;
      window.__reviewSubmissions = [];
      let failFirst = true;
      window.__shortcutFetch = async (input, init) => {
        const path = new URL(String(input), location.href).pathname;
        if (failFirst && path.endsWith('/begin') && init?.method === 'POST') {
          failFirst = false;
          // Settle a real accepted session as failed before its first file send.
          const failed = await original(path.slice(0, -6), {
            method: 'DELETE',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ reason: 'transfer-failed' }),
          });
          if (!failed.ok)
            throw new Error('Unable to fail the test upload session');
        }
        const response = await original(input, init);
        if (path === '/api/uploads/submissions' && init?.method === 'POST') {
          const result = await response.clone().json();
          window.__reviewSubmissions.push({
            input: JSON.parse(init.body),
            storageId: result.storageId,
          });
        }
        return response;
      };
    });
    await page.click(button('开始上传'));
    await page.waitForSelector(
      '[data-testid="upload-item"][data-state="upload-failed"]',
    );
    await request('/api/settings/storage', 'PATCH', {
      defaultStorageId: storageB.id,
    });
    await page.click(button('重试上传'));
    await page.waitForFunction(
      () =>
        document.querySelectorAll(
          '[data-testid="upload-item"][data-state="ready"]',
        ).length === 2,
      undefined,
      { timeout: 60000 },
    );
    const submissions = await page.evaluate(() => window.__reviewSubmissions);
    assert.equal(submissions.length, 2);
    assert.equal(submissions[0].input.storageId, undefined);
    assert.equal(submissions[0].storageId, storageA);
    assert.equal(submissions[1].input.storageId, storageA);
    assert.equal(submissions[1].storageId, storageA);
    await page.evaluate(() => {
      window.__shortcutFetch = window.__reviewOriginal;
    });
    await request('/api/settings/storage', 'PATCH', {
      defaultStorageId: storageA,
    });
    checks.push(
      'A confirmed failed upload retries to storage A after the site default changes to B; both real uploads finish in A.',
    );

    const imageIds = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="upload-item"]')].map(
        (node) => node.dataset.imageId,
      ),
    );
    for (const [index, id] of imageIds.entries()) {
      await request(`/api/images/${id}`, 'PATCH', {
        displayName: `${prefix}-${index}`,
      });
      await request(`/api/images/${id}/collections`, 'PATCH', { albumIds: [] });
    }
    await page.goto(`${origin}/library?q=${prefix}&pageSize=20`);
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="library-list"]')?.dataset
          .loadedCount === '2',
    );
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector('[data-testid="library-list"]').dataset
            .loadingMode,
      ),
      'more',
    );
    await choose(0);
    await selected(1);
    await activateLibraryAction(page, '添加到相册', 1);
    await page.waitForSelector('input[aria-label="搜索目标相册"]');
    await page.fill('input[aria-label="搜索目标相册"]', prefix);
    await page.waitForSelector(`[data-target-id="${album.id}"]`);
    await page.click(`[data-target-id="${album.id}"] label`);
    await page.click('[data-testid="batch-submit"]');
    await page.waitForSelector('[data-testid="library-batch"]', {
      state: 'hidden',
    });
    await assertRemoveAvailable(1);
    await page.click(button('管理选择，已选 1 张'));
    await page.waitForSelector('[data-testid="library-selected-panel"]');
    const selectAll = await page.evaluate(() =>
      document
        .querySelector(
          '[data-testid="library-selected-panel"] button[aria-label^="全选"]',
        )
        .getAttribute('aria-label'),
    );
    await page.click(button(selectAll));
    await page.keyboard.press('Escape');
    await assertRemoveAvailable(2);
    await activateLibraryAction(page, '清空全部选择', 2);
    await choose(0);
    await assertRemoveAvailable(1);
    checks.push(
      'Adding an album in load-more mode keeps removal available after select-all and clear/reselect, without reloading the list.',
    );

    await page.goto(`${origin}/albums/${album.id}`);
    await page.waitForSelector(button('添加图片'));
    await page.waitForSelector('[data-testid="library-card"]');
    await page.evaluate((albumId) => {
      const original = window.__shortcutOriginal;
      window.__reviewOriginal = original;
      window.__reviewFailAlbum = true;
      window.__shortcutFetch = (input, init) => {
        if (
          window.__reviewFailAlbum &&
          new URL(String(input), location.href).pathname ===
            `/api/albums/${albumId}` &&
          (!init?.method || init.method === 'GET')
        )
          return Promise.resolve(
            Response.json(
              { message: '回归验证：相册详情刷新失败' },
              { status: 500 },
            ),
          );
        return original(input, init);
      };
      window.__reviewGalleryNode = document.querySelector(
        '[data-testid="library-gallery"]',
      );
    }, album.id);
    await page.evaluate((albumId) => {
      window.dispatchEvent(
        new CustomEvent('ariso:upload-albums-changed', {
          detail: { albumIds: [albumId] },
        }),
      );
    }, album.id);
    await page.waitForSelector('[data-testid="albums-error"]');
    assert.ok(
      await page.evaluate(() =>
        document
          .querySelector('[data-testid="albums-error"]')
          .textContent.includes('相册刷新失败'),
      ),
    );
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector('[data-testid="library-gallery"]') ===
          window.__reviewGalleryNode,
      ),
      true,
    );
    for (const theme of ['light', 'dark']) {
      await page.cdp('Emulation.setEmulatedMedia', {
        features: [
          { name: 'prefers-color-scheme', value: theme },
          { name: 'prefers-reduced-motion', value: 'reduce' },
        ],
      });
      for (const width of [390, 1440]) {
        await page.cdp('Emulation.setDeviceMetricsOverride', {
          width,
          height: 900,
          deviceScaleFactor: 1,
          mobile: width < 768,
        });
        await page.waitForFunction(
          ({ width, theme }) =>
            innerWidth === width &&
            document.documentElement.classList.contains(theme),
          { width, theme },
        );
        const layout = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > innerWidth,
          retryHeight: [
            ...document.querySelectorAll('[data-testid="albums-error"] button'),
          ][0].getBoundingClientRect().height,
        }));
        assert.equal(layout.overflow, false);
        assert.ok(layout.retryHeight >= 44);
        const file = `review279-album-error-${theme}-${width}.png`;
        await page.screenshot({ path: join(output, file) });
        screenshots.push(file);
      }
    }
    await page.evaluate(() => {
      window.__reviewFailAlbum = false;
    });
    await page.click(button('重试加载'));
    await page.waitForSelector('[data-testid="albums-error"]', {
      state: 'hidden',
    });
    await page.waitForSelector(button('添加图片'));
    checks.push(
      'A failed album-detail background refresh keeps the gallery mounted and shows a retryable error in desktop/mobile and light/dark; retry reads the real detail and clears the error.',
    );
    for (const id of imageIds) {
      await request(`/api/images/${id}/trash`, 'POST');
      const removal = await page.fetch(`/api/images/${id}`, {
        method: 'DELETE',
      });
      assert.ok([200, 202].includes(removal.status), removal.body);
      await page.waitForFunction(
        async (id) => {
          const response = await fetch(`/api/images/${id}/cleanup`);
          return response.ok && (await response.json()).status === 'succeeded';
        },
        id,
        { timeout: 30000 },
      );
    }
    await request(`/api/albums/${album.id}`, 'DELETE');
    await request(`/api/storages/${storageB.id}`, 'DELETE');
    return { status: 'passed', checks, screenshots };
  } finally {
    await page.evaluate(() => {
      if (window.__reviewOriginal)
        window.__shortcutFetch = window.__reviewOriginal;
    });
    await request('/api/settings/storage', 'PATCH', {
      defaultStorageId: storageA,
    });
  }
}
