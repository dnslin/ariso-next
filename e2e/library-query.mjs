/* global taskSpace, config */
const assert = (await import('node:assert/strict')).default;
const { writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { identitySql } = await import(config.identitySessionScript);
const { verifyLibraryFilters } = await import(
  new URL('./library-query-filters.mjs', config.libraryDetailScript).href
);
const { verifyLibrarySelection } = await import(
  new URL('./library-selection.mjs', config.libraryDetailScript).href
);
const { verifyLibrarySelectionReconciliation } = await import(
  new URL('./library-selection-reconciliation.mjs', config.libraryDetailScript)
    .href
);
const { verifyLibraryScale } = await import(
  new URL('./library-query-scale.mjs', config.libraryDetailScript).href
);
const { verifyLibraryFeedback } = await import(
  new URL('./library-feedback.mjs', config.libraryDetailScript).href
);
const { signInToLibrary } = await import(
  new URL('./library-login.mjs', config.libraryDetailScript).href
);
const page = (await taskSpace(config.spaceId)).page('p1');
const phase = config.libraryQueryPhase ?? 'query';
const report = {
  phase,
  status: 'failed',
  checks: [],
  combinations: [],
  screenshots: [],
};
const sql = (statement) => identitySql(config, statement);
const button = (name) =>
  `loc=role:${['网格', '瀑布流'].includes(name) ? 'radio' : 'button'}[name="${name}"]`;
const preferenceKey = 'ariso:library-preferences:v1';
let blockedStorageScript;
let savedPreference;
const loaded = (count) =>
  page.waitForFunction(
    (count) =>
      Number(
        document.querySelector('[data-testid="library-list"]')?.dataset
          .loadedCount,
      ) === count && !document.querySelector('[data-testid="library-loading"]'),
    count,
  );
async function state() {
  return page.evaluate(() => ({
    ...document.querySelector('[data-testid="library-list"]').dataset,
    count: document.querySelector('[data-testid="library-count"]').textContent,
    url: location.href,
    history: history.length,
    pushes: window.__queryPushes ?? 0,
    requests: window.__queryRequests?.length ?? 0,
  }));
}
async function select(label, option) {
  await page.click(`loc=role:button[name*="${label}"]`);
  await page.click(`loc=role:option[name="${option}"]`);
  if (label === '图片加载方式')
    await page.waitForFunction(
      (mode) =>
        document.querySelector('[data-testid="library-list"]')?.dataset
          .loadingMode === mode &&
        new URL(location.href).searchParams.has('page') === (mode === 'pages'),
      option === '分页' ? 'pages' : 'more',
    );
}
async function verifyModeHistory() {
  report.activeCheck = 'saved-pagination-preference';
  await select('图片加载方式', '分页');
  await loaded(40);
  await page.waitForFunction(
    (key) => JSON.parse(localStorage.getItem(key)).loadingMode === 'pages',
    preferenceKey,
  );
  // A fresh entry adopts the preference once, without adding a history entry.
  await page.goto(`${config.origin}/library?q=issue173-&pageSize=40`);
  await page.waitForFunction(
    () => new URL(location.href).searchParams.get('page') === '1',
  );
  await loaded(40);
  assert.equal((await state()).loadingMode, 'pages');
  report.activeCheck = 'sidebar-pagination-initialization';
  await page.click('a[aria-label="上传"]');
  await page.waitForFunction(() => location.pathname === '/upload');
  await page.click('a[aria-label="图库"]');
  await page.waitForFunction(
    () =>
      location.pathname === '/library' &&
      new URL(location.href).searchParams.get('page') === '1',
  );
  await loaded(40);
  assert.equal((await state()).loadingMode, 'pages');
  report.checks.push(
    'Sidebar upload→library starts the saved paginated query without a reload.',
  );
  await page.goto(`${config.origin}/library?q=issue173-&pageSize=40`);
  await loaded(40);
  await select('图片加载方式', '加载更多');
  await loaded(40);
  await page.click('[data-testid="library-load-more"]');
  await loaded(80);
  report.activeCheck = 'mode-history-set-scroll';
  await page.evaluate(() =>
    document.querySelector('.shell-content').scrollTo(0, 500),
  );
  await page.waitForFunction(
    () => document.querySelector('.shell-content').scrollTop >= 490,
  );
  await monitor();
  await select('图片加载方式', '分页');
  await loaded(40);
  // The browser's wheel motion can outlive the click that brought Load More
  // into view. Check the actual position when this history entry was left.
  const { url, scroll: offset } = await page.evaluate(
    () => window.__queryDeparture,
  );
  assert.equal(new URL(url).searchParams.has('page'), false);
  assert.equal((await state()).pushes, 1);
  report.modeHistory = { departureURL: url, offset };
  const requests = (await state()).requests;
  await page.evaluate(() => history.back());
  report.activeCheck = 'mode-history-back';
  await loaded(80);
  assert.equal((await state()).loadingMode, 'more');
  report.activeCheck = 'mode-history-restore-scroll';
  await page.waitForFunction(
    (offset) =>
      Math.abs(document.querySelector('.shell-content').scrollTop - offset) < 2,
    offset,
  );
  assert.equal((await state()).requests, requests);
  await page.evaluate(() => history.forward());
  report.activeCheck = 'mode-history-forward';
  await loaded(40);
  assert.equal((await state()).loadingMode, 'pages');
  assert.equal((await state()).requests, requests);
  report.checks.push(
    'Saved pagination preference initializes a fresh entry as page=1; more→pages→Back restores 80 cached items and scroll, and Forward restores pagination without new list requests.',
  );
}
async function search(q, count) {
  await page.fill('input[aria-label="搜索图片名称"]', q);
  await page.press('input[aria-label="搜索图片名称"]', 'Enter');
  await page.waitForFunction(
    (q) => new URL(location.href).searchParams.get('q') === q,
    q,
  );
  await loaded(count);
}
async function monitor() {
  await page.evaluate(() => {
    const original = window.fetch;
    window.__queryRequests = [];
    window.__queryPushes = 0;
    window.__queryDeparture = null;
    const push = history.pushState;
    history.pushState = function (...args) {
      window.__queryDeparture = {
        url: location.href,
        scroll: document.querySelector('.shell-content').scrollTop,
      };
      window.__queryPushes++;
      return push.apply(this, args);
    };
    window.__queryFault = null;
    window.__queryRelease = null;
    window.fetch = async (input, init) => {
      const url = new URL(String(input), location.href);
      if (url.pathname !== '/api/images') return original(input, init);
      window.__queryRequests.push(url.href);
      if (window.__queryFault === 'cursor' && url.searchParams.has('cursor')) {
        window.__queryFault = null;
        url.searchParams.set('cursor', 'invalid');
        return original(url.href, init);
      }
      const response = await original(input, init);
      if (window.__queryFault === 'hold') {
        window.__queryFault = null;
        await new Promise((resolve) => {
          window.__queryRelease = resolve;
        });
      }
      return response;
    };
  });
}
async function settle() {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}
async function visit(query = 'q=issue173-&pageSize=40') {
  await page.goto(`${config.origin}/library?${query}`);
  await page.waitForSelector('[data-testid="library-list"]');
}
async function resize(width, height = width >= 1200 ? 1080 : 844) {
  await page.cdp('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
  await page.waitForFunction((width) => innerWidth === width, width);
}
async function shot(name) {
  const file = `library-query-${name}.png`;
  await page.screenshot({ path: join(config.output, file) });
  report.screenshots.push(file);
}
try {
  // library.mjs deliberately expires its real session; sign in again if needed.
  await page.goto(`${config.origin}/library?q=issue173-&pageSize=40`);
  await page.waitForFunction(
    () =>
      location.pathname === '/login' ||
      !!document.querySelector('[data-testid="library-list"]'),
  );
  if (new URL(await page.url()).pathname === '/login') {
    await signInToLibrary(page, config, report);
  }
  savedPreference = await page.evaluate(
    (key) => localStorage.getItem(key),
    preferenceKey,
  );
  const [storage] = await sql(
    'SELECT id FROM storage_configs WHERE enabled = 1 LIMIT 1',
  );
  const created = 1800000000000;
  const values = Array.from({ length: 93 }, (_, index) => {
    const id = `issue173-${String(index).padStart(3, '0')}`;
    const name = `issue173-${index % 2 ? 'beta' : 'alpha'}-${index}.png`;
    return `('${id}','${storage.id}','${name}','${name}','private','png','image/png',${640 + index},480,${1000 + index},'static','ready',${created - index * 1000},${created})`;
  });
  await sql(
    `INSERT INTO media_images (id,storage_id,original_name,display_name,visibility,format,mime,width,height,byte_size,classification,processing_status,created_at,updated_at) VALUES ${values.join(',')}`,
  );
  await sql(
    `INSERT INTO tags (id,display_name,normalized_key,created_at,updated_at) VALUES ('issue173-a','Issue 173 A','issue173-a',${created},${created}),('issue173-b','Issue 173 B','issue173-b',${created},${created})`,
  );
  await sql(
    "INSERT INTO image_tags (image_id,tag_id) VALUES ('issue173-000','issue173-a'),('issue173-000','issue173-b'),('issue173-001','issue173-b')",
  );
  await page.evaluate(
    (key) =>
      localStorage.setItem(
        key,
        JSON.stringify({ layout: 'grid', loadingMode: 'more' }),
      ),
    preferenceKey,
  );
  await visit();
  await loaded(40);
  await resize(1440);
  if (phase === 'history') {
    await verifyModeHistory();
  } else if (phase === 'feedback') {
    await verifyLibraryFeedback({ page, config, sql, report });
  } else if (phase === 'selection') {
    await verifyLibrarySelection({ page, config, report });
  } else if (phase === 'selection-reconciliation') {
    await verifyLibrarySelectionReconciliation({ page, config, sql, report });
  } else if (phase === 'filters') {
    await verifyLibraryFilters({ page, config, sql, report });
  } else if (phase === 'scale') {
    await verifyLibraryScale({ page, config, sql, report });
  } else {
    await verifyModeHistory();

    // Every combination uses the real endpoint and the dedicated 93-row query.
    for (const mode of ['more', 'pages']) {
      await select('图片加载方式', mode === 'more' ? '加载更多' : '分页');
      await page.waitForFunction(
        (mode) =>
          document.querySelector('[data-testid="library-list"]').dataset
            .loadingMode === mode,
        mode,
      );
      await loaded(
        Number(new URL(await page.url()).searchParams.get('pageSize')),
      );
      for (const layout of ['grid', 'masonry']) {
        const before = (await state()).requests;
        await page.click(button(layout === 'grid' ? '网格' : '瀑布流'));
        await page.waitForFunction(
          (layout) =>
            document.querySelector('[data-testid="library-list"]').dataset
              .layout === layout,
          layout,
        );
        await settle();
        assert.equal(
          (await state()).requests,
          before,
          'Layout change must not request images',
        );
        for (const size of [20, 40, 80]) {
          await select('每批图片数', `${size} 张 / 批`);
          await loaded(size);
          assert.equal(
            new URL(await page.url()).searchParams.get('pageSize'),
            String(size),
          );
          assert.match((await state()).count, new RegExp(`93.*${size}`));
          if (mode === 'more') {
            await page.click('[data-testid="library-load-more"]');
            await loaded(Math.min(size * 2, 93));
            await page.click(button('刷新图库'));
            await loaded(size);
          } else {
            await page.click(button('下一页'));
            await page.waitForFunction(
              () => new URL(location.href).searchParams.get('page') === '2',
            );
            await loaded(Math.min(size, 93 - size));
            await page.click(button('上一页'));
            await page.waitForFunction(
              () => new URL(location.href).searchParams.get('page') === '1',
            );
            await loaded(size);
          }
          report.combinations.push({
            layout,
            mode,
            pageSize: size,
            status: 'passed',
          });
        }
        for (const width of [1440, 390]) {
          await resize(width);
          await shot(`${layout}-${mode}-${width}`);
          assert.equal(
            await page.evaluate(() => {
              const main = document.querySelector('main');
              return (
                main.scrollWidth <= main.clientWidth &&
                document.documentElement.scrollWidth <= innerWidth
              );
            }),
            true,
            'Gallery has no horizontal overflow',
          );
        }
        await resize(1440);
      }
    }
    report.checks.push(
      'All four layout/loading combinations execute 20/40/80 against real SQLite; layout produces zero list requests; page size restarts at the beginning.',
    );

    await select('每批图片数', '20 张 / 批');
    await loaded(20);
    const beforeDraft = await state();
    await page.fill('input[aria-label="搜索图片名称"]', 'issue173-alpha');
    await settle();
    assert.equal((await state()).requests, beforeDraft.requests);
    assert.equal((await state()).history, beforeDraft.history);
    assert.equal((await state()).pushes, beforeDraft.pushes);
    assert.equal((await state()).url, beforeDraft.url);
    await page.press('input[aria-label="搜索图片名称"]', 'Enter');
    await page.waitForFunction(
      () => new URL(location.href).searchParams.get('q') === 'issue173-alpha',
    );
    await loaded(20);
    assert.equal((await state()).pushes, beforeDraft.pushes + 1);
    assert.match((await state()).count, /47.*20/);
    await page.evaluate(() => history.back());
    await page.waitForFunction(
      () => new URL(location.href).searchParams.get('q') === 'issue173-',
    );
    await loaded(20);
    await page.evaluate(() => history.forward());
    await page.waitForFunction(
      () => new URL(location.href).searchParams.get('q') === 'issue173-alpha',
    );
    await loaded(20);
    await page.click(button('下一页'));
    await page.waitForFunction(
      () => new URL(location.href).searchParams.get('page') === '2',
    );
    await loaded(20);
    const linked = await page.url();
    // A copied page link must work in a browser whose saved mode is still "more".
    await page.evaluate(
      (key) =>
        localStorage.setItem(
          key,
          JSON.stringify({ layout: 'grid', loadingMode: 'more' }),
        ),
      preferenceKey,
    );
    await page.goto(linked);
    await loaded(20);
    assert.equal(new URL(await page.url()).searchParams.get('page'), '2');
    assert.equal((await state()).loadingMode, 'pages');
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector('[data-testid="library-card"]').dataset
            .imageId,
      ),
      'issue173-040',
    );
    await monitor();
    await page.evaluate(() =>
      document.querySelector('.shell-content').scrollTo(0, 500),
    );
    await page.waitForFunction(
      () => document.querySelector('.shell-content').scrollTop >= 490,
    );
    await page.click(button('下一页'));
    await page.waitForFunction(
      () => new URL(location.href).searchParams.get('page') === '3',
    );
    await loaded(7);
    const beforeBack = (await state()).requests;
    await page.evaluate(() => history.back());
    await page.waitForFunction(
      () => new URL(location.href).searchParams.get('page') === '2',
    );
    await loaded(20);
    await page.waitForFunction(
      () => document.querySelector('.shell-content').scrollTop >= 490,
    );
    assert.equal(
      (await state()).requests,
      beforeBack,
      'Back restores cached page without another list request',
    );
    // Cached short pages must not let their late scroll-to-zero event overwrite
    // the taller destination's saved offset during rapid Back/Forward traversal.
    for (let round = 0; round < 3; round++) {
      await page.evaluate(() => history.forward());
      await page.waitForFunction(
        () => new URL(location.href).searchParams.get('page') === '3',
      );
      await loaded(7);
      await page.evaluate(() => history.back());
      await page.waitForFunction(
        () => new URL(location.href).searchParams.get('page') === '2',
      );
      await loaded(20);
      await page.waitForFunction(
        () => document.querySelector('.shell-content').scrollTop >= 490,
      );
    }
    assert.equal(
      (await state()).requests,
      beforeBack,
      'Repeated cached history restoration must not refetch',
    );
    report.checks.push(
      'Back and repeated Forward/Back restore the previous cached page and the actual main-container scroll offset.',
    );
    const beforeImage = (await state()).requests;
    await page.click('[data-testid="library-card"] button >> nth=0');
    await page.waitForSelector('loc=role:dialog[name="图片详情"]');
    await page.click(button('关闭图片详情'));
    await page.waitForFunction(
      () => !new URL(location.href).searchParams.has('image'),
    );
    assert.equal((await state()).requests, beforeImage);
    report.checks.push(
      'Search drafts change neither URL nor request/history count; submit adds one history entry; Back/Forward restores filters; copied pages restore their real items; image-only navigation causes no list request.',
    );

    await page.evaluate(() => {
      window.__queryFault = 'hold';
    });
    await page.fill('input[aria-label="搜索图片名称"]', 'issue173-beta');
    await page.press('input[aria-label="搜索图片名称"]', 'Enter');
    await page.waitForFunction(
      () => typeof window.__queryRelease === 'function',
    );
    assert.equal(
      await page.evaluate(() =>
        [
          ...document.querySelectorAll('[data-testid="library-card"] button'),
        ].every((node) => node.disabled),
      ),
      true,
      'Previous query cards are absent or disabled',
    );
    await search('issue173-alpha', 20);
    await page.evaluate(() => window.__queryRelease());
    await settle();
    assert.match((await state()).count, /47.*20/);
    assert.equal(
      await page.evaluate(() =>
        [...document.querySelectorAll('[data-testid="library-card"]')].every(
          (node) => node.textContent.includes('issue173-alpha'),
        ),
      ),
      true,
    );
    report.checks.push(
      'A held real beta response arriving after a newer alpha query never replaces alpha results or exposes old-query actions.',
    );

    await visit(
      'q=issue173-&tagId=issue173-a&tagId=issue173-b&tagId=issue173-a&pageSize=20&page=1',
    );
    await loaded(2);
    assert.match((await state()).count, /2 张图片/);
    await visit('q=issue173-&tagId=issue173-deleted');
    await page.waitForSelector('[data-testid="library-error"]');
    assert.equal(
      new URL(await page.url()).searchParams.get('tagId'),
      'issue173-deleted',
    );
    assert.equal((await state()).loadedCount, '0');
    await shot('invalid-reference');
    await visit('pageSize=41&sort=invalid');
    await page.waitForSelector('[data-testid="library-error"]');
    await page.click(button('重置查询'));
    await page.waitForFunction(
      () =>
        !document.querySelector('[data-testid="library-error"]') &&
        Number(
          document.querySelector('[data-testid="library-list"]').dataset
            .loadedCount,
        ) > 0,
    );
    report.checks.push(
      'Repeated tag IDs retain any-tag matching without duplicate images; a removed tag keeps its URL and shows an explicit failure; malformed URL has a working reset.',
    );

    await search('issue173-', 40);
    await select('图片加载方式', '加载更多');
    await loaded(40);
    await monitor();
    await page.evaluate(() => {
      window.__queryFault = 'cursor';
    });
    await page.click('[data-testid="library-load-more"]');
    await page.waitForSelector('[data-testid="library-error"]');
    await loaded(40);
    await page.click(button('重试加载'));
    await loaded(40);
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="library-error"]'),
    );
    await page.click('[data-testid="library-load-more"]');
    await loaded(80);
    const beforeExternal = (await state()).requests;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(resolve)),
    );
    assert.equal(
      await page.evaluate(
        () => !!document.querySelector('[data-refresh-available="true"]'),
      ),
      false,
      'Returning to the window does not imply that library data changed',
    );
    assert.equal((await state()).requests, beforeExternal);
    await page.evaluate(() => {
      const channel = new BroadcastChannel('ariso:library-changed');
      channel.postMessage('changed');
      channel.close();
    });
    await page.waitForFunction(
      () => !!document.querySelector('[data-refresh-available="true"]'),
    );
    assert.equal((await state()).requests, beforeExternal);
    assert.equal((await state()).loadedCount, '80');
    await page.click(button('刷新图库'));
    await loaded(40);
    report.checks.push(
      'A corrupted cursor is rejected by the actual server; refresh discards it and later load-more succeeds; receiving a cross-context change notification only marks the toolbar and retains cards until explicit refresh (producer paths are covered separately).',
    );

    ({ identifier: blockedStorageScript } = await page.cdp(
      'Page.addScriptToEvaluateOnNewDocument',
      {
        source: `(() => { const get = Storage.prototype.getItem; const set = Storage.prototype.setItem; Storage.prototype.getItem = function(key) { if (key === '${preferenceKey}') throw new DOMException('Controlled unavailable preference storage', 'SecurityError'); return get.call(this, key); }; Storage.prototype.setItem = function(key, value) { if (key === '${preferenceKey}') throw new DOMException('Controlled unavailable preference storage', 'SecurityError'); return set.call(this, key, value); }; })();`,
      },
    ));
    await visit();
    await loaded(40);
    assert.equal((await state()).layout, 'grid');
    assert.equal((await state()).loadingMode, 'more');
    await page.click(button('瀑布流'));
    await select('图片加载方式', '分页');
    await loaded(40);
    assert.equal((await state()).layout, 'masonry');
    assert.equal((await state()).loadingMode, 'pages');
    await search('issue173-alpha', 40);
    assert.equal((await state()).layout, 'masonry');
    assert.equal((await state()).loadingMode, 'pages');
    report.checks.push(
      'When only the library preference key is unavailable, defaults load real images and changed layout/loading preferences survive subsequent in-session queries.',
    );
  }
  report.status = 'passed';
} catch (error) {
  report.error = String(error.stack ?? error);
  report.failureState = await page.evaluate(() => ({
    url: location.href,
    readyState: document.readyState,
    hasLibrary: !!document.querySelector('[data-testid="library-list"]'),
    library: {
      ...document.querySelector('[data-testid="library-list"]')?.dataset,
    },
    scrollTop: document.querySelector('.shell-content')?.scrollTop,
    alerts: [...document.querySelectorAll('[role="alert"]')].map(
      (node) => node.textContent,
    ),
    loginBusy: document.querySelector('button[type="submit"]')?.disabled,
  }));
  await shot('failure');
  throw error;
} finally {
  if (blockedStorageScript)
    await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
      identifier: blockedStorageScript,
    });
  await sql(
    "DELETE FROM image_tags WHERE tag_id IN ('issue173-a','issue173-b')",
  );
  await sql("DELETE FROM tags WHERE id IN ('issue173-a','issue173-b')");
  await sql("DELETE FROM media_images WHERE id GLOB 'issue173-*'");
  await page.goto(`${config.origin}/library`);
  if (savedPreference !== undefined)
    await page.evaluate(
      ({ key, value }) => {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      },
      { key: preferenceKey, value: savedPreference },
    );
  await writeFile(
    join(config.output, `library-${phase}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
console.log(report);
