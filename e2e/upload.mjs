/* global taskSpace, config */
const { default: assert } = await import('node:assert/strict');
const { writeFile, readFile, mkdir } = await import('node:fs/promises');
const { join } = await import('node:path');
const { identitySql } = await import(config.identitySessionScript);
const task = await taskSpace(config.spaceId);
const page = task.page('p1');
const sql = (statement) => identitySql(config, statement);
const report = {
  status: 'failed',
  checks: [],
  layouts: [],
  limitations: [
    'Ego Chromium device emulation is not physical touch, soft keyboard or safe-area hardware evidence.',
    'Transport failures and timing holds are controlled browser-boundary faults; processing failure uses a disposable SQLite trigger.',
  ],
};
const button = (name) => `loc=role:button[name="${name}"]`;
const item = '[data-testid="upload-item"]';
const state = (value) => page.waitForSelector(`${item}[data-state="${value}"]`);
const source = join(
  config.projectDirectory,
  'tests/fixtures/runtime/images/sample.png',
);
async function resize(width, height = 844) {
  await page.cdp('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
  await page.waitForFunction((width) => innerWidth === width, width);
}
async function layouts(name) {
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
    for (const width of [360, 390, 430, 768, 1440]) {
      await resize(width);
      const result = await page.evaluate(() => ({
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        targets: [...document.querySelectorAll('button,a')]
          .filter((node) => {
            const r = node.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          })
          .map((node) => ({
            name: node.getAttribute('aria-label') || node.textContent,
            width: node.getBoundingClientRect().width,
            height: node.getBoundingClientRect().height,
          })),
      }));
      assert.ok(
        result.scrollWidth <= width,
        `${name}/${theme}/${width}: no horizontal overflow`,
      );
      for (const target of result.targets)
        assert.ok(
          target.width >= 44 && target.height >= 44,
          `${target.name}: minimum 44px target`,
        );
      await page.screenshot({
        path: join(config.output, `upload-${name}-${theme}-${width}.png`),
      });
      report.layouts.push({ name, theme, ...result });
    }
  }
}
async function trackReferences() {
  await page.evaluate(() => {
    window.__uploadReferences = [];
    window.__uploadUrls = new Set();
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      const url = create(blob);
      window.__uploadUrls.add(url);
      return url;
    };
    URL.revokeObjectURL = (url) => {
      window.__uploadUrls.delete(url);
      revoke(url);
    };
    document.addEventListener(
      'change',
      (event) => {
        if (
          event.target instanceof HTMLInputElement &&
          event.target.type === 'file'
        ) {
          for (const file of event.target.files)
            window.__uploadReferences.push(new WeakRef(file));
        }
      },
      true,
    );
  });
}
async function released() {
  await page.cdp('HeapProfiler.collectGarbage');
  const refs = await page.evaluate(() => ({
    alive: window.__uploadReferences.filter((reference) => reference.deref())
      .length,
    urls: window.__uploadUrls.size,
    input: document.querySelector('input[type=file]').files.length,
  }));
  assert.deepEqual(
    refs,
    { alive: 0, urls: 0, input: 0 },
    'Terminal state releases original File, blob URLs and file input',
  );
}
async function select(file = source) {
  await page.setInputFiles('input[type=file]', [file]);
  await state('queued');
}
async function clear() {
  await page.click(button('清空已完成'));
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="upload-item"]'),
  );
}
async function imageId() {
  return page.evaluate(
    () => document.querySelector('[data-testid="upload-item"]').dataset.imageId,
  );
}
let transportScript;
try {
  await page.goto(`${config.origin}/upload`);
  await page.waitForSelector('#email');
  await page.fill('#email', config.credentials.email);
  await page.fill('#password', config.credentials.password);
  await page.click(button('登录'));
  await page.waitForSelector('input[type=file]', { state: 'attached' });
  // Exercise the production controller with the browser's native fetch before
  // installing any fault harness: a wrapper must not hide receiver errors.
  assert.equal(
    await page.evaluate(() =>
      Function.prototype.toString.call(window.fetch).includes('[native code]'),
    ),
    true,
    'Smoke uses native browser fetch',
  );
  await select();
  await page.click(button('开始上传'));
  await state('ready');
  const nativeImageId = await imageId();
  assert.ok(nativeImageId);
  assert.equal(
    (
      await sql(
        `SELECT processing_status FROM media_images WHERE id='${nativeImageId}'`,
      )
    )[0].processing_status,
    'ready',
  );
  await clear();
  assert.equal(
    (await sql(`SELECT id FROM media_images WHERE id='${nativeImageId}'`))
      .length,
    1,
  );
  report.checks.push(
    'Before any fetch wrapper or CDP script injection, native browser fetch completes a real manual File upload to ready with persisted image ID; clearing retains the image.',
  );
  transportScript = await page.cdp('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__uploadFetch = window.fetch.bind(window); window.fetch = (...args) => window.__uploadFetch(...args);`,
  });
  await page.reload();
  await page.waitForSelector('input[type=file]', { state: 'attached' });
  await trackReferences();
  await layouts('empty');
  await select();
  await page.click(button('移除'));
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="upload-item"]'),
  );
  await released();
  const before = await sql('SELECT count(*) AS count FROM upload_submissions');
  await select();
  await layouts('queued');
  await resize(390, 400);
  await page.focus(button('开始上传'));
  assert.equal(
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find(
        (node) => node.textContent === '开始上传',
      );
      const r = button.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= innerHeight;
    }),
    true,
    'Short viewport keeps the upload action reachable',
  );
  await page.screenshot({
    path: join(config.output, 'upload-short-viewport.png'),
  });
  await resize(390);
  assert.deepEqual(
    await sql('SELECT count(*) AS count FROM upload_submissions'),
    before,
  );
  await page.click(button('开始上传'));
  await state('ready');
  const successId = await imageId();
  assert.ok(successId);
  const [saved] = await sql(
    `SELECT id, processing_status, visibility FROM media_images WHERE id='${successId}'`,
  );
  assert.equal(saved.processing_status, 'ready');
  await released();
  await layouts('ready');
  await page.click(button('复制链接'));
  await page.waitForSelector('loc=role:dialog[name="复制图片链接"]');
  await page.click(button('复制 URL'));
  await page.waitForFunction(() =>
    document
      .querySelector('[role="dialog"][aria-label="复制图片链接"]')
      ?.textContent.includes('已复制到剪贴板'),
  );
  for (const [label, pattern] of [
    ['Markdown', /^!\[.*\]\(<http[^>]+>\)$/],
    ['HTML', /^<img src="http/],
  ]) {
    await page.evaluate(() => {
      const write = navigator.clipboard.writeText.bind(navigator.clipboard);
      navigator.clipboard.writeText = async () => {
        navigator.clipboard.writeText = write;
        throw new DOMException(
          'Verification: clipboard write denied',
          'NotAllowedError',
        );
      };
    });
    await page.click(button(`复制 ${label}`));
    await page.waitForSelector('textarea[aria-label="手动复制文本"]');
    const manual = await page.evaluate(() => {
      const input = document.querySelector(
        'textarea[aria-label="手动复制文本"]',
      );
      return {
        value: input.value,
        selected:
          input.selectionStart === 0 &&
          input.selectionEnd === input.value.length,
        focused: document.activeElement === input,
      };
    });
    assert.match(manual.value, pattern);
    assert.ok(manual.value.includes(successId));
    assert.equal(manual.selected, true);
    assert.equal(manual.focused, true);
    await page.click(button('返回复制选项'));
  }
  report.checks.push(
    'Controlled clipboard NotAllowedError retains complete Markdown/HTML containing the real ID, focuses the manual text and selects it fully; real successful URL write is checked separately.',
  );
  await page.click(button('返回上传结果'));
  const link = await page.evaluate(
    () =>
      [...document.querySelectorAll('a')].find(
        (node) => node.textContent === '打开图片',
      )?.href,
  );
  assert.ok(link.includes(successId), 'Result link uses real image ID');
  assert.equal((await page.fetch(link)).status, 200);
  report.checks.push(
    'Result URL uses real image ID, authenticated delivery returns bytes, and a user click writes the real clipboard.',
  );
  await page.click(button('查看详情'));
  await page.waitForSelector(button('返回上传页'));
  await page.click(button('返回上传页'));
  await state('ready');
  assert.equal(await imageId(), successId);
  await clear();
  assert.equal(
    (await sql(`SELECT id FROM media_images WHERE id='${successId}'`)).length,
    1,
  );
  report.checks.push(
    'Native File selection is manual; remove and terminal completion release File/blob references; real upload reaches ready; detail return preserves result; clear retains persisted image.',
  );

  const fixtures = join(config.output, 'upload-inputs');
  await mkdir(fixtures, { recursive: true });
  const settings = JSON.parse((await page.fetch('/upload/settings')).body);
  const { open } = await import('node:fs/promises');
  for (const [name, size, reason] of [
    ['empty.png', 0, '文件为空'],
    ['oversized.png', settings.maxFileBytes + 1, '超过上传上限'],
    ['unsupported.txt', 1, '仅支持 JPEG 和 PNG'],
  ]) {
    const path = join(fixtures, name);
    const file = await open(path, 'w');
    try {
      await file.truncate(size);
    } finally {
      await file.close();
    }
    await page.setInputFiles('input[type=file]', [path]);
    await page.waitForFunction(
      (reason) =>
        [...document.querySelectorAll('[role="alert"]')].some((node) =>
          node.textContent.includes(reason),
        ),
      reason,
    );
    assert.equal(
      await page.evaluate(
        () => document.querySelectorAll('[data-testid="upload-item"]').length,
      ),
      0,
    );
    await released();
  }
  report.checks.push(
    'Real empty, oversized sparse and unsupported files show distinct input reasons without creating queue items or retaining File references.',
  );
  const invalid = join(fixtures, 'invalid.png');
  await writeFile(invalid, 'This is not an image.');
  await select(invalid);
  await page.click(button('开始上传'));
  await state('upload-failed');
  assert.ok(!(await imageId()));
  assert.equal(
    await page.evaluate(() =>
      [...document.querySelectorAll('button')].some(
        (node) => node.textContent === '查看详情',
      ),
    ),
    false,
  );
  await released();
  await layouts('upload-failed');
  await clear();
  report.checks.push(
    'Real invalid image bytes fail server inspection without imageId or detail action.',
  );

  // Reject a real derivative record, after original acceptance has committed.
  await sql(
    "CREATE TRIGGER upload_browser_fail_version BEFORE INSERT ON media_versions WHEN NEW.kind != 'original' BEGIN SELECT RAISE(ABORT, 'upload browser derivative persistence failure'); END",
  );
  try {
    await select();
    await page.click(button('开始上传'));
    await state('processing-failed');
    const failedId = await imageId();
    assert.ok(failedId);
    assert.equal(
      (await sql(`SELECT id FROM media_images WHERE id='${failedId}'`)).length,
      1,
    );
    assert.ok(
      (
        await sql(
          `SELECT id FROM media_jobs WHERE image_id='${failedId}' AND status='failed'`,
        )
      ).length,
    );
    await released();
    await layouts('processing-failed');
    const originals = await sql(
      `SELECT o.id,o.key,o.storage_id,s.local_path FROM media_objects o JOIN storage_configs s ON s.id=o.storage_id WHERE o.image_id='${failedId}' AND o.purpose='original' AND o.status='stored'`,
    );
    assert.equal(originals.length, 1);
    const original = originals[0];
    const originalPath = join(
      config.dataDirectory,
      'storage',
      original.local_path,
      'ariso',
      original.storage_id,
      original.key,
    );
    const originalBytes = await readFile(originalPath);
    await page.click(button('查看详情'));
    await page.waitForSelector('[data-testid="detail-body"]');
    await page.click(button('回收图片'));
    await page.waitForSelector('[data-testid="trash-confirm"]');
    await page.click(button('确认回收'));
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="library-detail"]'),
    );
    await state('processing-failed');
    assert.equal(await imageId(), failedId);
    assert.ok(
      (
        await sql(`SELECT trashed_at FROM media_images WHERE id='${failedId}'`)
      )[0].trashed_at,
    );
    assert.deepEqual(await readFile(originalPath), originalBytes);
    assert.deepEqual(
      await sql(
        `SELECT o.id,o.key,o.storage_id,s.local_path FROM media_objects o JOIN storage_configs s ON s.id=o.storage_id WHERE o.image_id='${failedId}' AND o.purpose='original' AND o.status='stored'`,
      ),
      originals,
    );
    report.checks.push(
      'Failed upload opens the actual image detail and confirms trash; return preserves the same result ID, trashed_at is persisted and original object bytes remain intact.',
    );
    report.checks.push(
      'Actual SQLite derivative persistence failure retains imageId and failed job, distinct from reception failure.',
    );
  } finally {
    await sql('DROP TRIGGER upload_browser_fail_version');
  }
  await clear();

  // Lose the successful creation response once; a repeated idempotent request
  // reads the original submission and must not create a second image.
  await page.evaluate(() => {
    const original = window.__uploadFetch;
    window.__uploadCreates = 0;
    window.__uploadFetch = async (...args) => {
      const path = new URL(String(args[0]), location.href).pathname;
      if (path === '/api/uploads/submissions' && args[1]?.method === 'POST') {
        window.__uploadCreates++;
        const response = await original(...args);
        if (window.__uploadCreates === 1)
          throw new TypeError(
            'Verification: successful submission response lost',
          );
        window.__uploadFetch = original;
        return response;
      }
      return original(...args);
    };
  });
  await select();
  await page.click(button('开始上传'));
  await state('unknown');
  await layouts('unknown');
  await page.click(button('重新核对'));
  // A creation acknowledgement without content is still an unaccepted session;
  // the controller must not silently send content again.
  await page.waitForFunction(() =>
    document
      .querySelector('[data-testid="upload-item"]')
      .textContent.includes('文件尚未传输'),
  );
  assert.equal(await page.evaluate(() => window.__uploadCreates), 2);
  await page.click(button('请求取消'));
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () => document.activeElement?.textContent === '请求取消',
  );
  await page.click(button('请求取消'));
  await page.click(button('确认取消'));
  await state('cancelled');
  await released();
  await layouts('cancelled');
  await clear();
  report.checks.push(
    'Lost real creation response is reconciled through original idempotent submission rather than an automatic second content upload.',
  );
  // Hold real XHR completion and status reads until cancellation is answered.
  // Bytes reach the server and acceptance commits; no status response is forged.
  await page.evaluate(() => {
    const fetchOriginal = window.__uploadFetch;
    const readers = [];
    let hold = true;
    window.__uploadFetch = async (...args) => {
      const path = new URL(String(args[0]), location.href).pathname;
      const response = await fetchOriginal(...args);
      if (
        hold &&
        path.startsWith('/api/uploads/submissions/') &&
        (!args[1]?.method || args[1].method === 'GET')
      ) {
        await new Promise((resolve) => readers.push(resolve));
      }
      if (
        path.startsWith('/api/uploads/sessions/') &&
        args[1]?.method === 'DELETE'
      ) {
        window.__uploadCancellationStatus = response.status;
        hold = false;
        for (const release of readers) release();
        window.__uploadFetch = fetchOriginal;
      }
      return response;
    };
    const send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (body) {
      const loaded = this.onload;
      this.onload = (event) => {
        window.__uploadReleaseLoad = () => loaded.call(this, event);
      };
      XMLHttpRequest.prototype.send = send;
      return send.call(this, body);
    };
  });
  await select();
  await page.click('loc=role:button[name*="可见性"]');
  await page.click('loc=role:option[name="私有"]');
  await page.click(button('开始上传'));
  await page.waitForFunction(
    () => typeof window.__uploadReleaseLoad === 'function',
  );
  await state('saving');
  await layouts('saving');
  await page.click(button('请求取消'));
  await page.click(button('确认取消'));
  await state('ready');
  const acceptedId = await imageId();
  assert.ok(acceptedId);
  assert.equal(
    await page.evaluate(() => window.__uploadCancellationStatus),
    409,
  );
  assert.equal(
    (
      await sql(`SELECT visibility FROM media_images WHERE id='${acceptedId}'`)
    )[0].visibility,
    'private',
  );
  await page.evaluate(() => {
    window.__uploadReleaseLoad();
    delete window.__uploadReleaseLoad;
  });
  await released();
  assert.equal(
    (
      await sql(
        `SELECT state FROM upload_sessions WHERE image_id='${acceptedId}'`,
      )
    )[0].state,
    'accepted',
  );
  report.checks.push(
    'Real content reaches 100% but held XHR acknowledgement remains saving; cancellation after server acceptance returns 409 and reconciles the same image instead of reporting cancellation.',
  );
  await page.goto(`${config.origin}/library`);
  await page.goto(`${config.origin}/upload`);
  await page.waitForSelector('input[type=file]', { state: 'attached' });
  assert.equal(
    await page.evaluate(
      () => document.querySelectorAll('[data-testid="upload-item"]').length,
    ),
    0,
  );
  assert.equal(
    (await sql(`SELECT id FROM media_images WHERE id='${successId}'`)).length,
    1,
  );
  report.checks.push(
    'Leaving and reopening upload does not restore browser queue; previously accepted server image persists.',
  );
  await trackReferences();
  // Persist a running job to hold scheduling, then release it to the real worker
  // after leaving the upload page. No fabricated successful response is used.
  await sql(
    "CREATE TRIGGER upload_browser_hold_job AFTER INSERT ON media_jobs BEGIN UPDATE media_jobs SET status='running' WHERE id=NEW.id; END",
  );
  let backgroundId;
  try {
    await select();
    await page.click(button('开始上传'));
    await state('processing');
    await layouts('processing');
    backgroundId = await imageId();
    await released();
    await page.goto(`${config.origin}/library`);
    await page.goto(`${config.origin}/upload`);
    await page.waitForSelector('input[type=file]', { state: 'attached' });
    assert.equal(
      await page.evaluate(
        () => document.querySelectorAll('[data-testid="upload-item"]').length,
      ),
      0,
    );
  } finally {
    await sql('DROP TRIGGER upload_browser_hold_job');
  }
  await sql(
    `UPDATE media_jobs SET status='queued' WHERE image_id='${backgroundId}' AND status='running'`,
  );
  await page.waitForFunction(
    async (id) => {
      const response = await fetch(`/api/images/${id}`);
      return (
        response.ok && (await response.json()).processingStatus === 'ready'
      );
    },
    backgroundId,
    { timeout: 30000 },
  );
  assert.equal(
    (
      await sql(
        `SELECT processing_status FROM media_images WHERE id='${backgroundId}'`,
      )
    )[0].processing_status,
    'ready',
  );
  report.checks.push(
    'Leaving an accepted processing upload discards local queue; releasing the persisted scheduling fixture lets the real worker finish the same image after reopening.',
  );

  await trackReferences();
  const [storageSetting] = await sql(
    'SELECT default_storage_id FROM storage_settings',
  );
  const storageId = storageSetting.default_storage_id;
  // The UI still displays the default loaded earlier, but an untouched default
  // is resolved transactionally when Start is clicked, not pinned by the page.
  await select();
  try {
    await sql('UPDATE storage_settings SET default_storage_id=NULL');
    await page.click(button('开始上传'));
    await state('upload-failed');
    assert.ok(!(await imageId()));
    await page.waitForFunction(() =>
      document
        .querySelector('[data-testid="upload-item"]')
        .textContent.includes('没有默认存储'),
    );
    await released();
  } finally {
    await sql(`UPDATE storage_settings SET default_storage_id='${storageId}'`);
  }
  await clear();
  report.checks.push(
    'Removing the default after file selection makes the real Start request fail without imageId; untouched default is resolved on the server at submission time.',
  );
  try {
    await sql('UPDATE storage_settings SET default_storage_id=NULL');
    await page.reload();
    await page.waitForSelector('input[type=file]', { state: 'attached' });
    await select();
    await page.waitForFunction(() =>
      document.body.textContent.includes('默认存储缺失或已停用'),
    );
    await layouts('missing-default');
    assert.equal(
      await page.evaluate(
        () =>
          [...document.querySelectorAll('button')].find(
            (node) => node.textContent === '开始上传',
          ).disabled,
      ),
      true,
    );
    await page.click(button('移除'));
    await sql(`UPDATE storage_settings SET default_storage_id='${storageId}'`);
    await sql(`UPDATE storage_configs SET enabled=0 WHERE id='${storageId}'`);
    await page.reload();
    await page.waitForSelector('input[type=file]', { state: 'attached' });
    await select();
    await page.waitForFunction(() =>
      document.body.textContent.includes('暂无可用存储'),
    );
    await layouts('disabled-storage');
    assert.equal(
      await page.evaluate(
        () =>
          [...document.querySelectorAll('button')].find(
            (node) => node.textContent === '开始上传',
          ).disabled,
      ),
      true,
    );
    await page.click(button('移除'));
  } finally {
    await sql(`UPDATE storage_settings SET default_storage_id='${storageId}'`);
    await sql(`UPDATE storage_configs SET enabled=1 WHERE id='${storageId}'`);
  }
  const settingsFault = await page.cdp(
    'Page.addScriptToEvaluateOnNewDocument',
    {
      source: `const originalUploadSettingsFetch = window.__uploadFetch; window.__uploadFetch = async (...args) => { if (new URL(String(args[0]), location.href).pathname === '/upload/settings') { window.__uploadFetch = originalUploadSettingsFetch; await originalUploadSettingsFetch(...args); await new Promise(resolve => { window.__uploadReleaseSettings = resolve; }); delete window.__uploadReleaseSettings; throw new TypeError('Verification: settings response lost'); } return originalUploadSettingsFetch(...args); };`,
    },
  );
  try {
    await page.reload();
    await page.waitForFunction(
      () =>
        typeof window.__uploadReleaseSettings === 'function' &&
        document.body.textContent.includes('正在读取上传设置'),
    );
    await layouts('settings-loading');
    await page.evaluate(() => window.__uploadReleaseSettings());
    await page.waitForSelector(button('重试读取设置'));
    await layouts('settings-error');
    await page.click(button('重试读取设置'));
    await page.waitForSelector('input[type=file]', { state: 'attached' });
  } finally {
    await page.evaluate(() => window.__uploadReleaseSettings?.());
    await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
      identifier: settingsFault.identifier,
    });
  }
  report.checks.push(
    'Real missing default and disabled storage prevent manual start without silently choosing another target; lost real settings response displays retry and recovers.',
  );
  report.status = 'passed';
} catch (error) {
  report.error = String(error.stack ?? error);
  try {
    report.page = await page.snapshot();
  } catch (diagnostic) {
    report.pageError = String(diagnostic);
  }
  throw error;
} finally {
  if (transportScript)
    await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
      identifier: transportScript.identifier,
    });
  await writeFile(
    join(config.output, 'upload.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
console.log(report);
