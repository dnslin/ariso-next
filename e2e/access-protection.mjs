/* global taskSpace, config */
const assert = (await import('node:assert/strict')).default;
const { writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { execFile } = await import('node:child_process');
const { promisify } = await import('node:util');
const { resizeViewport } = await import(config.geometryScript);
const { signInToLibrary } = await import(config.loginScript);
const { monitorViewerRequests, waitViewerNeighbors, restoreViewerFetch } =
  await import(
    new URL('./library-viewer-helpers.mjs', config.loginScript).href
  );
const { openIdentityAccountMenu } = await import(
  new URL('./identity-session.mjs', config.loginScript).href
);
const { installBrowserErrors, assertNoBrowserErrors, isBrowserControlStop } =
  await import(config.errorsScript);
const execute = promisify(execFile);
const task = await taskSpace(config.spaceId);
const page = task.page(config.pageLabel ?? 'p1');
const report = {
  status: 'failed',
  checks: [],
  layouts: [],
  limitations: [
    'Published Local and S3 protocol fixture bytes are isolated; this suite does not prove upload processing or real R2/SeaweedFS compatibility.',
    "Visitor pages use the configured canonical site origin after a real browser UI sign-out. Null browser sessions and the Node controller's separate surviving owner session are asserted; this is not a separate browser profile.",
    'S3 address reuse remains possible by design. This suite verifies no new Ariso proxying, not a hard bandwidth or cost ceiling.',
  ],
};
let visitor, embedA, embedB, failure, observer, visitorObserver;
const ownerTabs = [];
const owner = async (path, method = 'GET', input) => {
  const response = await fetch(new URL(path, config.origin), {
    method,
    headers: {
      cookie: config.ownerCookie,
      origin: config.origin,
      ...(input === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
    signal: AbortSignal.timeout(60000),
  });
  const body = await response.json();
  assert.equal(
    response.status,
    200,
    `${method} ${path}: ${JSON.stringify(body)}`,
  );
  return body;
};
async function defaults() {
  await owner('/api/settings/access-protection', 'PATCH', {
    mode: 'off',
    rate: 10,
    burst: 200,
  });
  await owner('/api/settings/access-protection', 'PATCH', {
    mode: 'enforce',
    rate: 10,
    burst: 200,
  });
}
async function exhaust() {
  await owner('/api/settings/access-protection', 'PATCH', {
    mode: 'off',
    rate: 1,
    burst: 1,
  });
  await owner('/api/settings/access-protection', 'PATCH', {
    mode: 'enforce',
    rate: 1,
    burst: 1,
  });
  const statuses = await Promise.all(
    Array.from({ length: 8 }, async () => {
      const response = await fetch(
        `${config.origin}/i/${config.localImageId}?type=original`,
      );
      await response.arrayBuffer();
      return response.status;
    }),
  );
  assert.ok(
    statuses.includes(429),
    'The anonymous budget is actually enforced',
  );
}
async function capture(label) {
  const screenshot = `${label}.png`;
  await page.screenshot({ path: join(config.output, screenshot) });
  report.layouts.push({ label, screenshot });
}
// Executed in the page. Overscan nodes are mounted but native lazy loading may
// legitimately leave their bytes unfetched until they enter the scroll viewport.
function galleryImageState({
  gallerySelector,
  imageSelector,
  scrollerSelector,
  inspect = false,
}) {
  const gallery = document.querySelector(gallerySelector);
  const scroller = scrollerSelector
    ? document.querySelector(scrollerSelector)
    : null;
  const root = scroller?.getBoundingClientRect();
  const clip = {
    left: Math.max(0, root?.left ?? 0),
    top: Math.max(0, root?.top ?? 0),
    right: Math.min(innerWidth, root?.right ?? innerWidth),
    bottom: Math.min(innerHeight, root?.bottom ?? innerHeight),
  };
  const images = [...document.querySelectorAll(imageSelector)].map((image) => {
    const rect = image.getBoundingClientRect();
    const visible =
      rect.width > 0 &&
      rect.height > 0 &&
      rect.right > clip.left &&
      rect.left < clip.right &&
      rect.bottom > clip.top &&
      rect.top < clip.bottom;
    return {
      id:
        image.closest('[data-image-id]')?.dataset.imageId ??
        image.closest('[data-share-item]')?.dataset.shareItem ??
        'cover',
      visible,
      complete: image.complete,
      naturalWidth: image.naturalWidth,
      rect: {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
      },
    };
  });
  const visible = images.filter((image) => image.visible);
  const ready =
    !!gallery &&
    (!scrollerSelector || !!scroller) &&
    gallery.getAttribute('aria-busy') !== 'true' &&
    visible.length > 0 &&
    visible.every((image) => image.complete && image.naturalWidth > 0);
  return inspect
    ? {
        ready,
        clip,
        visible,
        mounted: images.length,
        offscreen: images.filter((image) => !image.visible),
      }
    : ready;
}
const ownerImageSelectors = {
  gallerySelector: '[data-testid="library-gallery"]',
  imageSelector: '[data-testid="library-card"] img',
  scrollerSelector: '.shell-content',
};
const shareImageSelectors = {
  gallerySelector: '[data-testid="share-items"]',
  imageSelector: '[data-share-page] img[data-share-thumbnail]',
};
async function waitOwnerImages(target) {
  await target.waitForFunction(galleryImageState, ownerImageSelectors);
}
async function scrollOwner(target, fraction) {
  await target.evaluate(async (value) => {
    const main = document.querySelector('.shell-content');
    main.scrollTop = (main.scrollHeight - main.clientHeight) * value;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  }, fraction);
  await waitOwnerImages(target);
}
async function waitShareImages() {
  await visitor.waitForFunction(galleryImageState, shareImageSelectors);
  const state = await visitor.evaluate(galleryImageState, {
    ...shareImageSelectors,
    inspect: true,
  });
  return state.visible
    .filter((image) => image.id !== 'cover')
    .map((image) => image.id);
}
function viewerNavigationState({ selector, inspect = false }) {
  const viewer = document.querySelector(selector);
  const image = viewer?.querySelector('.yarl__slide_current img');
  const next = viewer?.querySelector('button[aria-label="下一张"]');
  const ready =
    !!viewer &&
    !!image?.complete &&
    image.naturalWidth > 0 &&
    !!next &&
    !next.disabled &&
    next.getAttribute('aria-disabled') !== 'true' &&
    next.getClientRects().length > 0;
  return inspect
    ? {
        ready,
        id: viewer?.dataset.imageId,
        version: viewer?.dataset.version,
        imageComplete: image?.complete,
        naturalWidth: image?.naturalWidth,
        nextPresent: !!next,
        nextDisabled: next?.disabled,
        nextAriaDisabled: next?.getAttribute('aria-disabled'),
        focusedElement:
          document.activeElement?.getAttribute('aria-label') ??
          document.activeElement?.className,
      }
    : ready;
}
async function settingsNoticeGeometry() {
  await page.waitForFunction(() => {
    const settings = document.querySelector(
      '[data-testid="access-protection-settings"]',
    );
    const notice = [...document.querySelectorAll('[data-slot="toast"]')].find(
      (node) =>
        node.textContent.includes('访问防护已保存') &&
        node.getClientRects().length &&
        !node.matches('[data-hidden="true"],[data-exiting="true"]'),
    );
    const settled = (animation) =>
      animation.playState !== 'running' ||
      animation.effect?.getTiming().iterations === Infinity;
    return (
      settings?.dataset.state === 'ready' &&
      settings.getAnimations({ subtree: true }).every(settled) &&
      notice &&
      !notice.hasAttribute('data-entering') &&
      notice.getAnimations().every(settled)
    );
  });
  const geometry = await page.evaluate(() => {
    const notice = [...document.querySelectorAll('[data-slot="toast"]')].find(
      (node) =>
        node.textContent.includes('访问防护已保存') &&
        node.getClientRects().length &&
        !node.matches('[data-hidden="true"],[data-exiting="true"]'),
    );
    const button = document.querySelector(
      '[data-testid="access-protection-save"]',
    );
    const toastRect = notice.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const footerRect = document
      .querySelector('.shell-footer')
      .getBoundingClientRect();
    const hit = document.elementFromPoint(
      buttonRect.x + buttonRect.width / 2,
      buttonRect.y + buttonRect.height / 2,
    );
    return {
      toast: toastRect.toJSON(),
      button: buttonRect.toJSON(),
      footer: footerRect.toJSON(),
      overlapsSave:
        toastRect.left < buttonRect.right &&
        toastRect.right > buttonRect.left &&
        toastRect.top < buttonRect.bottom &&
        toastRect.bottom > buttonRect.top,
      unobstructed: hit === button || button.contains(hit),
    };
  });
  assert.equal(
    geometry.overlapsSave,
    false,
    'The real success Toast must not overlap the fixed save button',
  );
  assert.equal(
    geometry.unobstructed,
    true,
    'The save action remains hit-testable while the success Toast is visible',
  );
  return geometry;
}
try {
  report.stage = 'owner-login';
  await page.goto(`${config.origin}/library?pageSize=80&page=1`);
  await page.waitForFunction(
    () =>
      location.pathname === '/login' ||
      !!document.querySelector('[data-testid="library-list"]'),
  );
  if (new URL(await page.url()).pathname === '/login')
    await signInToLibrary(page, config, report);
  observer = await installBrowserErrors(page);
  await page.cdp('Network.enable');
  await assertNoBrowserErrors(page);
  report.stage = 'owner-browsing-under-exhausted-budget';
  await exhaust();
  await page.goto(`${config.origin}/library?pageSize=80&page=1`);
  await page.waitForSelector('[data-testid="library-list"]');
  await resizeViewport(page, 1440, 1080);
  for (let number = 1; number <= 5; number++) {
    await page.waitForFunction(
      (expected) =>
        new URL(location.href).searchParams.get('page') === String(expected) &&
        document
          .querySelector('[data-testid="library-count"]')
          ?.textContent.includes('本页 80 张'),
      number,
    );
    await waitOwnerImages(page);
    for (const fraction of [1, 0, 0.6, 0]) await scrollOwner(page, fraction);
    if (number < 5)
      await page.click('nav[aria-label="图库分页"] button:has-text("下一页")');
  }
  await capture('access-owner-library');
  report.checks.push({
    scenario: 'owner-five-80-image-pages-after-anonymous-exhaustion',
    pages: 5,
    pageSize: 80,
    passed: true,
  });
  report.stage = 'owner-three-simultaneous-tabs';
  ownerTabs.push(await task.newPage(), await task.newPage());
  for (const extra of ownerTabs) await installBrowserErrors(extra);
  await Promise.all(
    ownerTabs.map((extra, index) =>
      extra.goto(`${config.origin}/library?pageSize=80&page=${index + 1}`),
    ),
  );
  for (const extra of ownerTabs) {
    await extra.waitForSelector('[data-testid="library-list"]');
    await resizeViewport(extra, 1440, 1080);
    await waitOwnerImages(extra);
    for (const fraction of [1, 0]) await scrollOwner(extra, fraction);
    await assertNoBrowserErrors(extra);
  }
  report.checks.push({
    scenario: 'owner-three-tabs-80-images-each',
    tabs: 3,
    passed: true,
  });
  while (ownerTabs.length) {
    await ownerTabs[0].close();
    ownerTabs.shift();
  }
  report.stage = 'owner-fullscreen';
  await page.click('css=[data-library-open] >> nth=0');
  await page.waitForSelector('[data-testid="detail-preview"]');
  await page.click('loc=role:tab[name="原图"]');
  await page.waitForFunction(() => {
    const selected = document.querySelector(
      '[role="tablist"][aria-label="查看版本"] [role="tab"][aria-selected="true"]',
    );
    const original = document.querySelector(
      '[data-testid="detail-preview"][src*="type=original"]',
    );
    return (
      selected?.textContent === '原图' &&
      original?.complete &&
      original.naturalWidth > 0
    );
  });
  const fullscreen = await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((button) => button.getAttribute('aria-label')?.includes('大图'))
      ?.getAttribute('aria-label'),
  );
  assert.ok(fullscreen, 'The detail exposes its existing full-image action');
  await monitorViewerRequests(page);
  await page.click(`loc=role:button[name=${JSON.stringify(fullscreen)}]`);
  await page.waitForSelector('[data-testid="image-viewer"]');
  report.ownerNavigation = [];
  for (let index = 0; index < 50; index++) {
    report.navigationProgress = {
      viewer: 'owner',
      step: index + 1,
      phase: 'waiting-ready',
    };
    await page.waitForFunction(viewerNavigationState, {
      selector: '[data-testid="image-viewer"]',
    });
    const state = await page.evaluate(viewerNavigationState, {
      selector: '[data-testid="image-viewer"]',
      inspect: true,
    });
    if (index === 0) {
      assert.equal(
        state.version,
        'original',
        'The initial viewer inherits the version selected in detail',
      );
      report.ownerInitialVersion = state.version;
    }
    const previousId = state.id;
    const neighbors = await waitViewerNeighbors(page, previousId);
    const nextId = neighbors.next?.id;
    assert.ok(nextId, 'The current viewer has a confirmed next image');
    const action = index < 3 ? 'keyboard' : 'button';
    report.navigationProgress = {
      viewer: 'owner',
      step: index + 1,
      phase: 'navigating',
      from: previousId,
      fromVersion: state.version,
      action,
    };
    if (action === 'keyboard') {
      await page.focus('[data-testid="image-viewer"] .yarl__container');
      await page.keyboard.press('ArrowRight');
    } else {
      await page.click(
        '[data-testid="image-viewer"] button[aria-label="下一张"]',
      );
    }
    await page.waitForFunction((id) => {
      const viewer = document.querySelector('[data-testid="image-viewer"]');
      const image = viewer?.querySelector('.yarl__slide_current img');
      return (
        viewer?.dataset.imageId === id &&
        image?.complete &&
        image.naturalWidth > 0 &&
        !document.querySelector('[data-testid="viewer-navigation-error"]')
      );
    }, nextId);
    const current = await page.evaluate(viewerNavigationState, {
      selector: '[data-testid="image-viewer"]',
      inspect: true,
    });
    report.ownerNavigation.push({
      step: index + 1,
      from: previousId,
      to: current.id,
      fromVersion: state.version,
      version: current.version,
      action,
    });
    report.navigationProgress = {
      viewer: 'owner',
      step: index + 1,
      phase: 'decoded',
      from: previousId,
      to: current.id,
      version: current.version,
      action,
    };
  }
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-testid="image-viewer"]', {
    state: 'hidden',
  });
  await restoreViewerFetch(page);
  report.checks.push({
    scenario: 'owner-viewer-50-next-after-anonymous-exhaustion',
    passed: true,
  });

  report.stage = 'owner-native-200-zip';
  await exhaust();
  const prepared = await owner('/api/images/archives', 'POST', {
    ids: config.archiveIds,
    query: '',
    version: 'original',
  });
  const pending = page.waitForEvent('download', { timeout: 60000 });
  await page.evaluate((url) => {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = '';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  }, prepared.downloadUrl);
  const download = await pending;
  const zip = join(config.output, 'access-owner-mixed-200.zip');
  await download.saveAs(zip);
  assert.equal(await download.failure(), null);
  const inspected = await execute('/usr/bin/python3', [
    '-c',
    'import json,sys,zipfile\nwith zipfile.ZipFile(sys.argv[1]) as z:\n assert z.testzip() is None\n print(json.dumps({"count":len(z.namelist()),"bytes":sum(i.file_size for i in z.infolist())}))',
    zip,
  ]);
  const archive = JSON.parse(inspected.stdout);
  assert.equal(archive.count, 200);
  assert.ok(archive.bytes > 0);
  report.checks.push({ scenario: 'native-mixed-200-zip', ...archive });

  report.stage = 'settings-ui';
  await page.goto(`${config.origin}/settings/general/access-protection`);
  await page.waitForSelector(
    '[data-testid="access-protection-settings"][data-state="ready"]',
  );
  await page.click('loc=role:button[name="使用建议值"]');
  await page.click('text="仅观察"');
  await page.click('[data-testid="access-protection-save"]');
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="access-protection-settings"]')
        .dataset.state === 'ready' &&
      document.body.innerText.includes('当前：仅观察'),
  );
  const saved = await owner('/api/settings/access-protection');
  assert.deepEqual(
    { mode: saved.mode, rate: saved.rate, burst: saved.burst },
    { mode: 'observe', rate: 10, burst: 200 },
  );
  const desktopNotice = await settingsNoticeGeometry();
  await capture('access-settings-desktop');
  await resizeViewport(page, 390, 844);
  await page.click('[data-testid="access-protection-save"]');
  const mobileNotice = await settingsNoticeGeometry();
  await capture('access-settings-mobile');
  report.checks.push({
    scenario: 'real-owner-settings-save',
    saved: { mode: saved.mode, rate: saved.rate, burst: saved.burst },
    toast: { desktop: desktopNotice, mobile: mobileNotice },
    passed: true,
  });

  report.stage = 'browser-owner-sign-out';
  assert.equal(
    config.anonymousOrigin,
    config.origin,
    'Anonymous share refresh uses the configured canonical origin',
  );
  const controllerSessionBefore = await owner('/api/auth/get-session');
  const browserSessionBefore = await page.fetch('/api/auth/get-session');
  assert.equal(browserSessionBefore.status, 200);
  const browserSession = JSON.parse(browserSessionBefore.body);
  assert.ok(
    controllerSessionBefore?.session?.id && browserSession?.session?.id,
    'Both independently created owner sessions are valid before logout',
  );
  assert.notEqual(
    browserSession.session.id,
    controllerSessionBefore.session.id,
    'Browser sign-in must not reuse the Node controller session',
  );
  await openIdentityAccountMenu(page);
  await page.click('loc=role:button[name="退出登录"]');
  await page.waitForURL(`${config.origin}/login?reason=signed-out`);
  const browserSessionAfter = await page.fetch('/api/auth/get-session');
  assert.equal(browserSessionAfter.status, 200);
  assert.equal(
    JSON.parse(browserSessionAfter.body),
    null,
    'The real browser session was revoked and its Cookie cleared',
  );
  const controllerSettings = await owner('/api/settings/access-protection');
  assert.equal(
    controllerSettings.mode,
    'observe',
    'The controller still has owner-only settings access after browser logout',
  );
  const controllerSessionAfter = await owner('/api/auth/get-session');
  assert.equal(
    controllerSessionAfter.session.id,
    controllerSessionBefore.session.id,
    'Browser logout leaves the independent Node owner session valid',
  );
  report.checks.push({
    scenario: 'canonical-visitor-after-real-browser-sign-out',
    browserSession: 'null',
    independentControllerSession: 'preserved',
  });

  report.stage = 'anonymous-200-album';
  await defaults();
  visitor = await task.newPage();
  visitorObserver = await installBrowserErrors(visitor);
  await visitor.goto(`${config.anonymousOrigin}/s/${config.shareToken}`);
  await visitor.waitForSelector('[data-testid="share-items"]');
  await resizeViewport(visitor, 1440, 1080);
  const visitorSession = await visitor.fetch('/api/auth/get-session');
  assert.equal(visitorSession.status, 200);
  assert.equal(JSON.parse(visitorSession.body), null);
  for (let loaded = 80; loaded <= 200; loaded += 40) {
    await visitor.click('[data-testid="share-load-more"]');
    await visitor.waitForFunction(
      (count) =>
        Number(
          document.querySelector('[data-testid="share-items"]').dataset
            .shareLoadedCount,
        ) === count,
      loaded,
    );
  }
  await visitor.waitForFunction(
    () => !document.querySelector('[data-testid="share-load-error"]'),
  );
  report.checks.push({
    scenario: 'anonymous-album-five-pages-200-items',
    passed: true,
  });
  report.stage = 'anonymous-visible-thumbnails';
  const seen = new Set();
  for (const fraction of [0, 0.25, 0.5, 0.75, 1, 0]) {
    await visitor.evaluate(async (value) => {
      const scrolling = document.scrollingElement;
      scrolling.scrollTop =
        (scrolling.scrollHeight - scrolling.clientHeight) * value;
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    }, fraction);
    for (const id of await waitShareImages()) seen.add(id);
  }
  assert.ok(
    seen.size > 40,
    'Scrolling verifies decoded thumbnails beyond the first album batch',
  );
  report.checks.push({
    scenario: 'anonymous-visible-thumbnails-after-five-batches',
    distinctDecodedVisibleImages: seen.size,
    passed: true,
  });
  report.stage = 'anonymous-viewer-20-next';
  await visitor.click('css=[data-share-open] >> nth=0');
  await visitor.waitForSelector('[data-testid="share-viewer"]');
  report.anonymousNavigation = [];
  for (let index = 0; index < 20; index++) {
    report.navigationProgress = {
      viewer: 'anonymous',
      step: index + 1,
      phase: 'waiting-ready',
    };
    await visitor.waitForFunction(viewerNavigationState, {
      selector: '[data-testid="share-viewer"]',
    });
    const state = await visitor.evaluate(viewerNavigationState, {
      selector: '[data-testid="share-viewer"]',
      inspect: true,
    });
    const previousId = state.id;
    report.navigationProgress = {
      viewer: 'anonymous',
      step: index + 1,
      phase: 'navigating',
      from: previousId,
      action: 'button',
    };
    await visitor.click('[data-testid="share-viewer-next"]');
    await visitor.waitForFunction((id) => {
      const viewer = document.querySelector('[data-testid="share-viewer"]');
      const image = viewer?.querySelector('.yarl__slide_current img');
      return (
        viewer?.dataset.imageId !== id &&
        image?.complete &&
        image.naturalWidth > 0 &&
        !document.querySelector('[data-testid="share-viewer-error"]')
      );
    }, previousId);
    const current = await visitor.evaluate(viewerNavigationState, {
      selector: '[data-testid="share-viewer"]',
      inspect: true,
    });
    report.anonymousNavigation.push({
      step: index + 1,
      from: previousId,
      to: current.id,
      action: 'button',
    });
    report.navigationProgress = {
      viewer: 'anonymous',
      step: index + 1,
      phase: 'decoded',
      from: previousId,
      to: current.id,
      action: 'button',
    };
  }
  await visitor.click('[data-testid="share-viewer-close"]');
  await visitor.waitForSelector('[data-testid="share-viewer"]', {
    state: 'hidden',
  });
  report.visitorErrors = await assertNoBrowserErrors(visitor);
  report.checks.push({
    scenario: 'anonymous-viewer-20-next-with-neighbor-preload',
    passed: true,
  });

  report.stage = 'two-real-external-embed-pages';
  await defaults();
  embedA = await task.newPage();
  embedB = await task.newPage();
  await Promise.all([
    embedA.goto(`${config.embedOrigin}/embed?tab=1`),
    embedB.goto(`${config.embedOrigin}/embed?tab=2&no-referrer=1`),
  ]);
  for (const embedded of [embedA, embedB]) {
    await embedded.waitForFunction(
      () =>
        document.images.length === 80 &&
        [...document.images].every(
          (image) => image.complete && image.naturalWidth > 0,
        ),
      undefined,
      { timeout: 30000 },
    );
  }
  await embedA.screenshot({
    path: join(config.output, 'access-external-80.png'),
  });
  report.checks.push({
    scenario: 'external-80-plus-80-local-and-s3-images',
    loaded: 160,
    referrerVariants: ['normal', 'no-referrer'],
  });
  report.browserErrors = await assertNoBrowserErrors(page);
  report.status = 'passed';
} catch (error) {
  failure = error;
  report.error = error.stack ?? String(error);
  if (!isBrowserControlStop(error)) {
    try {
      report.failedOwnerViewer = await page.evaluate(viewerNavigationState, {
        selector: '[data-testid="image-viewer"]',
        inspect: true,
      });
      if (visitor)
        report.failedAnonymousViewer = await visitor.evaluate(
          viewerNavigationState,
          { selector: '[data-testid="share-viewer"]', inspect: true },
        );
      report.failedOwnerImages = await page.evaluate(galleryImageState, {
        ...ownerImageSelectors,
        inspect: true,
      });
      if (visitor)
        report.failedVisitorImages = await visitor.evaluate(galleryImageState, {
          ...shareImageSelectors,
          inspect: true,
        });
      if (visitor)
        await visitor.screenshot({
          path: join(config.output, 'access-protection-visitor-failure.png'),
        });
      await page.screenshot({
        path: join(config.output, 'access-protection-failure.png'),
      });
      report.failureSnapshot = await page.snapshot();
    } catch {
      /* Preserve the original failure if the browser is unavailable. */
    }
  }
} finally {
  if (!isBrowserControlStop(failure)) {
    if (visitor && visitorObserver)
      await visitor.cdp('Page.removeScriptToEvaluateOnNewDocument', {
        identifier: visitorObserver,
      });
    for (const extra of [embedB, embedA, visitor, ...ownerTabs])
      if (extra) await extra.close();
    if (observer)
      await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
        identifier: observer,
      });
    await page.cdp('Emulation.clearDeviceMetricsOverride');
  }
  await writeFile(
    join(config.output, 'access-protection.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
if (failure) throw failure;
console.log({
  status: report.status,
  checks: report.checks.length,
  taskSpaceId: task.spaceId,
});
