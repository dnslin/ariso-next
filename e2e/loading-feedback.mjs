/* global taskSpace, config */
const assert = (await import('node:assert/strict')).default;
const { writeFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const { signInToLibrary } = await import(
  new URL('./library-login.mjs', config.identitySessionScript).href
);
const { installBrowserErrors, readBrowserErrors } = await import(
  config.errorsScript
);
const { resizeViewport } = await import(
  new URL('./browser-geometry.mjs', config.identitySessionScript).href
);
const task = await taskSpace(config.spaceId);
const page = task.page(config.pageLabel ?? 'p1');
const report = { status: 'failed', checks: [] };

// Hold real GET responses. Only the explicit error case substitutes a 503.
function observeLoading({ paths, mode }) {
  const original = window.fetch;
  const state = {
    samples: {},
    releases: [],
    finished: false,
    mode,
    fastComplete: false,
  };
  window.__loadingFeedback = state;
  window.fetch = async (...args) => {
    const path = new URL(String(args[0]), location.href).pathname;
    if (!paths.includes(path) || (args[1]?.method ?? 'GET') !== 'GET')
      return original(...args);
    if (state.mode === 'error')
      return Response.json(
        { message: '加载提示测试：读取失败' },
        { status: 503 },
      );
    const response = await original(...args);
    if (!state.fastComplete)
      await new Promise((resolve) => state.releases.push(resolve));
    return response;
  };
  function record() {
    if (state.finished) return;
    for (const node of document.querySelectorAll('.contents[aria-hidden]')) {
      const text = node.textContent.trim();
      if (!text.includes('正在读取') && !text.includes('请稍候')) continue;
      const now = performance.now();
      const range = document.createRange();
      range.selectNodeContents(node);
      const rect = range.getBoundingClientRect();
      const visible = getComputedStyle(node).visibility === 'visible';
      const record = (state.samples[text] ??= {
        firstSeen: now,
        initiallyHidden: !visible,
        before: { width: rect.width, height: rect.height },
      });
      if (visible && record.visibleAfter === undefined) {
        record.visibleAfter = now - record.firstSeen;
        record.after = { width: rect.width, height: rect.height };
      }
    }
    if (
      mode === 'fast' &&
      !state.fastTimer &&
      Object.keys(state.samples).length
    ) {
      state.fastTimer = setTimeout(() => {
        state.fastComplete = true;
        for (const release of state.releases.splice(0)) release();
      }, 80);
    }
  }
  // MutationObserver sees the initial hidden commit even while rAF is throttled.
  const observer = new MutationObserver(record);
  observer.observe(document, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'aria-hidden'],
  });
  function sample() {
    if (state.finished) {
      observer.disconnect();
      return;
    }
    record();
    requestAnimationFrame(sample);
  }
  requestAnimationFrame(sample);
}

