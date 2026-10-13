/* global taskSpace, config */
const assert = (await import('node:assert/strict')).default;
const { writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { identitySql } = await import(config.identitySessionScript);
const { seedLibraryBatch, cleanLibraryBatch, batchImageId } = await import(
  new URL('./library-batch-fixture.mjs', config.libraryDetailScript).href
);
const { signInToLibrary } = await import(
  new URL('./library-login.mjs', config.libraryDetailScript).href
);
const { resizeViewport } = await import(
  new URL('./browser-geometry.mjs', config.libraryDetailScript).href
);
const { installBrowserErrors, readBrowserErrors, isBrowserControlStop } =
  await import(config.errorsScript);
const page = (await taskSpace(config.spaceId)).page(config.pageLabel ?? 'p1');
const report = {
  status: 'failed',
  checks: [],
  traces: [],
  visibleEntryWindows: [],
  limitations: [
    'The existing search query key remounts the search field on submission; search focus behavior was not changed in this motion task.',
  ],
};
const search = 'input[aria-label="搜索图片名称"]';
const preferenceKey = 'ariso:library-preferences:v1';
const sql = (statement) => identitySql(config, statement);
let fixture, savedPreference, errorScript, failure;

async function navigate(path) {
  let nav = '.shell-navigation nav';
  if (await page.evaluate(() => innerWidth < 1200)) {
    await page.click('button[aria-label="菜单"]');
    nav = '[role="dialog"][aria-label="导航菜单"] nav';
    await page.waitForSelector(nav);
  }
  await page.click(`${nav} a[href="${path}"]`);
}

async function installReadControl() {
  await page.evaluate(() => {
    const original = window.fetch;
    let release;
    window.__libraryMotionRead = {
      held: false,
      holdNext: true,
      requests: 0,
      release() {
        release?.();
        this.held = false;
      },
      restore() {
        release?.();
        window.fetch = original;
      },
    };
    window.fetch = async (...args) => {
      const input = args[0];
      const url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
        location.href,
      );
      if (
        url.pathname !== '/api/images' ||
        (args[1]?.method ?? 'GET') !== 'GET'
      )
        return original(...args);
      // Read real production records, isolating this suite's own fixture.
      if (!url.searchParams.get('q')) url.searchParams.set('q', 'issue177-');
      window.__libraryMotionRead.requests++;
      const response = await original(url.href, args[1]);
      if (window.__libraryMotionRead.holdNext) {
        window.__libraryMotionRead.holdNext = false;
        await new Promise((resolve) => {
          release = resolve;
          window.__libraryMotionRead.held = true;
        });
      }
      return response;
    };
  });
}

