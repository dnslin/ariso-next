import assert from 'node:assert/strict';
import { testId, field } from './processing-helpers.mjs';
import { resizeViewport } from './browser-geometry.mjs';

export async function verifyProcessingSessionRecovery(
  page,
  config,
  tools,
  report,
) {
  const {
    request,
    settings,
    open,
    fill,
    value,
    monitor,
    browser,
    sql,
    reauthenticate,
    evidence,
    scrollDetails,
  } = tools;
  // These session cases start from their own saved quality and editable route.
  await request('/api/settings/media', 'PATCH', {
    quality: 82,
    compressionEnabled: true,
    watermarkMode: 'off',
    watermarkAssetId: null,
    defaultLinkVersion: 'compressed',
  });
  await open();
  await page.cdp('Network.enable');
  await fill('quality', 66);
  await monitor();
  await sql(`UPDATE session SET expires_at=${Date.now() - 1}`);
  try {
    await page.click(testId('save'));
    await page.waitForFunction(() =>
      window.__processingBrowser.requests.some(
        (row) =>
          row.path === '/api/settings/media' &&
          row.method === 'PATCH' &&
          row.status === 401,
      ),
    );
    await page.waitForSelector(`${testId('editor')}[data-state="session"]`);
    assert.equal(await value('quality'), '66');
    await evidence('session-expired', 390, 'dark');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForFunction(
      () =>
        location.pathname === '/login' ||
        window.__processingBrowser?.requests.some(
          (row) =>
            row.path === '/api/auth/get-session' &&
            row.status === 200 &&
            row.sessionNull === true,
        ),
    );
    report.sessionFocusResponses =
      (await browser())?.requests.filter(
        (row) => row.path === '/api/auth/get-session',
      ) ?? [];
    const focusedPath = new URL(await page.url()).pathname;
    if (focusedPath === '/login') {
      report.sessionAfterFocus = { path: focusedPath };
      assert.equal(
        focusedPath,
        '/settings/processing',
        'Session focus must preserve the processing page until explicit login',
      );
    }
    assert.ok(
      report.sessionFocusResponses.some(
        (row) => row.status === 200 && row.sessionNull === true,
      ),
      'The real focus session check completed with null before checking retained input',
    );
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    const afterFocus = await page.evaluate(
      (selector) => ({
        path: location.pathname,
        editorState: document.querySelector('[data-testid="processing-editor"]')
          ?.dataset.state,
        quality: document.querySelector(selector)?.value,
        qualityDisabled: document.querySelector(selector)?.disabled,
        saveDisabled: document.querySelector('[data-testid="processing-save"]')
          ?.disabled,
        previewDisabled: document.querySelector(
          '[data-testid="processing-preview-open"]',
        )?.disabled,
      }),
      field('quality'),
    );
    report.sessionAfterFocus = afterFocus;
    assert.equal(afterFocus.path, '/settings/processing');
    assert.equal(afterFocus.editorState, 'session');
    assert.equal(afterFocus.quality, '66');
    assert.equal(afterFocus.qualityDisabled, true);
    assert.equal(afterFocus.saveDisabled, true);
    assert.equal(afterFocus.previewDisabled, true);
    await evidence('session-expired-after-focus', 390, 'dark');
    const sessionDetails = await scrollDetails([
      '[role="alert"]:has(a[href^="/login?"])',
      'a[href="/login?reason=expired&returnTo=%2Fsettings%2Fprocessing"]',
    ]);
    await evidence('session-expired-login-entry', 390, 'dark');
    Object.assign(report.layouts.at(-1), sessionDetails);
    report.checks.push({
      check:
        'The real owner session expires in the disposable database. Save returns 401, then the shared window-focus check GET returns 200/null. After browser frames process that actual response, the same processing route/form retains quality 66 and disables editing/save/preview until explicit login; fixture restoration signs in again and captures new cookies.',
    });
  } finally {
    await reauthenticate();
    await open();
  }
  assert.equal((await settings()).quality, 82);

  // The upload provider owns its controller across real owner-route navigation.
  await resizeViewport(page, 1440);
  await monitor({ holdSettingsSaveResponse: true });
  await page.click('.shell-navigation a[href="/upload"]');
  await page.waitForURL(`${config.origin}/upload`);
  await page.waitForFunction(() =>
    window.__processingBrowser?.requests.some(
      (row) => row.path === '/upload/settings' && row.status === 200,
    ),
  );
  await page.waitForSelector('[data-testid="upload-composition"]');
  await page.click('.shell-navigation a[href="/settings/processing"]');
  await page.waitForURL(`${config.origin}/settings/processing`);
  await page.waitForSelector(`${testId('editor')}[data-state="ready"]`);
  await fill('quality', 66);
  try {
    await page.click(testId('save'));
    await page.waitForFunction(() =>
      window.__processingBrowser?.requests.some(
        (row) =>
          row.path === '/api/settings/media' &&
          row.method === 'PATCH' &&
          row.status === 200 &&
          row.held === true,
      ),
    );
    assert.equal((await settings()).quality, 66);
    await sql(`UPDATE session SET expires_at=${Date.now() - 1}`);
    await page.evaluate(() => window.__processingReleaseReads());
    await page.waitForFunction(
      () =>
        location.pathname === '/login' ||
        window.__processingBrowser?.requests.some(
          (row) => row.path === '/upload/settings' && row.status === 401,
        ),
    );
    await page.waitForFunction(
      () =>
        location.pathname === '/login' ||
        document.querySelector('[data-testid="processing-editor"]')?.dataset
          .state === 'session',
    );
    // Protocol events survive a redirect that destroys the monitored document.
    // Preserve every browser error in this drained batch as the shared reader does.
    const events = await page.events();
    report.browserErrors.push(
      ...events
        .filter(
          ({ method, params }) =>
            method === 'Runtime.bindingCalled' &&
            params.name === '__arisoReportError',
        )
        .map(({ params }) => JSON.parse(params.payload)),
    );
    const responses = events
      .filter(
        ({ method, params }) =>
          method === 'Network.responseReceived' &&
          new URL(params.response.url).pathname === '/upload/settings',
      )
      .map(({ params }) => ({
        path: '/upload/settings',
        status: params.response.status,
      }));
    report.uploadLifetimeExpiry = {
      responses,
      path: new URL(await page.url()).pathname,
      monitored:
        (await browser())?.requests.filter(
          (row) =>
            row.path === '/upload/settings' ||
            row.path === '/api/auth/get-session',
        ) ?? [],
    };
    assert.ok(
      responses.some((row) => row.status === 401),
      'The live upload provider completed its real settings request with 401',
    );
    assert.equal(
      report.uploadLifetimeExpiry.path,
      '/settings/processing',
      'A background upload 401 must preserve processing input until explicit login',
    );
    await page.waitForSelector(`${testId('editor')}[data-state="session"]`);
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    const retained = await page.evaluate(
      (selector) => ({
        path: location.pathname,
        editorState: document.querySelector('[data-testid="processing-editor"]')
          ?.dataset.state,
        quality: document.querySelector(selector)?.value,
        qualityDisabled: document.querySelector(selector)?.disabled,
        saveDisabled: document.querySelector('[data-testid="processing-save"]')
          ?.disabled,
        previewDisabled: document.querySelector(
          '[data-testid="processing-preview-open"]',
        )?.disabled,
      }),
      field('quality'),
    );
    report.uploadLifetimeExpiry.retained = retained;
    assert.deepEqual(retained, {
      path: '/settings/processing',
      editorState: 'session',
      quality: '66',
      qualityDisabled: true,
      saveDisabled: true,
      previewDisabled: true,
    });
    await evidence('session-expired-upload-lifetime', 390, 'dark');
    report.checks.push({
      check:
        'A real Upload settings read initializes its live controller; client navigation keeps that provider alive while editing processing quality 66. The real successful settings PATCH is held after reception, the session then expires, and releasing that response invalidates the actual active Upload settings query, which returns 401. Processing retains its route/input and disables editing/save/preview until explicit login.',
    });
  } finally {
    await page.evaluate(() => window.__processingReleaseReads?.());
    await reauthenticate();
    await request('/api/settings/media', 'PATCH', { quality: 82 });
    await open();
  }
  assert.equal((await settings()).quality, 82);
}