let errorScript;
try {
  errorScript = await installBrowserErrors(page);
  await page.goto(`${config.origin}/library`);
  await page.waitForFunction(
    () =>
      location.pathname === '/login' ||
      !!document.querySelector('[data-testid="library-list"]'),
  );
  if (new URL(await page.url()).pathname === '/login')
    await signInToLibrary(page, config, report);
  const request = async (path, body) => {
    const result = await page.fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.ok(result.status < 300, result.body);
    return JSON.parse(result.body);
  };
  const storage = await request('/api/storages', {
    type: 's3',
    name: '加载提示测试',
    endpoint: 'http://127.0.0.1:1',
    region: 'test',
    bucket: 'loading-feedback',
    enabled: false,
  });
  const { album } = await request('/api/albums', { name: '加载提示测试' });
  const cases = [
    [
      '/settings/general',
      [
        '/api/settings/site',
        '/api/settings/upload',
        '/api/settings/storage',
        '/api/storages',
        '/api/settings/media',
      ],
      ['正在读取站点信息', '正在读取上传限制', '正在读取…'],
    ],
    ['/settings/processing', ['/api/settings/media'], ['正在读取处理设置']],
    ['/settings/email', ['/api/settings/smtp'], ['正在读取邮件设置']],
    ['/settings/account', ['/api/account'], ['正在读取账号']],
    [
      '/settings/account',
      ['/api/settings/github', '/api/account/github'],
      ['正在读取登录配置', '正在读取绑定状态'],
    ],
    ['/settings/api', ['/api/upload-tokens'], ['正在读取 Token']],
    [
      '/settings/api/usage',
      ['/api/settings/site', '/api/settings/upload'],
      ['正在读取站点地址和上传限制'],
    ],
    [
      '/settings/general/branding',
      ['/api/settings/site'],
      ['正在读取品牌设置'],
    ],
    [
      '/settings/storage',
      ['/api/storages', '/api/settings/storage'],
      ['正在读取存储'],
    ],
    ['/settings/storage/new', ['/api/settings/storage'], ['正在读取存储配置']],
    [
      `/settings/storage/${storage.id}`,
      [`/api/storages/${storage.id}`],
      ['正在读取存储配置'],
    ],
    [
      `/settings/storage/${storage.id}/cors`,
      [`/api/storages/${storage.id}/cors-tests`],
      ['正在读取直传设置'],
    ],
    [
      `/shares/${album.id}`,
      [`/api/albums/${album.id}/share`],
      ['正在读取分享设置'],
    ],
    ['/upload', ['/upload/settings'], ['正在读取上传设置']],
  ];
  for (const [index, [route, paths, expected]] of cases.entries()) {
    for (const mode of ['fast', 'slow']) {
      await page.cdp('Emulation.setEmulatedMedia', {
        features: [
          { name: 'prefers-color-scheme', value: 'light' },
          { name: 'prefers-reduced-motion', value: 'no-preference' },
        ],
      });
      await resizeViewport(page, 1440);
      const { identifier } = await page.cdp(
        'Page.addScriptToEvaluateOnNewDocument',
        {
          source: `(${observeLoading})(${JSON.stringify({ paths, mode })})`,
        },
      );
      try {
        await page.goto(`${config.origin}${route}`);
        await page.waitForFunction(
          (expected) =>
            expected.every((text) =>
              Object.keys(window.__loadingFeedback.samples).some((key) =>
                key.includes(text),
              ),
            ),
          expected,
        );
        if (mode === 'slow') {
          await page.waitForFunction(
            (expected) =>
              expected.every((text) =>
                Object.entries(window.__loadingFeedback.samples).some(
                  ([key, value]) =>
                    key.includes(text) && value.visibleAfter !== undefined,
                ),
              ),
            expected,
          );
          if (index === 1)
            await page.screenshot({
              path: join(config.output, 'loading-feedback-slow.png'),
            });
        }
        const samples = await page.evaluate(() => {
          for (const release of window.__loadingFeedback.releases.splice(0))
            release();
          return window.__loadingFeedback.samples;
        });
        for (const [text, sample] of Object.entries(samples)) {
          if (!expected.some((hint) => text.includes(hint))) continue;
          assert.equal(
            sample.initiallyHidden,
            true,
            `${route} hides the first frame`,
          );
          if (mode === 'fast') assert.equal(sample.visibleAfter, undefined);
          else {
            assert.ok(
              sample.visibleAfter >= 260,
              `${route}: ${sample.visibleAfter}ms`,
            );
            assert.ok(
              sample.before.height > 0,
              `${route} reserves loading space`,
            );
            assert.deepEqual(
              sample.after,
              sample.before,
              `${route} keeps the loading layout`,
            );
          }
        }
        await page.waitForFunction(
          () => !document.querySelector('.contents[aria-hidden="true"]'),
        );
        report.checks.push({ route, mode, samples });
      } finally {
        await page.evaluate(() => {
          window.__loadingFeedback.finished = true;
        });
        await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
          identifier,
        });
      }
    }
  }
  // Repeat actual client navigation at all supported widths, in both themes.
  for (const width of [360, 390, 430, 768, 1440]) {
    for (const theme of ['light', 'dark']) {
      await page.goto(`${config.origin}/settings/general`);
      await page.waitForSelector(
        '[data-testid="site-general"][data-state="ready"]',
      );
      await page.waitForFunction(
        () => !document.querySelector('.contents[aria-hidden="true"]'),
      );
      await resizeViewport(page, width);
      await page.cdp('Emulation.setEmulatedMedia', {
        features: [
          { name: 'prefers-color-scheme', value: theme },
          { name: 'prefers-reduced-motion', value: 'reduce' },
        ],
      });
      await page.evaluate(observeLoading, {
        paths: ['/api/settings/media'],
        mode: 'slow',
      });
      if (width >= 1200) await page.click('loc=role:tab[name="图片处理"]');
      else {
        await page.click('.settings-mobile [data-slot="select-trigger"]');
        await page.click('loc=role:option[name="图片处理"]');
      }
      await page.waitForFunction(() =>
        Object.values(window.__loadingFeedback.samples).some(
          (sample) => sample.visibleAfter !== undefined,
        ),
      );
      const samples = await page.evaluate(() => {
        for (const release of window.__loadingFeedback.releases.splice(0))
          release();
        return window.__loadingFeedback.samples;
      });
      await page.waitForSelector(
        '[data-testid="processing-editor"][data-state="ready"]',
      );
      assert.ok(
        Object.entries(samples)
          .filter(([text]) => text.includes('正在读取处理设置'))
          .every(
            ([, sample]) =>
              sample.initiallyHidden && sample.visibleAfter >= 260,
          ),
      );
      await page.waitForFunction(() =>
        [...document.querySelectorAll('[data-component-entry]')].every(
          (node) => Number(getComputedStyle(node).opacity) >= 0.99,
        ),
      );
      await page.screenshot({
        path: join(config.output, `loading-feedback-${width}-${theme}.png`),
      });
      report.checks.push({ width, theme, reducedMotion: true, samples });
    }
  }
  await page.goto(`${config.origin}/settings/general`);
  await page.waitForSelector(
    '[data-testid="site-general"][data-state="ready"]',
  );
  await resizeViewport(page, 1440);
  await page.evaluate(observeLoading, {
    paths: ['/api/settings/media'],
    mode: 'error',
  });
  await page.click('loc=role:tab[name="图片处理"]');
  await page.waitForSelector('[data-testid="processing-settings-retry"]');
  assert.equal(
    await page.evaluate(
      () =>
        !!document
          .querySelector('[data-testid="processing-settings-retry"]')
          ?.closest('[aria-hidden="true"]'),
    ),
    false,
  );
  report.checks.push({ error: '503', retryImmediatelyVisible: true });
  await page.evaluate(() => {
    window.__loadingFeedback.mode = 'slow';
    window.__loadingFeedback.samples = {};
  });
  await page.click('[data-testid="processing-settings-retry"]');
  await page.waitForFunction(() =>
    Object.values(window.__loadingFeedback.samples).some(
      (sample) => sample.visibleAfter !== undefined,
    ),
  );
  const retry = await page.evaluate(() => {
    for (const release of window.__loadingFeedback.releases.splice(0))
      release();
    return Object.values(window.__loadingFeedback.samples);
  });
  assert.ok(
    retry.every(
      (sample) => sample.initiallyHidden && sample.visibleAfter >= 260,
    ),
  );
  await page.waitForSelector(
    '[data-testid="processing-editor"][data-state="ready"]',
  );
  report.checks.push({ retryRestartsDelay: true });
  report.browserErrors = await readBrowserErrors(page);
  assert.deepEqual(report.browserErrors, []);
  report.status = 'passed';
} catch (error) {
  report.error = error.stack ?? String(error);
  await page.screenshot({
    path: join(config.output, 'loading-feedback-failure.png'),
  });
  throw error;
} finally {
  if (errorScript)
    await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
      identifier: errorScript,
    });
  await writeFile(
    join(config.output, 'loading-feedback.json'),
    JSON.stringify(report, null, 2),
  );
}
console.log({ status: report.status, checks: report.checks.length });
