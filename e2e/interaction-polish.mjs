/* global taskSpace, config */
const { default: assert } = await import('node:assert/strict');
const { copyFile, readFile, writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { setTimeout: delay } = await import('node:timers/promises');
const { identitySql } = await import(config.identitySessionScript);
const task = await taskSpace(config.spaceId);
const page = task.page('p1');
const sql = (statement) => identitySql(config, statement);
const button = (name) => `loc=role:button[name="${name}"]`;
const width = config.width >= 1200 ? 1920 : 390;
const height = width >= 1200 ? 1080 : 844;
const report = { status: 'running', width, height, checks: [], images: [] };
const output = (name) => join(config.output, `interaction-${width}-${name}`);
const fixture = (name) =>
  join(config.projectDirectory, 'tests/fixtures/runtime/images', name);
const added = output('added.png');
await copyFile(fixture('sample.png'), added);

async function geometry(selector) {
  return page.evaluate((selector) => {
    const element = document.querySelector(selector);
    if (!element) throw new Error(`Missing measured element: ${selector}`);
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }, selector);
}
function sameGeometry(actual, expected, label) {
  for (const key of ['x', 'y', 'width', 'height'])
    assert.ok(
      Math.abs(actual[key] - expected[key]) <= 1,
      `${label} ${key}: ${actual[key]} vs ${expected[key]}`,
    );
}
async function decoded() {
  await page.waitForFunction(() => {
    const img = document.querySelector('[data-testid="detail-preview"]');
    return img?.complete && img.naturalWidth > 0;
  });
  await page.waitForSelector('[data-testid="preview-skeleton"]', {
    state: 'hidden',
  });
}
async function waitPaused(previewUrl) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const events = await page.events();
    const paused = events.filter(
      (event) =>
        event.method === 'Fetch.requestPaused' &&
        event.params.request.url === previewUrl,
    );
    if (paused.length) return paused.map((event) => event.params.requestId);
    await delay(50);
  }
  throw new Error(
    'Real image response never reached the controlled Fetch pause',
  );
}
async function disclosure() {
  const trigger = 'loc=role:button[name*="查看访问说明"]';
  await page.focus(trigger);
  await page.keyboard.press('Enter');
  await page.waitForSelector('loc=role:dialog[name="访问说明"]');
  assert.ok(
    await page.evaluate(
      () =>
        document
          .querySelector('[role="dialog"][aria-label="访问说明"]')
          .textContent.trim().length > 10,
    ),
  );
  await page.keyboard.press('Escape');
  await page.waitForSelector('loc=role:dialog[name="访问说明"]', {
    state: 'hidden',
  });
  assert.equal(
    await page.evaluate(() =>
      document.activeElement?.getAttribute('aria-label'),
    ),
    '公开：查看访问说明',
  );
  assert.ok(
    await page.evaluate(
      () => document.activeElement.querySelector('[data-slot="chip"]') !== null,
    ),
    'Visibility trigger uses the real Chip',
  );
}
try {
  await page.cdp('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
  await page.cdp('Emulation.setEmulatedMedia', {
    features: [
      { name: 'prefers-color-scheme', value: 'light' },
      { name: 'prefers-reduced-motion', value: 'no-preference' },
    ],
  });
  await page.goto(`${config.origin}/upload`);
  await page.waitForSelector('input[type=file]', { state: 'attached' });
  assert.equal(
    await page.evaluate(
      () => document.querySelector('input[type=file]').multiple,
    ),
    true,
    'Native file chooser accepts multiple images',
  );
  await page.hover('.shell-footer');
  const idle = '[data-testid="upload-idle-motion"]';
  await page.waitForSelector(idle);
  const animation = await page.evaluate(() => {
    const node = document.querySelector('[data-testid="upload-idle-motion"]');
    const style = getComputedStyle(node);
    return {
      name: style.animationName,
      duration: style.animationDuration,
      repeat: style.animationIterationCount,
      hovered: node.matches(':hover'),
    };
  });
  assert.deepEqual(animation, {
    name: 'upload-float',
    duration: '2.8s',
    repeat: 'infinite',
    hovered: false,
  });
  await page.cdp('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await page.waitForFunction(
    () =>
      getComputedStyle(
        document.querySelector('[data-testid="upload-idle-motion"]'),
      ).animationName === 'none',
  );
  await page.cdp('Emulation.setEmulatedMedia', {
    features: [
      { name: 'prefers-color-scheme', value: 'light' },
      { name: 'prefers-reduced-motion', value: 'no-preference' },
    ],
  });
  report.checks.push(
    'Idle upload cloud animates continuously without hover; reduced motion disables its animation.',
  );
  await page.screenshot({ path: output('upload-empty.png') });

  await page.setInputFiles('input[type=file]', [
    fixture('sample.jpg'),
    fixture('sample.png'),
  ]);
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid="upload-item"]').length === 2,
  );
  await page.waitForSelector(button('继续添加'));
  // Use the actual append action and native chooser, not a fabricated change event.
  const chooserPromise = page.waitForFileChooser({ timeout: 10000 });
  await page.click(button('继续添加'));
  const chooser = await chooserPromise;
  await chooser.setFiles(added);
  await page.waitForFunction(
    () => document.querySelectorAll('[data-testid="upload-item"]').length === 3,
  );
  assert.equal(
    await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="upload-item"]')].every(
        (node) => node.dataset.state === 'queued',
      ),
    ),
    true,
  );
  const queue = await geometry('[data-testid="upload-queue"]');
  assert.ok(queue.width > 0 && queue.height > 0);
  const viewport = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  assert.ok(viewport.scroll <= viewport.width + 1);
  const composition = await geometry('[data-testid="upload-composition"]');
  if (width === 1920) {
    const available = await page.evaluate(() => {
      const main = document.querySelector('main');
      const style = getComputedStyle(main);
      return (
        main.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight)
      );
    });
    assert.ok(
      Math.abs(composition.width - available) <= 1,
      'Wide composition fills the available main content width',
    );
    assert.ok(
      Math.abs(queue.width - (composition.width - 360 - 24)) <= 1,
      'Wide queue shares the composition with the 360px settings and 24px gap',
    );
  } else {
    assert.ok(
      Math.abs(queue.width - composition.width) <= 1,
      'Mobile queue fills the composition',
    );
  }
  report.composition = composition;
  report.queue = queue;
  await page.screenshot({ path: output('queue-three.png') });
  await page.click(button('开始上传'));
  await page.waitForFunction(
    () => {
      const items = [
        ...document.querySelectorAll('[data-testid="upload-item"]'),
      ];
      return (
        items.length === 3 &&
        items.every((node) => node.dataset.state === 'ready')
      );
    },
    undefined,
    { timeout: 60000 },
  );
  const ids = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="upload-item"]')].map(
      (node) => node.dataset.imageId,
    ),
  );
  assert.equal(
    new Set(ids).size,
    3,
    'Each selected file becomes its own image',
  );
  const snapshots = [];
  for (const id of ids) {
    const [saved] = await sql(
      `SELECT i.id,i.original_name,i.processing_status,j.snapshot,j.status AS job_status,o.key,o.storage_id,s.local_path FROM media_images i JOIN media_jobs j ON j.image_id=i.id JOIN media_objects o ON o.image_id=i.id AND o.purpose='original' JOIN storage_configs s ON s.id=o.storage_id WHERE i.id='${id}'`,
    );
    assert.equal(saved.processing_status, 'ready');
    assert.equal(saved.job_status, 'succeeded');
    snapshots.push(JSON.parse(saved.snapshot));
    const source =
      saved.original_name === 'sample.jpg'
        ? fixture('sample.jpg')
        : fixture('sample.png');
    assert.deepEqual(
      await readFile(
        join(
          config.dataDirectory,
          'storage',
          saved.local_path,
          'ariso',
          saved.storage_id,
          saved.key,
        ),
      ),
      await readFile(source),
    );
    report.images.push({ id, originalName: saved.original_name });
  }
  assert.deepEqual(
    snapshots,
    [snapshots[0], snapshots[0], snapshots[0]],
    'One batch freezes one shared processing snapshot',
  );
  const submissions = await sql(
    `SELECT DISTINCT submission_id FROM upload_sessions WHERE image_id IN (${ids.map((id) => `'${id}'`).join(',')})`,
  );
  assert.equal(
    submissions.length,
    1,
    'One start accepts all queued files in one submission',
  );
  report.submissionId = submissions[0].submission_id;
  report.checks.push(
    'Native multi-selection plus Continue adding retains three real files; all three finish with distinct images, identical processing snapshots and unchanged original bytes.',
  );
  if (width === 390) {
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="upload-file-row"]')].map(
        (row) => {
          const [preview, text, actions] = [...row.children].map((node) =>
            node.getBoundingClientRect(),
          );
          return {
            actionWidth: actions.width,
            actionRight: actions.right,
            actionLeft: actions.left,
            textRight: text.right,
            overlap:
              Math.min(preview.bottom, actions.bottom) -
              Math.max(preview.top, actions.top),
            textOverlap:
              Math.min(text.bottom, actions.bottom) -
              Math.max(text.top, actions.top),
            rowRight: row.getBoundingClientRect().right,
          };
        },
      ),
    );
    assert.equal(rows.length, 3, 'All three mobile success rows are measured');
    for (const row of rows) {
      assert.ok(
        Math.abs(row.actionWidth - 88) <= 1,
        'Mobile ready action keeps its 88px column',
      );
      assert.ok(
        row.overlap > 0 &&
          row.actionRight <= row.rowRight + 1 &&
          row.actionLeft >= row.textRight - 1 &&
          row.textOverlap > 0,
        'Mobile ready action stays alongside its preview and text',
      );
    }
    report.mobileReadyRows = rows;
  }
  await page.screenshot({ path: output('queue-ready.png') });

  const imageId = ids[0];
  await page.goto(`${config.origin}/library`);
  const card = `[data-testid="library-card"][data-image-id="${imageId}"] button`;
  await page.waitForSelector(card);
  await page.click(card);
  await page.waitForSelector('[data-testid="detail-body"]');
  await decoded();
  await disclosure();
  const stage = await geometry('[data-testid="preview-stage"]');
  report.stage = stage;
  const detailResponse = await page.fetch(`/api/images/${imageId}`);
  assert.equal(detailResponse.status, 200);
  const detail = JSON.parse(detailResponse.body);
  const previewUrl = new URL(
    detail.versions.find((version) => version.kind === 'original').previewPath,
    config.origin,
  ).href;
  let paused = [];
  await page.cdp('Fetch.enable', {
    patterns: [
      {
        urlPattern: previewUrl,
        requestStage: 'Response',
      },
    ],
  });
  try {
    await page.click('loc=role:tab[name="原图"]');
    paused = await waitPaused(previewUrl);
    await page.waitForSelector('[data-testid="preview-skeleton"]');
    sameGeometry(
      await geometry('[data-testid="preview-stage"]'),
      stage,
      'Stage while real image response is held',
    );
    await page.screenshot({ path: output('preview-skeleton.png') });
    for (const requestId of paused)
      await page.cdp('Fetch.continueRequest', { requestId });
    paused = [];
    await decoded();
    sameGeometry(
      await geometry('[data-testid="preview-stage"]'),
      stage,
      'Stage after held response decodes',
    );
  } finally {
    for (const requestId of paused)
      await page.cdp('Fetch.continueRequest', { requestId });
    await page.cdp('Fetch.disable');
  }
  for (const label of ['原图', '压缩图', '缩略图']) {
    await page.click(`loc=role:tab[name="${label}"]`);
    await decoded();
    sameGeometry(
      await geometry('[data-testid="preview-stage"]'),
      stage,
      `Stage after ${label}`,
    );
    assert.equal(
      await page.evaluate(
        () =>
          getComputedStyle(
            document.querySelector('[data-testid="detail-preview"]'),
          ).objectFit,
      ),
      'contain',
    );
  }
  report.checks.push(
    'Original/compressed/thumbnail share stable stage geometry; pausing the real original response displays Skeleton until actual decode, without layout shift.',
  );
  await page.screenshot({ path: output('detail.png') });

  await page.focus(button('复制链接'));
  await page.keyboard.press('ArrowRight');
  assert.equal(
    await page.evaluate(() => document.activeElement?.textContent.trim()),
    width >= 768 ? '下载缩略图' : '更多操作',
    'Horizontal Toolbar moves to the next visible action, skipping mobile-hidden buttons',
  );
  await page.keyboard.press('ArrowLeft');
  assert.equal(
    await page.evaluate(() => document.activeElement?.textContent.trim()),
    '复制链接',
    'Horizontal Toolbar returns to Copy with ArrowLeft',
  );
  report.checks.push(
    'Real Toolbar ArrowRight/ArrowLeft focus navigation follows visible actions on desktop and mobile.',
  );
  await page.click(button('复制链接'));
  await page.waitForSelector('loc=role:dialog[name="复制图片链接"]');
  await page.waitForFunction(() => {
    const dialog = document.querySelector(
      '[role="dialog"][aria-label="复制图片链接"]',
    );
    return document
      .getAnimations()
      .filter((animation) => {
        const target = animation.effect?.target;
        return target && (target.contains(dialog) || dialog.contains(target));
      })
      .every(
        (animation) =>
          animation.playState === 'finished' || animation.playState === 'idle',
      );
  });
  const beforeToast = await geometry(
    '[role="dialog"][aria-label="复制图片链接"]',
  );
  await page.click(button('复制 URL'));
  await page.waitForSelector('[data-slot="toast"]');
  assert.deepEqual(
    await page.evaluate(() => {
      const toast = document.querySelector('[data-slot="toast"]');
      return {
        title: toast.querySelector('[data-slot="toast-title"]').textContent,
        success: toast.classList.contains('toast--success'),
      };
    }),
    { title: '已复制到剪贴板', success: true },
  );
  // Removing data-entering starts the CSS transition; observe it before
  // waiting for the resulting animation to finish.
  await page.waitForFunction(
    () =>
      !document
        .querySelector('[data-slot="toast"]')
        ?.hasAttribute('data-entering'),
  );
  await page.waitForFunction(() => {
    const toast = document.querySelector('[data-slot="toast"]');
    return document
      .getAnimations()
      .filter((animation) => {
        const target = animation.effect?.target;
        return target && (target.contains(toast) || toast.contains(target));
      })
      .every(
        (animation) =>
          animation.playState === 'finished' || animation.playState === 'idle',
      );
  });
  const toastLayer = await page.evaluate(() => {
    const toast = document.querySelector('[data-slot="toast"]');
    const title = toast.querySelector('[data-slot="toast-title"]');
    const rect = title.getBoundingClientRect();
    const hit = document.elementFromPoint(
      rect.x + rect.width / 2,
      rect.y + rect.height / 2,
    );
    const region = toast.closest('[data-slot="toast-region"]');
    const backdrops = [
      ...document.querySelectorAll('[data-slot="modal-backdrop"]'),
    ];
    return {
      hitToast: !!hit && toast.contains(hit),
      hitTag: hit?.tagName,
      hitSlot: hit?.getAttribute('data-slot'),
      regionZ: Number(getComputedStyle(region).zIndex),
      backdropZ: backdrops.map((node) => Number(getComputedStyle(node).zIndex)),
    };
  });
  report.toastLayer = toastLayer;
  assert.equal(
    toastLayer.hitToast,
    true,
    'Toast title is visually above the modal and receives pointer hit-testing',
  );
  assert.ok(
    toastLayer.backdropZ.every((z) => toastLayer.regionZ > z),
    'Toast region is above every open modal backdrop',
  );
  sameGeometry(
    await geometry('[role="dialog"][aria-label="复制图片链接"]'),
    beforeToast,
    'Toast does not push the dialog',
  );
  await page.screenshot({ path: output('copy-toast.png') });
  // Move focus/pointer outside the region so the library's accessible pause does not suppress expiry.
  await page.focus(button('关闭复制链接'));
  await page.hover(button('关闭复制链接'));
  await page.waitForSelector('[data-slot="toast"]', {
    state: 'hidden',
    timeout: 10000,
  });
  const copyClose = await geometry(
    '[role="button"][aria-label="关闭复制链接"],button[aria-label="关闭复制链接"]',
  );
  assert.ok(copyClose.width >= 44 && copyClose.height >= 44);
  await page.click(button('关闭复制链接'));
  await page.waitForSelector('loc=role:dialog[name="复制图片链接"]', {
    state: 'hidden',
  });
  await page.waitForFunction(() =>
    document.activeElement?.textContent.includes('复制链接'),
  );
  const close = await geometry('button[aria-label="关闭图片详情"]');
  assert.ok(close.width >= 44 && close.height >= 44);
  await page.click(button('关闭图片详情'));
  await page.waitForSelector('[data-testid="library-detail"]', {
    state: 'hidden',
  });
  await page.waitForFunction(
    (id) =>
      document.activeElement
        ?.closest('[data-testid="library-card"]')
        ?.getAttribute('data-image-id') === id,
    imageId,
  );
  report.checks.push(
    'Real copy success produces an expiring overlay Toast without layout shift; 44px copy/detail CloseButtons close the layers and copy-close restores its trigger focus.',
  );
  report.status = 'passed';
} catch (error) {
  report.error = String(error.stack ?? error);
  try {
    report.page = await page.snapshot();
  } catch (diagnostic) {
    report.pageError = String(diagnostic);
  }
  report.status = 'failed';
  throw error;
} finally {
  await writeFile(
    join(config.output, `interaction-polish-${config.width}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
console.log(report);
