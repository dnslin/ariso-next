import assert from 'node:assert/strict';

// IDs here belong to verify-browser's disposable DATA_DIR, never a preview.
export const image = 'library-007';
export const endpoint = `/api/images/${image}`;
export const workspace = '[data-testid="detail-reprocess"]';
export const confirmation = '[data-testid="reprocess-confirmation"]';
export const versionNames = {
  original: '原图',
  compressed: '压缩图',
  thumbnail: '缩略图',
  watermark: '水印图',
};
export const button = (name) => `loc=role:button[name="${name}"]`;
export const quote = (value) =>
  value === null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;

export async function openDetail171(
  page,
  config,
  id = image,
  view = 'reprocess',
) {
  await page.goto(
    `${config.origin}/library?image=${id}${view ? `&detailView=${view}` : ''}`,
  );
  await page.waitForSelector(view ? workspace : '[data-testid="detail-body"]');
}
export function readVersionObjects(sql, id = image) {
  return sql(
    `SELECT kind,object_id FROM media_versions WHERE image_id='${id}' ORDER BY kind`,
  );
}
export async function readProcessingSettings(sql) {
  const [settings] = await sql(
    'SELECT compression_enabled,watermark_mode,watermark_text,watermark_font FROM media_settings WHERE id=1',
  );
  return settings;
}
export function enableProcessing(sql) {
  return sql(
    "UPDATE media_settings SET compression_enabled=1,watermark_mode='text',watermark_text='Ariso',watermark_font='latin' WHERE id=1",
  );
}
export function restoreProcessingSettings(sql, settings) {
  return sql(
    `UPDATE media_settings SET compression_enabled=${settings.compression_enabled},watermark_mode=${quote(settings.watermark_mode)},watermark_text=${quote(settings.watermark_text)},watermark_font=${quote(settings.watermark_font)} WHERE id=1`,
  );
}
export async function restoreDetail171Fetch(page) {
  await page.evaluate(() => {
    if (window.__detail171Fetch) {
      window.fetch = window.__detail171Fetch;
      delete window.__detail171Fetch;
    }
  });
}

// This preparation reads actual saved versions. Missing versions are generated
// by a real all-scope POST/worker, rather than supplied by another verifier.
export async function prepareDetail171Versions({ page, sql }) {
  const response = await page.fetch(endpoint);
  assert.equal(response.status, 200);
  const before = JSON.parse(response.body);
  if (before.versions.every((version) => version.saved)) return before;
  const settings = await readProcessingSettings(sql);
  const original = (await readVersionObjects(sql)).find(
    (version) => version.kind === 'original',
  );
  try {
    await enableProcessing(sql);
    const accepted = await page.fetch(`${endpoint}/reprocess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'all' }),
    });
    assert.equal(accepted.status, 202);
    const receipt = JSON.parse(accepted.body);
    await page.waitForFunction(
      async ({ endpoint, jobId }) => {
        const response = await fetch(endpoint);
        if (!response.ok)
          throw new Error(`Preparation detail HTTP ${response.status}`);
        const detail = await response.json();
        return (
          detail.processingJob?.id === jobId &&
          ['succeeded', 'failed', 'cancelled'].includes(
            detail.processingJob.status,
          )
        );
      },
      { endpoint, jobId: receipt.jobId },
      { timeout: 30000 },
    );
    const detail = JSON.parse((await page.fetch(endpoint)).body);
    assert.equal(detail.processingJob.id, receipt.jobId);
    assert.equal(detail.processingJob.status, 'succeeded');
    assert.deepEqual(detail.processingJob.expectedVersions, [
      'compressed',
      'thumbnail',
      'watermark',
    ]);
    assert.equal(detail.versions.length, 4);
    assert.ok(detail.versions.every((version) => version.saved));
    assert.equal(
      (await readVersionObjects(sql)).find(
        (version) => version.kind === 'original',
      ).object_id,
      original.object_id,
    );
    return detail;
  } finally {
    await restoreProcessingSettings(sql, settings);
  }
}

export async function setDetail171Theme(page, theme) {
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
}
export async function setDetail171Viewport(
  page,
  width,
  height = width >= 1200 ? 1080 : 844,
) {
  await page.cdp('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
  await page.waitForFunction(
    ({ width, height }) => innerWidth === width && innerHeight === height,
    { width, height },
  );
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}

export async function verifyDetailControls(
  page,
  { tip, returnText, explanation },
) {
  const returned = '[data-testid="detail-return"]';
  await page.focus(returned);
  await page.hover(returned);
  const returnState = await page.evaluate(() => {
    const node = document.querySelector('[data-testid="detail-return"]');
    const rect = node.getBoundingClientRect();
    return {
      text: node.textContent.trim(),
      icon: !!node.querySelector('svg[aria-hidden="true"]'),
      focused: document.activeElement === node,
      background: getComputedStyle(node).backgroundColor,
      width: rect.width,
      height: rect.height,
    };
  });
  assert.equal(returnState.text, returnText);
  assert.equal(returnState.text.includes('←'), false);
  assert.equal(returnState.icon, true);
  assert.equal(
    returnState.focused,
    true,
    'Hover preserves return-control focus',
  );
  assert.equal(returnState.background, 'rgba(0, 0, 0, 0)');
  assert.ok(returnState.width >= 44 && returnState.height >= 44);
  if (!tip) return;

  const trigger = `loc=role:button[name="查看${tip}"]`;
  const dialog = `loc=role:dialog[name="${tip}"]`;
  const assertClosed = async () => {
    await page.waitForSelector(dialog, { state: 'hidden' });
    await page.waitForFunction(
      (text) => !document.body.innerText.includes(text),
      explanation,
    );
    assert.equal(
      await page.evaluate(
        (text) => document.body.innerText.includes(text),
        explanation,
      ),
      false,
      'Closed tip keeps its secondary explanation out of the visible page',
    );
  };
  await assertClosed();
  const triggerState = await page.evaluate((label) => {
    const node = document.querySelector(`button[aria-label="查看${label}"]`);
    const rect = node.getBoundingClientRect();
    return {
      popup: node.getAttribute('aria-haspopup'),
      width: rect.width,
      height: rect.height,
    };
  }, tip);
  assert.equal(triggerState.popup, 'dialog');
  assert.ok(triggerState.width >= 44 && triggerState.height >= 44);
  for (const method of ['pointer', 'keyboard']) {
    if (method === 'pointer') await page.click(trigger);
    else {
      await page.focus(trigger);
      await page.keyboard.press('Enter');
    }
    await page.waitForSelector(dialog);
    const popup = await page.evaluate(
      ({ label, text }) => {
        const node = document.querySelector(
          `[role="dialog"][aria-label="${label}"]`,
        );
        const rect = node.getBoundingClientRect();
        return {
          explanation: node.innerText.includes(text),
          insideViewport:
            rect.left >= 0 &&
            rect.right <= innerWidth &&
            rect.top >= 0 &&
            rect.bottom <= innerHeight,
          overflow: node.scrollWidth > node.clientWidth,
        };
      },
      { label: tip, text: explanation },
    );
    assert.equal(popup.explanation, true);
    assert.equal(
      popup.insideViewport,
      true,
      `${method} tip stays inside viewport`,
    );
    assert.equal(popup.overflow, false);
    await page.keyboard.press('Escape');
    await assertClosed();
    await page.waitForFunction(
      (label) =>
        document.activeElement?.getAttribute('aria-label') === `查看${label}`,
      tip,
    );
  }
}
