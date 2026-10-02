import assert from 'node:assert/strict';
import { join } from 'node:path';
import { signInToLibrary } from './library-login.mjs';

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
  const categoryIds = {
    标签: 'tags',
    '标签（匹配任意一个）': 'tags',
    上传日期: 'date',
    可见性: 'visibility',
    处理状态: 'status',
    存储位置: 'storages',
    相册: 'albums',
    格式: 'format',
  };
  async function add(label) {
    const id = categoryIds[label];
    if (
      await page.evaluate(
        (id) => !!document.querySelector(`[data-filter-category="${id}"]`),
        id,
      )
    )
      return;
    await page.click(button('添加条件'));
    await page.click(
      `loc=role:menuitem[name="${label === '标签（匹配任意一个）' ? '标签' : label}"]`,
    );
    await page.waitForSelector(`[data-filter-category="${id}"]`);
  }
  async function openDate() {
    await add('上传日期');
    await page.click(button('编辑上传日期'));
    await page.waitForSelector(button('应用日期'));
  }
  async function applyDate() {
    await page.click(button('应用日期'));
    await page.waitForFunction(
      () =>
        !document.querySelector('[role="group"][aria-label="上传开始日期"]'),
    );
    await ready();
  }
  async function choice(label, name) {
    await add(label);
    const before = await page.url();
    await page.click(
      `[data-filter-category="${categoryIds[label]}"] button[aria-haspopup]`,
    );
    await page.click(`loc=role:option[name="${name}"]`);
    await page.waitForFunction((before) => location.href !== before, before);
    await ready();
  }
  async function reference(label, search, optionName, multiple = false) {
    await add(label);
    const before = await page.url();
    await page.click(
      `[data-filter-category="${categoryIds[label]}"] button[aria-haspopup]`,
    );
    await page.fill('input[placeholder="输入名称搜索"]', search);
    await page.waitForSelector(`loc=role:option[name*="${optionName}"]`);
    await page.click(`loc=role:option[name*="${optionName}"]`);
    await page.waitForFunction((before) => location.href !== before, before);
    if (multiple) {
      await page.fill('input[placeholder="输入名称搜索"]', '');
      await page.keyboard.press('Escape');
    }
    await page.waitForFunction(
      () => !document.querySelector('input[placeholder="输入名称搜索"]'),
    );
    await ready();
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

    // Adding an empty condition and cancelling date edits must not query or change results.
    const beforeCancel = await page.url();
    const beforeCancelItems = await items();
    await page.evaluate(() => {
      const original = window.fetch;
      window.__filterListRequests = 0;
      window.fetch = (...args) => {
        if (new URL(String(args[0]), location.href).pathname === '/api/images')
          window.__filterListRequests += 1;
        return original(...args);
      };
    });
    await openDate();
    await date('上传开始日期', '2026-09-01');
    await page.click(button('取消日期'));
    assert.equal(await page.url(), beforeCancel);
    assert.deepEqual(await items(), beforeCancelItems);
    assert.equal(await page.evaluate(() => window.__filterListRequests), 0);
    report.checks.push(
      'Adding an empty date condition and cancelling its real editor changes neither the URL nor the current image IDs.',
    );

    await openDate();
    const startYear =
      '[role="group"][aria-label="上传开始日期"] [role="spinbutton"][data-type="year"]';
    const beforePartial = await page.url();
    await page.focus(startYear);
    await page.keyboard.type('2026');
    await page.click(button('应用日期'));
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
    await date('上传开始日期', '2026-09-01');
    await date('上传结束日期（包含当天）', '2026-09-03');
    await applyDate();
    await reference('标签（匹配任意一个）', 'Issue 173 A', 'Issue 173 A', true);
    await reference('标签（匹配任意一个）', 'Issue 173 B', 'Issue 173 B', true);
    await choice('可见性', '私有');
    await choice('处理状态', '已就绪');
    await reference('存储位置', storageName, `${storageName}（已停用）`);
    await reference('相册', albumName, albumName);
    await choice('格式', 'PNG / APNG');
    await screenshot('combined-conditions');
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
      'Real label search/multi-select, inclusive site-time-zone dates, visibility, processing state, disabled storage, album and original format apply immediately one category at a time; the URL contains real IDs/UTC midnight boundaries and only issue173-000 is returned.',
      'Entering only a start year blocks Apply with a visible incomplete-date error, keeps the URL/dialog and focuses the missing month; completing the date then submits the real combined query.',
    );

    // Reopening and applying without editing dates must preserve their exact UTC instants.
    await openDate();
    await applyDate();
    const reapplied = new URL(await page.url()).searchParams;
    assert.equal(reapplied.get('uploadedFrom'), applied.get('uploadedFrom'));
    assert.equal(
      reapplied.get('uploadedBefore'),
      applied.get('uploadedBefore'),
    );
    const combinedUrl = await page.url();
    const preciseUrl = new URL(combinedUrl);
    const preciseFrom = '2026-09-02T04:00:00.000Z';
    const preciseBefore = '2026-09-02T05:00:00.000Z';
    preciseUrl.searchParams.set('uploadedFrom', preciseFrom);
    preciseUrl.searchParams.set('uploadedBefore', preciseBefore);
    await page.goto(preciseUrl.href);
    await ready();
    await openDate();
    const boundaryText = await page.evaluate(
      () =>
        document.querySelector('[data-testid="filter-date-boundaries"]')
          .textContent,
    );
    const localTime = new Intl.DateTimeFormat('zh-CN', {
      timeZone: site.time_zone,
      dateStyle: 'short',
      timeStyle: 'long',
    });
    assert.ok(boundaryText.includes(site.time_zone));
    assert.ok(boundaryText.includes(localTime.format(new Date(preciseFrom))));
    assert.ok(boundaryText.includes(localTime.format(new Date(preciseBefore))));
    assert.ok(boundaryText.includes('（含）至'));
    assert.ok(boundaryText.includes('（不含）'));
    if (site.time_zone === 'Asia/Shanghai') {
      assert.ok(boundaryText.includes('12:00:00'));
      assert.ok(boundaryText.includes('13:00:00'));
    }
    await screenshot('precise-date-boundaries');
    await applyDate();
    assert.equal(
      new URL(await page.url()).searchParams.get('uploadedFrom'),
      preciseFrom,
    );
    assert.equal(
      new URL(await page.url()).searchParams.get('uploadedBefore'),
      preciseBefore,
    );
    report.checks.push(
      'A non-midnight URL interval shows both actual local boundary times and the site time zone in the date editor; applying unchanged dates preserves the original precise instants.',
    );
    for (const height of [844, 480]) {
      await page.cdp('Emulation.setDeviceMetricsOverride', {
        width: 390,
        height,
        deviceScaleFactor: 1,
        mobile: true,
      });
      await page.waitForFunction(
        (height) => innerWidth === 390 && innerHeight === height,
        height,
      );
      await openDate();
      await page.waitForFunction(() => {
        const popover = document.querySelector(
          '[data-testid="filter-date-popover"]',
        );
        return (
          popover &&
          popover
            .getAnimations({ subtree: true })
            .every(
              (animation) =>
                !animation.pending && animation.playState !== 'running',
            )
        );
      });
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      const mobileDate = await page.evaluate(() => {
        const popover = document.querySelector(
          '[data-testid="filter-date-popover"]',
        );
        const boundaries = document.querySelector(
          '[data-testid="filter-date-boundaries"]',
        );
        const dialog = boundaries.closest('[role="dialog"]');
        const rectangle = (node) => {
          const { left, top, right, bottom, width, height } =
            node.getBoundingClientRect();
          return { left, top, right, bottom, width, height };
        };
        return {
          text: boundaries.textContent,
          popover: rectangle(popover),
          main: rectangle(document.querySelector('main')),
          dialog: rectangle(dialog),
          boundaries: rectangle(boundaries),
          scrollHeight: dialog.scrollHeight,
          clientHeight: dialog.clientHeight,
        };
      });
      report.datePopover ??= [];
      const geometry = {
        viewport: { width: 390, height },
        ...mobileDate,
        controls: [],
      };
      report.datePopover.push(geometry);
      await screenshot(`precise-date-390x${height}`);
      assert.ok(mobileDate.text.includes(site.time_zone));
      assert.ok(
        mobileDate.text.includes(localTime.format(new Date(preciseFrom))),
      );
      assert.ok(
        mobileDate.text.includes(localTime.format(new Date(preciseBefore))),
      );
      assert.ok(
        mobileDate.popover.left >= 0 &&
          mobileDate.popover.right <= 390 &&
          mobileDate.popover.top >= Math.max(0, mobileDate.main.top) &&
          mobileDate.popover.bottom <= Math.min(height, mobileDate.main.bottom),
        `Date popover stays within main and above the footer at 390×${height}`,
      );
      const controls = [
        ...['上传开始日期', '上传结束日期（包含当天）'].flatMap((label) =>
          ['year', 'month', 'day'].map((segment) => ({
            name: `${label}:${segment}`,
            selector: `[role="group"][aria-label="${label}"] [role="spinbutton"][data-type="${segment}"]`,
            action: false,
          })),
        ),
        { name: '取消日期', selector: button('取消日期'), action: true },
        { name: '应用日期', selector: button('应用日期'), action: true },
      ];
      for (const control of controls) {
        // Actual browser focus scrolls each segment/action into the dialog's scroll area.
        await page.focus(control.selector);
        await page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        );
        const focused = await page.evaluate(() => {
          const target = document.activeElement;
          const dialog = target.closest('[role="dialog"]');
          const rect = target.getBoundingClientRect();
          const clip = dialog.getBoundingClientRect();
          return {
            top: rect.top,
            bottom: rect.bottom,
            left: rect.left,
            right: rect.right,
            height: rect.height,
            clipTop: clip.top,
            clipBottom: clip.bottom,
            visible: target.contains(
              document.elementFromPoint(
                rect.left + rect.width / 2,
                rect.top + rect.height / 2,
              ),
            ),
          };
        });
        geometry.controls.push({ name: control.name, ...focused });
        assert.ok(
          focused.top >= focused.clipTop &&
            focused.bottom <= focused.clipBottom &&
            focused.left >= 0 &&
            focused.right <= 390,
          `${control.name} is fully visible after actual focus at 390×${height}`,
        );
        assert.equal(
          focused.visible,
          true,
          `${control.name} is unobstructed after focus`,
        );
        if (control.action)
          assert.ok(
            focused.height >= 44,
            `${control.name} retains a 44px target`,
          );
      }
      await screenshot(`precise-date-actions-390x${height}`);
      await page.focus(
        '[role="group"][aria-label="上传开始日期"] [role="spinbutton"][data-type="year"]',
      );
      await page.keyboard.press('Escape');
      await page.waitForFunction(
        () => !document.querySelector('[data-testid="filter-date-boundaries"]'),
      );
      await page.waitForFunction(
        () =>
          document.activeElement?.getAttribute('aria-label') === '编辑上传日期',
      );
      assert.equal(
        new URL(await page.url()).searchParams.get('uploadedFrom'),
        preciseFrom,
      );
      assert.equal(
        new URL(await page.url()).searchParams.get('uploadedBefore'),
        preciseBefore,
      );
      report.checks.push(
        `At 390×${height}, the actual date popover stays within main above the footer; precise local boundaries remain present and every date segment plus both 44px actions is reachable through actual focus and internal scrolling; Escape returns focus to the trigger without changing the applied interval.`,
      );
    }
    await page.cdp('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 1080,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await page.waitForFunction(
      () => innerWidth === 1440 && innerHeight === 1080,
    );
    await page.goto(combinedUrl);
    await ready();
    await openDate();
    const beforeDeletedSegment = await page.url();
    const startDay =
      '[role="group"][aria-label="上传开始日期"] [role="spinbutton"][data-type="day"]';
    await page.focus(startDay);
    await page.keyboard.press('Backspace');
    await page.click(button('应用日期'));
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
    await applyDate();
    assert.equal(
      new URL(await page.url()).searchParams.get('uploadedFrom'),
      applied.get('uploadedFrom'),
    );
    report.checks.push(
      'Deleting the day segment from an already applied date also blocks Apply and keeps the original URL; refilling the day makes the same date submittable again.',
    );
    await page.click(button('移除格式条件'));
    await page.waitForFunction(
      () => !new URL(location.href).searchParams.has('format'),
    );
    assert.equal(
      new URL(await page.url()).searchParams.get('storageId'),
      storageId,
    );
    await page.click(button('清除筛选条件'));
    await page.waitForFunction(
      () => !new URL(location.href).searchParams.has('storageId'),
    );
    await ready();
    const cleared = new URL(await page.url()).searchParams;
    for (const key of [
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
    assert.equal(cleared.get('q'), 'issue173-');
    report.checks.push(
      'Applying unchanged dates retains exact UTC instants; individual removal preserves other conditions; clearing all categories preserves the independent search query.',
    );

    await visit('q=issue173-&tagId=issue173-filter-missing&pageSize=40');
    await page.waitForSelector('[data-testid="library-error"]');
    await page.waitForFunction(() =>
      document
        .querySelector('[data-testid="library-filters-bar"]')
        ?.textContent.includes('已失效：issue173-filter-missing'),
    );
    await screenshot('missing-reference');
    await page.click('[data-filter-category="tags"] button[aria-haspopup]');
    await page.focus('input[placeholder="输入名称搜索"]');
    await page.keyboard.press('Escape');
    assert.equal(
      new URL(await page.url()).searchParams.get('tagId'),
      'issue173-filter-missing',
    );
    assert.deepEqual(await items(), []);
    report.checks.push(
      'A deleted selected tag stays visible as an invalid ID in the conditions bar; dismissing its options preserves the URL and never broadens the failed query.',
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
    await add('标签');
    await page.click('[data-filter-category="tags"] button[aria-haspopup]');
    await page.waitForSelector(button('重新读取选项'));
    await page.waitForFunction(() =>
      [...document.querySelectorAll('[role="alert"]')].some((alert) =>
        alert.textContent.includes(
          'Controlled filter-options transport failure',
        ),
      ),
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
    await page.waitForSelector('[data-testid="library-filters-bar"]');
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
    await page.waitForSelector('[data-testid="library-filters-bar"]');
    await page.waitForSelector(button('添加条件'));
    assert.equal(
      await page.evaluate(
        () => !!document.querySelector('button[aria-label="图片排序"]'),
      ),
      false,
    );
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
      'Album scope cannot be changed in the filter bar',
    );
    assert.equal(
      await page.evaluate(
        () => !!document.querySelector('button[aria-label="移除相册条件"]'),
      ),
      false,
    );
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
      await page.click(button('添加条件'));
      await page.click('loc=role:menuitem[name="标签"]');
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
    await signInToLibrary(page, config, report);
    await ready();
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
