/* global taskSpace, config */
const assert = (await import('node:assert/strict')).default;
const { mkdir, readFile, rm, writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { identitySql } = await import(config.identitySessionScript);
const { signInToLibrary } = await import(
  new URL('./library-login.mjs', config.libraryDetailScript).href
);
const page = (await taskSpace(config.spaceId)).page('p1');
const sql = (statement) => identitySql(config, statement);
const button = (name) => `loc=role:button[name="${name}"]`;
const albumId = 'issue180-main';
const report = { status: 'failed', checks: [], layouts: [], screenshots: [] };
const preferenceKey = 'ariso:library-preferences:v1';
let savedPreference;
let directory;
const at = (id) => `/albums/${id}`;
async function shot(state) {
  const file = `album-cover-${state}.png`;
  await page.screenshot({ path: join(config.output, file) });
  report.screenshots.push(file);
}
async function resize(width, height = width >= 1200 ? 1080 : 844) {
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
  // LibraryGallery measures through ResizeObserver → animation frame → React.
  // Browser metrics alone can still expose the preceding viewport's positions.
  await page.waitForFunction(
    (width) =>
      [...document.querySelectorAll('[data-testid="library-gallery"]')]
        .filter((gallery) => gallery.getClientRects().length)
        .every((gallery) => {
          const columns = width >= 1200 ? 4 : width >= 768 ? 3 : 2;
          if (Number(gallery.dataset.columns) !== columns) return false;
          const rect = gallery.getBoundingClientRect();
          const gap = width >= 1200 ? 20 : 12;
          const cardWidth = (rect.width - gap * (columns - 1)) / columns;
          const cards = [
            ...gallery.querySelectorAll(':scope > [role="listitem"]'),
          ];
          return (
            cards.length > 0 &&
            cards.every((card) => {
              const bounds = card.getBoundingClientRect();
              return (
                Math.abs(bounds.width - cardWidth) < 1 &&
                bounds.left >= rect.left - 1 &&
                bounds.right <= rect.right + 1
              );
            })
          );
        }),
    width,
  );
}
async function searchEdges(theme, width) {
  const bounds = await page.evaluate(() => {
    const input = document.querySelector('input[aria-label="搜索图片名称"]');
    const group = input.closest('[data-slot="search-field-group"]');
    const inputRect = input.getBoundingClientRect();
    const groupRect = group.getBoundingClientRect();
    return {
      x: inputRect.x + inputRect.width / 2,
      top: groupRect.top,
      bottom: groupRect.bottom,
      inputHeight: inputRect.height,
      groupHeight: groupRect.height,
    };
  });
  assert.equal(
    bounds.inputHeight,
    bounds.groupHeight,
    'Search input fills its actual click area',
  );
  for (const y of [bounds.top + 0.5, bounds.bottom - 0.5]) {
    await page.evaluate(() =>
      document.querySelector('input[aria-label="搜索图片名称"]').blur(),
    );
    await page.mouse.click(bounds.x, y, { label: '验证搜索框边缘命中' });
    assert.equal(
      await page.evaluate(
        () =>
          document.activeElement ===
          document.querySelector('input[aria-label="搜索图片名称"]'),
      ),
      true,
      `${theme}/${width}: native click at search edge focuses the actual input`,
    );
  }
  report.checks.push({
    check: 'Search input upper/lower edges focus with native pointer events',
    theme,
    width,
    ...bounds,
  });
  await page.evaluate(() =>
    document.querySelector('input[aria-label="搜索图片名称"]').blur(),
  );
}
async function imagesPainted() {
  await page.waitForFunction(() => {
    function visible(node) {
      if (
        !node.getClientRects().length ||
        node.closest('[inert]') ||
        node.parentElement?.closest('[aria-hidden="true"]')
      )
        return false;
      for (let ancestor = node; ancestor; ancestor = ancestor.parentElement)
        if (getComputedStyle(ancestor).visibility === 'hidden') return false;
      const rect = node.getBoundingClientRect();
      const main = node.closest('main')?.getBoundingClientRect();
      return (
        rect.bottom > Math.max(0, main?.top ?? 0) &&
        rect.top < Math.min(innerHeight, main?.bottom ?? innerHeight) &&
        rect.right > Math.max(0, main?.left ?? 0) &&
        rect.left < Math.min(innerWidth, main?.right ?? innerWidth)
      );
    }
    return (
      [...document.querySelectorAll('img')]
        .filter(visible)
        .every((img) => img.complete && img.naturalWidth > 0) &&
      ![...document.querySelectorAll('.skeleton')].some(visible)
    );
  });
}
async function layouts(state, widths = [360, 390, 430, 768, 1440]) {
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
    for (const width of widths) {
      await resize(width);
      const geometry = await page.evaluate(() => ({
        width: innerWidth,
        overflow: document.documentElement.scrollWidth > innerWidth,
        mainOverflow: [...document.querySelectorAll('main')]
          .filter((node) => node.getClientRects().length)
          .some((node) => node.scrollWidth > node.clientWidth),
        albumCardOverlays: [
          ...document.querySelectorAll('[data-testid="library-card"]'),
        ]
          .filter((card) => card.getClientRects().length)
          .map((card) => ({
            imageId: card.dataset.imageId,
            background: getComputedStyle(card, '::after').backgroundColor,
          })),
        picker: (() => {
          const picker = document.querySelector(
            '[data-testid="album-cover-picker"]',
          );
          if (!picker?.getClientRects().length) return null;
          const grid = picker.querySelector('[aria-label="相册封面图片"]');
          const info = picker.querySelector(
            ':scope > [data-slot="alert-root"]',
          );
          return {
            columns: grid
              ? getComputedStyle(grid).gridTemplateColumns.split(/\s+/).length
              : null,
            infoBackground: info
              ? getComputedStyle(info).backgroundColor
              : null,
          };
        })(),
        targets: [...document.querySelectorAll('button,a,input')]
          .filter((node) => {
            if (
              !node.getClientRects().length ||
              node.closest('[inert],[aria-hidden="true"]')
            )
              return false;
            for (
              let ancestor = node;
              ancestor;
              ancestor = ancestor.parentElement
            ) {
              const style = getComputedStyle(ancestor);
              if (
                style.visibility === 'hidden' ||
                style.clip === 'rect(0px, 0px, 0px, 0px)' ||
                style.clipPath === 'inset(50%)'
              )
                return false;
            }
            return true;
          })
          .map((node) => {
            const rect = node.getBoundingClientRect();
            return {
              name:
                node.getAttribute('aria-label') ||
                node.textContent ||
                node.name,
              width: rect.width,
              height: rect.height,
            };
          }),
      }));
      assert.equal(
        geometry.overflow,
        false,
        `${state}/${theme}/${width} overflow`,
      );
      assert.equal(
        geometry.mainOverflow,
        false,
        `${state}/${theme}/${width} main overflow`,
      );
      if (state === 'automatic-content') {
        assert.ok(
          geometry.albumCardOverlays.length > 0,
          'Real album cards are rendered',
        );
        for (const overlay of geometry.albumCardOverlays)
          assert.equal(
            overlay.background,
            'rgba(0, 0, 0, 0)',
            `${state}/${theme}/${width}: ${overlay.imageId} outline overlay cannot cover the thumbnail`,
          );
      }
      if (geometry.picker) {
        if (geometry.picker.columns !== null)
          assert.equal(
            geometry.picker.columns,
            width >= 1200 ? 4 : width >= 768 ? 3 : 2,
            `${state}/${theme}/${width}: real cover-picker grid columns`,
          );
        assert.equal(
          geometry.picker.infoBackground,
          theme === 'light' ? 'rgb(227, 246, 245)' : 'rgb(37, 61, 64)',
          `${state}/${theme}/${width}: cover explanation background`,
        );
      }
      for (const target of geometry.targets)
        assert.ok(
          target.width >= (width < 1200 ? 44 : 24) &&
            target.height >= (width < 1200 ? 44 : 24),
          `${state}: ${target.name} target ${target.width}×${target.height}`,
        );
      if (state === 'automatic-content') await searchEdges(theme, width);
      if (state !== 'picker-loading') await imagesPainted();
      await shot(`${state}-${theme}-${width}`);
      report.layouts.push({ state, theme, ...geometry });
    }
  }
}
async function readAlbum(id = albumId) {
  const response = await page.fetch(`/api/albums/${id}`);
  assert.equal(response.status, 200);
  return JSON.parse(response.body).album;
}
async function content(id = albumId, query = '') {
  await page.goto(`${config.origin}${at(id)}${query}`);
  await page.waitForSelector('[data-testid="album-cover-summary"]');
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="library-loading"]'),
  );
}
async function picker() {
  await page.click(button('设置封面'));
  await page.waitForSelector('[data-testid="album-cover-picker"]');
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="library-loading"]'),
  );
}
function candidate(id) {
  return `[data-testid="cover-choice"][data-image-id="${id}"] button`;
}
async function saved(id) {
  await page.waitForSelector('[data-testid="cover-result"]');
  await layouts('save-success', [390, 1440]);
  await page.click(button('返回相册'));
  await page.waitForSelector('[data-testid="album-cover-summary"]');
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="album-cover-picker"]'),
  );
  assert.equal((await readAlbum()).cover.preferredCoverImageId, id);
}
async function shortModal(state) {
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
    for (const width of [390, 1440]) {
      await resize(width, 400);
      await page.waitForFunction(
        () =>
          document.querySelector('[role="dialog"]').getBoundingClientRect()
            .height <=
          innerHeight - 32,
      );
      await page.focus(button('返回相册'));
      const geometry = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        const header = dialog.querySelector('[data-slot="modal-header"]');
        const body = dialog.querySelector('[data-slot="modal-body"]');
        const footer = dialog.querySelector('[data-slot="modal-footer"]');
        const headerRect = header.getBoundingClientRect();
        const bodyRect = body.getBoundingClientRect();
        const footerRect = footer.getBoundingClientRect();
        const active = document.activeElement;
        const actionRect = active.getBoundingClientRect();
        const hit = document.elementFromPoint(
          actionRect.x + actionRect.width / 2,
          actionRect.y + actionRect.height / 2,
        );
        return {
          headerBottom: headerRect.bottom,
          bodyTop: bodyRect.top,
          bodyBottom: bodyRect.bottom,
          bodyHeight: bodyRect.height,
          bodyOverflow: getComputedStyle(body).overflowY,
          bodyNeedsScroll: body.scrollHeight > body.clientHeight,
          footerTop: footerRect.top,
          footerBottom: footerRect.bottom,
          footerHit: footer.contains(
            document.elementFromPoint(
              footerRect.x + footerRect.width / 2,
              footerRect.y + footerRect.height / 2,
            ),
          ),
          actionTop: actionRect.top,
          actionBottom: actionRect.bottom,
          actionHit: !!hit && active.contains(hit),
          height: innerHeight,
        };
      });
      assert.ok(
        geometry.actionTop >= 0 &&
          geometry.actionBottom <= geometry.height &&
          geometry.actionHit,
        `${theme}/${width}×400: focused return action remains visible and hit-testable`,
      );
      assert.ok(
        geometry.bodyHeight > 0 &&
          geometry.headerBottom <= geometry.bodyTop &&
          geometry.bodyBottom <= geometry.footerTop &&
          geometry.footerBottom <= geometry.height &&
          geometry.footerHit,
        `${theme}/${width}×400: visible modal body cannot overlap its header or footer`,
      );
      if (geometry.bodyNeedsScroll)
        assert.ok(
          ['auto', 'scroll'].includes(geometry.bodyOverflow),
          `${theme}/${width}×400: overflowing preview and text remain clipped inside the body`,
        );
      report.checks.push({
        check: 'Short successful cover modal body and action geometry',
        theme,
        width,
        geometry,
      });
      const bodyEnd = await page.evaluate(() => {
        const body = document.querySelector(
          '[role="dialog"] [data-slot="modal-body"]',
        );
        body.scrollTop = body.scrollHeight;
        const last = body.querySelector(':scope > p:last-child');
        const bodyRect = body.getBoundingClientRect();
        const lastRect = last.getBoundingClientRect();
        return {
          text: last.textContent,
          lastTop: lastRect.top,
          lastBottom: lastRect.bottom,
          bodyTop: bodyRect.top,
          bodyBottom: bodyRect.bottom,
          atEnd:
            Math.abs(body.scrollTop + body.clientHeight - body.scrollHeight) <
              2 || body.scrollHeight <= body.clientHeight,
        };
      });
      assert.ok(
        bodyEnd.atEnd &&
          bodyEnd.lastBottom <= bodyEnd.bodyBottom + 1 &&
          bodyEnd.lastBottom > bodyEnd.bodyTop &&
          bodyEnd.lastTop < bodyEnd.bodyBottom,
        `${theme}/${width}×400: scrolling body to its end reveals the final text`,
      );
      report.checks.push({
        check: 'Short modal final text remains readable',
        state,
        theme,
        width,
        bodyEnd,
      });
      await shot(`${state}-short-${theme}-${width}`);
    }
  }
  await page.evaluate(() => document.activeElement?.blur());
  report.checks.push(
    `${state}: real modal keeps body content separate from its visible focused return action in light/dark 390×400 and 1440×400.`,
  );
}
// Successful writes and reads use the production service and isolated SQLite.
// Only transport errors, latency, and lost responses are injected here.
async function intercept(method, path, mode) {
  await page.evaluate(
    ({ method, path, mode }) => {
      const original = window.fetch;
      window.__coverRequests = [];
      window.__coverChecks = 0;
      window.__coverRelease = undefined;
      window.__coverRestore = () => {
        window.fetch = original;
        window.__coverRelease?.();
      };
      window.fetch = async (...args) => {
        if (
          mode === 'lost-unverified' &&
          new URL(String(args[0]), location.href).pathname ===
            path.replace(/\/cover$/, '') &&
          (args[1]?.method ?? 'GET') === 'GET'
        ) {
          window.__coverChecks++;
          throw new TypeError('Cover reconciliation temporarily unavailable');
        }
        if (
          new URL(String(args[0]), location.href).pathname !== path ||
          (args[1]?.method ?? 'GET') !== method
        )
          return original(...args);
        window.__coverRequests.push({ method, path, body: args[1]?.body });
        if (mode === 'reject')
          return new Response(
            JSON.stringify({
              code: 'COLLECTION_INVALID_INPUT',
              message: '浏览器验证：封面保存失败',
            }),
            { status: 400, headers: { 'content-type': 'application/json' } },
          );
        const response = await original(...args);
        if (mode === 'hold')
          await new Promise((resolve) => {
            window.__coverRelease = resolve;
          });
        if (mode === 'lost' || mode === 'lost-unverified')
          throw new TypeError('Committed cover response lost');
        window.fetch = original;
        return response;
      };
    },
    { method, path, mode },
  );
}
async function restore() {
  await page.evaluate(() => window.__coverRestore?.());
}
async function fixtures() {
  const png = await readFile(
    join(config.projectDirectory, 'tests/fixtures/runtime/images/sample.png'),
  );
  const created = 1800000000000;
  await sql(
    `INSERT INTO storage_configs (id,name,type,enabled,local_path,created_at,updated_at) VALUES ('issue180-storage','封面验证存储','local',1,'issue180',${created},${created})`,
  );
  directory = join(
    config.dataDirectory,
    'storage',
    'issue180',
    'ariso',
    'issue180-storage',
    'cover',
  );
  await mkdir(directory, { recursive: true });
  const ids = [
    albumId,
    'issue180-empty',
    'issue180-private',
    ...['pending', 'processing', 'failed', 'disabled', 'missing'].map(
      (status) => `issue180-${status}`,
    ),
  ];
  await sql(
    `INSERT INTO albums (id,name,description,created_at,updated_at) VALUES ${ids.map((id) => `('${id}','${id === albumId ? '封面验证旅行' : id}','独立浏览器验证数据',${created},${created})`).join(',')}`,
  );
  for (let index = 0; index < 45; index++) {
    const id = `issue180-${String(index).padStart(3, '0')}`;
    await sql(
      `INSERT INTO media_images (id,storage_id,original_name,display_name,visibility,format,mime,width,height,byte_size,classification,processing_status,created_at,updated_at) VALUES ('${id}','issue180-storage','${id}.png','${id}.png','${index < 40 ? 'private' : 'public'}','png','image/png',640,480,${png.length},'static','ready',${created - index},${created})`,
    );
    await sql(
      `INSERT INTO media_objects (id,image_id,storage_id,key,purpose,status,byte_size,format,mime,created_at,updated_at) VALUES ('object-${id}','${id}','issue180-storage','cover/${id}.png','thumbnail','stored',${png.length},'png','image/png',${created},${created})`,
    );
    await sql(
      `INSERT INTO media_versions (image_id,kind,object_id,width,height,byte_size,format,mime,created_at) VALUES ('${id}','thumbnail','object-${id}',64,48,${png.length},'png','image/png',${created})`,
    );
    await writeFile(join(directory, `${id}.png`), png);
    // Public 040 and 041 share the same join time and must break ties by ID.
    const joined = index < 40 ? created + 1000 - index : created;
    await sql(
      `INSERT INTO album_images (album_id,image_id,joined_at) VALUES ('${albumId}','${id}',${joined})`,
    );
  }
  await sql(
    `INSERT INTO album_images (album_id,image_id,joined_at) VALUES ('issue180-private','issue180-000',${created})`,
  );
  for (const status of [
    'pending',
    'processing',
    'failed',
    'disabled',
    'missing',
  ]) {
    const id = `issue180-status-${status}`;
    await sql(
      `INSERT INTO media_images (id,storage_id,original_name,display_name,visibility,format,mime,width,height,byte_size,classification,processing_status,created_at,updated_at) VALUES ('${id}','issue180-storage','${id}.png','${id}.png','public','png','image/png',640,480,${png.length},'static','${['pending', 'processing', 'failed'].includes(status) ? status : 'ready'}',${created},${created})`,
    );
    await sql(
      `INSERT INTO album_images (album_id,image_id,joined_at) VALUES ('issue180-${status}','${id}',${created + 1}),('issue180-${status}','issue180-042',${created})`,
    );
    if (status === 'missing') {
      await sql(
        `INSERT INTO media_objects (id,image_id,storage_id,key,purpose,status,byte_size,format,mime,created_at,updated_at) VALUES ('object-${id}','${id}','issue180-storage','cover/missing.png','thumbnail','stored',${png.length},'png','image/png',${created},${created})`,
      );
      await sql(
        `INSERT INTO media_versions (image_id,kind,object_id,width,height,byte_size,format,mime,created_at) VALUES ('${id}','thumbnail','object-${id}',64,48,${png.length},'png','image/png',${created})`,
      );
    }
  }
}
try {
  report.stage = 'owner session and fixtures';
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
  await page.evaluate(
    (key) =>
      localStorage.setItem(
        key,
        JSON.stringify({ layout: 'grid', loadingMode: 'more' }),
      ),
    preferenceKey,
  );
  await fixtures();
  report.stage = 'automatic full album and picker';
  await content();
  const automatic = (await readAlbum()).cover;
  assert.equal(automatic.imageId, 'issue180-040');
  assert.equal(automatic.preferredCoverImageId, null);
  assert.equal(
    await page.evaluate(
      () => !!document.querySelector('[data-image-id="issue180-040"]'),
    ),
    false,
    'Automatic cover is beyond the first private-only page',
  );
  await layouts('automatic-content');
  await resize(1440);
  await picker();
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelector(
          '[data-testid="cover-choice"][data-image-id="issue180-000"] button',
        ).disabled,
    ),
    true,
    'Private members cannot be manually selected',
  );
  await layouts('picker-private-first-page');
  await page.click(button('下一页'));
  await page.waitForSelector(candidate('issue180-041'));
  await layouts('picker-public-loaded', [390, 1440]);
  await page.focus(candidate('issue180-041'));
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-testid="cover-result"]');
  await shortModal('save-success');
  await saved('issue180-041');
  await layouts('manual-content', [390, 1440]);
  report.checks.push(
    'Automatic cover reads the full album before pagination, and equal join times use image ID ascending; private cards are disabled and keyboard selection persists a public cover.',
  );

  report.stage = 'cancel retains original query and focus';
  const query = '?q=issue180-040&visibility=public&pageSize=20';
  await content(albumId, query);
  const originalUrl = await page.url();
  await page.focus(button('设置封面'));
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-testid="album-cover-picker"]');
  await page.click(button('取消'));
  await page.waitForSelector('[data-testid="album-cover-summary"]');
  assert.equal(await page.url(), originalUrl);
  await page.waitForFunction(
    () => document.activeElement?.textContent.trim() === '设置封面',
  );
  assert.equal((await readAlbum()).cover.preferredCoverImageId, 'issue180-041');
  report.checks.push(
    'Cancel restores the original filtered content URL and opener focus without changing the selected cover.',
  );

  report.stage = 'manual temporary fallback and restoration';
  for (const update of ["visibility='private'", 'trashed_at=1800000000000']) {
    await sql(`UPDATE media_images SET ${update} WHERE id='issue180-041'`);
    await content();
    const fallback = (await readAlbum()).cover;
    assert.equal(fallback.imageId, 'issue180-040');
    assert.equal(fallback.preferredCoverImageId, 'issue180-041');
    assert.equal(fallback.temporaryFallback, true);
    await layouts(
      update.startsWith('visibility') ? 'private-fallback' : 'trash-fallback',
      [390, 1440],
    );
    await page.click('[data-testid="album-cover-summary"]');
    await page.waitForSelector('[role="dialog"]');
    await layouts(
      update.startsWith('visibility')
        ? 'private-fallback-preview'
        : 'trash-fallback-preview',
      [390, 1440],
    );
    await shortModal(
      update.startsWith('visibility')
        ? 'private-fallback-preview'
        : 'trash-fallback-preview',
    );
    await page.click(button('返回相册'));
    await sql(
      "UPDATE media_images SET visibility='public',trashed_at=NULL WHERE id='issue180-041'",
    );
    await content();
    assert.equal((await readAlbum()).cover.imageId, 'issue180-041');
    assert.equal((await readAlbum()).cover.temporaryFallback, false);
  }
  report.checks.push(
    'Real SQLite private and trash lifecycle changes preserve preferred ID, temporarily show the automatic candidate, and restore the manual cover after recovery. Lifecycle mutations are fixtures; production lifecycle command coverage belongs to integration tests.',
  );

  report.stage = 'save errors and pending duplicate prevention';
  await content();
  await picker();
  await page.click(button('下一页'));
  await page.waitForSelector(candidate('issue180-040'));
  await intercept('PUT', `/api/albums/${albumId}/cover`, 'reject');
  await page.click(candidate('issue180-040'));
  await page.waitForSelector(button('重试保存'));
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelector(
          '[data-testid="cover-choice"][data-image-id="issue180-040"]',
        ).dataset.selected,
    ),
    'true',
  );
  assert.equal((await readAlbum()).cover.preferredCoverImageId, 'issue180-041');
  await layouts('save-error-retained-selection', [390, 1440]);
  await restore();
  await intercept('PUT', `/api/albums/${albumId}/cover`, 'hold');
  await page.click(button('重试保存'));
  await page.waitForFunction(() => typeof window.__coverRelease === 'function');
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[data-testid="album-cover-picker"] button')]
      .filter((node) => node.getClientRects().length)
      .every((node) => node.disabled),
  );
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => window.__coverRequests.length), 1);
  await shot('save-pending-disabled');
  await restore();
  await saved('issue180-040');
  report.checks.push(
    'A rejected save leaves the picker open with a retry action and preserves the committed cover; a held actual save disables controls and Enter cannot duplicate the write.',
  );

  report.stage = 'committed response lost';
  await picker();
  await intercept('PUT', `/api/albums/${albumId}/cover`, 'lost');
  await page.click(button('自动选择'));
  await page.waitForFunction(
    () =>
      !!document.querySelector('[data-testid="cover-result"]') ||
      document.body.textContent.includes('结果未知'),
  );
  assert.equal((await readAlbum()).cover.preferredCoverImageId, null);
  assert.equal(await page.evaluate(() => window.__coverRequests.length), 1);
  await shot('lost-response-reconciled');
  await restore();
  await saved(null);
  report.checks.push(
    'A real committed automatic selection with a lost response is reconciled from the actual album and performs only one PUT.',
  );

  report.stage = 'unknown result cannot write again';
  await picker();
  await page.click(button('下一页'));
  await page.waitForSelector(candidate('issue180-041'));
  await intercept('PUT', `/api/albums/${albumId}/cover`, 'lost-unverified');
  await page.click(candidate('issue180-041'));
  await page.waitForSelector(button('重新核对结果'));
  assert.equal(
    (
      await sql(
        `SELECT preferred_cover_image_id FROM albums WHERE id='${albumId}'`,
      )
    )[0].preferred_cover_image_id,
    'issue180-041',
  );
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelector(
          '[data-testid="cover-choice"][data-image-id="issue180-041"] button',
        ).disabled,
    ),
    true,
  );
  await layouts('save-unknown', [390, 1440]);
  await page.focus(button('重新核对结果'));
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () =>
      window.__coverChecks >= 2 &&
      [...document.querySelectorAll('button')].some(
        (node) => node.textContent.trim() === '重新核对结果' && !node.disabled,
      ),
  );
  assert.equal(await page.evaluate(() => window.__coverRequests.length), 1);
  await restore();
  await page.click(button('重新核对结果'));
  await saved('issue180-041');
  assert.equal(await page.evaluate(() => window.__coverRequests.length), 1);
  report.checks.push(
    'When both the committed response and reconciliation GET are unavailable, the selected identity is retained, further writes are disabled, and explicit verification after transport recovery reads the existing commit without another PUT.',
  );

  report.stage = 'removed then readded selection';
  const previousJoin = (
    await sql(
      `SELECT joined_at FROM album_images WHERE album_id='${albumId}' AND image_id='issue180-041'`,
    )
  )[0].joined_at;
  // T-ALB member commands have integration coverage. No batch-management API
  // exists yet: seed their post-command state, then verify the real presentation.
  await sql(
    `DELETE FROM album_images WHERE album_id='${albumId}' AND image_id='issue180-041'`,
  );
  await sql(
    `UPDATE albums SET preferred_cover_image_id=NULL WHERE id='${albumId}'`,
  );
  await content();
  assert.equal((await readAlbum()).cover.imageId, 'issue180-040');
  await sql(
    `INSERT INTO album_images (album_id,image_id,joined_at) VALUES ('${albumId}','issue180-041',${previousJoin + 2000})`,
  );
  await content();
  assert.equal((await readAlbum()).cover.imageId, 'issue180-041');
  assert.equal((await readAlbum()).cover.mode, 'automatic');
  assert.equal((await readAlbum()).cover.preferredCoverImageId, null);
  report.checks.push(
    'After the fixture represents explicit removal and re-addition with a later join time, the readded image is the automatic candidate and the previous manual preference remains clear. Real removeMemberships/addMemberships clearing and join-time behavior are verified separately by integration tests.',
  );

  report.stage = 'picker loading and read error';
  await intercept('GET', '/api/images', 'hold');
  await page.click(button('设置封面'));
  await page.waitForFunction(() => typeof window.__coverRelease === 'function');
  await page.waitForSelector(
    '[data-testid="album-cover-picker"] [data-testid="library-loading"]',
  );
  await layouts('picker-loading', [390, 1440]);
  await restore();
  await page.waitForSelector(candidate('issue180-000'));
  await page.click(button('取消'));
  await intercept('GET', '/api/images', 'reject');
  await page.click(button('设置封面'));
  await page.waitForSelector('[data-testid="cover-list-error"]');
  await layouts('picker-read-error', [390, 1440]);
  await restore();
  await page.click(button('重试读取图片'));
  await page.waitForSelector(candidate('issue180-000'));
  await page.click(button('取消'));
  report.checks.push(
    'The actual member read exposes loading while its real response is held; a rejected read shows an actionable error and retry recovers real members.',
  );

  report.stage = 'empty and unavailable covers';
  for (const id of ['issue180-empty', 'issue180-private']) {
    await content(id);
    assert.equal((await readAlbum(id)).cover.imageId, null);
    assert.equal((await readAlbum(id)).cover.status, 'empty');
    await layouts(id.slice(9), [390, 1440]);
    await page.click('[data-testid="album-cover-summary"]');
    await page.waitForSelector('[role="dialog"]');
    await layouts(`${id.slice(9)}-preview`, [390, 1440]);
    await page.click(button('返回相册'));
    await picker();
    await layouts(`${id.slice(9)}-picker`, [390, 1440]);
    await page.click(button('取消'));
  }
  for (const status of [
    'pending',
    'processing',
    'failed',
    'disabled',
    'missing',
  ]) {
    if (status === 'disabled')
      await sql(
        "UPDATE storage_configs SET enabled=0 WHERE id='issue180-storage'",
      );
    await content(`issue180-${status}`);
    const cover = (await readAlbum(`issue180-${status}`)).cover;
    assert.equal(
      cover.imageId,
      `issue180-status-${status}`,
      `${status}: never substitute the later ready candidate`,
    );
    assert.equal(
      cover.status,
      status === 'pending'
        ? 'processing'
        : status === 'missing'
          ? 'ready'
          : status,
    );
    await page.click('[data-testid="album-cover-summary"]');
    await page.waitForSelector('[role="dialog"]');
    if (status === 'missing')
      await page.waitForFunction(
        () =>
          document.querySelector('[data-testid="album-cover-summary"]')?.dataset
            .coverStatus === 'missing',
      );
    await layouts(status, [390, 1440]);
    if (status === 'missing') {
      await shortModal('missing-preview');
      await writeFile(
        join(directory, 'missing.png'),
        await readFile(
          join(
            config.projectDirectory,
            'tests/fixtures/runtime/images/sample.png',
          ),
        ),
      );
      await page.click(button('重试加载'));
      await page.waitForFunction(() => {
        const summary = document.querySelector(
          '[data-testid="album-cover-summary"]',
        );
        const image = document.querySelector('[role="dialog"] img');
        return (
          summary?.dataset.coverStatus === 'ready' &&
          image?.complete &&
          image.naturalWidth > 0
        );
      });
      const recovered = (await readAlbum('issue180-missing')).cover;
      assert.equal(recovered.imageId, 'issue180-status-missing');
      assert.equal(recovered.status, 'ready');
      await layouts('missing-recovered', [390, 1440]);
      report.checks.push(
        'After an actual missing thumbnail file is restored, the real retry button reloads the same thumbnail successfully without replacing the chosen image identity.',
      );
    }
    await page.click(button('返回相册'));
    if (status === 'disabled')
      await sql(
        "UPDATE storage_configs SET enabled=1 WHERE id='issue180-storage'",
      );
  }
  report.checks.push(
    'Empty and private-only albums have no candidate; pending, processing, failed, disabled storage, and actual missing thumbnail file retain their chosen identity without selecting a later ready public image.',
  );

  report.stage = 'mobile touch and short viewport';
  await content();
  await resize(390, 400);
  await page.cdp('Emulation.setTouchEmulationEnabled', { enabled: true });
  await picker();
  await page.focus(button('取消'));
  await page.keyboard.press('Tab');
  const focus = await page.evaluate(() => {
    const active = document.activeElement;
    const rect = active.getBoundingClientRect();
    return {
      name: active.textContent,
      top: rect.top,
      bottom: rect.bottom,
      height: innerHeight,
    };
  });
  assert.ok(
    focus.top >= 0 && focus.bottom <= focus.height,
    'Keyboard focus remains visible in a short mobile viewport',
  );
  await shot('short-mobile-focus');
  await resize(390);
  await page.evaluate(() => {
    const node = [
      ...document.querySelectorAll('[data-testid="album-cover-picker"] button'),
    ].find((node) => node.textContent.trim() === '自动选择');
    node.scrollIntoView({ block: 'center', behavior: 'instant' });
  });
  await page.waitForFunction(() => {
    const node = [
      ...document.querySelectorAll('[data-testid="album-cover-picker"] button'),
    ].find((node) => node.textContent.trim() === '自动选择');
    const rect = node.getBoundingClientRect();
    const hit = document.elementFromPoint(
      rect.x + rect.width / 2,
      rect.y + rect.height / 2,
    );
    return (
      rect.top >= 0 &&
      rect.bottom <= innerHeight &&
      rect.left >= 0 &&
      rect.right <= innerWidth &&
      !!hit &&
      node.contains(hit)
    );
  });
  const touch = await page.evaluate(() => {
    const node = [
      ...document.querySelectorAll('[data-testid="album-cover-picker"] button'),
    ].find((node) => node.textContent.trim() === '自动选择');
    const rect = node.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  });
  await page.cdp('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ ...touch, radiusX: 1, radiusY: 1, force: 1, id: 1 }],
  });
  await page.cdp('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await saved(null);
  await page.cdp('Emulation.setTouchEmulationEnabled', { enabled: false });
  await resize(1440);
  await page.goto(`${config.origin}/albums`);
  await page.waitForSelector(`[data-testid="album-cover-${albumId}"]`);
  await layouts('album-list-covers');
  const readDisabledListCover = async () => {
    const response = await page.fetch('/api/albums?q=issue180&pageSize=40');
    assert.equal(response.status, 200);
    const album = JSON.parse(response.body).items.find(
      (item) => item.id === 'issue180-disabled',
    );
    assert.ok(
      album,
      'The real album list contains the disabled-storage fixture',
    );
    return album.cover;
  };
  const availableStorageCover = await readDisabledListCover();
  assert.equal(availableStorageCover.status, 'missing');
  assert.equal(availableStorageCover.thumbnailUrl, null);
  assert.equal(availableStorageCover.imageId, 'issue180-status-disabled');
  await sql("UPDATE storage_configs SET enabled=0 WHERE id='issue180-storage'");
  await page.reload();
  await page.waitForSelector('[data-testid="album-cover-issue180-disabled"]');
  await page.waitForFunction(() =>
    document
      .querySelector('[data-testid="album-cover-issue180-disabled"]')
      ?.textContent.includes('封面存储已停用'),
  );
  const stoppedStorageCover = await readDisabledListCover();
  assert.equal(stoppedStorageCover.status, 'disabled');
  assert.equal(stoppedStorageCover.thumbnailUrl, null);
  assert.equal(stoppedStorageCover.imageId, availableStorageCover.imageId);
  await layouts('album-list-storage-disabled', [390, 1440]);
  await sql("UPDATE storage_configs SET enabled=1 WHERE id='issue180-storage'");
  report.checks.push({
    check:
      'Real album list distinguishes a missing thumbnail on enabled storage from disabled storage without replacing cover identity',
    availableStorageCover,
    stoppedStorageCover,
  });
  report.checks.push(
    'Mobile touch emulation, short viewport focus, and album list cover rendering use the real pages; physical touch, soft keyboard, and nonzero safe-area device tests are outside the current execution agreement.',
  );
  report.stage = 'picker session expiry preserves filtered return destination';
  await content(albumId, '?q=issue180-041&visibility=public&pageSize=20');
  const returnTo =
    new URL(await page.url()).pathname + new URL(await page.url()).search;
  await page.evaluate(() => {
    const original = window.fetch;
    window.__coverSessionStarted = 0;
    window.__coverSessionSettled = 0;
    window.__coverSessionPresent = false;
    window.fetch = async (...args) => {
      const session =
        new URL(String(args[0]), location.href).pathname ===
        '/api/auth/get-session';
      if (session) window.__coverSessionStarted++;
      const response = await original(...args);
      if (session) {
        window.__coverSessionPresent = !!(await response.clone().json());
        window.__coverSessionSettled++;
      }
      return response;
    };
  });
  await picker();
  await page.waitForFunction(
    () =>
      window.__coverSessionStarted > 0 &&
      window.__coverSessionSettled === window.__coverSessionStarted &&
      window.__coverSessionPresent,
  );
  // Both hidden content and active picker OwnerShell instances observe actual
  // server session deletion. This database belongs only to the isolated runner.
  assert.ok((await sql('DELETE FROM session')).changes > 0);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForSelector('#email');
  assert.equal(new URL(await page.url()).searchParams.get('reason'), 'expired');
  assert.equal(
    new URL(await page.url()).searchParams.get('returnTo'),
    returnTo,
  );
  await shot('picker-session-expired-filtered-return');
  report.checks.push(
    'Deleting the isolated database session and triggering the real OwnerShell focus check redirects from the cover picker with the complete original album query; the following upload suite remains anonymous.',
  );
  // The next upload suite requires an anonymous session, as albums.mjs did.
  await page.goto(`${config.origin}/upload`);
  await page.waitForSelector('#email');
  assert.equal(
    new URL(await page.url()).searchParams.get('returnTo'),
    '/upload',
  );
  report.status = 'passed';
} catch (error) {
  report.error = String(error.stack ?? error);
  report.failureState = await page.evaluate(() => ({
    url: location.href,
    text: document.body.textContent.slice(0, 6000),
  }));
  await shot('failure');
  throw error;
} finally {
  await restore();
  await sql("DELETE FROM albums WHERE id GLOB 'issue180-*'");
  await sql("DELETE FROM media_versions WHERE image_id GLOB 'issue180-*'");
  await sql("DELETE FROM media_objects WHERE image_id GLOB 'issue180-*'");
  await sql("DELETE FROM media_images WHERE id GLOB 'issue180-*'");
  await sql("DELETE FROM storage_configs WHERE id='issue180-storage'");
  if (directory) await rm(directory, { recursive: true, force: true });
  if (savedPreference !== undefined)
    await page.evaluate(
      ({ key, value }) => {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      },
      { key: preferenceKey, value: savedPreference },
    );
  await writeFile(
    join(config.output, 'album-cover.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
console.log(report);
