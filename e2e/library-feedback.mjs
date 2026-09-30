import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

/** User-reported boundaries, measured with real thumbnails and native input. */
export async function verifyLibraryFeedback({ page, config, sql, report }) {
  const button = (name) => `loc=role:button[name="${name}"]`;
  const card = '[data-testid="library-card"]';
  const menu = '[role="menu"][aria-label="已选图片操作"]';
  const [storage] = await sql(
    "SELECT id,local_path FROM storage_configs WHERE type='local' AND enabled=1 LIMIT 1",
  );
  const directory = join(
    config.dataDirectory,
    'storage',
    storage.local_path,
    'ariso',
    storage.id,
    'library-feedback',
  );
  const sample = join(
    config.projectDirectory,
    'tests/fixtures/runtime/images/sample.png',
  );
  const originalScheme = await page.evaluate(() =>
    matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  );
  async function settle() {
    await page.waitForFunction(() =>
      document
        .getAnimations()
        .every(
          (a) =>
            a.playState !== 'running' ||
            a.effect?.getTiming().iterations === Infinity,
        ),
    );
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  }
  async function ready() {
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="library-gallery"]')
          ?.getAttribute('aria-busy') === 'false',
    );
    await settle();
  }
  async function visit() {
    await page.goto(`${config.origin}/library?q=issue173-&pageSize=40`);
    await ready();
  }
  async function count(value) {
    await page.waitForFunction(
      (value) =>
        document.querySelectorAll(
          '[data-testid="library-card"][data-selected="true"]',
        ).length === value,
      value,
    );
  }
  async function rows() {
    return page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="library-card"]')]
        .slice(0, 4)
        .map((e) => {
          const r = e.getBoundingClientRect();
          return {
            id: e.dataset.imageId,
            x: r.x + r.width / 2,
            y: r.y + 65,
            left: r.left,
            top: r.top,
          };
        }),
    );
  }
  async function shot(name) {
    const file = `library-feedback-${name}.png`;
    await settle();
    await page.screenshot({ path: join(config.output, file) });
    report.screenshots.push(file);
  }
  try {
    await mkdir(directory, { recursive: true });
    for (let i = 0; i < 4; i++) {
      const id = `issue173-00${i}`;
      const path = join(directory, `${id}.png`);
      if (i % 2) execFileSync('magick', [sample, '-rotate', '90', path]);
      else await writeFile(path, await readFile(sample));
      const bytes = await readFile(path);
      const [width, height] = i % 2 ? [48, 64] : [64, 48];
      await sql(
        `INSERT INTO media_objects (id,image_id,storage_id,key,purpose,status,byte_size,format,mime,created_at,updated_at) VALUES ('feedback-${id}','${id}','${storage.id}','library-feedback/${id}.png','thumbnail','stored',${bytes.length},'png','image/png',1700000000000,1700000000000)`,
      );
      await sql(
        `INSERT INTO media_versions (image_id,kind,object_id,width,height,byte_size,format,mime,created_at) VALUES ('${id}','thumbnail','feedback-${id}',${width},${height},${bytes.length},'png','image/png',1700000000000)`,
      );
    }
    await page.cdp('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 1080,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await page.cdp('Emulation.setTouchEmulationEnabled', { enabled: false });
    await visit();
    await page.click('loc=role:radio[name="网格"]');
    await settle();
    let points = await rows();
    await page.mouse.move(points[0].x, points[0].y);
    await page.mouse.down();
    await page.mouse.move(points[1].x, points[1].y + 15, { steps: 10 });
    await page.mouse.up();
    await count(2);
    assert.equal(
      new URL(await page.url()).searchParams.get('image'),
      null,
      'Dragging on the photo does not open details',
    );
    await page.mouse.click(points[0].x, points[0].y, { button: 'right' });
    await page.waitForSelector(menu);
    await count(2);
    await shot('right-click-selection');
    const bounds = await page.evaluate(() => {
      const r = document
        .querySelector('[data-slot="dropdown-popover"]')
        .getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    });
    assert.ok(
      Math.abs(bounds.left - points[0].x) < 20 &&
        Math.abs(bounds.top - points[0].y) < 30,
      'Context menu is at the pointer',
    );
    await page.keyboard.press('Escape');
    await page.waitForSelector(menu, { state: 'hidden' });
    assert.equal(
      await page.evaluate(() =>
        document.activeElement
          ?.closest('[data-image-id]')
          ?.getAttribute('data-image-id'),
      ),
      points[0].id,
      'Escape restores the clicked card',
    );
    await page.mouse.click(points[2].x, points[2].y, { button: 'right' });
    await page.waitForSelector(menu);
    await count(1);
    await page.click('loc=role:menuitem[name="清空全部选择"]');
    await count(0);
    await page.hover(
      `${card}[data-image-id="${points[0].id}"] [data-library-open]`,
    );
    await page.click(`${card}[data-image-id="${points[0].id}"] label`);
    await count(1);
    assert.equal(
      await page.evaluate((menu) => !!document.querySelector(menu), menu),
      false,
      'Plain checkbox does not reopen the previous context menu',
    );
    await page.focus(
      `${card}[data-image-id="${points[0].id}"] [data-library-open]`,
    );
    report.stage = 'keyboard-context-menu';
    await page.keyboard.press('Shift+F10');
    await page.waitForSelector(menu);
    await page.keyboard.press('Escape');
    await page.waitForSelector(menu, { state: 'hidden' });
    report.stage = 'keyboard-detail';
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-testid="detail-body"]');
    await page.click(button('关闭图片详情'));
    await ready();
    report.checks.push(
      'Native drag starts on photo surfaces and selects two cards without opening details; right-click retains an existing group or selects the new target; pointer menu, Escape focus, clear/reselect, Shift+F10 and keyboard detail opening work.',
    );

    report.stage = 'history-menu';
    await page.fill('input[aria-label="搜索图片名称"]', 'issue173-alpha');
    await page.press('input[aria-label="搜索图片名称"]', 'Enter');
    await page.waitForFunction(
      () => new URL(location.href).searchParams.get('q') === 'issue173-alpha',
    );
    await ready();
    points = await rows();
    await page.mouse.click(points[0].x, points[0].y, { button: 'right' });
    await page.waitForSelector(menu);
    await page.evaluate(() => history.back());
    await page.waitForFunction(
      () => new URL(location.href).searchParams.get('q') === 'issue173-',
    );
    await ready();
    await page.waitForSelector(menu, { state: 'hidden' });
    await page.hover(
      `${card}[data-image-id="issue173-000"] [data-library-open]`,
    );
    await page.click(`${card}[data-image-id="issue173-000"] label`);
    await count(1);
    assert.equal(
      await page.evaluate((menu) => !!document.querySelector(menu), menu),
      false,
      'History clears context state before a new selection',
    );
    report.checks.push(
      'Browser Back while the context menu is open clears its previous query target; the next checkbox does not resurrect an old menu.',
    );

    await visit();
    for (const label of [
      '标签',
      '可见性',
      '处理状态',
      '存储位置',
      '相册',
      '格式',
    ]) {
      await page.click(button('添加条件'));
      await page.click(`loc=role:menuitem[name="${label}"]`);
    }
    report.stage = 'geometry';
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
      for (const width of [360, 390, 430, 768, 960, 1440]) {
        await page.cdp('Emulation.setDeviceMetricsOverride', {
          width,
          height: 1080,
          deviceScaleFactor: 1,
          mobile: width < 768,
        });
        await settle();
        const alignment = await page.evaluate(() =>
          [...document.querySelectorAll('[data-filter-category]')].map((e) => {
            const t = e.querySelector(
              '[data-slot="select-trigger"],[data-slot="autocomplete-trigger"]',
            );
            const arrow = t.querySelector(
              '[data-slot="select-indicator"],[data-slot="autocomplete-indicator"]',
            );
            const r = t.getBoundingClientRect(),
              a = arrow.getBoundingClientRect();
            return {
              category: e.dataset.filterCategory,
              height: r.height,
              arrowWidth: a.width,
              delta: Math.abs(r.top + r.height / 2 - (a.top + a.height / 2)),
              font: getComputedStyle(
                t.querySelector(
                  '[data-slot="select-value"],[data-slot="autocomplete-value"]',
                ),
              ).fontSize,
            };
          }),
        );
        for (const field of alignment) {
          assert.equal(field.height, 44);
          assert.equal(field.arrowWidth, 16);
          assert.ok(field.delta <= 1);
          assert.equal(field.font, '14px');
        }
        for (const layout of ['grid', 'masonry']) {
          await page.click(
            `loc=role:radio[name="${layout === 'grid' ? '网格' : '瀑布流'}"]`,
          );
          await page.evaluate(() =>
            document.querySelector('main').scrollTo(0, 0),
          );
          await page.waitForFunction(() =>
            [...document.querySelectorAll('[data-testid="library-card"] img')]
              .slice(0, 4)
              .every((i) => i.complete && i.naturalWidth > 0),
          );
          await settle();
          const geometry = await page.evaluate(() => ({
            overflow:
              document.querySelector('main').scrollWidth >
              document.querySelector('main').clientWidth,
            cards: [
              ...document.querySelectorAll('[data-testid="library-card"]'),
            ]
              .slice(0, 4)
              .map((e) => {
                const i = e.querySelector('img'),
                  s = getComputedStyle(e),
                  r = i.getBoundingClientRect();
                return {
                  corners: [
                    s.borderTopLeftRadius,
                    s.borderTopRightRadius,
                    s.borderBottomLeftRadius,
                    s.borderBottomRightRadius,
                  ],
                  fit: getComputedStyle(i).objectFit,
                  ratio: r.width / r.height,
                  natural: i.naturalWidth / i.naturalHeight,
                  overflow: e.scrollHeight > e.clientHeight,
                };
              }),
          }));
          assert.equal(geometry.overflow, false);
          for (const item of geometry.cards) {
            assert.deepEqual(item.corners, ['16px', '16px', '16px', '16px']);
            assert.equal(item.fit, 'cover');
            assert.equal(item.overflow, false);
            if (layout === 'masonry')
              assert.ok(
                Math.abs(item.ratio - item.natural) < 0.01,
                'Masonry matches decoded thumbnail proportions',
              );
          }
          report.combinations.push({ theme, width, layout, status: 'passed' });
          if ([390, 960, 1440].includes(width))
            await shot(`${theme}-${width}-${layout}`);
        }
      }
    }
    report.checks.push(
      'All six filter controls align at 44px/14px with centered 16px indicators. Six viewport widths in both themes keep four rounded card corners, no clipped content or horizontal overflow; grid fills without stretching and masonry matches actual decoded landscape/portrait thumbnails.',
    );
    await verifyLibraryContextEdges({ page, config, report });
  } finally {
    await sql(
      "DELETE FROM media_versions WHERE object_id GLOB 'feedback-issue173-*'",
    );
    await sql("DELETE FROM media_objects WHERE id GLOB 'feedback-issue173-*'");
    await rm(directory, { recursive: true, force: true });
    await page.cdp('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: originalScheme }],
    });
  }
}

