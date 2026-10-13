/* global taskSpace, config */
const assert = (await import('node:assert/strict')).default;
const { writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const sibling = (name) =>
  new URL(`./${name}.mjs`, config.identitySessionScript).href;
const { identitySql } = await import(config.identitySessionScript);
const { seedLibraryBatch, cleanLibraryBatch, batchImageId } = await import(
  sibling('library-batch-fixture')
);
const { signInToLibrary } = await import(sibling('library-login'));
const { resizeViewport } = await import(sibling('browser-geometry'));
const { installBrowserErrors, readBrowserErrors, isBrowserControlStop } =
  await import(config.errorsScript);
const page = (await taskSpace(config.spaceId)).page(config.pageLabel ?? 'p1');
const report = {
  status: 'failed',
  checks: [],
  traces: [],
  visibleEntryWindows: [],
  screenshots: [],
  limitations: [
    'Processing has a deliberately static title because its loading and ready roots differ; only its real ready form groups enter.',
    'Settings category navigation retains its existing Tabs/Select behavior and is not animated as one page surface.',
    'Reduced-motion behavior is sampled on upload, analytics, tags and storage at both widths. Every listed route is checked in normal motion at both widths.',
    'Viewport emulation does not establish physical-device or release-container acceptance; historical full business suites are outside this directed motion check.',
  ],
};
const sql = (statement) => identitySql(config, statement);
const button = (name) => `loc=role:button[name="${name}"]`;
const scenes = [
  {
    path: '/upload',
    targets: {
      heading: '#upload-title',
      content: '[data-testid="upload-picker"]',
      settings: '[data-testid="upload-settings"]',
    },
  },
  {
    path: '/dashboard',
    targets: {
      heading: 'main h1',
      toolbar: 'button[aria-label="刷新总览"]',
      content: '[data-testid="dashboard-metrics"]',
    },
    refresh: '刷新总览',
    reads: ['/api/analytics/overview', '/api/analytics/usage'],
  },
  {
    path: '/analytics',
    targets: {
      heading: 'main h1',
      toolbar: 'button[aria-label="刷新访问统计"]',
      content: '[data-testid="analytics-metrics"]',
    },
    refresh: '刷新访问统计',
    reads: ['/api/analytics/overview'],
  },
  {
    path: '/tags',
    targets: {
      heading: '#tags-title',
      toolbar: 'input[aria-label="搜索标签名称"]',
      content: '[data-testid="tags-list"]',
    },
    filter: 'input[aria-label="搜索标签名称"]',
    query: 'Issue 177',
    reads: ['/api/tags'],
  },
  {
    path: '/shares',
    targets: {
      heading: 'main h1',
      toolbar: 'input[aria-label="搜索分享相册"]',
      content: '[data-testid="shares-list"]',
    },
    filter: 'input[aria-label="搜索分享相册"]',
    query: 'Issue 177',
    reads: ['/api/shares'],
  },
  {
    path: '/trash',
    targets: {
      heading: 'main h1',
      toolbar: '[data-testid="library-toolbar"]',
      content: '[data-trash-image-id="issue177-180"]',
    },
    refresh: '刷新回收站',
    reads: ['/api/images'],
  },
  {
    path: '/settings/storage',
    targets: {
      heading: 'main h1',
      content: '[data-testid="storage-list"] article',
    },
  },
  {
    path: '/settings/general',
    targets: { heading: 'main h1', content: '#site-settings-form' },
  },
  {
    path: '/settings/processing',
    category: '图片处理',
    // Loading and ready render different root components here. The real
    // form groups enter; their shared page title deliberately stays static.
    targets: { content: '#processing-form h2' },
  },
  {
    path: '/settings/account',
    category: '账号与安全',
    targets: { heading: 'main h1', content: '[data-testid="account-email"]' },
  },
  {
    path: '/settings/api',
    category: '上传 API',
    targets: { heading: 'main h1', content: '[data-testid="api-list"]' },
  },
  {
    path: '/settings/email',
    category: '邮件服务',
    targets: { heading: 'main h1', content: '#smtp-heading' },
  },
];
let fixture, tokenId, s3Id, localId, errorScript, failure;

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
  assert.ok(
    response.status >= 200 && response.status < 300,
    `${method} ${path}: HTTP ${response.status}`,
  );
  return response.body ? JSON.parse(response.body) : null;
}

