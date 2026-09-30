import assert from 'node:assert/strict';
import { join } from 'node:path';

const button = (name) => `loc=role:button[name="${name}"]`;
const cardSelector = '[data-testid="library-card"]';
const fixtureName = (index) =>
  `issue173-${index % 2 ? 'beta' : 'alpha'}-${index}.png`;
const checkbox = (name) => `loc=role:checkbox[name="选择图片：${name}"]`;

/** Read-only browser interaction with the 93 real records seeded by library-query. */
export async function verifyLibrarySelection({ page, config, report }) {
  const originalScheme = await page.evaluate(() =>
    matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  );
  async function settle() {
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  }
  async function loaded(count) {
    await page.waitForFunction(
      (count) =>
        Number(
          document.querySelector('[data-testid="library-list"]')?.dataset
            .loadedCount,
        ) === count &&
        !document.querySelector('[data-testid="library-loading"]') &&
        document
          .querySelector('[data-testid="library-gallery"]')
          ?.getAttribute('aria-busy') === 'false',
      count,
    );
    await settle();
  }
  async function state() {
    return page.evaluate(() => {
      const selection = document.querySelector(
        '[data-testid="library-selection"]',
      );
      const label = selection
        ?.querySelector('button[aria-label^="操作已选"]')
        ?.getAttribute('aria-label');
      const main = document.querySelector('main');
      const gallery = document.querySelector('[data-testid="library-gallery"]');
      return {
        count: Number(label?.match(/操作已选 (\d+) 张图片/)?.[1] ?? 0),
        status: selection?.querySelector('[role="status"]')?.textContent ?? '',
        ids: [
          ...document.querySelectorAll(
            '[data-testid="library-card"][data-selected="true"]',
          ),
        ].map((card) => card.dataset.imageId),
        mounted: document.querySelectorAll('[data-testid="library-card"]')
          .length,
        galleryTop: gallery.getBoundingClientRect().top + main.scrollTop,
        image: new URL(location.href).searchParams.get('image'),
      };
    });
  }
  async function selected(count) {
    await page.waitForFunction((count) => {
      const trigger = document.querySelector(
        '[data-testid="library-selection"] button[aria-label^="操作已选"]',
      );
      return count === 0
        ? !document.querySelector('[data-testid="library-selection"]')
        : trigger?.getAttribute('aria-label') === `操作已选 ${count} 张图片`;
    }, count);
  }
  async function select(label, option) {
    await page.click(`loc=role:button[name*="${label}"]`);
    await page.click(`loc=role:option[name="${option}"]`);
  }
  async function choose(name) {
    await page.hover(button(`查看图片：${name}`));
    await page.click(`label:has(input[aria-label="选择图片：${name}"])`);
  }
  async function action(name) {
    const count = (await state()).count;
    assert.ok(count > 0, `${name} needs an explicit selection`);
    await page.click(button(`操作已选 ${count} 张图片`));
    if (count === 41 && name === '查看已选清单') {
      const filename = 'library-selection-cross-page-counts.png';
      await page.screenshot({ path: join(config.output, filename) });
      report.screenshots.push(filename);
    }
    await page.click(`loc=role:menuitem[name="${name}"]`);
    await settle();
  }
  async function firstName() {
    return page.evaluate(() =>
      document
        .querySelector(
          '[data-testid="library-card"] button[aria-label^="查看图片："]',
        )
        .getAttribute('aria-label')
        .slice('查看图片：'.length),
    );
  }
  async function top() {
    await page.evaluate(() => document.querySelector('main').scrollTo(0, 0));
    await settle();
  }
  async function resize(width, height) {
    await page.cdp('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 768,
    });
    await page.cdp('Emulation.setTouchEmulationEnabled', {
      enabled: width < 768,
      maxTouchPoints: 1,
    });
    await page.waitForFunction((width) => innerWidth === width, width);
    await settle();
  }
  async function visit() {
    await page.goto(`${config.origin}/library?q=issue173-&pageSize=40`);
    await loaded(40);
  }
  async function search(value, count = 40) {
    await page.fill('input[aria-label="搜索图片名称"]', value);
    await page.press('input[aria-label="搜索图片名称"]', 'Enter');
    await page.waitForFunction(
      (value) => new URL(location.href).searchParams.get('q') === value,
      value,
    );
    await loaded(count);
  }
  async function galleryPage(number) {
    await page.waitForFunction(
      (number) =>
        Number(new URL(location.href).searchParams.get('page')) === number,
      number,
    );
    await loaded(40);
  }
  async function firstRow() {
    await top();
    return page.evaluate(() => {
      const cards = [
        ...document.querySelectorAll('[data-testid="library-card"]'),
      ]
        .slice(0, 4)
        .map((card) => {
          const rect = card.getBoundingClientRect();
          return {
            id: card.dataset.imageId,
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
          };
        });
      return cards;
    });
  }
  async function drag(
    start,
    end,
    expected,
    { shift = false, cancel = false } = {},
  ) {
    await page.mouse.move(start.x, start.y, {
      label: 'start gallery selection',
    });
    if (shift) await page.keyboard.down('Shift');
    await page.mouse.down();
    try {
      await page.mouse.move(end.x, end.y, {
        steps: 12,
        label: 'select gallery cards',
      });
      // Commit the library's animation-frame update before releasing the mouse.
      await selected(expected);
      if (cancel) await page.keyboard.press('Escape');
    } finally {
      await page.mouse.up();
      if (shift) await page.keyboard.up('Shift');
    }
    await settle();
    assert.equal(
      (await state()).image,
      null,
      'Dragging never opens image details',
    );
  }
  async function sameTaskDrag(ending) {
    await top();
    // This scheduling regression deliberately queues multiple library rAFs in
    // one browser task. The normal gesture coverage above uses native mouse input.
    await page.evaluate((ending) => {
      const cards = [
        ...document.querySelectorAll('[data-testid="library-card"]'),
      ]
        .slice(0, 4)
        .map((card) => card.getBoundingClientRect());
      const start = {
        x: (cards[0].right + cards[1].left) / 2,
        y: cards[0].top + 20,
      };
      const target = document.elementFromPoint(start.x, start.y);
      if (
        !target?.closest('[data-testid="library-gallery"]') ||
        target.closest('button,input,label,[role="checkbox"]')
      )
        throw new Error('The measured drag start must be a real gallery gap');
      function mouse(node, type, point, buttons = 1) {
        node.dispatchEvent(
          new MouseEvent(type, {
            view: window,
            bubbles: true,
            cancelable: true,
            button: 0,
            buttons,
            clientX: point.x,
            clientY: point.y,
          }),
        );
      }
      mouse(target, 'mousedown', start);
      mouse(document.body, 'mousemove', {
        x: cards[0].left + 16,
        y: cards[0].bottom - 20,
      });
      const end =
        ending === 'collapse'
          ? { x: start.x + 1, y: start.y + 1 }
          : { x: cards[2].right - 16, y: cards[2].bottom - 20 };
      mouse(document.body, 'mousemove', end);
      if (ending === 'escape') {
        window.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Escape',
            code: 'Escape',
            bubbles: true,
            cancelable: true,
          }),
        );
      }
      mouse(window, 'mouseup', end, 0);
    }, ending);
    await settle();
    assert.equal((await state()).image, null);
  }
  async function searchFocused() {
    await page.waitForFunction(
      () =>
        document.activeElement ===
        document.querySelector('input[aria-label="搜索图片名称"]'),
    );
  }

  try {
    await resize(1440, 1080);
    await visit();
    await select('图片加载方式', '加载更多');
    await loaded(40);
    await page.click('loc=role:radio[name="网格"]');
    await settle();
    await top();
    assert.equal((await state()).count, 0);
    const before = await state();

    await page.hover(`${cardSelector}[data-image-id="issue173-000"]`);
    await choose(fixtureName(0));
    await selected(1);
    assert.equal((await state()).image, null);
    assert.ok(
      Math.abs((await state()).galleryTop - before.galleryTop) < 1,
      'Showing selection actions must not push the gallery',
    );
    await page.focus(checkbox(fixtureName(1)));
    await page.keyboard.press('Space');
    await selected(2);
    assert.equal(
      (await state()).image,
      null,
      'Space on checkbox never opens details',
    );
    await page.keyboard.press('Space');
    await selected(1);
    assert.deepEqual((await state()).ids, ['issue173-000']);

    await page.click('loc=role:radio[name="瀑布流"]');
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="library-gallery"]').dataset
          .layout === 'masonry',
    );
    await selected(1);
    await page.click('loc=role:radio[name="网格"]');
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="library-gallery"]').dataset
          .layout === 'grid',
    );
    await page.click(button(`查看图片：${fixtureName(0)}`));
    await page.waitForSelector('loc=role:dialog[name="图片详情"]');
    await page.click(button('关闭图片详情'));
    await page.waitForFunction(
      () => !new URL(location.href).searchParams.has('image'),
    );
    await selected(1);
    report.checks.push(
      'HeroUI checkbox click and keyboard Space select without opening details; layout and detail return preserve selection without adding a gallery row.',
    );

    await page.click('[data-testid="library-load-more"]');
    await loaded(80);
    await selected(1);
    await top();
    assert.ok(
      (await state()).mounted < 80,
      'Loaded items include unmounted virtual cards',
    );
    await action('全选已加载');
    await selected(80);
    await page.click('[data-testid="library-load-more"]');
    await loaded(93);
    await selected(80);
    assert.ok(
      (await state()).ids.every((id) => Number(id.slice(-3)) < 80),
      'Later loaded items are not automatically selected',
    );
    report.checks.push(
      'Select-all covers all 80 loaded IDs with fewer mounted cards; appending the final 13 records leaves the explicit selection at 80.',
    );

    await select('图片加载方式', '分页');
    await loaded(40);
    await selected(0);
    await top();
    await choose(fixtureName(0));
    await action('全选当前页');
    await selected(40);
    await page.click('nav[aria-label="图库分页"] button:has-text("下一页")');
    await galleryPage(2);
    assert.match((await state()).status, /当前页 0 张，其他页 40 张/);
    await choose(fixtureName(40));
    await selected(41);
    await action('查看已选清单');
    await page.waitForSelector('[data-testid="library-selected-panel"]');
    assert.equal(
      await page.evaluate(
        () => document.querySelectorAll('[data-selected-image-id]').length,
      ),
      20,
    );
    await page.click(
      'nav[aria-label="已选清单分页"] button:has-text("下一页")',
    );
    await page.waitForSelector('[data-selected-image-id="issue173-020"]');
    await page.click(button(`移除选择：${fixtureName(20)}`));
    await selected(40);
    assert.match((await state()).status, /当前页 1 张，其他页 39 张/);
    await page.click(button('关闭已选清单'));
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="library-selected-panel"]'),
    );
    await sameTaskDrag('collapse');
    await selected(39);
    assert.match(
      (await state()).status,
      /当前页 0 张，其他页 39 张/,
      'Shrinking a large drag to a 1px gap box and immediately releasing keeps only the other-page baseline',
    );
    await choose(fixtureName(40));
    await selected(40);
    await action('取消当前页选择');
    await selected(39);
    assert.match((await state()).status, /当前页 0 张，其他页 39 张/);
    await page.click('nav[aria-label="图库分页"] button:has-text("上一页")');
    await galleryPage(1);
    assert.match((await state()).status, /当前页 39 张，其他页 0 张/);
    await top();
    assert.ok((await state()).ids.includes('issue173-000'));
    await page.evaluate(() => history.back());
    await galleryPage(2);
    await selected(39);
    assert.match((await state()).status, /当前页 0 张，其他页 39 张/);
    report.checks.push(
      'Current-page select/deselect and Back preserve other-page IDs; the paged selected list renders 20 rows and removes an actual second-page entry.',
    );
    report.checks.push(
      'Within one browser task, a large drag shrunk below the 10px area threshold and immediately released clears current-page hits while retaining all 39 other-page IDs.',
    );

    await search('issue173-alpha');
    await selected(0);
    await top();
    await choose(await firstName());
    await selected(1);
    await select('图片排序', '上传时间 ↑');
    await page.waitForFunction(
      () => new URL(location.href).searchParams.get('sort') === 'uploaded_asc',
    );
    await loaded(40);
    await selected(0);
    await top();
    await choose(await firstName());
    await selected(1);
    await select('图片加载方式', '加载更多');
    await loaded(40);
    await selected(0);
    report.checks.push(
      'Search, sort and loading-mode changes each independently clear the previous explicit selection.',
    );

    await visit();
    await page.click('loc=role:radio[name="网格"]');
    await settle();
    const row = await firstRow();
    assert.equal(row.length, 4);
    assert.ok(
      row[0].right < row[1].left,
      'A real gap is available for drag start',
    );
    const dragTop = (await state()).galleryTop;
    await drag(
      { x: (row[0].right + row[1].left) / 2, y: row[0].top + 20 },
      { x: row[2].right - 16, y: row[2].bottom - 20 },
      2,
    );
    assert.deepEqual((await state()).ids, [row[1].id, row[2].id]);
    assert.ok(
      Math.abs((await state()).galleryTop - dragTop) < 1,
      'First drag selection leaves the gallery in the same position',
    );
    await drag(
      { x: (row[2].right + row[3].left) / 2, y: row[3].top + 20 },
      { x: row[3].right - 16, y: row[3].bottom - 20 },
      3,
      { shift: true },
    );
    assert.deepEqual((await state()).ids, [row[1].id, row[2].id, row[3].id]);
    await drag(
      { x: (row[0].right + row[1].left) / 2, y: row[0].top + 20 },
      { x: row[0].left + 16, y: row[0].bottom - 20 },
      1,
      { cancel: true },
    );
    await selected(3);
    assert.deepEqual((await state()).ids, [row[1].id, row[2].id, row[3].id]);
    await sameTaskDrag('escape');
    await selected(3);
    assert.deepEqual(
      (await state()).ids,
      [row[1].id, row[2].id, row[3].id],
      'Escape restores the original selection even when two change rAF callbacks were queued in the same task',
    );
    report.checks.push(
      'Real mouse drags start in measured card gaps, select intersecting cards, append with Shift and restore the pre-drag selection on Escape; no detail opens or gallery shifts.',
    );
    report.checks.push(
      'Two different mousemove events followed by Escape in the same browser task leave no queued rAF capable of overwriting the restored selection after two frames.',
    );

    for (const theme of ['light', 'dark']) {
      await page.cdp('Emulation.setEmulatedMedia', {
        features: [
          { name: 'prefers-color-scheme', value: theme },
          { name: 'prefers-reduced-motion', value: 'reduce' },
        ],
      });
      await page.waitForFunction(
        (theme) => document.documentElement.classList.contains(theme),
        theme,
      );
      for (const [width, height] of [
        [1440, 1080],
        [390, 844],
        [390, 560],
      ]) {
        await resize(width, height);
        await top();
        await selected(3);
        if (width < 768) {
          assert.equal(
            await page.evaluate(() => matchMedia('(hover: none)').matches),
            true,
          );
          assert.ok(
            await page.evaluate(() =>
              [
                ...document.querySelectorAll(
                  '[data-testid="library-card"] [data-slot="checkbox"]',
                ),
              ].every((node) => getComputedStyle(node).opacity === '1'),
            ),
            'All touch checkboxes remain visibly available without hover',
          );
          const filename = `library-selection-touch-${theme}-${width}x${height}.png`;
          await page.screenshot({ path: join(config.output, filename) });
          report.screenshots.push(filename);
        }
        await action('查看已选清单');
        await page.waitForSelector('[data-testid="library-selected-panel"]');
        await settle();
        const geometry = await page.evaluate(() => {
          const region = document.querySelector(
            '[data-testid="library-selected-panel"]',
          );
          const main = document.querySelector('main');
          const panel = region.getBoundingClientRect();
          const visible = main.getBoundingClientRect();
          const control = document
            .querySelector(
              '[data-testid="library-card"] [data-slot="checkbox-content"]',
            )
            ?.getBoundingClientRect();
          return {
            left: panel.left,
            right: panel.right,
            bottom: panel.bottom,
            mainBottom: visible.bottom,
            pageWidth: document.documentElement.scrollWidth,
            mainWidth: main.clientWidth,
            mainScrollWidth: main.scrollWidth,
            checkboxWidth: control?.width,
            checkboxHeight: control?.height,
            focusInPanel: region.contains(document.activeElement),
          };
        });
        const filename = `library-selection-${theme}-${width}x${height}.png`;
        await page.screenshot({ path: join(config.output, filename) });
        report.screenshots.push(filename);
        assert.ok(
          geometry.left >= 0 && geometry.right <= width,
          'Selected list stays inside viewport width',
        );
        assert.ok(
          geometry.bottom <= geometry.mainBottom + 1,
          'Selected list does not run under the fixed footer',
        );
        assert.ok(
          geometry.pageWidth <= width &&
            geometry.mainScrollWidth <= geometry.mainWidth,
          'Selected actions cause no horizontal overflow',
        );
        assert.equal(
          geometry.focusInPanel,
          true,
          'Opening the selected list places keyboard focus inside',
        );
        if (width < 768) {
          assert.ok(
            geometry.checkboxWidth >= 44 && geometry.checkboxHeight >= 44,
            'Touch checkbox has a 44px target',
          );
        }
        await page.keyboard.press('Escape');
        await page.waitForFunction(
          () =>
            !document.querySelector('[data-testid="library-selected-panel"]'),
        );
        assert.equal(
          await page.evaluate(() =>
            document.activeElement?.getAttribute('aria-label'),
          ),
          '操作已选 3 张图片',
        );
      }
    }
    report.checks.push(
      'Light/dark desktop, mobile and short-viewport selection panels keep 44px touch checkboxes, visible controls, bounded width/height and Escape focus restoration.',
    );
    await action('清空全部选择');
    await selected(0);
    assert.equal((await state()).ids.length, 0);
    await searchFocused();
    await resize(1440, 1080);
    await top();
    await choose(fixtureName(0));
    await selected(1);
    await action('查看已选清单');
    await page.waitForSelector('[data-testid="library-selected-panel"]');
    await page.click(button(`移除选择：${fixtureName(0)}`));
    await selected(0);
    await searchFocused();
    report.checks.push(
      'Clearing all selections and removing the selected list’s final item both return focus to the existing search input.',
    );
  } finally {
    await page.cdp('Emulation.setEmulatedMedia', {
      features: [
        { name: 'prefers-color-scheme', value: originalScheme },
        { name: 'prefers-reduced-motion', value: 'reduce' },
      ],
    });
    await resize(1440, 1080);
    // The following parent tests start from the same 40-item query and preferences.
    await visit();
    await select('图片加载方式', '加载更多');
    await loaded(40);
    await page.click('loc=role:radio[name="网格"]');
    await top();
  }
}

