import assert from 'node:assert/strict';
import { editableSite, field, button } from './site-general-helpers.mjs';
import {
  uploadSettingsTools,
  limitsField,
  limitsId,
  limitsInput,
} from './upload-settings-helpers.mjs';
import { resizeViewport, setTheme } from './browser-geometry.mjs';
import {
  prepareSiteGeneralHistory,
  verifySiteGeneralBack,
} from './site-general-history.mjs';

const leaveDialog = 'loc=role:dialog[name="放弃未保存的修改?"]';

// Observe real writes and the streamed refresh without changing requests,
// responses or the server's saved values.
async function monitor(page) {
  await page.evaluate(() => {
    const original = window.fetch;
    window.__generalMerge = { original, requests: [] };
    window.fetch = async (...args) => {
      const url = new URL(
        args[0] instanceof Request ? args[0].url : String(args[0]),
        location.href,
      );
      const method = (
        args[1]?.method ?? (args[0] instanceof Request ? args[0].method : 'GET')
      ).toUpperCase();
      const refresh =
        url.pathname === '/settings/general' && url.searchParams.has('_rsc');
      const relevant =
        refresh ||
        ['/api/settings/site', '/api/settings/upload'].includes(url.pathname);
      const record = relevant
        ? {
            path: url.pathname,
            method,
            refresh,
            ...(typeof args[1]?.body === 'string'
              ? { body: JSON.parse(args[1].body) }
              : {}),
          }
        : null;
      if (record) window.__generalMerge.requests.push(record);
      const response = await original(...args);
      if (record) {
        record.status = response.status;
        if (refresh) record.contentType = response.headers.get('content-type');
        if (refresh)
          void response
            .clone()
            .text()
            .then(() => {
              record.complete = true;
            });
      }
      return response;
    };
  });
}

const observed = (page) => page.evaluate(() => window.__generalMerge.requests);

async function stopMonitor(page) {
  await page.evaluate(() => {
    if (!window.__generalMerge) return;
    window.fetch = window.__generalMerge.original;
    delete window.__generalMerge;
  });
}

