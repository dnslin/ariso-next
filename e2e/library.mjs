/* global taskSpace, config */
const { default: assert } = await import('node:assert/strict');
const { mkdir, readFile, writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { identitySql } = await import(config.identitySessionScript);
const task = await taskSpace(config.spaceId);
const page = task.page('p1');
const report = {
  status: 'failed',
  checks: [],
  layouts: [],
  limitations: [
    'Ego Chromium only; shortened viewport is not a physical soft keyboard or notched device test.',
  ],
};
const sql = (statement) => identitySql(config, statement);
const ids = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="library-card"]')].map(
      (node) => node.dataset.imageId,
    ),
  );
const count = async (value) =>
  page.waitForFunction(
    (n) =>
      document.querySelectorAll('[data-testid="library-card"]').length === n,
    value,
  );
const resize = async (width, height = 844) => {
  await page.cdp('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
  await page.waitForFunction((w) => innerWidth === w, width);
};
// Hold or reject actual list responses at fetch's transport boundary. Successful
// data always comes from the real production endpoint and disposable SQLite DB.
async function intercept(mode) {
  await page.evaluate((mode) => {
    const original = window.fetch;
    window.__libraryRequests = [];
    window.__libraryRelease = undefined;
    window.fetch = async (...args) => {
      const url = String(args[0]);
      if (!new URL(url, location.href).pathname.endsWith('/api/images'))
        return original(...args);
      window.__libraryRequests.push(url);
      const response = await original(...args);
      if (mode === 'fail') {
        window.fetch = original;
        throw new TypeError(
          'Verification: real list response lost at fetch boundary',
        );
      }
      await new Promise((resolve) => {
        window.__libraryRelease = resolve;
      });
      window.fetch = original;
      return response;
    };
  }, mode);
}
async function layouts(state) {
  for (const theme of ['light', 'dark']) {
    await page.cdp('Emulation.setEmulatedMedia', {
      features: [
        { name: 'prefers-color-scheme', value: theme },
        { name: 'prefers-reduced-motion', value: 'reduce' },
      ],
    });
    await page.waitForFunction(
      (theme) => document.documentElement.classList.contains(theme),
      theme,
    );
    for (const width of [360, 390, 430, 768, 1440]) {
      await resize(width);
      const layout = await page.evaluate(() => {
        const grid = document.querySelector('[data-testid="library-grid"]');
        return {
          width: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          mainWidth: document.querySelector('main').clientWidth,
          mainScrollWidth: document.querySelector('main').scrollWidth,
          columns: grid
            ? getComputedStyle(grid).gridTemplateColumns.split(' ').length
            : null,
          targets: [...document.querySelectorAll('button,a')]
            .filter((node) => node.getBoundingClientRect().width > 0)
            .map((node) => ({
              name: node.getAttribute('aria-label') || node.textContent,
              height: node.getBoundingClientRect().height,
              width: node.getBoundingClientRect().width,
            })),
        };
      });
      assert.ok(
        layout.scrollWidth <= width,
        `${state} ${theme} ${width}: no horizontal overflow`,
      );
      assert.ok(
        layout.mainScrollWidth <= layout.mainWidth,
        `${state} ${theme} ${width}: main has no horizontal overflow`,
      );
      if (width < 768 && layout.columns !== null)
        assert.equal(layout.columns, 2);
      for (const target of layout.targets)
        assert.ok(
          target.height >= 44 && target.width >= 44,
          `${target.name}: 44px target`,
        );
      await page.screenshot({
        path: join(config.output, `library-${state}-${theme}-${width}.png`),
      });
      report.layouts.push({ state, theme, ...layout });
    }
  }
}
try {
  await page.goto(`${config.origin}/login`);
  await page.waitForSelector('#email');
  assert.equal((await page.fetch('/api/images')).status, 401);
  await page.goto(`${config.origin}/library`);
  await page.waitForSelector('#email');
  assert.equal(new URL(await page.url()).pathname, '/login');
  await page.fill('#email', config.credentials.email);
  await page.fill('#password', config.credentials.password);
  await page.click('loc=role:button[name="登录"]');
  await page.waitForFunction(
    () =>
      location.pathname === '/library' ||
      document
        .querySelector('[role="alert"]')
        ?.textContent.includes('HTTP 429'),
  );
  if (new URL(await page.url()).pathname === '/login') {
    // Identity scenarios share this real server and can exhaust its login window.
    await page.waitForFunction(
      () => !document.querySelector('button[type="submit"]').disabled,
      undefined,
      { timeout: 15000 },
    );
    await page.click('loc=role:button[name="登录"]');
    report.checks.push(
      'Library login honors the real preceding HTTP 429 retry window.',
    );
  }
  await page.waitForURL(`${config.origin}/library`);
  await page.waitForSelector('[data-testid="library-empty"]');
  await layouts('empty');
  report.checks.push(
    'Anonymous API refuses access; protected library returns to real login; successful login preserves /library; real empty SQLite renders empty state.',
  );
  const [storage] = await sql(
    'SELECT id, local_path FROM storage_configs LIMIT 1',
  );
  const directory = join(
    config.dataDirectory,
    'storage',
    storage.local_path,
    'ariso',
    storage.id,
    'library-fixtures',
  );
  await mkdir(directory, { recursive: true });
  const png = await readFile(
    join(config.projectDirectory, 'tests/fixtures/runtime/images/sample.png'),
  );
  const created = 1700000000000;
  await sql(
    `INSERT INTO storage_configs (id,name,type,enabled,local_path,created_at,updated_at) VALUES ('library-disabled','已停用测试存储','local',0,'default',${created},${created})`,
  );
  const disabledDirectory = join(
    config.dataDirectory,
    'storage',
    'default',
    'ariso',
    'library-disabled',
    'library-fixtures',
  );
  await mkdir(disabledDirectory, { recursive: true });
  for (let index = 0; index < 85; index++) {
    const id = `library-${String(index).padStart(3, '0')}`;
    const special = index % 7;
    const storageId = index === 6 ? 'library-disabled' : storage.id;
    const status =
      special === 1
        ? 'pending'
        : special === 2
          ? 'processing'
          : special === 3
            ? 'failed'
            : 'ready';
    const format = special === 4 ? 'gif' : special === 5 ? 'svg' : 'png';
    const classification =
      special === 4 ? 'animated' : special === 5 ? 'preview_only' : 'static';
    await sql(
      `INSERT INTO media_images (id,storage_id,original_name,display_name,visibility,format,mime,width,height,byte_size,animated,classification,processing_status,created_at,updated_at) VALUES ('${id}','${storageId}','${id}.${format}','${id}','${index % 2 ? 'private' : 'public'}','${format}','image/${format}',640,480,${png.length},${special === 4 ? 1 : 0},'${classification}','${status}',${created},${created})`,
    );
    if ((status === 'ready' && special !== 6) || [2, 3, 6].includes(index)) {
      await sql(
        `INSERT INTO media_objects (id,image_id,storage_id,key,purpose,status,byte_size,format,mime,created_at,updated_at) VALUES ('object-${id}','${id}','${storageId}','library-fixtures/${id}.png','thumbnail','stored',${png.length},'png','image/png',${created},${created})`,
      );
      // One persisted thumbnail intentionally has no file, exercising real delivery failure.
      if (index !== 0)
        await writeFile(
          join(index === 6 ? disabledDirectory : directory, `${id}.png`),
          png,
        );
      await sql(
        `INSERT INTO media_versions (image_id,kind,object_id,width,height,byte_size,format,mime,created_at) VALUES ('${id}','thumbnail','object-${id}',64,48,${png.length},'png','image/png',${created})`,
      );
    }
  }
  await sql(
    "UPDATE media_images SET display_name = '很长的图片名称用来验证手机卡片中的文字换行与布局不会横向溢出非常长的名称.png' WHERE id = 'library-005'",
  );
  // Running records are intentional persisted fixtures, never queued for the
  // real worker. They coexist with a prior failed job and an existing thumbnail.
  for (const [id, status, time] of [
    ['prior-failure', 'failed', created],
    ['active-job', 'running', created + 1],
  ]) {
    await sql(
      `INSERT INTO media_jobs (id,image_id,kind,scope,snapshot,expected_versions,status,error,step,created_at,updated_at) VALUES ('${id}','library-002','process','thumbnail','{}','["thumbnail"]','${status}',${status === 'failed' ? "'controlled prior failure'" : 'NULL'},'thumbnail',${time},${time})`,
    );
  }
  await sql(
    `INSERT INTO media_images (id,storage_id,original_name,display_name,visibility,format,mime,byte_size,processing_status,trashed_at,created_at,updated_at) VALUES ('library-trashed','${storage.id}','trashed.png','不应出现的回收图片','private','png','image/png',1,'ready',${created},${created + 1},${created})`,
  );
  await intercept('hold');
  await page.click('loc=role:button[name="刷新图库"]');
  await page.waitForSelector('[data-testid="library-loading"]');
  await layouts('loading');
  await page.waitForFunction(
    () => typeof window.__libraryRelease === 'function',
  );
  assert.equal(await page.evaluate(() => window.__libraryRequests.length), 1);
  await page.evaluate(() => window.__libraryRelease());
  await count(40);
  const expected = Array.from(
    { length: 85 },
    (_, i) => `library-${String(i).padStart(3, '0')}`,
  );
  assert.deepEqual(await ids(), expected.slice(0, 40));
  assert.match(
    await page.evaluate(
      () => document.querySelector('[data-testid="library-count"]').textContent,
    ),
    /85.*40/,
  );
  assert.equal(
    await page.evaluate(
      () => !!document.querySelector('[data-image-id="library-trashed"]'),
    ),
    false,
  );
  await layouts('populated');
  for (const id of ['library-002', 'library-003']) {
    await page.waitForFunction((id) => {
      const img = document.querySelector(`[data-image-id="${id}"] img`);
      return img?.complete && img.naturalWidth > 0;
    }, id);
  }
  assert.equal(
    await page.evaluate(() => {
      const text = document.querySelector(
        '[data-image-id="library-002"]',
      ).textContent;
      return (
        text.includes('处理中') &&
        text.includes('当前任务：执行中 · 生成缩略图') &&
        text.includes('最近任务失败 · 生成缩略图')
      );
    }),
    true,
  );
  assert.equal(
    await page.evaluate(() =>
      document
        .querySelector('[data-image-id="library-003"]')
        .textContent.includes('处理失败'),
    ),
    true,
  );
  assert.equal(
    await page.evaluate(() => {
      const card = document.querySelector('[data-image-id="library-006"]');
      return (
        card.textContent.includes('存储已停用') && !card.querySelector('img')
      );
    }),
    true,
  );
  report.checks.push(
    'Real disabled storage remains listed without a thumbnail request; trash is excluded from cards and count; processing/failed assets retain decoded real thumbnails; active and previous failed jobs display independently.',
  );
  await page.waitForFunction(() =>
    document
      .querySelector('[data-image-id="library-000"]')
      ?.textContent.includes('缩略图读取失败'),
  );
  assert.equal(
    await page.evaluate(() =>
      [...performance.getEntriesByType('resource')].some((entry) => {
        const url = new URL(entry.name);
        return (
          url.pathname.startsWith('/i/') &&
          url.searchParams.get('type') !== 'thumbnail'
        );
      }),
    ),
    false,
    'Thumbnail failure never requests original',
  );
  await resize(390);
  await page.click('loc=role:button[name="菜单"]');
  await page.waitForSelector('loc=role:dialog[name="导航菜单"]');
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () => document.activeElement?.textContent === '菜单',
  );
  report.checks.push(
    'Actual missing thumbnail file renders explicit failure without original fallback; mobile menu Escape restores trigger focus.',
  );
  assert.ok(
    await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="library-card"] img')].some(
        (img) => img.complete && img.naturalWidth > 0,
      ),
    ),
    'Real thumbnail bytes decode',
  );
  await intercept('fail');
  await page.click('[data-testid="library-load-more"]');
  await page.waitForSelector('loc=role:button[name="重试加载更多"]');
  const failedCursor = await page.evaluate(() => window.__libraryRequests[0]);
  assert.deepEqual(await ids(), expected.slice(0, 40));
  await intercept('hold');
  await page.focus('loc=role:button[name="重试加载更多"]');
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () => typeof window.__libraryRelease === 'function',
  );
  await page.keyboard.press('Enter');
  assert.deepEqual(await page.evaluate(() => window.__libraryRequests), [
    failedCursor,
  ]);
  await page.evaluate(() => window.__libraryRelease());
  await count(80);
  assert.deepEqual(await ids(), expected.slice(0, 80));
  await page.focus('[data-testid="library-load-more"]');
  await page.keyboard.press('Enter');
  await count(85);
  assert.deepEqual(await ids(), expected);
  await page.waitForFunction(
    () => document.activeElement?.textContent === '已加载全部图片',
  );
  assert.equal(
    await page.evaluate(
      () => !!document.querySelector('[data-testid="library-load-more"]'),
    ),
    false,
  );
  report.checks.push(
    'Real mixed assets and timestamp ties paginate 40 → 80 → 85 in ascending ID order within timestamp ties; lost real next-page response retains cards; keyboard retry uses same cursor; held response rejects duplicate submission.',
  );
  await resize(390, 400);
  await page.evaluate(() => {
    const content = document.querySelector('.shell-content');
    content.scrollTo(0, content.scrollHeight);
  });
  assert.equal(
    await page.evaluate(() => {
      const rect = document
        .querySelector('[data-testid="library-count"]')
        .getBoundingClientRect();
      const footer = document
        .querySelector('.shell-footer')
        .getBoundingClientRect();
      const end = [...document.querySelectorAll('p')]
        .find((node) => node.textContent === '已加载全部图片')
        .getBoundingClientRect();
      return (
        rect.top >= 0 &&
        rect.bottom <= innerHeight &&
        end.top >= 0 &&
        end.bottom <= footer.top
      );
    }),
    true,
    'Actual content scroll reaches the end above the visible short-viewport count bar',
  );
  await page.screenshot({
    path: join(config.output, 'library-short-viewport.png'),
  });
  await intercept('fail');
  await page.click('loc=role:button[name="刷新图库"]');
  await page.waitForSelector('[data-testid="library-error"]');
  await layouts('error');
  await page.click('loc=role:button[name="重试加载"]');
  await count(40);
  await sql(`UPDATE session SET expires_at = ${Date.now() - 1}`);
  await page.click('loc=role:button[name="刷新图库"]');
  await page.waitForSelector('#email');
  assert.equal(new URL(await page.url()).searchParams.get('reason'), 'expired');
  report.checks.push(
    'Initial reload transport failure is explicit and retries real endpoint; expired real SQLite session makes the next library API read return to login.',
  );
  report.status = 'passed';
} catch (error) {
  report.error = String(error.stack ?? error);
  throw error;
} finally {
  await writeFile(
    join(config.output, 'library.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
console.log(report);
