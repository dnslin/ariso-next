/* global taskSpace, config */
const { default: assert } = await import('node:assert/strict');
const { execFile } = await import('node:child_process');
const { promisify } = await import('node:util');
const { cp, mkdir, mkdtemp, open, readFile, rm, writeFile } =
  await import('node:fs/promises');
const { tmpdir } = await import('node:os');
const { join } = await import('node:path');
const { identitySql } = await import(config.identitySessionScript);
const task = await taskSpace(config.spaceId);
const page = task.page('p1');
const ordinary = 'input[aria-label="选择图片文件"]';
const folder = 'input[aria-label="选择图片文件夹"]';
const dialog = '[data-testid="upload-input-dialog"]';
const item = '[data-testid="upload-item"]';
const button = (name) => `loc=role:button[name="${name}"]`;
const temporary = await mkdtemp(join(tmpdir(), 'ariso-upload-input-'));
const sample = join(
  config.projectDirectory,
  'tests/fixtures/runtime/images/sample.png',
);
const report = {
  status: 'failed',
  checks: [],
  layouts: [],
  limitations: [
    'Ego Chromium emulation does not verify physical touch, soft keyboards or device safe areas.',
    'Directory permission/read failures and delayed reads are controlled browser entry-boundary faults, not real operating-system permission failures.',
    'Supported-format input tests prove candidate acceptance and safe local preview; actual format verification remains server-side.',
    'GC checks track native input Files and the exact queued Files passed to object-URL creation. Formats without a local preview, including HEIC/SVG, have native input and URL checks but no direct queued-wrapper GC evidence.',
  ],
};
let clipboard;

