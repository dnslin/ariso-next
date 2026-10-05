import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { field, testId } from './processing-helpers.mjs';
import { resizeViewport } from './browser-geometry.mjs';

export async function verifyProcessingSettingsEntry(
  page,
  config,
  tools,
  report,
) {
  const { request, editable, open, value, monitor, browser, evidence } = tools;
  const path = '/api/settings/media';
  const url = `${config.origin}${path}`;
  const source = {
    quality: 82,
    compressionEnabled: true,
    defaultLinkVersion: 'compressed',
    watermarkMode: 'off',
    watermarkAssetId: null,
  };
  await request(path, 'PATCH', source);
  await open();
  await resizeViewport(page, 1440);
  assert.equal(await value('quality'), '82');
  await page.evaluate(() => {
    window.__processingEntryDocument = {
      document,
      window,
      timeOrigin: performance.timeOrigin,
    };
  });
  report.settingsEntry = {
    cacheOwnerEvidence:
      'Same document/window is observed below. RootLayout retains Providers, whose useState owns the QueryClient across client navigation; no private React/QueryClient introspection is used.',
    initialQuality: 82,
  };
  const sameDocument = async () => {
    const identity = await page.evaluate(() => ({
      sameDocument: window.__processingEntryDocument?.document === document,
      sameWindow: window.__processingEntryDocument?.window === window,
      sameTimeOrigin:
        window.__processingEntryDocument?.timeOrigin === performance.timeOrigin,
      path: location.pathname,
    }));
    assert.equal(identity.sameDocument, true);
    assert.equal(identity.sameWindow, true);
    assert.equal(identity.sameTimeOrigin, true);
    return identity;
  };
  const navigate = async (route) => {
    await page.click(`.shell-navigation a[href="${route}"]`);
    await page.waitForURL(`${config.origin}${route}`);
    return sameDocument();
  };
  const displayed = () =>
    page.evaluate(() => {
      const control = (name) =>
        document.querySelector(
          `[data-field="${name}"] :is(input:not([type="hidden"]):not([type="range"]),textarea)`,
        );
      const number = (name) =>
        control(name) ? Number(control(name).value) : null;
      const selection = (name) =>
        document
          .querySelector(`[data-field="${name}"] [data-slot="select-value"]`)
          .textContent.trim();
      const enabled = (label) => {
        const node = document.querySelector(
          `[role="switch"][aria-label="${label}"]`,
        );
        return node.checked ?? node.getAttribute('aria-checked') === 'true';
      };
      return {
        compressionEnabled: enabled('压缩版本'),
        outputFormat: selection('outputFormat'),
        quality: number('quality'),
        maxEdge: number('maxEdge'),
        jpegBackground: control('jpegBackground').value,
        watermarkMode: enabled('启用水印')
          ? document.querySelector('[data-watermark-mode][aria-pressed="true"]')
              .dataset.watermarkMode
          : 'off',
        watermarkAssetId:
          document.querySelector('[data-testid="processing-asset"]').dataset
            .assetId || null,
        watermarkText: control('watermarkText').value,
        watermarkFont: selection('watermarkFont'),
        watermarkFontSize: number('watermarkFontSize'),
        watermarkColor: control('watermarkColor').value,
        watermarkStrokeColor: control('watermarkStrokeColor').value,
        watermarkStrokeWidth: number('watermarkStrokeWidth'),
        watermarkOpacity: number('watermarkOpacity'),
        watermarkPosition: document.querySelector(
          '[data-position][aria-pressed="true"]',
        ).dataset.position,
        watermarkMargin: number('watermarkMargin'),
        watermarkWidth: number('watermarkWidth'),
        defaultLinkVersion: selection('defaultLinkVersion'),
        defaultVisibility: selection('defaultVisibility'),
        concurrency: number('concurrency'),
      };
    });
  const assertDisplayed = async (server) => {
    await page.waitForSelector(`${testId('editor')}[data-state="ready"]`);
    await page.waitForFunction(
      ({ selector, quality }) =>
        document.querySelector(selector)?.value === String(quality),
      { selector: field('quality'), quality: server.quality },
    );
    const actual = await displayed();
    assert.equal(Object.keys(actual).length, 20);
    assert.deepEqual(actual, {
      ...server,
      outputFormat: { jpeg: 'JPEG', webp: 'WebP', avif: 'AVIF' }[
        server.outputFormat
      ],
      watermarkFont: { chinese: '内置中文字体', latin: '内置拉丁字体' }[
        server.watermarkFont
      ],
      defaultLinkVersion: {
        original: '原图',
        compressed: '压缩图',
        watermark: '水印图',
      }[server.defaultLinkVersion],
      defaultVisibility: { public: '公开', private: '私有' }[
        server.defaultVisibility
      ],
    });
    return actual;
  };
  const assertNoEditor = async (state) => {
    const result = await page.evaluate(() => ({
      state: document.querySelector('[data-testid="processing-editor"]')
        ?.dataset.state,
      text: document.querySelector('[data-testid="processing-editor"]')
        ?.innerText,
      form: Boolean(document.querySelector('#processing-form')),
      fields: document.querySelectorAll(
        '[data-testid="processing-editor"] [data-field]',
      ).length,
      footer: Boolean(document.querySelector('.shell-footer')),
      save: Boolean(document.querySelector('[data-testid="processing-save"]')),
      preview: Boolean(
        document.querySelector('[data-testid="processing-preview"]'),
      ),
    }));
    assert.equal(result.state, state);
    assert.equal(result.form, false);
    assert.equal(result.fields, 0);
    assert.equal(result.footer, false);
    assert.equal(result.save, false);
    assert.equal(result.preview, false);
    assert.ok(
      result.text.includes(
        state === 'loading' ? '正在读取处理设置' : '无法读取处理设置',
      ),
    );
    if (state === 'loading')
      assert.ok(result.text.includes('请稍候，取得已保存设置后再编辑。'));
    return result;
  };
  const saveCurrent = async (server) => {
    await page.click(testId('save'));
    await page.waitForFunction(() =>
      window.__processingBrowser.requests.some(
        (row) =>
          row.path === '/api/settings/media' &&
          row.method === 'PATCH' &&
          row.status === 200,
      ),
    );
    const patch = (await browser()).requests.filter(
      (row) => row.path === path && row.method === 'PATCH',
    );
    assert.equal(patch.length, 1);
    assert.deepEqual(patch[0].body, server);
    assert.equal(Object.keys(patch[0].body).length, 20);
    assert.deepEqual(editable(await request(path)), server);
    return patch[0];
  };
  await page.cdp('Network.enable');
  const held = new Set();
  let fetchEnabled = false;
  try {
    report.settingsEntry.left = await navigate('/upload');
    const latest = editable(
      await request(path, 'PATCH', {
        quality: 68,
        maxEdge: 1700,
        defaultVisibility: 'private',
        watermarkMode: 'text',
        watermarkText: 'R10 本次服务器设置',
        watermarkAssetId: null,
      }),
    );
    assert.equal(latest.quality, 68);
    await monitor();
    await page.cdp('Fetch.enable', {
      patterns: [{ urlPattern: url, requestStage: 'Response' }],
    });
    fetchEnabled = true;
    try {
      report.settingsEntry.returned = await navigate('/settings/processing');
      const deadline = Date.now() + 10000;
      while (!held.size && Date.now() < deadline) {
        for (const { method, params } of await page.events()) {
          if (method === 'Fetch.requestPaused') {
            held.add(params.requestId);
            assert.equal(params.request.url, url);
            assert.equal(params.request.method, 'GET');
            assert.equal(params.responseStatusCode, 200);
            report.settingsEntry.heldRead = {
              path,
              method: 'GET',
              status: params.responseStatusCode,
              requestId: params.requestId,
            };
          } else if (
            method === 'Runtime.bindingCalled' &&
            params.name === '__arisoReportError'
          ) {
            report.browserErrors.push(JSON.parse(params.payload));
          }
        }
        if (!held.size) await delay(50);
      }
      assert.equal(
        held.size,
        1,
        'The fresh entry GET is actually held at its real 200 response',
      );
      report.settingsEntry.loading = await assertNoEditor('loading');
      await evidence('settings-entry-loading', 1440, 'light');
    } finally {
      try {
        for (const requestId of held) {
          await page.cdp('Fetch.continueRequest', { requestId });
          held.delete(requestId);
        }
      } finally {
        await page.cdp('Fetch.disable');
        fetchEnabled = false;
      }
    }
    report.settingsEntry.displayed = await assertDisplayed(latest);
    await page.waitForFunction(() =>
      window.__processingBrowser.requests.some(
        (row) =>
          row.path === '/api/settings/media' &&
          row.method === 'GET' &&
          row.status === 200 &&
          row.response?.quality === 68,
      ),
    );
    report.settingsEntry.save = await saveCurrent(latest);
    report.checks.push({
      check:
        'Same-document client navigation retains the root cache owner while a separate Node client changes server settings from quality 82 to 68. The real entry GET 200 is held: the existing reading state has no cached editor or footer. Release initializes all 20 actual controls from the fresh server result, and explicit save sends those exact 20 fields without overwriting the new server value.',
      ...report.settingsEntry,
    });

    await monitor();
    await navigate('/upload');
    const afterFailure = editable(
      await request(path, 'PATCH', {
        quality: 64,
        defaultVisibility: 'public',
      }),
    );
    await page.cdp('Network.setBlockedURLs', {
      urls: ['*/api/settings/media'],
    });
    try {
      report.settingsEntry.failedReturn = await navigate(
        '/settings/processing',
      );
      await page.waitForSelector(`${testId('editor')}[data-state="error"]`);
      report.settingsEntry.readFailure = await assertNoEditor('error');
      assert.equal(
        (await browser()).requests.filter(
          (row) => row.path === path && row.method === 'GET',
        ).length,
        1,
      );
      assert.equal(
        (await browser()).requests.filter((row) => row.method === 'PATCH')
          .length,
        0,
      );
      await evidence('settings-entry-read-failure', 1440, 'light');
    } finally {
      await page.cdp('Network.setBlockedURLs', { urls: [] });
    }
    await page.click(testId('settings-retry'));
    report.settingsEntry.retriedDisplay = await assertDisplayed(afterFailure);
    await page.waitForFunction(() =>
      window.__processingBrowser.requests.some(
        (row) =>
          row.path === '/api/settings/media' &&
          row.method === 'GET' &&
          row.status === 200 &&
          row.response?.quality === 64,
      ),
    );
    assert.equal(
      (await browser()).requests.filter(
        (row) => row.path === path && row.method === 'GET',
      ).length,
      2,
    );
    await sameDocument();
    report.checks.push({
      check:
        'A second warm client re-entry after a separate real server change blocks the actual settings GET. It shows this entry read error with no cached form, preview or save footer, and makes no mutation. Only explicit retry performs the next real GET and initializes all 20 controls from server quality 64 while document/window identity remains unchanged.',
      failedReturn: report.settingsEntry.failedReturn,
      readFailure: report.settingsEntry.readFailure,
      retriedDisplay: report.settingsEntry.retriedDisplay,
    });
  } finally {
    try {
      await page.cdp('Network.setBlockedURLs', { urls: [] });
      if (fetchEnabled) {
        try {
          for (const requestId of held)
            await page.cdp('Fetch.continueRequest', { requestId });
        } finally {
          await page.cdp('Fetch.disable');
        }
      }
    } finally {
      await page.evaluate(() => {
        delete window.__processingEntryDocument;
      });
    }
  }
}
