/* global taskSpace, config */
const assert = (await import('node:assert/strict')).default;
const { readFile, writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { identitySql } = await import(config.identitySessionScript);
const { installBrowserErrors, assertNoBrowserErrors } = await import(
  config.errorsScript
);
const { seedLibraryBatch, cleanLibraryBatch, batchImageId } = await import(
  new URL('./library-batch-fixture.mjs', config.libraryDetailScript).href
);
const { signInToLibrary } = await import(
  new URL('./library-login.mjs', config.libraryDetailScript).href
);
const { createCopyHelpers, saveClipboard, restoreClipboard } = await import(
  new URL('./library-copy-helpers.mjs', config.libraryDetailScript).href
);
const task = await taskSpace(config.spaceId);
const page = task.page(config.pageLabel ?? 'p1');
const sql = (statement) => identitySql(config, statement);
const representative = config.libraryCopyPhase === 'representative';
const feedbackOnly = config.libraryCopyPhase === 'feedback';
const revision = config.libraryCopyPhase === 'revision';
const detailedFeedback = !representative && !feedbackOnly;
const report = {
  status: 'failed',
  phase: config.libraryCopyPhase ?? 'full',
  taskSpaceId: task.spaceId,
  origin: config.origin,
  checks: [],
  layouts: [],
  clipboard: [],
  limitations: [
    'Real Ego Chromium and macOS pasteboard; physical phones, software keyboards and Release containers were not exercised.',
    'HTTP failure is injected at the browser transport boundary after a real server response; 401 revokes only the disposable database sessions; permission denial uses Chromium native permission enforcement.',
  ],
};
const h = createCopyHelpers({ page, config, report });
let fixture, savedClipboard, savedPreference, errorScript;
const preferenceKey = 'ariso:library-preferences:v1';
const widths = representative ? [390, 1440] : [360, 390, 430, 768, 1440];

async function snapshot() {
  const result = {};
  for (const table of [
    'analytics_daily',
    'analytics_image_daily',
    'analytics_image_totals',
    'storage_probes',
  ])
    result[table] = await sql(`SELECT * FROM ${table} ORDER BY rowid`);
  return result;
}
async function seed() {
  fixture = await seedLibraryBatch(config, sql);
  const bytes = await readFile(
    join(config.projectDirectory, 'tests/fixtures/runtime/images/sample.png'),
  );
  for (const kind of ['compressed', 'watermark']) {
    for (const id of fixture.ids)
      await writeFile(join(fixture.directory, `${id}-${kind}.png`), bytes);
    await sql(
      `INSERT INTO media_objects (id,image_id,storage_id,key,purpose,status,byte_size,format,mime,created_at,updated_at) SELECT image_id||'-${kind}',image_id,storage_id,'issue177-batch/'||image_id||'-${kind}.png','${kind}',status,byte_size,format,mime,created_at,updated_at FROM media_objects WHERE image_id LIKE 'issue177-%' AND purpose='original'`,
    );
    await sql(
      `INSERT INTO media_versions (image_id,kind,object_id,width,height,byte_size,format,mime,created_at) SELECT image_id,'${kind}',image_id||'-${kind}',width,height,byte_size,format,mime,created_at FROM media_versions WHERE image_id LIKE 'issue177-%' AND kind='original'`,
    );
  }
  await sql(
    `UPDATE media_images SET created_at=1810000000000 WHERE id IN ('${batchImageId(0)}','${batchImageId(1)}')`,
  );
  await sql(
    `UPDATE media_images SET display_name='issue177-[A] <&"''>\\.png' WHERE id='${batchImageId(1)}'`,
  );
  await sql(
    `UPDATE media_images SET processing_status='failed' WHERE id='${batchImageId(2)}'`,
  );
  await sql(
    `INSERT INTO storage_configs (id,name,type,enabled,local_path,created_at,updated_at) VALUES ('issue187-disabled','Issue 187 停用','local',0,'issue187-disabled',1810000000000,1810000000000)`,
  );
  const disabled = batchImageId(199);
  await sql(`DELETE FROM media_versions WHERE image_id='${disabled}'`);
  await sql(`DELETE FROM media_objects WHERE image_id='${disabled}'`);
  await sql(
    `UPDATE media_images SET storage_id='issue187-disabled' WHERE id='${disabled}'`,
  );
  for (const kind of ['original', 'compressed', 'thumbnail', 'watermark']) {
    await sql(
      `INSERT INTO media_objects (id,image_id,storage_id,key,purpose,status,byte_size,format,mime,created_at,updated_at) VALUES ('${disabled}-${kind}','${disabled}','issue187-disabled','${disabled}-${kind}.png','${kind}','stored',${bytes.length},'png','image/png',1810000000000,1810000000000)`,
    );
    await sql(
      `INSERT INTO media_versions (image_id,kind,object_id,width,height,byte_size,format,mime,created_at) VALUES ('${disabled}','${kind}','${disabled}-${kind}',640,480,${bytes.length},'png','image/png',1810000000000)`,
    );
  }
  await sql(
    `DELETE FROM media_versions WHERE image_id='${batchImageId(200)}' AND kind='watermark'`,
  );
}
async function renderedManual(expected) {
  await page.waitForSelector('[data-testid="library-copy-manual"]');
  const actual = await page.evaluate(() => {
    const node = document.querySelector('[data-testid="library-copy-manual"]');
    return {
      text: node.value,
      focused: node === document.activeElement,
      selected:
        node.selectionStart === 0 && node.selectionEnd === node.value.length,
    };
  });
  assert.deepEqual(actual, { text: expected, focused: true, selected: true });
  await page.keyboard.press('ControlOrMeta+c');
  await h.verifyNative(expected);
  report.clipboard.push({
    manual: true,
    fullSelection: true,
    length: expected.length,
    exactNativeCopy: true,
  });
}
async function expectedOutput() {
  const entries = await h.traffic();
  assert.ok(entries.length > 0);
  const items = entries.flatMap((row) => row.response.items);
  // The independent fixture query has the same externally specified complete ordering.
  const query = entries[0].request.query;
  const album = new URLSearchParams(query).get('scope') === 'album';
  const order = album
    ? await sql(
        "SELECT image_id AS id FROM album_images WHERE album_id='issue177-album-a' ORDER BY joined_at DESC,image_id ASC",
      )
    : await sql(
        "SELECT id FROM media_images WHERE id LIKE 'issue177-%' ORDER BY created_at DESC,id ASC",
      );
  const ids = order
    .map((row) => row.id)
    .filter((id) => items.some((item) => item.imageId === id));
  assert.equal(new Set(items.map((item) => item.imageId)).size, items.length);
  const text = ids
    .map((id) => items.find((item) => item.imageId === id).line)
    .join('\n');
  assert.equal(
    text.split('\n').length,
    items.length,
    'Exactly one physical line per copied image',
  );
  return { text, ids, items, entries };
}

async function assertModalFocus(state) {
  await h.settle();
  for (const key of [null, 'Tab']) {
    if (key) await page.keyboard.press(key);
    const focus = await page.evaluate(() => ({
      inside: !!document.activeElement?.closest(
        '[data-testid="library-copy-dialog"]',
      ),
      tag: document.activeElement?.tagName,
      id: document.activeElement?.id,
      label: document.activeElement?.getAttribute('aria-label'),
    }));
    try {
      assert.equal(
        focus.inside,
        true,
        `${state} ${key ?? 'initial focus'} stays inside the modal`,
      );
    } catch (error) {
      report.focusFailures ??= [];
      report.focusFailures.push({ state, key, focus, error: error.stack });
    }
  }
}

try {
  report.stage = 'seed-and-options';
  await page.goto(`${config.origin}/library?q=issue177-&pageSize=80&page=1`);
  await page.waitForFunction(
    () =>
      location.pathname === '/login' ||
      !!document.querySelector('[data-testid="library-list"]'),
  );
  if (new URL(await page.url()).pathname === '/login')
    await signInToLibrary(page, config, report);
  savedClipboard = await saveClipboard();
  errorScript = await installBrowserErrors(page);
  savedPreference = await page.evaluate(
    (key) => localStorage.getItem(key),
    preferenceKey,
  );
  await page.evaluate(
    (key) =>
      localStorage.setItem(
        key,
        JSON.stringify({ layout: 'grid', loadingMode: 'pages' }),
      ),
    preferenceKey,
  );
  await seed();
  await h.resize(1440);
  await h.selectAll201();
  await h.open(201);
  if (!feedbackOnly) await h.capture('options', widths);
  if (detailedFeedback) {
    await h.capture('options', [390], true);
  }
  report.stage = 'escape-return-focus';
  await page.evaluate(() => {
    window.__copyFocusEvents = [];
    document.addEventListener(
      'focusin',
      (event) =>
        window.__copyFocusEvents.push({
          at: performance.now(),
          tag: event.target.tagName,
          id: event.target.id,
          label: event.target.getAttribute('aria-label'),
        }),
      { capture: true },
    );
  });
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-testid="library-copy-dialog"]', {
    state: 'hidden',
  });
  await page.waitForFunction(
    () =>
      document.activeElement?.getAttribute('aria-label') ===
      '操作已选 201 张图片',
  );
  await h.open(201);
  report.stage = 'cross-page-native-copy';
  await h.monitor('hold');
  await h.selectFormat('markdown');
  assert.deepEqual(
    await h.traffic(),
    [],
    'Changing format only selects it and never sends a request',
  );
  const before = await snapshot();
  await h.format('url');
  await page.waitForFunction(() => typeof window.__copyRelease === 'function');
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelector('[data-testid="library-copy-submit"]')?.disabled,
    ),
    true,
    'Generating disables duplicate format activation',
  );
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelector('[data-testid="library-copy-version"]')
          ?.disabled,
    ),
    true,
    'Generating preserves the selected version',
  );
  assert.equal(
    await page.evaluate(() =>
      [...document.querySelectorAll('[data-copy-format]')].every(
        (node) => node.disabled,
      ),
    ),
    true,
    'Generating disables every visible format choice',
  );
  await page.waitForFunction(
    () => document.activeElement?.getAttribute('role') === 'status',
  );
  for (const key of ['Tab', 'Shift+Tab']) {
    await page.keyboard.press(key);
    assert.equal(
      await page.evaluate(
        () =>
          !!document.activeElement?.closest(
            '[data-testid="library-copy-dialog"]',
          ),
      ),
      true,
      `Loading ${key} stays inside the modal and never reaches the background`,
    );
  }
  if (!feedbackOnly) await h.capture('loading', [390, 1440]);
  await page.evaluate(() => window.__copyRelease());
  await h.completed();
  const initial = await expectedOutput();
  assert.deepEqual(
    initial.entries
      .map((entry) => entry.request.ids.length)
      .sort((a, b) => a - b),
    [1, 200],
    '201 explicit selections cross real 200-item request boundaries',
  );
  assert.equal(initial.items.length, 200);
  assert.deepEqual(
    initial.ids.slice(0, 2),
    [batchImageId(0), batchImageId(1)],
    'Equal primary sort values use the complete ID tie breaker',
  );
  assert.ok(
    initial.items.some((item) => item.imageId === batchImageId(2)),
    'Failed processing with stored original remains copyable for its owner',
  );
  assert.ok(
    initial.items.some((item) => item.accessWarning),
    'Private and failed access limitations are returned',
  );
  for (const line of initial.text.split('\n'))
    assert.equal(new URL(line).searchParams.has('type'), false);
  await h.verifyNative(initial.text);
  await h.noImageReads();
  assert.deepEqual(
    await snapshot(),
    before,
    'Copy has no analytics or storage-probe side effects',
  );
  await assertModalFocus('partial-success');
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelectorAll('[data-testid="library-copy-dialog"] img')
          .length,
    ),
    0,
    'Partial feedback only shows unavailable items and never adds a success image table',
  );
  if (!feedbackOnly) await h.capture('partial-result', widths);
  if (detailedFeedback) {
    await h.capture('partial-result', [390], true);
  }
  assert.equal(
    await page.evaluate(
      (id) => !!document.querySelector(`[data-copy-unavailable="${id}"]`),
      batchImageId(199),
    ),
    true,
  );
  if (detailedFeedback) {
    assert.equal(
      /GPS|拍摄信息/.test(
        await page.evaluate(
          () =>
            document.querySelector('[data-testid="library-copy-dialog"]')
              .textContent,
        ),
      ),
      initial.items.some((item) => item.originalDisclosure),
      'Default output only discloses actual original metadata',
    );
    await h.version('original');
    await h.monitor();
    await h.format('url');
    await h.completed();
    const publicOriginal = await expectedOutput();
    assert.ok(publicOriginal.items.some((item) => item.originalDisclosure));
    assert.match(
      await page.evaluate(
        () =>
          document.querySelector('[data-testid="library-copy-dialog"]')
            .textContent,
      ),
      /公开原图.*GPS.*拍摄信息/,
    );
    await h.verifyNative(publicOriginal.text);
    await h.noImageReads();
    await h.capture('partial-public-original', [390, 1440]);
    await h.version('compressed');
    await h.monitor();
    await h.format('url');
    await h.completed();
    const compressed = await expectedOutput();
    await h.verifyNative(compressed.text);
    await h.noImageReads();
    assert.ok(compressed.items.every((item) => !item.originalDisclosure));
    assert.doesNotMatch(
      await page.evaluate(
        () =>
          document.querySelector('[data-testid="library-copy-dialog"]')
            .textContent,
      ),
      /GPS|拍摄信息/,
      'Non-original copy does not invent an original metadata warning',
    );
    report.checks.push(
      'Actual public-original metadata warning is present for original/default and absent for fixed compressed output, with complete native Clipboard text for both.',
    );
  }
  report.checks.push(
    '201 selections survive pages; real responses reversed within every chunk merge by full query order including equal keys; native URL pasteboard exact; private/failed remain available, disabled storage excluded, no image GET or count/probe writes.',
  );

  if (!representative && !feedbackOnly && !revision) {
    for (const version of [
      'default',
      'original',
      'compressed',
      'thumbnail',
      'watermark',
    ]) {
      for (const format of ['url', 'markdown', 'html']) {
        if (version === 'default' && format === 'url') continue;
        report.stage = `${version}-${format}`;
        await h.again();
        await h.version(version);
        await h.monitor();
        await h.format(format, format === 'markdown' && version === 'default');
        await h.completed();
        const result = await expectedOutput();
        assert.equal(result.items.length, version === 'watermark' ? 199 : 200);
        assert.ok(
          result.entries.every(
            (row) =>
              row.request.version === version && row.request.format === format,
          ),
        );
        if (format === 'url')
          for (const line of result.text.split('\n'))
            assert.equal(
              new URL(line).searchParams.get('type'),
              version === 'default' ? null : version,
            );
        if (version !== 'default')
          assert.ok(
            result.items.every((item) => item.actualVersion === version),
            'Fixed versions never fall back',
          );
        const special = result.items.find(
          (item) => item.imageId === batchImageId(1),
        );
        if (format === 'html')
          assert.match(
            special.line,
            /alt="issue177-\[A\] &lt;&amp;&quot;&#39;&gt;\\\.png"/,
          );
        if (format === 'markdown')
          assert.ok(
            special.line.startsWith('![issue177-\\[A\\] \\<&"\'\\>\\\\.png]('),
            'Markdown escapes the real special display name',
          );
        await h.verifyNative(result.text);
        await h.noImageReads();
        report.clipboard.push({
          version,
          format,
          length: result.text.length,
          exact: true,
          count: result.items.length,
        });
      }
    }
    report.checks.push(
      'All 15 mode/format combinations use one uniform request mode and complete native pasteboard text; missing fixed watermark is excluded without fallback; special display name is escaped in Markdown and HTML.',
    );
  }

  await h.again();
  report.stage = 'manual-native-copy';
  await h.version('original');
  await page.cdp('Browser.setPermission', {
    permission: { name: 'clipboard-write' },
    setting: 'denied',
    origin: config.origin,
  });
  await h.monitor();
  await h.format('html');
  await page.waitForSelector('[data-testid="library-copy-manual"]');
  const manualOutput = await expectedOutput();
  if (detailedFeedback)
    assert.match(
      await page.evaluate(
        () =>
          document.querySelector('[data-testid="library-copy-dialog"]')
            .textContent,
      ),
      /公开原图.*GPS.*拍摄信息/,
    );
  // Keyboard native copy is independent of navigator.clipboard permission. The probe records only its denied write attempt.
  await renderedManual(manualOutput.text);
  await h.observePasteboard(manualOutput.text, 'manual-native-copy-complete');
  if (!feedbackOnly) {
    await h.capture('manual', widths);
    await h.capture('manual', [390], true);
  }
  await h.observePasteboard(manualOutput.text, 'manual-after-layouts');
  await page.focus('[data-testid="library-copy-manual"]');
  await page.keyboard.press('Tab');
  assert.equal(
    await page.evaluate(
      () => !!document.activeElement?.closest('[role="dialog"]'),
    ),
    true,
    'Manual focus remains trapped within the dialog',
  );
  await page.click('[data-testid="library-copy-manual-return"]');
  await h.observePasteboard(manualOutput.text, 'manual-return-click');
  await page.waitForSelector('[data-testid="library-copy-dialog"]', {
    state: 'hidden',
  });
  await h.selected(201);
  await page.waitForFunction(
    () =>
      document.activeElement?.getAttribute('aria-label') ===
      '操作已选 201 张图片',
  );
  await page.cdp('Browser.setPermission', {
    permission: { name: 'clipboard-write' },
    setting: 'granted',
    origin: config.origin,
  });
  report.checks.push(
    'Chromium denies the actual native Clipboard write; all 200 HTML lines stay selected and focused; Command+C copies the exact full text, including mobile visual wrapping; the same modal presents manual text without claiming an automatic copy succeeded.',
  );

  if (!representative) {
    report.stage = 'all-unavailable';
    await h.observePasteboard(
      manualOutput.text,
      'unavailable-before-navigation',
    );
    await page.goto(`${config.origin}/library?q=issue177-&pageSize=80&page=3`);
    await h.loaded(41);
    await h.observePasteboard(
      manualOutput.text,
      'unavailable-after-navigation',
    );
    await h.choose(199);
    await h.observePasteboard(manualOutput.text, 'unavailable-after-selection');
    await h.open(1);
    await h.observePasteboard(manualOutput.text, 'unavailable-after-open');
    await h.monitor();
    const sentinel = (await h.traffic()).length;
    await h.format('url');
    await page.waitForSelector('[data-testid="library-copy-feedback"]');
    assert.match(
      await page.evaluate(
        () =>
          document.querySelector('[data-testid="library-copy-feedback"]')
            .textContent,
      ),
      /没有可复制的链接/,
    );
    assert.deepEqual(await page.evaluate(() => window.__copyWrites), []);
    await h.observePasteboard(
      manualOutput.text,
      'unavailable-after-empty-result',
    );
    await h.verifyPasteboard(manualOutput.text);
    assert.equal(sentinel, 0);
    await assertModalFocus('all-unavailable');
    await h.capture('all-unavailable', [390, 1440]);
    await page.click('[data-testid="library-copy-return"]');
    await page.goto(`${config.origin}/library?q=issue177-&pageSize=80&page=1`);
    await h.loaded(80);
    await h.choose(0);
    await h.open(1);
    await h.monitor('http-error');
    report.stage = 'http-failure-and-retry';
    await h.format('url');
    await page.waitForSelector(
      '[data-testid="library-copy-dialog"] [role="alert"]',
    );
    assert.equal(
      await page.evaluate(
        () => !!document.querySelector('[data-testid="library-copy-result"]'),
      ),
      false,
      'HTTP failure never masquerades as no copyable links',
    );
    assert.deepEqual(await page.evaluate(() => window.__copyWrites), []);
    await assertModalFocus('http-error');
    await h.capture('http-error', [390, 1440]);
    await h.monitor();
    await h.format('url');
    await h.completed();
    const retried = await expectedOutput();
    await h.verifyNative(retried.text);
    await h.noImageReads();
    report.checks.push(
      'All unavailable writes nothing and preserves the pasteboard; real-response HTTP failure retains an actionable error and retries independently of empty results.',
    );

    if (detailedFeedback) {
      const { verifyCopyConsumers } = await import(
        new URL('./library-copy-consumers.mjs', config.libraryDetailScript).href
      );
      await verifyCopyConsumers({ page, config, report, sql, h });
    }
    await sql("DELETE FROM album_images WHERE album_id='issue177-album-a'");
    report.stage = 'album-order';
    await sql(
      `INSERT INTO album_images (album_id,image_id,joined_at) VALUES ${[0, 1, 2].map((index) => `('issue177-album-a','${batchImageId(index)}',${1810000000000 + index * 1000})`).join(',')}`,
    );
    await page.goto(
      `${config.origin}/albums/issue177-album-a?pageSize=80&page=1`,
    );
    await h.loaded(3);
    for (const index of [0, 1, 2]) await h.choose(index);
    await h.open(3);
    await h.monitor();
    await h.format('url');
    await h.completed();
    const albumOutput = await expectedOutput();
    assert.deepEqual(albumOutput.ids, [
      batchImageId(2),
      batchImageId(1),
      batchImageId(0),
    ]);
    await h.verifyNative(albumOutput.text);
    await h.noImageReads();
    await page.waitForSelector('[data-testid="library-copy-dialog"]', {
      state: 'hidden',
    });
    await h.selected(3);
    if (detailedFeedback) {
      const { resizeViewport, setTheme } = await import(
        new URL('./browser-geometry.mjs', config.libraryDetailScript).href
      );
      for (const theme of ['light', 'dark']) {
        await setTheme(page, theme);
        for (const width of [390, 1440]) {
          await resizeViewport(page, width);
          const card = '[data-image-id="issue177-000"]';
          await page.click(card, { button: 'right' });
          await page.waitForSelector('loc=role:menuitem[name="复制链接"]');
          await page.click('loc=role:menuitem[name="复制链接"]');
          await page.waitForSelector('[data-testid="library-copy-dialog"]');
          await page.keyboard.press('Escape');
          await page.waitForFunction(
            (selector) =>
              document.activeElement ===
              document.querySelector(`${selector} [data-library-open]`),
            card,
          );
          const beforeSuccess = await page.evaluate(() => ({
            url: location.href,
            top: document.querySelector('main').scrollTop,
          }));
          await h.open(3);
          await h.version('original');
          await h.monitor();
          await h.format('url');
          await h.completed();
          const result = await expectedOutput();
          await h.verifyNative(result.text);
          await h.noImageReads();
          await h.selected(3);
          await page.waitForFunction(
            () =>
              document.activeElement?.getAttribute('aria-label') ===
              '操作已选 3 张图片',
          );
          assert.deepEqual(
            await page.evaluate(() => ({
              url: location.href,
              top: document.querySelector('main').scrollTop,
            })),
            beforeSuccess,
          );
          await page.waitForSelector(
            '[data-slot="toast"][data-frontmost="true"] [data-slot="toast-title"]:has-text("已复制 3 条链接")',
          );
          const toast = await page.evaluate(() => {
            const node = document.querySelector(
              '[data-slot="toast"][data-frontmost="true"] [data-slot="toast-title"]',
            );
            const surface = node.closest('[data-slot="toast"]');
            const rect = surface.getBoundingClientRect();
            return {
              text: node.textContent,
              color: getComputedStyle(surface).backgroundColor,
              radius: getComputedStyle(surface).borderRadius,
              width: rect.width,
              bottom: rect.bottom,
              height: innerHeight,
              description:
                surface.querySelector('[data-slot="toast-description"]')
                  ?.textContent ?? '',
              neutral: surface.classList.contains('toast--default'),
              placement: surface.getAttribute('data-placement'),
            };
          });
          assert.match(
            toast.description,
            /公开原图.*GPS.*拍摄信息/,
            'Only the actual public-original toast discloses original metadata',
          );
          assert.equal(
            toast.neutral,
            true,
            'Successful copy uses the existing neutral default toast style',
          );
          assert.ok(
            toast.bottom > toast.height / 2,
            'The approved copy toast appears at the bottom',
          );
          assert.equal(
            await page.evaluate(
              () =>
                !!document.querySelector(
                  '[data-testid="library-copy-dialog"],[data-testid="library-copy-result"]',
                ),
            ),
            false,
          );
          await page.screenshot({
            path: join(
              config.output,
              `library-copy-success-${theme}-${width}.png`,
            ),
          });
          if (width === 390) {
            await resizeViewport(page, 390, 400);
            const short = await page.evaluate(() => {
              const surface = document.querySelector(
                '[data-slot="toast"][data-frontmost="true"]',
              );
              const close = surface.querySelector('[data-slot="toast-close"]');
              const rect = close.getBoundingClientRect();
              const footer = document
                .querySelector('footer')
                ?.getBoundingClientRect();
              return {
                overflow: document.documentElement.scrollWidth > innerWidth,
                toast: surface.getBoundingClientRect().toJSON(),
                close: rect.toJSON(),
                closeHit: close.contains(
                  document.elementFromPoint(
                    rect.x + rect.width / 2,
                    rect.y + rect.height / 2,
                  ),
                ),
                footer: footer?.toJSON(),
              };
            });
            assert.equal(short.overflow, false);
            assert.equal(
              short.closeHit,
              true,
              'Short viewport toast remains dismissable through its actual close target',
            );
            assert.ok(short.close.width >= 44 && short.close.height >= 44);
            await page.screenshot({
              path: join(
                config.output,
                `library-copy-success-${theme}-${width}-short.png`,
              ),
            });
            report.layouts.push({
              state: 'success-short',
              theme,
              width,
              height: 400,
              ...short,
            });
            await resizeViewport(page, 390);
          }
          report.layouts.push({
            state: 'album-success',
            width,
            theme,
            toast,
            nativePasteboard: true,
            selectionRetained: 3,
            scrollRetained: true,
            mouseContextAndToolbar: true,
          });
        }
      }
      report.checks.push(
        'Album mouse context and toolbar share the same copy modal on both responsive themes; full native clipboard success closes it, returns focus, preserves list, route, scroll and selection, and shows only the neutral bottom toast.',
      );
    }
    await h.again();
    report.stage = 'unauthorized';
    await h.monitor();
    await h.recordCopyState('before-session-revocation');
    assert.ok(
      (await sql('DELETE FROM session')).changes > 0,
      'Only disposable real owner sessions are revoked',
    );
    await h.recordCopyState('after-session-revocation');
    await h.format('url');
    await page.waitForFunction(() => location.pathname === '/login');
    report.unauthorized = await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem('ariso:issue187-copy-auth')),
    );
    assert.deepEqual(report.unauthorized, {
      status: 401,
      code: 'UNAUTHORIZED',
      cacheControl: 'no-store',
      writes: 0,
    });
    assert.equal(
      await page.evaluate(
        () =>
          !!document.querySelector(
            '[data-testid="library-copy-result"],[data-testid="library-selection"]',
          ),
      ),
      false,
    );
    report.checks.push(
      'Album copies follow joined_at rather than upload or selection order; 401 clears private copy/selection surfaces and returns to login.',
    );
  }
  report.errors = await assertNoBrowserErrors(page);
  if (report.focusFailures?.length)
    throw new AggregateError(
      report.focusFailures.map((row) => new Error(row.error)),
      'Modal focus verification failed; independent feedback scenes are all recorded',
    );
  report.stage = 'complete';
  report.status = 'passed';
} catch (error) {
  report.error = error.stack ?? String(error);
  if (String(error).includes('user has taken control')) {
    report.stoppedForUserControl = true;
    throw error;
  }
  try {
    if (report.stage === 'unauthorized') await h.recordCopyState('failure');
    report.focus = await page.evaluate(() => ({
      tag: document.activeElement?.tagName,
      id: document.activeElement?.id,
      label: document.activeElement?.getAttribute('aria-label'),
      events: window.__copyFocusEvents,
    }));
    report.page = await page.snapshot();
    await page.screenshot({
      path: join(config.output, 'library-copy-failure.png'),
    });
  } catch (snapshotError) {
    report.snapshotError = String(snapshotError);
  }
  throw error;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(
    join(config.output, 'library-copy.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  if (!report.stoppedForUserControl) {
    if (errorScript)
      await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
        identifier: errorScript,
      });
    await page.cdp('Browser.setPermission', {
      permission: { name: 'clipboard-write' },
      setting: 'prompt',
      origin: config.origin,
    });
    await page.evaluate(() => {
      sessionStorage.removeItem('ariso:issue187-copy-auth');
      sessionStorage.removeItem('ariso:issue187-copy-auth-diagnostics');
      window.__copyRelease?.();
      if (window.__copyOriginalFetch) window.fetch = window.__copyOriginalFetch;
      if (window.__copyNativeWrite)
        navigator.clipboard.writeText = window.__copyNativeWrite;
    });
    if (savedPreference !== undefined)
      await page.evaluate(
        ({ key, value }) =>
          value === null
            ? localStorage.removeItem(key)
            : localStorage.setItem(key, value),
        { key: preferenceKey, value: savedPreference },
      );
  }
  await cleanLibraryBatch(sql, fixture);
  await sql("DELETE FROM storage_configs WHERE id='issue187-disabled'");
  if (savedClipboard && !report.stoppedForUserControl) {
    await restoreClipboard(savedClipboard);
    report.clipboardRestored = true;
  }
  report.finishedAt = new Date().toISOString();
  await writeFile(
    join(config.output, 'library-copy.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
console.log({
  status: report.status,
  checks: report.checks.length,
  layouts: report.layouts.length,
  output: config.output,
});
