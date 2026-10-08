import assert from 'node:assert/strict';
import { join } from 'node:path';
import { limitsId } from './upload-settings-helpers.mjs';
import { resizeViewport, setTheme } from './browser-geometry.mjs';
import { uploadSettingsLifecycle } from './upload-settings-lifecycle.mjs';

export async function uploadSettingsConsumers(page, config, tools, report) {
  await uploadSettingsLifecycle(page, config, tools, report);
  for (const width of [1440, 390]) {
    await resizeViewport(page, width);
    for (const theme of ['light', 'dark']) {
      await setTheme(page, theme);
      for (const route of ['general', 'processing', 'account', 'api']) {
        await page.goto(`${config.origin}/settings/${route}`);
        await page.waitForSelector('.shell-content');
        await page.waitForFunction(() => document.fonts.status === 'loaded');
        const categories = await page.evaluate(
          (route) => ({
            selected:
              innerWidth >= 1200
                ? document.querySelector('[role="tab"][aria-selected="true"]')
                    ?.textContent
                : document.querySelector(
                    '.settings-mobile [data-slot="select-value"]',
                  )?.textContent,
            all: [
              ...document.querySelectorAll('.settings-desktop [role="tab"]'),
            ].map((node) => node.textContent.trim()),
            heading: document.querySelector('h1')?.textContent,
            current: document
              .querySelector('.shell-navigation a[aria-current="page"]')
              ?.getAttribute('href'),
            expected: route,
          }),
          route,
        );
        assert.equal(categories.heading?.trim(), '站点设置');
        assert.deepEqual(categories.all, [
          '基本设置',
          '图片处理',
          '账号与安全',
          '上传 API',
        ]);
        assert.equal(
          categories.selected?.trim(),
          {
            general: '基本设置',
            processing: '图片处理',
            account: '账号与安全',
            api: '上传 API',
          }[route],
        );
        if (width === 1440)
          assert.equal(categories.current, '/settings/general');
        await tools.evidence(`consumer-${route}`, width, theme);
      }
    }
  }
  await resizeViewport(page, 1440);
  await page.goto(`${config.origin}/upload`);
  await page.waitForSelector('[data-testid="upload-picker"]');
  await page.evaluate(() => {
    window.__limitsFiles = [];
    window.__limitsUrls = [];
    const create = URL.createObjectURL;
    const revoke = URL.revokeObjectURL;
    URL.createObjectURL = (file) => {
      window.__limitsFiles.push(new WeakRef(file));
      const url = create(file);
      window.__limitsUrls.push({ url, revoked: false });
      return url;
    };
    URL.revokeObjectURL = (url) => {
      const entry = window.__limitsUrls.find((item) => item.url === url);
      if (entry) entry.revoked = true;
      revoke(url);
    };
  });
  await page.setInputFiles('input[aria-label="选择图片文件"]', [
    join(config.projectDirectory, 'tests/fixtures/media-formats/source.png'),
  ]);
  await page.waitForSelector(
    '[data-testid="upload-item"][data-state="queued"]',
  );
  const queueIds = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="upload-item"]')].map(
        (node) => node.dataset.queueId,
      ),
    );
  const ids = await queueIds();
  assert.equal(ids.length, 1);
  assert.ok(ids.every((id) => typeof id === 'string' && id.length > 0));
  await page.click('a[aria-label="站点设置"]');
  await page.waitForSelector(`${limitsId('editor')}[data-state="ready"]`);
  await tools.monitor();
  await tools.fill({ maxFileMiB: 2, batchSize: 2, queueLimit: 101 });
  await tools.save();
  await page.click('a[aria-label="上传"]');
  await page.waitForSelector(
    '[data-testid="upload-item"][data-state="queued"]',
  );
  const afterIds = await queueIds();
  assert.deepEqual(afterIds, ids, 'Saving limits retains the same queued item');
  report.queueContinuity = { beforeIds: ids, afterIds };
  const updated = await tools.request('/upload/settings');
  assert.equal(updated.maxFileBytes, 2 * 1048576);
  assert.equal(updated.batchSize, 2);
  assert.equal(updated.queueLimit, 101);
  await page.click('a[aria-label="站点设置"]');
  await page.waitForSelector(`${limitsId('editor')}[data-state="ready"]`);
  await tools.monitor();
  await tools.fill({ maxFileMiB: 3 });
  await tools.sql(`UPDATE session SET expires_at=${Date.now() - 1}`);
  await page.click(limitsId('save'));
  await page.waitForSelector(`${limitsId('editor')}[data-state="session"]`);
  assert.equal((await tools.inputs()).maxFileMiB, '3');
  assert.equal(
    (await tools.browser()).requests.find((r) => r.method === 'PATCH').status,
    401,
  );
  assert.equal(new URL(await page.url()).pathname, '/settings/general');
  assert.equal(
    await page.evaluate(
      () =>
        window.__limitsUrls.length > 0 &&
        window.__limitsUrls.every((item) => item.revoked),
    ),
    true,
    'Confirmed expiry immediately revokes queued previews',
  );
  await page.cdp('HeapProfiler.collectGarbage');
  assert.equal(
    await page.evaluate(
      () => window.__limitsFiles.filter((ref) => ref.deref()).length,
    ),
    0,
    'Confirmed expiry releases queued Files',
  );
  for (const width of [1440, 390])
    await tools.evidence('session-expired', width, 'dark');
  await tools.authenticate();
  await tools.open();
  assert.equal(
    (await tools.inputs()).maxFileMiB,
    '2',
    'Refused edit was not saved',
  );
  report.checks.push(
    'All four settings consumers share navigation in both themes; client navigation preserves queue; real 401 retains form and releases queue Files/URLs',
  );
}
