/* global taskSpace, config */
const { default: assert } = await import('node:assert/strict');
const { writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { execFile } = await import('node:child_process');
const { promisify } = await import('node:util');
const sibling = (name) =>
  new URL(`./${name}.mjs`, config.identitySessionScript).href;
const [
  { identitySql },
  { tokensSignIn },
  geometry,
  clipboard,
  errors,
  { buildUploadCurl },
] = await Promise.all([
  import(config.identitySessionScript),
  import(sibling('tokens-page')),
  import(sibling('browser-geometry')),
  import(sibling('library-copy-helpers')),
  import(config.errorsScript),
  import(
    new URL('../src/shared/upload-usage.ts', config.identitySessionScript).href
  ),
]);
const page = (await taskSpace(config.spaceId)).page(config.pageLabel ?? 'p1');
const ready = '[data-testid="upload-usage-page"][data-state="ready"]';
const copy = '[data-testid="upload-usage-copy"]';
const tips = 'loc=role:button[name="上传注意事项"]';
const report = {
  status: 'failed',
  phase: config.uploadUsagePhase,
  origin: config.origin,
  checks: [],
  layouts: [],
  screenshots: [],
  requests: [],
  clipboard: [],
  limitations: [
    'Disposable runner database only; mouse, keyboard and mobile viewport emulation do not prove physical touch or soft keyboard behavior.',
  ],
};
const run = promisify(execFile);
const snapshot = () =>
  page.evaluate(() => ({
    path: location.pathname,
    window: scrollY,
    content: document.querySelector('.shell-content').scrollTop,
    tokens: [...document.querySelectorAll('[data-testid="api-token"]')].map(
      (node) => node.dataset.tokenId,
    ),
    focus: {
      testId: document.activeElement?.getAttribute('data-testid'),
      name:
        document.activeElement?.getAttribute('aria-label') ??
        document.activeElement?.textContent?.trim(),
    },
  }));
async function screenshot(name) {
  const file = `upload-usage-${name}.png`;
  await page.screenshot({ path: join(config.output, file) });
  report.screenshots.push(file);
}
async function layout(name) {
  const state = await geometry.readGeometry(page);
  geometry.assertGeometry(state, name);
  report.layouts.push({ name, ...state });
  await screenshot(name);
}
async function text() {
  return page.evaluate(
    () =>
      document.querySelector('[data-testid="upload-usage-command"]')
        .textContent,
  );
}
async function choose(example) {
  await page.click(
    `loc=role:radio[name="${example === 'minimal' ? '最小示例' : '完整示例'}"]`,
  );
  await page.waitForFunction(
    (label) =>
      [
        ...document.querySelectorAll('[role="radio"][aria-checked="true"]'),
      ].some((node) => node.textContent.trim() === label),
    example === 'minimal' ? '最小示例' : '完整示例',
  );
}
async function load() {
  await page.goto(`${config.origin}/settings/api/usage`);
  await page.waitForSelector(ready);
}
async function tables() {
  for (const label of ['请求参数', '响应与异常']) {
    const selector = `loc=role:button[name="${label}"]`;
    const expanded = await page.evaluate(
      (label) =>
        [...document.querySelectorAll('button')]
          .find((node) => node.textContent.trim() === label)
          ?.getAttribute('aria-expanded'),
      label,
    );
    if (expanded !== 'true') await page.click(selector);
  }
  for (const label of ['请求参数表', '响应字段表', 'HTTP 状态表'])
    await page.waitForSelector(`[aria-label="${label}"]`);
  const rows = await page.evaluate(() =>
    Object.fromEntries(
      ['请求参数表', '响应字段表', 'HTTP 状态表'].map((label) => [
        label,
        [
          ...document
            .querySelector(`[aria-label="${label}"]`)
            .querySelectorAll('tbody tr'),
        ].map((row) => row.textContent.trim()),
      ]),
    ),
  );
  const tableFont = await page.evaluate(
    () =>
      getComputedStyle(
        document.querySelector(
          '[aria-label="请求参数表"] tbody tr > :nth-child(2)',
        ),
      ).fontSize,
  );
  assert.equal(
    tableFont,
    '13px',
    'Documentation table cells retain the approved 13px text',
  );
  assert.equal(rows['请求参数表'].length, 5);
  for (const field of ['file', 'storageId', 'albumId', 'tag', 'visibility'])
    assert.ok(rows['请求参数表'].some((row) => row.includes(field)));
  assert.ok(
    rows['请求参数表'].find((row) => row.includes('albumId')).includes('重复'),
  );
  assert.ok(
    rows['请求参数表'].find((row) => row.includes('tag')).includes('重复'),
  );
  for (const field of [
    'imageId',
    'status',
    'url',
    'actualVersion',
    'defaultResolution',
    'versions',
    'processing',
    'error',
    'requestId',
  ])
    assert.ok(
      rows['响应字段表'].some((row) => row.includes(field)),
      `Response table describes ${field}`,
    );
  const statuses = rows['HTTP 状态表'].map(
    (row) => row.match(/\b\d{3}\b/)?.[0],
  );
  assert.deepEqual(statuses, [
    '201',
    '400',
    '401',
    '408',
    '409',
    '413',
    '415',
    '422',
    '500',
    '502',
    '503',
    '504',
    '507',
  ]);
  report.checks.push({ tables: rows });
}
async function verifyTableScroll() {
  const selector = '[aria-label="请求参数表横向滚动"]';
  await page.focus(selector);
  const before = await page.evaluate((selector) => {
    const node = document.querySelector(selector);
    return {
      left: node.scrollLeft,
      width: node.clientWidth,
      scrollWidth: node.scrollWidth,
      firstColumnLeft: node
        .querySelector('tbody tr > :first-child')
        ?.getBoundingClientRect().left,
    };
  }, selector);
  assert.ok(
    before.scrollWidth > before.width,
    'Mobile table has its own real horizontal overflow',
  );
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(
    ({ selector, left }) => document.querySelector(selector).scrollLeft > left,
    { selector, left: before.left },
  );
  const after = await page.evaluate((selector) => {
    const node = document.querySelector(selector);
    return {
      left: node.scrollLeft,
      firstColumnLeft: node
        .querySelector('tbody tr > :first-child')
        ?.getBoundingClientRect().left,
    };
  }, selector);
  assert.equal(
    after.firstColumnLeft,
    before.firstColumnLeft,
    'The first parameter column stays visible during horizontal keyboard scrolling',
  );
  report.checks.push({ mobileTableKeyboardScroll: { before, after } });
}
async function verifyTips(width, theme) {
  const selector =
    width < 768
      ? '[role="dialog"][aria-label="上传注意事项"]'
      : '[role="tooltip"]';
  if (width < 768) await page.click(tips);
  else {
    await page.mouse.move(1, 1);
    await page.hover(tips);
  }
  await page.waitForSelector(selector);
  await page.waitForFunction((selector) => {
    const node = document.querySelector(selector);
    const overlay = node?.closest('.popover') ?? node;
    return (
      overlay &&
      !overlay
        .getAnimations({ subtree: true })
        .some((animation) => animation.playState === 'running')
    );
  }, selector);
  const content = await page.evaluate(
    (selector) => document.querySelector(selector).textContent,
    selector,
  );
  const alignment = await page.evaluate((selector) => {
    const trigger = [
      ...document.querySelectorAll('button[aria-label="上传注意事项"]'),
    ].find((node) => node.getClientRects().length);
    const anchor = trigger.parentElement.getBoundingClientRect();
    const node = document.querySelector(selector);
    const bubble = (node.closest('.popover') ?? node).getBoundingClientRect();
    return { anchorLeft: anchor.left, bubbleLeft: bubble.left };
  }, selector);
  assert.ok(
    Math.abs(alignment.anchorLeft - alignment.bubbleLeft) <= 1,
    'Tips aligns with the title block, as approved',
  );
  for (const part of [
    '超时或断线先到图库核对',
    '等待超时不会取消处理',
    '重复 POST',
    '公开轮询或幂等键',
  ])
    assert.ok(content.includes(part));
  await screenshot(`tips-${theme}-${width}`);
  if (width >= 768) {
    const box = await page.evaluate((selector) => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }, selector);
    await page.mouse.move(box.x, box.y);
    await page.waitForFunction(async () => {
      const start = performance.now();
      while (performance.now() - start < 300) {
        const node = document.querySelector('[role="tooltip"]');
        if (!node?.getClientRects().length) return false;
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      return true;
    });
    await page.mouse.move(1, 1);
  } else await page.keyboard.press('Escape');
  await page.waitForSelector(selector, { state: 'hidden' });
  await page.mouse.move(1, 1);
  await page.focus(tips);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  if (width < 768) await page.keyboard.press('Enter');
  await page.waitForSelector(selector);
  await page.keyboard.press('Escape');
  await page.waitForSelector(selector, { state: 'hidden' });
  assert.equal(
    await page.evaluate(() =>
      document.activeElement?.getAttribute('aria-label'),
    ),
    '上传注意事项',
  );
}
async function verifyTipsBreakpoint() {
  await geometry.resizeViewport(page, 390);
  await page.click(tips);
  await page.waitForSelector('[role="dialog"][aria-label="上传注意事项"]');
  await geometry.resizeViewport(page, 768);
  await page.waitForSelector('[role="dialog"][aria-label="上传注意事项"]', {
    state: 'hidden',
  });
  await page.mouse.move(1, 1);
  await page.hover(tips);
  await page.waitForSelector('[role="tooltip"]');
  await geometry.resizeViewport(page, 390);
  await page.waitForSelector('[role="tooltip"]', { state: 'hidden' });
  await page.click(tips);
  await page.waitForSelector('[role="dialog"][aria-label="上传注意事项"]');
  await geometry.resizeViewport(page, 1440);
  await page.waitForSelector('[role="dialog"][aria-label="上传注意事项"]', {
    state: 'hidden',
  });
  report.checks.push(
    'Open Tips closes across 390→768, 768→390 and 390→1440; hidden triggers leave no portal overlay.',
  );
}
async function verifyNavigation() {
  const created = await page.fetch('/api/upload-tokens', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Upload usage navigation fixture' }),
  });
  assert.equal(created.status, 200);
  // Keep only the ID; the once-only key is neither consumed nor reported.
  const tokenId = JSON.parse(created.body).token.id;
  try {
    await page.goto(`${config.origin}/settings/api`);
    await page.waitForSelector('[data-testid="api-page"][data-state="ready"]');
    await page.focus('[data-testid="api-usage"]');
    const before = await snapshot();
    assert.ok(
      before.tokens.includes(tokenId),
      'Source context includes a real persisted Token record',
    );
    await page.keyboard.press('Enter');
    await page.waitForURL(`${config.origin}/settings/api/usage`);
    await page.waitForSelector(ready);
    await page.click('[data-testid="upload-usage-back"]');
    await page.waitForURL(`${config.origin}/settings/api`);
    await page.waitForSelector('[data-testid="api-page"][data-state="ready"]');
    await page.waitForFunction(
      () => document.activeElement?.dataset.testid === 'api-usage',
    );
    assert.deepEqual(await snapshot(), before);
    report.checks.push(
      'Real Token entry navigation and explicit return preserve source route, content/window scroll and source focus.',
    );
  } finally {
    const deleted = await page.fetch(`/api/upload-tokens/${tokenId}`, {
      method: 'DELETE',
    });
    assert.equal(deleted.status, 200);
  }
  await load();
}
async function verifyCopies(publicUrl) {
  const saved = await clipboard.saveClipboard();
  const permission = await page.evaluate(
    async () =>
      (await navigator.permissions.query({ name: 'clipboard-write' })).state,
  );
  try {
    await page.cdp('Browser.setPermission', {
      permission: { name: 'clipboard-write' },
      setting: 'granted',
      origin: config.origin,
    });
    await page.evaluate(() => {
      const native = navigator.clipboard.writeText.bind(navigator.clipboard);
      window.__uploadUsageClipboard = { native, calls: [] };
      navigator.clipboard.writeText = async (text) => {
        try {
          await native(text);
          window.__uploadUsageClipboard.calls.push({ text, success: true });
        } catch (error) {
          window.__uploadUsageClipboard.calls.push({ text, success: false });
          throw error;
        }
      };
    });
    for (const example of ['minimal', 'full']) {
      await choose(example);
      const expected = buildUploadCurl(publicUrl, example);
      assert.equal(await text(), expected);
      await page.focus(copy);
      const before = await snapshot();
      await page.keyboard.press('Enter');
      await page.waitForFunction((expected) => {
        const last = window.__uploadUsageClipboard.calls.at(-1);
        return last?.success && last.text === expected;
      }, expected);
      await page.waitForFunction(() =>
        [...document.querySelectorAll('[data-slot="toast-title"]')].some(
          (node) => node.textContent.includes('复制'),
        ),
      );
      assert.equal(
        (await run('pbpaste', [])).stdout,
        expected,
        'Native clipboard receives the complete published command',
      );
      assert.deepEqual(await snapshot(), before);
      assert.equal(await text(), expected);
      report.clipboard.push({
        example,
        nativeExact: true,
        preservedContext: true,
      });
    }
    await page.cdp('Browser.setPermission', {
      permission: { name: 'clipboard-write' },
      setting: 'denied',
      origin: config.origin,
    });
    await page.click(copy);
    await page.waitForSelector('[data-testid="upload-usage-manual"]');
    assert.equal(
      await page.evaluate(
        () => window.__uploadUsageClipboard.calls.at(-1).success,
      ),
      false,
    );
    const expected = buildUploadCurl(publicUrl, 'full');
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelector('[data-testid="upload-usage-manual"]').value,
      ),
      expected,
    );
    assert.equal(
      await page.evaluate(
        () =>
          getComputedStyle(
            document.querySelector('[data-testid="upload-usage-manual"]'),
          ).fontSize,
      ),
      '12px',
      'The readonly command output retains the approved monospace size',
    );
    await screenshot('copy-denied-full');
    assert.equal(new URL(await page.url()).pathname, '/settings/api/usage');
    await page.focus('[data-testid="upload-usage-manual"]');
    await page.keyboard.press('ControlOrMeta+A');
    assert.deepEqual(
      await page.evaluate(() => {
        const node = document.querySelector(
          '[data-testid="upload-usage-manual"]',
        );
        return {
          start: node.selectionStart,
          end: node.selectionEnd,
          readOnly: node.readOnly,
        };
      }),
      { start: 0, end: expected.length, readOnly: true },
    );
    const selectedContext = await snapshot();
    const attempts = await page.evaluate(
      () => window.__uploadUsageClipboard.calls.length,
    );
    await page.cdp('Browser.setPermission', {
      permission: { name: 'clipboard-write' },
      setting: 'granted',
      origin: config.origin,
    });
    await page.click(copy);
    await page.waitForFunction(
      (attempts) =>
        window.__uploadUsageClipboard.calls.length === attempts + 1 &&
        window.__uploadUsageClipboard.calls.at(-1).success,
      attempts,
    );
    assert.equal((await run('pbpaste', [])).stdout, expected);
    assert.deepEqual(
      await snapshot(),
      selectedContext,
      'Recovered copy preserves manual text focus and page context',
    );
    assert.deepEqual(
      await page.evaluate(() => {
        const node = document.querySelector(
          '[data-testid="upload-usage-manual"]',
        );
        return {
          value: node.value,
          start: node.selectionStart,
          end: node.selectionEnd,
        };
      }),
      { value: expected, start: 0, end: expected.length },
      'Recovered copy keeps the complete manual text and exact selection',
    );
    await screenshot('copy-recovered-manual-selection');
    await choose('minimal');
    await page.waitForSelector('[data-testid="upload-usage-manual"]', {
      state: 'hidden',
    });
    report.clipboard.push({
      example: 'full',
      permissionDenied: true,
      manualComplete: true,
      keyboardSelectable: true,
      recoveredNativeCopyPreservesSelection: true,
    });
  } finally {
    try {
      await page.evaluate(() => {
        if (window.__uploadUsageClipboard) {
          navigator.clipboard.writeText = window.__uploadUsageClipboard.native;
          delete window.__uploadUsageClipboard;
        }
      });
      await page.cdp('Browser.setPermission', {
        permission: { name: 'clipboard-write' },
        setting: permission === 'prompt' ? 'prompt' : permission,
        origin: config.origin,
      });
    } finally {
      await clipboard.restoreClipboard(saved);
    }
  }
}
async function readFault(hold) {
  const { identifier } = await page.cdp(
    'Page.addScriptToEvaluateOnNewDocument',
    {
      source: `(${((hold) => {
        const original = window.fetch;
        let release;
        const gate = new Promise((resolve) => {
          release = resolve;
        });
        window.__uploadUsageFault = { original, release, settled: false };
        window.fetch = async (...args) => {
          const input = args[0];
          const path = new URL(
            typeof input === 'string' ? input : input.url,
            location.href,
          ).pathname;
          if (path !== '/api/settings/upload') return original(...args);
          window.fetch = original;
          const response = await original(...args);
          window.__uploadUsageFault.status = response.status;
          window.__uploadUsageFault.settled = true;
          if (hold) {
            await gate;
            return response;
          }
          throw new TypeError(
            'Verification: real upload limit response was lost',
          );
        };
      }).toString()})(${JSON.stringify(hold)});`,
    },
  );
  return {
    async dispose() {
      await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
        identifier,
      });
      await page.evaluate(() => {
        const fault = window.__uploadUsageFault;
        if (fault) {
          fault.release();
          window.fetch = fault.original;
          delete window.__uploadUsageFault;
        }
      });
    },
  };
}
async function recovery() {
  for (const hold of [true, false]) {
    const fault = await readFault(hold);
    try {
      await page.reload();
      await page.waitForFunction(() => window.__uploadUsageFault?.settled);
      assert.equal(
        await page.evaluate(() => window.__uploadUsageFault.status),
        200,
        'Fault follows a real settings HTTP response',
      );
      await page.waitForSelector(
        `[data-testid="upload-usage-page"][data-state="${hold ? 'loading' : 'error'}"]`,
      );
      assert.equal(
        await page.evaluate(
          () => !!document.querySelector('[data-testid="upload-usage-copy"]'),
        ),
        false,
        'No usable example is invented without real settings',
      );
      await layout(hold ? 'loading' : 'read-error');
      if (hold) await page.evaluate(() => window.__uploadUsageFault.release());
      else await page.click('[data-testid="upload-usage-retry"]');
      await page.waitForSelector(ready);
      report.checks.push({
        readFault: hold ? 'pending' : 'lost-response',
        actualHttpStatus: 200,
        explicitRecovery: true,
      });
    } finally {
      await fault.dispose();
    }
  }
  // Expire only this disposable runner's real owner session, then exercise the
  // same focus check used by the public shell. No HTTP body is fabricated.
  await identitySql(
    config,
    `UPDATE site_settings SET public_url='${config.origin}' WHERE id=1`,
  );
  await load();
  await identitySql(config, `UPDATE session SET expires_at=${Date.now() - 1}`);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForSelector(
    '[data-testid="upload-usage-page"][data-state="session"]',
  );
  const refusal = await page.fetch('/api/settings/upload');
  assert.equal(refusal.status, 401);
  for (const theme of ['light', 'dark']) {
    await geometry.setTheme(page, theme);
    for (const width of [1440, 390]) {
      await geometry.resizeViewport(page, width);
      assert.equal(
        await page.evaluate(
          () =>
            document
              .querySelector('[data-testid="upload-usage-page"]')
              .querySelector(
                '[data-testid="upload-usage-copy"], [data-testid="upload-usage-command"], [data-testid="upload-usage-limit"], [data-testid="upload-usage-retry"]',
              ) !== null,
        ),
        false,
        'Expired usage never retains an actionable command or cached limit',
      );
      await layout(`session-expired-${theme}-${width}`);
    }
  }
  await page.click('loc=role:link[name="重新登录"]');
  await page.waitForSelector('#email');
  const login = new URL(await page.url());
  assert.equal(login.pathname, '/login');
  assert.equal(login.searchParams.get('reason'), 'expired');
  assert.equal(login.searchParams.get('returnTo'), '/settings/api/usage');
  await page.fill('#email', config.credentials.email);
  await page.fill('#password', config.credentials.password);
  await page.focus('loc=role:button[name="登录"]');
  await page.keyboard.press('Enter');
  await page.waitForSelector(ready);
  assert.equal(new URL(await page.url()).pathname, '/settings/api/usage');
  assert.equal(await text(), buildUploadCurl(config.origin, 'minimal'));
  report.checks.push({
    expiredSession: {
      actualSettingsHttpStatus: refusal.status,
      commandRemoved: true,
      reloginReturnTo: '/settings/api/usage',
      restoredActualCommand: true,
    },
  });
}

