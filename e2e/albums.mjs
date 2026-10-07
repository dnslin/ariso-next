/* global taskSpace, config */
const assert = (await import('node:assert/strict')).default;
const { writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { identitySql, openIdentityAccountMenu } = await import(
  config.identitySessionScript
);
const { resizeViewport, setTheme, readGeometry, assertGeometry } = await import(
  new URL('./browser-geometry.mjs', config.identitySessionScript).href
);
const { waitForOwnerRoute } = await import(
  new URL('./owner-shell.mjs', config.identitySessionScript).href
);
const page = (await taskSpace(config.spaceId)).page('p1');
const button = (name) => `loc=role:button[name="${name}"]`;
const report = { status: 'failed', checks: [], layouts: [] };
const sql = (statement) => identitySql(config, statement);
const shot = (state) =>
  page.screenshot({ path: join(config.output, `albums-${state}.png`) });
const cards = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('a[data-testid^="album-"]')].map((node) => ({
      id: node.dataset.testid.slice(6),
      text: node.textContent,
    })),
  );
async function signInAt(path) {
  await page.goto(`${config.origin}${path}`);
  if (new URL(await page.url()).pathname === '/login') {
    await page.waitForSelector('#email');
    await page.fill('#email', config.credentials.email);
    await page.fill('#password', config.credentials.password);
    await page.click(button('登录'));
    await page.waitForFunction(
      (path) =>
        location.pathname === path ||
        document
          .querySelector('[role="alert"]')
          ?.textContent.includes('HTTP 429'),
      path,
    );
    if (new URL(await page.url()).pathname === '/login') {
      await page.waitForFunction(
        () => !document.querySelector('button[type="submit"]').disabled,
        undefined,
        { timeout: 15000 },
      );
      await page.click(button('登录'));
    }
  }
  await waitForOwnerRoute(page, config, path);
}
const resize = (width, height) => resizeViewport(page, width, height);
async function list() {
  await page.goto(`${config.origin}/albums`);
  await page.waitForSelector('input[aria-label="搜索相册"]');
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="albums-loading"]'),
  );
}
async function field(label) {
  const selector = await page.evaluate((label) => {
    const node = [...document.querySelectorAll('label')].find((node) =>
      node.textContent.includes(label),
    );
    return node?.htmlFor ? `#${CSS.escape(node.htmlFor)}` : null;
  }, label);
  assert.ok(selector, `Visible external field label: ${label}`);
  return selector;
}
async function fillForm(name, description = '') {
  await page.fill(await field('相册名称'), name);
  if (await page.evaluate(() => !!document.querySelector('#album-description')))
    await page.fill(await field('描述'), description);
}
async function openCreate() {
  await page.click(button('新建相册'));
  await page.waitForSelector('[role="dialog"] input');
}
async function create(name) {
  await list();
  await openCreate();
  await fillForm(name);
  await page.click(button('创建'));
  await page.waitForFunction(() => /^\/albums\/[^/]+$/.test(location.pathname));
  await page.waitForSelector(button('编辑相册'));
  return new URL(await page.url()).pathname.split('/').at(-1);
}
async function layouts(state, widths = [360, 390, 430, 768, 1440]) {
  for (const theme of ['light', 'dark']) {
    await setTheme(page, theme);
    for (const width of widths) {
      await resize(width);
      const geometry = await readGeometry(page);
      geometry.sectionOverflow = await page.evaluate(
        () =>
          document.querySelector('main section').scrollWidth >
          document.querySelector('main section').clientWidth,
      );
      assertGeometry(geometry, `${state}/${theme}/${width}`);
      assert.equal(
        geometry.sectionOverflow,
        false,
        `${state}/${theme}/${width} content stays within its padded column`,
      );
      await shot(`${state}-${theme}-${width}`);
      report.layouts.push({ state, theme, ...geometry });
    }
  }
}
// Only the browser transport boundary is altered. Successful mutations and reads
// use the production app and the runner's disposable SQLite database.
async function intercept(method, mode, suffix = '') {
  await page.evaluate(
    ({ method, mode, suffix }) => {
      const original = window.fetch;
      window.__albumRequests = [];
      window.__albumRelease = undefined;
      window.__albumRestore = () => {
        window.fetch = original;
        window.__albumRelease?.();
      };
      window.fetch = async (...args) => {
        const path = new URL(String(args[0]), location.href).pathname;
        const verb = args[1]?.method ?? 'GET';
        if (path !== `/api/albums${suffix}` || verb !== method)
          return original(...args);
        window.__albumRequests.push({ method: verb, path });
        if (mode === 'reject')
          return new Response(
            JSON.stringify({
              code: 'COLLECTION_INVALID_INPUT',
              message: '浏览器验证：拒绝当前输入',
            }),
            { status: 400, headers: { 'content-type': 'application/json' } },
          );
        const response = await original(...args);
        if (mode === 'lost')
          throw new TypeError(
            'Verification: real album response lost after commit',
          );
        if (mode === 'hold' || mode === 'hold-lost')
          await new Promise((resolve) => {
            window.__albumRelease = resolve;
          });
        if (mode === 'hold-lost')
          throw new TypeError(
            'Verification: held album response lost after commit',
          );
        window.fetch = original;
        return response;
      };
    },
    { method, mode, suffix },
  );
}
async function restore() {
  await page.evaluate(() => window.__albumRestore?.());
}
async function signOut() {
  await page.evaluate(() => {
    const original = window.fetch;
    window.__albumAuthRequests = [];
    window.__albumRestoreAuth = () => {
      window.fetch = original;
    };
    window.fetch = async (...args) => {
      const requests = window.__albumAuthRequests;
      const path = new URL(String(args[0]), location.href).pathname;
      const record = path.startsWith('/api/auth/') ? { path } : null;
      if (record) requests.push(record);
      const response = await original(...args);
      if (record) {
        Object.assign(record, {
          status: response.status,
          retryAfter: response.headers.get('x-retry-after'),
          receivedAt: Date.now(),
        });
      }
      return response;
    };
  });
  await openIdentityAccountMenu(page);
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.evaluate(() => {
      window.__albumAuthRequests = [];
    });
    await page.click(button('退出登录'));
    await page.waitForFunction(
      () =>
        (location.pathname === '/login' &&
          !!document.querySelector('#email')) ||
        (window.__albumAuthRequests?.some((entry) => entry.status === 429) &&
          [...document.querySelectorAll('[role="alert"]')].some((alert) =>
            /尚未确认会话已退出|退出失败/.test(alert.textContent),
          )),
    );
    if (new URL(await page.url()).pathname === '/login') {
      await page.waitForSelector('#email');
      return;
    }
    const responses = await page.evaluate(() => window.__albumAuthRequests);
    assert.ok(
      responses.every(
        (entry) =>
          entry.status === undefined ||
          entry.status < 400 ||
          entry.status === 429,
      ),
      'Non-rate-limit authentication failures are not retried',
    );
    const limited = responses.at(-1);
    assert.equal(
      limited?.status,
      429,
      'The current logout request was rate-limited',
    );
    const seconds = Number(limited?.retryAfter);
    assert.ok(
      seconds > 0 && seconds <= 60,
      'Actual logout verification limit supplies a bounded retry deadline',
    );
    (report.logoutRateLimits ??= []).push(limited);
    if (attempt === 2) break;
    await page.waitForFunction(
      (deadline) => Date.now() >= deadline,
      limited.receivedAt + seconds * 1000,
      { timeout: seconds * 1000 + 1000 },
    );
    await page.waitForFunction(() =>
      [...document.querySelectorAll('button')].some(
        (node) => node.textContent === '退出登录' && !node.disabled,
      ),
    );
  }
  assert.fail('Actual logout did not recover after the server retry windows');
}

