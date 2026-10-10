import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  setDetail171Theme,
  setDetail171Viewport,
} from './library-detail-171-helpers.mjs';

export async function verifyDetail171Consumers({ page, config, sql, report }) {
  const button = (name) => `loc=role:button[name="${name}"]`;
  const resize = async (width, theme) => {
    await setDetail171Theme(page, theme);
    await setDetail171Viewport(page, width);
  };
  const expectedNavigation = [
    ['总览', '/dashboard'],
    ['上传', '/upload'],
    ['图库', '/library'],
    ['相册', '/albums'],
    ['标签', '/tags'],
    ['分享管理', '/shares'],
    ['回收站', '/trash'],
    ['访问统计', '/analytics'],
    ['存储管理', '/settings/storage'],
    ['站点设置', '/settings/general'],
  ];
  let branding;
  const screenshot = async (state, width, theme, current) => {
    const shell = await page.evaluate(() => ({
      shells: document.querySelectorAll('.admin-shell').length,
      mains: document.querySelectorAll('#main-content').length,
      overflow: document.documentElement.scrollWidth > innerWidth,
      brand: [...document.querySelectorAll('a.shell-brand')].map((node) =>
        node.textContent.trim(),
      ),
      account: document
        .querySelector('.shell-navigation button[aria-label="账号菜单"]')
        .textContent.trim(),
      navigation: [
        ...document.querySelectorAll('.shell-navigation nav .shell-nav-link'),
      ].map((node) => [
        node.querySelector('.shell-nav-label').textContent.trim(),
        node.getAttribute('href'),
      ]),
      current: [
        ...document.querySelectorAll(
          '.shell-navigation nav [aria-current="page"]',
        ),
      ].map((node) => node.getAttribute('href')),
      headerHeight: document
        .querySelector('.shell-mobile-header')
        .getBoundingClientRect().height,
    }));
    assert.equal(shell.shells, 1);
    assert.equal(shell.mains, 1);
    assert.equal(shell.overflow, false);
    assert.deepEqual(shell.navigation, expectedNavigation);
    assert.deepEqual(shell.current, [current]);
    const identity = { brand: shell.brand, account: shell.account };
    branding ??= identity;
    assert.deepEqual(identity, branding);
    if (width === 390) assert.equal(shell.headerHeight, 64);
    await page.screenshot({
      path: join(
        config.output,
        `detail-171-consumer-${state}-${theme}-${width}.png`,
      ),
    });
    report.layouts.push({
      state: `detail-171-consumer-${state}`,
      width,
      theme,
      ...shell,
    });
  };

  await resize(1440, 'light');
  await page.goto(`${config.origin}/upload`);
  await page.waitForSelector('input[aria-label="选择图片文件"]', {
    state: 'attached',
  });
  await page.setInputFiles('input[aria-label="选择图片文件"]', [
    join(config.projectDirectory, 'tests/fixtures/runtime/images/sample.png'),
  ]);
  await page.waitForSelector(
    '[data-testid="upload-item"][data-state="queued"]',
  );
  await page.click(button('开始上传'));
  await page.waitForSelector(
    '[data-testid="upload-item"][data-state="ready"]',
    {
      timeout: 30000,
    },
  );
  const queue = await page.evaluate(() => {
    const item = document.querySelector('[data-testid="upload-item"]');
    window.__detail171ConsumerDocument = crypto.randomUUID();
    return {
      queueId: item.dataset.queueId,
      imageId: item.dataset.imageId,
      document: window.__detail171ConsumerDocument,
    };
  });
  assert.ok(queue.imageId);
  const [uploaded] = await sql(
    `SELECT display_name,processing_status FROM media_images WHERE id='${queue.imageId}'`,
  );
  assert.equal(uploaded.processing_status, 'ready');
  const uploadRow = `[data-testid="upload-item"][data-queue-id="${queue.queueId}"]`;
  for (const theme of ['light', 'dark']) {
    for (const width of [1440, 390]) {
      await resize(width, theme);
      await screenshot('upload-ready', width, theme, '/upload');
      await page.click(`${uploadRow} button:text-is("查看详情")`);
      await page.waitForSelector('[data-testid="detail-body"]');
      await page.click('loc=role:tab[name="缩略图"]');
      await page.click('[data-testid="detail-version-entry"]');
      await page.waitForSelector('[data-testid="detail-versions"]');
      const location = new URL(await page.url());
      assert.equal(location.pathname, '/library');
      assert.equal(location.searchParams.get('image'), queue.imageId);
      assert.equal(location.searchParams.get('detailView'), 'versions');
      assert.equal(location.searchParams.get('preview'), 'thumbnail');
      assert.ok(
        await page.evaluate(() =>
          document
            .querySelector('[data-testid="detail-versions"]')
            .textContent.includes('当前预览缩略图'),
        ),
      );
      await screenshot('upload-versions', width, theme, '/library');
      await page.evaluate(() => history.back());
      await page.waitForURL(`${config.origin}/upload`);
      await page.waitForSelector(`${uploadRow}[data-state="ready"]`);
      assert.deepEqual(
        await page.evaluate(
          (selector) => ({
            imageId: document.querySelector(selector).dataset.imageId,
            document: window.__detail171ConsumerDocument,
          }),
          uploadRow,
        ),
        { imageId: queue.imageId, document: queue.document },
        'Client version navigation and browser Back preserve the actual ready queue',
      );
      if (
        await page.evaluate(
          () => !!document.querySelector('[data-testid="library-detail"]'),
        )
      ) {
        await page.click(button('关闭图片详情'));
        await page.waitForSelector('[data-testid="library-detail"]', {
          state: 'hidden',
        });
      }
    }
  }
  report.checks.push(
    `Manual File upload runs the real receiver and worker to ready (${queue.imageId}); upload detail selects thumbnail and routes to version information with that selection. Browser Back at desktop/phone in both themes preserves the same document, queue ID, image ID and ready state.`,
  );

  const created = await page.fetch('/api/albums', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: '详情公共消费验证',
      description: 'Issue 171 disposable browser fixture',
    }),
  });
  assert.equal(created.status, 201);
  const album = JSON.parse(created.body).album;
  const albumPath = `/albums/${encodeURIComponent(album.id)}`;
  try {
    const membership = await page.fetch(
      `/api/images/${queue.imageId}/collections`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ albumIds: [album.id] }),
      },
    );
    assert.equal(membership.status, 200);
    assert.deepEqual(JSON.parse(membership.body).albums, [
      { id: album.id, name: album.name },
    ]);
    const source = button(`查看图片：${uploaded.display_name}`);
    const card = `[data-image-id="${queue.imageId}"]`;
    for (const theme of ['light', 'dark']) {
      for (const width of [1440, 390]) {
        await resize(width, theme);
        await page.goto(`${config.origin}${albumPath}`);
        await page.waitForSelector(card);
        await page.hover(source);
        await page.click(
          `label:has(input[aria-label="选择图片：${uploaded.display_name}"])`,
        );
        await page.waitForSelector(`${card}[data-selected="true"]`);
        await screenshot('album-selected', width, theme, '/albums');
        await page.focus(source);
        const scroll = await page.evaluate(
          () => document.querySelector('main').scrollTop,
        );
        await page.keyboard.press('Enter');
        await page.waitForSelector('[data-testid="detail-body"]');
        await page.click('loc=role:tab[name="缩略图"]');
        await page.click('[data-testid="detail-version-entry"]');
        await page.waitForSelector('[data-testid="detail-versions"]');
        const location = new URL(await page.url());
        assert.equal(location.pathname, albumPath);
        assert.equal(location.searchParams.get('image'), queue.imageId);
        assert.equal(location.searchParams.get('preview'), 'thumbnail');
        await screenshot('album-versions', width, theme, '/albums');
        await page.click(button('返回详情'));
        await page.waitForSelector('[data-testid="detail-body"]');
        assert.ok(
          await page.evaluate(() =>
            [...document.querySelectorAll('[data-testid="detail-preview"]')]
              .find((node) => node.getClientRects().length)
              ?.src.includes('type=thumbnail'),
          ),
        );
        await page.click(button('关闭图片详情'));
        await page.waitForFunction(
          () => !new URL(location.href).searchParams.has('image'),
        );
        assert.equal(await page.url(), `${config.origin}${albumPath}`);
        await page.waitForSelector(`${card}[data-selected="true"]`);
        await page.waitForFunction(
          (name) =>
            document.activeElement?.getAttribute('aria-label') ===
            `查看图片：${name}`,
          uploaded.display_name,
        );
        assert.ok(
          Math.abs(
            (await page.evaluate(
              () => document.querySelector('main').scrollTop,
            )) - scroll,
          ) <= 1,
        );
        assert.equal(
          await page.evaluate(() =>
            document
              .querySelector('[data-testid="library-selection"] button')
              .getAttribute('aria-label'),
          ),
          '操作已选 1 张图片',
        );
      }
    }
    report.checks.push(
      `Real album POST and final-set collections PATCH place the uploaded image in ${album.id}; keyboard card → detail → versions → detail → close preserves album route, selected thumbnail, one selected image, source scroll and trigger focus on desktop/phone in both themes. Shared shell brand, account, ten navigation entries and current route remain consistent.`,
    );
  } finally {
    const removed = await page.fetch(`/api/albums/${album.id}`, {
      method: 'DELETE',
    });
    assert.equal(
      removed.status,
      200,
      'Only this newly created disposable album is removed',
    );
  }
  // Accepted upload media remains in the runner's disposable DATA_DIR.
  await page.goto(`${config.origin}/library`);
  await page.waitForSelector('[data-testid="library-list"]');
}