export async function verifyGeneralSettingsMerge(page, config, site, report) {
  const upload = await uploadSettingsTools(page, config, report);
  const originalSite = editableSite(await site.read());
  const originalUpload = await upload.request('/api/settings/upload');
  report.generalMerge = [];
  async function open() {
    await upload.open();
    await site.state('ready');
    await page.waitForFunction(
      () => !document.querySelector('#site-save').disabled,
    );
  }
  async function values() {
    return { site: await site.values(), upload: await upload.inputs() };
  }
  async function leaveForStorage() {
    // Finishing NumberField editing before keyboard navigation avoids turning
    // Ego's automatic wheel-to-link scroll into an intentional numeric edit.
    // React Aria supports wheel changes while a NumberField has focus.
    await page.focus('main a[href="/settings/storage"]');
    await page.waitForFunction(
      () =>
        document.activeElement ===
        document.querySelector('main a[href="/settings/storage"]'),
    );
    await page.keyboard.press('Enter');
    await page.waitForSelector(leaveDialog);
  }
  async function save(selector) {
    const previous = (await observed(page)).filter(
      (request) => request.method === 'PATCH',
    ).length;
    await page.focus(selector);
    await page.keyboard.press('Enter');
    await page.waitForFunction((previous) => {
      const patches = window.__generalMerge.requests.filter(
        (request) => request.method === 'PATCH',
      );
      return (
        patches.length === previous + 1 &&
        patches.at(-1).status === 200 &&
        !document.querySelector('#site-save').disabled &&
        !document.querySelector('[data-testid="upload-limits-save"]').disabled
      );
    }, previous);
  }
  try {
    for (const [width, theme] of [
      [1440, 'light'],
      [390, 'dark'],
    ]) {
      await open();
      await resizeViewport(page, width);
      await setTheme(page, theme);
      const forms = await page.evaluate(() => ({
        site: document.querySelectorAll('#site-settings-form').length,
        upload: document.querySelectorAll('#upload-limits-form').length,
        actions: [
          ...document.querySelectorAll('.shell-footer button[type="submit"]'),
        ].map((node) => ({
          form: node.getAttribute('form'),
          text: node.textContent.trim(),
        })),
        nested: !!document.querySelector('form form'),
      }));
      assert.deepEqual(forms, {
        site: 1,
        upload: 1,
        actions: [
          { form: 'site-settings-form', text: '保存站点信息' },
          { form: 'upload-limits-form', text: '保存上传限制' },
        ],
        nested: false,
      });
      await upload.evidence('general-merged', width, theme);
      await monitor(page);
      try {
        const savedUpload = await upload.request('/api/settings/upload');
        await site.fill({ description: `联合保存站点 ${width}` });
        await upload.fill({ maxFileMiB: 57, batchSize: 21, queueLimit: 501 });
        const draft = await values();
        await save(field('description'));
        await page.waitForFunction(() =>
          window.__generalMerge.requests.some(
            (request) =>
              request.refresh && request.status === 200 && request.complete,
          ),
        );
        await page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        );
        assert.deepEqual(
          await values(),
          draft,
          'Site save and actual router refresh preserve the upload draft',
        );
        assert.deepEqual(editableSite(await site.read()), draft.site);
        assert.deepEqual(
          await upload.request('/api/settings/upload'),
          savedUpload,
          'Enter in the site form does not save upload limits',
        );
        const afterSite = await site.read();
        await site.fill({ description: `上传保存时保留站点草稿 ${width}` });
        const pendingSite = await site.values();
        await save(limitsField('maxFileMiB'));
        assert.deepEqual(
          await site.values(),
          pendingSite,
          'Upload save preserves the independent site draft',
        );
        assert.deepEqual(
          await site.read(),
          afterSite,
          'Enter in upload form does not save site information',
        );
        assert.deepEqual(await upload.request('/api/settings/upload'), {
          maxFileMiB: 57,
          maxFileBytes: 57 * 1048576,
          batchSize: 21,
          queueLimit: 501,
        });
        const requests = await observed(page);
        assert.ok(
          requests.some(
            (request) =>
              request.refresh &&
              request.complete &&
              request.status === 200 &&
              request.contentType?.includes('text/x-component'),
          ),
          'Site save consumed a real completed Next server-component refresh',
        );
        const patches = requests.filter(
          (request) => request.method === 'PATCH',
        );
        assert.deepEqual(
          patches.map(({ path, body, status }) => ({ path, body, status })),
          [
            { path: '/api/settings/site', body: draft.site, status: 200 },
            {
              path: '/api/settings/upload',
              body: { maxFileMiB: 57, batchSize: 21, queueLimit: 501 },
              status: 200,
            },
          ],
          'Each form sends only its owning fields and exactly one PATCH',
        );
        report.generalMerge.push({
          width,
          theme,
          forms,
          draft,
          pendingSite,
          requests,
        });
      } finally {
        await stopMonitor(page);
      }

      // A pristine site group must still protect the other group's unsaved edit.
      report.generalMergeStep = { width, operation: 'prepare real history' };
      const history = await prepareSiteGeneralHistory(page, config, site);
      await page.waitForSelector(`${limitsId('editor')}[data-state="ready"]`);
      report.generalMergeStep = {
        width,
        operation: 'resize and restore theme for history',
      };
      await resizeViewport(page, width);
      await setTheme(page, theme);
      report.generalMergeStep = {
        width,
        operation: 'fill upload-only back draft',
      };
      await upload.fill({ maxFileMiB: 58 });
      await page.focus('main a[href="/settings/storage"]');
      const backDraft = await values();
      report.generalMergeStep = { width, operation: 'verify upload-only Back' };
      await verifySiteGeneralBack(
        page,
        {
          ...site,
          values,
          read: async () => ({
            site: await site.read(),
            upload: await upload.request('/api/settings/upload'),
          }),
        },
        report,
        history,
        { discard: true },
      );
      await open();
      await upload.fill({ maxFileMiB: 58 });
      const uploadOnly = await values();
      assert.deepEqual(
        uploadOnly,
        backDraft,
        'Discarding Back never persists either group',
      );
      report.generalMergeStep = { width, operation: 'activate storage link' };
      await leaveForStorage();
      await page.click(button('继续编辑'));
      await page.waitForSelector(leaveDialog, { state: 'hidden' });
      assert.deepEqual(await values(), uploadOnly);
      assert.equal(new URL(await page.url()).pathname, '/settings/general');
      await site.fill({ description: `取消联合离开保留两组 ${width}` });
      const both = await values();
      report.generalMergeStep = { width, operation: 'activate storage link' };
      await leaveForStorage();
      await page.click(button('继续编辑'));
      await page.waitForSelector(leaveDialog, { state: 'hidden' });
      assert.deepEqual(await values(), both);
      const persistedSite = await site.read();
      const persistedUpload = await upload.request('/api/settings/upload');
      report.generalMergeStep = { width, operation: 'activate storage link' };
      await leaveForStorage();
      await page.click(button('放弃修改'));
      await page.waitForURL(`${config.origin}/settings/storage`);
      assert.deepEqual(await site.read(), persistedSite);
      assert.deepEqual(
        await upload.request('/api/settings/upload'),
        persistedUpload,
      );
      report.generalMerge.push({
        width,
        theme,
        navigation: {
          input: 'keyboard link activation after committed blur',
          back: {
            draft: backDraft,
            target: history.target,
            current: history.current,
          },
          uploadOnly,
          both,
          destination: '/settings/storage',
        },
      });

      for (const source of ['site', 'upload']) {
        report.generalMergeStep = { width, operation: `expire ${source}` };
        await open();
        report.generalMergeStep = { width, operation: `fill site ${source}` };
        await site.fill({ description: `失效保留 ${source} ${width}` });
        report.generalMergeStep = { width, operation: `fill upload ${source}` };
        await upload.fill({ maxFileMiB: 59 });
        const draft = await values();
        const savedSite = await site.read();
        const savedUpload = await upload.request('/api/settings/upload');
        await monitor(page);
        try {
          await site.sql(`UPDATE session SET expires_at=${Date.now() - 1}`);
          await page.click(source === 'site' ? '#site-save' : limitsId('save'));
          report.generalMergeStep = { width, operation: `wait 401 ${source}` };
          await site.state('session');
          await page.waitForSelector(
            `${limitsId('editor')}[data-state="session"]`,
          );
          const requests = await observed(page);
          assert.deepEqual(
            requests
              .filter((request) => request.method === 'PATCH')
              .map(({ path, status }) => ({ path, status })),
            [{ path: `/api/settings/${source}`, status: 401 }],
          );
          assert.deepEqual(
            await values(),
            draft,
            'A real 401 preserves both drafts',
          );
          await site.enabled(false);
          assert.equal(
            await page.evaluate(() =>
              [
                ...document.querySelectorAll(
                  '#upload-limits-form input:not([type="hidden"]),[data-testid="upload-limits-save"]',
                ),
              ].every((node) => node.disabled),
            ),
            true,
            'A real 401 locks both groups',
          );
          assert.equal(new URL(await page.url()).pathname, '/settings/general');
          report.generalMergeStep = {
            width,
            operation: `capture expired ${source}`,
          };
          await upload.evidence(`general-expired-${source}`, width, theme);
          report.generalMerge.push({
            width,
            theme,
            source,
            expiredDraft: draft,
            requests,
          });
        } catch (error) {
          report.generalMergeFailure = await page.evaluate(() => ({
            focused: document.activeElement?.outerHTML,
            requests: window.__generalMerge?.requests,
            uploadForm: document.querySelector('#upload-limits-form')
              ?.outerHTML,
            site: document.querySelector('[data-testid="site-general"]')
              ?.dataset.state,
          }));
          throw error;
        } finally {
          await stopMonitor(page);
          await upload.authenticate();
        }
        assert.deepEqual(await site.read(), savedSite);
        assert.deepEqual(
          await upload.request('/api/settings/upload'),
          savedUpload,
        );
      }
      await site.patch(originalSite);
      await upload.request(
        '/api/settings/upload',
        'PATCH',
        limitsInput(originalUpload),
      );
    }
    report.checks.push(
      'Joint general settings at 1440 light and 390 dark: two forms/actions, isolated real PATCH/GET, site router refresh preserves upload draft, Enter submits only its own form, upload-only real browser Back confirmation/cancel/discard preserves both drafts and exact history identity, upload-only and joint dirty keyboard-link navigation cancel/discard, and real 401 from either group locks both while retaining drafts. Keyboard link activation first blurs NumberField because focused React Aria NumberFields intentionally consume wheel increments; existing module scenes retain mouse navigation coverage. Queue File release remains covered by the existing upload consumers scene.',
    );
  } finally {
    await stopMonitor(page);
    await upload.authenticate();
    await site.patch(originalSite);
    await upload.request(
      '/api/settings/upload',
      'PATCH',
      limitsInput(originalUpload),
    );
    assert.deepEqual(editableSite(await site.read()), originalSite);
    assert.deepEqual(
      await upload.request('/api/settings/upload'),
      originalUpload,
    );
    await open();
  }
}