async function search(value, count) {
  await page.fill('input[aria-label="搜索相册"]', value);
  await page.press('input[aria-label="搜索相册"]', 'Enter');
  await page.waitForFunction(
    ({ value, count }) =>
      document.querySelector('input[aria-label="搜索相册"]').value === value &&
      !document.querySelector('[data-testid="albums-loading"]') &&
      document.querySelectorAll('a[data-testid^="album-"]').length === count,
    { value, count },
  );
}
try {
  report.stage = 'owner session';
  await signInAt('/albums');
  report.stage = 'empty';
  await list();
  // Only albums created in this disposable runner are removed; real preview data
  // is never addressed by this suite.
  await sql('DELETE FROM albums');
  await list();
  await page.waitForSelector('[data-testid="albums-empty"]');
  await layouts('empty');
  report.stage = 'create validation';
  await openCreate();
  await fillForm('   ');
  await page.click(button('创建'));
  await page.waitForFunction(() =>
    document
      .querySelector('[data-slot="field-error"]')
      ?.textContent.includes('1–100'),
  );
  assert.equal((await sql('SELECT count(*) AS n FROM albums'))[0].n, 0);
  await fillForm('名'.repeat(101));
  await page.click(button('创建'));
  await page.waitForFunction(() =>
    document
      .querySelector('[data-slot="field-error"]')
      ?.textContent.includes('1–100'),
  );
  assert.equal((await sql('SELECT count(*) AS n FROM albums'))[0].n, 0);
  await fillForm('📷'.repeat(100), '述'.repeat(2000));
  await layouts('create-boundary', [390, 1440]);
  await intercept('POST', 'hold');
  await page.click(button('创建'));
  await page.waitForFunction(() => typeof window.__albumRelease === 'function');
  await page.waitForFunction(() =>
    [...document.querySelectorAll('button')].some(
      (node) => node.textContent.trim() === '正在提交…' && node.disabled,
    ),
  );
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => window.__albumRequests.length), 1);
  await shot('create-pending-disabled');
  await restore();
  await page.waitForFunction(() => /^\/albums\/[^/]+$/.test(location.pathname));
  const boundaryId = new URL(await page.url()).pathname.split('/').at(-1);
  await page.waitForSelector(button('编辑相册'));
  await page.click(button('编辑相册'));
  await page.waitForSelector('#album-description');
  await fillForm('📷'.repeat(100), '述'.repeat(2001));
  await page.click(button('保存'));
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[data-slot="field-error"]')].some((node) =>
      node.textContent.includes('2000'),
    ),
  );
  assert.equal(
    (await sql(`SELECT description FROM albums WHERE id='${boundaryId}'`))[0]
      .description,
    '',
  );
  await fillForm('📷'.repeat(100), '述'.repeat(2000));
  await intercept('PATCH', 'hold', `/${boundaryId}`);
  await page.click(button('保存'));
  await page.waitForFunction(() => typeof window.__albumRelease === 'function');
  await page.waitForFunction(() =>
    [...document.querySelectorAll('button')].some(
      (node) => node.textContent.trim() === '正在提交…' && node.disabled,
    ),
  );
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => window.__albumRequests.length), 1);
  await shot('edit-pending-disabled');
  await restore();
  await page.waitForSelector(button('返回相册'));
  await layouts('edit-success', [390, 1440]);
  await page.click(button('返回相册'));
  const boundary = await sql(
    `SELECT name,description FROM albums WHERE id='${boundaryId}'`,
  );
  assert.equal([...boundary[0].name].length, 100);
  assert.equal(boundary[0].description.length, 2000);
  report.checks.push(
    'Blank names, 101 code points and 2001 description characters do not write; 100 astral Unicode code points and 2000 description characters persist through the actual form.',
  );

  report.stage = 'duplicate names';
  const first = await create('  同名旅行  ');
  const second = await create('同名旅行');
  assert.notEqual(first, second);
  const duplicates = await sql(
    "SELECT id,name,description FROM albums WHERE name='同名旅行'",
  );
  assert.equal(duplicates.length, 2);
  assert.equal(duplicates.find((row) => row.id === first).description, '');
  await list();
  await search('同名旅行', 2);
  const visibleDuplicates = await cards();
  assert.deepEqual(
    visibleDuplicates.map((row) => row.id).sort(),
    [first, second].sort(),
  );
  assert.ok(
    visibleDuplicates.every((row) => row.text.includes(row.id.slice(0, 8))),
    'Same-name cards expose their stable album identity',
  );
  await layouts('same-name');
  await page.click(`[data-testid="album-${first}"]`);
  await page.waitForSelector(button('编辑相册'));
  await page.click(button('编辑相册'));
  await page.waitForSelector('[role="dialog"] input');
  await fillForm('编辑后的相册', '保留的描述');
  await intercept('PATCH', 'reject', `/${first}`);
  await page.click(button('保存'));
  await page.waitForSelector(button('重试保存'));
  assert.equal(
    await page.evaluate(
      (selector) => document.querySelector(selector).value,
      await field('相册名称'),
    ),
    '编辑后的相册',
  );
  await layouts('edit-error', [390, 1440]);
  await restore();
  await intercept('PATCH', 'lost', `/${first}`);
  await page.click(button('重试保存'));
  await page.waitForSelector(button('返回相册'));
  await page.click(button('返回相册'));
  await page.waitForFunction(
    () => !document.querySelector('[role="dialog"] input'),
  );
  assert.equal(
    (await sql(`SELECT name FROM albums WHERE id='${first}'`))[0].name,
    '编辑后的相册',
  );
  assert.equal(
    (await sql(`SELECT name FROM albums WHERE id='${second}'`))[0].name,
    '同名旅行',
  );
  assert.equal(await page.evaluate(() => window.__albumRequests.length), 1);
  await restore();
  report.checks.push(
    'Duplicate names retain different IDs; edit validation failure preserves input, and a committed PATCH with a lost response is reconciled by ID without a second write or changing its namesake.',
  );

  report.stage = 'delete';
  await page.click(button('更多'));
  await page.click(button('删除相册…'));
  await page.waitForSelector('loc=role:dialog[name="删除这本相册？"]');
  await layouts('delete-confirm', [390, 1440]);
  await page.keyboard.press('Escape');
  assert.equal(
    (await sql(`SELECT count(*) AS n FROM albums WHERE id='${first}'`))[0].n,
    1,
  );
  await page.click(button('更多'));
  await page.click(button('删除相册…'));
  await intercept('DELETE', 'reject', `/${first}`);
  await page.click(button('删除相册'));
  await page.waitForFunction(() =>
    document.querySelector('[role="dialog"]')?.textContent.includes('删除失败'),
  );
  assert.equal(
    (await sql(`SELECT count(*) AS n FROM albums WHERE id='${first}'`))[0].n,
    1,
  );
  await layouts('delete-error', [390, 1440]);
  await restore();
  await intercept('DELETE', 'hold-lost', `/${first}`);
  await page.click(button('重新确认删除'));
  await page.waitForSelector('loc=role:dialog[name="删除这本相册？"]');
  await page.click(button('删除相册'));
  await page.waitForFunction(() => typeof window.__albumRelease === 'function');
  await page.waitForFunction(() =>
    [...document.querySelectorAll('button')].some(
      (node) => node.textContent.trim() === '正在提交…' && node.disabled,
    ),
  );
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => window.__albumRequests.length), 1);
  await shot('delete-pending-disabled');
  await page.evaluate(() => window.__albumRelease());
  await page.waitForSelector(button('返回相册列表'));
  await layouts('delete-success', [390, 1440]);
  assert.equal(await page.evaluate(() => window.__albumRequests.length), 1);
  await page.click(button('返回相册列表'));
  await page.waitForURL(`${config.origin}/albums`);
  assert.equal(
    (await sql(`SELECT count(*) AS n FROM albums WHERE id='${first}'`))[0].n,
    0,
  );
  assert.equal(
    (await sql(`SELECT count(*) AS n FROM albums WHERE id='${second}'`))[0].n,
    1,
  );
  await restore();
  report.checks.push(
    'Cancel does not delete; a real DELETE with a lost response is reconciled with 404 and returns to the list, leaving its namesake intact.',
  );

  report.stage = 'unknown creation';
  await list();
  await openCreate();
  await fillForm('结果待核对', '不得自动重复创建');
  await intercept('POST', 'lost');
  await page.click(button('创建'));
  await page.waitForFunction(() =>
    document.body.textContent.includes('提交结果未知'),
  );
  assert.equal(
    (await sql("SELECT count(*) AS n FROM albums WHERE name='结果待核对'"))[0]
      .n,
    1,
  );
  assert.equal(
    await page.evaluate(() =>
      [...document.querySelectorAll('button')].some(
        (node) => node.textContent.trim() === '创建' && !node.disabled,
      ),
    ),
    false,
  );
  await layouts('create-unknown', [390, 1440]);
  await page.click(button('重新核对'));
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll('button')].find(
        (node) => node.textContent.trim() === '重新核对',
      )?.disabled,
  );
  assert.equal(await page.evaluate(() => window.__albumRequests.length), 1);
  assert.equal(
    (await sql("SELECT count(*) AS n FROM albums WHERE name='结果待核对'"))[0]
      .n,
    1,
  );
  await restore();
  await page.click(button('返回核对'));
  await page.waitForSelector('[role="dialog"]', { state: 'hidden' });
  await openCreate();
  await page.waitForFunction(() =>
    document
      .querySelector('[role="dialog"]')
      ?.textContent.includes('提交结果未知'),
  );
  assert.equal(
    await page.evaluate(() => document.querySelector('#album-name').value),
    '结果待核对',
  );
  assert.equal(
    await page.evaluate(() =>
      [...document.querySelectorAll('button')].some(
        (node) => node.textContent.trim() === '创建' && !node.disabled,
      ),
    ),
    false,
  );
  assert.equal(
    await page.evaluate(() =>
      [...document.querySelectorAll('button')].some(
        (node) => node.textContent.trim() === '结束本次操作' && !node.disabled,
      ),
    ),
    true,
    'An unknown creation can be explicitly ended without reloading the page',
  );
  await resize(390, 400);
  // HeroUI updates its visual-viewport CSS variable after the CDP viewport.
  // Wait for the actual dialog to shrink before testing native Tab scrolling.
  await page.waitForFunction(
    () =>
      document.querySelector('[role="dialog"]').getBoundingClientRect()
        .height <=
      innerHeight - 32,
  );
  await page.focus(button('返回核对'));
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.waitForFunction(() => {
    const active = document.activeElement;
    const rect = active?.getBoundingClientRect();
    return (
      active?.textContent.trim() === '结束本次操作' &&
      rect.top >= 0 &&
      rect.bottom <= innerHeight
    );
  });
  const ending = await page.evaluate(() => {
    const active = document.activeElement;
    const rect = active.getBoundingClientRect();
    return {
      focused: active.textContent.trim(),
      top: rect.top,
      bottom: rect.bottom,
      height: innerHeight,
    };
  });
  assert.equal(ending.focused, '结束本次操作');
  assert.ok(
    ending.top >= 0 && ending.bottom <= ending.height,
    'The explicit ending control scrolls into a short viewport for keyboard use',
  );
  await shot('create-unknown-short-focused');
  await page.keyboard.press('Enter');
  await page.waitForSelector('[role="dialog"]', { state: 'hidden' });
  await page.waitForFunction(
    () => document.activeElement?.textContent.trim() === '新建相册',
  );
  await page.keyboard.press('Enter');
  await page.waitForSelector('[role="dialog"] input');
  assert.equal(
    await page.evaluate(() => document.querySelector('#album-name').value),
    '',
  );
  await fillForm('核对后的另一相册', '独立的新建操作');
  await page.click(button('创建'));
  await page.waitForFunction(() => /^\/albums\/[^/]+$/.test(location.pathname));
  await page.waitForSelector(button('编辑相册'));
  assert.equal(
    (
      await sql(
        "SELECT count(*) AS n FROM albums WHERE name='核对后的另一相册'",
      )
    )[0].n,
    1,
  );
  assert.equal(
    (await sql("SELECT count(*) AS n FROM albums WHERE name='结果待核对'"))[0]
      .n,
    1,
  );
  report.checks.push(
    'A lost POST response retains inputs and disables Create across closing and reopening; rechecking never duplicates the album. The ending control is reachable in a short viewport, restores keyboard focus to New Album, and allows a fresh creation in the same page while retaining exactly one original album.',
  );

  report.stage = 'pagination and literal search';
  await list();
  const seeded = await page.evaluate(async () => {
    const ids = [];
    for (let index = 0; index < 42; index++) {
      const name =
        index === 0
          ? '百分%相册'
          : index === 1
            ? '下划_相册'
            : `分页相册 ${String(index).padStart(2, '0')}`;
      const response = await fetch('/api/albums', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, description: '' }),
      });
      if (response.status !== 201)
        throw new Error(
          `Real fixture creation failed: HTTP ${response.status}`,
        );
      ids.push((await response.json()).album.id);
    }
    return ids;
  });
  assert.equal(new Set(seeded).size, 42);
  await list();
  await page.waitForFunction(
    () => document.querySelectorAll('a[data-testid^="album-"]').length === 40,
  );
  const firstPage = await cards();
  await page.click(button('下一页'));
  await page.waitForFunction(
    () =>
      document.querySelectorAll('a[data-testid^="album-"]').length > 0 &&
      document.querySelectorAll('a[data-testid^="album-"]').length < 40,
  );
  const secondPage = await cards();
  assert.equal(
    firstPage.some((row) => secondPage.some((other) => other.id === row.id)),
    false,
  );
  assert.equal(
    firstPage.length + secondPage.length,
    (await sql('SELECT count(*) AS n FROM albums'))[0].n,
  );
  await search('%', 1);
  assert.ok((await cards())[0].text.includes('百分%相册'));
  assert.equal(
    await page.evaluate(
      () =>
        [...document.querySelectorAll('button')].find(
          (node) => node.textContent.trim() === '上一页',
        )?.disabled,
    ),
    true,
  );
  await search('_', 1);
  assert.ok((await cards())[0].text.includes('下划_相册'));
  await search('不存在的搜索词', 0);
  await layouts('search-empty', [390, 1440]);
  await list();
  await layouts('populated');
  for (const size of [20, 80]) {
    await page.click('loc=role:button[name*="每页相册数"]');
    await page.click(`loc=role:option[name="${size} 本 / 页"]`);
    const expected = Math.min(
      size,
      (await sql('SELECT count(*) AS n FROM albums'))[0].n,
    );
    await page.waitForFunction(
      ({ size, expected }) =>
        document
          .querySelector('[data-slot="select-trigger"]')
          ?.textContent.includes(String(size)) &&
        document.querySelectorAll('a[data-testid^="album-"]').length ===
          expected,
      { size, expected },
    );
  }
  report.checks.push(
    'Default pagination uses 40 real records with no overlaps; search resets the page, matches % and _ literally and distinguishes no results.',
  );

  report.stage = 'loading and list error';
  await intercept('GET', 'hold');
  // Native same-document navigation preserves the boundary instrumentation.
  await page.fill('input[aria-label="搜索相册"]', '分页');
  await page.press('input[aria-label="搜索相册"]', 'Enter');
  await page.waitForFunction(() => typeof window.__albumRelease === 'function');
  await page.waitForSelector('[data-testid="albums-loading"]');
  await layouts('loading', [390, 1440]);
  await restore();
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="albums-loading"]'),
  );
  await intercept('GET', 'lost');
  await page.fill('input[aria-label="搜索相册"]', '读取失败');
  await page.press('input[aria-label="搜索相册"]', 'Enter');
  await page.waitForSelector('[data-testid="albums-error"]');
  assert.equal(
    await page.evaluate(
      () => !!document.querySelector('[data-testid="albums-empty"]'),
    ),
    false,
  );
  await layouts('list-error', [390, 1440]);
  await restore();
  await page.click(button('重试加载'));
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="albums-error"]'),
  );
  report.checks.push(
    'A held real list response displays loading; a lost read displays an actionable error rather than an empty album library, and Retry recovers.',
  );

  report.stage = 'keyboard and short viewport';
  await list();
  await resize(390, 400);
  await page.focus(button('新建相册'));
  await page.keyboard.press('Enter');
  await page.waitForSelector('[role="dialog"] input');
  await fillForm('短视口', '可滚动表单');
  await page.focus(button('创建'));
  const short = await page.evaluate(() => {
    const active = document.activeElement;
    const rect = active.getBoundingClientRect();
    return {
      focused: active.textContent.trim(),
      top: rect.top,
      bottom: rect.bottom,
      height: innerHeight,
    };
  });
  assert.equal(short.focused, '创建');
  assert.ok(
    short.top >= 0 && short.bottom <= short.height,
    'Short viewport keeps the focused form action visible',
  );
  await shot('short-phone-create');
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () => document.activeElement?.textContent.trim() === '新建相册',
  );
  await resize(1440, 400);
  await openCreate();
  await page.focus(button('创建'));
  assert.equal(
    await page.evaluate(
      () =>
        document.activeElement.getBoundingClientRect().bottom <= innerHeight,
    ),
    true,
  );
  await shot('short-desktop-create');
  await page.keyboard.press('Escape');
  await resize(1440);
  await page.cdp('Emulation.setEmulatedMedia', {
    features: [
      { name: 'prefers-color-scheme', value: 'light' },
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ],
  });
  report.checks.push(
    'Keyboard opens creation, Escape restores its trigger, and both 390×400 and 1440×400 retain visible form actions; light/dark layouts cover 360/390/430/768/1440.',
  );
  report.stage = 'anonymous detail return';
  await signOut();
  assert.equal((await page.fetch(`/api/albums/${second}`)).status, 401);
  await signInAt(`/albums/${second}`);
  await page.waitForSelector(button('编辑相册'));
  assert.equal((await page.fetch(`/api/albums/${second}`)).status, 200);
  report.checks.push(
    'After real logout, a real album detail requires sign-in and returns to the same full album ID with its edit control available.',
  );
  report.stage = 'upload suite handoff';
  // The existing upload suite starts from an anonymous owner session.
  await signOut();
  assert.equal((await page.fetch('/api/albums')).status, 401);
  await page.goto(`${config.origin}/upload`);
  await page.waitForSelector('#email');
  assert.equal(
    new URL(await page.url()).searchParams.get('returnTo'),
    '/upload',
  );
  report.checks.push(
    'A final real logout restores the anonymous session expected by the following upload suite; /upload presents its sign-in form.',
  );
  report.status = 'passed';
  delete report.stage;
} catch (error) {
  report.error = String(error.stack ?? error);
  report.authRequests = await page.evaluate(
    () => window.__albumAuthRequests ?? [],
  );
  report.failureSnapshot = await page.snapshot();
  await shot('failed');
  throw error;
} finally {
  await page.evaluate(() => window.__albumRestoreAuth?.());
  await restore();
  await writeFile(
    join(config.output, 'albums.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