async function count(expected) {
  await page.waitForFunction(
    (expected) =>
      document.querySelectorAll('[data-testid="upload-item"]').length ===
      expected,
    expected,
    { timeout: expected >= 400 ? 15000 : 10000 },
  );
}
async function queue() {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="upload-item"]')].map(
      (node) => ({
        id: node.dataset.queueId,
        state: node.dataset.state,
        name: node.querySelector('[data-testid="upload-file-row"] p')
          .textContent,
        preview: node.querySelector('img')?.getAttribute('src') ?? null,
      }),
    ),
  );
}
async function summary(text) {
  await page.waitForFunction(
    (text) =>
      document
        .querySelector('[data-testid="upload-input-dialog"]')
        ?.textContent.includes(text),
    text,
  );
  return page.evaluate(
    () =>
      document.querySelector('[data-testid="upload-input-dialog"]').textContent,
  );
}
async function closeSummary() {
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="upload-input-dialog"]'),
  );
}
async function reset() {
  await page.reload();
  await page.waitForSelector(ordinary, { state: 'attached' });
  await count(0);
  await page.evaluate(() => {
    window.__inputUrls = new Set();
    window.__inputFiles = [];
    window.__inputPreviewFiles = [];
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (file) => {
      window.__inputPreviewFiles.push(new WeakRef(file));
      const url = create(file);
      window.__inputUrls.add(url);
      return url;
    };
    URL.revokeObjectURL = (url) => {
      window.__inputUrls.delete(url);
      revoke(url);
    };
    document.addEventListener(
      'change',
      (event) => {
        if (
          event.target instanceof HTMLInputElement &&
          event.target.type === 'file'
        )
          for (const file of event.target.files)
            window.__inputFiles.push(new WeakRef(file));
      },
      true,
    );
  });
}
async function released() {
  assert.ok(
    await page.evaluate(() => window.__inputPreviewFiles.length > 0),
    'GC harness observed actual queued preview Files before release',
  );
  await page.cdp('HeapProfiler.collectGarbage');
  assert.deepEqual(
    await page.evaluate(() => ({
      files: window.__inputFiles.filter((ref) => ref.deref()).length,
      queuedPreviewFiles: window.__inputPreviewFiles.filter((ref) =>
        ref.deref(),
      ).length,
      urls: window.__inputUrls.size,
      inputs: [...document.querySelectorAll('input[type=file]')].reduce(
        (sum, node) => sum + node.files.length,
        0,
      ),
    })),
    { files: 0, queuedPreviewFiles: 0, urls: 0, inputs: 0 },
    'Removed queue releases native Files, exact queued preview Files, URLs and both file inputs',
  );
}
async function removeQueued() {
  // Cleanup uses the real rendered remove controls and their production handlers.
  await page.evaluate(() => {
    for (const node of document.querySelectorAll(
      '[data-testid="upload-item"][data-state="queued"] button',
    ))
      node.click();
  });
  await page.waitForFunction(
    () =>
      !document.querySelector(
        '[data-testid="upload-item"][data-state="queued"]',
      ),
  );
  await released();
}
async function directory(path) {
  const inputState = await page.evaluate(() => {
    window.__directoryChooserEvents = [];
    const input = document.querySelector('input[aria-label="选择图片文件夹"]');
    const record = (event) =>
      window.__directoryChooserEvents.push({
        type: event.type,
        files: input.files.length,
        relativePathCount: [...input.files].filter(
          (file) => file.webkitRelativePath.length > 0,
        ).length,
        relativePathSample: [...input.files]
          .slice(0, 3)
          .map((file) => file.webkitRelativePath),
        time: performance.now(),
      });
    for (const type of ['change', 'cancel'])
      input.addEventListener(type, record, { once: true, capture: true });
    window.__restoreDirectoryChooserObserver = () => {
      for (const type of ['change', 'cancel'])
        input.removeEventListener(type, record, true);
      delete window.__restoreDirectoryChooserObserver;
    };
    return {
      type: input.type,
      multiple: input.multiple,
      webkitdirectory: input.webkitdirectory,
      directoryAttribute: input.hasAttribute('webkitdirectory'),
      filesBefore: input.files.length,
    };
  });
  report.directoryInput = { ...inputState, ownership: task.ownership };
  try {
    const document = await page.cdp('DOM.getDocument');
    const { nodeId } = await page.cdp('DOM.querySelector', {
      nodeId: document.root.nodeId,
      selector: folder,
    });
    assert.ok(nodeId, 'Production webkitdirectory input exists');
    await page.cdp('DOM.setFileInputFiles', { nodeId, files: [path] });
    await page.waitForFunction(
      () => window.__directoryChooserEvents.length > 0,
    );
    report.directoryChooser = await page.evaluate(
      () => window.__directoryChooserEvents,
    );
    assert.equal(
      report.directoryChooser.some((event) => event.type === 'cancel'),
      false,
      'Native directory enumeration was cancelled by the browser; folder selection remains unverified',
    );
  } finally {
    await page.evaluate(() => window.__restoreDirectoryChooserObserver());
  }
}
async function drop(paths) {
  const point = await page.evaluate(() => {
    const node = document.querySelector('[data-testid="upload-input-zone"]');
    const box = node.getBoundingClientRect();
    return {
      x: box.left + Math.min(box.width / 2, 80),
      y: box.top + Math.min(box.height / 2, 80),
    };
  });
  const data = { items: [], files: paths, dragOperationsMask: 1 };
  for (const type of ['dragEnter', 'dragOver', 'drop'])
    await page.cdp('Input.dispatchDragEvent', { type, ...point, data });
}
async function layouts(
  name,
  widths = [360, 390, 430, 768, 1199, 1200, 1440, 1920, 2240],
) {
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
      const height = width >= 1200 ? 1080 : 844;
      await page.cdp('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: width < 768,
      });
      await page.waitForFunction((width) => innerWidth === width, width);
      const result = await page.evaluate(() => ({
        width: innerWidth,
        height: innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        compositionWidth: document
          .querySelector('[data-testid="upload-composition"]')
          .getBoundingClientRect().width,
        picker: (() => {
          const card = document.querySelector('[data-testid="upload-picker"]');
          if (!card) return null;
          const rect = (node) => {
            const { width, height, top, left, bottom } =
              node.getBoundingClientRect();
            return { width, height, top, left, bottom };
          };
          const buttons = [...card.querySelectorAll('button')].filter(
            (node) => node.getBoundingClientRect().width > 0,
          );
          return {
            icon: rect(
              card.querySelector('[data-testid="upload-idle-motion"]'),
            ),
            buttons: buttons.map((node) => ({
              name: node.textContent,
              ...rect(node),
            })),
            headingSize: getComputedStyle(card.querySelector('h2')).fontSize,
            padding: getComputedStyle(card).paddingLeft,
          };
        })(),
        dialog:
          document.querySelector('[data-testid="upload-input-dialog"]')
            ?.textContent ?? null,
        modalGeometry: (() => {
          const modal = document.querySelector(
            '[data-testid="upload-input-dialog"]',
          );
          if (!modal) return null;
          const header = modal
            .querySelector('.modal__header')
            .getBoundingClientRect();
          const body = modal
            .querySelector('.modal__body')
            .getBoundingClientRect();
          const footer = modal
            .querySelector('.modal__footer')
            .getBoundingClientRect();
          return {
            bodyGap: body.top - header.bottom,
            footerGap: footer.top - body.bottom,
            buttons: [...modal.querySelectorAll('button')].map((node) => {
              const rect = node.getBoundingClientRect();
              return {
                width: rect.width,
                height: rect.height,
                available: footer.width,
              };
            }),
          };
        })(),
        targets: [...document.querySelectorAll('button,a')]
          .filter((node) => {
            const r = node.getBoundingClientRect();
            return r.width && r.height;
          })
          .map((node) => ({
            name: node.getAttribute('aria-label') || node.textContent,
            width: node.getBoundingClientRect().width,
            height: node.getBoundingClientRect().height,
            shell: node.classList.contains('shell-nav-link'),
          })),
      }));
      assert.ok(
        result.scrollWidth <= width,
        `${name}/${theme}/${width}: no horizontal overflow`,
      );
      if (width >= 1200)
        assert.ok(
          result.compositionWidth <= 1280,
          'Approved desktop composition stays within 1280px in every queue state',
        );
      for (const target of result.targets)
        assert.ok(
          target.width >= 44 &&
            target.height >= (width >= 1200 && target.shell ? 40 : 44),
          `${target.name}: 44px target`,
        );
      if (name === 'empty')
        assert.equal(
          result.targets.find((target) => target.name === '选择图片').height,
          48,
          'Figma image-picker button is 48px high',
        );
      if (result.picker) {
        const choose = result.picker.buttons.find(
          (target) => target.name === '选择图片',
        );
        assert.equal(choose.height, 48);
        if (width >= 1200) assert.equal(choose.width, 160);
        assert.equal(
          result.picker.headingSize,
          width >= 1200 ? '28px' : '20px',
        );
        if (width < 1200) {
          const folder = result.picker.buttons.find(
            (target) => target.name === '选择文件夹',
          );
          assert.deepEqual(
            [folder.width, folder.height, folder.top],
            [choose.width, 48, choose.top],
            'Approved mobile actions are equal and share a row',
          );
          assert.equal(folder.left - choose.left - choose.width, 12);
          assert.deepEqual(
            [result.picker.icon.width, result.picker.icon.height],
            [32, 32],
          );
          assert.equal(result.picker.padding, '24px');
        } else {
          assert.deepEqual(
            [result.picker.icon.width, result.picker.icon.height],
            [64, 64],
          );
          const folder = result.picker.buttons.find(
            (target) => target.name === '选择文件夹',
          );
          assert.deepEqual(
            [folder.width, folder.height, folder.top],
            [160, 48, choose.top],
          );
          assert.equal(
            folder.left - choose.left - choose.width,
            12,
            'Approved desktop actions have a 12px gap',
          );
        }
      }
      if (result.modalGeometry) {
        assert.equal(
          result.modalGeometry.bodyGap,
          16,
          'Figma header/body spacing',
        );
        assert.equal(
          result.modalGeometry.footerGap,
          16,
          'Figma body/footer spacing',
        );
        for (const target of result.modalGeometry.buttons) {
          assert.equal(target.height, 48, 'Figma modal button is 48px high');
          assert.equal(
            target.width,
            target.available,
            'Figma modal button fills content width',
          );
        }
      }
      const screenshot = join(
        config.output,
        `upload-input-${name}-${theme}-${width}.png`,
      );
      await page.screenshot({ path: screenshot });
      report.layouts.push({ name, theme, screenshot, ...result });
    }
  }
}

