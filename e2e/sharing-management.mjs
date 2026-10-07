/* global taskSpace, config */
const assert = (await import('node:assert/strict')).default;
const { execFile } = await import('node:child_process');
const { promisify } = await import('node:util');
const { mkdir, readFile, rm, writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { identitySql } = await import(config.identitySessionScript);
const { signInToLibrary } = await import(
  new URL('./library-login.mjs', config.identitySessionScript).href
);
const { resizeViewport, setTheme, readGeometry, assertGeometry } = await import(
  new URL('./browser-geometry.mjs', config.identitySessionScript).href
);
const { installBrowserErrors, assertNoBrowserErrors } = await import(
  config.errorsScript
);
const { saveClipboard, restoreClipboard } = await import(
  new URL('./library-copy-helpers.mjs', config.identitySessionScript).href
);
const task = await taskSpace(config.spaceId);
const page = task.page(config.pageLabel ?? 'p1');
const sql = (statement) => identitySql(config, statement);
const run = promisify(execFile);
const button = (name) => `loc=role:button[name="${name}"]`;
const choice = (name) =>
  `button[data-slot="toggle-button"]:has-text("${name}")`;
const mainId = 'issue191-main';
const unsharedId = 'issue191-new';
const fixtureDirectory = join(config.dataDirectory, 'storage', 'issue191');
const phase = config.sharingManagementPhase;
const representative = phase === undefined || phase === 'representative';
const behavior = phase === undefined || phase === 'behavior';
const recovery = phase === undefined || phase === 'recovery';
assert.ok(
  phase === undefined ||
    ['representative', 'behavior', 'recovery'].includes(phase),
  'Unknown sharing management phase',
);
const report = {
  status: 'failed',
  phase: phase ?? 'full',
  taskSpaceId: task.spaceId,
  origin: config.origin,
  checks: [],
  layouts: [],
  screenshots: [],
  limitations: [
    'Production owner UI and disposable SQLite data; browser transport faults are explicit injections after real commits where specified.',
    'Anonymous gallery rendering belongs to T-SHR-03; physical phones and Release containers were not exercised.',
  ],
};
let savedClipboard, errorScript, savedSite, savedTheme, peer;

async function api(path, method = 'GET', body) {
  const response = await page.fetch(path, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
  });
  assert.equal(response.status, 200, `${method} ${path}: ${response.body}`);
  return JSON.parse(response.body);
}
const shareApi = (id = mainId) => `/api/albums/${id}/share`;
const settingsPath = (id = mainId) => `/shares/${id}`;
async function current(id = mainId) {
  return (await api(shareApi(id))).share;
}
async function settings(id = mainId) {
  await page.goto(`${config.origin}${settingsPath(id)}`);
  await page.waitForSelector('[data-testid="share-settings"]');
  await page.waitForFunction(
    () =>
      !!document.querySelector('[data-testid="share-address"]') ||
      !!document.querySelector('[data-testid="share-create"]'),
  );
}
async function list() {
  await page.goto(`${config.origin}/shares`);
  await page.waitForSelector('[data-testid="shares-screen"]');
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="shares-loading"]'),
  );
}
async function visibleShareRow(id) {
  await page.waitForFunction(
    (id) =>
      [...document.querySelectorAll(`[data-share-album-id="${id}"]`)].some(
        (node) => node.getClientRects().length > 0,
      ),
    id,
  );
  const tag = await page.evaluate(
    (id) =>
      [...document.querySelectorAll(`[data-share-album-id="${id}"]`)]
        .find((node) => node.getClientRects().length > 0)
        .tagName.toLowerCase(),
    id,
  );
  return `${tag}[data-share-album-id="${id}"]`;
}
async function shot(state) {
  const filename = `sharing-management-${state}.png`;
  assert.ok(
    !report.screenshots.includes(filename),
    `Unique screenshot: ${filename}`,
  );
  await page.screenshot({ path: join(config.output, filename) });
  report.screenshots.push(filename);
}
async function layouts(
  state,
  widths = [360, 390, 430, 768, 1440],
  scrollButton,
) {
  for (const theme of ['light', 'dark']) {
    await setTheme(page, theme);
    for (const width of widths) {
      await resizeViewport(page, width);
      if (scrollButton && width < 768)
        await page.evaluate((name) => {
          const button = [...document.querySelectorAll('button')].find(
            (node) => node.textContent.trim() === name,
          );
          (name === '保存展示'
            ? button.closest('[data-slot="card"]')
            : button
          ).scrollIntoView({ block: 'center' });
        }, scrollButton);
      const geometry = await readGeometry(page);
      assertGeometry(geometry, `${state}/${theme}/${width}`);
      if (scrollButton === '保存展示') {
        const selectedChoice = await page.evaluate(() => {
          const card = [...document.querySelectorAll('button')]
            .find((node) => node.textContent.trim() === '保存展示')
            .closest('[data-slot="card"]');
          const selected = card.querySelector(
            '[data-slot="toggle-button"][aria-checked="true"]',
          );
          const style = getComputedStyle(selected);
          const icon = selected.querySelector('svg');
          return {
            text: selected.textContent.trim(),
            color: style.color,
            backgroundColor: style.backgroundColor,
            opacity: style.opacity,
            iconOpacity: getComputedStyle(icon).opacity,
          };
        });
        assert.equal(selectedChoice.opacity, '1');
        assert.equal(selectedChoice.iconOpacity, '1');
        report.layouts.push({
          state: `${state}-selected-choice`,
          theme,
          width,
          ...selectedChoice,
        });
      }
      if ([390, 1440].includes(width)) await shot(`${state}-${theme}-${width}`);
      report.layouts.push({ state, theme, ...geometry });
    }
  }
}
async function assertPasswordRow() {
  const geometry = await page.evaluate(() => {
    const input = document.querySelector('#share-password');
    const group = input.closest('[data-slot="input-group"]');
    const icon = group.querySelector('button');
    const save = [...document.querySelectorAll('button')].find(
      (node) => node.textContent.trim() === '保存密码',
    );
    return {
      group: group.getBoundingClientRect().toJSON(),
      icon: icon.getBoundingClientRect().toJSON(),
      save: save.getBoundingClientRect().toJSON(),
    };
  });
  assert.ok(
    geometry.icon.left >= geometry.group.left &&
      geometry.icon.right <= geometry.group.right &&
      geometry.icon.top >= geometry.group.top &&
      geometry.icon.bottom <= geometry.group.bottom,
    'Password reveal icon is inside the visible InputGroup',
  );
  assert.ok(
    Math.abs(geometry.group.top - geometry.save.top) <= 1 &&
      Math.abs(geometry.group.bottom - geometry.save.bottom) <= 1,
    'Desktop password input and save button keep one row with and without errors',
  );
}
function hasDangerBoundary(field) {
  // HeroUI's actual invalid-field-ring paints an outline when unfocused and a
  // box-shadow ring when focused, in addition to any explicit border color.
  return (
    field.borderColor === field.errorColor ||
    (field.outlineColor === field.errorColor &&
      parseFloat(field.outlineWidth) > 0) ||
    field.boxShadow.includes(field.errorColor)
  );
}
async function manualLayouts() {
  report.manualCompletion = [];
  for (const theme of ['light', 'dark']) {
    await setTheme(page, theme);
    for (const width of [390, 1440]) {
      await resizeViewport(page, width);
      const geometry = await readGeometry(page);
      assertGeometry(geometry, `copy-manual/${theme}/${width}`);
      await shot(`copy-manual-${theme}-${width}`);
      report.layouts.push({ state: 'copy-manual', theme, ...geometry });
      if (width === 390) {
        const completion = await page.evaluate(() => {
          const button = [
            ...document.querySelectorAll(
              '[data-testid="share-copy-manual"] button',
            ),
          ].find((node) => node.textContent.trim() === '完成');
          const rect = button.getBoundingClientRect();
          const hit = document.elementFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2,
          );
          return {
            unobstructed: hit === button || button.contains(hit),
            hitText: hit?.textContent ?? null,
            toastTitles: [
              ...document.querySelectorAll('[data-slot="toast-title"]'),
            ].map((node) => node.textContent),
          };
        });
        if (completion.unobstructed) {
          await page.click(button('完成'));
          await page.waitForSelector('[data-testid="share-copy-manual"]', {
            state: 'hidden',
          });
          completion.clicked = true;
          await page.waitForFunction(
            () =>
              document.activeElement?.getAttribute('aria-label') ===
              '复制分享地址',
          );
          await page.click(button('复制分享地址'));
          await page.waitForSelector('[data-testid="share-copy-manual"]');
        } else completion.clicked = false;
        report.manualCompletion.push({ theme, width, ...completion });
      }
    }
  }
}
async function calendarLayouts() {
  // Anchored popovers are opened after each viewport change, as in the shared
  // upload-choice scenes, so mobile metrics do not keep a desktop anchor.
  for (const theme of ['light', 'dark']) {
    await setTheme(page, theme);
    for (const width of [390, 1440]) {
      await resizeViewport(page, width);
      await page.click('button[aria-label="打开日历"]');
      await page.waitForSelector('[data-slot="calendar"]');
      const geometry = await readGeometry(page);
      assert.equal(
        geometry.width,
        width,
        'Calendar keeps the intended viewport',
      );
      assertGeometry(geometry, `future-calendar/${theme}/${width}`);
      await shot(`future-calendar-${theme}-${width}`);
      report.layouts.push({ state: 'future-calendar', theme, ...geometry });
      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-slot="calendar"]', { state: 'hidden' });
    }
  }
}
async function accordion(name) {
  const selector = button(name);
  const expanded = await page.evaluate(
    (name) =>
      [...document.querySelectorAll('button')]
        .find((node) => node.getAttribute('aria-label') === name)
        ?.getAttribute('aria-expanded'),
    name,
  );
  if (expanded !== 'true') await page.click(selector);
  await page.waitForFunction(
    (name) =>
      [...document.querySelectorAll('button')]
        .find((node) => node.getAttribute('aria-label') === name)
        ?.getAttribute('aria-expanded') === 'true',
    name,
  );
}
async function toast(message, target = page) {
  await target.waitForFunction(
    (message) =>
      [...document.querySelectorAll('[data-slot="toast-title"]')].some((node) =>
        node.textContent.includes(message),
      ),
    message,
  );
}
async function feedback(pattern) {
  await page.waitForFunction(
    (pattern) =>
      [
        ...document.querySelectorAll(
          '[data-testid="share-feedback"],[role="alert"],[data-slot="field-error"]',
        ),
      ].some((node) => new RegExp(pattern).test(node.textContent)),
    pattern,
  );
}
async function assertDisplaySaved() {
  assert.deepEqual(
    await page.evaluate(() => {
      const save = [...document.querySelectorAll('button')].find(
        (node) => node.textContent.trim() === '保存展示',
      );
      return {
        disabled: save.disabled,
        status: save.closest('[data-slot="card-footer"]').querySelector('p')
          .textContent,
      };
    }),
    { disabled: true, status: '当前设置已保存' },
    'Unchanged visitor display stays saved independently of password or deadline drafts',
  );
}

