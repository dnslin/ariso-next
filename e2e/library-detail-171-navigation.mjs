import assert from 'node:assert/strict';
import {
  prepareDetail171Versions,
  setDetail171Viewport,
} from './library-detail-171-helpers.mjs';

export async function verifyDetail171ReturnContext({
  page,
  config,
  sql,
  report,
}) {
  await prepareDetail171Versions({ page, sql });
  const button = (name) =>
    `loc=role:${['网格', '瀑布流'].includes(name) ? 'radio' : 'button'}[name="${name}"]`;
  await setDetail171Viewport(page, 390, 400);
  const sourceUrl = `${config.origin}/library?visibility=public&sort=uploaded_asc`;
  await page.goto(sourceUrl);
  await page.waitForSelector('[data-testid="library-gallery"]');
  const previousLayout = await page.evaluate(
    () => document.querySelector('[data-testid="library-list"]').dataset.layout,
  );
  try {
    await page.click(button('瀑布流'));
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="library-list"]').dataset
          .layout === 'masonry',
    );
    const ordered = [];
    let cursor = null;
    let total;
    do {
      const params = new URLSearchParams({
        scope: 'normal',
        visibility: 'public',
        sort: 'uploaded_asc',
        pageSize: '80',
      });
      if (cursor) params.set('cursor', cursor);
      const response = await page.fetch(`/api/images?${params}`);
      assert.equal(response.status, 200);
      const result = JSON.parse(response.body);
      ordered.push(...result.items.map((item) => item.id));
      total = result.total;
      cursor = result.nextCursor;
    } while (!ordered.includes('library-007') && cursor);
    const position = ordered.indexOf('library-007') + 1;
    assert.ok(
      position > 0,
      'Real public source query contains the download fixture',
    );
    const needed = Math.min(total, Math.max(80, position));
    let loaded = await page.evaluate(() =>
      Number(
        document.querySelector('[data-testid="library-list"]').dataset
          .loadedCount,
      ),
    );
    while (loaded < needed) {
      await page.click('[data-testid="library-load-more"]');
      await page.waitForFunction(
        (previous) =>
          Number(
            document.querySelector('[data-testid="library-list"]').dataset
              .loadedCount,
          ) > previous,
        loaded,
      );
      loaded = await page.evaluate(() =>
        Number(
          document.querySelector('[data-testid="library-list"]').dataset
            .loadedCount,
        ),
      );
    }
    assert.ok(loaded >= needed);
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    // A loaded item can still be absent from the virtual DOM. Start at the end
    // and walk actual scroll windows until its real card is mounted.
    const geometry = await page.evaluate(() => {
      const main = document.querySelector('main');
      return {
        end: main.scrollHeight - main.clientHeight,
        height: main.clientHeight,
      };
    });
    let mounted = false;
    const step = Math.max(100, geometry.height / 2);
    for (let top = geometry.end; top >= -step; top -= step) {
      await page.evaluate((top) => {
        document.querySelector('main').scrollTo(0, Math.max(0, top));
      }, top);
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      mounted = await page.evaluate(
        () => !!document.querySelector('[data-image-id="library-007"]'),
      );
      if (mounted) break;
    }
    assert.equal(
      mounted,
      true,
      'Loaded source card becomes available in its virtual window',
    );
    const source = 'loc=role:button[name="查看图片：中文下载样本.png"]';
    await page.hover(source);
    await page.click(
      'label:has(input[aria-label="选择图片：中文下载样本.png"])',
    );
    await page.waitForSelector('[data-testid="library-selection"]');
    await page.focus(source);
    const scroll = await page.evaluate(
      () => document.querySelector('main').scrollTop,
    );
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-testid="detail-body"]');
    await page.click('loc=role:tab[name="水印图"]');
    await page.click('[data-testid="detail-version-entry"]');
    await page.waitForSelector('[data-testid="detail-versions"]');
    await page.click(button('返回详情'));
    await page.waitForSelector('[data-testid="detail-body"]');
    assert.ok(
      await page.evaluate(() =>
        [...document.querySelectorAll('[data-testid="detail-preview"]')]
          .find((node) => node.getClientRects().length)
          ?.src.includes('type=watermark'),
      ),
    );
    await page.click(button('关闭图片详情'));
    await page.waitForFunction(
      () => !new URL(location.href).searchParams.has('image'),
    );
    assert.equal(await page.url(), new URL(sourceUrl).href);
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector(
            'input[aria-label="选择图片：中文下载样本.png"]',
          ).checked,
      ),
      true,
    );
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector('[data-testid="library-list"]').dataset.layout,
      ),
      'masonry',
    );
    await page.waitForFunction(
      () =>
        document.activeElement?.getAttribute('aria-label') ===
        '查看图片：中文下载样本.png',
    );
    assert.ok(
      Math.abs(
        (await page.evaluate(() => document.querySelector('main').scrollTop)) -
          scroll,
      ) <= 1,
    );
    report.checks.push(
      `Real public source order locates the card at ${position}; ${loaded} items are loaded and actual virtual windows are traversed. Card keyboard opening → version workspace → detail retains watermark preview; closing preserves visibility/sort URL, masonry layout, source scroll and exact trigger focus.`,
    );
  } finally {
    if (previousLayout === 'grid') {
      if ((await page.url()) !== new URL(sourceUrl).href) {
        await page.goto(sourceUrl);
        await page.waitForSelector('[data-testid="library-gallery"]');
      }
      await page.click(button('网格'));
    }
  }
}
