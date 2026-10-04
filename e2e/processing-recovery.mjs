import assert from 'node:assert/strict';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { testId, field, quote } from './processing-helpers.mjs';
import { resizeViewport } from './browser-geometry.mjs';

export async function verifyProcessingRecovery(page, config, tools, report) {
  const {
    request,
    settings,
    open,
    fill,
    value,
    select,
    switchTo,
    monitor,
    browser,
    create,
    previewState,
    previewControls,
    chooseFile,
    sql,
    reauthenticate,
    evidence,
    scrollDetails,
  } = tools;
  const activeControls = async (state) => {
    const controls = await previewControls();
    assert.equal(controls.fileDisabled, true);
    assert.equal(controls.picker.disabled, true);
    assert.equal(controls.picker.text, '更换测试图');
    assert.deepEqual(
      controls.targets.map((row) => row.target),
      ['original', 'thumbnail', 'compressed', 'watermark'],
    );
    assert.ok(controls.targets.every((row) => row.disabled));
    assert.equal(controls.cancelCount, 1);
    assert.equal(controls.cardCancelCount, 0);
    const cancel = controls.footer.find(
      (row) => row.testId === 'processing-preview-cancel',
    );
    assert.deepEqual(cancel, {
      testId: 'processing-preview-cancel',
      text: '取消预览',
      disabled: state !== 'running',
    });
    assert.equal(
      controls.footer.some((row) => row.testId === 'processing-preview-create'),
      false,
    );
    if (state === 'cancelling') assert.deepEqual(controls.footer, [cancel]);
    return controls;
  };
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

  await page.click(testId('preview-open'));
  const originalUpload = await request('/api/settings/upload');
  const oversizedFile = join(config.output, 'processing-oversized.png');
  const oversizedBytes = Buffer.alloc(5 * 1024 * 1024 + 1);
  (
    await readFile(
      join(config.projectDirectory, 'tests/fixtures/media-formats/source.png'),
    )
  ).copy(oversizedBytes);
  await writeFile(oversizedFile, oversizedBytes);
  try {
    await request('/api/settings/upload', 'PATCH', { maxFileMiB: 5 });
    await monitor();
    await page.setInputFiles(testId('preview-file'), [oversizedFile]);
    await page.click(testId('preview-create'));
    await page.waitForSelector(`${testId('preview')}[data-state="failed"]`);
    const receivedFailure = await previewState();
    const sent = (await browser()).requests.find(
      (row) => row.path === '/api/media/previews' && row.method === 'POST',
    );
    assert.equal(sent.status, 413);
    assert.equal(sent.response.code, 'MEDIA_PREVIEW_FILE_TOO_LARGE');
    assert.ok(sent.response.previewId);
    assert.equal(receivedFailure.id, sent.response.previewId);
    const receivedRow = await request(
      `/api/media/previews/${receivedFailure.id}`,
    );
    assert.equal(receivedRow.status, 'failed');
    assert.equal(receivedRow.result, null);
    assert.equal(receivedRow.cleanupStatus, 'deleted');
    assert.ok(receivedFailure.text.includes('processing-oversized.png'));
    assert.ok(receivedFailure.text.includes(sent.response.message));
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelectorAll(
            '[data-testid="processing-preview-refresh"]',
          ).length,
      ),
      1,
      'An addressable POST failure offers exactly one status refresh',
    );
    const readsBefore = (await browser()).requests.filter(
      (row) =>
        row.method === 'GET' &&
        row.path === `/api/media/previews/${receivedFailure.id}`,
    ).length;
    await page.click(testId('preview-refresh'));
    await page.waitForFunction(
      ({ id, readsBefore }) =>
        window.__processingBrowser.requests.filter(
          (row) =>
            row.method === 'GET' &&
            row.path === `/api/media/previews/${id}` &&
            row.response?.status === 'failed',
        ).length ===
        readsBefore + 1,
      { id: receivedFailure.id, readsBefore },
    );
    assert.equal(
      (await browser()).requests.filter((row) => row.method === 'POST').length,
      1,
    );
    await evidence('preview-receive-failed', 390, 'dark');
    report.checks.push({
      check:
        'A real 5 MiB + 1 byte file exceeds the actual independently configured 5 MiB upload limit. POST returns 413 with a real previewId; GET reads its failed/cleaned record, input stays visible, and exactly one status refresh reads the same ID without repeating POST.',
      previewId: receivedFailure.id,
      byteSize: oversizedBytes.length,
      code: sent.response.code,
      status: sent.status,
    });
  } finally {
    await request('/api/settings/upload', 'PATCH', {
      maxFileMiB: originalUpload.maxFileMiB,
    });
    assert.deepEqual(await request('/api/settings/upload'), originalUpload);
  }
  await monitor({ path: '/api/media/previews', method: 'POST' });
  await page.click('[data-preview-target="compressed"]');
  await chooseFile();
  await page.click(testId('preview-create'));
  await page.waitForSelector(
    `${testId('preview')}[data-state="create-unknown"]`,
  );
  const unknown = await browser();
  const accepted = unknown.requests.find((row) => row.responseLost);
  assert.equal(accepted.status, 202);
  assert.ok(accepted.response.id);
  assert.equal((await previewState()).id, '');
  assert.equal(
    unknown.requests.filter((row) => row.method === 'POST').length,
    1,
  );
  assert.equal(
    unknown.requests.filter(
      (row) => row.method === 'GET' && row.path.includes(accepted.response.id),
    ).length,
    0,
  );
  await evidence('preview-create-unknown', 390);
  await page.click(testId('preview-recreate'));
  await page.waitForSelector(testId('recreate-confirmation'));
  await evidence('preview-recreate-confirmation', 390, 'dark');
  await page.keyboard.press('Escape');
  assert.equal(
    (await browser()).requests.filter((row) => row.method === 'POST').length,
    1,
  );
  await page.click(testId('preview-recreate'));
  await page.click(testId('confirm-recreate'));
  await page.waitForFunction(
    () => {
      const root = document.querySelector('[data-testid="processing-preview"]');
      return root?.dataset.previewId && root.dataset.state === 'succeeded';
    },
    undefined,
    { timeout: 60000 },
  );
  const recovered = await previewState();
  assert.notEqual(recovered.id, accepted.response.id);
  assert.equal(
    (await browser()).requests.filter((row) => row.method === 'POST').length,
    2,
  );
  await request(`/api/media/previews/${accepted.response.id}`, 'DELETE');
  report.checks.push({
    check:
      'The real accepted POST response is lost entirely: no ID is invented, no list request or automatic resubmission occurs. Escape preserves unknown state; only explicit confirmed recreation creates a new task.',
    unknownTaskId: accepted.response.id,
    recreatedTaskId: recovered.id,
  });

  const expiring = await create('compressed');
  await sql(
    `UPDATE media_previews SET expires_at=${Date.now() - 1} WHERE id=${quote(expiring.id)}`,
  );
  await page.click(testId('preview-refresh'));
  await page.waitForSelector(`${testId('preview')}[data-state="expired"]`);
  assert.equal(
    (await request(`/api/media/previews/${expiring.id}`)).status,
    'expired',
  );
  const expiredBytes = await page.fetch(
    `/api/media/previews/${expiring.id}/result`,
  );
  assert.equal(expiredBytes.status, 410);
  assert.equal(
    await page.evaluate(
      () =>
        !!document.querySelector(
          '[data-testid="processing-preview-result"] img',
        ),
    ),
    false,
  );
  await evidence('preview-expired', 390, 'dark');
  const retried = await create('compressed');
  assert.notEqual(retried.id, expiring.id);
  assert.equal(retried.status, 'succeeded');
  report.checks.push({
    check:
      'A real preview clock is advanced in the disposable database. GET reports expired, bytes return 410, and explicit retry creates a fresh successful ID.',
    expiredId: expiring.id,
    retriedId: retried.id,
  });

  const malformedFile = join(config.output, 'processing-malformed.png');
  await writeFile(
    malformedFile,
    'This is an invalid image supplied to the real image inspector.',
  );
  await page.setInputFiles(testId('preview-file'), [malformedFile]);
  await page.click(testId('preview-create'));
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="processing-preview"]')?.dataset
        .state === 'failed',
    undefined,
    { timeout: 60000 },
  );
  const failed = await previewState();
  const failedRow = await request(`/api/media/previews/${failed.id}`);
  assert.equal(failedRow.status, 'failed');
  assert.ok(failedRow.error);
  assert.equal(failedRow.result, null);
  assert.ok(failed.text.includes(failedRow.error));
  await evidence('preview-failed', 390, 'dark');
  report.checks.push({
    check:
      'An actual malformed local file is rejected by the real image inspector. The UI shows the addressable failed task and its exact server diagnostic without a partial result.',
    previewId: failed.id,
    error: failedRow.error,
  });
  await chooseFile();

  // A real larger input keeps the existing encoder active across a normal GET.
  const runningFile = join(config.output, 'processing-running.jpg');
  await promisify(execFile)(
    'magick',
    [
      join(config.projectDirectory, 'tests/fixtures/media-formats/source.png'),
      '-filter',
      'point',
      '-resize',
      '4096x3072!',
      '-seed',
      '189',
      '+noise',
      'Random',
      '-depth',
      '8',
      '-quality',
      '80',
      runningFile,
    ],
    { timeout: 30000 },
  );
  const runningBytes = (await stat(runningFile)).size;
  assert.ok(runningBytes <= originalUpload.maxFileBytes);
  await page.click(testId('preview-return'));
  await select('outputFormat', 'avif');
  await switchTo('最长边限制', false);
  await page.click(testId('preview-open'));
  // Only terminal real GETs are held. Actual queued/running responses pass through.
  await monitor({ holdPreviewTerminalReads: true });
  try {
    await page.setInputFiles(testId('preview-file'), [runningFile]);
    await page.click(testId('preview-create'));
    await page.waitForFunction(() => {
      const root = document.querySelector('[data-testid="processing-preview"]');
      return (
        root?.dataset.previewId &&
        root.dataset.state === 'running' &&
        window.__processingBrowser.requests.some(
          (row) =>
            row.method === 'GET' &&
            row.path === `/api/media/previews/${root.dataset.previewId}` &&
            row.response?.status === 'running',
        )
      );
    });
    const cancellable = await previewState();
    for (const [width, theme, height] of [
      [1440, 'light', 1080],
      [390, 'dark', 844],
    ]) {
      const details = await scrollDetails(
        [`${testId('preview')} [data-slot="card"]:last-child`],
        width,
        theme,
        height,
      );
      await evidence('preview-running', width, theme, height);
      Object.assign(report.layouts.at(-1), details, {
        controls: await activeControls('running'),
      });
    }
    await page.waitForFunction(
      (id) =>
        window.__processingBrowser.requests.some(
          (row) =>
            row.method === 'GET' &&
            row.path === `/api/media/previews/${id}` &&
            row.held === true,
        ),
      cancellable.id,
    );
    const heldTerminal = (await browser()).requests.find(
      (row) => row.held && row.path === `/api/media/previews/${cancellable.id}`,
    );
    assert.equal(heldTerminal.response.status, 'succeeded');
    report.checks.push({
      check:
        'A real 4096 × 3072 JPEG generated from the CC0 source with the existing seeded ImageMagick noise remains within the actual upload byte limit. Real GET reports running and renders that state on both viewports; only its later real successful terminal GET is held for the existing late-response cancellation regression.',
      previewId: cancellable.id,
      sourceByteSize: runningBytes,
      runningResponse: (await browser()).requests.find(
        (row) => row.response?.status === 'running',
      ),
      terminalResponse: heldTerminal,
    });
    await page.evaluate((id) => {
      window.__processingBrowser.fault.path = `/api/media/previews/${id}`;
      window.__processingBrowser.fault.method = 'DELETE';
      window.__processingBrowser.fault.holdPreviewCancelResponse = true;
    }, cancellable.id);
    await sql(
      "CREATE TRIGGER processing_reject_cleanup BEFORE UPDATE OF cleanup_status ON media_previews WHEN NEW.cleanup_status='deleted' BEGIN SELECT RAISE(ABORT, 'processing browser cleanup persistence failure'); END",
    );
    try {
      await page.click(testId('preview-cancel'));
      await page.waitForFunction(() =>
        window.__processingBrowser.requests.some(
          (row) =>
            row.method === 'DELETE' &&
            row.path.endsWith(
              document.querySelector('[data-testid="processing-preview"]')
                .dataset.previewId,
            ) &&
            row.status === 200 &&
            row.held === true,
        ),
      );
      await page.waitForSelector(
        `${testId('preview')}[data-state="cancelling"]`,
      );
      assert.ok(
        (await previewState()).text.includes(
          '正在等待本次取消请求返回。尚未确认任务停止与清理完成。',
        ),
      );
      assert.ok((await previewState()).text.includes('正在等待取消响应'));
      for (const [width, theme, height] of [
        [1440, 'light', 1080],
        [390, 'dark', 844],
      ]) {
        const details = await scrollDetails(
          [`${testId('preview')} [data-slot="card"]:last-child`],
          width,
          theme,
          height,
        );
        await evidence('preview-cancelling', width, theme, height);
        Object.assign(report.layouts.at(-1), details, {
          controls: await activeControls('cancelling'),
        });
      }
      report.checks.push({
        check:
          'The actual DELETE 200 response is received and held independently of the older GET. The same-ID cancelling view shows the real wait-for-settlement interaction on both viewports; releasing only DELETE then preserves the existing lost-cancel-response and late-GET recovery assertions.',
        previewId: cancellable.id,
        heldDelete: (await browser()).requests.find(
          (row) => row.method === 'DELETE' && row.held === true,
        ),
      });
      await page.evaluate(() => window.__processingReleaseCancel());
      await page.waitForSelector(
        `${testId('preview')}[data-state="cancel-unknown"]`,
      );
      const cancelUnknown = await previewState();
      assert.equal(cancelUnknown.id, cancellable.id);
      assert.ok(cancelUnknown.text.includes('结果待核对'));
      for (const oldFact of [
        '排队中',
        '生成中',
        '等待共享处理名额。',
        '服务端正在处理。',
      ])
        assert.equal(
          cancelUnknown.text.includes(oldFact),
          false,
          'A lost cancel response cannot present the cached activity as current fact',
        );
      assert.equal(
        await page.evaluate(
          () =>
            document.querySelectorAll(
              '[data-testid="processing-preview-reconcile"]',
            ).length,
        ),
        1,
      );
      await evidence('preview-cancel-unknown', 390, 'dark');
      report.layouts.at(-1).controls = await activeControls('cancel-unknown');
      const cancelled = await request(`/api/media/previews/${cancellable.id}`);
      assert.equal(cancelled.status, 'cancelled');
      assert.equal(cancelled.cleanupStatus, 'failed');
      assert.match(
        cancelled.cleanupError,
        /processing browser cleanup persistence failure/,
      );
      await page.evaluate(() => window.__processingReleaseReads());
      await page.click(testId('preview-reconcile'));
      await page.waitForSelector(
        `${testId('preview')}[data-state="cancelled"]`,
      );
      const terminalControls = await previewControls();
      assert.equal(terminalControls.fileDisabled, false);
      assert.equal(terminalControls.picker.disabled, false);
      assert.ok(terminalControls.targets.every((row) => !row.disabled));
      assert.equal(terminalControls.cancelCount, 0);
      assert.deepEqual(
        terminalControls.footer.find(
          (row) => row.testId === 'processing-preview-create',
        ),
        {
          testId: 'processing-preview-create',
          text: '生成预览',
          disabled: false,
        },
      );
      await page.waitForFunction(() =>
        document
          .querySelector('[data-testid="processing-preview"]')
          ?.textContent.includes(
            'processing browser cleanup persistence failure',
          ),
      );
      await evidence('preview-cleanup-failed', 390, 'dark', 500);
      const cleanupDetails = await scrollDetails(
        [
          `${testId('preview')} [role="alert"]`,
          `${testId('preview')} [role="alert"] + button`,
        ],
        390,
        'dark',
        500,
      );
      await evidence('preview-cleanup-failed-action', 390, 'dark', 500);
      Object.assign(report.layouts.at(-1), cleanupDetails);
      report.checks.push({
        check:
          'Actual DELETE settles cancellation, but its complete response is lost while older real GET responses are held. Unknown UI keeps the task ID and says result needs verification without declaring cached queued/running facts. Known-ID GET then reads the real cancelled/failed cleanup status and exact disposable trigger diagnostic.',
        previewId: cancellable.id,
        cleanupStatus: cancelled.cleanupStatus,
        cleanupError: cancelled.cleanupError,
      });
    } finally {
      await sql('DROP TRIGGER processing_reject_cleanup');
      await page.evaluate(() => {
        window.__processingReleaseCancel();
        window.__processingReleaseReads();
      });
    }
    await page.waitForFunction(() =>
      window.__processingBrowser.requests.every(
        (row) => !row.held || row.released,
      ),
    );
    assert.equal(
      (await previewState()).status,
      'cancelled',
      'A late real GET cannot replace the settled cancellation with its older success',
    );
    await monitor({
      path: `/api/media/previews/${cancellable.id}`,
      method: 'DELETE',
    });
    await page.click('loc=role:button[name="重试清理"]');
    await page.waitForSelector(testId('preview-reconcile'));
    await page.click(testId('preview-reconcile'));
    await page.waitForFunction(() =>
      window.__processingBrowser.requests.some(
        (row) =>
          row.method === 'GET' && row.response?.cleanupStatus === 'deleted',
      ),
    );
    const reconciled = await request(`/api/media/previews/${cancellable.id}`);
    assert.equal(reconciled.status, 'cancelled');
    assert.equal(reconciled.cleanupStatus, 'deleted');
    assert.equal(
      (await browser()).requests.filter((row) => row.method === 'DELETE')
        .length,
      1,
    );
    report.checks.push({
      check:
        'Explicit cleanup retry runs real DELETE once. When its response is lost, known-ID GET verifies cancelled/deleted without repeated mutation; historical cleanupError does not turn deleted into a failed cleanup.',
    });
  } finally {
    await page.evaluate(() => {
      window.__processingReleaseCancel();
      window.__processingReleaseReads();
    });
  }

  // Keep the lost-response regression above separate from a successful DELETE.
  await monitor({ holdPreviewTerminalReads: true });
  await page.setInputFiles(testId('preview-file'), [runningFile]);
  await page.click(testId('preview-create'));
  const pausedDeletes = new Set();
  let fetchEnabled = false;
  report.previewCancelFocusRace = { phase: 'waiting-for-real-terminal-read' };
  try {
    await page.waitForFunction(() => {
      const root = document.querySelector('[data-testid="processing-preview"]');
      return (
        ['queued', 'running'].includes(root?.dataset.state) &&
        window.__processingBrowser.requests.some(
          (row) =>
            row.path === `/api/media/previews/${root.dataset.previewId}` &&
            row.method === 'GET' &&
            row.held &&
            row.response?.status === 'succeeded',
        )
      );
    });
    const current = await previewState();
    const path = `/api/media/previews/${current.id}`;
    const url = `${config.origin}${path}`;
    const readsBefore = (await browser()).requests.filter(
      (row) => row.path === path && row.method === 'GET',
    ).length;
    report.previewCancelFocusRace.previewId = current.id;
    report.previewCancelFocusRace.readsBefore = readsBefore;
    await page.cdp('Fetch.enable', {
      patterns: [{ urlPattern: url, requestStage: 'Request' }],
    });
    fetchEnabled = true;
    const drainPreviewRequests = async () => {
      for (const { method, params } of await page.events()) {
        if (method === 'Fetch.requestPaused') {
          if (
            params.request.url === url &&
            params.request.method === 'DELETE'
          ) {
            pausedDeletes.add(params.requestId);
            report.previewCancelFocusRace.deleteRequest = {
              path,
              method: 'DELETE',
              requestId: params.requestId,
            };
          } else
            await page.cdp('Fetch.continueRequest', {
              requestId: params.requestId,
            });
        } else if (
          method === 'Runtime.bindingCalled' &&
          params.name === '__arisoReportError'
        ) {
          report.browserErrors.push(JSON.parse(params.payload));
        }
      }
    };
    await page.click(testId('preview-cancel'));
    const deleteDeadline = Date.now() + 10000;
    while (!pausedDeletes.size && Date.now() < deleteDeadline) {
      await drainPreviewRequests();
      if (!pausedDeletes.size) await delay(50);
    }
    assert.equal(
      pausedDeletes.size,
      1,
      'The actual DELETE is held before sending',
    );
    await page.waitForSelector(`${testId('preview')}[data-state="cancelling"]`);
    report.previewCancelFocusRace.phase = 'delete-request-held';
    report.previewCancelFocusRace.visibility = await page.evaluate(() => ({
      visibilityState: document.visibilityState,
      hidden: document.hidden,
    }));
    report.previewCancelFocusRace.visibilityEvent = await page.evaluate(() => {
      const event = new Event('visibilitychange');
      window.dispatchEvent(event);
      return { type: event.type, targetIsWindow: event.target === window };
    });
    assert.equal(
      report.previewCancelFocusRace.visibilityEvent.targetIsWindow,
      true,
    );
    report.previewCancelFocusRace.observedFrames = [];
    for (let frame = 1; frame <= 3; frame++) {
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(resolve)),
      );
      await drainPreviewRequests();
      const reads = (await browser()).requests.filter(
        (row) => row.path === path && row.method === 'GET',
      );
      report.previewCancelFocusRace.observedFrames.push({
        frame,
        sameIdReads: reads.length,
      });
    }
    report.previewCancelFocusRace.newFocusReads = (await browser()).requests
      .filter((row) => row.path === path && row.method === 'GET')
      .slice(readsBefore);
    assert.equal(
      report.previewCancelFocusRace.newFocusReads.length,
      0,
      'Visibility must not issue any new same-ID GET after cancelling commits and DELETE is held',
    );
    assert.equal(
      (await browser()).requests.some(
        (row) => row.path === path && row.method === 'DELETE' && row.status,
      ),
      false,
      'The actual DELETE remains unsent across the visibility event and observed frames',
    );
    report.previewCancelFocusRace.phase = 'visibility-observed-without-new-get';
    for (const requestId of pausedDeletes) {
      await page.cdp('Fetch.continueRequest', { requestId });
      pausedDeletes.delete(requestId);
    }
    await page.cdp('Fetch.disable');
    fetchEnabled = false;
    await page.waitForSelector(`${testId('preview')}[data-state="cancelled"]`);
    const settledDelete = (await browser()).requests.find(
      (row) => row.path === path && row.method === 'DELETE',
    );
    assert.equal(settledDelete.status, 200);
    assert.equal(settledDelete.response.status, 'cancelled');
    assert.equal(settledDelete.response.cleanupStatus, 'deleted');
    assert.equal(settledDelete.responseLost, undefined);
    report.previewCancelFocusRace.deleteResponse = settledDelete;
    report.previewCancelFocusRace.phase = 'canonical-cancelled-before-late-get';
    await page.evaluate(() => window.__processingReleaseReads());
    await page.waitForFunction(() =>
      window.__processingBrowser.requests.every(
        (row) => !row.held || row.released,
      ),
    );
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    report.previewCancelFocusRace.afterLateRead = await previewState();
    report.previewCancelFocusRace.phase = 'late-focus-read-released';
    assert.equal(
      report.previewCancelFocusRace.afterLateRead.status,
      'cancelled',
      'The older actual GET cannot overwrite canonical cancellation after DELETE settles',
    );
    assert.equal((await request(path)).status, 'cancelled');
    report.checks.push({
      check:
        'CDP holds an actual same-ID DELETE before sending and the cancelling UI commits. A visibility event reaches window; three observed animation frames and drained CDP events confirm zero new same-ID GETs. DELETE 200 reaches the hook and settles cancelled/deleted before releasing its older actual successful GET; canonical cancellation does not regress.',
      ...report.previewCancelFocusRace,
    });
  } finally {
    try {
      for (const requestId of pausedDeletes)
        await page.cdp('Fetch.continueRequest', { requestId });
    } finally {
      try {
        if (fetchEnabled) await page.cdp('Fetch.disable');
      } finally {
        await page.evaluate(() => window.__processingReleaseReads());
      }
    }
  }

  await page.click(testId('preview-return'));
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