/** Consumes the parent's already loaded scale fixture without requesting more data. */
export async function verifyLargeLibrarySelection({
  page,
  config,
  report,
  count = 2400,
  prefix,
}) {
  assert.ok(
    count > 200,
    'The explicit-selection fixture must exceed 200 items',
  );
  assert.ok(prefix, 'The caller supplies the actual scale fixture ID prefix');
  const requestCounts = () =>
    page.evaluate(() => ({
      scale: window.__libraryScale?.requests.length ?? null,
      query: window.__queryRequests?.length ?? null,
    }));
  const beforeRequests = await requestCounts();
  assert.ok(
    beforeRequests.scale !== null || beforeRequests.query !== null,
    'At least one real list-request observer must be installed by the parent',
  );
  const selected = (expected) =>
    page.waitForFunction((expected) => {
      const menu = document.querySelector('[data-testid="library-selection"]');
      return expected === 0
        ? !menu
        : menu
            ?.querySelector('button[aria-label^="操作已选"]')
            ?.getAttribute('aria-label') === `操作已选 ${expected} 张图片`;
    }, expected);
  async function action(expected, name) {
    await page.click(button(`操作已选 ${expected} 张图片`));
    await page.click(`loc=role:menuitem[name="${name}"]`);
  }
  await page.evaluate(() => document.querySelector('main').scrollTo(0, 0));
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const first = await page.evaluate(() => {
    const card = document.querySelector('[data-testid="library-card"]');
    return {
      id: card.dataset.imageId,
      name: card
        .querySelector('button[aria-label^="查看图片："]')
        .getAttribute('aria-label')
        .slice('查看图片：'.length),
      loaded: Number(
        document.querySelector('[data-testid="library-list"]').dataset
          .loadedCount,
      ),
    };
  });
  assert.equal(first.loaded, count);
  assert.ok(first.id.startsWith(prefix));
  await selected(0);
  await page.hover(button(`查看图片：${first.name}`));
  await page.click(`label:has(input[aria-label="选择图片：${first.name}"])`);
  await selected(1);
  await action(1, '全选已加载');
  await selected(count);
  const cardNodes = await page.evaluate(
    () => document.querySelectorAll('[data-testid="library-card"]').length,
  );
  assert.ok(
    cardNodes <= 85,
    'Selecting the full fixture keeps virtual card DOM bounded',
  );
  for (const width of [360, 390, 430, 768, 1440]) {
    await page.cdp('Emulation.setDeviceMetricsOverride', {
      width,
      height: 1080,
      deviceScaleFactor: 1,
      mobile: width < 768,
    });
    await page.waitForFunction((width) => innerWidth === width, width);
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    const bounds = await page.evaluate(() => {
      const toolbar = document.querySelector('[data-testid="library-toolbar"]');
      const main = document.querySelector('main');
      const rect = toolbar.getBoundingClientRect();
      const selection = document
        .querySelector('[data-testid="library-selection"]')
        .getBoundingClientRect();
      const sort = toolbar.querySelector('[data-slot="select-value"]');
      return {
        width: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        mainWidth: main.clientWidth,
        mainScrollWidth: main.scrollWidth,
        right: rect.right,
        selectedRight: selection.right,
        sortVisible: sort.clientWidth >= sort.scrollWidth,
      };
    });
    assert.ok(
      bounds.documentWidth <= width &&
        bounds.mainScrollWidth <= bounds.mainWidth,
      'Large selection count does not overflow the page',
    );
    assert.ok(
      bounds.selectedRight <= bounds.right + 1,
      'Large selection actions fit the toolbar',
    );
    assert.equal(
      bounds.sortVisible,
      true,
      'The default upload sort label and direction remain fully visible',
    );
    if (width === 360 || width === 1440) {
      const filename = `library-selection-${count}-${width}.png`;
      await page.screenshot({ path: join(config.output, filename) });
      report.screenshots.push(filename);
    }
  }
  await action(count, '查看已选清单');
  await page.waitForSelector('[data-testid="library-selected-panel"]');
  for (let number = 2; number <= 11; number++) {
    await page.click(
      'nav[aria-label="已选清单分页"] button:has-text("下一页")',
    );
    await page.waitForFunction(
      ({ number, pages }) =>
        document
          .querySelector('nav[aria-label="已选清单分页"]')
          ?.textContent.includes(`${number}/${pages}`),
      { number, pages: Math.ceil(count / 20) },
    );
    assert.equal(
      await page.evaluate(
        () => document.querySelectorAll('[data-selected-image-id]').length,
      ),
      Math.min(20, count - (number - 1) * 20),
      'The selected list mounts only its current 20-item page',
    );
  }
  const removed = await page.evaluate(() => {
    const row = document.querySelector(
      '[data-testid="library-selected-panel"] [data-selected-image-id]',
    );
    return {
      id: row.dataset.selectedImageId,
      name: row
        .querySelector('button[aria-label^="移除选择："]')
        .getAttribute('aria-label')
        .slice('移除选择：'.length),
    };
  });
  assert.ok(removed.id.startsWith(prefix));
  await page.click(button(`移除选择：${removed.name}`));
  await selected(count - 1);
  assert.equal(
    await page.evaluate(
      (id) => !!document.querySelector(`[data-selected-image-id="${id}"]`),
      removed.id,
    ),
    false,
    'The actual 201st selected entry disappears after removal',
  );
  const afterRemoval = await page.evaluate(() => ({
    status: document.querySelector(
      '[data-testid="library-selection"] [role="status"]',
    ).textContent,
    cardNodes: document.querySelectorAll('[data-testid="library-card"]').length,
    selectedRows: document.querySelectorAll('[data-selected-image-id]').length,
  }));
  assert.match(
    afterRemoval.status,
    new RegExp(`共选 ${count - 1} 张：已加载 ${count - 1} 张`),
  );
  assert.ok(afterRemoval.cardNodes <= 85);
  assert.equal(afterRemoval.selectedRows, Math.min(20, count - 201));
  await page.click(button('关闭已选清单'));
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="library-selected-panel"]'),
  );
  await action(count - 1, '清空全部选择');
  await selected(0);
  await page.waitForFunction(
    () =>
      document.activeElement ===
      document.querySelector('input[aria-label="搜索图片名称"]'),
  );
  const afterRequests = await requestCounts();
  assert.deepEqual(
    afterRequests,
    beforeRequests,
    'Selecting, paging the selected list, removing and clearing must not request /api/images',
  );
  report.largeSelection = {
    status: 'passed',
    selected: count,
    afterRemoval: count - 1,
    removedOrdinal: 201,
    removed,
    cardNodes: afterRemoval.cardNodes,
    selectedListRows: afterRemoval.selectedRows,
    requestsBefore: beforeRequests,
    requestsAfter: afterRequests,
  };
  report.checks.push(
    `${count} explicitly selected loaded IDs keep at most 85 mounted cards and 20 selected-list rows; the actual 201st selection can be removed; clearing restores search focus without a new list request.`,
  );
}
