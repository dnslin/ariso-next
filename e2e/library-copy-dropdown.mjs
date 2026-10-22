/* global taskSpace, config */
const { default: assert } = await import('node:assert/strict');
const { execFile } = await import('node:child_process');
const { promisify } = await import('node:util');
const { mkdir, readFile, writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { identitySql } = await import(config.identitySessionScript);
const { seedLibraryDetail, clipboardDeniedProxy, selectCopyFormat } =
  await import(config.libraryDetailScript);
const { resizeViewport, setTheme } = await import(
  new URL('./browser-geometry.mjs', config.libraryDetailScript).href
);
const task = await taskSpace(config.spaceId);
const pages = await task.pages();
const page = pages.some((page) => page.label === config.pageLabel)
  ? task.page(config.pageLabel)
  : await task.newPage();
assert.equal(
  page.label,
  config.pageLabel,
  'Use only the isolated authorized test Page',
);
const button = (name) => `loc=role:button[name="${name}"]`;
const dialog = '[role="dialog"][aria-label="复制图片链接"]';
const sql = (statement) => identitySql(config, statement);
const run = promisify(execFile);
const report = {
  status: 'failed',
  phase: config.phase,
  startedAt: new Date().toISOString(),
  origin: config.origin,
  spaceId: config.spaceId,
  pageLabel: page.label,
  checks: [],
  layouts: [],
  clipboard: [],
  consumers: [],
  pressed: [],
  limitations: [
    'Ego Chromium emulation; physical touch, software keyboards and device safe areas were not tested.',
    'Pending/error checks hold or reject a real detail HTTP response at the browser transport boundary; writing holds only after the native Clipboard write has completed.',
    'Fixtures belong only to a separate disposable production server and SQLite DB; the manual preview and its page are untouched.',
  ],
};
let savedClipboard, denied;
const signIn = async (origin) => {
  await page.goto(`${origin}/library`);
  const needsLogin = await page.evaluate(
    () => !!document.querySelector('#email'),
  );
  if (needsLogin) {
    await page.fill('#email', config.credentials.email);
    await page.fill('#password', config.credentials.password);
    await page.click(button('登录'));
  }
  await page.waitForSelector('[data-testid="library-list"]');
};
async function openDetail(path = '/library', id = 'library-007') {
  await page.goto(`${config.origin}${path}`);
  const source = `[data-testid="library-card"][data-image-id="${id}"] [data-library-open]`;
  await page.waitForSelector(source);
  await page.click(source);
  await page.waitForSelector('[data-testid="detail-body"]');
  return source;
}
async function openCopy() {
  await page.click(button('复制链接'));
  await page.waitForSelector(dialog);
  await page.waitForSelector('[data-testid="copy-resolution"]');
}
async function escapeCopy(source) {
  await page.keyboard.press('Escape');
  await page.waitForSelector(dialog, { state: 'hidden' });
  await page.waitForFunction(
    () => document.activeElement?.textContent.trim() === '复制链接',
  );
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-testid="library-detail"]', {
    state: 'hidden',
  });
  await page.waitForFunction(
    (source) => document.activeElement === document.querySelector(source),
    source,
  );
}
async function settle() {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await page.waitForFunction(() => {
    const active = document.querySelector(
      '[role="dialog"][aria-label="复制图片链接"]',
    );
    return (
      !!active &&
      active
        .getAnimations({ subtree: true })
        .every((animation) =>
          ['finished', 'idle'].includes(animation.playState),
        )
    );
  });
}
async function capture(
  name,
  width,
  height,
  theme,
  formatRow = false,
  screenshotRequired = true,
) {
  await resizeViewport(page, width, height);
  await setTheme(page, theme);
  await settle();
  const geometry = await page.evaluate(() => {
    const d = document.querySelector('[data-testid="detail-copy-dialog"]');
    const rect = (node) => node?.getBoundingClientRect().toJSON() ?? null;
    const body = d.querySelector('[data-slot="modal-body"]');
    const group = d.querySelector('[data-testid="detail-copy-format"]');
    const preview = d.querySelector('[data-testid="detail-copy-preview"]');
    return {
      width: innerWidth,
      height: innerHeight,
      overflow: document.documentElement.scrollWidth > innerWidth,
      dialogOverflow: d.scrollWidth > d.clientWidth,
      dialog: rect(d),
      header: rect(d.querySelector('[data-slot="modal-header"]')),
      body: {
        ...rect(body),
        scrollTop: body.scrollTop,
        clientHeight: body.clientHeight,
        scrollHeight: body.scrollHeight,
        overflow: body.scrollWidth > body.clientWidth,
      },
      footer: rect(d.querySelector('[data-slot="modal-footer"]')),
      trigger: rect(d.querySelector('[data-testid="detail-copy-submit"]')),
      close: rect(d.querySelector('button[aria-label="关闭复制链接"]')),
      format: rect(group),
      items: group
        ? [...group.querySelectorAll('[data-copy-format]')].map((node) => ({
            name: node.textContent.trim(),
            ...rect(node),
          }))
        : [],
      link: preview
        ? {
            ...rect(preview),
            readOnly: preview.readOnly,
            wrap: preview.wrap,
            value: preview.value,
            overflow: preview.scrollWidth > preview.clientWidth,
          }
        : null,
      source: rect(
        d.querySelector('[data-testid="detail-copy-source-preview"]'),
      ),
      sourceUrl:
        d
          .querySelector('[data-testid="detail-copy-source-preview"] img')
          ?.getAttribute('src') ?? null,
      version: rect(d.querySelector('[data-testid="detail-copy-version"]')),
      size: rect(d.querySelector('[data-testid="detail-copy-size"]')),
      primaryActions: d.querySelectorAll('[data-testid="detail-copy-submit"]')
        .length,
      manual: !!d.querySelector('textarea[aria-label="手动复制文本"]'),
      titleFont: getComputedStyle(
        d.querySelector('[data-slot="modal-heading"]'),
      ).fontSize,
      resolution:
        d.querySelector('[data-testid="copy-resolution"]')?.textContent ?? null,
    };
  });
  assert.equal(geometry.overflow, false, `${name}: no document overflow`);
  assert.equal(geometry.dialogOverflow, false, `${name}: no dialog overflow`);
  assert.equal(geometry.body.overflow, false, `${name}: no body overflow`);
  if (width < 768) {
    assert.ok(
      geometry.dialog.left >= -1 && geometry.dialog.right <= width + 1,
      `${name}: mobile full-width work page`,
    );
    assert.ok(
      geometry.dialog.width >= width - 1,
      `${name}: mobile is not a narrow desktop modal`,
    );
    assert.ok(
      geometry.dialog.top >= -1 && geometry.dialog.bottom <= height + 1,
      `${name}: mobile viewport containment`,
    );
  } else {
    assert.ok(
      geometry.dialog.x >= 23 && geometry.dialog.right <= width - 23,
      `${name}: desktop viewport insets`,
    );
    assert.ok(
      geometry.dialog.width <= 1025,
      `${name}: desktop two-column copy workspace width`,
    );
    assert.ok(
      geometry.dialog.top >= 23 && geometry.dialog.bottom <= height - 23,
      `${name}: desktop viewport containment`,
    );
    if (!geometry.manual) {
      assert.ok(
        geometry.source.right <= geometry.version.left,
        `${name}: source preview precedes the form`,
      );
      assert.ok(
        Math.abs(geometry.version.top - geometry.size.top) < 1,
        `${name}: version and size share a row`,
      );
    }
  }
  assert.ok(
    geometry.source,
    `${name}: actual source preview pane remains present`,
  );
  assert.ok(
    geometry.close.width >= 44 && geometry.close.height >= 44,
    `${name}: close target >=44px`,
  );
  if (!geometry.manual) {
    assert.equal(
      geometry.primaryActions,
      1,
      `${name}: one generation/copy primary action`,
    );
    assert.ok(geometry.trigger.height >= 48, `${name}: primary action >=48px`);
    assert.deepEqual(
      geometry.items.map((item) => item.name),
      ['URL', 'Markdown', 'HTML'],
      `${name}: three formats are always present`,
    );
    for (const item of geometry.items)
      assert.ok(
        item.width >= 44 && item.height >= 44,
        `${name}: ${item.name} target >=44px`,
      );
    assert.equal(
      geometry.link.readOnly,
      true,
      `${name}: complete preview is read-only`,
    );
    assert.equal(
      geometry.link.wrap,
      'soft',
      `${name}: preview wraps without changing its value`,
    );
    assert.equal(
      geometry.link.overflow,
      false,
      `${name}: long link text fits the preview`,
    );
  }
  const screenshot = `${name}-${theme}-${width}${height === 400 ? '-short' : ''}.png`;
  if (screenshotRequired)
    await page.screenshot({
      path: join(config.output, screenshot),
      fullPage: true,
    });
  report.layouts.push({
    name,
    theme,
    formatRow,
    screenshot: screenshotRequired ? screenshot : null,
    ...geometry,
  });
  return geometry;
}
async function reveal(selector, edge = 'start') {
  // Use real wheel input and bounded actual scroll geometry; never write scrollTop.
  for (let attempt = 0; attempt < 8; attempt++) {
    const value = await page.evaluate(
      ({ selector, edge }) => {
        const d = document.querySelector(
          '[role="dialog"][aria-label="复制图片链接"]',
        );
        const b = d.querySelector('[data-slot="modal-body"]');
        const t = d.querySelector(selector);
        const br = b.getBoundingClientRect(),
          tr = t.getBoundingClientRect();
        const delta = edge === 'end' ? tr.bottom - br.bottom : tr.top - br.top;
        return {
          delta,
          scrollTop: b.scrollTop,
          targetScroll: Math.max(
            0,
            Math.min(b.scrollHeight - b.clientHeight, b.scrollTop + delta),
          ),
          x: br.x + br.width / 2,
          y: br.y + br.height / 2,
          reached:
            edge === 'end'
              ? tr.bottom <= br.bottom + 1 && tr.bottom > br.top
              : tr.top >= br.top - 1 && tr.top < br.bottom,
          header: d
            .querySelector('[data-slot="modal-header"]')
            .getBoundingClientRect().top,
        };
      },
      { selector, edge },
    );
    if (value.reached) return value;
    await page.mouse.move(value.x, value.y);
    await page.mouse.wheel(0, value.delta);
    await page.waitForFunction(
      (target) =>
        Math.abs(
          document.querySelector(
            '[role="dialog"][aria-label="复制图片链接"] [data-slot="modal-body"]',
          ).scrollTop - target,
        ) < 1,
      value.targetScroll,
    );
  }
  throw new Error(`Modal body cannot reveal ${selector} ${edge}`);
}
async function clickDisabledTrigger() {
  const position = await page.evaluate(() => {
    const node = document.querySelector('[data-testid="detail-copy-submit"]'),
      rect = node.getBoundingClientRect();
    return {
      disabled: node.disabled,
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
    };
  });
  assert.equal(position.disabled, true);
  const before = await page.evaluate(
    () => window.__clipboardCalls ?? window.__copyProbeCalls ?? 0,
  );
  await page.mouse.click(position.x, position.y);
  assert.equal(
    await page.evaluate(
      () => window.__clipboardCalls ?? window.__copyProbeCalls ?? 0,
    ),
    before,
    'Disabled primary does not write to the Clipboard',
  );
}
async function pressedCopyTargets() {
  await resizeViewport(page, 390, 844);
  await setTheme(page, 'dark');
  for (const [selector, name, minimum] of [
    ['[data-testid="detail-copy-submit"]', '复制链接', 48],
    ['button[aria-label="关闭复制链接"]', '关闭复制链接', 44],
  ]) {
    await page.focus(selector);
    await page.keyboard.down('Space');
    try {
      await page.waitForFunction(
        (selector) =>
          document.querySelector(selector)?.hasAttribute('data-pressed'),
        selector,
      );
      const target = await page.evaluate(
        ({ selector, name }) => {
          const node = document.querySelector(selector),
            r = node.getBoundingClientRect();
          return {
            name,
            width: r.width,
            height: r.height,
            pressed: node.hasAttribute('data-pressed'),
          };
        },
        { selector, name },
      );
      assert.ok(
        target.width >= 44 && target.height >= minimum,
        `${name}: pressed target keeps required dimensions`,
      );
      const screenshot = `copy-pressed-${name === '复制链接' ? 'submit' : 'close'}-dark-390.png`;
      await page.screenshot({
        path: join(config.output, screenshot),
        fullPage: true,
      });
      report.pressed.push({ ...target, screenshot });
    } finally {
      await page.keyboard.up('Space');
    }
    if (name === '关闭复制链接') {
      await page.waitForSelector(dialog, { state: 'hidden' });
      await openCopy();
    }
  }
}

