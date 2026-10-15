import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { identitySql } from './identity-session.mjs';
import { resizeViewport } from './browser-geometry.mjs';
import { uploadSettingsTools } from './upload-settings-helpers.mjs';

/** Real product writes affect only the browser runner's disposable database. */
export async function runUiux20261015Settings(page, config) {
  const report = { checks: [], screenshots: [], injectedStates: [] };
  const limits = await uploadSettingsTools(page, config, report);
  async function api(path, method = 'GET', body) {
    const response = await page.fetch(path, {
      method,
      ...(body === undefined
        ? {}
        : {
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          }),
    });
    assert.ok(
      response.ok,
      `${method} ${path}: ${response.status} ${response.body}`,
    );
    return response.body ? JSON.parse(response.body) : null;
  }
  async function shot(name, width) {
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        document
          .getAnimations()
          .filter(
            (animation) =>
              typeof animation.effect?.getTiming().duration === 'number' &&
              animation.effect.getTiming().iterations !== Infinity,
          )
          .map((animation) => animation.finished.catch(() => {})),
      );
    });
    const file = `uiux-20261015-${name}-${width}.png`;
    await page.screenshot({ path: join(config.output, file) });
    report.screenshots.push(file);
  }
  const originalLimits = await api('/api/settings/upload');
  const originalSite = await api('/api/settings/site');
  const originalGithub = await identitySql(
    config,
    'SELECT * FROM identity_github_settings WHERE id=1',
  );
  const albums = [];
  const previews = new Set();
  try {
    for (const width of [1440, 390]) {
      await resizeViewport(page, width);
      const { album } = await api('/api/albums', 'POST', {
        name: `原型确认-${width}-${randomUUID().slice(0, 6)}`,
      });
      albums.push(album.id);
      await page.goto(`${config.origin}/shares/${album.id}`);
      await page.waitForSelector('[data-testid="share-create"]');
      assert.equal(
        await page.evaluate(
          () =>
            document.querySelector('input[aria-label="显示图片名称"]').checked,
        ),
        false,
      );
      await page.click(
        '[data-slot="switch-content"]:has(input[aria-label="显示图片名称"])',
      );
      assert.equal(
        (await api(`/api/albums/${album.id}/share`)).share,
        null,
        'Editing the switch does not create a share',
      );
      await page.click('button[form="share-create-form"]');
      await page.waitForSelector('[data-testid="share-address"]');
      assert.equal(
        (await api(`/api/albums/${album.id}/share`)).share.showName,
        true,
      );
      assert.equal(
        await page.evaluate(
          () =>
            document.querySelector('input[aria-label="显示图片名称"]').checked,
        ),
        true,
      );
      await page.click(
        '[data-slot="switch-content"]:has(input[aria-label="显示图片名称"])',
      );
      await page.click('[data-testid="share-save-display"]');
      await page.waitForFunction(
        async (id) =>
          (await (await fetch(`/api/albums/${id}/share`)).json()).share
            .showName === false,
        album.id,
      );
      await shot('share-name', width);
      report.checks.push({
        id: 'R03',
        width,
        result:
          'Same positive switch semantics before creation and after display save; default remains off.',
      });

      await api('/api/settings/github', 'PATCH', {
        enabled: false,
        clientId: 'uiux-20261015-client',
        clientSecret: 'uiux-disposable-secret',
      });
      await page.goto(`${config.origin}/settings/account`);
      await page.waitForSelector('[data-testid="account-github-config"]');
      const effective = (await api('/api/settings/github')).effective;
      await page.click('[data-testid="account-github-config"]');
      await page.click('[data-testid="oauth-secret-clear"]');
      await page.waitForSelector('[data-testid="oauth-clear-dialog"]');
      assert.equal(
        await page.evaluate(() =>
          document
            .querySelector('[data-testid="oauth-secret-clear-confirm"]')
            .textContent.trim(),
        ),
        '标记清除',
      );
      await page.click('[data-testid="oauth-secret-clear-confirm"]');
      await page.waitForFunction(() =>
        document
          .querySelector('[data-testid="oauth-secret-status"]')
          .textContent.includes('待保存：清除密钥并停用 GitHub 登录'),
      );
      assert.equal(
        (await api('/api/settings/github')).saved.hasSecret,
        true,
        'Marking does not submit a clearing request',
      );
      await shot('github-marked', width);
      await page.click('[data-testid="oauth-close"]');
      assert.equal(
        (await api('/api/settings/github')).saved.hasSecret,
        true,
        'Cancelling preserves the existing credential',
      );
      await page.click('[data-testid="account-github-config"]');
      await page.click('[data-testid="oauth-secret-clear"]');
      await page.click('[data-testid="oauth-secret-clear-confirm"]');
      await page.click('[data-testid="oauth-save"]');
      await page.waitForSelector('[data-testid="oauth-page"]', {
        state: 'hidden',
      });
      const cleared = await api('/api/settings/github');
      assert.equal(cleared.saved.hasSecret, false);
      assert.equal(cleared.saved.enabled, false);
      assert.deepEqual(
        cleared.effective,
        effective,
        'Saving does not change the running OAuth configuration',
      );
      report.checks.push({
        id: 'R04',
        width,
        result:
          'Mark/cancel never clear saved credentials; outer save clears only saved state and preserves effective state.',
      });

      await page.goto(`${config.origin}/settings/general`);
      await page.waitForSelector(
        '[data-testid="upload-limits-editor"][data-state="ready"]',
      );
      const geometry = await page.evaluate(() =>
        [...document.querySelectorAll('#upload-limits-form [data-field]')].map(
          (node) => {
            const rect = node.getBoundingClientRect();
            return {
              top: rect.top,
              left: rect.left,
              width: rect.width,
              controlHeight: node
                .querySelector('[data-slot="number-field-group"]')
                .getBoundingClientRect().height,
              inputHeight: node.querySelector('input').getBoundingClientRect()
                .height,
            };
          },
        ),
      );
      assert.equal(geometry.length, 3);
      if (width >= 1200)
        assert.ok(
          geometry.every((row) => Math.abs(row.top - geometry[0].top) < 1),
          'Desktop short fields share one row',
        );
      else
        assert.ok(
          geometry[0].top < geometry[1].top &&
            geometry[1].top < geometry[2].top,
          'Mobile fields stay in one column',
        );
      assert.ok(geometry.every((row) => row.controlHeight >= 47.9));
      assert.ok(geometry.every((row) => row.inputHeight >= 44));
      await limits.fill({ maxFileMiB: 0 });
      await page.click('[data-testid="upload-limits-save"]');
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-field="maxFileMiB"]')
            .getAttribute('data-invalid') === 'true',
      );
      assert.equal(
        (await api('/api/settings/upload')).maxFileMiB,
        originalLimits.maxFileMiB,
      );
      const nextLimit = originalLimits.maxFileMiB === 61 ? 62 : 61;
      await limits.fill({ maxFileMiB: nextLimit });
      await page.fill('input[name="name"]', '尚未保存的站点草稿');
      await page.click('[data-testid="upload-limits-save"]');
      await page.waitForFunction(
        async (expected) =>
          (await (await fetch('/api/settings/upload')).json()).maxFileMiB ===
          expected,
        nextLimit,
      );
      assert.equal(
        (await api('/api/settings/site')).name,
        originalSite.name,
        'Saving limits does not submit site changes',
      );
      assert.equal(
        await page.evaluate(
          () => document.querySelector('input[name="name"]').value,
        ),
        '尚未保存的站点草稿',
      );
      await shot('upload-limits', width);
      // Remove this unsaved site draft before leaving; the product's leave guard stays intact.
      await page.fill('input[name="name"]', originalSite.name);
      await api('/api/settings/upload', 'PATCH', {
        maxFileMiB: originalLimits.maxFileMiB,
        batchSize: originalLimits.batchSize,
        queueLimit: originalLimits.queueLimit,
      });
      report.checks.push({
        id: 'R10',
        width,
        geometry,
        result:
          'Responsive columns, field validation, 48px input, and independent save verified.',
      });

      await page.goto(`${config.origin}/settings/processing`);
      await page.waitForSelector(
        '[data-testid="processing-editor"][data-state="ready"]',
      );
      await page.click('[data-testid="processing-preview-open"]');
      await page.setInputFiles('[data-testid="processing-preview-file"]', [
        join(
          config.projectDirectory,
          'tests/fixtures/media-formats/source.png',
        ),
      ]);
      // Explicit presentation/transport injections around actual successful POSTs.
      // The real job IDs are kept solely to clean up this suite's temporary previews.
      await page.evaluate(() => {
        const original = window.fetch;
        window.__uiuxPreviewOriginal = original;
        window.__uiuxPreviewMode = 'queued';
        window.__uiuxPreviewIds = [];
        window.fetch = async (...args) => {
          const path = new URL(
            args[0] instanceof Request ? args[0].url : String(args[0]),
            location.origin,
          ).pathname;
          const method =
            args[1]?.method ||
            (args[0] instanceof Request ? args[0].method : 'GET');
          const response = await original(...args);
          if (
            path === '/api/media/previews' &&
            method === 'POST' &&
            response.ok
          ) {
            const record = await response.clone().json();
            window.__uiuxPreviewIds.push(record.id);
            if (window.__uiuxPreviewMode === 'unknown')
              throw new TypeError('验收注入：预览响应中断');
            if (window.__uiuxPreviewMode === 'queued')
              return Response.json({
                ...record,
                status: 'queued',
                result: null,
                resultUrl: null,
              });
          }
          if (
            /^\/api\/media\/previews\/[^/]+$/.test(path) &&
            method === 'GET' &&
            window.__uiuxPreviewMode === 'queued' &&
            response.ok
          ) {
            const record = await response.clone().json();
            return Response.json({
              ...record,
              status: 'queued',
              result: null,
              resultUrl: null,
            });
          }
          return response;
        };
      });
      await page.click('[data-testid="processing-preview-create"]');
      await page.waitForFunction(() =>
        document
          .querySelector('[data-testid="processing-preview"]')
          .textContent.includes('排队等待生成预览…'),
      );
      await shot('preview-queued', width);
      await page.evaluate(() => {
        window.__uiuxPreviewMode = 'normal';
      });
      await page.waitForSelector('[data-testid="processing-preview-result"]', {
        timeout: 20000,
      });
      await page.evaluate(() => {
        window.__uiuxPreviewMode = 'unknown';
      });
      await page.click('[data-testid="processing-preview-create"]');
      await page.waitForSelector(
        '[data-testid="processing-preview"][data-state="create-unknown"]',
      );
      assert.ok(
        await page.evaluate(() =>
          document
            .querySelector('[data-testid="processing-preview"]')
            .textContent.includes('暂时无法确认预览是否已生成。'),
        ),
      );
      await page.click('summary:has-text("诊断详情")');
      assert.ok(
        await page.evaluate(
          () =>
            document
              .querySelector('[data-testid="processing-preview"] summary')
              .getBoundingClientRect().height >= 44,
        ),
        'Diagnostic disclosure keeps a 44px touch target',
      );
      assert.ok(
        await page.evaluate(() =>
          document
            .querySelector('[data-testid="processing-preview"]')
            .innerText.includes('未收到可查询的预览 ID'),
        ),
      );
      await page.waitForSelector('[data-testid="processing-preview-recreate"]');
      await shot('preview-unknown', width);
      for (const id of await page.evaluate(() => window.__uiuxPreviewIds))
        previews.add(id);
      await page.evaluate(() => {
        window.fetch = window.__uiuxPreviewOriginal;
      });
      report.checks.push({
        id: 'R12',
        width,
        result:
          'Queued copy, unknown-first message, diagnostic detail, and existing recreate action verified.',
      });
      report.injectedStates.push({
        width,
        states: [
          'queued presentation around real job',
          'lost successful POST response',
        ],
      });
    }
    return report;
  } finally {
    await page.evaluate(() => {
      if (window.__uiuxPreviewOriginal)
        window.fetch = window.__uiuxPreviewOriginal;
    });
    for (const id of previews) await api(`/api/media/previews/${id}`, 'DELETE');
    for (const id of albums) await api(`/api/albums/${id}`, 'DELETE');
    await api('/api/settings/upload', 'PATCH', {
      maxFileMiB: originalLimits.maxFileMiB,
      batchSize: originalLimits.batchSize,
      queueLimit: originalLimits.queueLimit,
    });
    const row = originalGithub[0];
    const literal = (value) =>
      value === null
        ? 'NULL'
        : typeof value === 'number'
          ? String(value)
          : `'${String(value).replaceAll("'", "''")}'`;
    if (row)
      await identitySql(
        config,
        `INSERT OR REPLACE INTO identity_github_settings (${Object.keys(row).join(',')}) VALUES (${Object.values(row).map(literal).join(',')})`,
      );
    else
      await identitySql(
        config,
        'DELETE FROM identity_github_settings WHERE id=1',
      );
  }
}
