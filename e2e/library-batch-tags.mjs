import assert from 'node:assert/strict';
import {
  batchImageId,
  batchAlbumIds,
  batchTagIds,
} from './library-batch-fixture.mjs';

import { submitTagsWithToast } from './library-batch-tag-feedback.mjs';
import { tagNameSchema } from '../src/server/collections/validation.ts';

async function verifyTagTargetReads(context, count) {
  const { page, report, button, layouts } = context;
  report.activeCheck = 'tag-target-loading-error-empty-retry';
  const selectedTargets = async (disabled) => {
    await page.waitForFunction(
      (disabled) =>
        document.querySelector('[data-testid="batch-submit"]').disabled ===
        disabled,
      disabled,
    );
    const state = await page.evaluate(() => ({
      disabled: document.querySelector('[data-testid="batch-submit"]').disabled,
      count: [...document.querySelectorAll('[role="status"]')].find((node) =>
        /已选\s*2\s*个标签/.test(node.textContent),
      )?.textContent,
      footer: document.querySelector('[data-testid="batch-tag-footer"] p')
        .textContent,
    }));
    assert.equal(state.disabled, disabled);
    assert.ok(state.count, 'Target reads retain both explicit tag selections');
    assert.match(
      state.footer,
      new RegExp(`${count}\\s*张图片\\s*×\\s*2\\s*个标签`),
    );
  };
  await page.evaluate(() => {
    const original = window.fetch;
    window.__tagTargetRead = null;
    window.__tagTargetRelease = null;
    window.fetch = async (...args) => {
      const url = new URL(String(args[0]), location.href);
      if (url.pathname !== '/api/tags') return original(...args);
      window.fetch = original;
      const response = await original(...args);
      window.__tagTargetRead = { url: url.href, status: response.status };
      await new Promise((resolve) => {
        window.__tagTargetRelease = resolve;
      });
      return response;
    };
  });
  await page.fill('input[aria-label="搜索目标标签"]', 'Issue 177 分页标签');
  await page.waitForFunction(
    () => typeof window.__tagTargetRelease === 'function',
  );
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[role="status"]')].some(
      (node) =>
        node.getClientRects().length &&
        node.textContent.includes('正在读取标签目标'),
    ),
  );
  await selectedTargets(true);
  await layouts('tag-target-loading', [390, 1440]);
  const held = await page.evaluate(() => window.__tagTargetRead);
  assert.equal(
    held.status,
    200,
    'Loading holds the successful real target response',
  );
  await page.evaluate(() => {
    window.__tagTargetRelease();
    window.__tagTargetRelease = null;
  });
  await page.waitForSelector('[data-target-id="issue177-page-tag-0"]');
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="batch-submit"]').disabled,
  );
  await selectedTargets(false);
  await page.evaluate(() => {
    const original = window.fetch;
    window.__tagTargetRead = null;
    window.fetch = async (...args) => {
      const url = new URL(String(args[0]), location.href);
      if (url.pathname !== '/api/tags') return original(...args);
      window.fetch = original;
      const response = await original(...args);
      window.__tagTargetRead = {
        url: url.href,
        status: response.status,
        discarded: true,
      };
      throw new TypeError('Verification: actual tag target read response lost');
    };
  });
  await page.fill('input[aria-label="搜索目标标签"]', 'Issue 177');
  await page.waitForSelector(
    '[role="alert"]:has-text("actual tag target read response lost")',
  );
  await selectedTargets(true);
  await layouts('tag-target-error', [390, 1440]);
  const lost = await page.evaluate(() => window.__tagTargetRead);
  assert.equal(
    lost.status,
    200,
    'Error discards the real successful target response',
  );
  assert.equal(lost.discarded, true);
  await page.click(button('重试读取目标'));
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll('[role="alert"]')].some((node) =>
        node.textContent.includes('目标读取失败'),
      ) && !document.querySelector('[data-testid="batch-submit"]').disabled,
  );
  for (const id of batchTagIds) {
    await page.waitForSelector(`[data-target-id="${id}"]`);
    assert.equal(
      await page.evaluate(
        (id) =>
          document.querySelector(`[data-target-id="${id}"] input`).checked,
        id,
      ),
      true,
    );
  }
  await selectedTargets(false);
  await page.fill(
    'input[aria-label="搜索目标标签"]',
    'issue177-no-tag-target-exists',
  );
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[role="status"]')].some(
      (node) =>
        node.getClientRects().length &&
        node.textContent.includes('没有匹配目标，请修改搜索条件。'),
    ),
  );
  assert.equal(
    await page.evaluate(
      () => document.querySelectorAll('[data-target-id]').length,
    ),
    0,
  );
  await selectedTargets(false);
  await layouts('tag-target-empty', [390, 1440]);
  await page.fill('input[aria-label="搜索目标标签"]', 'Issue 177 标签');
  for (const id of batchTagIds) {
    await page.waitForSelector(`[data-target-id="${id}"]`);
    assert.equal(
      await page.evaluate(
        (id) =>
          document.querySelector(`[data-target-id="${id}"] input`).checked,
        id,
      ),
      true,
    );
  }
  await selectedTargets(false);
  report.tagTargetReads = { held, lost, selectedIds: batchTagIds };
  report.checks.push(
    'Real held/lost tag GET responses show loading/error with submission disabled and retain both selected tags; explicit retry restores actual checked targets. An actual empty search keeps the explicit command and original-query recovery preserves both IDs. Desktop/mobile light/dark screenshots cover all three states.',
  );
}

