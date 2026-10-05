import assert from 'node:assert/strict';
import { join } from 'node:path';
import { testId, quote } from './processing-helpers.mjs';

export async function verifyProcessingAssetClear(page, config, tools, report) {
  const {
    request,
    settings,
    editable,
    open,
    switchTo,
    monitor,
    browser,
    sql,
    evidence,
    scrollDetails,
    result,
  } = tools;
  const adopted = editable(await settings());
  assert.ok(adopted.watermarkAssetId);
  const assetId = () =>
    page.evaluate(
      () =>
        document.querySelector('[data-testid="processing-asset"]').dataset
          .assetId,
    );
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelectorAll('[data-testid="processing-asset-clear"]')
          .length,
    ),
    1,
    'The selected expired draft has one public explicit clear operation',
  );
  const view = () =>
    page.evaluate(() => {
      const form = document.querySelector('#processing-form');
      const main = document.querySelector('.shell-content');
      const preview = document.querySelector(
        '[data-testid="processing-preview"]',
      );
      return {
        controls: {
          inputs: [
            ...form.querySelectorAll(
              'input:not([type="hidden"]):not([type="range"]):not([type="file"]),textarea',
            ),
          ].map((node) => ({
            field:
              node.closest('[data-field]')?.dataset.field ??
              node.getAttribute('aria-label'),
            value: node.value,
            checked: node.checked ?? null,
            disabled: node.disabled,
          })),
          selections: [
            ...form.querySelectorAll('[data-watermark-mode],[data-position]'),
          ].map((node) => ({
            choice: node.dataset.watermarkMode ?? node.dataset.position,
            pressed: node.getAttribute('aria-pressed'),
            disabled: node.disabled,
          })),
          selects: [...form.querySelectorAll('[aria-haspopup="listbox"]')].map(
            (node) => ({
              field: node.closest('[data-field]')?.dataset.field,
              text: node.textContent,
              disabled: node.disabled,
            }),
          ),
          previewFile: document.querySelector(
            '[data-testid="processing-preview"] [data-slot="card"] p',
          ).textContent,
          path: location.pathname,
          editorHidden: document.querySelector(
            '[data-testid="processing-editor"]',
          ).hidden,
        },
        scrollTop: main.scrollTop,
        maxScrollTop: Math.max(0, main.scrollHeight - main.clientHeight),
        preview: {
          id: preview.dataset.previewId,
          target: preview.dataset.resultTarget,
          state: preview.dataset.state,
          stale: preview.dataset.stale,
          resultSource:
            preview
              .querySelector('[data-testid="processing-preview-result"] img')
              ?.getAttribute('src') ?? null,
        },
      };
    });
  const clearEvidence = async (state, width, theme) => {
    const details = await scrollDetails(
      ['#processing-form div:has(> [data-testid="processing-asset-clear"])'],
      width,
      theme,
      500,
    );
    await page.focus(testId('asset-clear'));
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await page.waitForFunction(
      () => document.activeElement?.dataset.testid === 'processing-asset-clear',
    );
    const target = await page.evaluate(() => {
      const clear = document.querySelector(
        '[data-testid="processing-asset-clear"]',
      );
      const rect = clear.getBoundingClientRect();
      return {
        text: clear.innerText,
        disabled: clear.disabled,
        width: rect.width,
        height: rect.height,
        hit: clear.contains(
          document.elementFromPoint(
            rect.x + rect.width / 2,
            rect.y + rect.height / 2,
          ),
        ),
        explanation: clear.parentElement.innerText,
        outsideModeFields: !clear.closest('[hidden],fieldset[disabled]'),
        keyboardFocus: document.activeElement === clear,
        focusVisible:
          clear.matches(':focus-visible') ||
          clear.hasAttribute('data-focus-visible'),
      };
    });
    assert.equal(target.text, '清空素材选择');
    assert.equal(target.disabled, false);
    assert.ok(target.width >= 44 && target.height >= 44);
    assert.equal(target.hit, true);
    assert.equal(target.outsideModeFields, true);
    assert.equal(target.keyboardFocus, true);
    assert.equal(target.focusVisible, true);
    assert.ok(
      target.explanation.includes('保留的图片素材仅在保存后解除引用。'),
    );
    await evidence(`asset-clear-${state}`, width, theme, 500);
    Object.assign(report.layouts.at(-1), details, { clearTarget: target });
  };
  const clear = async (focusTarget = 'save') => {
    const before = await view();
    const savedBefore = editable(await settings());
    await monitor();
    await page.focus(testId('asset-clear'));
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      (focusTarget) =>
        document.querySelector('[data-testid="processing-asset"]')?.dataset
          .state === 'empty' &&
        document.activeElement?.dataset.testid === `processing-${focusTarget}`,
      focusTarget,
    );
    const after = await view();
    assert.deepEqual(after.controls, before.controls);
    assert.equal(after.preview.id, before.preview.id);
    assert.equal(after.preview.target, before.preview.target);
    assert.equal(after.preview.state, before.preview.state);
    assert.equal(after.preview.resultSource, before.preview.resultSource);
    if (before.preview.id) assert.equal(after.preview.stale, 'true');
    assert.ok(
      Math.abs(
        after.scrollTop - Math.min(before.scrollTop, after.maxScrollTop),
      ) < 1,
      'Clear preserves scroll except the browser clamp when content gets shorter',
    );
    assert.equal(await assetId(), '');
    assert.equal(
      await page.evaluate(
        () =>
          document.querySelectorAll('[data-testid="processing-asset-clear"]')
            .length,
      ),
      0,
    );
    assert.equal(
      (await browser()).requests.filter((row) =>
        ['POST', 'PATCH', 'DELETE'].includes(row.method),
      ).length,
      0,
    );
    assert.deepEqual(editable(await settings()), savedBefore);
    assert.equal(
      await page.evaluate(() =>
        document
          .querySelector('[data-testid="processing-asset"]')
          .textContent.includes('尚未选择素材。'),
      ),
      true,
    );
    assert.ok(
      await page.evaluate(() =>
        [...document.querySelectorAll('[data-slot="toast-title"]')].some(
          (node) => node.textContent === '选择已清空，保存后生效',
        ),
      ),
    );
    return {
      beforeScrollTop: before.scrollTop,
      afterScrollTop: after.scrollTop,
      maxScrollTop: after.maxScrollTop,
      previewBeforeClear: before.preview,
      previewAfterClear: after.preview,
    };
  };
  const adoptFresh = async () => {
    await request('/api/settings/media', 'PATCH', {
      watermarkMode: 'off',
      watermarkAssetId: null,
    });
    await open();
    await switchTo('启用水印', true);
    await page.click('[data-watermark-mode="image"]');
    await page.setInputFiles(testId('asset-file'), [
      join(config.projectDirectory, 'tests/fixtures/media-formats/alpha.png'),
    ]);
    await page.waitForSelector(`${testId('asset')}[data-state="temporary"]`);
    const id = await assetId();
    assert.ok((await request(`/api/media/watermark-assets/${id}`)).expiresAt);
    await request('/api/settings/media', 'PATCH', {
      watermarkMode: 'image',
      watermarkAssetId: id,
    });
    await open();
    await page.waitForSelector(`${testId('asset')}[data-state="saved"]`);
    assert.equal((await settings()).watermarkAssetId, id);
    assert.equal(
      (await request(`/api/media/watermark-assets/${id}`)).expiresAt,
      null,
    );
    return id;
  };
  const saveNull = async (mode, expected) => {
    await monitor();
    await page.click(testId('save'));
    await page.waitForFunction(
      (mode) =>
        window.__processingBrowser.requests.some(
          (row) =>
            row.path === '/api/settings/media' &&
            row.method === 'PATCH' &&
            row.status === 200 &&
            row.response?.watermarkAssetId === null &&
            row.response?.watermarkMode === mode,
        ),
      mode,
    );
    const mutations = (await browser()).requests.filter(
      (row) => row.method === 'PATCH',
    );
    assert.equal(mutations.length, 1);
    assert.deepEqual(mutations[0].body, expected);
    assert.equal(Object.keys(mutations[0].body).length, 20);
    assert.deepEqual(editable(await settings()), expected);
    assert.equal(
      (await sql('SELECT watermark_asset_id FROM media_settings WHERE id=1'))[0]
        .watermark_asset_id,
      null,
    );
    return mutations[0];
  };

  // A real selected preview file remains in the mounted editor across the clear.
  await page.click(testId('preview-open'));
  const source = join(
    config.projectDirectory,
    'tests/fixtures/media-formats/source.png',
  );
  await page.setInputFiles(testId('preview-file'), [source]);
  await page.click(testId('preview-return'));
  await clearEvidence('expired-image', 390, 'dark');
  const imageScroll = await clear();
  await evidence('asset-cleared-image', 390, 'dark', 500);
  report.layouts.at(-1).clearFocus = await page.evaluate(() => ({
    testId: document.activeElement?.dataset.testid,
    focusVisible:
      document.activeElement?.matches(':focus-visible') ||
      document.activeElement?.hasAttribute('data-focus-visible'),
  }));
  assert.equal(report.layouts.at(-1).clearFocus.testId, 'processing-save');
  assert.equal(report.layouts.at(-1).clearFocus.focusVisible, true);
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-field="watermarkAssetId"]')
        ?.textContent.includes('请选择水印素材') &&
      document.activeElement?.closest('[data-field]')?.dataset.field ===
        'watermarkAssetId',
  );
  assert.equal(
    (await browser()).requests.filter((row) => row.method === 'PATCH').length,
    0,
  );
  assert.equal(
    await page.evaluate(() =>
      document
        .querySelector('[data-watermark-mode="image"]')
        .getAttribute('aria-pressed'),
    ),
    'true',
  );
  await evidence('asset-cleared-image-validation', 390, 'dark', 500);
  await switchTo('启用水印', false);
  const imageSaved = await saveNull('off', {
    ...adopted,
    watermarkAssetId: null,
    watermarkMode: 'off',
  });
  await page.click(testId('preview-open'));
  await page.click('[data-preview-target="original"]');
  await page.click(testId('preview-create'));
  await page.waitForSelector(`${testId('preview')}[data-state="succeeded"]`, {
    timeout: 60000,
  });
  const filePreviewId = await page.evaluate(
    () =>
      document.querySelector('[data-testid="processing-preview"]').dataset
        .previewId,
  );
  const preservedFileResult = await result(
    await request(`/api/media/previews/${filePreviewId}`),
    source,
  );
  assert.equal(
    (await browser()).requests.find((row) => row.method === 'POST').fileName,
    'source.png',
  );
  await page.click(testId('preview-return'));
  report.checks.push({
    check:
      'Keyboard clear of a real expired image draft changes only its asset ID: other live field values, mode, selected test file, page and scroll are retained. Focus moves to save without a scroll jump; image-empty save is a field error with zero PATCH. Explicit off save sends all 20 exact fields with null, GET/SQLite release the setting reference, and the retained real test file generates bytes matching the original without being selected again.',
    ...imageScroll,
    saved: imageSaved.body,
    retainedFileResult: preservedFileResult,
  });

  for (const [mode, lifecycle, width, theme] of [
    ['off', 'saved', 1440, 'light'],
    ['text', 'saved', 390, 'light'],
    ['off', 'expired', 1440, 'dark'],
    ['text', 'expired', 390, 'dark'],
  ]) {
    const savedId = await adoptFresh();
    let selectedId = savedId;
    if (mode === 'off' && lifecycle === 'saved') {
      await page.click(testId('preview-open'));
      await page.setInputFiles(testId('preview-file'), [source]);
      await page.click('[data-preview-target="original"]');
      await page.click(testId('preview-create'));
      await page.waitForSelector(
        `${testId('preview')}[data-state="succeeded"]`,
        { timeout: 60000 },
      );
      const existingId = (await view()).preview.id;
      await result(await request(`/api/media/previews/${existingId}`), source);
      await page.click(testId('preview-return'));
      const existing = (await view()).preview;
      assert.ok(existing.id);
      assert.equal(existing.id, existingId);
      assert.equal(existing.target, 'original');
      assert.equal(existing.state, 'succeeded');
      assert.equal(existing.stale, 'false');
      assert.ok(existing.resultSource);
    }
    if (lifecycle === 'expired') {
      await monitor();
      await page.setInputFiles(testId('asset-file'), [
        join(config.projectDirectory, 'tests/fixtures/media-formats/alpha.png'),
      ]);
      await page.waitForFunction((oldId) => {
        const area = document.querySelector('[data-testid="processing-asset"]');
        return (
          area?.dataset.state === 'temporary' && area.dataset.assetId !== oldId
        );
      }, savedId);
      selectedId = await assetId();
      if (mode === 'off') await clearEvidence('temporary-image', 1440, 'light');
      await sql(
        `UPDATE media_watermark_assets SET expires_at=${Date.now() - 1} WHERE id=${quote(selectedId)}`,
      );
      await monitor();
      await page.evaluate(() =>
        window.dispatchEvent(new Event('visibilitychange')),
      );
      await page.waitForFunction(
        (id) =>
          document.querySelector('[data-testid="processing-asset"]')?.dataset
            .state === 'unavailable' &&
          window.__processingBrowser.requests.some(
            (row) =>
              row.path === `/api/media/watermark-assets/${id}` &&
              row.method === 'GET' &&
              row.response?.available === false,
          ),
        selectedId,
      );
    }
    if (mode === 'off') await switchTo('启用水印', false);
    else await page.click('[data-watermark-mode="text"]');
    assert.equal(
      await assetId(),
      selectedId,
      'Mode changes retain the selected ID until explicit clear',
    );
    if (lifecycle === 'expired') {
      await monitor();
      await page.click(testId('save'));
      await page.waitForFunction(() =>
        window.__processingBrowser.requests.some(
          (row) =>
            row.path === '/api/settings/media' &&
            row.method === 'PATCH' &&
            row.status === 409,
        ),
      );
      assert.equal(await assetId(), selectedId);
      assert.equal((await settings()).watermarkAssetId, savedId);
    }
    await clearEvidence(`${lifecycle}-${mode}`, width, theme);
    const scroll = await clear();
    if (mode === 'off' && lifecycle === 'saved') {
      assert.ok(scroll.previewAfterClear.id);
      assert.equal(scroll.previewAfterClear.target, 'original');
      assert.equal(scroll.previewAfterClear.state, 'succeeded');
      assert.equal(scroll.previewAfterClear.stale, 'true');
    }
    const saved = await saveNull(mode, {
      ...adopted,
      watermarkMode: mode,
      watermarkAssetId: null,
    });
    await evidence(`asset-cleared-${lifecycle}-${mode}`, width, theme, 500);
    report.checks.push({
      check: `The shared clear entry remains operable in ${mode} with a real ${lifecycle} selected ID. Mode change alone keeps the ID${lifecycle === 'expired' ? ' and actual save returns 409' : ''}; keyboard clear sends no mutation, then one full save explicitly PATCHes null and actual settings GET/SQLite confirm reference release. All other fields remain exact.`,
      lifecycle,
      mode,
      selectedId,
      ...scroll,
      saved: saved.body,
    });
  }

  await adoptFresh();
  await page.cdp('Network.enable');
  try {
    await page.cdp('Network.setBlockedURLs', {
      urls: ['*/api/media/watermark-assets/*'],
    });
    await open();
    await page.waitForSelector(testId('asset-retry'));
    await clearEvidence('read-error', 390, 'dark');
    await clear();
    assert.equal(
      await page.evaluate(
        () =>
          !!document.querySelector('[data-testid="processing-asset-retry"]'),
      ),
      false,
    );
    await page.click('[data-watermark-mode="text"]');
    await saveNull('text', {
      ...adopted,
      watermarkMode: 'text',
      watermarkAssetId: null,
    });
    await evidence('asset-cleared-read-error', 390, 'dark', 500);
  } finally {
    await page.cdp('Network.setBlockedURLs', { urls: [] });
  }
  report.checks.push({
    check:
      'A real blocked saved-asset metadata request exposes the same public clear entry. Explicit clear dismisses stale ID/read error locally; text save explicitly nulls the persisted setting reference without uploading a replacement.',
  });

  const busyId = await adoptFresh();
  for (const operation of ['save', 'upload']) {
    await monitor(
      operation === 'save'
        ? { holdSettingsSaveResponse: true }
        : { holdWatermarkUploadResponse: true },
    );
    try {
      if (operation === 'save') await page.click(testId('save'));
      else
        await page.setInputFiles(testId('asset-file'), [
          join(
            config.projectDirectory,
            'tests/fixtures/media-formats/alpha.png',
          ),
        ]);
      await page.waitForFunction(
        (operation) =>
          window.__processingBrowser.requests.some(
            (row) =>
              row.held &&
              row.path ===
                (operation === 'save'
                  ? '/api/settings/media'
                  : '/api/media/watermark-assets'),
          ),
        operation,
      );
      assert.equal(
        await page.evaluate(
          () =>
            document.querySelector('[data-testid="processing-asset-clear"]')
              .disabled,
        ),
        true,
      );
      assert.equal(await assetId(), busyId);
    } finally {
      await page.evaluate(() => window.__processingReleaseReads());
    }
    await page.waitForFunction(
      () =>
        !document.querySelector('[data-testid="processing-asset-clear"]')
          .disabled,
    );
  }
  report.checks.push({
    check:
      'Holding actual successful save and actual upload 201 responses separately proves the shared clear entry is disabled while save or asset upload is pending, preserves the old selected ID, and re-enables after each real response is released.',
  });

  await page.waitForSelector(`${testId('asset')}[data-state="temporary"]`);
  const unknownId = await assetId();
  await monitor({ path: '/api/settings/media', method: 'PATCH' });
  await page.click(testId('save'));
  await page.waitForSelector(testId('settings-reconcile'));
  const unknownSave = (await browser()).requests.find(
    (row) => row.method === 'PATCH',
  );
  assert.equal(unknownSave.status, 200);
  assert.equal(unknownSave.responseLost, true);
  assert.equal(unknownSave.response.watermarkAssetId, unknownId);
  assert.equal(
    await page.evaluate(
      () => document.querySelector('[data-testid="processing-save"]').disabled,
    ),
    true,
  );
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelector('[data-testid="processing-asset-clear"]')
          .disabled,
    ),
    false,
  );
  await clearEvidence('save-unknown', 390, 'dark');
  report.assetClearUnknown = {
    phase: 'real-successful-save-response-lost',
    request: unknownSave,
  };
  try {
    await clear('settings-reconcile');
  } finally {
    report.assetClearUnknown.afterClear = await page.evaluate(() => ({
      path: location.pathname,
      activeTestId: document.activeElement?.dataset.testid ?? null,
      activeTag: document.activeElement?.tagName,
      saveDisabled: document.querySelector('[data-testid="processing-save"]')
        .disabled,
      reconcilePresent: Boolean(
        document.querySelector('[data-testid="processing-settings-reconcile"]'),
      ),
      assetId: document.querySelector('[data-testid="processing-asset"]')
        .dataset.assetId,
    }));
    report.assetClearUnknown.mutationsAfterClear = (
      await browser()
    ).requests.filter((row) =>
      ['POST', 'PATCH', 'DELETE'].includes(row.method),
    );
  }
  assert.equal(report.assetClearUnknown.afterClear.saveDisabled, true);
  assert.equal(report.assetClearUnknown.afterClear.reconcilePresent, true);
  assert.equal(report.assetClearUnknown.mutationsAfterClear.length, 0);
  await evidence('asset-cleared-save-unknown', 390, 'dark', 500);
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () =>
      !document.querySelector(
        '[data-testid="processing-settings-reconcile"]',
      ) && !document.querySelector('[data-testid="processing-save"]').disabled,
  );
  assert.equal(await assetId(), '');
  assert.equal((await settings()).watermarkAssetId, unknownId);
  assert.equal(
    (await browser()).requests.filter((row) => row.method === 'PATCH').length,
    0,
  );
  assert.ok(
    (await browser()).requests.some(
      (row) =>
        row.path === '/api/settings/media' &&
        row.method === 'GET' &&
        row.status === 200 &&
        row.response?.watermarkAssetId === unknownId,
    ),
  );
  await switchTo('启用水印', false);
  await saveNull('off', {
    ...adopted,
    watermarkMode: 'off',
    watermarkAssetId: null,
  });
  report.checks.push({
    check:
      'After a real successful save response is lost, explicit clear preserves unknown state and the original submitted request while moving keyboard focus to the existing enabled reconcile action. Enter performs only actual GET: it confirms the original pending save, retains the locally cleared ID, and enables a later explicit null save without an automatic repeat.',
    ...report.assetClearUnknown,
  });
}