// Only the browser fetch boundary changes. Successful writes and recovery reads
// use the production route handlers and the runner's disposable SQLite database.
async function intercept(
  { method, path = shareApi(), mode = 'record', readMode },
  target = page,
) {
  await target.evaluate(
    ({ method, path, mode, readMode }) => {
      const original = window.fetch;
      window.__sharingTraffic = [];
      window.__sharingRelease = undefined;
      window.__sharingReadRelease = undefined;
      window.__sharingRestore = () => {
        window.fetch = original;
        window.__sharingRelease?.();
        window.__sharingReadRelease?.();
      };
      window.fetch = async (...args) => {
        const url = new URL(
          typeof args[0] === 'string' ? args[0] : args[0].url,
          location.href,
        );
        const verb = args[1]?.method ?? 'GET';
        if (
          url.pathname !== path &&
          url.pathname !== path.replace(/\/rotate$/, '')
        )
          return original(...args);
        const entry = {
          method: verb,
          path: url.pathname,
          body: args[1]?.body ? JSON.parse(args[1].body) : null,
        };
        window.__sharingTraffic.push(entry);
        if (verb === 'GET' && readMode === 'reject')
          return new Response(
            JSON.stringify({
              code: 'SHARING_INTERNAL_ERROR',
              message: '浏览器验证：读取失败',
            }),
            {
              status: 503,
              headers: {
                'content-type': 'application/json',
                'cache-control': 'no-store',
              },
            },
          );
        if (verb === method && mode === 'reject')
          return new Response(
            JSON.stringify({
              code: 'SHARING_INVALID_INPUT',
              message: '浏览器验证：拒绝当前输入',
            }),
            {
              status: 400,
              headers: {
                'content-type': 'application/json',
                'cache-control': 'no-store',
              },
            },
          );
        const response = await original(...args);
        entry.status = response.status;
        entry.response = await response.clone().json();
        if (verb === 'GET' && readMode === 'hold')
          await new Promise((resolve) => {
            window.__sharingReadRelease = resolve;
          });
        if (verb === method && (mode === 'hold' || mode === 'hold-lost'))
          await new Promise((resolve) => {
            window.__sharingRelease = resolve;
          });
        if (verb === method && (mode === 'lost' || mode === 'hold-lost'))
          throw new TypeError(
            'Verification: sharing response lost after real commit',
          );
        return response;
      };
    },
    { method, path, mode, readMode },
  );
}
async function restore(target = page) {
  await target.evaluate(() => window.__sharingRestore?.());
}
async function traffic(target = page) {
  return target.evaluate(() => window.__sharingTraffic);
}
async function seed() {
  const now = Date.now();
  await sql(`INSERT INTO albums (id,name,description,created_at,updated_at) VALUES
    ('${mainId}','分享验证 山野之间','独立浏览器测试',${now},${now}),
    ('${unsharedId}','分享验证 未创建','独立浏览器测试',${now},${now})`);
  await sql(`INSERT INTO storage_configs (id,name,type,enabled,local_path,created_at,updated_at) VALUES
    ('issue191-storage','分享验证存储','local',1,'issue191',${now},${now})`);
  const png = await readFile(
    join(config.projectDirectory, 'tests/fixtures/runtime/images/sample.png'),
  );
  const objectDirectory = join(fixtureDirectory, 'ariso', 'issue191-storage');
  await mkdir(objectDirectory, { recursive: true });
  for (const [id, visibility] of [
    ['issue191-public', 'public'],
    ['issue191-private', 'private'],
  ]) {
    await sql(`INSERT INTO media_images (id,storage_id,original_name,display_name,visibility,format,mime,width,height,byte_size,classification,processing_status,created_at,updated_at)
      VALUES ('${id}','issue191-storage','${id}.png','${id}.png','${visibility}','png','image/png',640,480,${png.length},'static','ready',${now},${now})`);
    await sql(`INSERT INTO media_objects (id,image_id,storage_id,key,purpose,status,byte_size,format,mime,created_at,updated_at)
      VALUES ('${id}-object','${id}','issue191-storage','${id}.png','thumbnail','stored',${png.length},'png','image/png',${now},${now})`);
    await writeFile(join(objectDirectory, `${id}.png`), png);
    await sql(`INSERT INTO media_versions (image_id,kind,object_id,width,height,byte_size,format,mime,created_at)
      VALUES ('${id}','thumbnail','${id}-object',64,48,${png.length},'png','image/png',${now})`);
    await sql(
      `INSERT INTO album_images (album_id,image_id,joined_at) VALUES ('${mainId}','${id}',${now})`,
    );
  }
  await api(shareApi(), 'POST', {});
}

