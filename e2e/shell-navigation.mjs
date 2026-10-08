/* global taskSpace, config */
const assert = (await import('node:assert/strict')).default;
const { writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { identitySql } = await import(config.identitySessionScript);
const { signInToLibrary } = await import(
  new URL('./library-login.mjs', config.identitySessionScript).href
);
const page = (await taskSpace(config.spaceId)).page(config.pageLabel ?? 'p1');
const report = { status: 'failed', checks: [], layouts: [], screenshots: [] };
const albumId = 'browser-shell-navigation';
const menu = 'button[aria-label="菜单"]';
const close = 'button[aria-label="关闭"]';
const dialog = '[role="dialog"][aria-label="导航菜单"]';
const navigation = [
  '总览，尚未开放',
  '上传',
  '图库',
  '相册',
  '标签',
  '分享管理',
  '回收站',
  '访问统计，尚未开放',
  '存储管理',
  '站点设置',
];
let createdAlbum = false;
async function shot(name) {
  const file = `shell-navigation-${name}.png`;
  await page.screenshot({ path: join(config.output, file) });
  report.screenshots.push(file);
}
async function resize(width, height = 844) {
  await page.cdp('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
  await page.waitForFunction(
    ({ width, height }) => innerWidth === width && innerHeight === height,
    { width, height },
  );
}
async function iconState(selector) {
  return page.evaluate((selector) => {
    const node = document.querySelector(selector);
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return {
      label: node.getAttribute('aria-label'),
      text: node.textContent.trim(),
      svg: node.querySelector('svg')?.getAttribute('aria-hidden'),
      width: rect.width,
      height: rect.height,
      background: style.backgroundColor,
      transform: style.transform,
      focusVisible: node.getAttribute('data-focus-visible'),
      outline: style.outlineStyle,
      shadow: style.boxShadow,
    };
  }, selector);
}
async function verifyIcon(selector, name, screenshot) {
  await page.mouse.move(5, 5);
  await page.mouse.click(5, 5);
  const before = await iconState(selector);
  assert.equal(before.label, name);
  assert.equal(before.text, '');
  assert.equal(before.svg, 'true');
  assert.ok(before.width >= 44 && before.height >= 44);
  await page.hover(selector);
  await page.waitForFunction(
    (selector) =>
      document
        .querySelector(selector)
        .getAnimations({ subtree: true })
        .every((animation) => animation.playState !== 'running'),
    selector,
  );
  const hovered = await iconState(selector);
  assert.equal(hovered.background, before.background, 'Hover keeps background');
  assert.equal(hovered.transform, before.transform, 'Hover keeps geometry');
  await shot(`${screenshot}-hover`);
  // Actual keyboard input activates React Aria's keyboard focus indicator.
  await page.focus(selector);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await page.waitForFunction(
    (selector) => document.activeElement === document.querySelector(selector),
    selector,
  );
  const focused = await iconState(selector);
  assert.equal(focused.focusVisible, 'true');
  assert.ok(focused.outline !== 'none' || focused.shadow !== before.shadow);
  await shot(`${screenshot}-focus`);
  return { before, hovered, focused };
}
async function verifyNavigation(current, mobile) {
  return page.evaluate(
    ({ current, navigation, mobile }) => {
      const root = document.querySelector(
        mobile ? '[role="dialog"][aria-label="导航菜单"]' : '.shell-navigation',
      );
      const links = [...root.querySelectorAll('.shell-nav-link')];
      const labels = links.map((node) => node.getAttribute('aria-label'));
      const actual = links
        .filter((node) => node.getAttribute('aria-current') === 'page')
        .map((node) => node.getAttribute('href'));
      return {
        labels,
        actual,
        expected: current,
        sameOrder: JSON.stringify(labels) === JSON.stringify(navigation),
        brand: root.querySelector('.shell-brand').textContent,
        account: root
          .querySelector('button[aria-label="账号菜单"]')
          .textContent.trim(),
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    },
    { current, navigation, mobile },
  );
}
try {
  await resize(1440, 1080);
  await page.goto(`${config.origin}/library`);
  await page.waitForFunction(
    () =>
      location.pathname === '/login' ||
      !!document.querySelector('[data-testid="library-list"]'),
  );
  if (new URL(await page.url()).pathname === '/login')
    await signInToLibrary(page, config, report);
  await identitySql(
    config,
    `INSERT INTO albums (id,name,description,created_at,updated_at) VALUES ('${albumId}','公共导航验证','',1,1)`,
  );
  createdAlbum = true;
  const storageResponse = await page.fetch('/api/storages');
  assert.equal(storageResponse.status, 200);
  const storages = JSON.parse(storageResponse.body);
  const storage = storages.find((item) => item.type === 'local');
  let corsStorage = storages.find((item) => item.type === 's3');
  if (!corsStorage) {
    const created = await page.fetch('/api/storages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 's3',
        name: 'Navigation S3',
        endpoint: 'http://127.0.0.1:1',
        region: 'test',
        bucket: 'navigation',
        enabled: false,
      }),
    });
    assert.equal(created.status, 201);
    corsStorage = JSON.parse(created.body);
  }
  assert.ok(storage);
  assert.ok(corsStorage);
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
    for (const width of [1440, 390]) {
      await resize(width, width === 1440 ? 1080 : 844);
      for (const [path, current, name] of [
        ['/upload', '/upload', 'upload'],
        ['/library', '/library', 'library'],
        ['/albums', '/albums', 'albums'],
        [`/albums/${albumId}`, '/albums', 'album-content'],
        ['/trash', '/trash', 'trash'],
        ['/tags', '/tags', 'tags'],
        ['/shares', '/shares', 'shares-list'],
        [`/shares/${albumId}`, '/shares', 'share-settings'],
        ['/admin', '/upload', 'admin-entry'],
        ['/settings/storage', '/settings/storage', 'storage-list'],
        ['/settings/storage/new', '/settings/storage', 'storage-new'],
        ['/settings/processing', '/settings/processing', 'processing-settings'],
        ['/settings/account', '/settings/processing', 'account-settings'],
        ['/settings/api', '/settings/processing', 'api-settings'],
        ['/settings/email', '/settings/processing', 'smtp-settings'],
        [
          `/settings/storage/${storage.id}`,
          '/settings/storage',
          'storage-edit',
        ],
        [
          `/settings/storage/${corsStorage.id}/cors`,
          '/settings/storage',
          'storage-cors',
        ],
      ]) {
        await page.goto(`${config.origin}${path}`);
        await page.waitForSelector('.shell-content');
        await page.waitForFunction(
          (path) => location.pathname === path,
          path === '/admin' ? '/upload' : path,
        );
        if (name === 'storage-cors') {
          await page.waitForSelector(
            '[data-testid="storage-cors"] a[href="/settings/storage"]',
          );
          const back = await page.evaluate(() => {
            const node = document.querySelector(
              '[data-testid="storage-cors"] a[href="/settings/storage"]',
            );
            const rect = node.getBoundingClientRect();
            return {
              text: node.textContent,
              height: rect.height,
              width: rect.width,
            };
          });
          assert.equal(back.text.includes('尚未开放'), false);
          assert.ok(back.height >= 44 && back.width >= 44);
        }
        await page.evaluate(() => {
          window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
          document
            .querySelector('.shell-content')
            .scrollTo({ top: 0, left: 0, behavior: 'instant' });
        });
        await page.waitForFunction(
          () =>
            window.scrollY === 0 &&
            document.querySelector('.shell-content').scrollTop === 0,
        );
        await shot(`${name}-${theme}-${width}`);
        if (width < 1200) {
          const state = await iconState(menu);
          assert.equal(state.text, '');
          assert.ok(state.width >= 44 && state.height >= 44);
          await page.click(menu);
          await page.waitForSelector(dialog);
        }
        const state = await verifyNavigation(current, width < 1200);
        assert.equal(state.sameOrder, true);
        assert.deepEqual(state.actual, [current]);
        assert.ok(state.brand && state.account.includes('站点所有者'));
        assert.equal(state.overflow, false);
        report.layouts.push({ path, theme, width, ...state });
        if (width < 1200) {
          await shot(`${name}-${theme}-${width}-menu`);
          await page.click(close);
          await page.waitForFunction(
            () =>
              document.activeElement?.getAttribute('aria-label') === '菜单' &&
              !document.querySelector('[role="dialog"][aria-label="导航菜单"]'),
          );
        }
      }
    }
    await page.goto(`${config.origin}/upload`);
    for (const [width, height] of [
      [360, 844],
      [430, 844],
      [768, 844],
      [987, 844],
      [390, 560],
    ]) {
      await resize(width, height);
      const trigger = await verifyIcon(
        menu,
        '菜单',
        `upload-${theme}-${width}x${height}-trigger`,
      );
      await page.click(menu);
      await page.waitForSelector(dialog);
      const dismiss = await verifyIcon(
        close,
        '关闭',
        `upload-${theme}-${width}x${height}-close`,
      );
      await page.keyboard.press('Escape');
      await page.waitForFunction(
        () =>
          document.activeElement?.getAttribute('aria-label') === '菜单' &&
          !document.querySelector('[role="dialog"][aria-label="导航菜单"]'),
      );
      report.layouts.push({
        theme,
        width,
        height,
        trigger,
        dismiss,
        escapeRestoresFocus: true,
      });
    }
  }
  report.checks.push(
    'All implemented owner-shell entries, including storage list/new/edit/CORS and processing/account/API/SMTP settings, retain the same brand/account/navigation order and correct current item on desktop/mobile in both themes.',
  );
  report.checks.push(
    'Menu and close are accessible icon-only 44px targets; real hover adds no background or transform, keyboard focus remains visible and close/Escape restore trigger focus at 360/430/768/987 and short 390×560.',
  );
  report.status = 'passed';
} catch (error) {
  report.error = String(error.stack ?? error);
  await shot('failure');
  throw error;
} finally {
  if (createdAlbum)
    await identitySql(config, `DELETE FROM albums WHERE id='${albumId}'`);
  await writeFile(
    join(config.output, 'shell-navigation.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(report);
}
