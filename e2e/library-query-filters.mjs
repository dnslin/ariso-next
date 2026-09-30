import assert from 'node:assert/strict';
import { join } from 'node:path';

const button = (name) => `loc=role:button[name="${name}"]`;
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;

/** Actual filter controls against the disposable production database used by library-query. */
export async function verifyLibraryFilters({ page, config, sql, report }) {
  const storageId = 'issue173-filter-storage';
  const albumId = 'issue173-filter-album';
  const albumName = 'Issue 173 filter album';
  const storageName = 'Issue 173 filter storage';
  const [original] = await sql(
    "SELECT storage_id,created_at,trashed_at,format FROM media_images WHERE id='issue173-000'",
  );
  assert.ok(original, 'The parent query suite must seed issue173-000 first');
  const [site] = await sql('SELECT time_zone FROM site_settings WHERE id=1');
  const fixtureTime = Date.UTC(2026, 8, 2, 12);
  let seeded = false;

  async function ready() {
    await page.waitForFunction(
      () =>
        !!document.querySelector('[data-testid="library-list"]') &&
        !document.querySelector('[data-testid="library-loading"]'),
    );
  }
  async function visit(query = 'q=issue173-&pageSize=40') {
    await page.goto(`${config.origin}/library?${query}`);
    await ready();
  }
  async function open() {
    await page.click(button('筛选'));
    await page.waitForSelector(button('关闭筛选'));
  }
  async function close() {
    await page.click(button('关闭筛选'));
    await page.waitForFunction(
      () => !document.querySelector('button[aria-label="关闭筛选"]'),
    );
  }
  async function choice(label, name) {
    await page.click(`loc=role:button[name*="${label}"]`);
    await page.click(`loc=role:option[name="${name}"]`);
  }
  async function reference(label, search, optionName, multiple = false) {
    await page.click(`loc=role:button[name*="${label}"]`);
    await page.fill('input[placeholder="输入名称搜索"]', search);
    await page.waitForSelector(`loc=role:option[name*="${optionName}"]`);
    await page.click(`loc=role:option[name*="${optionName}"]`);
    if (multiple) {
      // SearchField consumes Escape to clear nonempty text before closing its popover.
      await page.fill('input[placeholder="输入名称搜索"]', '');
      await page.keyboard.press('Escape');
    }
    await page.waitForFunction(
      () => !document.querySelector('input[placeholder="输入名称搜索"]'),
    );
  }
  async function date(label, value) {
    const values = value.split('-');
    for (const [index, type] of ['year', 'month', 'day'].entries()) {
      const segment = `[role="group"][aria-label="${label}"] [role="spinbutton"][data-type="${type}"]`;
      await page.focus(segment);
      await page.keyboard.type(values[index]);
    }
    await page.keyboard.press('Tab');
  }
  async function screenshot(name) {
    const filename = `library-query-filters-${name}.png`;
    await page.screenshot({ path: join(config.output, filename) });
    report.screenshots.push(filename);
  }
  async function items() {
    return page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="library-card"]')].map(
        (card) => card.dataset.imageId,
      ),
    );
  }
  function assertBoundary(instant, expectedDay) {
    assert.match(instant, /Z$/);
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: site.time_zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      })
        .formatToParts(new Date(instant))
        .map((part) => [part.type, part.value]),
    );
    assert.deepEqual(
      [
        parts.year,
        parts.month,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second,
      ],
      ['2026', '09', expectedDay, '00', '00', '00'],
    );
  }
  async function signIn() {
    await page.waitForSelector('#email');
    await page.fill('#email', config.credentials.email);
    await page.fill('#password', config.credentials.password);
    await page.click(button('登录'));
    await page.waitForFunction(
      () =>
        location.pathname === '/library' ||
        document
          .querySelector('[role="alert"]')
          ?.textContent.includes('HTTP 429'),
    );
    if (new URL(await page.url()).pathname === '/login') {
      await page.waitForFunction(
        () => !document.querySelector('button[type="submit"]').disabled,
        undefined,
        { timeout: 15000 },
      );
      await page.click(button('登录'));
    }
    await ready();
  }

  try {
    await sql(
      `INSERT INTO storage_configs (id,name,type,enabled,local_path,created_at,updated_at) VALUES (${quote(storageId)},${quote(storageName)},'local',0,'issue173-filter',${fixtureTime},${fixtureTime})`,
    );
    seeded = true;
    await sql(
      `INSERT INTO albums (id,name,description,created_at,updated_at) VALUES (${quote(albumId)},${quote(albumName)},'',${fixtureTime},${fixtureTime})`,
    );
    await sql(
      `INSERT INTO album_images (album_id,image_id,joined_at) VALUES (${quote(albumId)},'issue173-000',${fixtureTime}),(${quote(albumId)},'issue173-001',${fixtureTime})`,
    );
    await sql(
      `UPDATE media_images SET storage_id=${quote(storageId)},created_at=${fixtureTime},format='PNG' WHERE id='issue173-000'`,
    );
    await visit();

    // Editing and dismissing the actual form must leave both URL and visible data untouched.
    const beforeCancel = await page.url();
    const beforeCancelItems = await items();
    await open();
    await choice('可见性', '公开');
    await close();
    assert.equal(await page.url(), beforeCancel);
    assert.deepEqual(await items(), beforeCancelItems);
    report.checks.push(
      'Cancelling the real filter dialog discards the visibility draft without changing URL or loaded image IDs.',
    );

    // All categories are edited through their real HeroUI controls, never by setting a URL.
    await open();
    const startYear =
      '[role="group"][aria-label="上传开始日期"] [role="spinbutton"][data-type="year"]';
    const beforePartial = await page.url();
    await page.focus(startYear);
    await page.keyboard.type('2026');
    await page.click(button('应用筛选'));
    await page.waitForFunction(() =>
      document
        .querySelector('[role="dialog"] [role="alert"]')
        ?.textContent.includes('日期未填写完整'),
    );
    assert.equal(await page.url(), beforePartial);
    assert.equal(
      await page.evaluate(() =>
        document.activeElement?.getAttribute('data-type'),
      ),
      'month',
    );
    await screenshot('partial-date');
    await reference('标签（匹配任意一个）', 'Issue 173 A', 'Issue 173 A', true);
    await reference('标签（匹配任意一个）', 'Issue 173 B', 'Issue 173 B', true);
    await date('上传开始日期', '2026-09-01');
    await date('上传结束日期（包含当天）', '2026-09-03');
    await choice('可见性', '私有');
    await choice('处理状态', '已就绪');
    await reference('存储位置', storageName, `${storageName}（已停用）`);
    await reference('相册', albumName, albumName);
    await choice('格式', 'PNG / APNG');
    await screenshot('combined-draft');
    await page.click(button('应用筛选'));
    await page.waitForFunction(
      (id) => new URL(location.href).searchParams.get('storageId') === id,
      storageId,
    );
    await ready();
    await page.waitForFunction(
      () =>
        document.querySelectorAll('[data-testid="library-card"]').length === 1,
    );
    const applied = new URL(await page.url()).searchParams;
    assert.deepEqual(applied.getAll('tagId').sort(), [
      'issue173-a',
      'issue173-b',
    ]);
    assert.equal(applied.get('albumId'), albumId);
    assert.equal(applied.get('storageId'), storageId);
    assert.equal(applied.get('visibility'), 'private');
    assert.equal(applied.get('status'), 'ready');
    assert.equal(applied.get('format'), 'png');
    assertBoundary(applied.get('uploadedFrom'), '01');
    assertBoundary(applied.get('uploadedBefore'), '04');
    assert.deepEqual(await items(), ['issue173-000']);
    await screenshot('combined-result');
    report.checks.push(
      'Real label search/multi-select, inclusive site-time-zone dates, visibility, processing state, disabled storage, album and original format apply together; the URL contains real IDs/UTC midnight boundaries and only issue173-000 is returned.',
      'Entering only a start year blocks Apply with a visible incomplete-date error, keeps the URL/dialog and focuses the missing month; completing the date then submits the real combined query.',
    );

    // Reopening and applying without editing dates must preserve their exact UTC instants.
    await open();
    await page.click(button('应用筛选'));
    await ready();
    const reapplied = new URL(await page.url()).searchParams;
    assert.equal(reapplied.get('uploadedFrom'), applied.get('uploadedFrom'));
    assert.equal(
      reapplied.get('uploadedBefore'),
      applied.get('uploadedBefore'),
    );
    await open();
    const beforeDeletedSegment = await page.url();
    const startDay =
      '[role="group"][aria-label="上传开始日期"] [role="spinbutton"][data-type="day"]';
    await page.focus(startDay);
    await page.keyboard.press('Backspace');
    await page.click(button('应用筛选'));
    await page.waitForFunction(() =>
      document
        .querySelector('[role="dialog"] [role="alert"]')
        ?.textContent.includes('日期未填写完整'),
    );
    assert.equal(await page.url(), beforeDeletedSegment);
    assert.equal(
      await page.evaluate(() =>
        document.activeElement?.getAttribute('data-type'),
      ),
      'day',
    );
    await date('上传开始日期', '2026-09-01');
    await page.click(button('应用筛选'));
    await page.waitForFunction(
      () => !document.querySelector('button[aria-label="关闭筛选"]'),
    );
    await ready();
    assert.equal(
      new URL(await page.url()).searchParams.get('uploadedFrom'),
      applied.get('uploadedFrom'),
    );
    report.checks.push(
      'Deleting the day segment from an already applied date also blocks Apply and keeps the original URL; refilling the day makes the same date submittable again.',
    );
    await page.click(button('清除筛选'));
    await page.waitForFunction(
      () => !new URL(location.href).searchParams.has('storageId'),
    );
    await ready();
    const cleared = new URL(await page.url()).searchParams;
    for (const key of [
      'q',
      'tagId',
      'albumId',
      'storageId',
      'visibility',
      'status',
      'format',
      'uploadedFrom',
      'uploadedBefore',
    ])
      assert.equal(cleared.has(key), false, `${key} must be cleared`);
    report.checks.push(
      'Applying unchanged dates retains exact UTC instants; the real clear-filters action removes every applied category and restores an unfiltered query.',
    );

    await visit('q=issue173-&tagId=issue173-filter-missing&pageSize=40');
    await page.waitForSelector('[data-testid="library-error"]');
    await open();
    await page.waitForFunction(() =>
      document
        .querySelector('[role="dialog"]')
        ?.textContent.includes('已失效：issue173-filter-missing'),
    );
    await screenshot('missing-reference');
    await close();
    assert.equal(
      new URL(await page.url()).searchParams.get('tagId'),
      'issue173-filter-missing',
    );
    assert.deepEqual(await items(), []);
    report.checks.push(
      'A deleted selected tag stays visible as an invalid ID in the real dialog; dismissing it preserves the URL and never broadens the failed query.',
    );

    await visit();
    await page.evaluate(() => {
      const original = window.fetch;
      window.__filterOptionsFault = true;
      window.__filterOptionsAttempts = 0;
      window.fetch = (...args) => {
        const url = new URL(String(args[0]), location.href);
        if (
          url.pathname === '/api/images/filter-options' &&
          url.searchParams.get('kind') === 'tags'
        ) {
          window.__filterOptionsAttempts += 1;
          if (window.__filterOptionsFault) {
            window.__filterOptionsFault = false;
            return Promise.reject(
              new TypeError('Controlled filter-options transport failure'),
            );
          }
        }
        return original(...args);
      };
    });
    await open();
    await page.click('loc=role:button[name*="标签（匹配任意一个）"]');
    await page.waitForSelector(button('重新读取选项'));
    await page.waitForFunction(() =>
      document
        .querySelector('[role="alert"]')
        ?.textContent.includes('Controlled filter-options transport failure'),
    );
    await screenshot('options-failure');
    await page.click(button('重新读取选项'));
    await page.waitForSelector('loc=role:option[name="Issue 173 A"]');
    assert.ok(await page.evaluate(() => window.__filterOptionsAttempts >= 2));
    assert.equal(
      await page.evaluate(
        () =>
          document.activeElement ===
          document.querySelector('input[placeholder="输入名称搜索"]'),
      ),
      true,
      'Retry returns focus to the option search field before its button is removed',
    );
    await page.keyboard.press('Escape');
    await page.waitForFunction(
      () => !document.querySelector('input[placeholder="输入名称搜索"]'),
    );
    await page.waitForSelector(button('关闭筛选'));
    await close();
    report.checks.push(
      'A controlled filter-options transport failure produces the real error/retry UI; retry reads the actual server and restores selectable labels without refreshing the page.',
    );

    await page.goto(`${config.origin}/albums/${albumId}?page=1&pageSize=20`);
    await page.waitForFunction(
      () =>
        Number(
          document.querySelector('[data-testid="library-list"]')?.dataset
            .loadedCount,
        ) === 2,
    );
    assert.deepEqual(
      await items(),
      ['issue173-000', 'issue173-001'],
      'Album follows joined-time order with the ID tie-breaker, independently of upload time',
    );
    assert.equal(
      await page.evaluate(() =>
        [...document.querySelectorAll('[data-testid="library-card"]')].every(
          (card) =>
            card.lastElementChild.children[1].getBoundingClientRect().bottom <=
            card.getBoundingClientRect().bottom,
        ),
      ),
      true,
      'Album status text is fully inside the card bounds',
    );
    await page.click(button('搜索与筛选'));
    assert.equal(
      await page.evaluate(
        () => !!document.querySelector('button[aria-label="图片排序"]'),
      ),
      false,
    );
    await open();
    assert.equal(
      await page.evaluate(() =>
        [...document.querySelectorAll('button')].some(
          (node) =>
            node
              .getAttribute('aria-labelledby')
              ?.split(' ')
              .some(
                (id) => document.getElementById(id)?.textContent === '相册',
              ) && node.disabled,
        ),
      ),
      true,
      'Album scope cannot be changed in the filter dialog',
    );
    await close();
    await page.click('[data-image-id="issue173-000"] button');
    await page.waitForSelector('[data-testid="detail-body"]');
    await page.click(button('删除图片'));
    await page.click(button('确认删除图片'));
    await page.waitForFunction(
      () =>
        Number(
          document.querySelector('[data-testid="library-list"]')?.dataset
            .loadedCount,
        ) === 1 &&
        document
          .getElementById('library-title')
          ?.nextElementSibling?.textContent.startsWith('1 张图片'),
    );
    report.checks.push(
      'Deleting through album details refreshes both the content total and the album header count.',
    );
    await page.goto(`${config.origin}/albums/${albumId}?image=issue173-002`);
    await page.waitForFunction(() =>
      document
        .querySelector('[data-testid="library-detail"]')
        ?.textContent.includes('不在当前相册'),
    );
    assert.equal(
      await page.evaluate(
        () => !!document.querySelector('[data-testid="detail-body"]'),
      ),
      false,
    );
    await page.goto(`${config.origin}/albums/${albumId}?albumId=wrong-album`);
    await page.waitForSelector('[data-testid="library-error"]');
    assert.deepEqual(await items(), []);
    report.checks.push(
      'The real album route preserves fixed joined order, disables changing album scope, rejects a conflicting album query, and prevents an unrelated image deep link from opening content.',
    );
    await visit();

    // Expire only this suite's disposable real sessions, then let the next filter read return 401.
    const returnToUrl = new URL(await page.url());
    const returnTo = `${returnToUrl.pathname}${returnToUrl.search}`;
    await sql(`UPDATE session SET expires_at=${Date.now() - 1}`);
    try {
      await page.click(button('筛选'));
    } catch (error) {
      if (!String(error).includes('Cannot find context with specified id'))
        throw error;
    }
    await page.waitForSelector('#email');
    const expired = new URL(await page.url());
    assert.equal(expired.pathname, '/login');
    assert.equal(expired.searchParams.get('reason'), 'expired');
    assert.equal(expired.searchParams.get('returnTo'), returnTo);
    assert.deepEqual(await items(), []);
    await screenshot('session-expired');
    await signIn();
    assert.equal(
      `${new URL(await page.url()).pathname}${new URL(await page.url()).search}`,
      returnTo,
    );
    report.checks.push(
      'An actual expired SQLite owner session makes filter-options return 401, removes management content and redirects to expired login with the exact query returnTo; a real sign-in restores that query before the parent suite continues.',
    );
  } finally {
    if (seeded) {
      await sql(
        `UPDATE media_images SET storage_id=${quote(original.storage_id)},created_at=${original.created_at},trashed_at=${original.trashed_at ?? 'NULL'},format=${quote(original.format)} WHERE id='issue173-000'`,
      );
      await sql(`DELETE FROM albums WHERE id=${quote(albumId)}`);
      await sql(`DELETE FROM storage_configs WHERE id=${quote(storageId)}`);
    }
  }
}
