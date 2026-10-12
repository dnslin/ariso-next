/* global taskSpace, config */
const { default: assert } = await import('node:assert/strict');
const { writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { identitySql } = await import(config.identitySessionScript);
const { runAlbumImagePicker } = await import(
  new URL('./album-image-picker.mjs', config.libraryDetailScript).href
);
const { checkShortcutLayouts } = await import(
  new URL('./collection-shortcut-layouts.mjs', config.libraryDetailScript).href
);
const task = await taskSpace(config.spaceId);
const page = task.page(config.pageLabel ?? 'p1');
const sql = (statement) => identitySql(config, statement);
const report = {
  status: 'failed',
  checks: [],
  layouts: [],
  limitations: [
    'Chromium emulation, not physical mobile hardware. Real local uploads are exercised; remote S3 transport is unchanged and not retested by this suite.',
  ],
};
const button = (name) => `loc=role:button[name="${name}"]`;
const item = '[data-testid="upload-item"]';
const source = join(
  config.projectDirectory,
  'tests/fixtures/runtime/images/sample.png',
);
const request = async (url, init) => {
  const response = await page.fetch(url, init);
  return { status: response.status, body: JSON.parse(response.body) };
};
let restoreDefault;
const { identifier: fetchScript } = await page.cdp(
  'Page.addScriptToEvaluateOnNewDocument',
  {
    source:
      'window.__shortcutOriginal = window.fetch.bind(window); window.__shortcutFetch = window.__shortcutOriginal; window.fetch = (...args) => window.__shortcutFetch(...args);',
  },
);
async function queued(count) {
  await page.waitForFunction(
    (count) =>
      document.querySelectorAll(
        '[data-testid="upload-item"][data-state="queued"]',
      ).length === count,
    count,
  );
}
async function chooseFiles(count = 1) {
  await page.setInputFiles(
    'input[aria-label="选择图片文件"]',
    Array.from({ length: count }, () => source),
  );
  await queued(count);
}
async function settled() {
  await page.waitForFunction(
    () => !document.querySelector('[data-entering],[data-exiting]'),
  );
}
async function openAlbumUpload(albumId, returnTo) {
  await page.click(button('添加图片'));
  await page.click('loc=role:menuitem[name="上传新图片"]');
  await page.waitForSelector('input[aria-label="选择图片文件"]', {
    state: 'attached',
  });
  const url = new URL(await page.url());
  assert.equal(url.pathname, '/upload');
  assert.equal(url.searchParams.get('albumId'), albumId);
  assert.equal(url.searchParams.get('returnTo'), returnTo);
  assert.equal(
    await page.evaluate(
      () => !!document.querySelector('[data-testid="quick-upload"]'),
    ),
    false,
  );
  await settled();
}
async function ready(count) {
  await page.waitForFunction(
    (count) =>
      document.querySelectorAll(
        '[data-testid="upload-item"][data-state="ready"]',
      ).length === count,
    count,
    { timeout: 60000 },
  );
}
async function uploadLayouts(name) {
  for (const theme of ['light', 'dark']) {
    await page.cdp('Emulation.setEmulatedMedia', {
      features: [
        { name: 'prefers-color-scheme', value: theme },
        { name: 'prefers-reduced-motion', value: 'reduce' },
      ],
    });
    for (const width of [360, 390, 430, 768, 1440]) {
      const height = width === 1440 ? 900 : 844;
      await page.cdp('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: width < 768,
      });
      await page.waitForFunction(
        ({ width, height, theme }) =>
          innerWidth === width &&
          innerHeight === height &&
          document.documentElement.classList.contains(theme),
        { width, height, theme },
      );
      await settled();
      const layout = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        clipped: [...document.querySelectorAll('main button,footer button')]
          .filter(
            (node) =>
              node.clientWidth && node.scrollWidth > node.clientWidth + 2,
          )
          .map((node) => node.textContent),
        footer: document.querySelector('footer')?.getBoundingClientRect()
          .bottom,
      }));
      assert.equal(
        layout.overflow,
        false,
        `${name}/${theme}/${width}: page overflow`,
      );
      assert.deepEqual(
        layout.clipped,
        [],
        `${name}/${theme}/${width}: button text fits`,
      );
      if (layout.footer) assert.ok(layout.footer <= height + 1);
      if ([390, 1440].includes(width))
        await page.screenshot({
          path: join(config.output, `${name}-${theme}-${width}.png`),
        });
      report.layouts.push({ name, theme, width, height, ...layout });
    }
  }
  await page.cdp('Emulation.setEmulatedMedia', {
    features: [
      { name: 'prefers-color-scheme', value: 'light' },
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ],
  });
  await page.cdp('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
}
try {
  await page.goto(`${config.origin}/api/health`);
  assert.equal(
    (
      await request('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(config.credentials),
      })
    ).status,
    200,
  );
  await page.cdp('Emulation.setEmulatedMedia', {
    features: [
      { name: 'prefers-color-scheme', value: 'light' },
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ],
  });
  await page.cdp('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  if (
    config.shortcutPhase !== 'picker' &&
    config.shortcutPhase !== 'regressions'
  ) {
    report.stage = 'full-page drafts and real upload';
    await page.goto(`${config.origin}/upload`);
    await page.waitForSelector('input[aria-label="选择图片文件"]', {
      state: 'attached',
    });
    const settings = (await request('/upload/settings')).body;
    assert.ok(
      settings.storages.find(
        (storage) => storage.id === settings.defaultStorageId,
      )?.enabled,
    );
    await chooseFiles(2);
    await uploadLayouts('full-upload-queued');
    await page.click('a[href="/library"]');
    await page.waitForSelector('[data-testid="library-toolbar"]');
    assert.equal(
      await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            '[data-testid="library-toolbar"] button',
          ),
        ].some((node) => node.textContent.trim() === '上传'),
      ),
      false,
    );
    await page.click('a[href="/upload"]');
    await queued(2);

    restoreDefault = settings.defaultStorageId;
    await sql('UPDATE storage_settings SET default_storage_id=NULL');
    await page.click('a[href="/albums"]');
    await page.waitForSelector(button('新建相册'));
    await page.click('a[href="/upload"]');
    await page.waitForFunction(() =>
      document
        .querySelector('[data-testid="upload-settings"]')
        ?.textContent.includes('默认存储缺失或已停用'),
    );
    assert.equal(
      await page.evaluate(
        () =>
          [...document.querySelectorAll('button')].find(
            (node) => node.textContent.trim() === '开始上传',
          ).disabled,
      ),
      true,
    );
    await queued(2);
    await uploadLayouts('full-upload-no-default');
    await sql(
      `UPDATE storage_settings SET default_storage_id='${settings.defaultStorageId}'`,
    );
    restoreDefault = undefined;
    await page.click('a[href="/albums"]');
    await page.waitForSelector(button('新建相册'));
    await page.click('a[href="/upload"]');
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('button')].find(
          (node) => node.textContent.trim() === '开始上传',
        )?.disabled === false,
    );

    await page.evaluate(() => {
      const original = window.__shortcutOriginal;
      window.__shortcutFetch = async (input, init) => {
        const response = await original(input, init);
        if (
          new URL(String(input), location.href).pathname ===
            '/api/uploads/submissions' &&
          init?.method === 'POST'
        ) {
          window.__shortcutHeldMetadata = JSON.parse(init.body);
          await new Promise((resolve) => {
            window.__shortcutRelease = resolve;
          });
          window.__shortcutFetch = original;
        }
        return response;
      };
    });
    await page.click(button('开始上传'));
    report.stage = 'held real submission';
    await page.waitForFunction(() => !!window.__shortcutRelease);
    const nextVisibility =
      settings.defaultVisibility === 'public' ? 'private' : 'public';
    await page.click('loc=role:button[name*="可见性"]');
    await page.click(
      `loc=role:option[name="${nextVisibility === 'private' ? '私有' : '公开'}"]`,
    );
    await page.click('a[href="/albums"]');
    await page.waitForSelector(button('新建相册'));
    await page.click('a[href="/upload"]');
    await page.evaluate(() => window.__shortcutRelease());
    await ready(2);
    report.stage = 'ready standalone thumbnails';
    const imageIds = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '[data-testid="upload-item"][data-state="ready"]',
        ),
      ].map((node) => node.dataset.imageId),
    );
    assert.equal(new Set(imageIds).size, 2);
    const savedVisibility = await sql(
      `SELECT visibility FROM media_images WHERE id IN (${imageIds.map((id) => `'${id}'`).join(',')})`,
    );
    assert.equal(savedVisibility.length, 2);
    assert.ok(
      savedVisibility.every(
        (image) => image.visibility === settings.defaultVisibility,
      ),
    );
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('[data-testid="upload-item"] img')]
          .length === 2 &&
        [...document.querySelectorAll('[data-testid="upload-item"] img')].every(
          (image) => image.complete && image.naturalWidth > 0,
        ),
    );
    await uploadLayouts('full-upload-ready');
    await page.click(button('清空已完成'));
    await chooseFiles();
    report.checks.push(
      'Standalone queued files and settings survive owner navigation; no default storage is silently substituted; submitted settings remain frozen while the next draft changes. Two real native uploads finish with distinct images and authenticated thumbnails.',
    );

    const created = await request('/api/albums', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '完整上传验证相册', description: '' }),
    });
    assert.equal(created.status, 201);
    const albumId = created.body.album.id;
    await page.click('a[href="/albums"]');
    await page.waitForSelector(`a[href="/albums/${albumId}"]`);
    await page.click(`a[href="/albums/${albumId}"]`);
    await page.waitForSelector(button('添加图片'));
    await page.waitForSelector('[data-testid="library-empty"]');
    const sourcePath = new URL(await page.url());
    const returnTo = sourcePath.pathname + sourcePath.search;
    const header = await page.evaluate(() => {
      const title = document
        .querySelector('#library-title')
        .getBoundingClientRect();
      const back = document
        .querySelector('a[aria-label="返回相册列表"]')
        .getBoundingClientRect();
      const actions = document.querySelector(
        '[role="toolbar"][aria-label="相册操作"]',
      );
      return {
        title: { top: title.top, bottom: title.bottom },
        back: { top: back.top, bottom: back.bottom },
        buttons: [...actions.querySelectorAll('button')].map((node) => ({
          label: node.getAttribute('aria-label') || node.textContent.trim(),
          width: node.getBoundingClientRect().width,
          height: node.getBoundingClientRect().height,
        })),
      };
    });
    assert.ok(
      header.back.top < header.title.bottom &&
        header.back.bottom > header.title.top,
    );
    for (const label of ['编辑相册', '设置封面', '分享设置', '更多相册操作']) {
      const action = header.buttons.find((entry) => entry.label === label);
      assert.ok(
        action &&
          action.width >= 44 &&
          action.width <= 45 &&
          action.height >= 44,
      );
    }
    await openAlbumUpload(albumId, returnTo);
    await queued(0);
    assert.ok(
      await page.evaluate(
        (albumId) =>
          !!document.querySelector(
            `[data-testid="upload-albums"] [data-relation-id="${albumId}"]`,
          ),
        albumId,
      ),
    );
    await chooseFiles();
    await page.evaluate(() => {
      const original = window.__shortcutOriginal;
      window.__shortcutFetch = async (input, init) => {
        if (
          new URL(String(input), location.href).pathname ===
            '/api/uploads/submissions' &&
          init?.method === 'POST'
        ) {
          window.__shortcutFetch = original;
          return Response.json(
            { message: '验证：本次上传被拒绝' },
            { status: 422 },
          );
        }
        return original(input, init);
      };
    });
    await page.click(button('开始上传'));
    await page.waitForSelector(`${item}[data-state="upload-failed"]`);
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelectorAll(
            '[data-testid="upload-item"] img[src^="blob:"]',
          ).length,
      ),
      1,
    );
    await uploadLayouts('album-full-upload-failed');
    await page.click('a[aria-label="返回相册"]');
    await page.waitForSelector(button('添加图片'));
    await openAlbumUpload(albumId, returnTo);
    await page.waitForSelector(`${item}[data-state="upload-failed"]`);
    await page.evaluate(() => {
      const original = window.__shortcutOriginal;
      delete window.__shortcutRelease;
      window.__shortcutFetch = async (input, init) => {
        const response = await original(input, init);
        if (
          new URL(String(input), location.href).pathname ===
            '/api/uploads/submissions' &&
          init?.method === 'POST'
        ) {
          window.__shortcutRetryMetadata = JSON.parse(init.body);
          await new Promise((resolve) => {
            window.__shortcutRelease = resolve;
          });
          window.__shortcutFetch = original;
        }
        return response;
      };
    });
    await page.click(button('重试上传'));
    await page.waitForFunction(() => !!window.__shortcutRelease);
    assert.deepEqual(
      await page.evaluate(() => window.__shortcutRetryMetadata.albumIds),
      [albumId],
    );
    await page.click('a[href="/albums"]');
    await page.waitForSelector(`[data-testid="album-${albumId}"]`);
    assert.ok(
      await page.evaluate(
        (id) =>
          document
            .querySelector(`[data-testid="album-${id}"]`)
            .textContent.includes('0 张图片'),
        albumId,
      ),
    );
    await page.evaluate(() => window.__shortcutRelease());
    await page.waitForFunction(
      (id) => {
        const card = document.querySelector(`[data-testid="album-${id}"]`);
        const cover = card?.querySelector('img');
        return (
          card?.textContent.includes('1 张图片') &&
          cover?.complete &&
          cover.naturalWidth > 0
        );
      },
      albumId,
      { timeout: 60000 },
    );
    const saved = (await request(`/api/albums/${albumId}`)).body.album;
    assert.equal(saved.imageCount, 1);
    assert.equal(
      await page.evaluate(
        (id) =>
          document
            .querySelector(`[data-testid="album-cover-${id}"] img`)
            ?.getAttribute('src'),
        albumId,
      ),
      saved.cover.thumbnailUrl,
    );

    const card = `[data-testid="album-${albumId}"]`;
    await page.focus(card);
    const point = await page.evaluate((selector) => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }, card);
    await page.cdp('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      button: 'right',
      buttons: 2,
      clickCount: 1,
      ...point,
    });
    await page.cdp('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      button: 'right',
      buttons: 0,
      clickCount: 1,
      ...point,
    });
    await page.waitForSelector('[role="menu"][aria-label="相册操作"]');
    assert.deepEqual(
      await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            '[role="menu"][aria-label="相册操作"] [role="menuitem"]',
          ),
        ].map((node) => node.textContent.trim()),
      ),
      ['打开相册', '编辑相册', '分享设置', '删除相册'],
    );
    await page.keyboard.press('Escape');
    await page.waitForFunction(
      (id) => document.activeElement?.dataset.testid === `album-${id}`,
      albumId,
    );
    await page.keyboard.press('Shift+F10');
    await page.waitForSelector('[role="menu"][aria-label="相册操作"]');
    await page.click('loc=role:menuitem[name="编辑相册"]');
    await page.waitForSelector('loc=role:dialog[name="编辑相册"]');
    await page.keyboard.press('Escape');
    await page.click(button('相册操作：完整上传验证相册'));
    await page.click('loc=role:menuitem[name="打开相册"]');
    await page.waitForSelector(button('添加图片'));
    await openAlbumUpload(albumId, returnTo);
    await ready(1);
    assert.ok(
      await page.evaluate(
        (returnTo) =>
          [...document.querySelectorAll('a')].some(
            (node) =>
              node.textContent.trim() === '返回相册' &&
              node.getAttribute('href') === returnTo,
          ),
        returnTo,
      ),
    );
    await page.click('a[aria-label="返回相册"]');
    await page.waitForSelector(button('添加图片'));
    await page.click(button('添加图片'));
    await page.click('loc=role:menuitem[name="从图库选择"]');
    await page.waitForFunction(() => {
      const picker = document.querySelector(
        '[data-testid="album-image-picker"]',
      );
      const images = [...(picker?.querySelectorAll('img') ?? [])];
      return (
        picker?.getAttribute('aria-busy') === 'false' &&
        images.length === 3 &&
        images.every((image) => image.complete && image.naturalWidth > 0)
      );
    });
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelectorAll(
            '[data-testid="album-image-picker"] [data-existing="true"]',
          ).length,
      ),
      1,
    );
    report.layouts.push(
      ...(await checkShortcutLayouts(
        page,
        config.output,
        'album-image-picker-real',
        '[data-testid="album-image-picker"]',
      )),
    );
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-testid="album-image-picker"]', {
      state: 'hidden',
    });
    await page.click('a[href="/upload"]');
    await queued(1);
    await page.click(button('移除'));
    report.checks.push(
      'Album Upload enters the full page with albumId and exact returnTo; the source album is preselected by server data. A rejected upload keeps its bytes and settings, survives navigation, and retries with the frozen album relation.',
      'A real background retry refreshes the current album count and actual cover without reopening or reloading the list. Completed upload provides an explicit return to its original album. The independent standalone draft is untouched.',
      'Album card right click, Shift+F10 and touch overflow expose the same four actions; Escape restores the source, and editing opens the real form. Return is aligned with the title, with four compact 44px actions in the separate toolbar.',
      'The existing picker shows all three real uploaded thumbnails and disables the already-added image.',
    );
    if (!config.shortcutPhase || config.shortcutPhase === 'menus') {
      const { runLibraryShortcuts } = await import(
        new URL('./library-shortcuts.mjs', config.libraryDetailScript).href
      );
      report.menus = await runLibraryShortcuts(page, {
        origin: config.origin,
        output: config.output,
        sql,
      });
    }
  }
  if (!config.shortcutPhase || config.shortcutPhase === 'picker')
    report.picker = await runAlbumImagePicker(page, {
      origin: config.origin,
      output: config.output,
      sql,
    });
  if (!config.shortcutPhase || config.shortcutPhase === 'regressions') {
    const { runCollectionReviewRegressions } = await import(
      new URL('./collection-review-regressions.mjs', config.libraryDetailScript)
        .href
    );
    report.regressions = await runCollectionReviewRegressions(page, {
      origin: config.origin,
      output: config.output,
      source,
    });
  }
  report.status = 'passed';
  delete report.stage;
} catch (error) {
  report.error = String(error.stack ?? error);
  report.snapshot = await page.snapshot();
  await page.screenshot({
    path: join(config.output, 'collection-shortcuts-failure.png'),
  });
  throw error;
} finally {
  await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
    identifier: fetchScript,
  });
  await page.evaluate(() => {
    window.__shortcutRelease?.();
    if (window.__shortcutOriginal) window.fetch = window.__shortcutOriginal;
  });
  if (restoreDefault)
    await sql(
      `UPDATE storage_settings SET default_storage_id='${restoreDefault}'`,
    );
  await writeFile(
    join(config.output, 'collection-shortcuts.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