export async function verifyTagRetryAfterAlbumError(context) {
  const {
    page,
    config,
    report,
    button,
    loaded,
    selected,
    choose,
    action,
    target,
    returnToLibrary,
    monitor,
    traffic,
    layouts,
  } = context;
  report.activeCheck = 'tag-retry-after-current-album-cache-error';
  const albumPath = `/api/albums/${batchAlbumIds[0]}`;
  await page.goto(
    `${config.origin}/albums/${batchAlbumIds[0]}?q=issue177-000&pageSize=80&page=1`,
  );
  await loaded(1);
  const sourceUrl = await page.url();
  await choose(0);
  await monitor();
  await page.evaluate((albumPath) => {
    const original = window.fetch;
    window.__collectionReadRequests = [];
    window.__collectionReadFault = albumPath;
    window.fetch = async (...args) => {
      const url = new URL(String(args[0]), location.href);
      if (!/^\/api\/(?:albums|tags)(?:\/|$)/.test(url.pathname))
        return original(...args);
      const entry = {
        path: url.pathname,
        query: url.search,
        method: args[1]?.method ?? 'GET',
      };
      window.__collectionReadRequests.push(entry);
      const lost = window.__collectionReadFault === url.pathname;
      if (lost) window.__collectionReadFault = null;
      const response = await original(...args);
      entry.status = response.status;
      if (lost) {
        entry.discarded = true;
        throw new TypeError(
          `Verification: actual collection read response lost ${url.pathname}`,
        );
      }
      return response;
    };
  }, albumPath);
  await action('从相册移除', 1);
  await page.waitForSelector(
    '[role="alert"]:has-text("actual collection read response lost")',
  );
  const albumReads = await page.evaluate(() => window.__collectionReadRequests);
  assert.ok(
    albumReads.some(
      (entry) =>
        entry.path === albumPath && entry.status === 200 && entry.discarded,
    ),
    'The current-album cache error comes from its discarded successful real GET',
  );
  assert.equal(
    await page.evaluate(
      () => document.querySelector('[data-testid="batch-submit"]').disabled,
    ),
    true,
  );
  await returnToLibrary();
  await selected(1);
  assert.equal(await page.url(), sourceUrl);
  await action('添加标签', 1);
  await page.waitForSelector(`[data-target-id="${batchTagIds[0]}"]`);
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelectorAll(
          '[data-batch-view="tag-choose"] [role="alert"]',
        ).length,
    ),
    0,
    'The current-album cached error never appears as a tag-target error',
  );
  assert.equal(
    await page.evaluate(
      (albumId) => !!document.querySelector(`[data-target-id="${albumId}"]`),
      batchAlbumIds[0],
    ),
    false,
    'The cached album is not injected into actual tag targets',
  );
  await target(batchTagIds[0]);
  await target(batchTagIds[1]);
  await page.evaluate(() => {
    window.__collectionReadFault = '/api/tags';
  });
  await page.fill('input[aria-label="搜索目标标签"]', 'Issue 177 标签 A');
  await page.waitForSelector(
    '[role="alert"]:has-text("actual collection read response lost /api/tags")',
  );
  assert.equal(
    await page.evaluate(
      () => document.querySelector('[data-testid="batch-submit"]').disabled,
    ),
    true,
  );
  const tagErrorReads = await page.evaluate(
    () => window.__collectionReadRequests,
  );
  assert.ok(
    tagErrorReads.some(
      (entry) =>
        entry.path === '/api/tags' && entry.status === 200 && entry.discarded,
    ),
  );
  await layouts('tag-album-cache-read-error', [390, 1440]);
  await page.evaluate(() => {
    window.__collectionReadRequests = [];
  });
  await page.click(button('重试读取目标'));
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll('[role="alert"]')].some((node) =>
        node.textContent.includes('目标读取失败'),
      ) && !document.querySelector('[data-testid="batch-submit"]').disabled,
  );
  const retryReads = await page.evaluate(() => window.__collectionReadRequests);
  report.tagAlbumCacheRetry = {
    sourceUrl,
    albumReads,
    tagErrorReads,
    retryReads,
    selectedIds: batchTagIds,
  };
  assert.deepEqual(
    retryReads.map((entry) => entry.path),
    ['/api/tags'],
    'Retrying tag targets never refetches the disabled cached current-album query',
  );
  assert.equal(retryReads[0].method, 'GET');
  assert.equal(retryReads[0].status, 200);
  assert.equal(
    new URLSearchParams(retryReads[0].query).get('q'),
    'Issue 177 标签 A',
  );
  await page.fill('input[aria-label="搜索目标标签"]', 'Issue 177 标签');
  for (const id of batchTagIds) {
    await page.waitForSelector(`[data-target-id="${id}"]`);
    assert.equal(
      await page.evaluate(
        (id) =>
          document.querySelector(`[data-target-id="${id}"] input`).checked,
        id,
      ),
      true,
      'Tag retry retains both explicit choices despite an unrelated cached album error',
    );
  }
  assert.deepEqual(
    await traffic(),
    [],
    'Target reads, retry and cancellation never submit a batch mutation',
  );
  await page.click('[data-testid="batch-cancel"]');
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="library-batch"]'),
  );
  await selected(1);
  assert.equal(await page.url(), sourceUrl);
  await action('清空全部选择', 1);
  await selected(0);
  report.checks.push(
    'On a real album route, a discarded successful current-album GET creates its query-cache error. Closing removal and opening tags hides the unrelated album error and identity; discarding a real tag GET and explicitly retrying fetches only tags, preserves both chosen IDs and sends no batch mutation.',
  );
}

