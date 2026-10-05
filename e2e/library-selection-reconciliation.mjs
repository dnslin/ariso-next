import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';

const button = (name) => `loc=role:button[name="${name}"]`;

/** A separate storage and 241 real records exercise off-page selection freshness. */
export async function verifyLibrarySelectionReconciliation({
  page,
  config,
  sql,
  report,
}) {
  const prefix = 'library174-selection-';
  const search = 'issue174-selection-';
  const storageId = 'library174-selection-storage';
  const count = 241;
  const created = 1802000000000;
  const thumbnailDirectory = join(
    config.dataDirectory,
    'storage',
    'issue174-selection',
    'ariso',
    storageId,
    'library-selection',
  );
  const id = (index) => `${prefix}${String(index).padStart(3, '0')}`;
  const name = (index) => `${search}${String(index).padStart(3, '0')}.png`;
  const record = {
    status: 'failed',
    records: count,
    pageSize: 80,
    checks: [],
    network: [],
    limitations: [
      'Fault responses and response ordering are controlled only at browser fetch; successful reconciliation reads the production API and independent SQLite records.',
      'Four fixture images have actual PNG thumbnail bytes and versions; the remaining records have metadata only. Resource monitoring allows thumbnail rendering and rejects original/default, full derived version and download requests.',
    ],
  };
  report.reconciliation = record;
  let removedAt = Infinity;
  const originalScheme = await page.evaluate(() =>
    matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  );
  const settle = () =>
    page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  async function selected(expected) {
    await page.waitForFunction((expected) => {
      const trigger = document.querySelector(
        '[data-testid="library-selection"] button[aria-label^="操作已选"]',
      );
      return expected === 0
        ? !trigger
        : trigger?.getAttribute('aria-label') === `操作已选 ${expected} 张图片`;
    }, expected);
  }
  async function ready(expected) {
    await selected(expected);
    if (expected)
      await page.waitForFunction(() => {
        const trigger = document.querySelector(
          '[data-testid="library-selection"] button[aria-label^="操作已选"]',
        );
        return trigger && !trigger.disabled;
      });
    await settle();
  }
  async function current(number, loaded = number === 4 ? 1 : 80) {
    await page.waitForFunction(
      ({ number, loaded }) =>
        new URL(location.href).searchParams.get('page') === String(number) &&
        Number(
          document.querySelector('[data-testid="library-list"]')?.dataset
            .loadedCount,
        ) === loaded &&
        !document.querySelector('[data-testid="library-loading"]'),
      { number, loaded },
    );
    await settle();
  }
  async function action(expected, label) {
    await ready(expected);
    await page.click(button(`操作已选 ${expected} 张图片`));
    await page.click(`loc=role:menuitem[name="${label}"]`);
  }
  async function choose(index) {
    await page.hover(button(`查看图片：${name(index)}`));
    await page.click(`label:has(input[aria-label="选择图片：${name(index)}"])`);
  }
  async function panel(expected) {
    await action(expected, '查看已选清单');
    await page.waitForSelector('[data-testid="library-selected-panel"]');
    await settle();
  }
  async function closePanel() {
    await page.click(button('关闭已选清单'));
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="library-selected-panel"]'),
    );
  }
  async function status() {
    return page.evaluate(
      () =>
        document.querySelector(
          '[data-testid="library-selection"] [role="status"]',
        )?.textContent,
    );
  }
  async function requests() {
    return page.evaluate(() => window.__selection174.requests);
  }
  async function notice(removed) {
    await page.waitForFunction(
      (removed) =>
        document
          .querySelector('[data-testid="library-selection-notice"]')
          ?.textContent.includes(`已移除 ${removed} 张`),
      removed,
    );
  }
  async function publish() {
    // The channel and payload come from src/components/library/library-changes.ts.
    await page.evaluate(() => {
      const channel = new BroadcastChannel('ariso:library-changed');
      channel.postMessage('changed');
      channel.close();
    });
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
    await page.evaluate(() => document.querySelector('main').scrollTo(0, 0));
    await settle();
  }
  async function shot(suffix) {
    const filename = `library-selection-reconciliation-${suffix}.png`;
    await page.screenshot({ path: join(config.output, filename) });
    report.screenshots.push(filename);
  }
  async function installMonitor() {
    await page.evaluate(() => {
      const original = window.fetch;
      window.__selection174 = { original, requests: [], fault: null };
      window.fetch = async (input, init) => {
        const url = new URL(String(input), location.href);
        const selection = url.pathname === '/api/images/selection';
        const list = url.pathname === '/api/images';
        const entry = {
          path: url.pathname,
          url: url.href,
          method: init?.method ?? 'GET',
          body: selection ? JSON.parse(init.body) : null,
        };
        if (selection || list) window.__selection174.requests.push(entry);
        const fault = selection ? window.__selection174.fault : null;
        if (fault) window.__selection174.fault = null;
        if (fault === 'fail') {
          entry.status = 503;
          return new Response(
            JSON.stringify({
              code: 'SELECTION_TEST_FAILURE',
              message: '核对服务暂时不可用',
            }),
            { status: 503, headers: { 'content-type': 'application/json' } },
          );
        }
        const response = await original(input, init);
        if (selection || list) {
          entry.status = response.status;
          const result = await response.clone().json();
          entry.items = result.items;
          entry.total = result.total;
        }
        if (fault === 'hold') {
          entry.aborted = init?.signal?.aborted ?? false;
          init?.signal?.addEventListener('abort', () => {
            entry.aborted = true;
          });
          // Deliberately deliver after abort to test the client's identity guard.
          await new Promise((resolve) => {
            window.__selection174.release = resolve;
          });
        }
        return response;
      };
    });
  }
  function check(message) {
    record.checks.push(message);
    report.checks.push(message);
  }
  try {
    await page.cdp('Emulation.setEmulatedMedia', {
      features: [
        { name: 'prefers-color-scheme', value: 'light' },
        { name: 'prefers-reduced-motion', value: 'reduce' },
      ],
    });
    await page.waitForFunction(() =>
      document.documentElement.classList.contains('light'),
    );
    await sql(
      `INSERT INTO storage_configs (id,name,type,enabled,local_path,created_at,updated_at) VALUES ('${storageId}','Issue 174 selection storage','local',1,'issue174-selection',${created},${created})`,
    );
    const values = Array.from(
      { length: count },
      (_, index) =>
        `('${id(index)}','${storageId}','${name(index)}','${name(index)}','private','png','image/png',640,480,${1000 + index},'static','ready',${created - index},${created})`,
    );
    await sql(
      `INSERT INTO media_images (id,storage_id,original_name,display_name,visibility,format,mime,width,height,byte_size,classification,processing_status,created_at,updated_at) VALUES ${values.join(',')}`,
    );
    await mkdir(thumbnailDirectory, { recursive: true });
    const png = await readFile(
      join(config.projectDirectory, 'tests/fixtures/runtime/images/sample.png'),
    );
    for (const index of [0, 1, 3, 4]) {
      await writeFile(join(thumbnailDirectory, `${id(index)}.png`), png);
      const object = `thumbnail-${id(index)}`;
      await sql(
        `INSERT INTO media_objects (id,image_id,storage_id,key,purpose,status,byte_size,format,mime,created_at,updated_at) VALUES ('${object}','${id(index)}','${storageId}','library-selection/${id(index)}.png','thumbnail','stored',${png.length},'png','image/png',${created},${created})`,
      );
      await sql(
        `INSERT INTO media_versions (image_id,kind,object_id,width,height,byte_size,format,mime,created_at) VALUES ('${id(index)}','thumbnail','${object}',64,48,${png.length},'png','image/png',${created})`,
      );
    }
    await resize(1440, 1080);
    await page.goto(`${config.origin}/library?q=${search}&pageSize=80&page=1`);
    await current(1);
    await page.click('loc=role:radio[name="网格"]');
    await installMonitor();
    await choose(0);
    await action(1, '全选当前页');
    await ready(80);
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
      ]) {
        await resize(width, height);
        await page.waitForFunction(
          () =>
            [
              ...document.querySelectorAll(
                '[data-testid="library-gallery"] img',
              ),
            ].filter((img) => img.complete && img.naturalWidth > 0).length >= 2,
        );
        await panel(80);
        await page.waitForFunction(
          () =>
            [
              ...document.querySelectorAll(
                '[data-testid="library-selected-panel"] img',
              ),
            ].filter((img) => img.complete && img.naturalWidth > 0).length >= 2,
        );
        await shot(`normal-${theme}-${width}x${height}`);
        await closePanel();
      }
    }
    await page.cdp('Emulation.setEmulatedMedia', {
      features: [
        { name: 'prefers-color-scheme', value: 'light' },
        { name: 'prefers-reduced-motion', value: 'reduce' },
      ],
    });
    await resize(1440, 1080);
    check(
      'Normal desktop/mobile light/dark gallery and selected-popover screenshots contain at least two decoded production thumbnail images, seeded into the independent fixture storage.',
    );
    for (const number of [2, 3]) {
      await page.click('nav[aria-label="图库分页"] button:has-text("下一页")');
      await current(number);
      await ready((number - 1) * 80);
      assert.match(
        await status(),
        new RegExp(`当前页 0 张，其他页 ${(number - 1) * 80} 张`),
      );
      await action((number - 1) * 80, '全选当前页');
      await ready(number * 80);
    }
    await page.click('nav[aria-label="图库分页"] button:has-text("下一页")');
    await current(4);
    await ready(240);
    assert.match(await status(), /当前页 0 张，其他页 240 张/);
    await choose(240);
    await ready(count);
    await action(count, '取消当前页选择');
    await ready(240);
    await choose(240);
    await ready(count);
    await page.evaluate(() => history.back());
    await current(3);
    await ready(count);
    assert.match(await status(), /当前页 80 张，其他页 161 张/);
    await page.evaluate(() => history.forward());
    await current(4);
    await ready(count);
    assert.match(await status(), /当前页 1 张，其他页 240 张/);
    const layoutBefore = (await requests()).length;
    await page.click('loc=role:radio[name="瀑布流"]');
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="library-list"]').dataset
          .layout === 'masonry',
    );
    await ready(count);
    assert.equal((await requests()).length, layoutBefore);
    check(
      '241 explicit IDs across four pages survive page select/deselect, Back/Forward and grid-to-masonry changes; newly displayed page records stay unselected until chosen.',
    );

    const panelBefore = (await requests()).length;
    await panel(count);
    for (let number = 2; number <= 11; number++) {
      await page.click(
        'nav[aria-label="已选清单分页"] button:has-text("下一页")',
      );
      await page.waitForFunction(
        (number) =>
          document
            .querySelector('nav[aria-label="已选清单分页"]')
            ?.textContent.includes(`${number}/13`),
        number,
      );
      assert.equal(
        await page.evaluate(
          () => document.querySelectorAll('[data-selected-image-id]').length,
        ),
        20,
      );
    }
    await page.waitForSelector(`[data-selected-image-id="${id(200)}"]`);
    await page.click(button(`移除选择：${name(200)}`));
    await ready(240);
    assert.equal(
      await page.evaluate(
        (id) => !!document.querySelector(`[data-selected-image-id="${id}"]`),
        id(200),
      ),
      false,
    );
    await closePanel();
    assert.equal(
      (await requests()).length,
      panelBefore,
      'Selected-list page changes and row removal do not request any images',
    );
    removedAt = (await requests()).length;
    check(
      'The actual 201st selected item can be removed from page 11; selected-list pages mount only 20 rows and perform no list or reconciliation requests.',
    );

    for (const number of [3, 2, 1]) {
      await page.click('nav[aria-label="图库分页"] button:has-text("上一页")');
      await current(number);
      await ready(240);
    }
    // Mix a visible invalid card with two off-page IDs and a valid moved record.
    await sql(`DELETE FROM media_versions WHERE image_id='${id(0)}'`);
    await sql(`DELETE FROM media_objects WHERE image_id='${id(0)}'`);
    await sql(`DELETE FROM media_images WHERE id='${id(0)}'`);
    await sql(
      `UPDATE media_images SET trashed_at=${created} WHERE id='${id(80)}'`,
    );
    await sql(
      `UPDATE media_images SET display_name='no-longer-matching.png',original_name='no-longer-matching.png' WHERE id='${id(81)}'`,
    );
    await sql(
      `UPDATE media_images SET display_name='${search}renamed.png' WHERE id='${id(3)}'`,
    );
    await sql(
      `UPDATE media_images SET created_at=${created + 1000} WHERE id='${id(240)}'`,
    );
    await sql(
      `UPDATE storage_configs SET name='Issue 174 refreshed storage',enabled=0 WHERE id='${storageId}'`,
    );
    const changeBefore = (await requests()).length;
    await publish();
    await ready(237);
    await notice(3);
    await page.waitForFunction(
      (id) => !document.querySelector(`[data-image-id="${id}"]`),
      id(0),
    );
    assert.match(await status(), /当前页 79 张，其他页 158 张/);
    const changeRequests = (await requests()).slice(changeBefore);
    assert.equal(
      changeRequests.filter((item) => item.path === '/api/images').length,
      0,
      'Domain notification prunes confirmed invalid cards without refetching the list',
    );
    assert.deepEqual(
      changeRequests
        .filter((item) => item.path === '/api/images/selection')
        .map((item) => item.body.ids.length)
        .sort((a, b) => a - b),
      [40, 200],
    );
    await panel(237);
    await page.waitForSelector(`[data-selected-image-id="${id(3)}"]`);
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll('[data-selected-image-id]')].map(
        (node) => ({
          id: node.dataset.selectedImageId,
          text: node.textContent,
        }),
      ),
    );
    assert.ok(
      rows
        .find((row) => row.id === id(3))
        .text.includes(`${search}renamed.png`),
    );
    assert.ok(rows.every((row) => ![id(0), id(80), id(81)].includes(row.id)));
    assert.ok(
      rows.every((row) =>
        row.text.includes('Issue 174 refreshed storage（已停用）'),
      ),
    );
    await shot('updated-light-1440x1080');
    await closePanel();
    await resize(390, 844);
    await shot('notice-light-390x844');
    await page.cdp('Emulation.setEmulatedMedia', {
      features: [
        { name: 'prefers-color-scheme', value: 'dark' },
        { name: 'prefers-reduced-motion', value: 'reduce' },
      ],
    });
    await page.waitForFunction(() =>
      document.documentElement.classList.contains('dark'),
    );
    await shot('notice-dark-390x844');
    await page.cdp('Emulation.setEmulatedMedia', {
      features: [
        { name: 'prefers-color-scheme', value: 'light' },
        { name: 'prefers-reduced-motion', value: 'reduce' },
      ],
    });
    await page.waitForFunction(() =>
      document.documentElement.classList.contains('light'),
    );
    await resize(1440, 1080);
    check(
      'Real deletion, recycling and search mismatch remove exactly three choices across current and other pages after a domain change; the visible invalid card disappears, valid other-page choices persist, and a changed sort position, names and disabled-storage labels refresh.',
    );
    await page.click('nav[aria-label="图库分页"] button:has-text("下一页")');
    await current(2, 78);
    await ready(237);
    assert.match(await status(), /当前页 78 张，其他页 159 张/);
    assert.equal(
      await page.evaluate(
        (ids) =>
          ids.some((id) => document.querySelector(`[data-image-id="${id}"]`)),
        [id(80), id(81)],
      ),
      false,
      'Cached other pages cannot expose recycled or mismatching cards for reselection',
    );
    await page.evaluate(() => history.back());
    await current(1, 79);
    await ready(237);
    await page.evaluate(() => history.forward());
    await current(2, 78);
    await ready(237);
    await page.evaluate(() => history.back());
    await current(1, 79);
    await ready(237);
    check(
      'Returning to the previously cached second page and traversing Back/Forward never restores invalid cards or their checkbox targets; valid selections survive in both cached pages.',
    );

    // The production list result is an independent trigger, with no notification.
    await sql(`DELETE FROM media_images WHERE id='${id(84)}'`);
    const refreshBefore = (await requests()).length;
    // Selection replaces the refresh toolbar button. Navigate to an uncached
    // page through the same native history API used by the query adapter.
    await page.evaluate(() => {
      const url = new URL(location.href);
      url.searchParams.set('page', '5');
      history.pushState(null, '', url);
    });
    await current(5, 0);
    await ready(236);
    await notice(1);
    const refreshRequests = (await requests()).slice(refreshBefore);
    assert.equal(
      refreshRequests.filter((item) => item.path === '/api/images').length,
      1,
    );
    assert.deepEqual(
      refreshRequests
        .filter((item) => item.path === '/api/images/selection')
        .map((item) => item.body.ids.length)
        .sort((a, b) => a - b),
      [37, 200],
    );
    check(
      'A fresh production list response independently reconciles the selected IDs and removes a newly deleted off-page image without clearing valid choices.',
    );
    await page.evaluate(() => history.back());
    await current(1, 79);
    await ready(236);

    await sql(`DELETE FROM media_images WHERE id='${id(5)}'`);
    await page.evaluate(() => {
      window.__selection174.fault = 'fail';
    });
    await publish();
    await page.waitForSelector(
      '[data-testid="library-selection-error"][role="alert"]',
    );
    await ready(236);
    assert.equal(
      await page.evaluate(
        (id) => !!document.querySelector(`[data-image-id="${id}"]`),
        id(5),
      ),
      true,
      'A failed reconciliation does not silently prune an unconfirmed invalid card',
    );
    assert.match(
      await page.evaluate(
        () =>
          document.querySelector('[data-testid="library-selection-error"]')
            .textContent,
      ),
      /选择状态核对失败/,
    );
    await shot('error-light-1440x1080');
    await resize(390, 844);
    await shot('error-light-390x844');
    await page.cdp('Emulation.setEmulatedMedia', {
      features: [
        { name: 'prefers-color-scheme', value: 'dark' },
        { name: 'prefers-reduced-motion', value: 'reduce' },
      ],
    });
    await page.waitForFunction(() =>
      document.documentElement.classList.contains('dark'),
    );
    await shot('error-dark-390x844');
    await page.cdp('Emulation.setEmulatedMedia', {
      features: [
        { name: 'prefers-color-scheme', value: 'light' },
        { name: 'prefers-reduced-motion', value: 'reduce' },
      ],
    });
    await page.waitForFunction(() =>
      document.documentElement.classList.contains('light'),
    );
    await resize(1440, 1080);
    await page.click(button('重试核对'));
    await ready(235);
    await notice(1);
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="library-selection-error"]'),
    );
    await page.waitForFunction(
      (id) => !document.querySelector(`[data-image-id="${id}"]`),
      id(5),
    );
    check(
      'A failed batch preserves all 236 explicit choices with an accessible error; retry reads the real API, removes the newly deleted ID and clears the error.',
    );

    // The populated popover keeps the shared shell intact at every mandated width.
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
        [360, 800],
        [390, 844],
        [430, 900],
        [768, 1024],
        [1440, 1080],
        [390, 560],
      ]) {
        await resize(width, height);
        await ready(235);
        await panel(235);
        const geometry = await page.evaluate(() => {
          const region = document.querySelector(
            '[data-testid="library-selected-panel"]',
          );
          const rect = region.getBoundingClientRect();
          const main = document.querySelector('main');
          const list = region.querySelector('ul[aria-label="已选图片"]');
          const listRect = list.getBoundingClientRect();
          const first = list.querySelector('[data-selected-image-id]');
          const rowRect = first.getBoundingClientRect();
          const visibleText = (node) => {
            const bounds = node.getBoundingClientRect();
            const style = getComputedStyle(node);
            return (
              bounds.height > 0 &&
              bounds.top >= listRect.top - 1 &&
              bounds.bottom <= listRect.bottom + 1 &&
              style.visibility === 'visible' &&
              Number(style.opacity) > 0
            );
          };
          const labels = first.querySelectorAll(
            'button[aria-label^="查看图片："] .grid > span',
          );
          return {
            left: rect.left,
            right: rect.right,
            bottom: rect.bottom,
            mainBottom: main.getBoundingClientRect().bottom,
            width: document.documentElement.scrollWidth,
            mainWidth: main.clientWidth,
            mainScrollWidth: main.scrollWidth,
            focused: region.contains(document.activeElement),
            listHeight: listRect.height,
            rowHeight: rowRect.height,
            firstRowVisible:
              rowRect.top >= listRect.top - 1 &&
              rowRect.bottom <= listRect.bottom + 1,
            nameVisible: labels.length === 2 && visibleText(labels[0]),
            sourceVisible: labels.length === 2 && visibleText(labels[1]),
            targets: [...region.querySelectorAll('button')]
              .filter((node) => node.getClientRects().length && !node.disabled)
              .map((node) => {
                const bounds = node.getBoundingClientRect();
                return {
                  name: node.getAttribute('aria-label') ?? node.textContent,
                  width: bounds.width,
                  height: bounds.height,
                };
              }),
            selectedRows: region.querySelectorAll('[data-selected-image-id]')
              .length,
          };
        });
        assert.ok(geometry.left >= 0 && geometry.right <= width);
        assert.ok(geometry.bottom <= geometry.mainBottom + 1);
        assert.ok(
          geometry.width <= width &&
            geometry.mainScrollWidth <= geometry.mainWidth,
        );
        assert.equal(geometry.focused, true);
        assert.equal(geometry.selectedRows, 20);
        assert.ok(
          geometry.listHeight >= geometry.rowHeight,
          `Selected-list body must fit one complete row: ${JSON.stringify(geometry)}`,
        );
        assert.equal(geometry.firstRowVisible, true);
        assert.equal(
          geometry.nameVisible,
          true,
          'The first selected name is readable without vertical clipping',
        );
        assert.equal(
          geometry.sourceVisible,
          true,
          'The first selected source is readable without vertical clipping',
        );
        if (width < 1200)
          assert.ok(
            geometry.targets.every(
              (target) => target.width >= 44 && target.height >= 44,
            ),
            JSON.stringify(geometry.targets),
          );
        await shot(`${theme}-${width}x${height}`);
        await page.keyboard.press('Escape');
        await page.waitForFunction(
          () =>
            !document.querySelector('[data-testid="library-selected-panel"]'),
        );
        assert.equal(
          await page.evaluate(() =>
            document.activeElement?.getAttribute('aria-label'),
          ),
          '操作已选 235 张图片',
        );
      }
    }
    check(
      'Real selected-list screenshots cover light/dark 360, 390, 430, 768, 1440 widths and a 390×560 short viewport; the panel has bounded dimensions, 44px mobile/tablet targets, initial keyboard focus and Escape focus restoration.',
    );

    // Exercise real short-viewport row scrolling after all 235-count captures.
    // These final explicit removals avoid restoring stale cached metadata.
    let remainingSelection = 235;
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
      await resize(390, 560);
      await panel(remainingSelection);
      const target = await page.evaluate(() => {
        const row = [
          ...document.querySelectorAll('[data-selected-image-id]'),
        ][8];
        return {
          id: row.dataset.selectedImageId,
          name: row
            .querySelector('button[aria-label^="查看图片："]')
            .getAttribute('aria-label')
            .slice('查看图片：'.length),
        };
      });
      const reveal = async () => {
        const scroll = await page.evaluate((id) => {
          const list = document.querySelector(
            '[data-testid="library-selected-panel"] ul',
          );
          const listRect = list.getBoundingClientRect();
          const row = document
            .querySelector(`[data-selected-image-id="${id}"]`)
            .getBoundingClientRect();
          return {
            x: listRect.left + listRect.width / 2,
            y: listRect.top + listRect.height / 2,
            delta: row.top - listRect.top,
          };
        }, target.id);
        await page.mouse.move(scroll.x, scroll.y);
        if (Math.abs(scroll.delta) > 1)
          await page.mouse.wheel(0, scroll.delta, {
            label: '滚动已选图片清单',
          });
        await page.waitForFunction((id) => {
          const list = document.querySelector(
            '[data-testid="library-selected-panel"] ul',
          );
          const listRect = list.getBoundingClientRect();
          const row = document
            .querySelector(`[data-selected-image-id="${id}"]`)
            .getBoundingClientRect();
          return (
            list.scrollTop > 0 &&
            row.top >= listRect.top - 1 &&
            row.bottom <= listRect.bottom + 1
          );
        }, target.id);
      };
      await reveal();
      await shot(`short-scrolled-${theme}-390x560`);
      await page.click(
        `[data-selected-image-id="${target.id}"] button[aria-label="查看图片：${target.name}"]`,
      );
      await page.waitForSelector('loc=role:dialog[name="图片详情"]');
      await selected(remainingSelection);
      await page.click(button('关闭图片详情'));
      await page.waitForFunction(
        () => !new URL(location.href).searchParams.has('image'),
      );
      await ready(remainingSelection);
      if (
        !(await page.evaluate(
          () =>
            !!document.querySelector('[data-testid="library-selected-panel"]'),
        ))
      )
        await panel(remainingSelection);
      await reveal();
      await page.click(
        `[data-selected-image-id="${target.id}"] button[aria-label="移除选择：${target.name}"]`,
      );
      remainingSelection--;
      await ready(remainingSelection);
      assert.equal(
        await page.evaluate(
          (id) => !!document.querySelector(`[data-selected-image-id="${id}"]`),
          target.id,
        ),
        false,
      );
      await shot(`short-removed-${theme}-390x560`);
      await page.keyboard.press('Escape');
      await page.waitForFunction(
        () => !document.querySelector('[data-testid="library-selected-panel"]'),
      );
    }
    check(
      'Both light/dark 390×560 panels fit a complete readable row; real wheel scrolling exposes a non-first selected row, opening and closing its detail retains all choices, and removing it decrements only the explicit selection.',
    );

    await resize(1440, 1080);
    await page.evaluate(() => {
      window.__selection174.fault = 'hold';
    });
    await publish();
    await page.waitForFunction(
      () => typeof window.__selection174.release === 'function',
    );
    await selected(remainingSelection);
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector(
            '[data-testid="library-selection"] button[aria-label^="操作已选"]',
          ).disabled,
      ),
      true,
    );
    await shot('pending-dark-1440x1080');
    await page.fill('input[aria-label="搜索图片名称"]', 'issue174-no-results');
    await page.press('input[aria-label="搜索图片名称"]', 'Enter');
    await page.waitForFunction(
      () =>
        new URL(location.href).searchParams.get('q') === 'issue174-no-results',
    );
    await ready(0);
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="library-list"]')?.dataset
          .loadedCount === '0' &&
        !document.querySelector('[data-testid="library-loading"]'),
    );
    await page.evaluate(() => window.__selection174.release());
    await settle();
    await ready(0);
    assert.ok(
      (await requests()).some((request) => request.aborted),
      'Changing query aborts the held old-identity request',
    );
    await shot('empty-dark-1440x1080');
    check(
      'Pending reconciliation disables selection actions; changing the search aborts its old request, and deliberately releasing that late successful response never recreates the old selection.',
    );

    record.network = await requests();
    for (const request of record.network.filter(
      (item) => item.path === '/api/images/selection',
    )) {
      assert.equal(request.method, 'POST');
      assert.ok(request.body.ids.length > 0 && request.body.ids.length <= 200);
      assert.ok(request.body.ids.every((value) => value.startsWith(prefix)));
      const params = new URLSearchParams(request.body.query);
      assert.equal(params.get('q'), search);
      assert.equal(params.has('page'), false);
      assert.equal(params.has('cursor'), false);
      if (request.status === 200) {
        assert.ok(
          request.items.every((item) => request.body.ids.includes(item.id)),
        );
        assert.ok(
          request.items.every(
            (item) =>
              Object.keys(item).sort().join(',') ===
              'byteSize,displayName,id,processingStatus,storage,thumbnailUrl',
          ),
          'Response contains only the selection projection, no full image records',
        );
        for (const item of request.items) {
          assert.deepEqual(Object.keys(item.storage).sort(), [
            'enabled',
            'id',
            'name',
          ]);
          assert.equal(item.processingStatus, 'ready');
          assert.equal(
            item.byteSize,
            1000 + Number(item.id.slice(prefix.length)),
          );
        }
      }
    }
    assert.ok(
      record.network
        .slice(removedAt)
        .filter((item) => item.path === '/api/images/selection')
        .every((request) => !request.body.ids.includes(id(200))),
      'Explicitly removed selection is never sent to later reconciliation',
    );
    const resources = await page.evaluate(() =>
      performance.getEntriesByType('resource').map((entry) => entry.name),
    );
    assert.ok(
      resources.every((value) => {
        const url = new URL(value);
        if (!url.pathname.startsWith('/i/')) return true;
        return (
          url.searchParams.get('type') === 'thumbnail' &&
          !url.searchParams.has('download')
        );
      }),
      'Selection never requests original or full image versions',
    );
    assert.ok(
      record.network
        .filter((item) => item.path === '/api/images')
        .every((item) =>
          new URL(item.url).searchParams.get('q')?.startsWith('issue174-'),
        ),
      'No unfiltered full-library list scan',
    );
    record.resources = resources;
    check(
      'Network receipts show bounded POST batches containing only still-explicit selected IDs and an unpositioned query; successful responses are lightweight projections, with no all-library scans or original-image preloads.',
    );
    record.status = 'passed';
  } catch (error) {
    record.error = String(error.stack ?? error);
    record.network = await page.evaluate(
      () => window.__selection174?.requests ?? [],
    );
    throw error;
  } finally {
    await page.evaluate(() => {
      if (window.__selection174) {
        window.__selection174.release?.();
        window.fetch = window.__selection174.original;
        delete window.__selection174;
      }
    });
    await page.cdp('Emulation.setEmulatedMedia', {
      features: [
        { name: 'prefers-color-scheme', value: originalScheme },
        { name: 'prefers-reduced-motion', value: 'reduce' },
      ],
    });
    await resize(1440, 1080);
    await sql(`DELETE FROM media_versions WHERE image_id GLOB '${prefix}*'`);
    await sql(`DELETE FROM media_objects WHERE image_id GLOB '${prefix}*'`);
    await sql(`DELETE FROM media_images WHERE id GLOB '${prefix}*'`);
    await sql(`DELETE FROM storage_configs WHERE id='${storageId}'`);
    await rm(thumbnailDirectory, { recursive: true, force: true });
  }
}
