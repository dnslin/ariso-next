/* global taskSpace, config */
const assert = (await import('node:assert/strict')).default;
const { randomUUID } = await import('node:crypto');
const { writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { identitySql } = await import(config.identitySessionScript);
const { seedLibraryBatch, cleanLibraryBatch, batchImageId } = await import(
  new URL('./library-batch-fixture.mjs', config.identitySessionScript).href
);
const { signInToLibrary } = await import(
  new URL('./library-login.mjs', config.identitySessionScript).href
);
const { resizeViewport } = await import(
  new URL('./browser-geometry.mjs', config.identitySessionScript).href
);
const { installReadControl } = await import(
  new URL('./read-control.mjs', config.identitySessionScript).href
);
const { installBrowserErrors, readBrowserErrors, isBrowserControlStop } =
  await import(config.errorsScript);
const page = (await taskSpace(config.spaceId)).page(config.pageLabel ?? 'p1');
const search = 'input[aria-label="搜索相册"]';
const prefix = `动画验证 ${randomUUID()}`;
const fixtures = [];
const report = { status: 'failed', checks: [], traces: [], fixtures };
let failure, errorScript, imageFixture;
const sql = (statement) => identitySql(config, statement);

async function navigate(path) {
  let nav = '.shell-navigation nav';
  if (await page.evaluate(() => innerWidth < 1200)) {
    await page.click('button[aria-label="菜单"]');
    nav = '[role="dialog"][aria-label="导航菜单"] nav';
    await page.waitForSelector(nav);
  }
  await page.click(`${nav} a[href="${path}"]`);
}

async function observe() {
  await page.evaluate(() => {
    const samples = [];
    let frame;
    const tick = () => {
      samples.push({
        at: performance.now(),
        path: location.pathname,
        cards: [...document.querySelectorAll('[data-testid="album-card"]')].map(
          (card) => {
            const surface = card.parentElement;
            const style = getComputedStyle(surface);
            const layoutStyle = getComputedStyle(surface.parentElement);
            const rect = surface.getBoundingClientRect();
            const transform = new DOMMatrix(style.transform);
            const layoutTransform = new DOMMatrix(layoutStyle.transform);
            const image = card.querySelector('img');
            const remembered = window.__albumMotionCover;
            return {
              id: card
                .querySelector('a[data-testid^="album-"]')
                ?.dataset.testid.slice(6),
              opacity: Number(style.opacity),
              x: rect.x,
              y: rect.y,
              translateX: transform.m41 + layoutTransform.m41,
              translateY: transform.m42 + layoutTransform.m42,
              entryTranslateY: transform.m42,
              layoutTranslateX: layoutTransform.m41,
              layoutTranslateY: layoutTransform.m42,
              imageLoaded: !!image?.complete && image.naturalWidth > 0,
              imageOpacity: image
                ? Number(getComputedStyle(image).opacity)
                : null,
              sameCard: remembered ? card === remembered.card : null,
              sameImage: remembered ? image === remembered.image : null,
            };
          },
        ),
        snapshots: document
          .getAnimations()
          .flatMap((animation) =>
            animation.effect?.pseudoElement?.startsWith('::view-transition-') &&
            animation.playState === 'running'
              ? [animation.effect.pseudoElement]
              : [],
          ),
        empty: !!document.querySelector('[data-testid="albums-empty"]'),
        emptyEntry: (() => {
          const entry = document.querySelector('[data-testid="albums-empty"]');
          if (!entry) return null;
          const style = getComputedStyle(entry);
          return {
            opacity: Number(style.opacity),
            y: new DOMMatrix(style.transform).m42,
          };
        })(),
        skeleton: !!document.querySelector('[data-slot="skeleton"],.skeleton'),
        overflow:
          document.documentElement.scrollWidth > innerWidth ||
          [...document.querySelectorAll('main,main section')].some(
            (node) => node.scrollWidth > node.clientWidth + 1,
          ),
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    window.__albumMotionObservation = {
      samples,
      stop() {
        cancelAnimationFrame(frame);
        return samples;
      },
    };
  });
}

async function collect(label) {
  await page.evaluate(async () => {
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
  const samples = await page.evaluate(() => {
    const samples = window.__albumMotionObservation.stop();
    delete window.__albumMotionObservation;
    return samples;
  });
  report.traces.push({ label, samples });
  assert.ok(
    samples.every((sample) => sample.path !== '/albums' || !sample.skeleton),
    'Albums do not introduce a skeleton grid',
  );
  assert.ok(
    samples.every((sample) => !sample.overflow),
    'Card animation does not cause horizontal overflow',
  );
  assert.ok(
    samples.every((sample) => sample.snapshots.length === 0),
    'Navigation has no native snapshot animation',
  );
  return samples;
}

async function cardsSettled(count) {
  await page.waitForFunction(async (count) => {
    const ready = () => {
      const cards = [
        ...document.querySelectorAll('[data-testid="album-card"]'),
      ];
      return (
        cards.length === count &&
        cards.every((card) => {
          const style = getComputedStyle(card.parentElement);
          const transform = new DOMMatrix(style.transform);
          const layoutTransform = new DOMMatrix(
            getComputedStyle(card.parentElement.parentElement).transform,
          );
          return (
            Number(style.opacity) > 0.999 &&
            Math.abs(transform.m42) < 0.1 &&
            Math.abs(transform.m41) < 0.1 &&
            Math.abs(layoutTransform.m42) < 0.1 &&
            Math.abs(layoutTransform.m41) < 0.1
          );
        })
      );
    };
    if (!ready()) return false;
    await new Promise(requestAnimationFrame);
    return (
      ready() &&
      !document.querySelector('[data-testid="albums-loading"]') &&
      document
        .querySelector('[data-testid="albums-list"]')
        ?.getAttribute('aria-busy') !== 'true'
    );
  }, count);
}

function assertVisibleEntry(samples, label) {
  report.visibleEntryWindows ??= [];
  for (const id of fixtures) {
    const visible = samples.flatMap((sample) =>
      sample.cards
        .filter(
          (card) =>
            card.id === id && card.opacity >= 0.1 && card.opacity <= 0.9,
        )
        .map((card) => ({ at: sample.at, opacity: card.opacity })),
    );
    const durationMs = visible.length ? visible.at(-1).at - visible[0].at : 0;
    report.visibleEntryWindows.push({
      label,
      id,
      frameCount: visible.length,
      durationMs,
    });
    assert.ok(
      visible.length >= 8 && durationMs >= 250,
      `Card ${id} remains visibly between 0.1 and 0.9 opacity for at least 250ms across multiple frames (${label}: ${visible.length} frames, ${durationMs.toFixed(1)}ms)`,
    );
  }
}

function assertNoFade(samples, message) {
  assert.ok(
    samples.every((sample) =>
      sample.cards.every((card) => card.opacity > 0.999),
    ),
    message,
  );
}

async function coverSettled() {
  await page.waitForFunction((id) => {
    const image = document.querySelector(
      `[data-testid="album-cover-${id}"] img`,
    );
    return (
      image?.complete &&
      image.naturalWidth > 0 &&
      Number(getComputedStyle(image).opacity) > 0.999
    );
  }, fixtures[1]);
}

async function rememberCover() {
  await coverSettled();
  await page.evaluate((id) => {
    const image = document.querySelector(
      `[data-testid="album-cover-${id}"] img`,
    );
    window.__albumMotionCover = {
      image,
      card: image.closest('[data-testid="album-card"]'),
    };
  }, fixtures[1]);
}

function assertCoverStable(samples, label) {
  const images = samples.flatMap((sample) =>
    sample.cards.filter((card) => card.id === fixtures[1]),
  );
  assert.ok(
    images.length > 1 &&
      images.every(
        (image) =>
          image.sameCard &&
          image.sameImage &&
          image.imageLoaded &&
          image.imageOpacity > 0.999,
      ),
    `${label} retains the same decoded cover/card nodes without another fade-in`,
  );
  (report.stableImages ??= []).push({
    label,
    albumId: fixtures[1],
    frames: images.length,
  });
}

async function emptySettled() {
  await page.waitForFunction(() => {
    const empty = document.querySelector('[data-testid="albums-empty"]');
    if (!empty) return false;
    const style = getComputedStyle(empty);
    return (
      Number(style.opacity) > 0.999 &&
      Math.abs(new DOMMatrix(style.transform).m42) < 0.1
    );
  });
}

async function refreshCover(width) {
  await rememberCover();
  // Change metadata without changing the real thumbnail URL, then let the
  // existing edit-success action invalidate the actual album list query.
  await sql(
    `UPDATE media_images SET display_name='Motion cover ${width}' WHERE id='${batchImageId(0)}'`,
  );
  await page.click(`button[aria-label="相册操作：${prefix} 保留二"]`);
  await page.click('loc=role:menuitem[name="编辑相册"]');
  await page.waitForSelector('#album-description');
  await page.fill('#album-description', `motion refresh ${width}`);
  await page.click('loc=role:button[name="保存"]');
  await page.waitForSelector('loc=role:button[name="返回相册"]');
  await observe();
  await page.evaluate(() => {
    window.__motionReadControl.pause(['/api/albums']);
  });
  await page.click('loc=role:button[name="返回相册"]');
  await page.waitForFunction(() => window.__motionReadControl.held);
  await page.evaluate(() => window.__motionReadControl.release());
  await cardsSettled(3);
  const samples = await collect(`cover metadata refresh ${width}`);
  assertNoFade(samples, 'Album refresh retains real card opacity');
  assertCoverStable(samples, `cover metadata refresh ${width}`);
  assert.equal(
    await page.evaluate(
      (id) =>
        document.querySelector(`[data-testid="album-cover-${id}"] img`).alt,
      fixtures[1],
    ),
    `Motion cover ${width}`,
    'The refreshed real cover metadata commits without remounting its image',
  );
  report.checks.push(
    `Real cover metadata refresh retains the decoded image at ${width}px`,
  );
}

function assertNoTravel(samples) {
  assert.ok(
    samples.every((sample) =>
      sample.cards.every(
        (card) =>
          Math.abs(card.translateY) < 0.1 &&
          Math.abs(card.translateX) < 0.1 &&
          Math.abs(card.entryTranslateY) < 0.1 &&
          Math.abs(card.layoutTranslateX) < 0.1 &&
          Math.abs(card.layoutTranslateY) < 0.1,
      ),
    ),
    'Reduced motion disables card travel and layout animation',
  );
}

async function backToAlbums(width) {
  await observe();
  await page.evaluate(() => history.back());
  await page.waitForFunction(() => location.pathname === '/albums');
  await cardsSettled(3);
  const back = await collect(`browser return ${width}`);
  assertVisibleEntry(back, `browser return ${width}`);
  report.checks.push(
    `Browser return keeps component fade-in without native snapshots at ${width}px`,
  );
}

async function menus(width) {
  const card = `[data-testid="album-${fixtures.at(-1)}"]`;
  const menu = '[role="menu"][aria-label="相册操作"]';
  // The real card owns the trigger; avoid coupling the test to intervening markup.
  const trigger = await page.evaluate((selector) => {
    const node = document
      .querySelector(selector)
      .closest('[data-testid="album-card"]')
      .querySelector('button');
    return `button[aria-label="${CSS.escape(node.getAttribute('aria-label'))}"]`;
  }, card);
  await page.click(trigger);
  await page.waitForSelector(menu);
  assert.deepEqual(
    await page.evaluate(
      (selector) =>
        [...document.querySelectorAll(`${selector} [role="menuitem"]`)].map(
          (node) => node.textContent.trim(),
        ),
      menu,
    ),
    ['打开相册', '编辑相册', '分享设置', '删除相册'],
  );
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    (selector) => document.activeElement === document.querySelector(selector),
    trigger,
  );
  await page.focus(card);
  const point = await page.evaluate((selector) => {
    const rect = document.querySelector(selector).getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + 48 };
  }, card);
  await page.mouse.click(point.x, point.y, { button: 'right' });
  await page.waitForSelector(menu);
  await page.waitForFunction(
    (selector) =>
      document.querySelector(selector)?.contains(document.activeElement),
    menu,
  );
  const placement = await page.evaluate(
    ({ selector, point }) => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      const anchor = [...document.body.children].find(
        (node) =>
          node.matches('span[aria-hidden]') &&
          getComputedStyle(node).position === 'fixed',
      );
      const anchorRect = anchor?.getBoundingClientRect();
      return {
        x: rect.x,
        y: rect.y,
        right: rect.right,
        bottom: rect.bottom,
        anchor: anchorRect ? { x: anchorRect.x, y: anchorRect.y } : null,
        point,
        width: innerWidth,
        height: innerHeight,
      };
    },
    { selector: menu, point },
  );
  assert.ok(
    placement.anchor,
    'Context menu anchor is attached directly to body',
  );
  assert.ok(
    Math.abs(placement.anchor.x - point.x) <= 1 &&
      Math.abs(placement.anchor.y - point.y) <= 1,
    'The portal anchor uses actual pointer viewport coordinates',
  );
  assert.ok(
    placement.x >= 0 &&
      placement.y >= 0 &&
      placement.right <= placement.width + 1 &&
      placement.bottom <= placement.height + 1,
    'The pointer menu stays inside the viewport',
  );
  assert.ok(
    Math.abs(placement.x - point.x) < 32 &&
      Math.abs(placement.y - point.y) < 32,
    'The pointer menu opens next to the actual click',
  );
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    (selector) => document.activeElement === document.querySelector(selector),
    card,
  );
  await page.keyboard.press('Shift+F10');
  await page.waitForSelector(menu);
  await page.click('loc=role:menuitem[name="编辑相册"]');
  await page.waitForSelector('loc=role:dialog[name="编辑相册"]');
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    (selector) => document.activeElement === document.querySelector(selector),
    card,
  );
  report.checks.push(
    `Real overflow click, pointer context menu coordinates, Shift+F10, edit dialog and focus restoration at ${width}px`,
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
  errorScript = await installBrowserErrors(page);
  for (const suffix of ['保留一', '保留二', '移除']) {
    const response = await page.fetch('/api/albums', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: `${prefix} ${suffix}`, description: '' }),
    });
    assert.equal(response.status, 201);
    fixtures.push(JSON.parse(response.body).album.id);
  }
  imageFixture = await seedLibraryBatch(config, sql);
  await sql("DELETE FROM albums WHERE id LIKE 'issue177-%'");
  await sql(
    `INSERT INTO album_images (album_id,image_id,joined_at) VALUES ('${fixtures[1]}','${batchImageId(0)}',${Date.now()})`,
  );
  for (const width of [1440, 390]) {
    report.stage = `enter ${width}`;
    await resizeViewport(page, width);
    await page.cdp('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
    });
    await page.goto(`${config.origin}/library`);
    await page.waitForSelector('[data-testid="library-list"]');
    await page.evaluate(installReadControl, { path: '/api/albums', q: prefix });
    await page.evaluate(() =>
      window.__motionReadControl.pause(['/api/albums']),
    );
    await navigate('/albums');
    await page.waitForFunction(
      () =>
        window.__motionReadControl.held &&
        !!document.querySelector('[data-testid="albums-loading"]'),
    );
    await observe();
    await page.evaluate(() => window.__motionReadControl.release());
    await cardsSettled(3);
    await coverSettled();
    const enter = await collect(`enter ${width}`);
    assertVisibleEntry(enter, `enter ${width}`);
    const imageFrames = enter.filter((sample) =>
      sample.cards.some(
        (card) =>
          card.id === fixtures[1] &&
          card.imageLoaded &&
          card.imageOpacity >= 0.1 &&
          card.imageOpacity <= 0.9,
      ),
    );
    const imageDuration = imageFrames.length
      ? imageFrames.at(-1).at - imageFrames[0].at
      : 0;
    assert.ok(
      imageFrames.length >= 8 && imageDuration >= 250,
      'A real decoded album cover visibly enters for at least 250ms',
    );
    (report.thumbnailEntryWindows ??= []).push({
      width,
      durationMs: imageDuration,
      frameCount: imageFrames.length,
    });
    await page.screenshot({
      path: join(config.output, `album-motion-${width}.png`),
    });
    report.checks.push(
      `Real card fade-in and plain loading text at ${width}px`,
    );

    report.stage = `filter and reflow ${width}`;
    await refreshCover(width);
    await rememberCover();
    const before = enter.findLast((sample) => sample.cards.length === 3).cards;
    const removed = fixtures.at(-1);
    const kept = before.filter((card) => card.id !== removed);
    await observe();
    await page.evaluate(() => {
      window.__motionReadControl.pause(['/api/albums']);
    });
    await page.fill(search, `${prefix} 保留`);
    await page.waitForFunction(() => window.__motionReadControl.held);
    assert.deepEqual(
      await page.evaluate(() => ({
        count: document.querySelectorAll('[data-testid="album-card"]').length,
        busy: document
          .querySelector('[data-testid="albums-list"]')
          .getAttribute('aria-busy'),
      })),
      { count: 3, busy: 'true' },
      'Pending searches retain the real previous cards',
    );
    await page.evaluate(() => window.__motionReadControl.release());
    await cardsSettled(2);
    const reflow = await collect(`filter and reflow ${width}`);
    assertCoverStable(reflow, `filter and reflow ${width}`);
    assertNoFade(
      reflow,
      'Removed cards disappear without fading; retained cards never fade in again',
    );
    const final = reflow.findLast((sample) => sample.cards.length === 2).cards;
    assert.deepEqual(
      new Set(final.map((card) => card.id)),
      new Set(kept.map((card) => card.id)),
    );
    assert.ok(
      final.some((card) => {
        const old = kept.find((item) => item.id === card.id);
        return reflow.some((sample) =>
          sample.cards.some(
            (current) =>
              current.id === card.id &&
              ['x', 'y'].some(
                (axis) =>
                  Math.abs(old[axis] - card[axis]) > 5 &&
                  current[axis] > Math.min(old[axis], card[axis]) + 0.5 &&
                  current[axis] < Math.max(old[axis], card[axis]) - 0.5,
              ),
          ),
        );
      }),
      'Remaining cards move through intermediate layout positions',
    );
    assert.ok(
      await page.evaluate(
        (selector) =>
          document.activeElement === document.querySelector(selector),
        search,
      ),
      'Filtering preserves search focus',
    );
    report.checks.push(
      `Pending data stays visible; removal has no fade; retained cards keep opacity and move smoothly at ${width}px`,
    );

    report.stage = `zero filter ${width}`;
    await observe();
    await page.fill(search, `${prefix} 不存在`);
    await cardsSettled(0);
    await page.waitForSelector('[data-testid="albums-empty"]');
    await emptySettled();
    const zero = await collect(`zero filter ${width}`);
    assertNoFade(
      zero,
      'Filtering to zero removes cards without opacity decline',
    );
    assert.ok(
      zero.some((sample) => sample.cards.length === 0 && sample.empty),
      'Empty content replaces removed cards',
    );
    const emptyFrames = zero.filter(
      (sample) =>
        sample.emptyEntry?.opacity >= 0.1 && sample.emptyEntry.opacity <= 0.9,
    );
    const emptyDuration = emptyFrames.length
      ? emptyFrames.at(-1).at - emptyFrames[0].at
      : 0;
    assert.ok(
      emptyFrames.length >= 8 && emptyDuration >= 250,
      'The real album empty state continuously enters for at least 250ms',
    );
    assert.ok(
      zero.some(
        (sample) => sample.emptyEntry?.y > 1 && sample.emptyEntry.y <= 10.5,
      ) && Math.abs(zero.at(-1).emptyEntry.y) < 0.1,
      'The real empty state moves from a small offset to its final position',
    );
    (report.emptyEntryWindows ??= []).push({
      width,
      durationMs: emptyDuration,
      frameCount: emptyFrames.length,
    });

    report.stage = `rapid filter ${width}`;
    await page.fill(search, '');
    await cardsSettled(3);
    await observe();
    await page.evaluate(() => {
      window.__motionReadControl.pause(['/api/albums']);
    });
    await page.fill(search, `${prefix} 快速不存在`);
    await page.waitForFunction(() => window.__motionReadControl.held);
    await page.fill(search, '');
    await page.evaluate(() => window.__motionReadControl.release());
    await cardsSettled(3);
    const rapid = await collect(`rapid filter ${width}`);
    assertNoFade(
      rapid,
      'Rapidly restored pending filters do not fade or remount the real cards',
    );
    assert.ok(
      rapid.every(
        (sample) =>
          new Set(sample.cards.map((card) => card.id)).size ===
          sample.cards.length,
      ),
      'Rapid filtering never duplicates cards',
    );
    report.checks.push(
      `Zero results and rapid filter restore have no fade-out or duplicate cards at ${width}px`,
    );

    report.stage = `menus ${width}`;
    await menus(width);
    report.stage = `direct navigation ${width}`;
    await observe();
    await navigate('/tags');
    await page.waitForSelector('#tags-title');
    const route = await collect(`direct navigation ${width}`);
    assertNoFade(
      route,
      'Outgoing route cards remain opaque until direct removal',
    );
    assert.equal(route.at(-1).cards.length, 0);
    await backToAlbums(width);
    await observe();
    await navigate('/tags');
    await navigate('/library');
    await page.waitForSelector('[data-testid="library-list"]');
    await collect(`continuous navigation ${width}`);
    assert.equal(
      await page.evaluate(() => location.pathname),
      '/library',
      'The final selected route wins',
    );
    report.checks.push(
      `Direct route removal and continuous navigation have no native animation at ${width}px`,
    );

    report.stage = `reduced motion ${width}`;
    await page.cdp('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
    await observe();
    await navigate('/albums');
    await cardsSettled(3);
    assertNoTravel(await collect(`reduced enter ${width}`));
    await observe();
    await page.fill(search, `${prefix} 保留`);
    await cardsSettled(2);
    const reducedFilter = await collect(`reduced filter ${width}`);
    assertNoTravel(reducedFilter);
    assertNoFade(
      reducedFilter,
      'Reduced motion also removes cards immediately and keeps remaining cards opaque',
    );
    await observe();
    await page.fill(search, `${prefix} 不存在`);
    await cardsSettled(0);
    const reducedZero = await collect(`reduced zero ${width}`);
    assertNoTravel(reducedZero);
    assertNoFade(reducedZero, 'Reduced motion has no card fade-out');
    await page.evaluate(() => {
      window.__motionReadControl.restore();
      delete window.__motionReadControl;
    });
    assert.deepEqual(await readBrowserErrors(page), []);
    report.checks.push(
      `Reduced motion disables layout travel and keeps removal immediate at ${width}px`,
    );
  }
  report.stage = 'reduced motion hard reload';
  await page.goto(`${config.origin}/albums?q=${encodeURIComponent(prefix)}`);
  await cardsSettled(3);
  assert.ok(
    await page.evaluate(
      () => matchMedia('(prefers-reduced-motion: reduce)').matches,
    ),
  );
  report.browserErrors = await readBrowserErrors(page);
  assert.deepEqual(report.browserErrors, []);
  report.checks.push(
    'Reduced motion hard reload hydrates without browser errors',
  );
  report.status = 'passed';
} catch (error) {
  failure = error;
  report.error = error.stack ?? String(error);
  if (!isBrowserControlStop(error))
    await page
      .screenshot({ path: join(config.output, 'album-motion-failure.png') })
      .catch(() => {});
} finally {
  if (!failure || !isBrowserControlStop(failure)) {
    await page.evaluate(() => {
      window.__motionReadControl?.restore();
      window.__albumMotionObservation?.stop();
      delete window.__motionReadControl;
      delete window.__albumMotionObservation;
      delete window.__albumMotionCover;
    });
    if (errorScript)
      await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
        identifier: errorScript,
      });
    await page.cdp('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
    });
  }
  for (const id of fixtures)
    await identitySql(
      config,
      `DELETE FROM albums WHERE id='${id.replaceAll("'", "''")}'`,
    );
  if (imageFixture) await cleanLibraryBatch(sql, imageFixture);
  await writeFile(
    join(config.output, 'album-motion.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
if (failure) throw failure;