export async function verifyTagTargets(context, indices = [0, 1, 2, 3]) {
  const {
    page,
    sql,
    report,
    button,
    selected,
    choose,
    action,
    target,
    visit,
    returnToLibrary,
    monitor,
    traffic,
    resize,
    shot,
    layouts,
    expectResults,
    tagGeometry,
  } = context;
  report.activeCheck = 'compact-tag-selection-search-create-submit';
  const ids = indices.map(batchImageId);
  assert.deepEqual(
    await sql(
      `SELECT image_id,tag_id FROM image_tags WHERE image_id IN ('${ids.join("','")}')`,
    ),
    [],
  );
  const longId =
    'issue177-tag-very-long-identifier-for-the-compact-layout-verification-177';
  const { displayName: longName, normalizedKey: longKey } = tagNameSchema.parse(
    'Issue 177 标签 这是一段需要完整读取并自然换行的很长标签名称用于手机与桌面验证',
  );
  await sql(
    `INSERT INTO tags(id,display_name,normalized_key,created_at,updated_at) VALUES('${longId}','${longName}','${longKey}',1810000000001,1810000000001)`,
  );
  await visit();
  const sourceUrl = await page.url();
  for (const index of indices) await choose(index);
  await action('添加标签', indices.length);
  await page.waitForSelector('[data-batch-view="tag-choose"]');
  assert.equal(
    await page.evaluate(
      () => document.querySelector('[data-testid="batch-submit"]').disabled,
    ),
    true,
  );
  await page.waitForSelector(
    '[data-testid="batch-target-grid"] [data-target-id]',
  );
  await layouts('tag-zero-target', [390, 1440]);
  await page.fill('input[aria-label="搜索目标标签"]', 'Issue 177 标签');
  await target(batchTagIds[0]);
  await target(batchTagIds[1]);
  await page.waitForSelector(`[data-target-id="${longId}"]`);
  await layouts('add-tags', [390, 430, 768, 1440]);
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelectorAll('[data-batch-view="tag-choose"] img').length,
    ),
    Math.min(ids.length, 3),
  );
  for (const width of [360, 390]) {
    await resize(width, 600);
    const geometry = await tagGeometry();
    report.layouts.push({ state: 'tag-short', theme: 'dark', ...geometry });
    await shot('tag-short', width, 'dark');
  }
  await page.click(button('标签操作说明'));
  await page.waitForSelector('[data-testid="batch-tag-tips"]');
  assert.ok(
    await page.evaluate(() =>
      document
        .querySelector('[data-testid="batch-tag-tips"]')
        .textContent.includes('任一标签失效'),
    ),
  );
  await shot('tag-help', 390, 'dark');
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-testid="batch-tag-tips"]', {
    state: 'hidden',
  });
  assert.equal(
    await page.evaluate(() =>
      document.activeElement?.getAttribute('aria-label'),
    ),
    '标签操作说明',
  );
  await monitor();
  await page.click('[data-testid="batch-cancel"]');
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="library-batch"]'),
  );
  await selected(indices.length);
  assert.equal(
    await page.url(),
    sourceUrl,
    'Cancelling tag target selection retains the original library page',
  );
  assert.deepEqual(
    await traffic(),
    [],
    'Cancelling target selection never sends a batch request',
  );
  await action('添加标签', indices.length);
  await target(batchTagIds[0]);
  await target(batchTagIds[1]);
  await resize(1440);
  await page.fill('input[aria-label="搜索目标标签"]', 'Issue 177 分页标签');
  await page.waitForSelector(
    '[data-testid="batch-target-grid"] [data-target-id]',
  );
  await page.waitForFunction(() => {
    const grid = document.querySelector('[data-testid="batch-target-grid"]');
    const next = [...document.querySelectorAll('button')].find(
      (node) => node.textContent === '下一页目标',
    );
    return (
      !!grid?.querySelector('[data-target-id^="issue177-page-tag-"]') &&
      next?.disabled === false
    );
  });
  await page.click(button('下一页目标'));
  await page.waitForFunction(() =>
    document
      .querySelector('[aria-label="目标分页"]')
      ?.textContent.includes('2/2'),
  );
  const [last] = await sql(
    "SELECT id FROM tags WHERE display_name LIKE 'Issue 177 分页标签%' ORDER BY created_at DESC,id ASC LIMIT 1 OFFSET 20",
  );
  await page.waitForSelector(`[data-target-id="${last.id}"]`);
  await page.focus(`[data-target-id="${last.id}"] input`);
  await page.keyboard.press('Space');
  assert.equal(
    await page.evaluate(
      (id) => document.querySelector(`[data-target-id="${id}"] input`).checked,
      last.id,
    ),
    true,
  );
  await page.keyboard.press('Space');
  assert.equal(
    await page.evaluate(
      (id) => document.querySelector(`[data-target-id="${id}"] input`).checked,
      last.id,
    ),
    false,
  );
  await layouts('tag-target-page-two', [390, 1440]);
  await page.fill('input[aria-label="搜索目标标签"]', 'Issue 177 标签');
  for (const id of batchTagIds) {
    await page.waitForSelector(`[data-target-id="${id}"]`);
    assert.equal(
      await page.evaluate(
        (id) =>
          document.querySelector(`[data-target-id="${id}"] input`).checked,
        id,
      ),
      true,
    );
  }
  await page.click(button('新建标签'));
  await page.waitForSelector('[data-testid="upload-create-tag"]');
  await page.fill(
    '[data-testid="upload-create-tag"] input',
    'Issue 177 快建标签',
  );
  await resize(390);
  await shot('quick-create', 390, 'dark');
  await resize(1440);
  await shot('quick-create', 1440, 'dark');
  await page.click(button('创建标签'));
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="upload-create-tag"]'),
  );
  const [createdTag] = await sql(
    "SELECT id FROM tags WHERE display_name='Issue 177 快建标签'",
  );
  assert.ok(createdTag?.id);
  await page.fill('input[aria-label="搜索目标标签"]', 'Issue 177 快建标签');
  await page.waitForSelector(`[data-target-id="${createdTag.id}"]`);
  assert.equal(
    await page.evaluate(
      (id) => document.querySelector(`[data-target-id="${id}"] input`).checked,
      createdTag.id,
    ),
    true,
  );
  assert.match(
    await page.evaluate(
      () =>
        document.querySelector('[data-testid="batch-tag-footer"] p')
          .textContent,
    ),
    new RegExp(`${ids.length}\\s*张图片\\s*×\\s*3\\s*个标签`),
  );
  const addFeedback = await submitTagsWithToast(
    context,
    'add-tags',
    ids.length,
    sourceUrl,
  );
  await expectResults({ changed: ids.length });
  const add = await traffic();
  assert.equal(add.length, 1);
  assert.deepEqual(add[0].request.ids, ids);
  assert.deepEqual(add[0].request.command, {
    type: 'add-tags',
    tagIds: [...batchTagIds, createdTag.id],
  });
  assert.equal(
    (
      await sql(
        `SELECT count(*) AS count FROM image_tags WHERE image_id IN ('${ids.join("','")}')`,
      )
    )[0].count,
    ids.length * 3,
  );
  await returnToLibrary();
  await visit();
  for (const index of indices) await choose(index);
  await action('移除标签', ids.length);
  await page.waitForSelector(
    '[data-testid="batch-target-grid"] [data-target-id]',
  );
  await layouts('remove-tags', [390, 1440]);
  await target(batchTagIds[0]);
  await target(batchTagIds[1]);
  await page.fill('input[aria-label="搜索目标标签"]', 'Issue 177 快建标签');
  await page.waitForSelector(`[data-target-id="${createdTag.id}"]`);
  await target(createdTag.id);
  const removeFeedback = await submitTagsWithToast(
    context,
    'remove-tags',
    ids.length,
    sourceUrl,
  );
  await expectResults({ changed: ids.length });
  const remove = await traffic();
  assert.equal(remove.length, 1);
  assert.deepEqual(remove[0].request.command, {
    type: 'remove-tags',
    tagIds: [...batchTagIds, createdTag.id],
  });
  assert.deepEqual(remove[0].request.ids, ids);
  assert.deepEqual(
    await sql(
      `SELECT image_id,tag_id FROM image_tags WHERE image_id IN ('${ids.join("','")}')`,
    ),
    [],
  );
  await returnToLibrary();
  await sql(`DELETE FROM tags WHERE id='${longId}'`);
  report.tagFeedback = {
    ids,
    add: add[0].request,
    remove: remove[0].request,
    createdTagId: createdTag.id,
    longId,
    addFeedback,
    removeFeedback,
  };
  report.checks.push(
    'The approved compact tag chooser renders three/two/one readable columns with 64px cards and 48px context images, 48px natural footer actions, long names/IDs, 360/390×600 scrolling and real Escape/Space focus. Real target search and paging preserve explicit choices; quick creation persists and selects a real tag; add/remove submit the exact three target IDs and persist then remove every image relationship.',
  );
}

export async function verifyTagTargetStates(context) {
  const { page, selected, choose, action, target, visit } = context;
  await visit();
  for (const index of [0, 1, 2, 3]) await choose(index);
  await action('添加标签', 4);
  await target(batchTagIds[0]);
  await target(batchTagIds[1]);
  await verifyTagTargetReads(context, 4);
  await page.click('[data-testid="batch-cancel"]');
  await selected(4);
}