try {
  const nested = join(temporary, '旅行文件夹');
  await mkdir(join(nested, '子目录'), { recursive: true });
  await mkdir(join(nested, '空目录'));
  await cp(sample, join(nested, '相同.png'));
  await cp(sample, join(nested, '子目录', '相同.png'));
  await cp(sample, join(temporary, '.photo'));
  await writeFile(join(nested, '说明.txt'), 'not an image');
  await page.goto(`${config.origin}/upload`);
  await page.waitForFunction(
    () =>
      document.querySelector('#email') ||
      document.querySelector('input[aria-label="选择图片文件"]'),
  );
  if (await page.evaluate(() => !!document.querySelector('#email'))) {
    await page.fill('#email', config.credentials.email);
    await page.fill('#password', config.credentials.password);
    await page.click(button('登录'));
  }
  await page.waitForSelector(ordinary, { state: 'attached' });
  await reset();
  const before = await identitySql(
    config,
    'SELECT count(*) AS count FROM upload_submissions',
  );
  const settings = JSON.parse((await page.fetch('/upload/settings')).body);
  assert.equal(
    settings.queueLimit,
    500,
    'Disposable runtime uses default queue limit',
  );
  await layouts('empty');
  await page.setInputFiles(ordinary, [
    sample,
    join(nested, '相同.png'),
    join(nested, '子目录', '相同.png'),
  ]);
  await count(3);
  assert.equal(
    await page.evaluate(
      () => !!document.querySelector('[data-testid="upload-input-dialog"]'),
    ),
    false,
    'Valid ordinary selection does not open scanning modal',
  );
  await page.setInputFiles(ordinary, [sample]);
  await count(4);
  const repeated = await queue();
  assert.equal(new Set(repeated.map((entry) => entry.id)).size, 4);
  assert.equal(repeated.filter((entry) => entry.name === '相同.png').length, 2);
  assert.ok(repeated.every((entry) => entry.state === 'queued'));
  await layouts('ordinary');
  await removeQueued();
  report.checks.push(
    'Real multiple selection preserves same-name files and repeated explicit selection as independent queued IDs; no automatic upload or scan dialog.',
  );

  await page.setInputFiles(ordinary, [join(temporary, '.photo')]);
  await count(1);
  assert.equal(
    (await queue())[0].name,
    '.photo',
    'Hidden basename survives candidate identification',
  );
  await removeQueued();

  await directory(nested);
  const folderSummary = await summary('文件扫描完成');
  await count(2);
  assert.equal(
    (await queue()).filter((entry) => entry.name === '相同.png').length,
    2,
  );
  assert.ok(
    (await queue()).every((entry) => !entry.name.includes('/')),
    'Relative directory paths are discarded',
  );
  assert.match(folderSummary, /不支持|未支持/);
  await layouts('directory-complete');
  await closeSummary();
  await removeQueued();
  report.checks.push(
    'Native webkitdirectory input recursively reads nested duplicate basenames, ignores empty directories, reports unsupported files and discards hierarchy.',
  );

  await drop([nested]);
  await summary('文件扫描完成');
  await count(2);
  assert.deepEqual((await queue()).map((entry) => entry.name).sort(), [
    '相同.png',
    '相同.png',
  ]);
  await closeSummary();
  await removeQueued();
  report.checks.push(
    'Native Chromium CDP dragEnter/dragOver/drop of a real filesystem directory exercises recursive FileSystemEntry reading.',
  );
  await drop([sample]);
  await count(1);
  assert.equal((await queue())[0].name, 'sample.png');
  await removeQueued();
  report.checks.push(
    'Native ordinary-file drag/drop enters the same manual queue.',
  );

  const formats = [
    'static.webp',
    'static.avif',
    'primary-second.heic',
    'static.gif',
    'static.bmp',
    'static.tiff',
    'multiple.ico',
  ];
  const svg = join(temporary, '脚本.svg');
  await writeFile(
    svg,
    '<svg xmlns="http://www.w3.org/2000/svg"><script>parent.__svgExecuted=true</script><rect width="10" height="10"/></svg>',
  );
  const supported = [
    sample,
    join(config.projectDirectory, 'tests/fixtures/runtime/images/sample.jpg'),
    ...formats.map((name) =>
      join(config.projectDirectory, 'tests/fixtures/media-formats', name),
    ),
    svg,
  ];
  await page.setInputFiles(ordinary, supported);
  await count(supported.length);
  const candidates = await queue();
  assert.equal(
    candidates.find((entry) => entry.name.endsWith('.heic')).preview,
    null,
    'Unsupported browser HEIC preview uses format placeholder',
  );
  assert.equal(
    candidates.find((entry) => entry.name === '脚本.svg').preview,
    null,
    'SVG has no local executable preview',
  );
  assert.equal(
    await page.evaluate(
      () =>
        !!window.__svgExecuted ||
        !!document.querySelector('[data-testid="upload-item"] script'),
    ),
    false,
  );
  await layouts('format-placeholders', [390, 1440]);
  await removeQueued();
  report.checks.push(
    'Real JPEG/PNG/WebP/AVIF/HEIC/GIF/BMP/TIFF/ICO samples and hostile SVG enter the queue; HEIC/SVG placeholders remain safe without executing SVG.',
  );

  // Save every native pasteboard representation, not only text. Keep contents
  // in this process and never print them or persist them in the report.
  const run = promisify(execFile);
  assert.equal(
    process.platform,
    'darwin',
    'Native clipboard backup requires the project macOS Ego environment',
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
  clipboard = JSON.parse(saved.stdout);
  const png = (await readFile(sample)).toString('base64');
  await page.focus('#upload-title');
  await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (character) =>
      character.charCodeAt(0),
    );
    await navigator.clipboard.write([
      new ClipboardItem({
        'image/png': new Blob([bytes], { type: 'image/png' }),
      }),
    ]);
  }, png);
  await page.keyboard.press('Meta+V');
  await count(1);
  assert.match((await queue())[0].name, /^粘贴图片-.+\.png$/);
  await page.keyboard.press('Meta+V');
  await count(2);
  assert.equal(new Set((await queue()).map((entry) => entry.id)).size, 2);
  await removeQueued();
  await page.keyboard.paste('https://example.test/remote.png');
  await count(0);
  report.checks.push(
    'Actual image/png ClipboardItem and native Meta+V produce generated screenshot filenames and independent repeats; native text URL paste does not import remotely.',
  );

  const mixed = join(temporary, '混合');
  await mkdir(mixed);
  await cp(sample, join(mixed, '正常.png'));
  await writeFile(join(mixed, '空.png'), '');
  await writeFile(join(mixed, '文档.pdf'), '%PDF-test');
  const oversized = await open(join(mixed, '过大.png'), 'w');
  try {
    await oversized.truncate(settings.maxFileBytes + 1);
  } finally {
    await oversized.close();
  }
  await directory(mixed);
  const mixedSummary = await summary('文件扫描完成');
  await count(1);
  for (const reason of [/空文件|文件为空/, /不支持|未支持/, /超限|大小超|超过/])
    assert.match(mixedSummary, reason);
  await layouts('mixed-result', [390, 1440]);
  await page.cdp('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 400,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await page.keyboard.press('Tab');
  assert.equal(
    await page.evaluate(
      () =>
        !!document.activeElement?.closest(
          '[data-testid="upload-input-dialog"]',
        ),
    ),
    true,
    'Keyboard focus stays in short viewport modal',
  );
  await page.screenshot({
    path: join(config.output, 'upload-input-short-dialog.png'),
  });
  const shortContent = await page.evaluate(() => {
    const modal = document.querySelector('[data-testid="upload-input-dialog"]');
    const body = modal.querySelector('.modal__body');
    const explanation = body.lastElementChild;
    return {
      bodyHeight: body.getBoundingClientRect().height,
      contentHeight: [...body.children].reduce(
        (sum, node) => sum + node.getBoundingClientRect().height,
        16,
      ),
      explanationBottom: explanation.getBoundingClientRect().bottom,
      lastLineBottom:
        explanation.lastElementChild.getBoundingClientRect().bottom,
      scrollHeight: modal.scrollHeight,
      clientHeight: modal.clientHeight,
    };
  });
  assert.ok(
    shortContent.bodyHeight >= shortContent.contentHeight,
    'Short viewport does not compress explanatory content',
  );
  assert.ok(
    shortContent.explanationBottom >= shortContent.lastLineBottom,
    'All explanation lines stay inside their background',
  );
  await page.evaluate(() => {
    const modal = document.querySelector('[data-testid="upload-input-dialog"]');
    modal.scrollTop = modal.scrollHeight;
  });
  assert.equal(
    await page.evaluate(() => {
      const modal = document.querySelector(
        '[data-testid="upload-input-dialog"]',
      );
      const last = modal
        .querySelector('.modal__footer')
        .lastElementChild.getBoundingClientRect();
      const box = modal.getBoundingClientRect();
      return last.top >= box.top && last.bottom <= box.bottom;
    }),
    true,
    'Short viewport can scroll to both modal actions',
  );
  await page.screenshot({
    path: join(config.output, 'upload-input-short-dialog-bottom.png'),
  });
  report.shortViewport = shortContent;
  await closeSummary();
  await page.waitForFunction(
    () =>
      document.activeElement?.isConnected &&
      !document.activeElement.closest('[role="dialog"]') &&
      document.activeElement !== document.body,
  );
  await removeQueued();
  report.checks.push(
    'Real mixed directory reports empty/unsupported/oversized separately, retains the valid image, traps short-viewport keyboard focus and restores focus after Escape.',
  );

  assert.deepEqual(
    await identitySql(
      config,
      'SELECT count(*) AS count FROM upload_submissions',
    ),
    before,
    'Every selection/drop/paste requires explicit start and creates no submission',
  );
  await reset();
  const controlled = join(temporary, 'controlled-entry');
  await mkdir(controlled);
  await cp(sample, join(controlled, '真实.png'));
  const pngBytes = [...(await readFile(sample))];
  async function entryFault(mode) {
    await page.evaluate(
      ({ mode, pngBytes }) => {
        const original = DataTransferItem.prototype.webkitGetAsEntry;
        DataTransferItem.prototype.webkitGetAsEntry = function () {
          const entry = original.call(this);
          if (entry?.name !== 'controlled-entry') return entry;
          let batch = 0;
          return {
            isDirectory: true,
            isFile: false,
            name: entry.name,
            fullPath: entry.fullPath,
            createReader: () => ({
              readEntries(done) {
                if (++batch === 1) {
                  const files = Array.from(
                    { length: 20 },
                    (_, index) =>
                      new File(
                        [new Uint8Array(pngBytes)],
                        `受控-${index}.png`,
                        { type: 'image/png' },
                      ),
                  );
                  for (const file of files)
                    window.__inputFiles.push(new WeakRef(file));
                  done(files);
                } else if (batch === 2 && mode === 'permission') {
                  done([
                    {
                      isDirectory: true,
                      isFile: false,
                      name: '不可读目录',
                      fullPath: '/不可读目录',
                      createReader: () => ({
                        readEntries(_done, fail) {
                          fail(
                            new DOMException(
                              'Verification controlled directory read denied',
                              'NotAllowedError',
                            ),
                          );
                        },
                      }),
                    },
                  ]);
                } else if (batch === 2 && mode === 'hold') {
                  window.__continueInputScan = () => {
                    done([
                      new File([new Uint8Array(pngBytes)], '延迟.png', {
                        type: 'image/png',
                      }),
                    ]);
                  };
                } else done([]);
              },
            }),
          };
        };
        window.__restoreInputEntry = () => {
          DataTransferItem.prototype.webkitGetAsEntry = original;
          window.__continueInputScan?.();
          delete window.__continueInputScan;
          delete window.__restoreInputEntry;
        };
      },
      { mode, pngBytes },
    );
  }
  await entryFault('permission');
  try {
    await drop([controlled]);
    const failedRead = await summary('文件扫描完成');
    await count(20);
    assert.match(failedRead, /文件或目录读取失败 1 项/);
    await layouts('read-error', [390, 1440]);
    await closeSummary();
  } finally {
    await page.evaluate(() => window.__restoreInputEntry?.());
  }
  await removeQueued();
  report.checks.push(
    'Controlled FileSystemEntry NotAllowedError reports one failed directory while preserving 20 successfully read files; this is not OS permission evidence.',
  );

  for (const stop of ['button', 'Escape']) {
    await entryFault('hold');
    try {
      await drop([controlled]);
      await summary('正在扫描文件夹');
      await page.waitForFunction(
        () => typeof window.__continueInputScan === 'function',
      );
      await count(20);
      await page.waitForFunction(
        () =>
          !!document.activeElement?.closest(
            '[data-testid="upload-input-dialog"]',
          ),
        undefined,
        { timeout: 10000 },
      );
      if (stop === 'button') {
        await layouts('scanning', [390, 1440]);
        await page.click(button('停止扫描'));
      } else await page.keyboard.press('Escape');
      await summary('扫描已停止');
      await count(20);
      if (stop === 'button') await layouts('stopped', [390, 1440]);
      await closeSummary();
      await page.setInputFiles(ordinary, [sample]);
      await count(21);
      await page.evaluate(() => window.__restoreInputEntry());
      await page.evaluate(
        () =>
          new Promise((done) =>
            requestAnimationFrame(() => requestAnimationFrame(done)),
          ),
      );
      await count(21);
    } finally {
      await page.evaluate(() => window.__restoreInputEntry?.());
    }
    await removeQueued();
  }
  report.checks.push(
    'Stop button and Escape cancel a genuinely pending entry read, retain accepted files and permit new input; late callbacks add no files and removal releases tracked references.',
  );

  assert.deepEqual(
    await identitySql(
      config,
      'SELECT count(*) AS count FROM upload_submissions',
    ),
    before,
    'Input cancellation creates no upload submission',
  );
  await page.setInputFiles(ordinary, [sample]);
  await count(1);
  await page.click(button('开始上传'));
  await page.waitForSelector(`${item}[data-state="ready"]`, { timeout: 15000 });
  const resultId = await page.evaluate(
    () => document.querySelector('[data-testid="upload-item"]').dataset.imageId,
  );
  const many = join(temporary, '大队列');
  await mkdir(many);
  await Promise.all(
    Array.from({ length: 501 }, (_, index) =>
      cp(sample, join(many, `图片-${index}.png`)),
    ),
  );
  await directory(many);
  const full = await summary('队列已满');
  await count(500);
  assert.match(full, /500\s*\/\s*500/);
  assert.match(full, /其中 1 项已完成/);
  assert.match(full, /多出的 2 个文件未加入/);
  assert.equal(
    (await queue()).filter((entry) => entry.state === 'queued').length,
    499,
  );
  await layouts('queue-full', [390, 1440]);
  await page.click(`${dialog} button:text-is("清空已完成")`);
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="upload-input-dialog"]'),
  );
  await count(499);
  assert.equal(
    (
      await identitySql(
        config,
        `SELECT id FROM media_images WHERE id='${resultId}'`,
      )
    ).length,
    1,
    'Clearing completed result retains real persisted image',
  );
  await page.setInputFiles(ordinary, [sample]);
  await count(500);
  await removeQueued();
  await count(0);
  report.checks.push(
    'Real 501-file folder reaches default limit 500 including a real ready result, reports exactly two excluded files, clears only the result to release capacity, retains its database image and releases tracked native Files, actual queued PNG Files and URLs.',
  );

  const noDirectory = await page.cdp('Page.addScriptToEvaluateOnNewDocument', {
    source: 'delete HTMLInputElement.prototype.webkitdirectory;',
  });
  try {
    await reset();
    await page.click(button('选择文件夹'));
    await summary('当前浏览器无法读取文件夹');
    await layouts('directory-unavailable', [390, 1440]);
    // Set ordinary files without opening an OS chooser requiring human dismissal.
    await closeSummary();
    await page.setInputFiles(ordinary, [sample]);
    await count(1);
    await removeQueued();
  } finally {
    await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
      identifier: noDirectory.identifier,
    });
    await reset();
  }
  report.checks.push(
    'Controlled missing webkitdirectory capability shows explicit browser guidance while native ordinary selection remains usable.',
  );
  report.status = 'passed';
} catch (error) {
  report.error = String(error.stack ?? error);
  report.page = await page.snapshot();
  throw error;
} finally {
  await page.evaluate(() => window.__restoreInputEntry?.());
  if (clipboard) {
    const restore = join(temporary, 'restore-clipboard.js');
    await writeFile(
      restore,
      `ObjC.import('AppKit'); const p=$.NSPasteboard.generalPasteboard; p.clearContents; const output=$.NSMutableArray.alloc.init; for(const row of ${JSON.stringify(clipboard)}){const item=$.NSPasteboardItem.alloc.init; for(const entry of row){const data=$.NSData.alloc.initWithBase64EncodedStringOptions($(entry.data),0); item.setDataForType(data,$(entry.type));} output.addObject(item);} if(output.count)p.writeObjects(output);`,
    );
    await promisify(execFile)('osascript', ['-l', 'JavaScript', restore]);
    report.clipboardRestored = true;
  }
  await rm(temporary, { recursive: true, force: true });
  report.fixturesRemoved = true;
  await writeFile(
    join(config.output, 'upload-input.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
console.log({
  status: report.status,
  checks: report.checks.length,
  layouts: report.layouts.length,
});