async function chooseOriginal() {
  await page.click('loc=role:button[name*="复制版本"]');
  await page.click('loc=role:option[name="原图"]');
  await page.waitForFunction(() =>
    document
      .querySelector('[data-testid="copy-resolution"]')
      ?.textContent.includes('固定请求原图'),
  );
}
async function expectedDetail(id = 'library-007') {
  const response = await page.fetch(`/api/images/${id}`);
  assert.equal(response.status, 200);
  return JSON.parse(response.body);
}
async function copyAndRead(format, expected, mode) {
  await page.evaluate(() => {
    const native = navigator.clipboard.writeText.bind(navigator.clipboard);
    window.__copyProbeCalls = 0;
    window.__copyProbeText = null;
    navigator.clipboard.writeText = async (text) => {
      window.__copyProbeCalls++;
      await native(text);
      window.__copyProbeText = text;
      navigator.clipboard.writeText = native;
    };
  });
  const keyboard = format === 'markdown' && mode === 'default';
  if (keyboard) {
    await page.focus(
      '[data-testid="detail-copy-format"] [data-copy-format="markdown"]',
    );
    await page.keyboard.press('Space');
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-copy-format="markdown"]')
          ?.getAttribute('aria-checked') === 'true',
    );
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector('[data-testid="detail-copy-preview"]').value,
      ),
      expected,
      'Keyboard format selection updates the full preview before copying',
    );
    await page.focus('[data-testid="detail-copy-submit"]');
    await page.keyboard.press('Enter');
  } else
    await selectCopyFormat(
      page,
      `复制 ${format === 'markdown' ? 'Markdown' : format.toUpperCase()}`,
    );
  await page.waitForFunction(() => typeof window.__copyProbeText === 'string');
  assert.deepEqual(
    await page.evaluate(() => ({
      calls: window.__copyProbeCalls,
      text: window.__copyProbeText,
    })),
    { calls: 1, text: expected },
    `${mode} ${format}: activation completes one native write`,
  );
  await page.waitForFunction(() =>
    document
      .querySelector('[data-slot="toast"]')
      ?.textContent.includes('已复制到剪贴板'),
  );
  const { stdout } = await run('pbpaste', [], { encoding: 'utf8' });
  assert.equal(
    stdout,
    expected,
    `${mode} ${format}: exact native pasteboard text`,
  );
  await page.waitForFunction(
    () => document.activeElement?.dataset.testid === 'detail-copy-submit',
  );
  assert.equal(
    await page.evaluate(
      () => document.querySelector('[data-testid="detail-copy-preview"]').value,
    ),
    expected,
    'Preview keeps the exact full copied text',
  );
  report.clipboard.push({
    mode,
    format,
    length: expected.length,
    exact: true,
    mechanism: 'macOS pbpaste immediately after native application write',
    focus: 'detail-copy-submit',
    activation: keyboard ? 'keyboard Space/Enter' : 'pointer',
    nativeCalls: 1,
  });
}
async function heldDetail(mode) {
  await page.evaluate((mode) => {
    const original = window.fetch;
    window.__detailHoldCalls = 0;
    window.fetch = async (...args) => {
      const url = new URL(
        typeof args[0] === 'string' ? args[0] : args[0].url,
        location.href,
      );
      if (url.pathname !== '/api/images/library-007') return original(...args);
      window.__detailHoldCalls++;
      const response = await original(...args);
      window.fetch = original;
      if (mode === 'error')
        throw new TypeError(
          'Verification: real detail response lost at transport boundary',
        );
      await new Promise((resolve) => {
        window.__releaseDetail = resolve;
      });
      return response;
    };
  }, mode);
}
try {
  assert.notEqual(new URL(config.origin).port, '49241');
  await signIn(config.origin);
  const [storage] = await sql(
    'SELECT id,local_path FROM storage_configs LIMIT 1',
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
  const bytes = await readFile(
    join(config.projectDirectory, 'tests/fixtures/runtime/images/sample.png'),
  );
  for (const id of ['library-007', 'library-003', 'library-008', 'copy-empty'])
    await sql(
      `INSERT INTO media_images (id,storage_id,original_name,display_name,visibility,format,mime,width,height,byte_size,animated,classification,processing_status,created_at,updated_at) VALUES ('${id}','${storage.id}','${id}.png','${id}','public','png','image/png',640,480,${bytes.length},0,'static','ready',1700000000000,1700000000000)`,
    );
  await seedLibraryDetail(config, sql, directory, storage.id);
  await openDetail();
  await openCopy();
  const entry = await page.evaluate(() => {
    const d = document.querySelector('[data-testid="detail-copy-dialog"]');
    return {
      single: d.querySelectorAll('[data-testid="detail-copy-submit"]').length,
      formats: [...d.querySelectorAll('[data-copy-format]')].map((node) =>
        node.textContent.trim(),
      ),
      dropdowns: d.querySelectorAll('button[aria-label="选择复制格式"]').length,
      source: d
        .querySelector('[data-testid="detail-copy-source-preview"] img')
        ?.getAttribute('src'),
      preview: d.querySelector('[data-testid="detail-copy-preview"]').value,
    };
  });
  report.entry = entry;
  if (config.phase === 'red') {
    report.expectedFailure = true;
    await page.screenshot({
      path: join(config.output, 'old-hidden-format-menu.png'),
      fullPage: true,
    });
    report.redScreenshot = 'old-hidden-format-menu.png';
  }
  assert.equal(entry.single, 1, 'Copy formats share one primary copy action');
  assert.deepEqual(
    entry.formats,
    ['URL', 'Markdown', 'HTML'],
    'The approved formats are always visible',
  );
  assert.equal(entry.dropdowns, 0, 'Formats are not hidden in a dropdown');
  assert.ok(
    entry.source,
    'Copy workspace displays the actual resolved source image',
  );
  assert.ok(
    entry.preview,
    'Ready default mode exposes the complete link preview',
  );
  report.checks.push(
    'One primary action, three always-visible formats, complete read-only preview and actual source role preview.',
  );
  assert.equal(
    config.phase,
    'green',
    'Old production package unexpectedly satisfied the new requirement',
  );
  const saved = await run(
    'osascript',
    [
      '-l',
      'JavaScript',
      '-e',
      `ObjC.import('AppKit'); const p=$.NSPasteboard.generalPasteboard; const rows=[]; const items=p.pasteboardItems; for(let i=0;i<items.count;i++){ const item=items.objectAtIndex(i); const row=[]; const types=item.types; for(let j=0;j<types.count;j++){const type=types.objectAtIndex(j); const data=item.dataForType(type); row.push({type:ObjC.unwrap(type),data:ObjC.unwrap(data.base64EncodedStringWithOptions(0))});} rows.push(row);} JSON.stringify(rows);`,
    ],
    { maxBuffer: 32 * 1024 * 1024 },
  );
  savedClipboard = JSON.parse(saved.stdout);
  const detail = await expectedDetail();
  assert.equal(
    new URL(detail.defaultLink.links.url).searchParams.has('type'),
    false,
  );
  for (const theme of ['light', 'dark'])
    for (const [width, height] of [
      [1440, 1080],
      [390, 844],
      [390, 400],
    ]) {
      await capture('library-copy', width, height, theme);
      if (height === 400) {
        const before = await reveal('[data-testid="detail-copy-format"]');
        await capture('library-copy-formats', width, height, theme, true);
        const after = await reveal(
          '[data-testid="detail-copy-preview"]',
          'end',
        );
        assert.equal(
          after.header,
          before.header,
          'Short viewport body scrolling keeps the header fixed',
        );
        await capture('library-copy-preview', width, height, theme, true);
      }
      await page.focus('[data-copy-format="url"]');
      await page.keyboard.press('Space');
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-copy-format="url"]')
            ?.getAttribute('aria-checked') === 'true',
      );
      assert.equal(
        await page.evaluate(
          () =>
            document.querySelector('[data-testid="detail-copy-preview"]').value,
        ),
        detail.defaultLink.links.url,
      );
      await page.keyboard.press('Escape');
      await page.waitForSelector(dialog, { state: 'hidden' });
      await page.waitForFunction(
        () => document.activeElement?.textContent.trim() === '复制链接',
      );
      await openCopy();
    }
  report.checks.push(
    '360/390/430/768/1440 and 390×400 in both themes retain the full source/form workspace, three >=44px formats, one >=48px primary action, read-only wrapped preview and viewport containment; Escape returns focus to the originating detail action.',
  );
  for (const theme of ['light', 'dark'])
    for (const width of [360, 430, 768])
      await capture('copy-layout', width, 844, theme, false, false);
  await pressedCopyTargets();
  await resizeViewport(page, 1440, 1080);
  for (const format of ['url', 'markdown', 'html'])
    await copyAndRead(format, detail.defaultLink.links[format], 'default');
  await chooseOriginal();
  const original = detail.versions.find(
    (version) => version.kind === 'original',
  );
  assert.equal(
    new URL(original.links.url).searchParams.get('type'),
    'original',
  );
  for (const format of ['url', 'markdown', 'html'])
    await copyAndRead(format, original.links[format], 'fixed-original');
  // Native write happens inside trusted primary-button activation, before this gate waits.
  await page.evaluate(() => {
    const native = navigator.clipboard.writeText.bind(navigator.clipboard);
    window.__clipboardCalls = 0;
    window.__restoreClipboard = () => {
      navigator.clipboard.writeText = native;
    };
    navigator.clipboard.writeText = async (text) => {
      window.__clipboardCalls++;
      await native(text);
      await new Promise((resolve) => {
        window.__releaseClipboard = resolve;
      });
    };
  });
  await selectCopyFormat(page, '复制 URL');
  await page.waitForFunction(
    () => typeof window.__releaseClipboard === 'function',
  );
  assert.deepEqual(
    await page.evaluate(() => ({
      calls: window.__clipboardCalls,
      trigger: document.querySelector('[data-testid="detail-copy-submit"]')
        .disabled,
      mode: [
        ...document.querySelectorAll(
          '[role="dialog"][aria-label="复制图片链接"] button',
        ),
      ].find((n) => n.dataset.slot === 'select-trigger')?.disabled,
    })),
    { calls: 1, trigger: true, mode: true },
  );
  await clickDisabledTrigger();
  assert.equal(
    await page.evaluate(() => window.__clipboardCalls),
    1,
    'In-flight copy cannot submit twice',
  );
  await capture('copy-writing', 390, 844, 'dark');
  await page.evaluate(() => {
    window.__releaseClipboard();
    window.__restoreClipboard();
  });
  await page.waitForFunction(
    () =>
      !document.querySelector('[data-testid="detail-copy-submit"]').disabled,
  );
  report.checks.push(
    'A real native Clipboard write followed by a controlled completion gate disables format and version changes; repeated real pointer activation starts no second write.',
  );
  await page.keyboard.press('Escape');
  await page.waitForSelector(dialog, { state: 'hidden' });
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-testid="library-detail"]', {
    state: 'hidden',
  });
  // Real HTTP response retained while the existing query reports its pending state.
  const librarySource = await openDetail();
  await heldDetail('pending');
  await page.click(button('复制链接'));
  await page.waitForSelector(dialog);
  await page.waitForFunction(
    () => typeof window.__releaseDetail === 'function',
  );
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelector('[data-testid="detail-copy-submit"]').disabled,
    ),
    true,
  );
  await capture('copy-pending', 390, 844, 'light');
  await clickDisabledTrigger();
  assert.equal(await page.evaluate(() => window.__detailHoldCalls), 1);
  await page.evaluate(() => window.__releaseDetail());
  await page.waitForSelector('[data-testid="copy-resolution"]');
  await page.keyboard.press('Escape');
  await page.waitForSelector(dialog, { state: 'hidden' });
  await heldDetail('error');
  await page.click(button('复制链接'));
  await page.waitForSelector(dialog);
  await page.waitForSelector(`${dialog} [role="alert"]`);
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelector('[data-testid="detail-copy-submit"]').disabled,
    ),
    false,
    'Read failure keeps the single retry action available',
  );
  assert.equal(
    await page.evaluate(
      () => document.querySelector('[data-copy-format="url"]').disabled,
    ),
    true,
    'Read failure does not permit a stale copy format activation',
  );
  await capture('copy-read-error', 390, 844, 'dark');
  await page.click(button('重试读取'));
  await page.waitForSelector('[data-testid="copy-resolution"]');
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelector('[data-testid="detail-copy-submit"]').disabled,
    ),
    false,
  );
  await escapeCopy(librarySource);
  await openDetail('/library', 'copy-empty');
  await openCopy();
  const empty = await expectedDetail('copy-empty');
  assert.equal(empty.defaultLink.links, null);
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelector('[data-testid="detail-copy-submit"]').disabled,
    ),
    true,
  );
  await capture('copy-no-links', 390, 844, 'light');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  report.checks.push(
    'Pending and no-links disable copying; read failure exposes the single retry action; successful retry restores copying without changing format or link semantics.',
  );
  // Other consumers use the same shared detail/copy implementation.
  const albumResponse = await page.fetch('/api/albums', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: '复制菜单验收相册',
      description: '独立测试数据',
    }),
  });
  assert.equal(albumResponse.status, 201);
  const album = JSON.parse(albumResponse.body).album;
  const membership = await page.fetch('/api/images/library-007/collections', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ albumIds: [album.id] }),
  });
  assert.equal(membership.status, 200);
  for (const width of [1440, 390]) {
    const source = await openDetail(`/albums/${album.id}`);
    await openCopy();
    const expected = await expectedDetail();
    await copyAndRead('url', expected.defaultLink.links.url, 'album-default');
    await capture(
      'album-copy',
      width,
      width === 1440 ? 1080 : 844,
      width === 1440 ? 'light' : 'dark',
    );
    await escapeCopy(source);
    report.consumers.push({
      consumer: 'album',
      width,
      shared: true,
      copy: true,
      returnFocus: true,
    });
  }
  await page.goto(`${config.origin}/upload`);
  await page.waitForSelector('input[aria-label="选择图片文件"]', {
    state: 'attached',
  });
  await page.setInputFiles('input[aria-label="选择图片文件"]', [
    join(config.projectDirectory, 'tests/fixtures/runtime/images/sample.png'),
  ]);
  await page.waitForSelector(
    '[data-testid="upload-item"][data-state="queued"]',
  );
  await page.click(button('开始上传'));
  await page.waitForSelector(
    '[data-testid="upload-item"][data-state="ready"]',
    { timeout: 60000 },
  );
  const imageId = await page.evaluate(
    () => document.querySelector('[data-testid="upload-item"]').dataset.imageId,
  );
  const uploaded = await expectedDetail(imageId);
  assert.equal(uploaded.processingStatus, 'ready');
  report.uploadedImageId = imageId;
  for (const width of [1440, 390]) {
    await page.click(button('查看详情'));
    await page.waitForSelector('[data-testid="detail-body"]');
    await openCopy();
    await copyAndRead('url', uploaded.defaultLink.links.url, 'upload-default');
    await capture(
      'upload-copy',
      width,
      width === 1440 ? 1080 : 844,
      width === 1440 ? 'light' : 'dark',
    );
    await escapeCopy('[data-testid="upload-item"] button');
    report.consumers.push({
      consumer: 'upload',
      width,
      shared: true,
      copy: true,
      returnFocus: true,
    });
  }
  report.consumers.push({
    consumer: 'library',
    widths: [1440, 390],
    shared: true,
    formats: 3,
    modeChecks: ['default', 'fixed-original'],
    returnFocus: true,
  });
  report.checks.push(
    'Upload uses an actually accepted/processed Local image; album membership uses the real owner API; all three consumers copy exact backend-provided text and return focus to their source.',
  );
  // Real browser policy denial; API/cookies remain from this disposable server.
  denied = await clipboardDeniedProxy(config.origin);
  await signIn(denied.origin);
  await page.goto(`${denied.origin}/library?image=library-007`);
  await page.waitForSelector('[data-testid="detail-body"]');
  await page.click('loc=role:tab[name="压缩图"]');
  await page.waitForFunction(() =>
    document
      .querySelector('[data-testid="detail-preview"]:not([data-inert] *)')
      ?.getAttribute('src')
      ?.includes('type=compressed'),
  );
  await openCopy();
  assert.equal(
    await page.evaluate(async () =>
      (await fetch(location.href)).headers.get('permissions-policy'),
    ),
    'clipboard-write=()',
  );
  for (const mode of ['default', 'fixed-original']) {
    if (mode === 'fixed-original') await chooseOriginal();
    const links =
      mode === 'default' ? detail.defaultLink.links : original.links;
    for (const format of ['url', 'markdown', 'html']) {
      await selectCopyFormat(
        page,
        `复制 ${format === 'markdown' ? 'Markdown' : format.toUpperCase()}`,
      );
      await page.waitForSelector('textarea[aria-label="手动复制文本"]');
      const manual = await page.evaluate(() => {
        const n = document.querySelector('textarea[aria-label="手动复制文本"]');
        return {
          text: n.value,
          focused: n === document.activeElement,
          selected: n.selectionStart === 0 && n.selectionEnd === n.value.length,
        };
      });
      assert.equal(manual.text, links[format]);
      assert.equal(manual.focused, true);
      assert.equal(manual.selected, true);
      report.clipboard.push({
        mode,
        format,
        denied: true,
        mechanism: 'real Permissions-Policy clipboard-write=()',
        length: manual.text.length,
        complete: true,
        selected: true,
        focused: true,
      });
      if (mode === 'fixed-original' && format === 'html')
        for (const theme of ['light', 'dark'])
          for (const [width, height] of [
            [1440, 1080],
            [390, 844],
            [390, 400],
          ]) {
            const before = await capture('copy-manual', width, height, theme);
            if (height === 400) {
              await reveal('textarea[aria-label="手动复制文本"]');
              const after = await capture(
                'copy-manual-text',
                width,
                height,
                theme,
              );
              assert.equal(after.header.top, before.header.top);
              assert.equal(after.footer.bottom, before.footer.bottom);
              await reveal('textarea[aria-label="手动复制文本"]', 'end');
              await capture('copy-manual-tip', width, height, theme);
            }
          }
      await page.click(button('返回复制选项'));
      await page.waitForSelector('[data-testid="copy-resolution"]');
    }
  }
  await page.click(button('关闭复制链接'));
  await page.waitForFunction(
    () => document.activeElement?.textContent.trim() === '复制链接',
  );
  assert.ok(
    await page.evaluate(() =>
      document
        .querySelector('[data-testid="detail-preview"]:not([data-inert] *)')
        ?.getAttribute('src')
        ?.includes('type=compressed'),
    ),
    'Copy mode changes never change the compressed preview',
  );
  assert.deepEqual(denied.errors, []);
  report.checks.push(
    'Real Permissions-Policy denial retains exact full URL/Markdown/HTML in both modes, focuses and selects the whole manual text; short body uses real wheel input with fixed header/footer; preview remains compressed.',
  );
  report.status = 'passed';
} catch (error) {
  report.error = String(error.stack ?? error);
  try {
    report.page = await page.snapshot();
    await page.screenshot({
      path: join(config.output, 'failure.png'),
      fullPage: true,
    });
  } catch (snapshotError) {
    report.snapshotError = String(snapshotError);
  }
  throw error;
} finally {
  await denied?.close();
  try {
    await page.evaluate(() => {
      window.__releaseDetail?.();
      window.__releaseClipboard?.();
      window.__restoreClipboard?.();
    });
  } catch {}
  if (savedClipboard) {
    await run(
      'osascript',
      [
        '-l',
        'JavaScript',
        '-e',
        `ObjC.import('AppKit'); const p=$.NSPasteboard.generalPasteboard; p.clearContents; const output=$.NSMutableArray.alloc.init; for(const row of ${JSON.stringify(savedClipboard)}){const item=$.NSPasteboardItem.alloc.init; for(const entry of row){const data=$.NSData.alloc.initWithBase64EncodedStringOptions($(entry.data),0); item.setDataForType(data,$(entry.type));} output.addObject(item);} if(output.count)p.writeObjects(output);`,
      ],
      { maxBuffer: 32 * 1024 * 1024 },
    );
    report.clipboardRestored = true;
  }
  report.finishedAt = new Date().toISOString();
  await writeFile(
    join(config.output, 'copy-dropdown.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
}
console.log({
  status: report.status,
  checks: report.checks.length,
  layouts: report.layouts.length,
  output: config.output,
});
