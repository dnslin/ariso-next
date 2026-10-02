/* global taskSpace, config */
const assert = (await import('node:assert/strict')).default;
const { writeFile, rm } = await import('node:fs/promises');
const { join } = await import('node:path');
const { identitySql } = await import(config.identitySessionScript);
const { signInToLibrary } = await import(
  new URL('./library-login.mjs', config.identitySessionScript).href
);
const { resizeViewport, setTheme, readGeometry, assertGeometry } = await import(
  new URL('./browser-geometry.mjs', config.identitySessionScript).href
);
const { createTagFixtures } = await import(
  new URL('./tags-fixtures.mjs', config.identitySessionScript).href
);
const { verifyToastTextLayout } = await import(
  new URL('./toast-layout.mjs', config.identitySessionScript).href
);
const { tagStyles } = await import(
  new URL('./tags-layout.mjs', config.identitySessionScript).href
);
const { tagDialogSelector, readTagDialog, waitTagDialogText, waitTagSuccess } =
  await import(new URL('./tags-dialog.mjs', config.identitySessionScript).href);
const { verifyTagReconciliation } = await import(
  new URL('./tag-reconciliation.mjs', config.identitySessionScript).href
);
const page = (await taskSpace(config.spaceId)).page('p1');
const sql = (statement) => identitySql(config, statement);
const button = (name) => `loc=role:button[name="${name}"]`;
const report = { status: 'failed', checks: [], layouts: [], screenshots: [] };
let fixture;
let savedPreference;
const preferenceKey = 'ariso:library-preferences:v1';
async function shot(state) {
  const file = `tags-${state}.png`;
  await page.screenshot({ path: join(config.output, file) });
  report.screenshots.push(file);
}
async function api(path = '', method = 'GET', body) {
  const response = await page.fetch(`/api/tags${path}`, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
  });
  return { status: response.status, data: JSON.parse(response.body) };
}
async function list(query = '') {
  await page.goto(`${config.origin}/tags${query}`);
  await page.waitForSelector('#tags-title');
  await page.waitForFunction(
    () =>
      !!document.querySelector(
        '[data-testid="tags-list"],[data-testid="tags-empty"],[data-testid="tags-error"]',
      ) && !document.querySelector('[data-testid="tags-loading"]'),
  );
}
async function rows() {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="tag-"]')]
      .filter((row) => row.getClientRects().length)
      .map((row) => ({
        id: row.dataset.testid.slice(4),
        text: row.textContent,
      })),
  );
}
async function search(value, count) {
  await page.fill('input[aria-label="搜索标签名称"]', value);
  await page.press('input[aria-label="搜索标签名称"]', 'Enter');
  await page.waitForFunction(
    ({ value, count }) =>
      new URL(location.href).searchParams.get('q') === (value || null) &&
      !document.querySelector('[data-testid="tags-loading"]') &&
      [...document.querySelectorAll('[data-testid^="tag-"]')].filter(
        (row) => row.getClientRects().length,
      ).length === count,
    { value, count },
  );
}
async function nameField() {
  const selector = await page.evaluate((dialogSelector) => {
    const label = [
      ...document.querySelectorAll(`${dialogSelector} label`),
    ].find((node) => node.textContent.includes('名称'));
    return label?.htmlFor ? `#${CSS.escape(label.htmlFor)}` : null;
  }, tagDialogSelector);
  assert.ok(selector, 'Tag name has an external associated label');
  return selector;
}
async function openCreate() {
  await page.click(button('新建标签'));
  await page.waitForSelector(`${tagDialogSelector} input`);
}
async function fillName(name) {
  await page.fill(await nameField(), name);
}
async function rowAction(id, name) {
  const selector = `[data-testid="tag-${id}"] button:has-text("${name}")`;
  await page.click(selector);
  await page.waitForSelector(tagDialogSelector);
}
async function dismiss() {
  // Resizing can move focus out of the responsive overlay. Restore a visible
  // dialog control before dispatching the real Escape key.
  await page.focus(`${tagDialogSelector} button[aria-label="关闭"]`);
  await page.keyboard.press('Escape');
  await page.waitForSelector(tagDialogSelector, {
    state: 'hidden',
  });
}
async function returned() {
  await page.click(button('返回标签列表'));
  await page.waitForSelector(tagDialogSelector, {
    state: 'hidden',
  });
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="tags-loading"]'),
  );
}
async function layouts(state, widths = [390, 1440]) {
  for (const theme of ['light', 'dark']) {
    await setTheme(page, theme);
    for (const width of widths) {
      await resizeViewport(page, width);
      const geometry = await readGeometry(page);
      assertGeometry(geometry, `${state}/${theme}/${width}`);
      geometry.tags = await tagStyles(page, theme, width);
      geometry.toast = await verifyToastTextLayout(page);
      await shot(`${state}-${theme}-${width}`);
      report.layouts.push({ state, theme, ...geometry });
    }
  }
}
// Successful operations use real APIs and SQLite. Only response delivery is
// altered for loading, definite rejection and post-commit network loss.
async function intercept(method, mode, suffix = '', verificationFails = false) {
  await page.evaluate(
    ({ method, mode, suffix, verificationFails }) => {
      const original = window.fetch;
      window.__tagRequests = [];
      window.__tagReads = [];
      window.__tagRelease = undefined;
      window.__tagRestore = () => {
        window.fetch = original;
        window.__tagRelease?.();
      };
      window.fetch = async (...args) => {
        const url = new URL(String(args[0]), location.href);
        const verb = args[1]?.method ?? 'GET';
        if (verb === 'GET' && url.pathname.startsWith('/api/tags'))
          window.__tagReads.push(url.href);
        if (
          verificationFails &&
          method !== 'GET' &&
          verb === 'GET' &&
          url.pathname.startsWith('/api/tags')
        )
          throw new TypeError('Verification: reconciliation read unavailable');
        if (url.pathname !== `/api/tags${suffix}` || verb !== method)
          return original(...args);
        window.__tagRequests.push({ method: verb, path: url.pathname });
        if (mode === 'reject')
          return new Response(
            JSON.stringify({
              code: 'COLLECTION_INVALID_INPUT',
              message: '浏览器验证：请求被明确拒绝',
            }),
            { status: 400, headers: { 'content-type': 'application/json' } },
          );
        const response = await original(...args);
        if (mode === 'hold' || mode === 'hold-lost')
          await new Promise((resolve) => {
            window.__tagRelease = resolve;
          });
        if (mode === 'lost' || mode === 'hold-lost')
          throw new TypeError(
            'Verification: real tag response lost after commit',
          );
        window.fetch = original;
        return response;
      };
    },
    { method, mode, suffix, verificationFails },
  );
}
async function restore() {
  await page.evaluate(() => window.__tagRestore?.());
}
async function assertSingleWrite() {
  assert.equal(
    await page.evaluate(() => window.__tagRequests.length),
    1,
    'Unknown or pending mutation never writes twice',
  );
}
try {
  report.stage = 'owner session';
  await page.goto(`${config.origin}/library`);
  await page.waitForFunction(
    () =>
      location.pathname === '/login' ||
      !!document.querySelector('[data-testid="library-list"]'),
  );
  if (new URL(await page.url()).pathname === '/login')
    await signInToLibrary(page, config, report);
  savedPreference = await page.evaluate(
    (key) => localStorage.getItem(key),
    preferenceKey,
  );
  fixture = await createTagFixtures(config, sql);
  report.stage = 'write result reconciliation';
  await verifyTagReconciliation({ page, config, report });
  report.stage = 'representative list';
  await list();
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('[data-testid^="tag-"]')].filter(
        (row) => row.getClientRects().length,
      ).length === 9,
  );
  const initial = await api();
  assert.equal(initial.status, 200);
  assert.deepEqual(
    initial.data.items.map((tag) => tag.displayName),
    fixture.names,
  );
  assert.deepEqual(
    initial.data.items.map((tag) => tag.imageCount),
    fixture.counts,
  );
  await layouts('main', [1440, 390, 360, 430, 768]);
  report.checks.push(
    'The nine design rows use real records and image relationships, created-time order and normal-library counts; zero does not imply no trash relationship.',
  );
  report.stage = 'validation';
  await openCreate();
  await layouts('create');
  for (const [state, name, heading] of [
    ['empty', '   ', '请输入标签名称'],
    ['long', '📷'.repeat(51), '标签名称过长'],
    ['control', '非法\u0001名称', '名称包含不可用字符'],
  ]) {
    await fillName(name);
    await page.waitForFunction(
      () =>
        document.querySelector('[role="dialog"] h2')?.textContent.trim() ===
          '新建标签' &&
        [...document.querySelectorAll('[role="dialog"] form button')].some(
          (node) => node.textContent.trim() === '创建标签',
        ),
    );
    await page.click(button('创建标签'));
    await page.waitForFunction(
      (heading) =>
        document.querySelector('[role="dialog"] h2')?.textContent.trim() ===
          heading &&
        !!document
          .querySelector('[data-slot="field-error"]')
          ?.textContent.trim(),
      heading,
    );
    await page.waitForSelector(button('修改名称'));
    assert.equal((await sql('SELECT count(*) AS n FROM tags'))[0].n, 9);
    await layouts(`validation-${state}`);
  }
  await fillName('📷'.repeat(50));
  await intercept('POST', 'hold');
  await page.click(button('创建标签'));
  await page.waitForFunction(() => typeof window.__tagRelease === 'function');
  await page.waitForFunction(
    (dialogSelector) =>
      [...document.querySelectorAll(`${dialogSelector} button`)].some(
        (node) => node.disabled && node.textContent.includes('提交'),
      ),
    tagDialogSelector,
  );
  await page.keyboard.press('Enter');
  await assertSingleWrite();
  await layouts('create-pending');
  await restore();
  await waitTagSuccess(page, '已创建');
  await layouts('create-success');
  assert.equal(
    (
      await sql('SELECT count(*) AS n FROM tags WHERE length(display_name)=50')
    )[0].n,
    1,
  );
  report.checks.push(
    'Blank, 51-code-point emoji and control-character names retain actionable validation and do not write; 50 astral code points persist. Pending creation disables duplicate submission.',
  );
  report.stage = 'unicode reuse';
  await openCreate();
  await fillName('go');
  await page.click(button('创建标签'));
  await page.waitForSelector(button('返回标签列表'));
  assert.ok((await readTagDialog(page)).includes('Go'));
  await layouts('reuse');
  await returned();
  assert.equal(
    (await sql("SELECT count(*) AS n FROM tags WHERE normalized_key='go'"))[0]
      .n,
    1,
  );
  const caseCreated = Date.now();
  await sql(
    `INSERT INTO tags (id,display_name,normalized_key,created_at,updated_at) VALUES ${Array.from({ length: 81 }, (_, index) => `('issue176-case-${index}','go-${index}','go-${index}',${caseCreated + index},${caseCreated})`).join(',')}`,
  );
  await list();
  await openCreate();
  await fillName('GO');
  await intercept('POST', 'lost');
  await page.click(button('创建标签'));
  await page.waitForSelector(button('返回标签列表'));
  assert.ok((await readTagDialog(page)).includes('Go'));
  await assertSingleWrite();
  const verificationReads = await page.evaluate(() => window.__tagReads);
  assert.ok(
    verificationReads.some(
      (url) => new URL(url).searchParams.get('page') === '2',
    ),
    'Reconciliation examines the exact normalized key beyond 80 newer substring matches',
  );
  await shot('create-checked-second-page');
  await returned();
  await restore();
  await sql("DELETE FROM tags WHERE id GLOB 'issue176-case-*'");
  report.checks.push(
    'Lost creation of an existing exact key searches beyond the first 80 newer substring matches, finds the original Go on page two and performs one POST only.',
  );
  for (const [first, equivalent] of [
    ['Straße', 'STRASSE'],
    ['Σ', 'ς'],
    ['Café', 'Cafe\u0301'],
    ['𐐀', '𐐨'],
  ]) {
    const created = await api('', 'POST', { name: first });
    assert.equal(created.status, 201);
    const reused = await api('', 'POST', { name: equivalent });
    assert.equal(reused.status, 201);
    assert.equal(reused.data.reused, true);
    assert.equal(reused.data.tag.id, created.data.tag.id);
    assert.equal(reused.data.tag.displayName, first);
  }
  report.checks.push(
    'The real create form reuses Go; real HTTP creation preserves first spelling/ID for Straße, final sigma, NFC accents and non-BMP case pairs.',
  );
  report.stage = 'conflict and rename';
  await list();
  await rowAction('issue176-tag-1', '编辑');
  await layouts('edit');
  await fillName('GO');
  await page.click(button('保存更改'));
  await waitTagDialogText(page, '已被使用');
  assert.equal(
    await page.evaluate(
      (selector) => document.querySelector(selector).value,
      await nameField(),
    ),
    'GO',
  );
  assert.equal(
    (await sql("SELECT display_name FROM tags WHERE id='issue176-tag-1'"))[0]
      .display_name,
    '旅行',
  );
  await layouts('conflict');
  await fillName('远行');
  await page.click(button('修改名称'));
  await waitTagSuccess(page, '已重命名');
  await layouts('rename-success');
  await rowAction('issue176-tag-1', '编辑');
  await fillName('远行二');
  await intercept('PATCH', 'reject', '/issue176-tag-1');
  await page.click(button('保存更改'));
  await waitTagDialogText(page, '未能保存');
  await layouts('edit-error');
  await restore();
  await intercept('PATCH', 'lost', '/issue176-tag-1');
  await page.click(button('重试保存'));
  await page.waitForSelector(button('返回标签列表'));
  await assertSingleWrite();
  await layouts('rename-checked');
  await returned();
  await restore();
  await rowAction('issue176-tag-1', '编辑');
  await fillName('远行');
  await page.click(button('保存更改'));
  await waitTagSuccess(page, '重命名为 远行，');
  assert.equal(
    (await sql("SELECT display_name FROM tags WHERE id='issue176-tag-1'"))[0]
      .display_name,
    '远行',
  );
  assert.equal(
    (
      await sql(
        "SELECT count(*) AS n FROM image_tags WHERE tag_id='issue176-tag-1'",
      )
    )[0].n,
    4,
  );
  await rowAction('issue176-tag-0', '编辑');
  await fillName('GO');
  await page.click(button('保存更改'));
  await page.waitForSelector(button('返回标签列表'));
  await layouts('same-key-unchanged');
  await returned();
  assert.equal(
    (await sql("SELECT display_name FROM tags WHERE id='issue176-tag-0'"))[0]
      .display_name,
    'Go',
  );
  report.checks.push(
    '409 retains conflict input and both records. A committed rename with lost response is reconciled by its existing ID, retaining four relations including trash. Same-key casing preserves Go.',
  );
  report.stage = 'tag id query and return';
  await search('远行', 1);
  const source = await page.url();
  await page.click('[data-testid="tag-issue176-tag-1"] a');
  await page.waitForFunction(
    () =>
      location.pathname === '/library' &&
      new URL(location.href).searchParams
        .getAll('tagId')
        .includes('issue176-tag-1'),
  );
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="library-loading"]'),
  );
  const library = await page.fetch('/api/images?tagId=issue176-tag-1');
  assert.equal(library.status, 200);
  assert.equal(JSON.parse(library.body).total, 3);
  await layouts('renamed-library');
  await page.evaluate(() => history.back());
  await page.waitForURL(source);
  await page.waitForFunction(
    () =>
      document.querySelector('input[aria-label="搜索标签名称"]')?.value ===
        '远行' &&
      !document.querySelector('[data-testid="tags-loading"]') &&
      [...document.querySelectorAll('[data-testid^="tag-"]')].filter(
        (row) => row.getClientRects().length,
      ).length === 1,
  );
  assert.equal((await rows()).length, 1);
  assert.equal((await rows())[0].id, 'issue176-tag-1');
  report.checks.push(
    'The renamed row opens the existing library with unchanged real tagId and three normal members. Browser Back restores the source query and rereads the current name.',
  );
  report.stage = 'definite and unknown results';
  await list();
  await openCreate();
  await fillName('明确失败输入');
  await intercept('POST', 'reject');
  await page.click(button('创建标签'));
  await waitTagDialogText(page, '未能创建');
  assert.equal(
    await page.evaluate(
      (selector) => document.querySelector(selector).value,
      await nameField(),
    ),
    '明确失败输入',
  );
  await page.waitForSelector(button('重新创建'));
  await layouts('create-error');
  await restore();
  await dismiss();
  await openCreate();
  await fillName('结果待核对');
  await intercept('POST', 'lost', '', true);
  await page.click(button('创建标签'));
  await waitTagDialogText(page, '待核对');
  await layouts('unknown');
  await page.keyboard.press('Enter');
  await assertSingleWrite();
  assert.equal(
    (
      await sql(
        "SELECT count(*) AS n FROM tags WHERE display_name='结果待核对'",
      )
    )[0].n,
    1,
  );
  await dismiss();
  await page.waitForFunction(() =>
    document
      .querySelector('[data-testid="tags-notice"]')
      ?.textContent.includes('操作结果仍待核对'),
  );
  const unknownNotice = await page.evaluate(
    () => document.querySelector('[data-testid="tags-notice"]').textContent,
  );
  assert.ok(
    unknownNotice.includes('结果待核对') &&
      unknownNotice.includes('不表示成功'),
  );
  await assertSingleWrite();
  await restore();
  const needsReload = await page.evaluate(
    () => !!document.querySelector('[data-testid="tags-error"]'),
  );
  if (needsReload) {
    await page.click(button('重新加载'));
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="tags-error"]'),
    );
  }
  const checked = await api(`?q=${encodeURIComponent('结果待核对')}`);
  assert.equal(checked.status, 200);
  assert.equal(
    checked.data.items.filter((tag) => tag.displayName === '结果待核对').length,
    1,
  );
  await openCreate();
  assert.equal(
    await page.evaluate(
      (selector) => document.querySelector(selector).value,
      await nameField(),
    ),
    '',
    'Explicit New Tag opens a new blank operation after closing an unknown result',
  );

  await dismiss();
  report.checks.push(
    'A definite HTTP 400 rejection preserves input. A post-commit network loss plus failed reconciliation retains an unknown result with one write; closing keeps the submitted name and unresolved status in the list notice. Restored reads find the one record, and explicit New Tag opens a blank form without pretending the earlier request succeeded.',
  );
  report.stage = 'delete relationship and rebuild';
  await rowAction('issue176-tag-1', '删除');
  const deleteText = await readTagDialog(page);
  assert.ok(deleteText.includes('回收站') && deleteText.includes('图片'));
  await layouts('delete-confirm');
  await dismiss();
  assert.equal(
    (await sql("SELECT count(*) AS n FROM tags WHERE id='issue176-tag-1'"))[0]
      .n,
    1,
  );
  await rowAction('issue176-tag-1', '删除');
  await intercept('DELETE', 'reject', '/issue176-tag-1');
  await page.click(button('删除标签'));
  await waitTagDialogText(page, '未能删除');
  await page.waitForSelector(button('重试删除'));
  await layouts('delete-error');
  await restore();
  await dismiss();
  await rowAction('issue176-tag-1', '删除');
  await intercept('DELETE', 'hold-lost', '/issue176-tag-1');
  await page.click(button('删除标签'));
  await page.waitForFunction(() => typeof window.__tagRelease === 'function');
  await page.keyboard.press('Enter');
  await assertSingleWrite();
  await shot('delete-pending');
  await page.evaluate(() => window.__tagRelease());
  await waitTagSuccess(page, '已不存在');
  await assertSingleWrite();
  await layouts('delete-success');
  await restore();
  assert.equal(
    (
      await sql(
        "SELECT count(*) AS n FROM image_tags WHERE tag_id='issue176-tag-1'",
      )
    )[0].n,
    0,
  );
  assert.equal(
    (
      await sql(
        "SELECT count(*) AS n FROM media_images WHERE id GLOB 'issue176-image-*'",
      )
    )[0].n,
    173,
  );
  const rebuilt = await api('', 'POST', { name: '远行' });
  assert.equal(rebuilt.status, 201);
  assert.notEqual(rebuilt.data.tag.id, 'issue176-tag-1');
  assert.equal(rebuilt.data.tag.imageCount, 0);
  const invalidReference = await page.fetch('/api/images?tagId=issue176-tag-1');
  assert.equal(invalidReference.status, 409);
  assert.equal(
    (
      await sql(
        `SELECT count(*) AS n FROM image_tags WHERE tag_id='${rebuilt.data.tag.id}'`,
      )
    )[0].n,
    0,
  );
  await list();
  await rowAction('issue176-tag-0', '删除');
  await layouts('empty-tag-delete');
  await page.click(button('删除标签'));
  await waitTagSuccess(page, '已删除');
  await sql(
    "UPDATE media_images SET trashed_at=NULL WHERE id='issue176-image-172'",
  );
  assert.equal(
    (
      await sql(
        `SELECT count(*) AS n FROM image_tags WHERE tag_id='${rebuilt.data.tag.id}'`,
      )
    )[0].n,
    0,
    'Restoring a trashed image does not recreate removed tag relations',
  );
  report.checks.push(
    'Cancel and a definite delete error retain the tag. Lost successful DELETE is reconciled by ID with one write. All normal/trash relations disappear, all 173 images remain, and same-name rebuilding creates a fresh unbound ID; the old library reference is 409.',
  );
  report.stage = 'target disappearance';
  const vanished = await api('', 'POST', { name: '已经消失的标签' });
  await list();
  await rowAction(vanished.data.tag.id, '编辑');
  assert.equal((await api(`/${vanished.data.tag.id}`, 'DELETE')).status, 200);
  const replacement = await api('', 'POST', { name: '已经消失的标签' });
  assert.notEqual(replacement.data.tag.id, vanished.data.tag.id);
  await fillName('不能绑定同名新标签');
  await page.click(button('保存更改'));
  await waitTagDialogText(page, '已不存在');
  await layouts('target-missing');
  assert.equal(
    (await api(`/${replacement.data.tag.id}`)).data.tag.displayName,
    '已经消失的标签',
  );
  await page.click(button('重新加载'));
  await page.waitForSelector(tagDialogSelector, {
    state: 'hidden',
  });
  report.checks.push(
    'A real concurrently removed edit target returns 404; same-name recreation keeps a new ID and cannot receive the stale operation.',
  );
  report.stage = 'pagination and literal search';
  await sql('DELETE FROM image_tags');
  await sql('DELETE FROM tags');
  const created = Date.now();
  await sql(
    `INSERT INTO tags (id,display_name,normalized_key,created_at,updated_at) VALUES ${Array.from(
      { length: 85 },
      (_, index) => {
        const name =
          index === 0
            ? '百分%标签'
            : index === 1
              ? '下划_标签'
              : `分页标签 ${String(index).padStart(2, '0')}`;
        return `('issue176-page-${index}','${name}','${name}',${created - index},${created})`;
      },
    ).join(',')}`,
  );
  await list();
  await page.fill('input[aria-label="搜索标签名称"]', '');
  await page.focus('input[aria-label="搜索标签名称"]');
  await page.keyboard.type('旅行 生活');
  assert.equal(
    await page.evaluate(
      () => document.querySelector('input[aria-label="搜索标签名称"]').value,
    ),
    '旅行 生活',
    'Continuous typing preserves internal whitespace',
  );
  await search('', 40);
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('[data-testid^="tag-"]')].filter(
        (row) => row.getClientRects().length,
      ).length === 40,
  );
  const first = await rows();
  await page.click(button('下一页'));
  await page.waitForFunction(
    () =>
      new URL(location.href).searchParams.get('page') === '2' &&
      !document.querySelector('[data-testid="tags-loading"]'),
  );
  const second = await rows();
  assert.equal(second.length, 40);
  assert.equal(
    first.some((item) => second.some((other) => other.id === item.id)),
    false,
  );
  const pageTwo = await page.url();
  await page.click(`[data-testid="tag-${second[0].id}"] a`);
  await page.waitForFunction(() => location.pathname === '/library');
  await page.evaluate(() => history.back());
  await page.waitForURL(pageTwo);
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="tags-loading"]'),
  );
  assert.deepEqual(
    (await rows()).map((item) => item.id),
    second.map((item) => item.id),
  );
  await page.click(button('下一页'));
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('[data-testid^="tag-"]')].filter(
        (row) => row.getClientRects().length,
      ).length === 5,
  );
  assert.equal(first.length + second.length + (await rows()).length, 85);
  await search('%', 1);
  assert.ok((await rows())[0].text.includes('百分%标签'));
  assert.equal(new URL(await page.url()).searchParams.get('page'), null);
  await search('_', 1);
  assert.ok((await rows())[0].text.includes('下划_标签'));
  await search('不存在的标签', 0);
  await layouts('search-empty');
  await page.click(button('清除搜索'));
  await page.waitForFunction(
    () =>
      !new URL(location.href).searchParams.has('q') &&
      !document.querySelector('[data-testid="tags-loading"]') &&
      [...document.querySelectorAll('[data-testid^="tag-"]')].filter(
        (row) => row.getClientRects().length,
      ).length === 40,
  );
  for (const size of [20, 80]) {
    await page.click('loc=role:button[name*="每页标签数"]');
    await page.click(`loc=role:option[name="${size} 条"]`);
    await page.waitForFunction(
      (size) =>
        [...document.querySelectorAll('[data-testid^="tag-"]')].filter(
          (row) => row.getClientRects().length,
        ).length === size &&
        new URL(location.href).searchParams.get('pageSize') === String(size),
      size,
    );
  }
  await layouts('pagination');
  report.checks.push(
    '85 real tags span three default pages without overlap. Browser Back preserves page two; normalized search treats %/_ literally, resets the page, and the actual Clear Search action removes q and restores 40 rows. Both 20/80 page sizes work.',
  );
  report.stage = 'loading empty error';
  await intercept('GET', 'hold');
  await page.fill('input[aria-label="搜索标签名称"]', '分页');
  await page.press('input[aria-label="搜索标签名称"]', 'Enter');
  await page.waitForFunction(() => typeof window.__tagRelease === 'function');
  await page.waitForSelector('[data-testid="tags-loading"]');
  await layouts('loading');
  await restore();
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="tags-loading"]'),
  );
  await intercept('GET', 'lost');
  await page.focus('input[aria-label="搜索标签名称"]');
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('读取失败');
  await page.waitForSelector('[data-testid="tags-error"]');
  assert.equal(
    await page.evaluate(() =>
      document.querySelector('#tags-title').textContent.trim(),
    ),
    '标签加载失败',
  );
  assert.equal(
    await page.evaluate(
      () => !!document.querySelector('input[aria-label="搜索标签名称"]'),
    ),
    false,
    'A failed list read does not retain a misleading search/list header',
  );
  assert.equal(
    await page.evaluate(
      () => !!document.querySelector('[data-testid="tags-empty"]'),
    ),
    false,
  );
  await layouts('list-error');
  await restore();
  await page.click(button('重新加载'));
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="tags-error"]'),
  );
  await sql('DELETE FROM tags');
  await list();
  await page.waitForSelector('[data-testid="tags-empty"]');
  await layouts('empty');
  report.checks.push(
    'Held list responses expose loading; lost reads expose an actionable error instead of an empty count. Retry recovers. Zero tags has its own creation action.',
  );
  report.stage = 'short viewport and keyboard';
  for (const width of [390, 1440]) {
    await resizeViewport(page, width, 400);
    await page.focus(button('新建标签'));
    await page.keyboard.press('Enter');
    await page.waitForSelector(`${tagDialogSelector} input`);
    await fillName('短视口可编辑名称');
    await page.focus(button('创建标签'));
    const focused = await page.evaluate(() => {
      const rect = document.activeElement.getBoundingClientRect();
      return {
        text: document.activeElement.textContent.trim(),
        top: rect.top,
        bottom: rect.bottom,
        height: innerHeight,
      };
    });
    assert.equal(focused.text, '创建标签');
    assert.ok(
      focused.top >= 0 && focused.bottom <= focused.height,
      'Short viewport keeps focused submission visible',
    );
    await shot(`short-${width}-focused`);
    await dismiss();
    await page.waitForFunction(
      () => document.activeElement?.textContent.trim() === '新建标签',
    );
  }
  report.checks.push(
    'Keyboard opens the name form, Escape restores New Tag, and 390×400/1440×400 keep the focused action visible; main light/dark layouts cover 360/390/430/768/1440 with clickable targets.',
  );
  await resizeViewport(page, 390);
  await setTheme(page, 'light');
  report.stage = 'anonymous upload handoff';
  assert.ok((await sql('DELETE FROM session')).changes > 0);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForSelector('#email');
  assert.equal((await page.fetch('/api/tags')).status, 401);
  await page.goto(`${config.origin}/upload`);
  await page.waitForSelector('#email');
  report.status = 'passed';
  delete report.stage;
} catch (error) {
  report.error = String(error.stack ?? error);
  report.failureSnapshot = await page.snapshot();
  await shot('failure');
  throw error;
} finally {
  await restore();
  await sql('DELETE FROM image_tags');
  await sql('DELETE FROM tags');
  await sql(
    "DELETE FROM media_versions WHERE image_id GLOB 'issue176-image-*'",
  );
  await sql("DELETE FROM media_objects WHERE image_id GLOB 'issue176-image-*'");
  await sql("DELETE FROM media_images WHERE id GLOB 'issue176-image-*'");
  await sql("DELETE FROM storage_configs WHERE id='issue176-storage'");
  if (fixture) await rm(fixture.directory, { recursive: true, force: true });
  if (savedPreference !== undefined)
    await page.evaluate(
      ({ key, value }) => {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      },
      { key: preferenceKey, value: savedPreference },
    );
  await writeFile(
    join(config.output, 'tags.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
console.log(report);
