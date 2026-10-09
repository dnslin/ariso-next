import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { button, quote } from './site-general-helpers.mjs';
import { resizeViewport } from './browser-geometry.mjs';
import { verifyOwnerShell } from './owner-shell.mjs';

const run = promisify(execFile);

export async function verifySiteGeneralConsumers(page, config, tools, report) {
  const original = await tools.read();
  const storage = await tools.request('/api/settings/storage');
  const defaultId = storage.defaultStorageId;
  const fixture = await tools.request('/api/storages', 'POST', {
    type: 'local',
    name: 'Issue 194 独立默认存储',
    localPath: 'issue194-consumers',
  });
  try {
    await tools.request('/api/settings/storage', 'PATCH', {
      defaultStorageId: null,
    });
    await tools.open();
    await page.waitForFunction(() =>
      [...document.querySelectorAll('main p,main span')].some(
        (node) => node.textContent.trim() === '未设置',
      ),
    );
    await tools.evidence('no-default-storage', 390, 'light');
    // Preserve TanStack's real cache across client navigation. The separate
    // storage module changes its value; returning must refetch the summary.
    await resizeViewport(page, 1440);
    await page.click('main a[href="/settings/storage"]');
    await page.waitForURL(`${config.origin}/settings/storage`);
    await tools.request('/api/settings/storage', 'PATCH', {
      defaultStorageId: fixture.id,
    });
    await page.click('.shell-navigation a[href="/settings/general"]');
    await page.waitForURL(`${config.origin}/settings/general`);
    await tools.state('ready');
    await page.waitForFunction(() =>
      document
        .querySelector('main')
        .textContent.includes('Issue 194 独立默认存储'),
    );
    await tools.sql(
      `UPDATE storage_configs SET enabled=0 WHERE id=${quote(fixture.id)}`,
    );
    await tools.open();
    await page.waitForFunction(() =>
      document
        .querySelector('main')
        .textContent.includes('Issue 194 独立默认存储（已停用）'),
    );
    assert.equal(
      (await tools.request('/api/settings/storage')).defaultStorageId,
      fixture.id,
      'Disabled default is not silently replaced',
    );
    await tools.evidence('disabled-default-storage', 390, 'dark');
  } finally {
    await tools.sql(
      `UPDATE storage_settings SET default_storage_id=${defaultId === null ? 'NULL' : quote(defaultId)} WHERE id=1`,
    );
    await tools.request(`/api/storages/${fixture.id}`, 'DELETE');
  }
  const long = `http://${Array(8).fill('long-address-for-issue194-browser-proof').join('.')}.example.test:${new URL(config.origin).port}`;
  try {
    await tools.sql(
      `UPDATE site_settings SET public_url=${quote(long)} WHERE id=1`,
    );
    await tools.open();
    for (const width of [390, 1440]) {
      await tools.evidence('long-address', width, 'light');
      const toggle = await page.evaluate(
        () =>
          [...document.querySelectorAll('button')].find(
            (node) => node.textContent.trim() === '查看完整地址',
          ) !== undefined,
      );
      if (toggle) {
        await page.click(button('查看完整地址'));
        await tools.evidence('expanded-address', width, 'light');
      }
      await page.cdp('Browser.setPermission', {
        permission: { name: 'clipboard-write' },
        setting: 'granted',
        origin: config.origin,
      });
      for (const [name, selector, expected] of [
        ['复制当前公开地址', '[data-testid="site-saved-url"]', long],
        [
          '复制 GitHub 回调地址',
          '[data-testid="site-callback-url"]',
          `${long}/api/auth/callback/github`,
        ],
      ]) {
        await page.focus(button(name));
        const before = await page.evaluate((selector) => {
          const range = document.createRange();
          range.selectNodeContents(document.querySelector(selector));
          getSelection().removeAllRanges();
          getSelection().addRange(range);
          return {
            url: location.href,
            scroll: document.querySelector('main').scrollTop,
            selection: getSelection().toString(),
            focus: document.activeElement.getAttribute('aria-label'),
          };
        }, selector);
        assert.equal(before.selection, expected);
        await page.keyboard.press('Enter');
        assert.equal(
          (await run('pbpaste', [], { encoding: 'utf8' })).stdout,
          expected,
          'Native clipboard contains the complete saved value without visual line breaks',
        );
        assert.deepEqual(
          await page.evaluate(() => ({
            url: location.href,
            scroll: document.querySelector('main').scrollTop,
            selection: getSelection().toString(),
            focus: document.activeElement.getAttribute('aria-label'),
          })),
          before,
        );
      }
      await page.evaluate(() => {
        window.__siteClipboardWrite = navigator.clipboard.writeText;
        navigator.clipboard.writeText = async () => {
          throw new DOMException(
            'Verification: Clipboard denied',
            'NotAllowedError',
          );
        };
      });
      try {
        await page.click(button('复制 GitHub 回调地址'));
        await page.waitForSelector('textarea[aria-label="完整手动复制文本"]');
        assert.equal(
          await page.evaluate(
            () =>
              document.querySelector('textarea[aria-label="完整手动复制文本"]')
                .value,
          ),
          `${long}/api/auth/callback/github`,
        );
        await tools.evidence('clipboard-denied', width, 'dark');
        await page.focus(button('选择完整文本'));
        await page.keyboard.press('Enter');
        assert.deepEqual(
          await page.evaluate(() => {
            const field = document.querySelector(
              'textarea[aria-label="完整手动复制文本"]',
            );
            return {
              focused: document.activeElement === field,
              start: field.selectionStart,
              end: field.selectionEnd,
              length: field.value.length,
            };
          }),
          {
            focused: true,
            start: 0,
            end: `${long}/api/auth/callback/github`.length,
            length: `${long}/api/auth/callback/github`.length,
          },
          'Keyboard selection exposes the complete manual fallback value',
        );
        await tools.reveal(
          'main [data-slot="textfield"]:has(textarea[aria-label="完整手动复制文本"]) + button',
          'clipboard-denied-selected',
          width,
          'light',
        );
      } finally {
        await page.evaluate(() => {
          navigator.clipboard.writeText = window.__siteClipboardWrite;
          delete window.__siteClipboardWrite;
        });
      }
      // Reload removes the preceding width's manual-copy state before the next.
      await page.reload();
      await tools.state('ready');
    }
  } finally {
    await tools.sql(
      `UPDATE site_settings SET public_url=${quote(original.publicUrl)} WHERE id=1`,
    );
  }
  await tools.open();
  for (const path of ['/settings/storage', '/settings/processing']) {
    await resizeViewport(page, 1440);
    await page.click(`main a[href="${path}"]`);
    await page.waitForURL(`${config.origin}${path}`);
    await page.waitForSelector('main h1');
    await tools.open();
  }
  await verifyOwnerShell(page, config, 'site-general-owner-shell');
  report.checks.push(
    'Empty/default-disabled storage summary uses real APIs without silently selecting another storage. Real long saved address and latest callback copy exactly to native Clipboard while page, scroll, selected text and keyboard focus stay in place; denial exposes complete manual text. Related rows navigate to implemented storage/processing pages.',
  );
}
