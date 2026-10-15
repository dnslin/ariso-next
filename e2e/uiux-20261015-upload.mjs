import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resizeViewport, readGeometry } from './browser-geometry.mjs';

const button = (name) => `loc=role:button[name=${JSON.stringify(name)}]`;
const link = (name) => `loc=role:link[name=${JSON.stringify(name)}]`;
const input = 'input[aria-label="选择图片文件"]';
const item = '[data-testid="upload-item"]';

/** Runs in the authenticated disposable runtime owned by the shared runner. */
export async function runUiux20261015Upload(page, config) {
  const report = { checks: [], layouts: [], imageIds: [], phase: 'setup' };
  const directory = await mkdtemp(join(tmpdir(), 'ariso-uiux-upload-'));
  const output = join(config.output, 'upload');
  await mkdir(output, { recursive: true });
  const files = [];
  for (let index = 0; index < 5; index++) {
    const path = join(directory, `上传评审-${index + 1}.png`);
    await copyFile(
      join(config.projectDirectory, 'tests/fixtures/runtime/images/sample.png'),
      path,
    );
    files.push(path);
  }
  const originalStorage = [];
  const albums = [];
  let width = 1440;
  async function request(path, method = 'GET', body, expected = 200) {
    const response = await page.fetch(path, {
      method,
      ...(body === undefined
        ? {}
        : {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }),
    });
    assert.equal(
      response.status,
      expected,
      `${method} ${path}: ${response.body}`,
    );
    return JSON.parse(response.body);
  }
  async function count(state, expected) {
    await page.waitForFunction(
      ({ state, expected }) =>
        document.querySelectorAll(
          `[data-testid="upload-item"][data-state="${state}"]`,
        ).length === expected,
      { state, expected },
    );
  }
  async function snapshot() {
    return page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="upload-item"]')].map(
        (node) => ({
          id: node.dataset.queueId,
          state: node.dataset.state,
          imageId: node.dataset.imageId,
        }),
      ),
    );
  }
  async function navigate(path) {
    if (width < 1200) {
      await page.click(button('菜单'));
      await page.click(
        `[role="dialog"][aria-label="导航菜单"] a[href="${path}"]`,
      );
    } else await page.click(`.shell-navigation a[href="${path}"]`);
    await page.waitForFunction((path) => location.pathname === path, path);
  }
  async function evidence(name) {
    const geometry = await readGeometry(page);
    assert.equal(
      geometry.overflow,
      false,
      `${name}/${width}: document overflow`,
    );
    assert.equal(
      geometry.mainOverflow,
      false,
      `${name}/${width}: content overflow`,
    );
    const filename = `${name}-${width}.png`;
    await page.screenshot({ path: join(output, filename) });
    report.layouts.push({
      name,
      width,
      screenshot: `upload/${filename}`,
      geometry,
    });
  }
  async function openAlbumUpload(albumId) {
    await navigate('/albums');
    await page.click(`[data-testid="album-${albumId}"]`);
    await page.click(button('添加图片'));
    await page.click('loc=role:menuitem[name="上传新图片"]');
    await page.waitForSelector(input, { state: 'attached' });
    await page.waitForFunction(
      (albumId) =>
        location.pathname === '/upload' &&
        new URL(location.href).searchParams.get('albumId') === albumId,
      albumId,
    );
  }
  async function detailReturn(label) {
    const row = `${item}[data-state="ready"]`;
    const trigger = `loc=css:${row} button:has-text("查看详情") >> nth=0`;
    await page.evaluate(() =>
      document
        .querySelector('[data-testid="upload-item"][data-state="ready"]')
        ?.scrollIntoView({ block: 'center', behavior: 'instant' }),
    );
    const source = await page.evaluate(() => ({
      href: location.pathname + location.search,
      scroll: document.getElementById('main-content').scrollTop,
    }));
    await page.click(trigger);
    await page.waitForSelector('[data-testid="detail-version-entry"]');
    await page.click('[data-testid="detail-version-entry"]');
    await page.waitForSelector('[data-testid="detail-versions"]');
    const queueBeforePaste = await snapshot();
    await page.evaluate(async () => {
      const clipboard = new DataTransfer();
      clipboard.items.add(
        new File(['not-an-upload'], '版本页粘贴.png', { type: 'image/png' }),
      );
      document.body.dispatchEvent(
        new ClipboardEvent('paste', {
          clipboardData: clipboard,
          bubbles: true,
        }),
      );
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    assert.deepEqual(
      await snapshot(),
      queueBeforePaste,
      'Hidden upload input does not capture clipboard images in the version workspace',
    );
    assert.equal(await page.evaluate(() => location.pathname), '/upload');
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector('[data-testid="detail-return"]').textContent,
      ),
      '返回上传',
    );
    await evidence(`${label}-versions`);
    await page.click(button('返回详情'));
    await page.waitForSelector('[data-testid="library-detail"]');
    await page.click(button('关闭图片详情'));
    await page.waitForFunction(
      (href) => location.pathname + location.search === href,
      source.href,
    );
    await page.waitForFunction(
      () => document.activeElement?.textContent === '查看详情',
    );
    assert.ok(
      Math.abs(
        (await page.evaluate(
          () => document.getElementById('main-content').scrollTop,
        )) - source.scroll,
      ) < 3,
      `${label}: restore upload scroll`,
    );
    // The existing detail navigation uses one browser entry for details/versions.
    await page.click(trigger);
    await page.click('[data-testid="detail-version-entry"]');
    await page.waitForSelector('[data-testid="detail-versions"]');
    await page.evaluate(() => history.back());
    await page.waitForFunction(
      (href) => location.pathname + location.search === href,
      source.href,
    );
    await page.waitForFunction(
      () => document.activeElement?.textContent === '查看详情',
    );
    report.checks.push(
      `${label}/${width}: detail → versions → detail → close and browser Back retain the exact upload entry, focus and scroll.`,
    );
  }
  try {
    await page.goto(`${config.origin}/upload`);
    await page.waitForSelector(input, { state: 'attached' });
    originalStorage.push(...(await request('/api/storages')));
    const storage = originalStorage.find(
      (row) => row.enabled && row.type === 'local',
    );
    assert.ok(storage, 'Upload review requires an enabled Local storage');
    for (width of [1440, 390]) {
      report.phase = `storage-recovery-${width}`;
      await resizeViewport(page, width);
      for (const row of originalStorage.filter((row) => row.enabled))
        await request(`/api/storages/${row.id}`, 'PATCH', { enabled: false });
      await page.goto(`${config.origin}/upload`);
      await page.waitForSelector(input, { state: 'attached' });
      await page.setInputFiles(input, files.slice(0, 3));
      await count('queued', 3);
      const selected = await snapshot();
      await page.click(
        'loc=css:[data-testid="upload-settings"] [aria-haspopup="listbox"] >> nth=1',
      );
      await page.click('loc=role:option[name="公开"]');
      await page.click(link('管理存储'));
      await page.waitForSelector(
        '[data-testid="storage-list"][data-state="ready"]',
      );
      await page.waitForFunction(() =>
        document.body.textContent.includes('所有存储均已停用'),
      );
      const storageSource = await page.evaluate(() =>
        new URL(location.href).searchParams.get('uploadReturn'),
      );
      assert.equal(storageSource, '/upload');
      if (originalStorage.length <= 2)
        await page.click(link(`管理${storage.name}`));
      else {
        await page.click(button('返回存储列表'));
        await page.click(
          `[data-storage-id="${storage.id}"] a[aria-label="配置 ${storage.name}"]`,
        );
      }
      await page.waitForSelector('[data-testid="storage-editor"]');
      assert.equal(
        await page.evaluate(() =>
          new URL(location.href).searchParams.get('uploadReturn'),
        ),
        storageSource,
        'Disabled-storage management retains the upload source',
      );
      await page.click(
        '[data-slot="switch-content"]:has(input[aria-label="启用此存储"])',
      );
      await page.click('[data-testid="storage-save"]');
      await page.waitForFunction(
        async (id) =>
          (await (await fetch(`/api/storages/${id}`)).json()).enabled,
        storage.id,
      );
      await page.waitForFunction(
        () => !document.querySelector('[data-testid="storage-save"]').disabled,
      );
      await page.click(
        '[data-testid="storage-editor"] header button:has-text("返回")',
      );
      await page.click(link('返回上传'));
      await page.waitForSelector(input, { state: 'attached' });
      await count('queued', 3);
      assert.deepEqual(
        await snapshot(),
        selected,
        'Storage management preserves the exact queue',
      );
      await page.waitForFunction(() =>
        document.body.textContent.includes('请选择用于本次上传的存储'),
      );
      assert.equal(
        await page.evaluate(
          () =>
            [...document.querySelectorAll('button')].find(
              (node) => node.textContent === '开始上传',
            ).disabled,
        ),
        true,
      );
      assert.equal(
        await page.evaluate(() =>
          [
            ...document.querySelectorAll(
              '[data-testid="upload-settings"] [aria-haspopup="listbox"]',
            ),
          ][1].textContent.includes('公开'),
        ),
        true,
      );
      await evidence('storage-return-unselected');
      await page.click(
        'loc=css:[data-testid="upload-settings"] [aria-haspopup="listbox"] >> nth=0',
      );
      await page.click(`loc=role:option[name=${JSON.stringify(storage.name)}]`);
      await page.click(button('开始上传'));
      await count('ready', 3);
      report.imageIds.push(...(await snapshot()).map((row) => row.imageId));
      assert.ok(
        await page.evaluate(() =>
          document
            .querySelector('[data-testid="upload-frozen-submission"]')
            .textContent.includes(
              '本次上传沿用开始时的设置，所有上传合计最多同时传输 3 张',
            ),
        ),
      );
      report.checks.push(
        `R07/R12/${width}: disabled storage → actual configuration save → original queue and public draft; no automatic selection; explicit selection and real Local upload complete.`,
      );
      await detailReturn('normal-upload');

      report.phase = `entry-isolation-${width}`;
      const created = await request(
        '/api/albums',
        'POST',
        { name: `上传评审 ${width} ${Date.now()}`, description: '' },
        201,
      );
      albums.push(created.album.id);
      await openAlbumUpload(created.album.id);
      await page.setInputFiles(input, files.slice(3));
      await count('queued', 2);
      const otherQueued = await snapshot();
      await navigate('/upload');
      await page.waitForSelector(input, { state: 'attached' });
      await count('ready', 3);
      await page.setInputFiles(input, files);
      await count('queued', 5);
      await page.click(button('队列操作'));
      await evidence('remove-queued-menu');
      await page.click('loc=role:menuitem[name="移除待上传（5）"]');
      await count('queued', 0);
      await count('ready', 3);
      assert.equal(
        await page.evaluate(
          () =>
            !!document.querySelector(
              '[role="alertdialog"]:not([data-slot="toast"])',
            ),
        ),
        false,
        'Unsubmitted local removal needs no confirmation',
      );
      await page.waitForSelector(
        '[data-slot="toast-title"]:has-text("已移除 5 张待上传图片")',
      );
      await openAlbumUpload(created.album.id);
      await count('queued', 2);
      assert.deepEqual(
        await snapshot(),
        otherQueued,
        'Other album draft survives bulk removal',
      );
      // Album drafts deliberately do not inherit another entry's explicit storage.
      await page.click(
        'loc=css:[data-testid="upload-settings"] [aria-haspopup="listbox"] >> nth=0',
      );
      await page.click(`loc=role:option[name=${JSON.stringify(storage.name)}]`);
      await page.click(button('开始上传'));
      await count('ready', 2);
      report.imageIds.push(...(await snapshot()).map((row) => row.imageId));
      await detailReturn('album-upload');
      report.checks.push(
        `R09/${width}: removes five current-entry queued files, retains three completed records and two files in the other album entry; other entry uploads still succeed.`,
      );
      await navigate('/upload');
      await page.click(button('清空已完成'));
      await page.waitForFunction(
        () => !document.querySelector('[data-testid="upload-item"]'),
      );
      for (const row of originalStorage.filter(
        (row) => row.enabled && row.id !== storage.id,
      ))
        await request(`/api/storages/${row.id}`, 'PATCH', { enabled: true });
    }
    report.phase = 'complete';
    return report;
  } catch (error) {
    error.message = `${report.phase}: ${error.message}`;
    throw error;
  } finally {
    for (const row of originalStorage)
      await request(`/api/storages/${row.id}`, 'PATCH', {
        enabled: row.enabled,
      });
    for (const id of albums) await request(`/api/albums/${id}`, 'DELETE');
    await rm(directory, { recursive: true, force: true });
  }
}
