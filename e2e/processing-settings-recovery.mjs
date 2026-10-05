import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { testId } from './processing-helpers.mjs';

export async function verifyProcessingSettingsRecovery(
  page,
  config,
  tools,
  report,
) {
  const { request, value, evidence } = tools;
  await request('/api/settings/media', 'PATCH', {
    compressionEnabled: true,
    outputFormat: 'webp',
    maxEdge: null,
    watermarkMode: 'off',
    watermarkAssetId: null,
    defaultLinkVersion: 'compressed',
    quality: 82,
  });
  await page.cdp('Network.enable');
  const pausedSettings = new Set();
  report.settingsLoading = { responses: [] };
  await page.cdp('Fetch.enable', {
    patterns: [
      {
        urlPattern: `${config.origin}/api/settings/media`,
        requestStage: 'Response',
      },
    ],
  });
  try {
    await page.goto(`${config.origin}/settings/processing`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForSelector(`${testId('editor')}[data-state="loading"]`);
    const deadline = Date.now() + 10000;
    while (!pausedSettings.size && Date.now() < deadline) {
      for (const { method, params } of await page.events()) {
        if (
          method === 'Fetch.requestPaused' &&
          params.request.url === `${config.origin}/api/settings/media`
        ) {
          pausedSettings.add(params.requestId);
          report.settingsLoading.responses.push({
            path: '/api/settings/media',
            requestId: params.requestId,
            status: params.responseStatusCode,
          });
        } else if (
          method === 'Runtime.bindingCalled' &&
          params.name === '__arisoReportError'
        ) {
          report.browserErrors.push(JSON.parse(params.payload));
        }
      }
      if (!pausedSettings.size) await delay(50);
    }
    assert.ok(
      pausedSettings.size,
      'The real initial settings response is held',
    );
    for (const response of report.settingsLoading.responses)
      assert.equal(response.status, 200);
    for (const [width, theme] of [
      [1440, 'light'],
      [390, 'dark'],
    ]) {
      await evidence('settings-loading', width, theme);
      const loading = await page.evaluate(() => {
        const editor = document.querySelector(
          '[data-testid="processing-editor"]',
        );
        const card = editor.querySelector('[role="status"]');
        const normalized = document.createElement('div');
        normalized.style.backgroundColor = getComputedStyle(
          document.documentElement,
        ).getPropertyValue('--surface');
        return {
          cards: editor.querySelectorAll('[data-slot="card"]').length,
          title: card.querySelector('h2').innerText,
          description: card.querySelector('p').innerText,
          background: getComputedStyle(card).backgroundColor,
          surface: normalized.style.backgroundColor,
          inputs: editor.querySelectorAll('input, textarea, [data-field]')
            .length,
          footer: document.querySelector('.shell-footer') !== null,
        };
      });
      assert.equal(loading.cards, 1);
      assert.equal(loading.title, '正在读取处理设置');
      assert.equal(loading.description, '请稍候，取得已保存设置后再编辑。');
      assert.equal(loading.background, loading.surface);
      assert.equal(loading.inputs, 0);
      assert.equal(loading.footer, false);
      report.layouts.at(-1).loading = loading;
    }
  } finally {
    try {
      for (const requestId of pausedSettings)
        await page.cdp('Fetch.continueRequest', { requestId });
    } finally {
      await page.cdp('Fetch.disable');
    }
  }
  await page.waitForSelector(`${testId('editor')}[data-state="ready"]`);
  assert.equal(await value('quality'), '82');
  report.checks.push({
    check:
      'A fresh real initial settings GET returns 200 at the existing Fetch response boundary. Holding it exposes a single neutral desktop/mobile reading card with the actual title and explanation, no editable settings or save footer; releasing it fills quality 82 without an invented loading state.',
    responses: report.settingsLoading.responses,
  });
  try {
    await page.cdp('Network.setBlockedURLs', {
      urls: ['*/api/settings/media'],
    });
    await page.goto(`${new URL(await page.url()).origin}/settings/processing`);
    await page.waitForSelector(`${testId('editor')}[data-state="error"]`);
    await evidence('read-failure', 390, 'dark');
  } finally {
    await page.cdp('Network.setBlockedURLs', { urls: [] });
  }
  await page.click(testId('settings-retry'));
  await page.waitForSelector(`${testId('editor')}[data-state="ready"]`);
  assert.equal(await value('quality'), '82');
  report.checks.push({
    check:
      'Blocking the real settings read exposes an initial read error; unblocking and explicit retry fills actual saved values.',
  });
}