export async function verifyLibraryContextEdges({ page, config, report }) {
  for (const theme of ['light', 'dark']) {
    await page.cdp('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: theme }],
    });
    await page.waitForFunction(
      (theme) => document.documentElement.classList.contains(theme),
      theme,
    );
    for (const [width, height] of [
      [1440, 600],
      [390, 844],
      [390, 560],
    ]) {
      await page.cdp('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false,
      });
      const target =
        '[data-testid="library-card"] [data-library-open] >> nth=1';
      await page.hover(target);
      const point = await page.evaluate(() => {
        const card = document.querySelectorAll(
          '[data-testid="library-card"]',
        )[1];
        const r = card.getBoundingClientRect();
        const main = document.querySelector('main').getBoundingClientRect();
        return {
          x: r.right - 10,
          y: Math.min(r.bottom - 10, main.bottom - 10),
          id: card.dataset.imageId,
        };
      });
      await page.mouse.click(point.x, point.y, { button: 'right' });
      await page.waitForSelector('[role="menu"][aria-label="已选图片操作"]');
      await page.waitForFunction(() =>
        document
          .getAnimations()
          .every(
            (a) =>
              a.playState !== 'running' ||
              a.effect?.getTiming().iterations === Infinity,
          ),
      );
      const geometry = await page.evaluate(() => {
        const popup = document
          .querySelector('[data-slot="dropdown-popover"]')
          .getBoundingClientRect();
        const main = document.querySelector('main').getBoundingClientRect();
        return {
          left: popup.left,
          top: popup.top,
          right: popup.right,
          bottom: popup.bottom,
          boundary: {
            left: main.left,
            top: main.top,
            right: main.right,
            bottom: main.bottom,
          },
          targets: [...document.querySelectorAll('[role="menuitem"]')].map(
            (e) => {
              const r = e.getBoundingClientRect();
              return {
                height: r.height,
                width: r.width,
                top: r.top,
                bottom: r.bottom,
              };
            },
          ),
        };
      });
      assert.ok(
        geometry.left >= geometry.boundary.left &&
          geometry.right <= geometry.boundary.right,
      );
      assert.ok(
        geometry.top >= geometry.boundary.top &&
          geometry.bottom <= geometry.boundary.bottom,
        'Context menu stays above footer and below public header',
      );
      for (const target of geometry.targets) {
        assert.ok(target.height >= (width < 1200 ? 44 : 36));
        assert.ok(target.width >= 44);
        assert.ok(
          target.top >= geometry.top && target.bottom <= geometry.bottom,
        );
      }
      const filename = `library-feedback-menu-edge-${theme}-${width}x${height}.png`;
      await page.screenshot({ path: join(config.output, filename) });
      report.screenshots.push(filename);
      await page.keyboard.press('Escape');
      await page.waitForSelector('[role="menu"]', { state: 'hidden' });
      assert.equal(
        await page.evaluate(() =>
          document.activeElement
            ?.closest('[data-image-id]')
            ?.getAttribute('data-image-id'),
        ),
        point.id,
      );
    }
  }
  report.checks.push(
    'Right/bottom context menus fit the main boundary at desktop 1440×600 and mobile 390×844/560 in both themes; every action is visible with its required target size and Escape restores the card.',
  );
}
