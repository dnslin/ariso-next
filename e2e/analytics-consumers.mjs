import assert from 'node:assert/strict';
import { resizeViewport } from './browser-geometry.mjs';

export async function analyticsConsumers(page, config, tools, fixture, report) {
  report.consumerStep = 'popular-end';
  await tools.open('/analytics?days=30');
  const lastRank = '[data-testid="analytics-popular"] li:nth-child(10) button';
  for (const width of [1440, 390]) {
    await resizeViewport(page, width);
    await page.focus(lastRank);
    await page.waitForFunction((selector) => {
      const row = document.querySelector(selector).getBoundingClientRect();
      const main = document
        .getElementById('main-content')
        .getBoundingClientRect();
      return row.top >= main.top && row.bottom <= main.bottom;
    }, lastRank);
    await tools.evidence('popular-end', width, 'light');
  }
  await resizeViewport(page, 1440);
  await tools.open('/dashboard?days=7');
  await page.focus('a[href="/analytics?days=7"]');
  await page.keyboard.press('Enter');
  await page.waitForURL(`${config.origin}/analytics?days=7`);
  await page.waitForSelector('[data-testid="analytics-overview"]');
  assert.equal(
    await page.evaluate(
      (id) =>
        !!document.querySelector(
          `[data-testid="analytics-popular"] li[data-image-id="${id}"]`,
        ),
      fixture.ids[2],
    ),
    false,
    'Permanently deleted images do not appear in popular rankings',
  );
  for (const [id, path, entry, close] of [
    [fixture.ids[0], '/library', 'detail-statistics-entry', '关闭图片详情'],
    [fixture.ids[1], '/trash', 'trash-statistics-entry', '返回回收站列表'],
  ]) {
    report.consumerStep = `rank-open:${path}`;
    await tools.open('/analytics?days=30');
    const selector = `[data-testid="analytics-popular"] li[data-image-id="${id}"] button`;
    await page.hover(selector);
    await page.mouse.move(1100, 700);
    await page.mouse.wheel(0, 240, { label: '保留排行阅读位置' });
    await page.focus(selector);
    const before = await page.evaluate(
      () => document.getElementById('main-content').scrollTop,
    );
    assert.ok(before > 0, 'Ranking return uses a nonzero reading position');
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-testid="image-statistics-total"]');
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector('[data-testid="image-statistics-dialog"]')
            .dataset.imageId,
      ),
      id,
    );
    report.consumerStep = `manage:${path}`;
    if (path === '/library') await page.click('loc=role:link[name="查看记录"]');
    else {
      await page.focus('loc=role:link[name="查看记录"]');
      await page.keyboard.press('Enter');
    }
    await page.waitForFunction(
      ({ id, path }) =>
        location.pathname === path &&
        new URLSearchParams(location.search).get('image') === id,
      { id, path },
    );
    await page.waitForSelector(`[data-testid="${entry}"]`);
    const url = new URL(await page.url());
    assert.equal(url.searchParams.get('image'), id);
    assert.equal(url.searchParams.get('analyticsReturn'), '/analytics?days=30');
    const saved = await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem('ariso-analytics-return')),
    );
    assert.deepEqual(
      saved,
      { source: '/analytics?days=30', imageId: id, scrollTop: before },
      'Management navigation saves only the exact return ID, period and nonzero reading position',
    );
    (report.returnSnapshots ??= []).push({
      path,
      activation: path === '/library' ? 'pointer' : 'keyboard',
      saved,
    });
    let detailScroll;
    if (path === '/library') {
      await page.focus(`[data-testid="${entry}"]`);
      const center = await page.evaluate(() => {
        const rect = document
          .querySelector('[data-testid="detail-body"]')
          .getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      });
      await page.mouse.move(center.x, center.y);
      await page.mouse.wheel(0, 24, { label: '保留详情阅读位置' });
      await page.waitForFunction(
        () =>
          document.querySelector('[data-testid="detail-body"]').scrollTop > 0,
      );
      detailScroll = await page.evaluate(
        () => document.querySelector('[data-testid="detail-body"]').scrollTop,
      );
      await page.keyboard.press('Enter');
    } else await page.click(`[data-testid="${entry}"]`);
    await page.waitForSelector('[data-testid="image-statistics-total"]');
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector('[data-testid="image-statistics-dialog"]')
            .dataset.imageId,
      ),
      id,
    );
    report.consumerStep = `statistics-close:${path}`;
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-testid="image-statistics-dialog"]', {
      state: 'hidden',
    });
    await page.waitForFunction(
      (entry) => document.activeElement?.dataset.testid === entry,
      entry,
    );
    if (detailScroll !== undefined)
      assert.equal(
        await page.evaluate(
          () => document.querySelector('[data-testid="detail-body"]').scrollTop,
        ),
        detailScroll,
        'Statistics close restores the nonzero detail reading position',
      );
    report.consumerStep = `ranking-return:${path}`;
    await page.click(`loc=role:button[name="${close}"]`);
    await page.waitForURL(`${config.origin}/analytics?days=30`);
    await page.waitForSelector('[data-testid="analytics-overview"]');
    await page.waitForFunction(
      (id) => document.activeElement?.closest('li')?.dataset.imageId === id,
      id,
    );
    assert.equal(
      await page.evaluate(
        () => document.getElementById('main-content').scrollTop,
      ),
      before,
      'Management return restores the actual ranking scroll',
    );
  }
  report.consumerStep = 'failure-lists';
  await tools.open();
  await page.click('loc=role:link[name="查看初次失败图片"]');
  await page.waitForSelector('[data-testid="library-failure-types"]');
  for (const [failure, id, label] of [
    ['initial', fixture.ids[10], '初次处理'],
    ['reprocess', fixture.ids[9], '重新处理'],
  ]) {
    await page.click(`loc=role:radio[name="${label}"]`);
    await page.waitForFunction(
      (failure) =>
        new URLSearchParams(location.search).get('failure') === failure,
      failure,
    );
    await page.waitForFunction(
      (id) =>
        !!document.querySelector(
          `[data-testid="library-card"][data-image-id="${id}"]`,
        ),
      id,
    );
    const response = await tools.request(
      `/api/images?scope=normal&failure=${failure}`,
    );
    assert.deepEqual(
      response.items.map((item) => item.id),
      [id],
      'Failure category is backed by the actual library query',
    );
    await tools.evidence(`failure-${failure}`, 390, 'light');
    await tools.evidence(`failure-${failure}`, 1440, 'dark');
  }
  report.checks.push(
    'Ranking opens real single-image statistics; library/trash management preserves exact IDs and 30-day source, then restores ranking scroll and focus. Both detail consumers return focus after statistics. Failure toggles use actual initial/reprocess lists. Deleted images are absent.',
  );
}