async function settingsPresentation() {
  const [saved] = await sql(
    `SELECT enabled,expires_at FROM album_shares WHERE album_id='${mainId}'`,
  );
  report.settingsPresentation = [];
  try {
    for (const [state, enabled, expiresAt] of [
      ['active', 1, null],
      ['expired', 1, Date.now() - 60_000],
      ['disabled-expired', 0, Date.now() - 60_000],
    ]) {
      await sql(
        `UPDATE album_shares SET enabled=${enabled},expires_at=${expiresAt ?? 'NULL'} WHERE album_id='${mainId}'`,
      );
      await settings();
      for (const theme of ['light', 'dark']) {
        await setTheme(page, theme);
        for (const width of [390, 1440]) {
          await resizeViewport(page, width);
          const presentation = await page.evaluate(() => {
            const header = document.querySelector(
              '[data-testid="share-settings"]',
            );
            const back = document.querySelector(
              'button[aria-label="返回分享管理"]',
            );
            const chip = document.querySelector('main [data-slot="chip"]');
            const label = chip?.lastElementChild;
            const expired = [...document.querySelectorAll('main span')].filter(
              (node) =>
                node.children.length === 0 && node.textContent === '已过期',
            );
            const reference = document.createElement('span');
            reference.style.color = 'var(--danger)';
            document.body.append(reference);
            const danger = getComputedStyle(reference).color;
            reference.remove();
            return {
              header: header.getBoundingClientRect().toJSON(),
              title: header
                .querySelector('h1')
                .getBoundingClientRect()
                .toJSON(),
              back: back?.getBoundingClientRect().toJSON(),
              icon: back
                ?.querySelector('svg')
                ?.getBoundingClientRect()
                .toJSON(),
              inHeader: header.contains(back),
              iconOnly:
                back?.textContent.trim() === '' && !!back.querySelector('svg'),
              label: label?.textContent,
              labelColor: label && getComputedStyle(label).color,
              chipColor: chip && getComputedStyle(chip).color,
              dotColor: chip && getComputedStyle(chip.firstElementChild).color,
              danger,
              expired: expired.map((node) => {
                const style = getComputedStyle(node);
                return {
                  color: style.color,
                  textShadow: style.textShadow,
                  boxShadow: style.boxShadow,
                  filter: style.filter,
                };
              }),
            };
          });
          report.settingsPresentation.push({
            state,
            theme,
            width,
            ...presentation,
          });
          assert.equal(
            presentation.inHeader,
            true,
            'Return action is in the page header',
          );
          assert.equal(
            presentation.iconOnly,
            true,
            'Return action contains only its arrow icon',
          );
          assert.ok(
            presentation.back.width >= 44 && presentation.back.height >= 44,
          );
          assert.equal(presentation.icon.width, 18);
          assert.equal(presentation.icon.height, 18);
          assert.ok(
            Math.abs(presentation.back.right - presentation.header.right) <= 1,
          );
          assert.ok(
            Math.abs(presentation.back.top - presentation.title.top) <= 1,
          );
          assert.equal(
            presentation.label,
            state === 'active' ? '分享中' : enabled ? '已过期' : '已停用',
          );
          assert.equal(
            presentation.dotColor,
            presentation.chipColor,
            'Status dot stays neutral',
          );
          assert.equal(
            presentation.expired.length,
            state === 'active' ? 0 : enabled ? 2 : 1,
          );
          for (const expired of presentation.expired) {
            assert.equal(
              expired.color,
              presentation.danger,
              'Expired text uses the existing red status color',
            );
            assert.notEqual(expired.color, presentation.chipColor);
            assert.equal(expired.textShadow, 'none');
            assert.equal(expired.boxShadow, 'none');
            assert.equal(expired.filter, 'none');
          }
          if (state !== 'expired')
            assert.equal(presentation.labelColor, presentation.chipColor);
          await shot(`presentation-${state}-${theme}-${width}`);
        }
      }
    }
  } finally {
    await sql(
      `UPDATE album_shares SET enabled=${saved.enabled},expires_at=${saved.expires_at ?? 'NULL'} WHERE album_id='${mainId}'`,
    );
  }
  await settings();
  await page.focus(button('返回分享管理'));
  await page.keyboard.press('Enter');
  await page.waitForURL(`${config.origin}/shares`);
  await page.goto(`${config.origin}${settingsPath()}?from=album`);
  await page.waitForSelector('[data-testid="share-address"]');
  await page.click(choice('瀑布流'));
  await page.click(button('返回相册'));
  await page.waitForSelector('[data-testid="share-dialog"]');
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-testid="share-dialog"]', {
    state: 'hidden',
  });
  await page.waitForFunction(
    () => document.activeElement?.getAttribute('aria-label') === '返回相册',
  );
  assert.equal(
    await page.evaluate(() =>
      document
        .querySelector('[data-slot="toggle-button"][aria-checked="true"]')
        .textContent.trim(),
    ),
    '瀑布流',
  );
  await page.click(choice('网格'));
  await page.click(button('返回相册'));
  await page.waitForURL(`${config.origin}/albums/${mainId}`);
  report.checks.push(
    'Settings return is an accessible 44px top-right icon in both themes at desktop/mobile; active and disabled labels stay neutral, expired label/date suffix are red without halo; keyboard return, album destination, unsaved confirmation, draft and focus restoration remain working.',
  );
}

