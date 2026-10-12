import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { checkShortcutLayouts } from './collection-shortcut-layouts.mjs';
import { activateLibraryAction } from './library-action-controls.mjs';
import { verifySearchToolbarLayouts } from './search-toolbar-layout.mjs';

/** Uses two real images supplied by the authenticated disposable-preview caller. */
export async function runLibraryShortcuts(page, { origin, output, sql }) {
  const prefix = `shortcut-menu-${randomUUID().slice(0, 8)}`;
  const menu = '[role="menu"][aria-label="已选图片操作"]';
  const batch = '[data-testid="library-batch"]';
  const submit = '[data-testid="batch-submit"]';
  const button = (name) => `loc=role:button[name="${name}"]`;
  const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
  const report = { status: 'failed', checks: [], layouts: [], screenshots: [] };
  let originals = [];
  let memberships = [];
  const albums = [];
  const request = async (url, method, body, expected = 200) => {
    const response = await page.fetch(url, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    assert.equal(
      response.status,
      expected,
      `${method} ${url}: ${response.body}`,
    );
    return JSON.parse(response.body);
  };
  async function settled() {
    await page.waitForFunction(
      () => !document.querySelector('[data-entering],[data-exiting]'),
    );
  }
  async function loaded(count) {
    await page.waitForFunction(
      (count) =>
        Number(
          document.querySelector('[data-testid="library-list"]')?.dataset
            .loadedCount,
        ) === count &&
        document
          .querySelector('[data-testid="library-gallery"]')
          ?.getAttribute('aria-busy') === 'false',
      count,
    );
    await settled();
  }
  async function visit(path = '/library', count = 2) {
    await page.goto(`${origin}${path}?q=${prefix}&pageSize=20&page=1`);
    await loaded(count);
  }
  async function selected(count) {
    await page.waitForFunction((count) => {
      const trigger = document.querySelector(
        '[data-testid="library-selection"] button[aria-label^="管理选择"]',
      );
      return count
        ? trigger?.getAttribute('aria-label') === `管理选择，已选 ${count} 张`
        : !trigger;
    }, count);
  }
  async function choose(index) {
    const name = `${prefix}-${index}`;
    await page.hover(button(`查看图片：${name}`));
    await page.click(`label:has(input[aria-label="选择图片：${name}"])`);
  }
  async function openMenu(count) {
    await selected(count);
    await page.click(button('更多图片操作'));
    await page.waitForSelector(menu);
    await settled();
    return menuItems();
  }
  const menuItems = () =>
    page.evaluate(
      (menu) =>
        [...document.querySelectorAll(`${menu} [role="menuitem"]`)].map((n) =>
          n.textContent.trim(),
        ),
      menu,
    );
  async function closeMenu() {
    await page.keyboard.press('Escape');
    await page.waitForSelector(menu, { state: 'hidden' });
  }
  async function action(label, count) {
    await selected(count);
    await activateLibraryAction(page, label, count);
    await page.waitForSelector(batch);
    await settled();
  }
  async function success(title) {
    await page.waitForSelector(batch, { state: 'hidden' });
    await page.waitForFunction(
      (title) =>
        [...document.querySelectorAll('[data-slot="toast-title"]')].some(
          (n) => n.textContent === title,
        ),
      title,
    );
    await settled();
  }
  async function monitor() {
    await page.evaluate(() => {
      const original = window.fetch;
      window.__libraryShortcutsOriginal = original;
      window.__libraryShortcutsRequests = [];
      window.fetch = (input, init) => {
        if (
          new URL(String(input), location.href).pathname ===
            '/api/images/batch' &&
          init?.method === 'POST'
        )
          window.__libraryShortcutsRequests.push(JSON.parse(init.body));
        return original(input, init);
      };
    });
  }
  async function commands() {
    return page.evaluate(() => window.__libraryShortcutsRequests);
  }
  async function restoreFetch() {
    await page.evaluate(() => {
      if (window.__libraryShortcutsOriginal) {
        window.fetch = window.__libraryShortcutsOriginal;
        delete window.__libraryShortcutsOriginal;
      }
    });
  }
  async function rightClick(index) {
    const selector = `[data-testid="library-card"][data-image-id="${originals[index].id}"] button[data-library-open]`;
    await page.focus(selector);
    const point = await page.evaluate((selector) => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, selector);
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
    await page.waitForSelector(menu);
    await settled();
  }
  async function menuLayout(name) {
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
      for (const width of [390, 1440]) {
        await page.cdp('Emulation.setDeviceMetricsOverride', {
          width,
          height: 844,
          deviceScaleFactor: 1,
          mobile: width < 768,
        });
        await openMenu(1);
        const layout = await page.evaluate((menu) => {
          const popup = document
            .querySelector(menu)
            .closest('[data-slot="dropdown-popover"]');
          const r = popup.getBoundingClientRect();
          return {
            width: innerWidth,
            scrollWidth: document.documentElement.scrollWidth,
            bounds: {
              left: r.left,
              right: r.right,
              top: r.top,
              bottom: r.bottom,
            },
            small: [...document.querySelectorAll(`${menu} [role="menuitem"]`)]
              .filter(
                (n) =>
                  n.getBoundingClientRect().height <
                  (innerWidth < 768 ? 43.5 : 35.5),
              )
              .map((n) => n.textContent),
          };
        }, menu);
        assert.ok(
          layout.scrollWidth <= width,
          `${name} page does not overflow`,
        );
        assert.ok(
          layout.bounds.left >= 0 &&
            layout.bounds.right <= width + 1 &&
            layout.bounds.top >= 0 &&
            layout.bounds.bottom <= 845,
          `${name} menu stays in the viewport`,
        );
        assert.deepEqual(layout.small, [], `${name} menu target height`);
        const file = `${name}-${theme}-${width}.png`;
        await page.screenshot({ path: join(output, file) });
        report.screenshots.push(file);
        report.layouts.push({ name, theme, ...layout });
        await closeMenu();
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
    report.stage = 'real image fixture';
    originals = await sql(
      "SELECT id, display_name, visibility FROM media_images WHERE trashed_at IS NULL AND deletion_status IS NULL AND processing_status = 'ready' ORDER BY created_at DESC, id LIMIT 2",
    );
    assert.equal(originals.length, 2, 'Caller supplied two ready images');
    memberships = await sql(
      `SELECT album_id, image_id, joined_at FROM album_images WHERE image_id IN (${originals.map((n) => quote(n.id)).join(',')})`,
    );
    for (const [index, image] of originals.entries()) {
      await request(`/api/images/${image.id}`, 'PATCH', {
        displayName: `${prefix}-${index}`,
        visibility: 'public',
      });
      await request(`/api/images/${image.id}/collections`, 'PATCH', {
        albumIds: [],
      });
    }
    for (const suffix of ['current', 'other']) {
      const created = await request(
        '/api/albums',
        'POST',
        {
          name: `${prefix}-${suffix}`,
          description: '',
        },
        201,
      );
      albums.push(created.album.id);
    }
    await visit();
    await selected(0);
    report.layouts.push(
      ...(await verifySearchToolbarLayouts(page, {
        output,
        name: 'library-toolbar-idle',
      })),
    );

    report.stage = 'conditional toolbar and compact right-click';
    await choose(0);
    await selected(1);
    report.layouts.push(
      ...(await verifySearchToolbarLayouts(page, {
        output,
        name: 'library-toolbar-selected',
        selected: true,
      })),
    );
    let entries = await openMenu(1);
    assert.ok(entries.includes('设为私有'));
    assert.ok(!entries.includes('设为公开'));
    assert.ok(!entries.includes('从相册移除'));
    assert.ok(!entries.includes('添加标签'));
    assert.ok(!entries.includes('复制链接'));
    assert.ok(!entries.includes('添加到相册'));
    assert.ok(!entries.includes('查看已选清单'));
    for (const label of ['添加标签', '复制链接', '添加到相册'])
      assert.equal(
        await page.evaluate(
          (label) =>
            !!document.querySelector(
              `[data-testid="library-selection"] button[aria-label="${label}"]`,
            ),
          label,
        ),
        true,
      );
    assert.ok(entries.includes('重新处理'));
    await closeMenu();
    await menuLayout('library-actions');
    await rightClick(0);
    entries = await menuItems();
    assert.deepEqual(entries, [
      '查看图片',
      '复制链接',
      '添加到相册',
      '设为私有',
      '移入回收站',
    ]);
    await page.screenshot({
      path: join(output, 'library-context-compact.png'),
    });
    report.screenshots.push('library-context-compact.png');
    await closeMenu();
    await page.waitForFunction(
      (id) =>
        document.activeElement?.closest('[data-image-id]')?.dataset.imageId ===
        id,
      originals[0].id,
    );
    report.checks.push(
      'Only selected images expose the toolbar action menu; public/no-album selection hides redundant public/remove actions. Right-click contains only five common actions and Escape restores card focus.',
    );

    report.stage = 'selection manager';
    await page.click(button('管理选择，已选 1 张'));
    await page.waitForSelector('[data-testid="library-selected-panel"]');
    const selectCurrentLabel = await page.evaluate(() =>
      document
        .querySelector(
          '[data-testid="library-selected-panel"] button[aria-label^="全选"]',
        )
        .getAttribute('aria-label'),
    );
    await page.click(button(selectCurrentLabel));
    await selected(2);
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelectorAll(
            '[data-testid="library-selected-panel"] [data-selected-image-id]',
          ).length,
      ),
      2,
    );
    await page.keyboard.press('Escape');
    await page.waitForFunction(
      () =>
        document.activeElement?.getAttribute('aria-label') ===
        '管理选择，已选 2 张',
    );
    await activateLibraryAction(page, '清空全部选择', 2);
    await selected(0);
    report.checks.push(
      'Manage selection contains thumbnails and selection commands; select-current keeps it open, Escape returns focus, and clear removes the selection without a business menu.',
    );

    await request(`/api/images/${originals[0].id}`, 'PATCH', {
      visibility: 'private',
    });
    await visit();
    await choose(0);
    entries = await openMenu(1);
    assert.ok(entries.includes('设为公开'));
    assert.ok(!entries.includes('设为私有'));
    await closeMenu();
    await choose(1);
    entries = await openMenu(2);
    assert.ok(entries.includes('设为公开') && entries.includes('设为私有'));
    await closeMenu();
    await monitor();
    await action('设为公开', 2);
    assert.ok(
      await page.evaluate(
        (batch) =>
          document
            .querySelector(batch)
            .textContent.includes('将1张图片设为公开'),
        batch,
      ),
    );
    report.layouts.push(
      ...(await checkShortcutLayouts(
        page,
        output,
        'visibility-confirm',
        batch,
      )),
    );
    await page.click(submit);
    await success('批量设为公开完成');
    await selected(2);
    assert.deepEqual(
      (await commands()).map((n) => ({ ids: n.ids, command: n.command })),
      [
        {
          ids: [originals[0].id],
          command: { type: 'visibility', visibility: 'public' },
        },
      ],
    );
    assert.deepEqual(
      await sql(
        `SELECT visibility FROM media_images WHERE id IN (${originals.map((n) => quote(n.id)).join(',')})`,
      ),
      [{ visibility: 'public' }, { visibility: 'public' }],
    );
    entries = await openMenu(2);
    assert.ok(!entries.includes('设为公开'));
    await closeMenu();
    await restoreFetch();
    report.checks.push(
      'Private-only selection hides private; mixed selection exposes both choices. The confirmed public mutation sends only the one private ID, retains both matching selections and refreshes menu eligibility from real metadata.',
    );

    report.stage = 'explicit library target and current-album-only removal';
    await request(`/api/images/${originals[0].id}/collections`, 'PATCH', {
      albumIds: albums,
    });
    await visit();
    await choose(0);
    await monitor();
    await action('从相册移除', 1);
    await page.waitForSelector(`${batch} input[aria-label="搜索目标相册"]`);
    assert.equal(
      await page.evaluate(
        (submit) => document.querySelector(submit).disabled,
        submit,
      ),
      true,
    );
    await page.fill(
      `${batch} input[aria-label="搜索目标相册"]`,
      `${prefix}-current`,
    );
    await page.waitForSelector(`[data-target-id="${albums[0]}"]`);
    await page.click(`[data-target-id="${albums[0]}"] label`);
    await page.waitForFunction(
      (submit) => !document.querySelector(submit).disabled,
      submit,
    );
    report.layouts.push(
      ...(await checkShortcutLayouts(page, output, 'album-target', batch)),
    );
    await page.click(submit);
    await success('从相册移除完成');
    await selected(1);
    assert.deepEqual(
      (await commands()).map((n) => n.command),
      [{ type: 'remove-albums', albumIds: [albums[0]] }],
    );
    assert.deepEqual(
      await sql(
        `SELECT album_id FROM album_images WHERE image_id = ${quote(originals[0].id)} ORDER BY album_id`,
      ),
      [{ album_id: albums[1] }],
    );
    await restoreFetch();
    await visit(`/albums/${albums[1]}`, 1);
    report.layouts.push(
      ...(await verifySearchToolbarLayouts(page, {
        output,
        name: 'album-toolbar-idle',
      })),
    );
    await choose(0);
    await selected(1);
    report.layouts.push(
      ...(await verifySearchToolbarLayouts(page, {
        output,
        name: 'album-toolbar-selected',
        selected: true,
      })),
    );
    await monitor();
    await action('从相册移除', 1);
    assert.equal(
      await page.evaluate(
        (batch) =>
          document.querySelectorAll(`${batch} [data-target-id]`).length,
        batch,
      ),
      0,
    );
    assert.ok(
      await page.evaluate(
        (batch) =>
          document
            .querySelector(batch)
            .textContent.includes('只从当前相册移出'),
        batch,
      ),
    );
    await page.click(submit);
    await success('从相册移除完成');
    await selected(0);
    assert.deepEqual(
      (await commands()).map((n) => n.command),
      [{ type: 'remove-albums', albumIds: [albums[1]] }],
    );
    assert.deepEqual(
      await sql(
        `SELECT album_id FROM album_images WHERE image_id = ${quote(originals[0].id)}`,
      ),
      [],
    );
    assert.equal(
      (
        await sql(
          `SELECT COUNT(*) AS count FROM media_images WHERE id = ${quote(originals[0].id)} AND trashed_at IS NULL`,
        )
      )[0].count,
      1,
    );
    report.checks.push(
      'Library removal requires an explicitly chosen target and leaves the other album intact. Album-context removal has no target list, freezes only the current album, removes its out-of-query selection and never deletes the image.',
    );

    report.stage = 'trash and restore success toasts';
    await restoreFetch();
    await visit();
    await choose(0);
    await choose(1);
    await action('移入回收站', 2);
    await page.click(submit);
    await success('图片已移入回收站');
    await selected(0);
    assert.equal(
      (
        await sql(
          `SELECT COUNT(*) AS count FROM media_images WHERE id IN (${originals.map((n) => quote(n.id)).join(',')}) AND trashed_at IS NOT NULL`,
        )
      )[0].count,
      2,
    );
    await page.goto(`${origin}/trash?q=${prefix}&pageSize=20&page=1`);
    await page.waitForFunction(
      () =>
        document.querySelectorAll('[data-testid="trash-list"] > li').length ===
        2,
    );
    await page.click(button('选择记录'));
    await page.click('label:has(input[aria-label="全选当前页回收记录"])');
    await selected(2);
    await action('恢复所选', 2);
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelectorAll('[data-testid="trash-list"] > li').length,
      ),
      2,
      'Restore confirmation keeps the existing list mounted',
    );
    await page.click(submit);
    await success('图片已恢复');
    await selected(0);
    assert.equal(
      (
        await sql(
          `SELECT COUNT(*) AS count FROM media_images WHERE id IN (${originals.map((n) => quote(n.id)).join(',')}) AND trashed_at IS NULL`,
        )
      )[0].count,
      2,
    );
    report.checks.push(
      'Real two-image trash and restore each require one confirmation, update the database, clear resolved selection and finish with a toast, without a success dialog.',
    );
    report.status = 'passed';
    delete report.stage;
    return report;
  } catch (error) {
    report.error = String(error.stack ?? error);
    report.snapshot = await page.snapshot();
    await page.screenshot({
      path: join(output, 'library-shortcuts-failure.png'),
    });
    throw error;
  } finally {
    await restoreFetch();
    for (const image of originals) {
      await request(`/api/images/${image.id}/restore`, 'POST');
      await request(`/api/images/${image.id}`, 'PATCH', {
        displayName: image.display_name,
        visibility: image.visibility,
      });
      await request(`/api/images/${image.id}/collections`, 'PATCH', {
        albumIds: memberships
          .filter((n) => n.image_id === image.id)
          .map((n) => n.album_id),
      });
    }
    for (const row of memberships)
      await sql(
        `UPDATE album_images SET joined_at = ${Number(row.joined_at)} WHERE album_id = ${quote(row.album_id)} AND image_id = ${quote(row.image_id)}`,
      );
    for (const albumId of albums)
      await request(`/api/albums/${albumId}`, 'DELETE');
    await writeFile(
      join(output, 'library-shortcuts.json'),
      `${JSON.stringify(report, null, 2)}\n`,
    );
  }
}
