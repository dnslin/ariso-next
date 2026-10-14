import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { checkShortcutLayouts } from './collection-shortcut-layouts.mjs';

/** The caller supplies an authenticated page and SQL access to its disposable preview only. */
export async function runAlbumImagePicker(page, config) {
  const { origin, output, sql } = config;
  const prefix = `shortcut-picker-${randomUUID().slice(0, 8)}-`;
  const id = (index) => `${prefix}${String(index).padStart(3, '0')}`;
  const report = { status: 'failed', checks: [], screenshots: [] };
  const modal = '[data-testid="album-image-picker"]';
  const button = (name) => `loc=role:button[name="${name}"]`;
  const choice = (imageId) =>
    `${modal} [data-testid="album-image-choice"][data-image-id="${imageId}"]`;
  let albumId;
  const request = (url, init) =>
    page.evaluate(
      async ({ url, init }) => {
        const response = await fetch(url, init);
        return { status: response.status, body: await response.json() };
      },
      { url, init },
    );
  async function open() {
    if (
      await page.evaluate(() =>
        Boolean(document.querySelector('[data-slot="toast"]')),
      )
    ) {
      await page.click(button('关闭通知'));
      await page.waitForSelector('[data-slot="toast"]', { state: 'hidden' });
    }
    await page.click(button('添加图片'));
    await page.click('loc=role:menuitem[name="从图库选择"]');
    await page.waitForSelector(modal);
    await settled();
  }
  async function settled() {
    await page.waitForFunction(
      () => !document.querySelector('[data-entering],[data-exiting]'),
    );
  }
  async function search(value, count) {
    await page.fill(`${modal} input[aria-label="搜索图库图片"]`, value);
    await page.waitForFunction(
      ({ value, count }) => {
        const node = document.querySelector(
          '[data-testid="album-image-picker"]',
        );
        return (
          node?.querySelector('input[aria-label="搜索图库图片"]')?.value ===
            value &&
          node.getAttribute('aria-busy') !== 'true' &&
          node.querySelectorAll('[data-testid="album-image-choice"]').length ===
            count &&
          !node.querySelector('[data-testid="album-image-read-error"]')
        );
      },
      { value, count },
    );
  }
  async function choose(imageId) {
    await page.click(`${choice(imageId)} button[data-image-choice-open]`);
  }
  async function selected(count) {
    await page.waitForFunction(
      (count) =>
        document
          .querySelector('[data-testid="album-image-add"]')
          ?.textContent.trim() === `添加 ${count} 张`,
      count,
    );
  }
  async function shot(name) {
    await settled();
    const file = `album-image-picker-${name}.png`;
    await page.screenshot({ path: join(output, file) });
    report.screenshots.push(file);
  }
  async function restore() {
    await page.evaluate(() => {
      if (window.__albumImagePickerOriginal) {
        window.fetch = window.__albumImagePickerOriginal;
        delete window.__albumImagePickerOriginal;
      }
    });
  }
  async function monitor(mode) {
    await restore();
    await page.evaluate(
      ({ mode, albumId }) => {
        const original = window.fetch;
        window.__albumImagePickerOriginal = original;
        window.__albumImagePickerRequests = [];
        window.__albumImagePickerDetailFailures = 0;
        let intercepted = false;
        let partialApplied = false;
        window.fetch = async (input, init) => {
          const path = new URL(String(input), location.href).pathname;
          if (
            mode === 'partial' &&
            partialApplied &&
            path === `/api/albums/${albumId}` &&
            !window.__albumImagePickerDetailFailures
          ) {
            window.__albumImagePickerDetailFailures++;
            return Response.json(
              { message: '浏览器验证：详情回读失败' },
              { status: 500 },
            );
          }
          if (path !== '/api/images/batch' || init?.method !== 'POST')
            return original(input, init);
          const body = JSON.parse(init.body);
          if (
            body.command.type !== 'add-albums' ||
            !body.command.albumIds.includes(albumId)
          )
            return original(input, init);
          window.__albumImagePickerRequests.push(body);
          if (!intercepted && body.mode === 'apply') {
            intercepted = true;
            if (mode === 'partial') {
              const response = await original(input, {
                ...init,
                body: JSON.stringify({ ...body, ids: [body.ids[0]] }),
              });
              if (!response.ok) return response;
              const actual = await response.json();
              partialApplied = true;
              return Response.json({
                ...actual,
                results: [
                  ...actual.results,
                  {
                    id: body.ids[1],
                    status: 'failed',
                    inQuery: true,
                    message: '浏览器验证：部分图片添加失败',
                  },
                ],
              });
            }
            if (mode === 'reject')
              return new Response(
                JSON.stringify({ message: '浏览器验证：添加请求被拒绝' }),
                {
                  status: 400,
                  headers: { 'content-type': 'application/json' },
                },
              );
            const response = await original(input, init);
            if (mode === 'lost')
              throw new TypeError(
                'Verification: response lost after real membership commit',
              );
            return response;
          }
          return original(input, init);
        };
      },
      { mode, albumId },
    );
  }

  try {
    report.stage = 'isolated fixture';
    const [storage] = await sql(
      'SELECT id FROM storage_configs WHERE enabled = 1 LIMIT 1',
    );
    assert.ok(storage, 'The isolated preview has a configured storage');
    const now = Date.now();
    await sql(
      `INSERT INTO media_images (id,storage_id,original_name,display_name,visibility,format,mime,width,height,byte_size,classification,processing_status,created_at,updated_at) VALUES ${Array.from({ length: 42 }, (_, index) => `('${id(index)}','${storage.id}','${id(index)}.png','${id(index)}','${index === 1 ? 'public' : 'private'}','png','image/png',640,480,1000,'static','ready',${now - index},${now})`).join(',')}`,
    );
    const created = await request('/api/albums', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '快捷选图验证相册', description: '' }),
    });
    assert.equal(created.status, 201);
    albumId = created.body.album.id;
    await page.goto(`${origin}/albums/${albumId}?page=1&pageSize=40`);
    await page.waitForSelector(button('添加图片'));
    await page.waitForSelector('[data-testid="library-empty"]');
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelectorAll('[data-testid="library-empty"] button')
            .length,
      ),
      0,
      'The empty album does not duplicate its Add Images action',
    );
    await shot('empty-album');
    await sql(
      `INSERT INTO album_images (album_id,image_id,joined_at) VALUES ('${albumId}','${id(0)}',${now - 10000})`,
    );
    await open();

    report.stage = 'actual membership and cross-search/page selection';
    await search(prefix, 40);
    await page.waitForSelector(`${choice(id(0))}[data-existing="true"]`);
    assert.equal(
      await page.evaluate(
        (selector) => {
          const node = document.querySelector(selector);
          return (
            node.querySelector('button[data-image-choice-open]').disabled &&
            !node.querySelector('input[type="checkbox"]') &&
            node.textContent.includes('已添加')
          );
        },
        choice(id(0)),
      ),
      true,
      'Already-added images are disabled based on the explicit membership read',
    );
    await choose(id(1));
    await selected(1);
    await search(id(41), 1);
    await choose(id(41));
    await selected(2);
    await search(prefix, 40);
    await selected(2);
    await page.click(button('下一页'));
    await page.waitForFunction(
      () =>
        document.querySelectorAll(
          '[data-testid="album-image-picker"] [data-testid="album-image-choice"]',
        ).length === 2,
    );
    await selected(2);
    assert.equal(
      await page.evaluate(
        (selector) => document.querySelector(selector).dataset.selected,
        choice(id(41)),
      ),
      'true',
    );
    await shot('cross-page-selected');
    await page.click(`${modal} [data-testid="album-image-selected-toggle"]`);
    await page.waitForSelector(
      `${modal} [data-testid="album-image-selected-list"]`,
    );
    assert.deepEqual(
      await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            '[data-testid="album-image-selected-list"] li',
          ),
        ].map((node) => node.dataset.imageId),
      ),
      [id(1), id(41)],
      'The expanded list reveals selections from both search/page contexts',
    );
    await page.click(button(`移除已选图片：${id(1)}`));
    await selected(1);
    assert.equal(
      await page.evaluate(
        (imageId) =>
          Boolean(
            document.querySelector(
              `[data-testid="album-image-selected-list"] [data-image-id="${imageId}"]`,
            ),
          ),
        id(1),
      ),
      false,
      'An off-page selection can be removed without clearing the other image',
    );
    await page.click(button('上一页'));
    await page.waitForSelector(choice(id(1)));
    await choose(id(1));
    await selected(2);
    await page.click(button('下一页'));
    await selected(2);
    report.layouts = await checkShortcutLayouts(
      page,
      output,
      'album-image-picker',
      modal,
    );
    report.checks.push(
      'Explicit membership reads disable existing images; two selected images survive distinct searches and pages; the expanded list reveals both and removes one off-page without clearing the other.',
    );

    report.stage = 'known failure preserves query and selection';
    await monitor('reject');
    await page.click(`${modal} [data-testid="album-image-add"]`);
    await page.waitForSelector('[data-testid="album-image-submit-error"]');
    await selected(2);
    report.layouts.push(
      ...(await checkShortcutLayouts(
        page,
        output,
        'album-image-picker-rejected',
        modal,
      )),
    );
    assert.equal(
      await page.evaluate(
        (modal) =>
          document.querySelector(`${modal} input[aria-label="搜索图库图片"]`)
            .value,
        modal,
      ),
      prefix,
    );
    assert.equal(
      await page.evaluate(
        (modal) => document.querySelector(modal).dataset.page,
        modal,
      ),
      '2',
    );
    assert.equal(
      (await request(`/api/albums/${albumId}`)).body.album.imageCount,
      1,
    );
    assert.deepEqual(
      await page.evaluate(() =>
        window.__albumImagePickerRequests.map((entry) => [...entry.ids].sort()),
      ),
      [[id(1), id(41)]],
    );
    await shot('failure-preserved');
    report.checks.push(
      'A rejected real command preserves both selected IDs, the search and the current page; the album remains unchanged.',
    );

    report.stage =
      'lost response checks real membership and refreshes the album';
    await monitor('lost');
    await page.click(`${modal} [data-testid="album-image-add"]`);
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="album-image-picker"]'),
    );
    const traffic = await page.evaluate(
      () => window.__albumImagePickerRequests,
    );
    assert.deepEqual(
      traffic.map((entry) => entry.mode),
      ['apply', 'check'],
    );
    assert.deepEqual([...traffic[0].ids].sort(), [id(1), id(41)]);
    assert.deepEqual(traffic[1].ids, traffic[0].ids);
    const saved = (await request(`/api/albums/${albumId}`)).body.album;
    assert.equal(saved.imageCount, 3);
    assert.equal(saved.publicImageCount, 1);
    assert.equal(saved.cover.imageId, id(1));
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="library-list"]')?.dataset
          .loadedCount === '3',
    );
    assert.equal(new URL(await page.url()).pathname, `/albums/${albumId}`);
    await page.waitForFunction(() =>
      document.activeElement?.textContent.includes('添加图片'),
    );
    await shot('saved-album');
    report.checks.push(
      'After a real join commits but its response is lost, the picker only reads back once, creates no duplicate join, closes in the same album, restores focus and refreshes its real count/automatic-cover identity.',
    );
    await restore();

    report.stage = 'partial success survives a failed album detail refresh';
    await open();
    await page.click(`${modal} button:has-text("上一页")`);
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="album-image-picker"]')?.dataset
          .page === '1',
    );
    await search(prefix, 40);
    await choose(id(2));
    await choose(id(3));
    await selected(2);
    await monitor('partial');
    await page.click(`${modal} [data-testid="album-image-add"]`);
    await page.waitForFunction(() =>
      document
        .querySelector('[data-testid="album-image-submit-error"]')
        ?.textContent.includes('图片已添加，相册刷新失败'),
    );
    await selected(1);
    assert.equal(
      await page.evaluate(
        (selector) => document.querySelector(selector)?.dataset.selected,
        choice(id(3)),
      ),
      'true',
      'The failed image stays selected while the cached album keeps the picker mounted',
    );
    assert.equal(
      await page.evaluate(() => window.__albumImagePickerDetailFailures),
      1,
      'The feedback follows an actual failed detail read after the join',
    );
    assert.equal(
      (await request(`/api/albums/${albumId}`)).body.album.imageCount,
      4,
    );
    const partialMembers = await sql(
      `SELECT image_id FROM album_images WHERE album_id='${albumId}' AND image_id IN ('${id(2)}','${id(3)}')`,
    );
    assert.deepEqual(
      partialMembers.map((entry) => entry.image_id),
      [id(2)],
    );
    report.layouts.push(
      ...(await checkShortcutLayouts(
        page,
        output,
        'album-image-picker-failure',
        modal,
      )),
    );
    await shot('partial-refresh-failed');
    await restore();
    await page.click(`${modal} [data-testid="album-image-add"]`);
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="album-image-picker"]'),
    );
    assert.equal(
      (await request(`/api/albums/${albumId}`)).body.album.imageCount,
      5,
    );
    report.checks.push(
      'A real first-image join plus a second-image failure followed by a detail HTTP 500 keeps the picker mounted, the failed image selected and the refresh error visible; explicit retry adds only the retained failure and refreshes the real count.',
    );

    report.stage = 'membership failure cannot enable already-added images';
    await open();
    await page.evaluate((albumId) => {
      const original = window.fetch;
      window.__albumImagePickerOriginal = original;
      window.fetch = async (input, init) => {
        const path = new URL(String(input), location.href).pathname;
        if (
          path === '/api/images/selection' &&
          init?.method === 'POST' &&
          new URLSearchParams(JSON.parse(init.body).query).get('albumId') ===
            albumId
        )
          return new Response(
            JSON.stringify({ message: '浏览器验证：成员读取失败' }),
            { status: 500, headers: { 'content-type': 'application/json' } },
          );
        return original(input, init);
      };
    }, albumId);
    await page.fill(`${modal} input[aria-label="搜索图库图片"]`, id(0));
    await page.waitForSelector('[data-testid="album-image-read-error"]');
    assert.equal(
      await page.evaluate(
        (modal) =>
          document.querySelectorAll(
            `${modal} [data-testid="album-image-choice"]`,
          ).length,
        modal,
      ),
      0,
      'A failed membership check is an error, not an all-unselected list',
    );
    await shot('membership-read-error');
    await restore();
    await page.click(button('重试读取'));
    await page.waitForSelector(`${choice(id(0))}[data-existing="true"]`);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() =>
      document.activeElement?.textContent.includes('添加图片'),
    );
    report.checks.push(
      'A membership-read failure hides selectable choices and remains actionable; retry restores the actual existing-member badge, and Escape restores the Add Images trigger.',
    );
    report.status = 'passed';
    delete report.stage;
  } catch (error) {
    report.error = String(error.stack ?? error);
    report.failureSnapshot = await page.snapshot();
    await shot('failed');
    throw error;
  } finally {
    await restore();
    await sql(`DELETE FROM album_images WHERE image_id GLOB '${prefix}*'`);
    if (albumId) await sql(`DELETE FROM albums WHERE id='${albumId}'`);
    await sql(`DELETE FROM media_images WHERE id GLOB '${prefix}*'`);
    await writeFile(
      join(output, 'album-image-picker.json'),
      `${JSON.stringify(report, null, 2)}\n`,
    );
  }
  return report;
}
