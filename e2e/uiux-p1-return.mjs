import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { resizeViewport } from './browser-geometry.mjs';

/** Uses only real records in the caller's disposable owner preview. */
export async function runUiuxP1Return(page, origin, { imageId, output } = {}) {
  const report = { checks: [], layouts: [], createdAlbums: 0 };
  const prefix = `旅行回访 ${randomUUID().slice(0, 8)}`;
  let ids = [];
  await page.goto(`${origin}/albums`);
  await page.waitForSelector('input[aria-label="搜索相册"]');
  try {
    const seeded = await page.evaluate(async (prefix) => {
      const ids = [];
      try {
        for (let index = 0; index < 43; index++) {
          const response = await fetch('/api/albums', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              name: `${prefix} · ${String(index + 1).padStart(2, '0')}`,
              description: '相册与分享返回位置验收样本。',
            }),
          });
          if (!response.ok)
            throw new Error(`Create album: HTTP ${response.status}`);
          const { album } = await response.json();
          ids.push(album.id);
          const shared = await fetch(`/api/albums/${album.id}/share`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ showName: false, expiresAt: null }),
          });
          if (!shared.ok)
            throw new Error(`Create share: HTTP ${shared.status}`);
        }
        return { ids, error: null };
      } catch (error) {
        return { ids, error: error.message };
      }
    }, prefix);
    ids = seeded.ids;
    report.createdAlbums = ids.length;
    assert.equal(seeded.error, null, seeded.error ?? 'fixture creation');

    async function list(kind) {
      await page.goto(`${origin}/${kind}`);
      const label = kind === 'albums' ? '搜索相册' : '搜索分享相册';
      await page.waitForSelector(`input[aria-label="${label}"]`);
      await page.fill(`input[aria-label="${label}"]`, prefix);
      await page.waitForFunction(
        ({ kind, prefix }) => {
          const root = document.querySelector(`[data-testid="${kind}-list"]`);
          return (
            new URLSearchParams(location.search).get('q') === prefix &&
            root &&
            root.getAttribute('aria-busy') !== 'true' &&
            root.textContent.includes(prefix)
          );
        },
        { kind, prefix },
      );
      await page.click(
        `loc=role:button[name*="每页${kind === 'albums' ? '相册' : '分享'}数"]`,
      );
      await page.click(
        `loc=role:option[name="20 ${kind === 'albums' ? '本' : '项'} / 页"]`,
      );
      await page.waitForFunction(
        () => new URLSearchParams(location.search).get('pageSize') === '20',
      );
      await page.waitForFunction(
        (kind) =>
          document
            .querySelector(`[data-testid="${kind}-list"]`)
            ?.getAttribute('aria-busy') !== 'true',
        kind,
      );
      await page.click('loc=role:button[name="下一页"]');
      await page.waitForFunction(
        (kind) =>
          new URLSearchParams(location.search).get('page') === '2' &&
          document
            .querySelector(`[data-testid="${kind}-list"]`)
            ?.getAttribute('aria-busy') !== 'true',
        kind,
      );
      const expectedIds = await page.evaluate(
        async ({ kind, prefix }) => {
          const query = new URLSearchParams({
            q: prefix,
            page: '2',
            pageSize: '20',
          });
          const response = await fetch(`/api/${kind}?${query}`, {
            cache: 'no-store',
          });
          if (!response.ok)
            throw new Error(`Read ${kind} page: HTTP ${response.status}`);
          const result = await response.json();
          return result.items.map((item) =>
            kind === 'albums' ? item.id : item.albumId,
          );
        },
        { kind, prefix },
      );
      assert.equal(
        expectedIds.length,
        20,
        'The second page contains 20 real matching records',
      );
      await page.waitForFunction(
        ({ kind, expectedIds }) => {
          const displayed =
            kind === 'albums'
              ? [...document.querySelectorAll('a[data-testid^="album-"]')].map(
                  (element) => element.dataset.testid.slice(6),
                )
              : [
                  ...new Set(
                    [...document.querySelectorAll('[data-share-album-id]')].map(
                      (element) => element.dataset.shareAlbumId,
                    ),
                  ),
                ];
          return (
            displayed.length === expectedIds.length &&
            expectedIds.every((id) => displayed.includes(id))
          );
        },
        { kind, expectedIds },
      );
    }

    async function source(kind, action) {
      return page.evaluate(
        async ({ kind, action }) => {
          const main = document.getElementById('main-content');
          main.scrollTop = 550;
          await new Promise(requestAnimationFrame);
          const bounds = main.getBoundingClientRect();
          const selector =
            kind === 'albums'
              ? '[data-testid^="album-"][data-collection-return-focus]'
              : 'a[data-collection-return-focus]';
          const elements = [...main.querySelectorAll(selector)].filter(
            (element) => {
              const rect = element.getBoundingClientRect();
              return (
                element.getClientRects().length &&
                rect.top >= bounds.top + 40 &&
                rect.bottom <= bounds.bottom - 20
              );
            },
          );
          const element = elements[0];
          if (!element)
            throw new Error(`No visible ${kind} source at ${main.scrollTop}`);
          const albumId =
            kind === 'albums'
              ? element.dataset.testid.slice(6)
              : element.closest('[data-share-album-id]').dataset.shareAlbumId;
          if (kind === 'albums' && action === 'share') {
            const trigger = element
              .closest('article')
              .querySelector('button[aria-label^="相册操作："]');
            return {
              albumId,
              selector: `[data-testid="album-${albumId}"]`,
              triggerLabel: trigger.getAttribute('aria-label'),
              focusKey: trigger.dataset.collectionReturnFocus,
              top: main.scrollTop,
            };
          }
          return {
            albumId,
            selector:
              kind === 'albums'
                ? `[data-testid="album-${albumId}"]`
                : `#${element.id}`,
            focusKey: element.dataset.collectionReturnFocus,
            top: main.scrollTop,
          };
        },
        { kind, action },
      );
    }

    async function restored(kind, saved) {
      await page.waitForFunction(
        ({ kind, prefix, saved }) => {
          const params = new URLSearchParams(location.search);
          return (
            location.pathname === `/${kind}` &&
            params.get('q') === prefix &&
            params.get('page') === '2' &&
            params.get('pageSize') === '20' &&
            Math.abs(
              document.getElementById('main-content').scrollTop - saved.top,
            ) <= 2 &&
            document.activeElement?.dataset.collectionReturnFocus ===
              saved.focusKey
          );
        },
        { kind, prefix, saved },
      );
      const state = await page.evaluate(() => ({
        href: location.pathname + location.search,
        top: document.getElementById('main-content').scrollTop,
        focus: document.activeElement?.dataset.collectionReturnFocus,
      }));
      assert.equal(state.focus, saved.focusKey);
      return state;
    }

    for (const width of [1440, 390]) {
      await resizeViewport(page, width);
      await list('albums');
      const albumSource = await source('albums', 'open');
      if (imageId) {
        const added = await page.evaluate(
          async ({ albumId, imageId }) => {
            const response = await fetch('/api/images/batch', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                ids: [imageId],
                query: 'scope=normal',
                command: { type: 'add-albums', albumIds: [albumId] },
                mode: 'apply',
              }),
            });
            return { status: response.status, body: await response.json() };
          },
          { albumId: albumSource.albumId, imageId },
        );
        assert.equal(added.status, 200);
        assert.ok(
          ['changed', 'unchanged'].includes(added.body.results[0].status),
          JSON.stringify(added.body),
        );
      }
      await page.click(albumSource.selector);
      await page.waitForSelector('loc=role:button[name="分享设置"]');
      const detailHref = await page.evaluate(
        () => location.pathname + location.search,
      );
      if (imageId) {
        const imageSource = `[data-image-id="${imageId}"] [data-library-open]`;
        await page.waitForSelector(imageSource);
        // Capture a stable source position after the real gallery has laid out
        // its images and completed its existing entrance, before focusing it.
        await page.waitForFunction(() => {
          const list = document.querySelector('[data-testid="library-list"]');
          return (
            list &&
            document.fonts.status === 'loaded' &&
            [...list.querySelectorAll('img')].every(
              (image) => image.complete,
            ) &&
            list
              .getAnimations({ subtree: true })
              .filter(
                (animation) =>
                  animation.effect?.getTiming().duration !== 'auto' &&
                  animation.effect?.getTiming().iterations !== Infinity,
              )
              .every((animation) => animation.playState !== 'running')
          );
        });
        await page.focus(imageSource);
        const imageTop = await page.evaluate(
          () => document.getElementById('main-content').scrollTop,
        );
        console.log({
          uiuxP1ReturnStep: 'image-open',
          width,
          imageTop,
          detailHref,
          imageId,
        });
        await page.click(imageSource);
        await page.waitForSelector('[data-testid="detail-body"]');
        await page.click('[data-testid="detail-version-entry"]');
        await page.waitForSelector('[data-testid="detail-versions"]');
        await page.click('loc=role:button[name="返回详情"]');
        await page.waitForSelector('[data-testid="detail-body"]');
        await page.click('loc=role:button[name="关闭图片详情"]');
        await page.waitForFunction(
          ({ imageId, imageTop, detailHref }) =>
            location.pathname + location.search === detailHref &&
            Math.abs(
              document.getElementById('main-content').scrollTop - imageTop,
            ) <= 2 &&
            document.activeElement?.matches('[data-library-open]') &&
            document.activeElement.closest('[data-image-id]')?.dataset
              .imageId === imageId,
          { imageId, imageTop, detailHref },
        );
        report.checks.push(
          `album-image-${width}: image details and versions close back to the exact image card without cross-page focus takeover`,
        );
      }
      await page.click('loc=role:button[name="分享设置"]');
      await page.waitForSelector('[data-testid="share-settings"]');
      const nextLayout = await page.evaluate(() => {
        const grid = [...document.querySelectorAll('[role="radio"]')].find(
          (element) => element.textContent.trim() === '网格',
        );
        return grid?.getAttribute('aria-checked') === 'true'
          ? '瀑布流'
          : '网格';
      });
      await page.click(`[role="radio"]:text-is("${nextLayout}")`);
      await page.click('loc=role:button[name="保存访客展示"]');
      await page.waitForFunction(
        () =>
          document.querySelector('[data-testid="share-save-display"]')
            ?.disabled,
      );
      await page.waitForFunction(
        () =>
          [...document.querySelectorAll('[data-slot="toast-title"]')].some(
            (element) => element.textContent.includes('访客展示已保存'),
          ) ||
          [...document.querySelectorAll('p')].some(
            (element) => element.textContent === '已保存',
          ),
      );
      await page.click('loc=role:button[name="返回相册"]');
      await page.waitForFunction(
        (href) => location.pathname + location.search === href,
        detailHref,
      );
      await page.waitForSelector('loc=role:button[name="分享设置"]');
      await page.click('loc=role:link[name="返回相册列表"]');
      const albumReturn = await restored('albums', albumSource);
      if (output)
        await page.screenshot({
          path: join(output, `uiux-p1-return-${width}.png`),
        });
      report.checks.push(
        `albums-${width}: saved share settings return through the exact album detail to its searched page, scroll and focus`,
      );

      await page.click(albumSource.selector);
      await page.waitForSelector('loc=role:button[name="分享设置"]');
      await page.evaluate(() => history.back());
      await restored('albums', albumSource);
      report.checks.push(
        `albums-${width}: browser Back restores the same list context`,
      );

      const cardSource = await source('albums', 'share');
      await page.click(`loc=role:button[name="${cardSource.triggerLabel}"]`);
      await page.click('loc=role:menuitem[name="分享设置"]');
      await page.waitForSelector('[data-testid="share-settings"]');
      await page.click('loc=role:button[name="返回相册列表"]');
      await restored('albums', cardSource);
      report.checks.push(
        `albums-${width}: card share settings return directly to the source list`,
      );

      await list('shares');
      const shareSource = await source('shares', 'share');
      await page.click(shareSource.selector);
      await page.waitForSelector('[data-testid="share-settings"]');
      await page.click('loc=role:button[name="返回分享"]');
      const shareReturn = await restored('shares', shareSource);
      if (output)
        await page.screenshot({
          path: join(output, `uiux-p1-return-shares-${width}.png`),
        });
      await page.click(shareSource.selector);
      await page.waitForSelector('[data-testid="share-settings"]');
      await page.evaluate(() => history.back());
      await restored('shares', shareSource);
      report.checks.push(
        `shares-${width}: page Return and browser Back preserve the search, page size, page, scroll and visible source focus`,
      );
      const duplicateIds = await page.evaluate(() => {
        const ids = [...document.querySelectorAll('main [id]')].map(
          (element) => element.id,
        );
        return ids.filter((id, index) => ids.indexOf(id) !== index);
      });
      assert.deepEqual(
        duplicateIds,
        [],
        'Desktop and mobile controls have distinct DOM ids',
      );
      report.layouts.push({ width, albumReturn, shareReturn, duplicateIds });
    }
  } finally {
    const cleanup = await page.evaluate(async (ids) => {
      const failures = [];
      for (const id of ids) {
        const response = await fetch(`/api/albums/${id}`, { method: 'DELETE' });
        if (!response.ok && response.status !== 404)
          failures.push({ id, status: response.status });
      }
      return failures;
    }, ids);
    assert.deepEqual(
      cleanup,
      [],
      'Remove only albums created by this return workflow',
    );
    await resizeViewport(page, 1440);
  }
  return report;
}