async function observe() {
  await page.evaluate(() => {
    const samples = [];
    let frame;
    const tick = () => {
      samples.push({
        at: performance.now(),
        path: location.pathname,
        loadedCount: Number(
          document.querySelector('[data-testid="library-list"]')?.dataset
            .loadedCount,
        ),
        emptyOpacity: document.querySelector('[data-testid="library-empty"]')
          ? Number(
              getComputedStyle(
                document.querySelector('[data-testid="library-empty"]')
                  .parentElement,
              ).opacity,
            )
          : null,
        cards: [
          ...document.querySelectorAll('[data-testid="library-card"]'),
        ].map((card) => {
          const entry = card.closest('[data-library-entry]');
          const outer = card.closest('[role="listitem"]');
          const style = getComputedStyle(entry);
          const rect = outer.getBoundingClientRect();
          const transform = new DOMMatrix(style.transform);
          const layout = new DOMMatrix(getComputedStyle(outer).transform);
          const image = card.querySelector('img');
          const remembered = window.__libraryMotionImages?.get(
            card.dataset.imageId,
          );
          return {
            id: card.dataset.imageId,
            opacity: Number(style.opacity),
            x: rect.x,
            y: rect.y,
            entryY: transform.m42,
            layoutX: layout.m41,
            layoutY: layout.m42,
            imageLoaded: !!image?.complete && image.naturalWidth > 0,
            imageOpacity: image
              ? Number(getComputedStyle(image).opacity)
              : null,
            sameCard: remembered ? remembered.card === card : null,
            sameImage: remembered ? remembered.image === image : null,
          };
        }),
        busy: document
          .querySelector('[data-testid="library-gallery"]')
          ?.getAttribute('aria-busy'),
        skeleton: !!document.querySelector(
          'main [data-slot="skeleton"],main .skeleton',
        ),
        snapshots: document
          .getAnimations()
          .filter(
            (animation) =>
              animation.playState === 'running' &&
              animation.effect?.pseudoElement?.startsWith('::view-transition-'),
          ).length,
        overflow:
          document.documentElement.scrollWidth > innerWidth ||
          [...document.querySelectorAll('main,main section')].some(
            (node) => node.scrollWidth > node.clientWidth + 1,
          ),
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    window.__libraryMotionObservation = {
      stop() {
        cancelAnimationFrame(frame);
        return samples;
      },
    };
  });
}

async function collect(label) {
  await frames(35);
  const samples = await page.evaluate(() => {
    const samples = window.__libraryMotionObservation.stop();
    delete window.__libraryMotionObservation;
    return samples;
  });
  report.traces.push({ label, samples });
  assert.ok(samples.length > 1, `${label} records consecutive rendered frames`);
  assert.ok(
    samples.every((s) => !s.skeleton),
    'Library does not introduce skeleton placeholders',
  );
  assert.ok(
    samples.every((s) => !s.overflow),
    'Library has no horizontal overflow',
  );
  assert.ok(
    samples.every((s) => !s.snapshots),
    'Navigation has no native snapshot animation',
  );
  return samples;
}

async function frames(duration) {
  await page.evaluate(async (duration) => {
    const start = performance.now();
    while (performance.now() - start < duration)
      await new Promise(requestAnimationFrame);
  }, duration);
}

async function ready(count) {
  await page.waitForFunction(async (count) => {
    const list = document.querySelector('[data-testid="library-list"]');
    const gallery = document.querySelector('[data-testid="library-gallery"]');
    if (
      Number(list?.dataset.loadedCount) !== count ||
      gallery?.getAttribute('aria-busy') !== 'false'
    )
      return false;
    const settled = () =>
      [...document.querySelectorAll('[data-library-entry]')].every((entry) => {
        const style = getComputedStyle(entry);
        const outer = new DOMMatrix(
          getComputedStyle(entry.closest('[role="listitem"]')).transform,
        );
        return (
          Number(style.opacity) > 0.999 &&
          Math.abs(new DOMMatrix(style.transform).m42) < 0.1 &&
          Math.abs(outer.m41) < 0.1 &&
          Math.abs(outer.m42) < 0.1
        );
      });
    if (!settled()) return false;
    await new Promise(requestAnimationFrame);
    return settled();
  }, count);
}

function assertEntry(samples, label) {
  for (let index = 0; index < 4; index++) {
    const id = batchImageId(index);
    const visible = samples.flatMap((s) =>
      s.cards
        .filter((c) => c.id === id && c.opacity >= 0.1 && c.opacity <= 0.9)
        .map(() => s.at),
    );
    const durationMs = visible.length ? visible.at(-1) - visible[0] : 0;
    report.visibleEntryWindows.push({
      label,
      id,
      durationMs,
      frameCount: visible.length,
    });
    assert.ok(
      visible.length >= 8 && durationMs >= 250,
      `${id} visibly enters across at least 250ms and multiple frames (${label}: ${durationMs.toFixed(1)}ms, ${visible.length} frames)`,
    );
  }
}

function assertOpaque(samples, ids, message) {
  const known = new Set(ids);
  assert.ok(
    samples.every((s) =>
      s.cards.every((c) => !known.has(c.id) || c.opacity > 0.999),
    ),
    message,
  );
}

async function rememberImages() {
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[data-testid="library-card"] img')].every(
      (image) =>
        !image.complete ||
        !image.naturalWidth ||
        Number(getComputedStyle(image).opacity) > 0.999,
    ),
  );
  return page.evaluate(() => {
    window.__libraryMotionImages = new Map(
      [...document.querySelectorAll('[data-testid="library-card"]')].flatMap(
        (card) => {
          const image = card.querySelector('img');
          return image?.complete && image.naturalWidth
            ? [[card.dataset.imageId, { card, image }]]
            : [];
        },
      ),
    );
    return [...window.__libraryMotionImages.keys()];
  });
}

function assertImagesStable(samples, ids, label) {
  const known = new Set(ids);
  assert.ok(known.size > 0, `${label} observes real decoded images`);
  assert.ok(
    samples.every((sample) =>
      sample.cards.every(
        (card) =>
          !known.has(card.id) ||
          (card.sameCard &&
            card.sameImage &&
            card.imageLoaded &&
            card.imageOpacity > 0.999),
      ),
    ),
    `${label} retains the same decoded card/image nodes at full opacity`,
  );
  (report.stableImages ??= []).push({ label, ids });
}

async function heldCards(expected) {
  await page.waitForFunction(() => window.__libraryMotionRead.held);
  await frames(150);
  assert.deepEqual(
    await page.evaluate(
      (expected) => ({
        ids: expected.filter(
          (id) => !!document.querySelector(`[data-image-id="${id}"]`),
        ),
        busy: document
          .querySelector('[data-testid="library-gallery"]')
          ?.getAttribute('aria-busy'),
        opaque: [...document.querySelectorAll('[data-library-entry]')].every(
          (entry) => Number(getComputedStyle(entry).opacity) > 0.999,
        ),
      }),
      expected,
    ),
    { ids: expected, busy: 'true', opaque: true },
    'Pending reads retain the actual old cards at full opacity',
  );
  await page.evaluate(() => window.__libraryMotionRead.release());
}

async function filter(value) {
  await page.fill(search, value);
  await page.press(search, 'Enter');
}

async function menus(width) {
  const card = `[data-image-id="${batchImageId(0)}"]`;
  const origin = `${card} [data-library-open]`;
  const menu = '[role="menu"][aria-label="已选图片操作"]';
  await page.focus(origin);
  const point = await page.evaluate((selector) => {
    const r = document.querySelector(selector).getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + Math.min(65, r.height / 2) };
  }, card);
  report.stage = `pointer menu focus ${width}`;
  await page.mouse.click(point.x, point.y, { button: 'right' });
  await page.waitForSelector(menu);
  await page.waitForFunction(
    (selector) =>
      document.querySelector(selector)?.contains(document.activeElement),
    menu,
  );
  const rect = await page.evaluate((selector) => {
    const r = document.querySelector(selector).getBoundingClientRect();
    return {
      x: r.x,
      y: r.y,
      right: r.right,
      bottom: r.bottom,
      width: innerWidth,
      height: innerHeight,
    };
  }, menu);
  assert.ok(
    Math.abs(rect.x - point.x) < 32 && Math.abs(rect.y - point.y) < 32,
    'Context menu follows actual pointer coordinates',
  );
  assert.ok(
    rect.x >= 0 &&
      rect.y >= 0 &&
      rect.right <= rect.width + 1 &&
      rect.bottom <= rect.height + 1,
    'Context menu stays within viewport',
  );
  report.stage = `pointer menu dismissal ${width}`;
  await page.keyboard.press('Escape');
  await page.waitForSelector(menu, { state: 'hidden' });
  await page.waitForFunction(
    (selector) => document.activeElement === document.querySelector(selector),
    origin,
  );
  report.stage = `keyboard menu focus ${width}`;
  await page.keyboard.press('Shift+F10');
  await page.waitForSelector(menu);
  await page.waitForFunction(
    (selector) =>
      document.querySelector(selector)?.contains(document.activeElement),
    menu,
  );
  await page.keyboard.press('Escape');
  await page.waitForSelector(menu, { state: 'hidden' });
  await page.waitForFunction(
    (selector) => document.activeElement === document.querySelector(selector),
    origin,
  );
  assert.equal(
    await page.evaluate(
      (selector) => document.querySelector(selector).dataset.selected,
      card,
    ),
    'true',
    'Context menu retains its actual selected image',
  );
  report.checks.push(
    `Pointer menu placement, keyboard menu, selection and focus restoration at ${width}px`,
  );
}