async function navigate(scene) {
  if (scene.category) {
    if (await page.evaluate(() => innerWidth < 768)) {
      await page.click('.settings-mobile button[data-slot="select-trigger"]');
      await page.waitForSelector('[role="listbox"]');
      await page.click(`loc=role:option[name="${scene.category}"]`);
    } else await page.click(`loc=role:tab[name="${scene.category}"]`);
  } else {
    let nav = '.shell-navigation nav';
    if (await page.evaluate(() => innerWidth < 1200)) {
      await page.click('button[aria-label="菜单"]');
      nav = '[role="dialog"][aria-label="导航菜单"] nav';
      await page.waitForSelector(nav);
    }
    await page.click(`${nav} a[href="${scene.path}"]`);
  }
  await page.waitForFunction((path) => location.pathname === path, scene.path);
}

async function installReadControl() {
  await page.evaluate(() => {
    const original = window.fetch;
    const releases = [];
    window.__adminMotionRead = {
      paths: [],
      held: 0,
      release() {
        releases.splice(0).forEach((resolve) => resolve());
        this.held = 0;
        this.paths = [];
      },
      restore() {
        this.release();
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
      const response = await original(...args);
      if (
        (args[1]?.method ?? 'GET') === 'GET' &&
        window.__adminMotionRead.paths.includes(url.pathname)
      ) {
        await new Promise((resolve) => {
          releases.push(resolve);
          window.__adminMotionRead.held++;
        });
      }
      return response;
    };
  });
}

async function observe(scene) {
  await page.evaluate((scene) => {
    const samples = [];
    const longTasks = [];
    const performanceObserver = new PerformanceObserver((list) => {
      longTasks.push(
        ...list.getEntries().map(({ startTime, duration, name }) => ({
          startTime,
          duration,
          name,
        })),
      );
    });
    performanceObserver.observe({ type: 'longtask' });
    const identities = new WeakMap();
    let id = 0,
      frame;
    const identify = (element) => {
      if (!identities.has(element)) identities.set(element, ++id);
      return identities.get(element);
    };
    const outgoing = [
      ...document.querySelectorAll('main [data-component-entry]'),
    ].map(identify);
    const tick = () => {
      const entries = [
        ...document.querySelectorAll('main [data-component-entry]'),
      ]
        .filter((element) => element.getClientRects().length)
        .map((element) => {
          const style = getComputedStyle(element);
          const transform = new DOMMatrix(style.transform);
          return {
            id: identify(element),
            opacity: Number(style.opacity),
            y: transform.m42,
            x: transform.m41,
          };
        });
      const targets = Object.fromEntries(
        Object.entries(scene.targets).map(([name, selector]) => {
          const target = [...document.querySelectorAll(selector)].find(
            (node) => node.getClientRects().length,
          );
          const entry =
            target?.closest('[data-component-entry]') ??
            target?.querySelector('[data-component-entry]');
          return [name, entry ? identify(entry) : null];
        }),
      );
      samples.push({
        at: performance.now(),
        path: location.pathname,
        entries,
        targets,
        images: (window.__adminMotionRetained?.images ?? []).map((image) => ({
          connected: image.isConnected,
          loaded: image.complete && image.naturalWidth > 0,
          opacity: image.isConnected
            ? Number(getComputedStyle(image).opacity)
            : null,
        })),
        skeleton: !!document.querySelector(
          'main [data-slot="skeleton"],main .skeleton',
        ),
        mainEntry: !!document.querySelector('main[data-component-entry]'),
        overflow:
          document.documentElement.scrollWidth > innerWidth ||
          document.querySelector('main')?.scrollWidth >
            document.querySelector('main')?.clientWidth + 1,
        snapshots: document
          .getAnimations()
          .filter(
            (a) =>
              a.playState === 'running' &&
              a.effect?.pseudoElement?.startsWith('::view-transition-'),
          ).length,
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    window.__adminMotionObservation = {
      stop() {
        cancelAnimationFrame(frame);
        performanceObserver.disconnect();
        return { samples, outgoing, targetPath: scene.path, longTasks };
      },
    };
  }, scene);
}

async function ready(scene) {
  await page.waitForFunction(async (scene) => {
    if (location.pathname !== scene.path) return false;
    for (const selector of Object.values(scene.targets)) {
      const node = [...document.querySelectorAll(selector)].find(
        (node) => node.getClientRects().length,
      );
      if (
        !node ||
        !(
          node.closest('[data-component-entry]') ??
          node.querySelector('[data-component-entry]')
        )
      )
        return false;
    }
    const settled = () =>
      [...document.querySelectorAll('main [data-component-entry]')].every(
        (entry) => {
          const style = getComputedStyle(entry);
          const matrix = new DOMMatrix(style.transform);
          return (
            Number(style.opacity) > 0.999 &&
            Math.abs(matrix.m41) < 0.1 &&
            Math.abs(matrix.m42) < 0.1
          );
        },
      );
    if (!settled()) return false;
    await new Promise(requestAnimationFrame);
    return settled();
  }, scene);
}

async function frames(duration = 120) {
  await page.evaluate(async (duration) => {
    const start = performance.now();
    while (performance.now() - start < duration)
      await new Promise(requestAnimationFrame);
  }, duration);
}

async function collect(label) {
  await frames(35);
  const trace = await page.evaluate(() => {
    const trace = window.__adminMotionObservation.stop();
    delete window.__adminMotionObservation;
    return trace;
  });
  report.traces.push({ label, ...trace });
  const current = trace.samples.filter(
    (sample) => sample.path === trace.targetPath,
  );
  assert.ok(current.length > 1, `${label} has consecutive rendered frames`);
  assert.ok(
    current.every((s) => !s.skeleton),
    `${label} has no skeleton replacement`,
  );
  assert.ok(
    current.every((s) => !s.mainEntry),
    `${label} does not animate the whole main element`,
  );
  assert.ok(
    current.every((s) => !s.overflow),
    `${label} has no horizontal overflow`,
  );
  assert.ok(
    trace.samples.every((s) => !s.snapshots),
    `${label} has no native page snapshot animation`,
  );
  const outgoing = new Set(trace.outgoing);
  assert.ok(
    trace.samples.every((s) =>
      s.entries.every((e) => !outgoing.has(e.id) || e.opacity > 0.999),
    ),
    `${label} removes outgoing components without fading them out`,
  );
  return trace.samples;
}

function assertEntry(samples, scene, label, reduced) {
  const relevant = samples.filter((s) => s.path === scene.path);
  const final = relevant.at(-1);
  assert.ok(final, `${label} reaches the production route`);
  const ids = Object.values(final.targets);
  assert.ok(
    ids.every(Boolean),
    `${label} maps actual content to component entries`,
  );
  assert.equal(
    new Set(ids).size,
    ids.length,
    `${label} gives heading, toolbar and content separate entries`,
  );
  for (const [target, id] of Object.entries(final.targets)) {
    const entries = relevant.flatMap((s) =>
      s.entries
        .filter((e) => e.id === id)
        .map((entry) => ({ at: s.at, ...entry })),
    );
    const visible = entries.filter((e) => e.opacity >= 0.1 && e.opacity <= 0.9);
    const durationMs = visible.length ? visible.at(-1).at - visible[0].at : 0;
    report.visibleEntryWindows.push({
      label,
      target,
      durationMs,
      frameCount: visible.length,
      maximumTravelPx: Math.max(...entries.map((entry) => Math.abs(entry.y))),
    });
    if (reduced) {
      assert.ok(
        visible.length >= 2,
        `${label} ${target} retains a short real fade-in`,
      );
      assert.ok(
        entries.every((e) => Math.abs(e.y) < 0.1 && Math.abs(e.x) < 0.1),
        `${label} ${target} has no reduced-motion travel`,
      );
    } else {
      assert.ok(
        visible.length >= 8 && durationMs >= 250,
        `${label} ${target} remains visibly entering for ≥250ms (${durationMs.toFixed(1)}ms, ${visible.length} frames)`,
      );
      assert.ok(
        entries.some((e) => e.y > 1 && e.y <= 10.5) &&
          Math.abs(entries.at(-1).y) < 0.1,
        `${label} ${target} moves gradually from a small offset to its final position`,
      );
    }
  }
}

async function rowActions(scene) {
  return page.evaluate(
    (selector) =>
      [...document.querySelectorAll(selector)]
        .filter((node) => node.getClientRects().length)
        .map((node) => ({
          name: node.getAttribute('aria-label') ?? node.textContent,
          disabled:
            node.disabled ||
            node.getAttribute('aria-disabled') === 'true' ||
            (node.tagName !== 'BUTTON' && !node.getAttribute('href')),
        })),
    scene.path === '/tags'
      ? '[data-testid^="tag-"] button,[data-testid^="tag-"] [data-slot="link"]'
      : '[data-share-album-id] [aria-label^="分享设置"]',
  );
}

async function pendingRead(scene, width) {
  report.stage = `pending ${scene.path} ${width}`;
  const hasRowActions = scene.filter && scene.path !== '/trash';
  const expectedActions = hasRowActions ? await rowActions(scene) : [];
  if (hasRowActions) {
    const count = await page.evaluate(
      (path) =>
        [
          ...document.querySelectorAll(
            path === '/tags'
              ? '[data-testid^="tag-"]'
              : '[data-share-album-id]',
          ),
        ].filter((row) => row.getClientRects().length).length,
      scene.path,
    );
    assert.equal(
      expectedActions.length,
      count * (scene.path === '/tags' ? 3 : 1),
      'Every real row exposes its expected controls',
    );
  }
  if (['/trash', '/shares'].includes(scene.path))
    await page.waitForFunction((path) => {
      const images = [
        ...document.querySelectorAll(
          path === '/trash'
            ? '[data-testid="trash-list"] img'
            : '[data-testid="shares-list"] img',
        ),
      ].filter((image) => image.getClientRects().length);
      return (
        images.length > 0 &&
        images.every(
          (image) =>
            image.complete &&
            image.naturalWidth > 0 &&
            Number(getComputedStyle(image).opacity) > 0.999,
        )
      );
    }, scene.path);
  const state = await page.evaluate((scene) => {
    const node = document.querySelector(scene.targets.content);
    const entry =
      node.closest('[data-component-entry]') ??
      node.querySelector('[data-component-entry]');
    const imageRoot =
      scene.path === '/trash'
        ? document.querySelector('[data-testid="trash-list"]')
        : node;
    const images = [...imageRoot.querySelectorAll('img')].filter(
      (image) =>
        image.getClientRects().length &&
        (!scene.filter ||
          scene.path !== '/trash' ||
          ['issue177-180', 'issue177-181'].includes(
            image.closest('[data-trash-image-id]')?.dataset.trashImageId,
          )),
    );
    window.__adminMotionRetained = { node, entry, images };
    return { text: node.textContent, images: images.length };
  }, scene);
  await observe(scene);
  await page.evaluate((paths) => {
    window.__adminMotionRead.paths = paths;
  }, scene.reads);
  if (scene.refresh) await page.click(button(scene.refresh));
  else {
    await page.fill(scene.filter, scene.query);
    if (['/tags', '/trash'].includes(scene.path))
      await page.press(scene.filter, 'Enter');
  }
  await page.waitForFunction(() => window.__adminMotionRead.held > 0);
  await frames();
  assert.deepEqual(
    await page.evaluate(() => ({
      connected: window.__adminMotionRetained.node.isConnected,
      opacity: Number(
        getComputedStyle(window.__adminMotionRetained.entry).opacity,
      ),
      text: window.__adminMotionRetained.node.textContent,
    })),
    { connected: true, opacity: 1, text: state.text },
    'Pending reads retain the same real content and fully visible entry',
  );
  if (hasRowActions) {
    const actions = await rowActions(scene);
    (report.pendingActions ??= []).push({ path: scene.path, width, actions });
    assert.ok(
      actions.length === expectedActions.length &&
        actions.every((action) => action.disabled),
      'Old row actions are disabled while showing placeholder results',
    );
  }
  await page.evaluate(() => window.__adminMotionRead.release());
  if (['/trash', '/tags', '/shares'].includes(scene.path))
    await page.waitForFunction(
      (selector) =>
        document.querySelector(selector)?.getAttribute('aria-busy') === 'false',
      scene.path === '/trash'
        ? '[data-testid="trash-list"]'
        : scene.targets.content,
    );
  if (['/analytics', '/dashboard'].includes(scene.path))
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="overview-refreshing"]'),
    );
  await ready(scene);
  if (hasRowActions) {
    const actions = await rowActions(scene);
    assert.ok(
      actions.length === expectedActions.length &&
        actions.every((action) => !action.disabled),
      'Real result row actions become available again after the read',
    );
  }
  const samples = await collect(`pending ${scene.path} ${width}`);
  if (state.images) {
    assert.ok(
      samples.every(
        (sample) =>
          sample.images.length === state.images &&
          sample.images.every(
            (image) => image.connected && image.loaded && image.opacity > 0.999,
          ),
      ),
      'Retained real thumbnails keep their same decoded DOM nodes and full opacity',
    );
    (report.stableImages ??= []).push({
      path: scene.path,
      width,
      operation: scene.refresh ? 'refresh' : 'filter',
      imageCount: state.images,
    });
  }
  if (scene.path === '/trash' && scene.filter)
    assert.deepEqual(
      await page.evaluate(() =>
        [...document.querySelectorAll('[data-trash-image-id]')]
          .map((node) => node.dataset.trashImageId)
          .sort(),
      ),
      ['issue177-180', 'issue177-181'],
      'Real trash search keeps the intended shared subset',
    );
  assert.ok(
    samples.every((s) => s.entries.every((entry) => entry.opacity > 0.999)),
    'Refreshing or retaining matching query items never replays their entry',
  );
  report.checks.push(
    `Real pending ${scene.refresh ? 'refresh' : 'filter'} retains content without entry replay: ${scene.path} at ${width}px`,
  );
}

async function queuedUpload(scene, width) {
  report.stage = `queued upload ${width}`;
  const queue = {
    path: scene.path,
    targets: { queue: '[data-testid="upload-item"]' },
  };
  await observe(queue);
  await page.setInputFiles('input[aria-label="选择图片文件"]', [
    join(config.projectDirectory, 'tests/fixtures/runtime/images/sample.png'),
  ]);
  await ready(queue);
  assertEntry(
    await collect(`queued upload ${width}`),
    queue,
    `queued upload ${width}`,
    false,
  );
  await page.evaluate(() => {
    window.__adminMotionQueue = document.querySelector(
      '[data-testid="upload-item"]',
    );
  });
  await observe(queue);
  const trigger = 'loc=role:button[name*="可见性"]';
  const nextVisibility = await page.evaluate(() => {
    const target = [
      ...document.querySelectorAll('[data-testid="upload-settings"] button'),
    ].find((node) => /公开|私有/.test(node.textContent));
    window.__adminMotionVisibilityTrigger = target;
    return target.textContent.includes('私有') ? '公开' : '私有';
  });
  await page.click(trigger);
  await page.waitForSelector('[role="listbox"]');
  await page.keyboard.press('Escape');
  await page.waitForSelector('[role="listbox"]', { state: 'hidden' });
  await page.waitForFunction(
    () => document.activeElement === window.__adminMotionVisibilityTrigger,
  );
  await page.click(trigger);
  await page.click(`loc=role:option[name="${nextVisibility}"]`);
  await page.waitForFunction(
    (value) =>
      window.__adminMotionVisibilityTrigger.textContent.includes(value),
    nextVisibility,
  );
  await ready(queue);
  const samples = await collect(`queue settings update ${width}`);
  assert.ok(
    await page.evaluate(
      () =>
        document.querySelector('[data-testid="upload-item"]') ===
        window.__adminMotionQueue,
    ),
    'Changing an upload setting retains the same queued item DOM',
  );
  assert.ok(
    samples.every((s) => s.entries.every((entry) => entry.opacity > 0.999)),
    'Upload settings changes never replay queued item entry',
  );
  await page.click('[data-testid="upload-item"] button:has-text("移除")');
  await page.waitForSelector('[data-testid="upload-item"]', {
    state: 'hidden',
  });
  await ready(scene);
  report.checks.push(
    `A real PNG queue item enters independently; visibility Select and focus work without replay at ${width}px`,
  );
}

async function nestedPages(width) {
  const entries = [
    {
      name: 'share-settings',
      source: '/shares',
      link: 'a[href="/shares/issue177-album-a"]',
      path: '/shares/issue177-album-a',
      targets: {
        summary: '[data-testid="share-settings"] > p',
        content: '[data-testid="share-address"]',
      },
    },
    {
      name: 'branding',
      source: '/settings/general',
      link: 'a[href="/settings/general/branding"]',
      path: '/settings/general/branding',
      targets: { heading: 'main h1', content: '[data-testid="branding-logo"]' },
    },
    {
      name: 'storage-new',
      source: '/settings/storage',
      link: '[data-testid="storage-create"]',
      path: '/settings/storage/new',
      targets: { content: '#storage-form h2' },
    },
    {
      name: 'storage-local',
      source: '/settings/storage',
      link: `a[href="/settings/storage/${localId}"]`,
      path: `/settings/storage/${localId}`,
      targets: { content: '#storage-form h2' },
    },
    {
      name: 'storage-s3',
      source: '/settings/storage',
      link: `a[href="/settings/storage/${s3Id}"]`,
      path: `/settings/storage/${s3Id}`,
      targets: { content: '#storage-form h2' },
    },
    {
      name: 'api-usage',
      source: '/settings/general',
      category: '上传 API',
      link: '[data-testid="api-usage"]',
      path: '/settings/api/usage',
      targets: {
        heading: 'main h1',
        content: '[data-testid="upload-usage-command"]',
      },
    },
  ];
  for (const scene of entries) {
    report.stage = `${scene.path} ${width} nested`;
    const source = scenes.find((candidate) => candidate.path === scene.source);
    await navigate(source);
    await ready(source);
    if (scene.category) {
      const apiScene = scenes.find(
        (candidate) => candidate.path === '/settings/api',
      );
      await navigate(apiScene);
      await ready(apiScene);
    }
    await observe(scene);
    await page.click(scene.link);
    await ready(scene);
    const label = `${scene.path} ${width} nested`;
    assertEntry(await collect(label), scene, label, false);
    const screenshot = `admin-motion-${scene.name}-${width}.png`;
    await page.screenshot({ path: join(config.output, screenshot) });
    report.screenshots.push(screenshot);
    report.checks.push(
      `Real nested page content enters continuously without replacement: ${scene.path} at ${width}px`,
    );
    if (scene.path === `/settings/storage/${s3Id}`) {
      const cors = {
        path: `${scene.path}/cors`,
        targets: {
          heading: 'main h1',
          content: '[data-testid="storage-cors"] dl',
        },
      };
      await observe(cors);
      await page.click(`a[href="${cors.path}"]`);
      await ready(cors);
      const label = `${cors.path} ${width} nested`;
      assertEntry(await collect(label), cors, label, false);
      const screenshot = `admin-motion-storage-cors-${width}.png`;
      await page.screenshot({ path: join(config.output, screenshot) });
      report.screenshots.push(screenshot);
      report.checks.push(
        `Real CORS settings content enters without performing a remote probe at ${width}px`,
      );
    }
  }
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
  fixture = await seedLibraryBatch(config, sql);
  await sql(
    `UPDATE media_images SET trashed_at=${Date.now()} WHERE id IN (${[180, 181, 182].map((index) => `'${batchImageId(index)}'`).join(',')})`,
  );
  await sql(
    "UPDATE media_images SET display_name='issue177-motion-keep-'||id||'.png' WHERE id IN ('issue177-180','issue177-181')",
  );
  await api('/api/albums/issue177-album-a/share', 'POST', {});
  tokenId = (
    await api('/api/upload-tokens', 'POST', {
      name: 'Admin motion verification',
    })
  ).token.id;
  localId = (await api('/api/storages')).find(
    (storage) => storage.type === 'local',
  ).id;
  s3Id = (
    await api('/api/storages', 'POST', {
      name: 'Admin motion CORS page fixture',
      type: 's3',
      endpoint: 'https://motion.example.invalid',
      region: 'us-east-1',
      bucket: 'motion-page',
      pathPrefix: '',
      forcePathStyle: true,
      accessKey: 'fixture-access',
      secretKey: 'fixture-secret',
      enabled: false,
    })
  ).id;
  // A page-only fixture exposes the existing CORS link. No connection/CORS
  // probe is performed, and this status is not evidence of storage connectivity.
  await sql(
    `UPDATE storage_configs SET connection_status='passed',connection_revision=config_revision WHERE id='${s3Id}'`,
  );
  errorScript = await installBrowserErrors(page);
  // The shared error listener installs on the next document; all later route
  // navigation stays in that instrumented production document.
  await page.goto(`${config.origin}/library`);
  await page.waitForSelector('[data-testid="library-list"]');
  await ready({ path: '/library', targets: { heading: '#library-title' } });
  await installReadControl();
  for (const width of [1440, 390]) {
    await resizeViewport(page, width);
    for (const reduced of [false, true]) {
      await page.cdp('Emulation.setEmulatedMedia', {
        features: [
          {
            name: 'prefers-reduced-motion',
            value: reduced ? 'reduce' : 'no-preference',
          },
        ],
      });
      const selectedScenes = reduced
        ? scenes.filter((scene) =>
            ['/upload', '/analytics', '/tags', '/settings/storage'].includes(
              scene.path,
            ),
          )
        : scenes;
      for (const scene of selectedScenes) {
        const label = `${scene.path} ${width} ${reduced ? 'reduced' : 'normal'}`;
        report.stage = label;
        await observe(scene);
        await navigate(scene);
        await ready(scene);
        assertEntry(await collect(label), scene, label, reduced);
        report.checks.push(
          `Separate real content entries and ${reduced ? 'no reduced-motion travel' : 'continuous ≥250ms entry'}: ${scene.path} at ${width}px`,
        );
        if (!reduced) {
          const screenshot = `admin-motion-${scene.path.replaceAll('/', '-').slice(1)}-${width}.png`;
          await page.screenshot({ path: join(config.output, screenshot) });
          report.screenshots.push(screenshot);
          if (
            ['/tags', '/shares'].includes(scene.path) ||
            (width === 1440 && scene.path === '/analytics') ||
            scene.path === '/trash'
          )
            await pendingRead(scene, width);
          if (scene.path === '/trash')
            await pendingRead(
              {
                ...scene,
                refresh: undefined,
                filter: 'input[aria-label="搜索回收图片名称"]',
                query: 'issue177-motion-keep-',
              },
              width,
            );
          if (scene.path === '/upload') await queuedUpload(scene, width);
        }
      }
      if (!reduced) await nestedPages(width);
    }
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
      .screenshot({ path: join(config.output, 'admin-motion-failure.png') })
      .catch(() => {});
} finally {
  try {
    if (!failure || !isBrowserControlStop(failure)) {
      await page.evaluate(() => {
        window.__adminMotionRead?.restore();
        window.__adminMotionObservation?.stop();
        delete window.__adminMotionRead;
        delete window.__adminMotionObservation;
        delete window.__adminMotionRetained;
        delete window.__adminMotionQueue;
        delete window.__adminMotionVisibilityTrigger;
      });
      if (errorScript)
        await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
          identifier: errorScript,
        });
      await page.cdp('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
      });
      if (tokenId) await api(`/api/upload-tokens/${tokenId}`, 'DELETE');
    }
    if (s3Id) await sql(`DELETE FROM storage_configs WHERE id='${s3Id}'`);
    if (fixture) {
      await sql("DELETE FROM album_shares WHERE album_id LIKE 'issue177-%'");
      await cleanLibraryBatch(sql, fixture);
    }
  } catch (error) {
    report.status = 'failed';
    report.cleanupError = error.stack ?? String(error);
    failure ??= error;
  } finally {
    await writeFile(
      join(config.output, 'admin-motion.json'),
      `${JSON.stringify(report, null, 2)}\n`,
    );
  }
}
if (failure) throw failure;
