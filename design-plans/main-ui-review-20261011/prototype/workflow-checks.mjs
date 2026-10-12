import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const origin = 'http://127.0.0.1:61510';
const outputRoot = fileURLToPath(
  new URL(
    '../../../.data/main-ui-review-20261011/quick-workflow/',
    import.meta.url,
  ),
);
const sampleFile = fileURLToPath(
  new URL('../../issue179-review-v2/public/sample-photo.jpg', import.meta.url),
);
const sampleName = basename(sampleFile);
const selectors = {
  upload: '[data-testid="quick-upload"]',
  picker: '[data-testid="album-picker"]',
  batch: '[data-testid="batch-dialog"]',
  actions: '[role="menu"][aria-label="已选图片操作"]',
  context: '[role="menu"][aria-label="图片快捷操作"]',
};
const button = (name, scope = '') =>
  `css:${scope ? `${scope} ` : ''}button:text-is("${name}")`;
const card = (id, scope = 'main') => `${scope} article[data-photo-id="${id}"]`;

export async function runWorkflowChecks(task, options = {}) {
  const page = task.page('p1');
  const workflows = [];
  const layouts = [];
  const names = options.names ? new Set(options.names) : null;
  const output = resolve(outputRoot, options.outputSuffix ?? '');
  await mkdir(output, { recursive: true });

  async function viewport(width = 1440, height = 900) {
    await page.cdp('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
  }

  async function goto(route, scenario = 'sample') {
    const url = new URL(route, origin);
    url.searchParams.set('frame', '1');
    url.searchParams.set('scenario', scenario);
    await page.goto(url.href);
    await page.waitForSelector('css:main h1');
    await page.waitForFunction(() =>
      [...document.querySelectorAll('main img')].every(
        (image) => image.complete && image.naturalWidth > 0,
      ),
    );
  }

  async function visibleText(selector) {
    return page.evaluate(
      (value) => document.querySelector(value)?.textContent?.trim() ?? '',
      selector,
    );
  }

  async function count(selector) {
    return page.evaluate(
      (value) => document.querySelectorAll(value).length,
      selector,
    );
  }

  async function waitGone(selector) {
    await page.waitForFunction(
      (value) => !document.querySelector(value),
      selector,
      { timeout: 10000 },
    );
  }

  async function settleOverlays() {
    await page.waitForFunction(
      () => !document.querySelector('[data-entering], [data-exiting]'),
      undefined,
      { timeout: 10000 },
    );
  }

  async function waitText(selector, text) {
    await page.waitForFunction(
      ({ selector: value, text: expected }) =>
        document.querySelector(value)?.textContent?.includes(expected),
      { selector, text },
      { timeout: 10000 },
    );
  }

  async function selectPhoto(id, scope = 'main') {
    await page.click(`css:${card(id, scope)} [data-slot="checkbox"]`);
  }

  async function menu(compact = false, id = 'forest') {
    if (compact) {
      await page.click(`css:${card(id)} > button`, {
        button: 'right',
        label: 'open image context menu',
      });
    } else {
      await page.click('css:button[aria-label="已选图片操作"]');
    }
    const selector = compact ? selectors.context : selectors.actions;
    await page.waitForSelector(`css:${selector}`);
    await settleOverlays();
    return page.evaluate(
      (value) =>
        [...document.querySelectorAll(`${value} [role="menuitem"]`)].map(
          (item) => item.textContent.trim(),
        ),
      selector,
    );
  }

  async function chooseAction(name) {
    await page.click(
      `css:[role="menu"][aria-label="已选图片操作"] [role="menuitem"]:text-is("${name}")`,
    );
    await page.waitForSelector(`css:${selectors.batch}`);
    await settleOverlays();
  }

  async function openPicker() {
    await page.click('css:button[aria-label="添加图片"]');
    await page.waitForSelector('css:[role="menu"][aria-label="添加图片方式"]');
    await page.click(
      'css:[role="menu"][aria-label="添加图片方式"] [role="menuitem"]:text-is("从图库选择")',
    );
    await page.waitForSelector(`css:${selectors.picker}`);
    await settleOverlays();
  }

  async function openUpload(fromAlbum = false) {
    if (fromAlbum) {
      await page.click('css:button[aria-label="添加图片"]');
      await page.waitForSelector(
        'css:[role="menu"][aria-label="添加图片方式"]',
      );
      await page.click(
        'css:[role="menu"][aria-label="添加图片方式"] [role="menuitem"]:text-is("上传新图片")',
      );
    } else {
      await page.click(button('上传', 'main header'));
    }
    await page.waitForSelector(`css:${selectors.upload}`);
    await settleOverlays();
  }

  async function expandSettings() {
    const expanded = await page.evaluate(() =>
      document
        .querySelector('button[aria-label="上传设置"]')
        ?.getAttribute('aria-expanded'),
    );
    if (expanded !== 'true')
      await page.click('css:button[aria-label="上传设置"]');
    await page.waitForSelector('css:[data-testid="quick-upload-settings"]');
  }

  async function uploadSetting(index, name) {
    await page.click(
      `css:[data-testid="quick-upload-settings"] .select__trigger >> nth=${index}`,
    );
    await page.waitForSelector('css:[role="listbox"]');
    await page.click(`css:[role="option"]:text-is("${name}")`);
    await waitGone('[role="listbox"]');
  }

  async function addFile() {
    await page.setInputFiles(
      'css:input[type="file"][aria-label="上传图片文件"]',
      [sampleFile],
    );
    await waitText(`${selectors.upload} [aria-label="待上传图片"]`, sampleName);
  }

  async function startUpload() {
    await page.click(button('开始上传 1 张', selectors.upload));
    await page.waitForSelector(`css:${selectors.upload} [data-upload-job]`);
  }

  async function nav(route) {
    await page.click(`css:aside[aria-label="后台侧栏"] a[href="${route}"]`);
    await page.waitForFunction(
      (value) => window.location.pathname === value,
      route,
    );
    await page.waitForFunction(
      (value) => document.querySelector('main h1')?.textContent === value,
      route === '/albums' ? '相册' : '图库',
    );
  }

  async function albumCard(name) {
    await page.click(`css:main button:has-text("${name}")`);
    await page.waitForFunction(
      (value) => document.querySelector('main h1')?.textContent === value,
      name,
    );
  }

  async function expectAlbumCard(name, total) {
    const text = await page.evaluate((value) => {
      const node = [...document.querySelectorAll('main button')].find((item) =>
        [...item.querySelectorAll('span')].some(
          (span) => span.textContent.trim() === value,
        ),
      );
      return node?.textContent ?? '';
    }, name);
    assert.ok(text.includes(`${total} 张图片`), `${name}: ${text}`);
  }

  async function expectPhotoCount(total) {
    assert.equal(await count('main article[data-photo-id]'), total);
    assert.match(
      await visibleText('#prototype-footer'),
      new RegExp(`共 ${total} 张图片`),
    );
  }

  async function expectUploaded(countExpected = 1) {
    await page.waitForFunction(
      (name) =>
        [...document.querySelectorAll('main article[data-photo-id]')].some(
          (item) => item.textContent.includes(name),
        ),
      sampleName,
      { timeout: 10000 },
    );
    const matching = await page.evaluate(
      (name) =>
        [...document.querySelectorAll('main article[data-photo-id]')].filter(
          (item) => item.textContent.includes(name),
        ).length,
      sampleName,
    );
    assert.equal(
      matching,
      countExpected,
      'Uploaded local image must not duplicate',
    );
  }

  async function capture(name) {
    await settleOverlays();
    await page.screenshot({ path: resolve(output, `${name}.png`) });
    return `${name}.png`;
  }

  async function workflow(name, action) {
    if (names && !names.has(name)) return;
    try {
      await viewport();
      const details = await action();
      const errors = await page.evaluate(() => window.__prototypeErrors ?? []);
      assert.deepEqual(errors, [], 'Unexpected browser error');
      workflows.push({
        name,
        passed: true,
        details,
        screenshot: await capture(name),
      });
    } catch (error) {
      const result = {
        name,
        passed: false,
        error: error.stack ?? String(error),
      };
      try {
        result.screenshot = await capture(`${name}-failed`);
        await writeFile(
          resolve(output, `${name}-failed-snapshot.json`),
          JSON.stringify(await page.snapshot({ scope: 'full_page' }), null, 2),
        );
      } catch (evidenceError) {
        result.evidenceError = String(evidenceError);
      }
      workflows.push(result);
    }
    await writeFile(
      resolve(output, 'workflows.json'),
      JSON.stringify(workflows, null, 2),
    );
  }

  await workflow('01-selection-menu-conditions', async () => {
    await goto('/library');
    assert.equal(await count('button[aria-label="已选图片操作"]'), 0);
    await selectPhoto('forest');
    const publicItems = await menu();
    assert.ok(!publicItems.includes('设为公开'));
    assert.ok(publicItems.includes('设为私有'));
    await page.keyboard.press('Escape');
    await page.click('css:button[aria-label="取消选择"]');
    await selectPhoto('forest-2');
    const privateItems = await menu();
    assert.ok(privateItems.includes('设为公开'));
    assert.ok(!privateItems.includes('设为私有'));
    assert.ok(!privateItems.includes('从相册移出'));
    await page.keyboard.press('Escape');
    await selectPhoto('forest');
    const mixedItems = await menu();
    assert.ok(mixedItems.includes('设为公开'));
    assert.ok(mixedItems.includes('设为私有'));
    assert.ok(mixedItems.includes('从相册移出'));
    return { publicItems, privateItems, mixedItems };
  });

  await workflow('02-compact-context-menu', async () => {
    await goto('/library');
    const items = await menu(true, 'forest');
    assert.ok(items.includes('查看图片'));
    assert.ok(items.includes('复制链接'));
    assert.ok(!items.includes('添加标签'));
    assert.ok(!items.includes('移除标签'));
    assert.ok(!items.includes('重新处理'));
    assert.ok(!items.includes('设为公开'));
    await page.keyboard.press('Escape');
    await page.click('css:button[aria-label="取消选择"]');
    const ungrouped = await menu(true, 'forest-2');
    assert.ok(!ungrouped.includes('从相册移出'));
    assert.ok(!ungrouped.includes('设为私有'));
    return { items, ungrouped };
  });

  await workflow('03-mixed-visibility-changes-only-needed-images', async () => {
    await goto('/library');
    await selectPhoto('forest');
    await selectPhoto('forest-2');
    await menu();
    await chooseAction('设为公开');
    assert.ok(
      (await visibleText(selectors.batch)).includes('将 1 张私有图片设为公开'),
    );
    await page.click(button('确认', selectors.batch));
    await waitGone(selectors.batch);
    await waitText('.prototype-toast', '已将 1 张图片设为公开');
    assert.ok((await visibleText(card('forest'))).includes('公开'));
    assert.ok((await visibleText(card('forest-2'))).includes('公开'));
    assert.ok(
      (await visibleText('[data-testid="collection-selection"]')).includes(
        '已选 2 张',
      ),
    );
    assert.ok(!(await menu()).includes('设为公开'));
    return { changed: 1, selected: 2 };
  });

  await workflow('04-empty-album-picker-and-route-continuity', async () => {
    await goto('/albums/empty');
    await expectPhotoCount(0);
    assert.equal(await count('button[aria-label="添加图片"]'), 1);
    await openPicker();
    await selectPhoto('forest-2', selectors.picker);
    await page.fill(
      'css:[data-testid="album-picker"] [data-slot="search-field-input"]',
      '湖',
    );
    assert.ok(
      (await visibleText(`${selectors.picker} [role="status"]`)).includes(
        '已选 1 张',
      ),
    );
    await page.fill(
      'css:[data-testid="album-picker"] [data-slot="search-field-input"]',
      '',
    );
    await page.click(button('添加 1 张', selectors.picker));
    await waitGone(selectors.picker);
    await expectPhotoCount(1);
    await nav('/albums');
    await expectAlbumCard('待整理', 1);
    await nav('/library');
    await expectPhotoCount(4);
    assert.ok((await visibleText(card('forest-2'))).includes('1'));
    await nav('/albums');
    await albumCard('待整理');
    await expectPhotoCount(1);
    await openPicker();
    assert.equal(
      await page.evaluate(
        (selector) => document.querySelector(selector)?.disabled,
        `${selectors.picker} [aria-label="已添加 森林小路.jpg"]`,
      ),
      true,
    );
    await page.click(button('取消', selectors.picker));
    return { albumImages: 1, libraryImages: 4, existingMemberDisabled: true };
  });

  await workflow('05-album-local-upload-auto-membership', async () => {
    await goto('/albums/empty');
    await openUpload(true);
    const initial = await visibleText(selectors.upload);
    assert.ok(initial.includes('待整理'));
    assert.ok(initial.includes('默认本地存储'));
    assert.ok(initial.includes('私有'));
    await addFile();
    await startUpload();
    await waitText(
      `${selectors.upload} [data-upload-job]`,
      '待整理 · 默认本地存储 · 私有',
    );
    await page.click('css:button[aria-label="收起上传窗口"]');
    await waitGone(selectors.upload);
    await expectUploaded();
    await expectPhotoCount(1);
    await nav('/library');
    await expectUploaded();
    await expectPhotoCount(5);
    await nav('/albums');
    await expectAlbumCard('待整理', 1);
    await albumCard('待整理');
    await expectUploaded();
    return { albumImages: 1, libraryImages: 5, automaticMembership: true };
  });

  await workflow(
    '06-background-upload-freezes-original-destination',
    async () => {
      await goto('/albums/forest');
      await openUpload(true);
      await addFile();
      await startUpload();
      await expandSettings();
      await uploadSetting(0, '图片归档');
      await uploadSetting(1, '公开');
      const frozen = await visibleText(`${selectors.upload} [data-upload-job]`);
      assert.ok(frozen.includes('林间日记 · 默认本地存储 · 私有'), frozen);
      await page.click('css:button[aria-label="收起上传窗口"]');
      await page.click(button('返回', 'main'));
      await albumCard('待整理');
      await openUpload(true);
      assert.ok((await visibleText(selectors.upload)).includes('待整理'));
      await page.click('css:button[aria-label="收起上传窗口"]');
      await waitGone(selectors.upload);
      await expectPhotoCount(0);
      await nav('/albums');
      await page.waitForFunction(() =>
        [...document.querySelectorAll('main button')].some(
          (item) =>
            item.textContent.includes('林间日记') &&
            item.textContent.includes('3 张图片'),
        ),
      );
      await expectAlbumCard('林间日记', 3);
      await expectAlbumCard('待整理', 0);
      await albumCard('林间日记');
      await expectUploaded();
      const uploaded = await page.evaluate(
        (name) =>
          [...document.querySelectorAll('main article[data-photo-id]')].find(
            (item) => item.textContent.includes(name),
          )?.textContent ?? '',
        sampleName,
      );
      assert.ok(uploaded.includes('私有'), uploaded);
      return { frozen, originalAlbumImages: 3, laterAlbumImages: 0 };
    },
  );

  await workflow(
    '07-library-upload-changed-album-keeps-job-visible',
    async () => {
      await goto('/library');
      await openUpload();
      await expandSettings();
      await uploadSetting(2, '待整理');
      await addFile();
      await startUpload();
      await waitText(`${selectors.upload} [data-upload-job]`, '待整理');
      await page.waitForSelector(
        `css:${selectors.upload} [data-upload-job="done"]`,
        { timeout: 10000 },
      );
      await page.click('css:button[aria-label="收起上传窗口"]');
      await expectUploaded();
      await nav('/albums');
      await expectAlbumCard('待整理', 1);
      return { changedAlbumJobVisible: true, albumImages: 1 };
    },
  );

  await workflow(
    '08-unavailable-default-upload-failure-and-retry',
    async () => {
      await goto('/library', 'attention');
      await openUpload();
      await addFile();
      assert.ok(
        (await visibleText(selectors.upload)).includes('默认存储不可用'),
      );
      const disabled = await page.evaluate(
        (selector) =>
          [...document.querySelectorAll(`${selector} button`)].find((item) =>
            item.textContent.includes('开始上传'),
          )?.disabled,
        selectors.upload,
      );
      assert.equal(disabled, true);
      await expandSettings();
      await uploadSetting(0, '图片归档');
      assert.ok(
        !(await visibleText(selectors.upload)).includes('默认存储不可用，请'),
      );
      await startUpload();
      await page.waitForSelector(
        `css:${selectors.upload} [data-upload-job="failed"]`,
        { timeout: 10000 },
      );
      const failed = await visibleText(
        `${selectors.upload} [data-upload-job="failed"]`,
      );
      assert.ok(failed.includes(sampleName));
      assert.ok(failed.includes('图片归档 · 私有'));
      assert.ok(failed.includes('本次设置已保留'));
      await capture('08-upload-failed-preserved');
      await page.click('css:button[aria-label="重试上传"]');
      await page.waitForSelector(
        `css:${selectors.upload} [data-upload-job="done"]`,
        { timeout: 10000 },
      );
      assert.equal(await count(`${selectors.upload} [data-upload-job]`), 1);
      await page.click('css:button[aria-label="收起上传窗口"]');
      await expectUploaded();
      await expectPhotoCount(5);
      return { failed, retriedJobs: 1, uploadedCopies: 1 };
    },
  );

  await workflow('09-picker-failure-retains-search-and-selection', async () => {
    await goto('/albums/empty', 'attention');
    await openPicker();
    await page.fill(
      'css:[data-testid="album-picker"] [data-slot="search-field-input"]',
      '森林',
    );
    await selectPhoto('forest-2', selectors.picker);
    await page.click(button('添加 1 张', selectors.picker));
    await waitText(`${selectors.picker} [role="alert"]`, '已保留选择');
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector(
            '[data-testid="album-picker"] [data-slot="search-field-input"]',
          )?.value,
      ),
      '森林',
    );
    assert.ok(
      (await visibleText(`${selectors.picker} [role="status"]`)).includes(
        '已选 1 张',
      ),
    );
    assert.equal(await count('main article[data-photo-id]'), 0);
    await capture('09-picker-failed-preserved');
    await page.click(button('添加 1 张', selectors.picker));
    await waitGone(selectors.picker);
    await expectPhotoCount(1);
    return { searchRetained: true, selectionRetained: true, addedCopies: 1 };
  });

  await workflow('10-batch-failure-retains-selection', async () => {
    await goto('/library', 'attention');
    await selectPhoto('forest');
    await menu();
    await chooseAction('设为私有');
    await page.click(button('确认', selectors.batch));
    await waitText(`${selectors.batch} [role="alert"]`, '已保留选择');
    assert.ok((await visibleText(selectors.batch)).includes('已选 1 张图片'));
    assert.ok((await visibleText(card('forest'))).includes('公开'));
    await capture('10-batch-failed-preserved');
    await page.click(button('重试', selectors.batch));
    await waitGone(selectors.batch);
    assert.ok((await visibleText(card('forest'))).includes('私有'));
    assert.ok(
      (await visibleText('[data-testid="collection-selection"]')).includes(
        '已选 1 张',
      ),
    );
    assert.ok(!(await menu()).includes('设为私有'));
    return { selectionRetained: true, changedImages: 1 };
  });

  await workflow('11-library-remove-only-chosen-album', async () => {
    await goto('/library');
    await selectPhoto('mountain');
    await menu();
    await chooseAction('从相册移出');
    await page.click(
      'css:[data-testid="batch-dialog"] [data-slot="checkbox"]:has-text("林间日记")',
    );
    await page.click(button('确认', selectors.batch));
    await waitGone(selectors.batch);
    await expectPhotoCount(4);
    await nav('/albums');
    await expectAlbumCard('林间日记', 1);
    await expectAlbumCard('山与湖', 2);
    return { unrelatedMembershipRetained: true, libraryImages: 4 };
  });

  await workflow('12-album-remove-preserves-library-image', async () => {
    await goto('/albums/forest');
    await selectPhoto('mountain');
    await menu();
    await chooseAction('从相册移出');
    assert.ok(
      (await visibleText(selectors.batch)).includes('从“林间日记”移出'),
    );
    assert.equal(await count(`${selectors.batch} input`), 0);
    await page.click(button('确认', selectors.batch));
    await waitGone(selectors.batch);
    await expectPhotoCount(1);
    await nav('/library');
    await expectPhotoCount(4);
    assert.equal(await count(card('mountain')), 1);
    return { currentAlbumImages: 1, libraryImages: 4 };
  });

  await workflow('13-upload-draft-restores-and-isolates-albums', async () => {
    await goto('/albums/forest');
    await openUpload(true);
    await expandSettings();
    await uploadSetting(0, '图片归档');
    await uploadSetting(1, '公开');
    await addFile();
    await page.click('css:button[aria-label="收起上传窗口"]');
    await waitGone(selectors.upload);
    await openUpload(true);
    const restored = await visibleText(selectors.upload);
    assert.ok(restored.includes(sampleName), restored);
    assert.ok(restored.includes('图片归档'), restored);
    assert.ok(restored.includes('公开'), restored);
    assert.equal(
      await count(`${selectors.upload} [aria-label="待上传图片"] li`),
      1,
    );
    await page.click('css:button[aria-label="收起上传窗口"]');
    await page.click(button('返回', 'main'));
    await albumCard('待整理');
    await openUpload(true);
    const isolated = await visibleText(selectors.upload);
    assert.ok(isolated.includes('待整理'));
    assert.ok(isolated.includes('默认本地存储'));
    assert.ok(isolated.includes('私有'));
    assert.equal(
      await count(`${selectors.upload} [aria-label="待上传图片"] li`),
      0,
    );
    await page.click('css:button[aria-label="收起上传窗口"]');
    await page.click(button('返回', 'main'));
    await albumCard('林间日记');
    await openUpload(true);
    assert.ok((await visibleText(selectors.upload)).includes(sampleName));
    assert.equal(
      await count(`${selectors.upload} [aria-label="待上传图片"] li`),
      1,
    );
    return { restoredFileCount: 1, differentAlbumDraftEmpty: true };
  });

  await workflow(
    '14-box-selection-and-context-retains-multi-selection',
    async () => {
      await goto('/library');
      const geometry = await page.evaluate(() => {
        const gallery = document.querySelector(
          '[data-testid="collection-gallery"]',
        );
        const entries = [...gallery.querySelectorAll('article[data-photo-id]')];
        const area = gallery.getBoundingClientRect();
        const first = entries[0].getBoundingClientRect();
        const second = entries[1].getBoundingClientRect();
        const start = { x: area.left + 2, y: area.top + 2 };
        const end = {
          x: second.right - 2,
          y: Math.min(first.bottom, second.bottom) - 2,
        };
        const origin = document.elementFromPoint(start.x, start.y);
        return {
          ids: entries.slice(0, 3).map((entry) => entry.dataset.photoId),
          start,
          end,
          sameRow: Math.abs(first.top - second.top) < 1,
          blankOrigin:
            gallery.contains(origin) &&
            !origin.closest('article, button, label, input'),
          insideViewport:
            start.x >= 0 &&
            start.y >= 0 &&
            end.x < innerWidth &&
            end.y < innerHeight,
        };
      });
      assert.equal(geometry.ids.length, 3);
      assert.equal(geometry.sameRow, true, 'First two cards must share a row');
      assert.equal(
        geometry.blankOrigin,
        true,
        'Drag must start in gallery padding',
      );
      assert.equal(
        geometry.insideViewport,
        true,
        'Observed drag coordinates must be visible',
      );
      await page.mouse.move(geometry.start.x, geometry.start.y, {
        label: 'start image box selection',
      });
      await page.mouse.down({ button: 'left' });
      await page.mouse.move(geometry.end.x, geometry.end.y, {
        steps: 12,
        label: 'box select first two images',
      });
      await page.mouse.up({ button: 'left' });
      await waitText('[data-testid="collection-selection"]', '已选 2 张');
      const checkedIds = () =>
        page.evaluate(() =>
          [...document.querySelectorAll('main article[data-photo-id]')]
            .filter(
              (entry) => entry.querySelector('input[type="checkbox"]')?.checked,
            )
            .map((entry) => entry.dataset.photoId),
        );
      assert.deepEqual(await checkedIds(), geometry.ids.slice(0, 2));
      const multipleItems = await menu(true, geometry.ids[0]);
      assert.ok(!multipleItems.includes('查看图片'));
      assert.deepEqual(await checkedIds(), geometry.ids.slice(0, 2));
      await waitText('[data-testid="collection-selection"]', '已选 2 张');
      await capture('14-right-click-retains-two-selected-images');
      await page.keyboard.press('Escape');
      const singleItems = await menu(true, geometry.ids[2]);
      await waitText('[data-testid="collection-selection"]', '已选 1 张');
      assert.deepEqual(await checkedIds(), [geometry.ids[2]]);
      assert.ok(singleItems.includes('查看图片'));
      return {
        geometry,
        multiSelectionRetained: true,
        unselectedContextReplacesSelection: true,
      };
    },
  );

  await workflow('15-target-search-empty-and-selection-retained', async () => {
    await goto('/library');
    await selectPhoto('forest-2');
    await menu();
    await chooseAction('加入相册');
    await page.click(
      'css:[data-testid="batch-dialog"] [data-slot="checkbox"]:has-text("林间日记")',
    );
    await page.fill(
      'css:[data-testid="batch-dialog"] [data-slot="search-field-input"]',
      '不存在的目标相册',
    );
    await waitText(`${selectors.batch} [aria-label="目标相册"]`, '未找到相册');
    assert.equal(
      await count(
        `${selectors.batch} [aria-label="目标相册"] [data-slot="checkbox"]`,
      ),
      0,
    );
    const canConfirm = await page.evaluate(
      (selector) =>
        [...document.querySelectorAll(`${selector} button`)].find(
          (entry) => entry.textContent.trim() === '确认',
        )?.disabled === false,
      selectors.batch,
    );
    assert.equal(
      canConfirm,
      true,
      'Hidden selected target must remain selected',
    );
    await capture('15-target-search-empty-retains-confirmable-selection');
    await page.fill(
      'css:[data-testid="batch-dialog"] [data-slot="search-field-input"]',
      '',
    );
    const targetChecked = await page.evaluate((selector) => {
      const target = [
        ...document.querySelectorAll(`${selector} [data-slot="checkbox"]`),
      ].find((entry) => entry.textContent.includes('林间日记'));
      return target?.querySelector('input[type="checkbox"]')?.checked;
    }, selectors.batch);
    assert.equal(
      targetChecked,
      true,
      'Clearing search must reveal the selected target',
    );
    await page.click(button('确认', selectors.batch));
    await waitGone(selectors.batch);
    await expectPhotoCount(4);
    await nav('/albums');
    await expectAlbumCard('林间日记', 3);
    await expectAlbumCard('山与湖', 2);
    return {
      emptySearchFeedback: true,
      selectedTargetRetained: true,
      confirmedAlbumImages: 3,
    };
  });

  await workflow('16-new-empty-album-single-entry', async () => {
    await goto('/albums', 'empty');
    assert.equal(
      await page.evaluate(
        () =>
          [...document.querySelectorAll('main button')].filter(
            (entry) => entry.textContent.trim() === '新建相册',
          ).length,
      ),
      1,
      'Album list must have one create entry',
    );
    assert.equal(await count('main .prototype-empty button'), 0);
    await page.click(button('新建相册', 'main'));
    await page.waitForSelector('css:[role="dialog"] input');
    await settleOverlays();
    const name = '快捷操作验收相册';
    await page.fill('css:[role="dialog"] input', name);
    await page.click(button('创建', '[role="dialog"]'));
    await page.waitForFunction(
      (value) =>
        document.querySelector('main h1')?.textContent === value &&
        window.location.pathname.startsWith('/albums/'),
      name,
    );
    await settleOverlays();
    await expectPhotoCount(0);
    assert.equal(await count('main button[aria-label="添加图片"]'), 1);
    assert.equal(
      await count('main .prototype-empty button'),
      0,
      'Empty state must not duplicate the add action',
    );
    assert.equal(await count('[data-testid="collection-toolbar"]'), 0);
    await page.click('css:button[aria-label="添加图片"]');
    await page.waitForSelector('css:[role="menu"][aria-label="添加图片方式"]');
    await settleOverlays();
    const items = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '[role="menu"][aria-label="添加图片方式"] [role="menuitem"]',
        ),
      ].map((entry) => entry.textContent.trim()),
    );
    assert.deepEqual(items, ['上传新图片', '从图库选择']);
    return { albumName: name, addEntries: 1, emptyStateEntries: 0, items };
  });

  async function theme(value) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const state = await page.evaluate(() => {
        const entries = [
          ...document.querySelectorAll('[data-testid="theme-trigger"]'),
        ];
        const index = entries.findIndex((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.width > 0 && bounds.height > 0;
        });
        return { index, value: entries[index]?.getAttribute('data-theme') };
      });
      if (state.value === value) return;
      assert.ok(state.index >= 0, 'Visible theme control is required');
      await page.click(
        `css:[data-testid="theme-trigger"] >> nth=${state.index}`,
      );
      await page.waitForFunction(
        ({ index, previous }) =>
          [...document.querySelectorAll('[data-testid="theme-trigger"]')][
            index
          ]?.getAttribute('data-theme') !== previous,
        { index: state.index, previous: state.value },
      );
    }
    assert.fail(`Could not set ${value} theme`);
  }

  async function inspectLayout(surface) {
    return page.evaluate((kind) => {
      const visible = (node) => {
        const bounds = node.getBoundingClientRect();
        const styles = getComputedStyle(node);
        return (
          bounds.width > 0 &&
          bounds.height > 0 &&
          styles.visibility !== 'hidden'
        );
      };
      const rect = (node) => {
        if (!node) return null;
        const bounds = node.getBoundingClientRect();
        return {
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
          right: bounds.right,
          bottom: bounds.bottom,
        };
      };
      const main = document.querySelector('main');
      const dialog = document.querySelector(
        '[data-testid="quick-upload"], [data-testid="album-picker"]',
      );
      const menu = [
        ...document.querySelectorAll('[data-slot="dropdown-popover"]'),
      ].find(visible);
      const active = dialog ?? menu ?? main;
      const footer = dialog?.querySelector('[data-slot="modal-footer"]');
      const bounds = rect(dialog ?? menu);
      const footerBounds = rect(footer);
      const controls = [
        ...active.querySelectorAll(
          'button, [role="menuitem"], [data-slot="select-trigger"]',
        ),
      ].filter(visible);
      const clippedControls = controls
        .filter(
          (node) =>
            node.scrollWidth > node.clientWidth + 2 ||
            node.scrollHeight > node.clientHeight + 2,
        )
        .map((node) => ({
          label: node.getAttribute('aria-label') ?? node.textContent.trim(),
          bounds: rect(node),
          scroll: [node.scrollWidth, node.scrollHeight],
          client: [node.clientWidth, node.clientHeight],
        }));
      const footerButtons = footer
        ? [...footer.querySelectorAll('button')].filter(visible).map(rect)
        : [];
      const images = [...active.querySelectorAll('img')];
      return {
        surface: kind,
        viewport: { width: innerWidth, height: innerHeight },
        title: main?.querySelector('h1')?.textContent,
        mainOverflow: main ? main.scrollWidth > main.clientWidth + 2 : true,
        documentOverflow: document.documentElement.scrollWidth > innerWidth + 2,
        surfaceOverflow: active.scrollWidth > active.clientWidth + 2,
        bounds,
        surfaceOutside: bounds
          ? bounds.x < -1 ||
            bounds.y < -1 ||
            bounds.right > innerWidth + 1 ||
            bounds.bottom > innerHeight + 1
          : false,
        footerBounds,
        footerReachable:
          !dialog ||
          (!!footerBounds &&
            footerBounds.y >= 0 &&
            footerBounds.bottom <= innerHeight + 1 &&
            footerButtons.every(
              (button) =>
                button.x >= -1 &&
                button.right <= innerWidth + 1 &&
                button.y >= 0 &&
                button.bottom <= innerHeight + 1,
            )),
        footerButtons,
        clippedControls,
        brokenImages: images.filter(
          (image) => image.complete && !image.naturalWidth,
        ).length,
        pendingImages: images.filter((image) => !image.complete).length,
        errors: window.__prototypeErrors ?? [],
      };
    }, surface);
  }

  async function layoutCase({ width, height = 900, color, surface }) {
    const name = `layout-${width}x${height}-${color}-${surface}`;
    if (names && !names.has(name)) return;
    try {
      await viewport(width, height);
      await goto(
        surface === 'empty-album' || surface === 'picker'
          ? '/albums/empty'
          : '/library',
      );
      await theme(color);
      if (surface === 'upload') {
        await openUpload();
        await expandSettings();
        await addFile();
      } else if (surface === 'picker') {
        await openPicker();
        await selectPhoto('forest-2', selectors.picker);
      } else if (surface === 'actions') {
        await selectPhoto('forest');
        await selectPhoto('mountain');
        await menu();
      } else if (surface === 'context') {
        await menu(true, 'forest');
      }
      await page.waitForFunction(() =>
        [
          ...document.querySelectorAll(
            '[data-testid="quick-upload"] img, [data-testid="album-picker"] img, main img',
          ),
        ].every((image) => image.complete && image.naturalWidth > 0),
      );
      await settleOverlays();
      const state = await inspectLayout(surface);
      const failures = [];
      if (state.mainOverflow) failures.push('main-overflow');
      if (state.documentOverflow) failures.push('document-overflow');
      if (state.surfaceOverflow) failures.push('surface-overflow');
      if (state.surfaceOutside) failures.push('surface-outside-viewport');
      if (!state.footerReachable) failures.push('footer-not-reachable');
      if (state.clippedControls.length) failures.push('clipped-controls');
      if (state.brokenImages || state.pendingImages)
        failures.push('image-rendering');
      if (state.errors.length) failures.push('browser-errors');
      const result = {
        name,
        width,
        height,
        color,
        ...state,
        passed: !failures.length,
        failures,
        screenshot: await capture(name),
      };
      if (height < 600 && (surface === 'context' || surface === 'actions')) {
        await page.keyboard.press('End');
        const last = await page.evaluate(() => {
          const active = document.activeElement;
          const bounds = active?.getBoundingClientRect();
          return {
            text: active?.textContent.trim(),
            visible:
              !!bounds && bounds.y >= 0 && bounds.bottom <= innerHeight + 1,
          };
        });
        result.lastAction = last;
        if (last.text !== '移入回收站' || !last.visible) {
          result.passed = false;
          result.failures.push('last-menu-action-unreachable');
        }
        result.bottomScreenshot = await capture(`${name}-last-action`);
      }
      if (height < 600 && (surface === 'upload' || surface === 'picker')) {
        const selector =
          surface === 'upload' ? selectors.upload : selectors.picker;
        await page.click(button('取消', selector));
        await waitGone(selector);
        result.footerActionWorked = true;
      }
      layouts.push(result);
    } catch (error) {
      const result = {
        name,
        width,
        height,
        color,
        surface,
        passed: false,
        error: error.stack ?? String(error),
      };
      try {
        result.screenshot = await capture(`${name}-failed`);
        await writeFile(
          resolve(output, `${name}-failed-snapshot.json`),
          JSON.stringify(await page.snapshot(), null, 2),
        );
      } catch (evidenceError) {
        result.evidenceError = String(evidenceError);
      }
      layouts.push(result);
    }
    await writeFile(
      resolve(output, 'layouts.json'),
      JSON.stringify(layouts, null, 2),
    );
  }

  for (const width of [320, 390, 768, 1440]) {
    for (const color of ['light', 'dark']) {
      for (const surface of [
        'library',
        'empty-album',
        'upload',
        'picker',
        'actions',
        'context',
      ]) {
        await layoutCase({ width, color, surface });
      }
      for (const surface of ['upload', 'picker', 'actions', 'context']) {
        await layoutCase({ width, height: 480, color, surface });
      }
    }
  }

  const failedWorkflows = workflows.filter((entry) => !entry.passed);
  const failedLayouts = layouts.filter((entry) => !entry.passed);
  const summary = {
    taskSpaceId: task.spaceId,
    checkedAt: new Date().toISOString(),
    workflows: {
      total: workflows.length,
      passed: workflows.length - failedWorkflows.length,
      failed: failedWorkflows.map((entry) => entry.name),
    },
    layouts: {
      total: layouts.length,
      passed: layouts.length - failedLayouts.length,
      failed: failedLayouts.map((entry) => entry.name),
    },
    evidence: output,
  };
  await writeFile(
    resolve(output, 'summary.json'),
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify(summary, null, 2));
  assert.equal(
    failedWorkflows.length + failedLayouts.length,
    0,
    'Quick workflow prototype checks failed; see saved JSON and screenshots',
  );
  await viewport();
  await goto('/library');
  await theme('light');
  return summary;
}