let failure, errorScript, original;
try {
  original = (
    await identitySql(
      config,
      'SELECT public_url, max_file_bytes FROM site_settings JOIN upload_settings ON upload_settings.id=site_settings.id WHERE site_settings.id=1',
    )
  )[0];
  errorScript = await errors.installBrowserErrors(page);
  // The owner boundary is real HTTP, without copying or clearing the browser's cookies.
  const unauthorized = await fetch(`${config.origin}/settings/api/usage`, {
    redirect: 'manual',
  });
  assert.ok([303, 307].includes(unauthorized.status));
  const login = new URL(unauthorized.headers.get('location'), config.origin);
  assert.equal(login.pathname, '/login');
  assert.equal(login.searchParams.get('returnTo'), '/settings/api/usage');
  report.checks.push({
    ownerBoundary: unauthorized.status,
    returnTo: login.searchParams.get('returnTo'),
  });
  await tokensSignIn(page, config, report, 1440);
  const publicUrl = `http://${['uploads'.repeat(7), 'images'.repeat(8), 'assets'.repeat(8), 'example', 'test'].join('.')}`;
  const maxFileBytes = 23 * 1024 * 1024;
  await identitySql(
    config,
    `UPDATE site_settings SET public_url='${publicUrl}' WHERE id=1`,
  );
  await identitySql(
    config,
    `UPDATE upload_settings SET max_file_bytes=${maxFileBytes} WHERE id=1`,
  );
  const phase = config.uploadUsagePhase;
  await load();
  const specificationLink = await page.evaluate(() => {
    const node = document.querySelector('a[href="/api/openapi.json"]');
    return { href: node?.href, target: node?.target };
  });
  assert.deepEqual(specificationLink, {
    href: `${config.origin}/api/openapi.json`,
    target: '_blank',
  });
  const specificationResponse = await fetch(specificationLink.href);
  assert.equal(
    specificationResponse.status,
    200,
    'Public specification is readable without owner credentials',
  );
  const specification = await specificationResponse.json();
  assert.deepEqual(Object.keys(specification.paths), ['/api/upload']);
  assert.deepEqual(Object.keys(specification.paths['/api/upload']), ['post']);
  assert.deepEqual(specification.servers, [
    { url: publicUrl, description: '当前站点公开地址' },
  ]);
  report.checks.push({
    specification: {
      publicHttpStatus: 200,
      destination: specificationLink.href,
      paths: Object.keys(specification.paths),
      configuredServer: publicUrl,
    },
  });
  assert.equal(await text(), buildUploadCurl(publicUrl, 'minimal'));
  assert.ok(
    await page.evaluate(() =>
      document
        .querySelector('[data-testid="upload-usage-limit"]')
        .textContent.replace(/\s+/g, ' ')
        .includes('当前站点单文件上限：23 MiB'),
    ),
  );
  report.checks.push({
    actualPublicUrl: publicUrl,
    actualLimitBytes: maxFileBytes,
    generatedCommandExact: true,
  });
  if (phase === undefined || phase === 'representative') {
    await tables();
    await verifyTipsBreakpoint();
    for (const theme of ['light', 'dark']) {
      await geometry.setTheme(page, theme);
      for (const width of [1440, 360, 390, 430, 768]) {
        await geometry.resizeViewport(page, width);
        for (const example of ['minimal', 'full']) {
          await choose(example);
          await layout(`${theme}-${width}-${example}`);
        }
        await verifyTips(width, theme);
      }
      await geometry.resizeViewport(page, 390);
      await verifyTableScroll();
      await geometry.resizeViewport(page, 390, 400);
      await page.focus(copy);
      assert.equal(
        await page.evaluate(() => {
          const rect = document.activeElement.getBoundingClientRect();
          return rect.top >= 0 && rect.bottom <= innerHeight;
        }),
        true,
      );
      await layout(`${theme}-390-short`);
    }
  }
  await geometry.setTheme(page, 'light');
  await geometry.resizeViewport(page, 390);
  if (phase === undefined || phase === 'interactions') {
    await verifyCopies(publicUrl);
    // Management writes require the saved origin. Restore it before creating/deleting
    // the navigation fixture; a long display address does not authorize that origin.
    await identitySql(
      config,
      `UPDATE site_settings SET public_url='${config.origin}' WHERE id=1`,
    );
    await verifyNavigation();
  }
  if (phase === undefined || phase === 'recovery') await recovery();
  report.browserErrors = await errors.readBrowserErrors(page);
  assert.deepEqual(report.browserErrors, []);
  report.status = 'passed';
} catch (error) {
  failure = error;
  report.error = error.stack ?? String(error);
  await screenshot('failure');
} finally {
  if (original) {
    await identitySql(
      config,
      `UPDATE site_settings SET public_url='${original.public_url.replaceAll("'", "''")}' WHERE id=1`,
    );
    await identitySql(
      config,
      `UPDATE upload_settings SET max_file_bytes=${original.max_file_bytes} WHERE id=1`,
    );
  }
  if (errorScript)
    await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
      identifier: errorScript,
    });
  report.finishedAt = new Date().toISOString();
  await writeFile(
    join(config.output, 'upload-usage.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
if (failure) throw failure;
console.log({
  uploadUsage: report.status,
  report: join(config.output, 'upload-usage.json'),
});