try {
  report.stage = 'owner-and-fixtures';
  await page.goto(`${config.origin}/library`);
  await page.waitForFunction(
    () =>
      location.pathname === '/login' ||
      !!document.querySelector('[data-testid="library-list"]'),
  );
  if (new URL(await page.url()).pathname === '/login')
    await signInToLibrary(page, config, report);
  savedTheme = await page.evaluate(() => localStorage.getItem('theme'));
  await page.evaluate(() => localStorage.setItem('theme', 'system'));
  await page.reload();
  await page.waitForSelector('[data-testid="library-list"]');
  savedClipboard = await saveClipboard();
  errorScript = await installBrowserErrors(page);
  [savedSite] = await sql(
    'SELECT public_url,time_zone FROM site_settings WHERE id=1',
  );
  if (representative) {
    await list();
    assert.equal(
      (await api('/api/shares')).total,
      0,
      'No unrelated shares in the disposable owner fixture',
    );
    await page.waitForSelector('[data-testid="shares-empty"]');
    await layouts('list-empty');
  }
  await seed();

  // The default run executes all three groups; --only narrows reruns without
  // changing the full plan or forwarding a generic phase into other suites.
  if (representative) {
    report.stage = 'settings-presentation-feedback';
    await settingsPresentation();
    report.stage = 'list-and-settings-layouts';
    await list();
    const listRow = await visibleShareRow(mainId);
    const row = await page.evaluate((selector) => {
      const node = document.querySelector(selector);
      return {
        text: node.textContent,
        image: node.querySelector('img')?.getAttribute('src'),
      };
    }, listRow);
    assert.match(row.text, /1.*公开/);
    assert.ok(
      row.image?.includes('/i/issue191-public'),
      'List uses the actual public cover thumbnail',
    );
    await layouts('list');
    await page.click(
      `${await visibleShareRow(mainId)} a[href="${settingsPath()}"]`,
    );
    await page.waitForURL(`${config.origin}${settingsPath()}`);
    await page.waitForSelector('[data-testid="share-address"]');
    await layouts('settings');
    await accordion('访问密码');
    await page.fill('#share-password', '保留的输入');
    await layouts('password', [390, 1440]);
    await assertPasswordRow();
    await page.focus(button('显示密码'));
    await page.keyboard.press('Enter');
    assert.equal(
      await page.evaluate(() => document.querySelector('#share-password').type),
      'text',
    );
    assert.equal(
      await page.evaluate(
        () => document.querySelector('#share-password').value,
      ),
      '保留的输入',
    );
    await page.click(button('隐藏密码'));
    await page.click(button('重新生成'));
    await page.waitForSelector('[data-testid="share-dialog"]');
    await layouts('rotate-confirm', [390, 1440]);
    await resizeViewport(page, 360, 400);
    const short = await readGeometry(page);
    assertGeometry(short, 'rotate-short');
    await shot('rotate-short');
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-testid="share-dialog"]', {
      state: 'hidden',
    });
    await page.waitForFunction(
      () => document.activeElement?.textContent.trim() === '重新生成',
    );
    report.checks.push(
      'Responsive list/settings, real public count/cover, both themes, password icon geometry, keyboard reveal, short dialog and Escape focus restoration.',
    );
    report.stage = 'representative-notice-above-fixed-footer';
    await settings();
    await page.cdp('Browser.setPermission', {
      permission: { name: 'clipboard-write' },
      setting: 'granted',
      origin: config.origin,
    });
    report.copyNoticeReturn = [];
    for (const [theme, width] of [
      ['light', 1440],
      ['dark', 390],
    ]) {
      await setTheme(page, theme);
      await resizeViewport(page, width);
      await page.click(button('复制分享地址'));
      await toast('已复制');
      assert.equal(
        (await run('pbpaste', [], { encoding: 'utf8' })).stdout,
        (await current()).url,
      );
      const state = await page.evaluate(() => {
        const back = document.querySelector(
          'button[aria-label="返回分享管理"]',
        );
        const rect = back.getBoundingClientRect();
        const hit = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        );
        return {
          unobstructed: hit === back || back.contains(hit),
          toastTitles: [
            ...document.querySelectorAll('[data-slot="toast-title"]'),
          ].map((node) => node.textContent),
        };
      });
      assert.equal(state.unobstructed, true);
      assert.ok(state.toastTitles.includes('分享地址已复制'));
      await shot(`copy-toast-${theme}-${width}`);
      report.copyNoticeReturn.push({ theme, width, ...state });
      await page.click(button('返回分享管理'));
      await page.waitForURL(`${config.origin}/shares`);
      await settings();
    }
    report.checks.push(
      'Real native copy notice stays visible above the fixed footer at light desktop and dark mobile; each unobstructed return action is actually clicked and reaches the management list.',
    );
  }

  if (behavior) {
    report.stage = 'native-copy-and-manual-fallback';
    const longRoot = new URL(savedSite.public_url);
    longRoot.hostname = `${Array(4).fill('family-photos').join('-')}.photography.${Array(7).fill('archive').join('-')}.localhost`;
    const longPublicUrl = longRoot.origin;
    await sql(
      `UPDATE site_settings SET public_url='${longPublicUrl}' WHERE id=1`,
    );
    await settings();
    await layouts('long-address', [390, 1440]);
    await setTheme(page, 'light');
    await resizeViewport(page, 390);
    await page.cdp('Browser.setPermission', {
      permission: { name: 'clipboard-write' },
      setting: 'granted',
      origin: config.origin,
    });
    await page.evaluate(() => {
      const native = navigator.clipboard.writeText.bind(navigator.clipboard);
      window.__sharingNativeWrite = native;
      window.__sharingCopies = [];
      navigator.clipboard.writeText = async (text) => {
        window.__sharingCopies.push(text);
        await native(text);
      };
    });
    const address = (await current()).url;
    assert.ok(address.startsWith(longPublicUrl));
    assert.ok(address.length > 180, 'Real long root-domain address is used');
    await page.focus(button('复制分享地址'));
    const copyBefore = await page.evaluate(() => ({
      url: location.href,
      scroll: document.querySelector('main').scrollTop,
    }));
    await page.keyboard.press('Enter');
    await toast('已复制');
    await shot('copy-toast-light-390');
    assert.deepEqual(await page.evaluate(() => window.__sharingCopies), [
      address,
    ]);
    assert.equal(
      (await run('pbpaste', [], { encoding: 'utf8' })).stdout,
      address,
      'Real native Clipboard contains the current complete share URL',
    );
    assert.deepEqual(
      await page.evaluate(() => ({
        url: location.href,
        scroll: document.querySelector('main').scrollTop,
      })),
      copyBefore,
    );
    assert.equal(
      await page.evaluate(
        () => !!document.querySelector('[data-testid="share-copy-manual"]'),
      ),
      false,
    );
    await page.cdp('Browser.setPermission', {
      permission: { name: 'clipboard-write' },
      setting: 'denied',
      origin: config.origin,
    });
    await page.click(button('复制分享地址'));
    await page.waitForSelector('[data-testid="share-copy-manual"]');
    await page.click(button('选中完整地址'));
    assert.deepEqual(
      await page.evaluate(() => {
        const node = document.querySelector(
          '[data-testid="share-copy-manual"] textarea',
        );
        return {
          value: node.value,
          focused: document.activeElement === node,
          selected:
            node.selectionStart === 0 &&
            node.selectionEnd === node.value.length,
        };
      }),
      { value: address, focused: true, selected: true },
    );
    const manualMarker = 'Issue 191 manual copy sentinel';
    await run('osascript', ['-e', `set the clipboard to "${manualMarker}"`]);
    assert.equal(
      (await run('pbpaste', [], { encoding: 'utf8' })).stdout,
      manualMarker,
      'Manual copy starts from a distinct native clipboard value',
    );
    await page.keyboard.press('ControlOrMeta+c');
    assert.equal(
      (await run('pbpaste', [], { encoding: 'utf8' })).stdout,
      address,
      'Manual keyboard copy preserves the complete address',
    );
    await manualLayouts();
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-testid="share-copy-manual"]', {
      state: 'hidden',
    });
    await page.waitForFunction(
      () =>
        document.activeElement?.getAttribute('aria-label') === '复制分享地址',
    );
    await page.cdp('Browser.setPermission', {
      permission: { name: 'clipboard-write' },
      setting: 'granted',
      origin: config.origin,
    });
    report.checks.push(
      'Real long current-root address wraps without truncation; native Clipboard success preserves route/scroll; denied permission exposes full selectable manual text, copies with native keyboard and returns focus on Escape; mobile completion hit tests and actual clicks are recorded separately.',
    );
    await sql(
      `UPDATE site_settings SET public_url='${savedSite.public_url.replaceAll("'", "''")}' WHERE id=1`,
    );

    report.stage = 'independent-display-and-password';
    await settings();
    await accordion('访问密码');
    await page.fill('#share-password', ' unsaved 密码 ');
    await assertDisplaySaved();
    await intercept({ method: 'PATCH' });
    await page.click(choice('瀑布流'));
    await layouts('display-unsaved', [390, 1440], '保存展示');
    await assertPasswordRow();
    await page.click(button('保存展示'));
    await toast('展示');
    assert.deepEqual(
      (await traffic())
        .filter((entry) => entry.method === 'PATCH')
        .map((entry) => entry.body),
      [{ layout: 'masonry' }],
    );
    assert.equal((await current()).hasPassword, false);
    assert.equal(
      await page.evaluate(
        () => document.querySelector('#share-password').value,
      ),
      ' unsaved 密码 ',
    );
    await restore();
    // Another owner client's actual PATCH changes a field after this page loaded.
    // This stale page then saves only its password; neither operation overwrites
    // the other field with the initial snapshot.
    await api(shareApi(), 'PATCH', { showName: true });
    await intercept({ method: 'PATCH', mode: 'hold' });
    await page.click(button('保存密码'));
    await page.waitForFunction(
      () => typeof window.__sharingRelease === 'function',
    );
    await page.keyboard.press('Enter');
    assert.equal(
      (await traffic()).filter((entry) => entry.method === 'PATCH').length,
      1,
    );
    await page.evaluate(() => window.__sharingRelease());
    await toast('密码');
    const passwordWrites = (await traffic()).filter(
      (entry) => entry.method === 'PATCH',
    );
    assert.deepEqual(
      passwordWrites.map((entry) => entry.body),
      [{ password: { action: 'set', value: ' unsaved 密码 ' } }],
    );
    const saved = await current();
    assert.equal(saved.hasPassword, true);
    assert.equal(saved.layout, 'masonry');
    assert.equal(saved.showName, true);
    await restore();
    report.checks.push(
      'Independent display PATCH omits unsaved password; held password PATCH submits once, preserves spaces and another client’s showName change.',
    );

    report.stage = 'two-real-tabs-save-independent-display-fields';
    peer = await task.newPage();
    await installBrowserErrors(peer);
    await peer.goto(`${config.origin}${settingsPath()}`);
    await peer.waitForSelector('[data-testid="share-address"]');
    await page.click(choice('网格'));
    await peer.click(
      '[data-slot="switch-content"]:has(input[aria-label="显示图片名称"])',
    );
    await intercept({ method: 'PATCH' }, peer);
    await peer.click(button('保存展示'));
    await toast('展示已保存', peer);
    assert.deepEqual(
      (await traffic(peer))
        .filter((entry) => entry.method === 'PATCH')
        .map((entry) => entry.body),
      [{ showName: false }],
    );
    await intercept({ method: 'PATCH' });
    await page.click(button('保存展示'));
    await toast('展示已保存');
    assert.deepEqual(
      (await traffic())
        .filter((entry) => entry.method === 'PATCH')
        .map((entry) => entry.body),
      [{ layout: 'grid' }],
    );
    const concurrent = await current();
    assert.equal(concurrent.showName, false);
    assert.equal(concurrent.layout, 'grid');
    assert.equal(concurrent.token, saved.token);
    assert.equal(concurrent.hasPassword, true);
    await restore();
    await restore(peer);
    report.peerErrors = await assertNoBrowserErrors(peer);
    await peer.close();
    peer = undefined;
    report.checks.push(
      'Two real owner browser tabs edit layout and showName from the same initial record; both exact partial PATCHes survive sequential completion without stale-field overwrite.',
    );

    report.stage = 'clear-password-explicit-confirmation';
    await page.fill('#share-password', '未提交的替换密码');
    await page.click(button('清除密码'));
    await page.waitForSelector('[data-testid="share-dialog"]');
    await page.keyboard.press('Escape');
    assert.equal(
      (await current()).hasPassword,
      true,
      'Cancelling never clears the password',
    );
    await page.click(button('清除密码'));
    await page.waitForSelector('[data-testid="share-dialog"]');
    await intercept({ method: 'PATCH' });
    await page.click(
      '[data-testid="share-dialog"] button:has-text("清除密码")',
    );
    await toast('密码已清除');
    assert.deepEqual(
      (await traffic())
        .filter((entry) => entry.method === 'PATCH')
        .map((entry) => entry.body),
      [{ password: { action: 'clear' } }],
    );
    assert.equal((await current()).hasPassword, false);
    assert.equal((await current()).token, saved.token);
    assert.equal(
      await page.evaluate(
        () => document.querySelector('#share-password').value,
      ),
      '',
      'Confirmed password clear discards the replacement draft',
    );
    await restore();
    await page.click(button('返回分享管理'));
    await page.waitForSelector('[data-testid="shares-screen"]');
    report.checks.push(
      'Password clear is a separate confirmed PATCH; cancel keeps protection, success clears only the password and retains the URL.',
    );

    report.stage = 'calendar-future-expiry-and-site-timezone';
    await sql("UPDATE site_settings SET time_zone='Asia/Shanghai' WHERE id=1");
    await settings();
    await accordion('有效期');
    await page.click(choice('指定时间'));
    await calendarLayouts();
    await resizeViewport(page, 360, 640);
    await page.click('button[aria-label="打开日历"]');
    await page.waitForSelector('[data-slot="calendar"]');
    await page.click('button[aria-label="下个月"]');
    await page.waitForFunction(() => {
      const days = [
        ...document.querySelectorAll('[data-slot="calendar-cell"]'),
      ].filter((node) => !node.hasAttribute('data-outside-month'));
      return (
        days.length >= 28 &&
        days.every(
          (node) =>
            node.getBoundingClientRect().width >= 44 &&
            node.getBoundingClientRect().height >= 44,
        )
      );
    });
    await shot('future-calendar-360-short');
    await page.click(
      '[data-slot="calendar-cell"]:not([data-outside-month]) >> nth=0',
    );
    await page.waitForSelector('[data-slot="calendar"]', { state: 'hidden' });
    await assertDisplaySaved();
    await layouts('expiry-specified', [390, 1440]);
    const entered = await page.evaluate(() =>
      Object.fromEntries(
        [
          ...document.querySelectorAll(
            '[data-slot="date-input-group-input"] [data-type]',
          ),
        ].map((node) => [
          node.getAttribute('data-type'),
          Number(node.getAttribute('aria-valuenow') ?? node.textContent),
        ]),
      ),
    );
    for (const part of ['year', 'month', 'day', 'hour', 'minute'])
      assert.ok(Number.isInteger(entered[part]), `Actual date segment ${part}`);
    await intercept({ method: 'PATCH' });
    await page.click(button('保存有效期'));
    await toast('有效期已保存');
    const dated = await current();
    assert.ok(
      new Date(dated.expiresAt).getTime() > Date.now(),
      'Selected real calendar deadline is in the future',
    );
    const expectedUtc = new Date(
      Date.UTC(
        entered.year,
        entered.month - 1,
        entered.day,
        entered.hour - 8,
        entered.minute,
      ),
    )
      .toISOString()
      .slice(0, 16);
    assert.equal(
      dated.expiresAt.slice(0, 16),
      expectedUtc,
      'Actual Asia/Shanghai calendar input saves the matching UTC minute',
    );
    const expiryWrites = (await traffic()).filter(
      (entry) => entry.method === 'PATCH',
    );
    assert.equal(expiryWrites.length, 1);
    assert.deepEqual(Object.keys(expiryWrites[0].body), ['expiresAt']);
    await restore();
    await sql("UPDATE site_settings SET time_zone='UTC' WHERE id=1");
    await settings();
    assert.equal(
      (await current()).expiresAt,
      dated.expiresAt,
      'Changing site timezone never moves the stored deadline',
    );
    await accordion('有效期');
    const utcText = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZoneName: 'shortOffset',
    }).format(new Date(dated.expiresAt));
    assert.ok(
      await page.evaluate(
        (text) => document.querySelector('main').textContent.includes(text),
        utcText,
      ),
      'Reloaded owner UI shows the same absolute deadline in the new site timezone',
    );
    await shot('expiry-timezone-utc');
    await sql(
      `UPDATE site_settings SET time_zone='${savedSite.time_zone.replaceAll("'", "''")}' WHERE id=1`,
    );
    report.checks.push(
      'Real future calendar selection is reachable at 360×640 with 44px day targets, saves only expiresAt in UTC, and a site timezone fixture change updates display without moving that ISO instant.',
    );

    report.stage = 'expired-restore-is-one-patch';
    const beforeRestore = await current();
    await sql(
      `UPDATE album_shares SET enabled=0,expires_at=${Date.now() - 1000} WHERE album_id='${mainId}'`,
    );
    await settings();
    await page.click(
      '[data-slot="switch-content"]:has(input[aria-label="启用分享"])',
    );
    await page.waitForSelector('[data-testid="share-dialog"]');
    assert.match(
      await page.evaluate(
        () =>
          document.querySelector('[data-testid="share-dialog"]').textContent,
      ),
      /过期/,
    );
    await page.click(`[data-testid="share-dialog"] ${choice('不过期')}`);
    await layouts('expired-enable', [390, 1440]);
    await intercept({ method: 'PATCH' });
    await page.click(button('启用分享'));
    await toast('已启用');
    assert.deepEqual(
      (await traffic())
        .filter((entry) => entry.method === 'PATCH')
        .map((entry) => entry.body),
      [{ enabled: true, expiresAt: null }],
    );
    const restored = await current();
    assert.equal(restored.enabled, true);
    assert.equal(restored.expiresAt, null);
    assert.equal(restored.token, beforeRestore.token);
    assert.equal(restored.hasPassword, beforeRestore.hasPassword);
    await restore();
    report.checks.push(
      'Disabled and expired sharing requires a deadline choice; selecting never expires restores the original URL in one PATCH without overwriting password/display.',
    );

    report.stage = 'album-entry-and-create-current-record';
    await page.goto(`${config.origin}/albums/${unsharedId}`);
    await page.waitForSelector(button('更多'));
    await page.click(button('更多'));
    await page.waitForSelector('loc=role:link[name="分享设置"]');
    await page.click('loc=role:link[name="分享设置"]');
    await page.waitForURL(
      `${config.origin}${settingsPath(unsharedId)}?from=album`,
    );
    await page.waitForSelector('[data-testid="share-create"]');
    await page.click(button('创建并启用分享'));
    await page.waitForSelector('[data-testid="share-dialog"]');
    await layouts('create', [390, 1440]);
    const tooLongPassword = 'x'.repeat(129);
    await intercept({ method: 'POST', path: shareApi(unsharedId) });
    await page.fill('#share-password', tooLongPassword);
    await page.click(
      '[data-testid="share-dialog"] button:has-text("创建并启用")',
    );
    await feedback('密码需为 1–128 个字符');
    assert.equal(
      (await traffic()).filter((entry) => entry.method === 'POST').length,
      0,
      '129 code-point create password is rejected before POST',
    );
    assert.equal(
      await page.evaluate(
        () => document.querySelector('#share-password').value,
      ),
      tooLongPassword,
      'Rejected create password remains complete and editable',
    );
    await layouts('create-password-error', [390, 1440]);
    report.creationErrorField = await page.evaluate(() => {
      const input = document.querySelector('#share-password');
      const error = [
        ...document.querySelectorAll(
          '[data-testid="share-dialog"] [role="alert"],[data-testid="share-dialog"] [data-slot="field-error"]',
        ),
      ].find((node) => node.textContent.includes('密码需为 1–128 个字符'));
      return {
        invalid: input.getAttribute('aria-invalid') === 'true',
        adjacent: input.closest('[data-slot="textfield"]').contains(error),
        borderColor: getComputedStyle(
          input.closest('[data-slot="input-group"]'),
        ).borderColor,
        outlineColor: getComputedStyle(
          input.closest('[data-slot="input-group"]'),
        ).outlineColor,
        outlineWidth: getComputedStyle(
          input.closest('[data-slot="input-group"]'),
        ).outlineWidth,
        boxShadow: getComputedStyle(input.closest('[data-slot="input-group"]'))
          .boxShadow,
        errorColor: getComputedStyle(error).color,
      };
    });
    await restore();
    const unicodePassword = '😀'.repeat(65);
    await page.fill('#share-password', unicodePassword);
    assert.equal(
      await page.evaluate(
        () => document.querySelector('#share-password').value,
      ),
      unicodePassword,
      '65 Unicode code points remain allowed despite exceeding 128 UTF-16 code units',
    );
    // Another owner client creates the record while this page still edits its
    // initial creation form. The production POST returns that actual record.
    const existing = (
      await api(shareApi(unsharedId), 'POST', {
        layout: 'masonry',
        showName: true,
      })
    ).share;
    await page.click(
      '[data-testid="share-dialog"] button:has-text("创建并启用")',
    );
    await page.waitForSelector('[data-testid="share-address"]');
    await toast('已读取分享设置');
    const created = await current(unsharedId);
    assert.equal(created.id, existing.id);
    assert.equal(created.token, existing.token);
    assert.equal(created.layout, 'masonry');
    assert.equal(created.showName, true);
    assert.equal(created.hasPassword, existing.hasPassword);
    assert.equal(
      (
        await sql(
          `SELECT count(*) AS n FROM album_shares WHERE album_id='${unsharedId}'`,
        )
      )[0].n,
      1,
    );
    const returnActionState = () => {
      const button = document.querySelector('button[aria-label="返回相册"]');
      const rect = button.getBoundingClientRect();
      const hit = document.elementFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      );
      return {
        unobstructed: hit === button || button.contains(hit),
        hitSlot: hit?.getAttribute('data-slot'),
        hitTag: hit?.tagName,
        modalCount: document.querySelectorAll('[data-slot="modal-backdrop"]')
          .length,
        notices: [...document.querySelectorAll('[data-slot="toast"]')].map(
          (node) => ({
            entering: node.getAttribute('data-entering'),
            transform: getComputedStyle(node).transform,
            top: node.getBoundingClientRect().top,
            bottom: node.getBoundingClientRect().bottom,
          }),
        ),
        buttonTop: rect.top,
        toastTitles: [
          ...document.querySelectorAll('[data-slot="toast-title"]'),
        ].map((node) => node.textContent),
      };
    };
    report.returnNoticeEntrance = await page.evaluate(returnActionState);
    await page.waitForSelector('[data-slot="modal-backdrop"]', {
      state: 'hidden',
    });
    await page.waitForFunction(() => {
      const title = [
        ...document.querySelectorAll('[data-slot="toast-title"]'),
      ].find((node) => node.textContent === '已读取分享设置');
      const notice = title?.closest('[data-slot="toast"]');
      return (
        notice &&
        !notice.hasAttribute('data-entering') &&
        notice
          .getAnimations()
          .every((animation) => animation.playState !== 'running')
      );
    });
    report.returnDuringNotice = await page.evaluate(returnActionState);
    assert.ok(
      report.returnDuringNotice.toastTitles.includes('已读取分享设置'),
      'Return is checked while the actual success notice remains visible',
    );
    assert.equal(
      report.returnDuringNotice.unobstructed,
      true,
      'Success notice does not obstruct the header return action',
    );
    await shot('created-return-with-notice-dark-1440');
    await page.click(button('返回相册'));
    await page.waitForURL(`${config.origin}/albums/${unsharedId}`);
    report.checks.push(
      'Real album menu enters sharing with return context; concurrent creation returns the existing record, preserves its actual settings and never claims submitted defaults replaced them.',
    );
    report.checks.push(
      'Create rejects 129 ASCII code points without POST and retains the input; 65 emoji code points remain editable and submit normally without native UTF-16 truncation.',
    );
  }

  if (recovery) {
    report.stage = 'password-codepoint-limit-field-error';
    await settings();
    await accordion('访问密码');
    const tooLongPassword = 'x'.repeat(129);
    await page.fill('#share-password', tooLongPassword);
    await intercept({ method: 'PATCH' });
    await page.click(button('保存密码'));
    await feedback('密码需为 1–128 个字符');
    assert.equal(
      (await traffic()).filter((entry) => entry.method === 'PATCH').length,
      0,
      '129 code-point password is rejected before PATCH',
    );
    assert.equal(
      await page.evaluate(
        () => document.querySelector('#share-password').value,
      ),
      tooLongPassword,
      'Local password validation preserves the complete input',
    );
    await layouts('password-limit-error', [390, 1440]);
    await assertPasswordRow();
    report.passwordErrorField = await page.evaluate(() => {
      const input = document.querySelector('#share-password');
      const error = [
        ...document.querySelectorAll(
          '[role="alert"],[data-slot="field-error"]',
        ),
      ].find((node) => node.textContent.includes('密码需为 1–128 个字符'));
      return {
        invalid: input.getAttribute('aria-invalid') === 'true',
        adjacent: input.closest('[data-slot="textfield"]').contains(error),
        borderColor: getComputedStyle(
          input.closest('[data-slot="input-group"]'),
        ).borderColor,
        outlineColor: getComputedStyle(
          input.closest('[data-slot="input-group"]'),
        ).outlineColor,
        outlineWidth: getComputedStyle(
          input.closest('[data-slot="input-group"]'),
        ).outlineWidth,
        boxShadow: getComputedStyle(input.closest('[data-slot="input-group"]'))
          .boxShadow,
        errorColor: getComputedStyle(error).color,
      };
    });
    await restore();
    report.checks.push(
      '129 ASCII password code points are rejected before PATCH and remain editable for correction.',
    );

    report.stage = 'failed-display-retains-selection';
    await settings();
    const displayBefore = await current();
    const attemptedLayout =
      displayBefore.layout === 'grid' ? 'masonry' : 'grid';
    await page.click(choice(attemptedLayout === 'masonry' ? '瀑布流' : '网格'));
    await intercept({ method: 'PATCH', mode: 'reject' });
    await page.click(button('保存展示'));
    await feedback('保存失败|拒绝当前输入');
    assert.equal((await current()).layout, displayBefore.layout);
    assert.equal(
      await page.evaluate(
        (label) =>
          [...document.querySelectorAll('[data-slot="toggle-button"]')]
            .find((node) => node.textContent.includes(label))
            ?.getAttribute('aria-checked'),
        attemptedLayout === 'masonry' ? '瀑布流' : '网格',
      ),
      'true',
      'Rejected display save retains the selected draft layout',
    );
    assert.deepEqual(
      (await traffic())
        .filter((entry) => entry.method === 'PATCH')
        .map((entry) => entry.body),
      [{ layout: attemptedLayout }],
    );
    await layouts('display-failed', [390, 1440], '保存展示');
    await restore();
    report.checks.push(
      'Rejected display PATCH leaves the saved layout unchanged and retains the visible draft selection for explicit retry.',
    );

    report.stage = 'failed-password-retains-input';
    await settings();
    await accordion('访问密码');
    await page.fill('#share-password', '失败时保留');
    await intercept({ method: 'PATCH', mode: 'reject' });
    await page.click(button('保存密码'));
    await feedback('保存失败|拒绝当前输入');
    assert.equal(
      await page.evaluate(
        () => document.querySelector('#share-password').value,
      ),
      '失败时保留',
    );
    await restore();
    report.stage = 'unknown-password-never-proves-value';
    await intercept({ method: 'PATCH', mode: 'lost', readMode: 'hold' });
    await page.click(button('保存密码'));
    await page.waitForFunction(
      () => typeof window.__sharingReadRelease === 'function',
    );
    await feedback('核对');
    const blockedWrites = await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .filter((node) =>
          ['保存密码', '保存有效期', '保存展示', '重新生成'].includes(
            node.textContent.trim(),
          ),
        )
        .map((node) => ({
          name: node.textContent.trim(),
          disabled: node.disabled,
        })),
    );
    assert.ok(blockedWrites.length >= 3, 'Actual write controls are present');
    assert.ok(
      blockedWrites.every((node) => node.disabled),
      'Result checking blocks conflicting writes',
    );
    await layouts('password-checking', [390, 1440]);
    await page.evaluate(() => window.__sharingReadRelease());
    await feedback('新密码无法确认');
    assert.equal(
      (await traffic()).filter((entry) => entry.method === 'PATCH').length,
      1,
    );
    assert.ok(
      (await traffic()).some(
        (entry) =>
          entry.method === 'GET' && entry.response?.share?.hasPassword === true,
      ),
    );
    assert.equal(
      await page.evaluate(
        () => document.querySelector('#share-password').value,
      ),
      '失败时保留',
    );
    await layouts('password-unconfirmed', [390, 1440]);
    await restore();
    report.checks.push(
      'Known HTTP rejection retains input; a real committed password PATCH with lost response triggers GET, never claims hasPassword proves the new value and never resends automatically.',
    );

    report.stage = 'password-clear-lost-response-confirms-draft-reset';
    await settings();
    await accordion('访问密码');
    await page.fill('#share-password', '未提交的替换密码');
    const beforeClear = await current();
    assert.equal(beforeClear.hasPassword, true);
    await intercept({ method: 'PATCH', mode: 'lost' });
    await page.click(button('清除密码'));
    await page.waitForSelector('[data-testid="share-dialog"]');
    await page.click(
      '[data-testid="share-dialog"] button:has-text("清除密码")',
    );
    await toast('核对当前设置');
    const clearTraffic = await traffic();
    assert.deepEqual(
      clearTraffic
        .filter((entry) => entry.method === 'PATCH')
        .map((entry) => entry.body),
      [{ password: { action: 'clear' } }],
      'A committed clear with lost response is never automatically resent',
    );
    assert.ok(
      clearTraffic.some(
        (entry) =>
          entry.method === 'GET' &&
          entry.response?.share?.hasPassword === false,
      ),
      'Readback confirms that the password was cleared',
    );
    assert.equal(
      await page.evaluate(
        () => document.querySelector('#share-password').value,
      ),
      '',
      'Read-confirmed password clear discards the same draft as direct success',
    );
    const afterClear = await current();
    assert.equal(afterClear.hasPassword, false);
    for (const key of ['token', 'expiresAt', 'layout', 'showName'])
      assert.equal(afterClear[key], beforeClear[key]);
    await restore();
    await page.click(button('返回分享管理'));
    await page.waitForSelector('[data-testid="shares-screen"]');
    report.checks.push(
      'A real committed password clear with lost response uses one PATCH and GET only; confirmation clears the replacement draft and returns without a discard prompt, preserving all other settings.',
    );

    report.stage = 'rotate-response-lost-read-retry';
    await settings();
    const beforeRotate = await current();
    const pasteboardBeforeRotate = (
      await run('pbpaste', [], { encoding: 'utf8' })
    ).stdout;
    await page.click(button('重新生成'));
    await page.waitForSelector('[data-testid="share-dialog"]');
    await intercept({
      method: 'POST',
      path: `${shareApi()}/rotate`,
      mode: 'lost',
      readMode: 'reject',
    });
    await page.click(button('重新生成地址'));
    await feedback('读取失败|尚未确认');
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector('button[aria-label="复制分享地址"]').disabled,
      ),
      true,
      'Unknown rotate cannot copy an address that may already be revoked',
    );
    assert.equal(
      (await run('pbpaste', [], { encoding: 'utf8' })).stdout,
      pasteboardBeforeRotate,
      'Unknown rotate and failed read never change the native clipboard',
    );
    assert.equal(
      await page.evaluate(() =>
        [
          ...document.querySelectorAll('[data-testid="share-feedback"] button'),
        ].some((node) => node.textContent.trim() === '结束核对'),
      ),
      false,
      'Unconfirmed rotation cannot release the revoked address by ending reconciliation',
    );
    assert.equal(
      (await traffic()).filter((entry) => entry.method === 'POST').length,
      1,
    );
    const afterRotate = (
      await sql(
        `SELECT token,enabled,layout,show_name,password_hash,expires_at FROM album_shares WHERE album_id='${mainId}'`,
      )
    )[0];
    assert.notEqual(
      afterRotate.token,
      beforeRotate.token,
      'The production rotate committed before transport loss',
    );
    assert.equal(afterRotate.layout, beforeRotate.layout);
    assert.equal(Boolean(afterRotate.show_name), beforeRotate.showName);
    assert.equal(Boolean(afterRotate.password_hash), beforeRotate.hasPassword);
    await layouts('rotate-read-failure', [390, 1440]);
    await restore();
    await intercept({ method: 'POST', path: `${shareApi()}/rotate` });
    await page.click(button('重新核对'));
    await toast('重新生成');
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector('button[aria-label="复制分享地址"]').disabled,
      ),
      false,
      'Confirmed current address can be copied again',
    );
    assert.equal(
      (await traffic()).filter((entry) => entry.method === 'POST').length,
      0,
      'Recovery only reads; no second rotate',
    );
    assert.ok((await traffic()).some((entry) => entry.method === 'GET'));
    assert.match(
      await page.evaluate(
        () =>
          document.querySelector('[data-testid="share-address"]').textContent,
      ),
      new RegExp(afterRotate.token),
    );
    await restore();
    report.checks.push(
      'Real rotate commits once before lost response; failed GET keeps uncertainty, explicit read retry finds the changed token without another POST and preserves the remaining configuration.',
    );

    report.stage = 'expired-restore-with-future-deadline';
    const beforeFutureRestore = await current();
    await sql(
      `UPDATE album_shares SET enabled=0,expires_at=${Date.now() - 1000} WHERE album_id='${mainId}'`,
    );
    await settings();
    await page.click(
      '[data-slot="switch-content"]:has(input[aria-label="启用分享"])',
    );
    await page.waitForSelector('[data-testid="share-dialog"]');
    await page.click(`[data-testid="share-dialog"] ${choice('指定时间')}`);
    await page.click(
      '[data-testid="share-dialog"] button[aria-label="打开日历"]',
    );
    await page.waitForSelector('[data-slot="calendar"]');
    await page.click('button[aria-label="下个月"]');
    await page.waitForFunction(
      () =>
        document.querySelectorAll(
          '[data-slot="calendar-cell"]:not([data-outside-month])',
        ).length >= 28,
    );
    await page.click(
      '[data-slot="calendar-cell"]:not([data-outside-month]) >> nth=0',
    );
    await page.waitForSelector('[data-slot="calendar"]', { state: 'hidden' });
    await layouts('expired-enable-future', [390, 1440]);
    await intercept({ method: 'PATCH' });
    await page.click(button('启用分享'));
    await toast('已启用');
    const futureWrites = (await traffic()).filter(
      (entry) => entry.method === 'PATCH',
    );
    assert.equal(futureWrites.length, 1);
    assert.deepEqual(Object.keys(futureWrites[0].body).sort(), [
      'enabled',
      'expiresAt',
    ]);
    assert.equal(futureWrites[0].body.enabled, true);
    assert.ok(Date.parse(futureWrites[0].body.expiresAt) > Date.now());
    const futureRestored = await current();
    assert.equal(futureRestored.enabled, true);
    assert.equal(futureRestored.state, 'enabled');
    assert.equal(futureRestored.expiresAt, futureWrites[0].body.expiresAt);
    for (const key of ['token', 'url', 'hasPassword', 'layout', 'showName'])
      assert.equal(
        futureRestored[key],
        beforeFutureRestore[key],
        `Future restore preserves ${key}`,
      );
    await restore();
    report.checks.push(
      'Expired and disabled share selects a real future calendar deadline inside its restore dialog and enables through exactly one PATCH containing enabled and expiresAt, retaining token, protection and visitor display.',
    );

    report.stage = 'list-read-error-and-retry';
    await list();
    await intercept({ method: 'GET', path: '/api/shares', mode: 'reject' });
    await page.fill('input[aria-label="搜索分享相册"]', '分享验证');
    await page.press('input[aria-label="搜索分享相册"]', 'Enter');
    await page.waitForSelector('[data-testid="shares-error"]');
    assert.equal(
      await page.evaluate(
        () => !!document.querySelector('[data-testid="shares-empty"]'),
      ),
      false,
      'Read failure is not an empty list',
    );
    await layouts('list-error', [390, 1440]);
    await restore();
    await page.click(button('重新加载'));
    await visibleShareRow(mainId);
    await page.fill('input[aria-label="搜索分享相册"]', 'issue191不存在');
    await page.press('input[aria-label="搜索分享相册"]', 'Enter');
    await page.waitForSelector('[data-testid="shares-empty"]');
    assert.equal(
      await page.evaluate(
        () => document.querySelector('input[aria-label="搜索分享相册"]').value,
      ),
      'issue191不存在',
    );
    const queryResult = await api(
      '/api/shares?q=issue191不存在&page=1&pageSize=40',
    );
    assert.equal(queryResult.total, 0);
    await layouts('list-no-results', [390, 1440]);
    report.checks.push(
      'List HTTP read failure renders retry rather than empty success; retry restores real rows, search retains the query input and has actual zero results.',
    );

    report.stage = 'deleted-share-dialog-feedback-focus';
    await settings();
    await page.click(button('重新生成'));
    await page.waitForSelector('[data-testid="share-dialog"]');
    await sql(`DELETE FROM album_shares WHERE album_id='${mainId}'`);
    await page.click(button('重新生成地址'));
    await feedback('相册或分享已不存在');
    await page.waitForSelector('[data-testid="share-dialog"]', {
      state: 'hidden',
    });
    await page.waitForFunction(
      () =>
        document.activeElement?.getAttribute('data-testid') ===
        'share-feedback',
    );
    assert.ok(
      await page.evaluate(() => {
        const rect = document.activeElement.getBoundingClientRect();
        const main = document.querySelector('main').getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom > main.top &&
          rect.top < main.bottom
        );
      }),
      '404 feedback remains visible and focusable after closing the mutation dialog',
    );
    await shot('deleted-share-404-focus');
    report.checks.push(
      'Real share deletion during rotate confirmation produces 404, closes the dialog and focuses visible permanent feedback rather than a detached or disabled opener.',
    );

    report.stage = 'expired-owner-session-login-return';
    await api(shareApi(), 'POST', {});
    await settings();
    await accordion('访问密码');
    await page.fill('#share-password', '会话失效后不得提交');
    await sql('DELETE FROM session');
    await page.click(button('保存密码'));
    await page.waitForSelector('#email');
    const expiredLogin = new URL(await page.url());
    assert.equal(expiredLogin.pathname, '/login');
    assert.equal(expiredLogin.searchParams.get('reason'), 'expired');
    assert.equal(expiredLogin.searchParams.get('returnTo'), settingsPath());
    assert.equal(
      await page.evaluate(
        () =>
          !!document.querySelector(
            '[data-testid="share-address"],#share-password',
          ),
      ),
      false,
      '401 removes private share state from the visible document',
    );
    await page.fill('#email', config.credentials.email);
    await page.fill('#password', config.credentials.password);
    await page.click(button('登录'));
    await page.waitForURL(`${config.origin}${settingsPath()}`);
    await page.waitForSelector('[data-testid="share-address"]');
    assert.equal(
      (await current()).hasPassword,
      false,
      'Unauthorized password request made no write',
    );
    assert.equal(
      await page.evaluate(
        () => document.querySelector('#share-password')?.value ?? '',
      ),
      '',
      'New owner session never restores the rejected private password input',
    );
    report.checks.push(
      'Real session revocation causes management PATCH 401, redirects with exact local returnTo, clears visible private state and returns after actual owner login without applying the rejected mutation.',
    );

    report.stage = 'past-expiry-rejected-with-field-error';
    await accordion('有效期');
    await page.click(choice('指定时间'));
    await page.click('button[aria-label="打开日历"]');
    await page.waitForSelector('[data-slot="calendar"]');
    await page.click('button[aria-label="上个月"]');
    await page.click(
      '[data-slot="calendar-cell"]:not([data-outside-month]) >> nth=0',
    );
    await page.waitForSelector('[data-slot="calendar"]', { state: 'hidden' });
    const draftBeforeRejection = await page.evaluate(
      () =>
        document.querySelector('[data-slot="date-input-group-input"]')
          .textContent,
    );
    const expiryBeforeRejection = (await current()).expiresAt;
    await intercept({ method: 'PATCH' });
    await page.click(button('保存有效期'));
    await feedback('请选择晚于当前时间的截止时间');
    assert.equal(
      (await traffic()).filter((entry) => entry.method === 'PATCH').length,
      0,
      'Past calendar deadline is rejected before a network write',
    );
    assert.equal((await current()).expiresAt, expiryBeforeRejection);
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector('[data-slot="date-input-group-input"]')
            .textContent,
      ),
      draftBeforeRejection,
      'Rejected deadline leaves the real entered date segments intact',
    );
    await layouts('expiry-past-error', [390, 1440], '保存有效期');
    const expiryErrorField = await page.evaluate(() => {
      const group = document.querySelector('[data-slot="date-input-group"]');
      const picker = group.closest('[data-slot="date-picker"]');
      const error = [
        ...document.querySelectorAll(
          '[role="alert"],[data-slot="field-error"]',
        ),
      ].find((node) =>
        node.textContent.includes('请选择晚于当前时间的截止时间'),
      );
      return {
        invalid:
          picker?.getAttribute('aria-invalid') === 'true' ||
          Boolean(picker?.querySelector('[aria-invalid="true"]')),
        borderColor: getComputedStyle(group).borderColor,
        outlineColor: getComputedStyle(group).outlineColor,
        outlineWidth: getComputedStyle(group).outlineWidth,
        boxShadow: getComputedStyle(group).boxShadow,
        errorColor: getComputedStyle(error).color,
      };
    });
    report.expiryErrorField = expiryErrorField;
    await restore();
    report.checks.push(
      'Past deadline selected in the real calendar is rejected without PATCH, keeps its date segments and exposes adjacent error text, aria-invalid and the matching danger border.',
    );
    report.stage = 'rejected-never-expiring-deadline';
    await page.click(choice('不过期'));
    const beforeNever = await current();
    await intercept({ method: 'PATCH', mode: 'reject' });
    await page.click(button('保存有效期'));
    await feedback('拒绝当前输入');
    assert.deepEqual(
      (await traffic())
        .filter((entry) => entry.method === 'PATCH')
        .map((entry) => entry.body),
      [{ expiresAt: null }],
    );
    assert.deepEqual(
      await current(),
      beforeNever,
      'Rejected never-expiring save applies no field',
    );
    assert.equal(
      await page.evaluate(() =>
        [...document.querySelectorAll('[data-slot="toggle-button"]')]
          .find((node) => node.textContent.trim() === '不过期')
          .getAttribute('aria-checked'),
      ),
      'true',
    );
    assert.equal(
      await page.evaluate(
        () => !!document.querySelector('[data-slot="date-picker"]'),
      ),
      false,
    );
    await layouts('expiry-never-failed', [390, 1440], '保存有效期');
    await restore();
    report.checks.push(
      'Known HTTP rejection of never-expiring deadline keeps its selected mode, visibly explains the error without a DatePicker and applies no change.',
    );
  }

  // Preserve all functional results and both original error-state captures
  // before collecting independent field-style failures at the end of the suite.
  report.stage = 'field-error-visual-feedback';
  const fieldFailures = [];
  if (behavior) {
    assert.equal(report.manualCompletion.length, 2);
    for (const completion of report.manualCompletion)
      if (!completion.unobstructed || !completion.clicked)
        fieldFailures.push(
          `Manual completion is obstructed or cannot be clicked: ${completion.theme}/${completion.width}`,
        );
    assert.ok(report.creationErrorField, 'Create error field was inspected');
    if (!report.creationErrorField.invalid)
      fieldFailures.push('Create password does not expose aria-invalid');
    if (!report.creationErrorField.adjacent)
      fieldFailures.push('Create password error is outside its TextField');
    if (!hasDangerBoundary(report.creationErrorField))
      fieldFailures.push('Create password error has no matching danger border');
  }
  if (recovery) {
    assert.ok(report.passwordErrorField, 'Password error field was inspected');
    if (!report.passwordErrorField.invalid)
      fieldFailures.push('Password does not expose aria-invalid');
    if (!report.passwordErrorField.adjacent)
      fieldFailures.push('Password error is outside its TextField');
    if (!hasDangerBoundary(report.passwordErrorField))
      fieldFailures.push('Password error has no matching danger border');
    assert.ok(report.expiryErrorField, 'Past expiry field was inspected');
    if (!report.expiryErrorField.invalid)
      fieldFailures.push('Past expiry does not expose aria-invalid');
    if (!hasDangerBoundary(report.expiryErrorField))
      fieldFailures.push('Past expiry error has no matching danger border');
  }
  assert.deepEqual(
    fieldFailures,
    [],
    'Validation text, field border and accessibility agree',
  );
  report.errors = await assertNoBrowserErrors(page);
  report.stage = 'complete';
  report.status = 'passed';
} catch (error) {
  report.error = error.stack ?? String(error);
  if (/user has taken control|inactive|unassigned/i.test(String(error))) {
    report.stoppedForUserControl = true;
    throw error;
  }
  try {
    report.page = await page.snapshot();
    await page.screenshot({
      path: join(config.output, 'sharing-management-failure.png'),
    });
  } catch (snapshotError) {
    report.snapshotError = String(snapshotError);
  }
  throw error;
} finally {
  try {
    if (!report.stoppedForUserControl) {
      await restore();
      if (peer) {
        await restore(peer);
        await peer.close();
      }
      if (errorScript)
        await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
          identifier: errorScript,
        });
      await page.cdp('Browser.setPermission', {
        permission: { name: 'clipboard-write' },
        setting: 'prompt',
        origin: config.origin,
      });
      if (savedClipboard) {
        await restoreClipboard(savedClipboard);
        report.clipboardRestored = true;
      }
      if (savedTheme !== undefined) {
        await page.evaluate((theme) => {
          if (theme === null) localStorage.removeItem('theme');
          else localStorage.setItem('theme', theme);
        }, savedTheme);
        report.themeRestored = true;
      }
    }
    if (savedSite)
      await sql(
        `UPDATE site_settings SET public_url='${savedSite.public_url.replaceAll("'", "''")}',time_zone='${savedSite.time_zone.replaceAll("'", "''")}' WHERE id=1`,
      );
    await sql(
      "DELETE FROM albums WHERE id IN ('issue191-main','issue191-new')",
    );
    await sql("DELETE FROM media_versions WHERE image_id LIKE 'issue191-%'");
    await sql("DELETE FROM media_objects WHERE image_id LIKE 'issue191-%'");
    await sql("DELETE FROM media_images WHERE id LIKE 'issue191-%'");
    await sql("DELETE FROM storage_configs WHERE id='issue191-storage'");
    await rm(fixtureDirectory, { recursive: true, force: true });
  } catch (cleanupError) {
    report.cleanupError = cleanupError.stack ?? String(cleanupError);
    report.status = 'failed';
    throw cleanupError;
  } finally {
    report.finishedAt = new Date().toISOString();
    await writeFile(
      join(config.output, 'sharing-management.json'),
      `${JSON.stringify(report, null, 2)}\n`,
    );
  }
}
console.log({
  status: report.status,
  checks: report.checks.length,
  layouts: report.layouts.length,
  output: config.output,
});