try {
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
  fixture = await seedLibraryBatch(config, sql);
  // Keep the filtered subset inside both responsive virtual windows so the
  // reflow check observes existing cards rather than newly mounted results.
  for (let index = 4; index < 10; index++)
    await sql(
      `UPDATE media_images SET display_name='issue177-motion-keep-${index}.png' WHERE id='${batchImageId(index)}'`,
    );
  errorScript = await installBrowserErrors(page);
  for (const width of [1440, 390]) {
    report.stage = `entry ${width}`;
    await resizeViewport(page, width);
    await page.cdp('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
    });
    await page.evaluate(
      (key) =>
        localStorage.setItem(
          key,
          JSON.stringify({ layout: 'grid', loadingMode: 'more' }),
        ),
      preferenceKey,
    );
    await page.goto(`${config.origin}/upload`);
    await page.waitForSelector('.shell-content');
    await installReadControl();
    await observe();
    await navigate('/library');
    await page.waitForFunction(
      () =>
        window.__libraryMotionRead.held &&
        !!document.querySelector('[data-testid="library-loading"]'),
    );
    assert.equal(
      await page.evaluate(
        () => document.querySelectorAll('[data-testid="library-card"]').length,
      ),
      0,
    );
    await frames(100);
    await page.evaluate(() => window.__libraryMotionRead.release());
    await ready(40);
    const entry = await collect(`entry ${width}`);
    assertEntry(entry, `entry ${width}`);
    assert.ok(
      entry.some((s) => s.cards.some((c) => c.imageLoaded)),
      'Entry uses decoded real thumbnails',
    );
    const imageFrames = entry.flatMap((s) =>
      s.cards
        .filter(
          (c) =>
            c.id === batchImageId(0) &&
            c.imageLoaded &&
            c.imageOpacity >= 0.1 &&
            c.imageOpacity <= 0.9,
        )
        .map(() => s.at),
    );
    const imageDurationMs = imageFrames.length
      ? imageFrames.at(-1) - imageFrames[0]
      : 0;
    report.thumbnailEntryWindows ??= [];
    report.thumbnailEntryWindows.push({
      width,
      durationMs: imageDurationMs,
      frameCount: imageFrames.length,
    });
    assert.ok(
      imageFrames.length >= 8 && imageDurationMs >= 250,
      'The decoded real thumbnail smoothly appears across multiple frames for at least 250ms on a new gallery visit',
    );
    await page.screenshot({
      path: join(config.output, `library-motion-${width}.png`),
    });
    report.checks.push(
      `Continuous real card entry with no skeleton grid at ${width}px`,
    );

    report.stage = `filter ${width}`;
    const before = entry.at(-1).cards;
    const filterImages = await rememberImages();
    await observe();
    await page.evaluate(() => {
      window.__libraryMotionRead.holdNext = true;
    });
    await filter('issue177-motion-keep-');
    await heldCards(before.map((c) => c.id));
    await ready(6);
    const filtered = await collect(`filter ${width}`);
    assert.ok(
      filtered.every(
        (sample) =>
          sample.loadedCount !== 6 ||
          sample.cards.every((card) => /^issue177-00[4-9]$/.test(card.id)),
      ),
      'Once filtered results commit, removed cards do not linger for an exit animation',
    );
    assertOpaque(
      filtered,
      before.map((c) => c.id),
      'Filtering removes old cards immediately and never fades or re-enters retained cards',
    );
    assertImagesStable(filtered, filterImages, `filter ${width}`);
    const movedId = batchImageId(4);
    const oldPosition = before.find((c) => c.id === movedId);
    const positions = filtered.flatMap((s) =>
      s.cards.filter((c) => c.id === movedId),
    );
    assert.ok(
      oldPosition && positions.length > 2,
      'Retained image participates in the filtered layout',
    );
    const finalPosition = positions.at(-1);
    assert.ok(
      positions.some(
        (p) =>
          Math.abs(p.y - oldPosition.y) > 1 &&
          Math.abs(p.y - finalPosition.y) > 1,
      ),
      'Retained card visibly occupies intermediate layout positions',
    );
    report.checks.push(
      `Pending filter retains old images; removal has no fade-out and retained images reflow at ${width}px`,
    );

    await filter('issue177-');
    await ready(40);
    report.stage = `refresh ${width}`;
    const refreshImages = await rememberImages();
    await observe();
    const refreshIds = await page.evaluate(() =>
      [...document.querySelectorAll('[data-image-id]')].map(
        (node) => node.dataset.imageId,
      ),
    );
    await page.evaluate(() => {
      window.__libraryMotionRead.holdNext = true;
    });
    await page.click('loc=role:button[name="刷新图库"]');
    await heldCards(refreshIds);
    await ready(40);
    const refreshed = await collect(`refresh ${width}`);
    assertOpaque(
      refreshed,
      refreshIds,
      'Refresh retains old cards without replaying entry',
    );
    assertImagesStable(refreshed, refreshImages, `refresh ${width}`);
    report.checks.push(
      `Refresh retains the real first batch while awaiting its response at ${width}px`,
    );

    report.stage = `empty entry ${width}`;
    await observe();
    await filter('issue177-motion-no-matching-image');
    await page.waitForFunction(() => {
      const empty = document.querySelector('[data-testid="library-empty"]');
      return (
        empty && Number(getComputedStyle(empty.parentElement).opacity) > 0.999
      );
    });
    const empty = await collect(`empty entry ${width}`);
    assert.ok(
      empty.some(
        (sample) => sample.emptyOpacity > 0.1 && sample.emptyOpacity < 0.9,
      ),
      'The real zero-match state has intermediate entry opacity',
    );
    assert.equal(
      empty.at(-1).emptyOpacity,
      1,
      'The zero-match state becomes fully visible',
    );
    assert.ok(
      empty.every(
        (sample) => sample.emptyOpacity === null || sample.cards.length === 0,
      ),
      'Removed cards do not remain behind the entering empty state',
    );
    await filter('issue177-');
    await ready(40);
    report.checks.push(
      `The real zero-match state enters smoothly and filtering back restores cards at ${width}px`,
    );

    report.stage = `virtual scrolling ${width}`;
    await page.click('[data-testid="library-load-more"]');
    await ready(80);
    const target = batchImageId(8);
    await page.evaluate(() => {
      document.querySelector('main').scrollTop = 0;
    });
    await page.waitForSelector(`[data-image-id="${target}"]`);
    await page.evaluate(() => {
      document.querySelector('main').scrollTop = 4500;
    });
    await page.waitForFunction(
      (id) => !document.querySelector(`[data-image-id="${id}"]`),
      target,
    );
    await observe();
    await page.evaluate(() => {
      document.querySelector('main').scrollTop = 0;
    });
    await page.waitForSelector(`[data-image-id="${target}"]`);
    await ready(80);
    const remount = await collect(`virtual remount ${width}`);
    assert.ok(
      remount.some((s) => s.cards.some((c) => c.id === target)),
      'Virtualized image actually remounts',
    );
    assertOpaque(
      remount,
      Array.from({ length: 16 }, (_, index) => batchImageId(index)),
      'Returning virtual cards never restart their entry',
    );
    const decodedIds = new Set(
      before
        .filter((card) => card.imageLoaded && card.imageOpacity > 0.999)
        .map((card) => card.id),
    );
    assert.ok(
      decodedIds.has(target),
      'The virtual remount target was previously decoded',
    );
    assert.ok(
      remount.every((s) =>
        s.cards.every(
          (card) => !decodedIds.has(card.id) || card.imageOpacity > 0.999,
        ),
      ),
      'Previously decoded virtual thumbnails stay opaque on remount',
    );
    assert.ok(
      remount.every((sample) =>
        sample.cards.every(
          (card) => !decodedIds.has(card.id) || Math.abs(card.entryY) < 0.1,
        ),
      ),
      'Previously seen virtual cards do not replay entry movement',
    );
    report.checks.push(
      `A real DOM-unmounted image remains opaque after virtual scrolling back at ${width}px`,
    );

    report.stage = `layout and menus ${width}`;
    const layoutImages = await rememberImages();
    await observe();
    const requests = await page.evaluate(
      () => window.__libraryMotionRead.requests,
    );
    await page.click('loc=role:radio[name="瀑布流"]');
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="library-gallery"]')?.dataset
          .layout === 'masonry',
    );
    await ready(80);
    const layout = await collect(`layout ${width}`);
    assertOpaque(
      layout,
      before.map((c) => c.id),
      'Layout switch never replays image entry',
    );
    assertImagesStable(layout, layoutImages, `layout ${width}`);
    assert.equal(
      await page.evaluate(() => window.__libraryMotionRead.requests),
      requests,
      'Layout switch does not reread the collection',
    );
    await menus(width);

    report.stage = `return ${width}`;
    await observe();
    await navigate('/tags');
    await page.waitForFunction(() => location.pathname === '/tags');
    await page.evaluate(() => history.back());
    await page.waitForFunction(() => location.pathname === '/library');
    await ready(40);
    assertEntry(await collect(`return ${width}`), `return ${width}`);
    report.checks.push(
      `Leaving and returning uses component entry without native page snapshots at ${width}px`,
    );

    report.stage = `reduced motion ${width}`;
    await page.cdp('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
    await navigate('/tags');
    await page.waitForFunction(() => location.pathname === '/tags');
    await observe();
    await navigate('/library');
    await ready(40);
    const reduced = await collect(`reduced entry ${width}`);
    assert.ok(
      reduced.every((s) =>
        s.cards.every(
          (c) =>
            Math.abs(c.entryY) < 0.1 &&
            Math.abs(c.layoutX) < 0.1 &&
            Math.abs(c.layoutY) < 0.1,
        ),
      ),
      'Reduced motion disables all card travel and layout movement',
    );
    assert.ok(
      reduced.some((s) =>
        s.cards.some((c) => c.opacity > 0.1 && c.opacity < 0.9),
      ),
      'Reduced motion retains a real short opacity entry',
    );
    report.checks.push(
      `Reduced motion keeps a short fade-in with no card movement at ${width}px`,
    );
    await page.evaluate(() => window.__libraryMotionRead.restore());
  }
  report.browserErrors = await readBrowserErrors(page);
  assert.deepEqual(
    report.browserErrors,
    [],
    'No runtime, hydration or resource errors',
  );
  report.status = 'passed';
} catch (error) {
  failure = error;
  report.error = error.stack ?? String(error);
  if (!isBrowserControlStop(error))
    await page
      .screenshot({ path: join(config.output, 'library-motion-failure.png') })
      .catch(() => {});
} finally {
  if (!failure || !isBrowserControlStop(failure)) {
    await page.evaluate(
      ({ key, value }) => {
        window.__libraryMotionRead?.restore();
        window.__libraryMotionObservation?.stop();
        delete window.__libraryMotionRead;
        delete window.__libraryMotionObservation;
        delete window.__libraryMotionImages;
        if (value === null) localStorage.removeItem(key);
        else if (value !== undefined) localStorage.setItem(key, value);
      },
      { key: preferenceKey, value: savedPreference },
    );
    if (errorScript)
      await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
        identifier: errorScript,
      });
    await page.cdp('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
    });
  }
  if (fixture) await cleanLibraryBatch(sql, fixture);
  await writeFile(
    join(config.output, 'library-motion.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
if (failure) throw failure;
