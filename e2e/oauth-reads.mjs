import assert from 'node:assert/strict';
import { oauthFault } from './oauth-transport.mjs';
import { setTheme } from './browser-geometry.mjs';

export async function verifyOAuthReads(page, config, report, ui) {
  for (const [path, root, disabledAction, retry] of [
    [
      '/api/settings/github',
      'oauth-settings',
      'account-github-config',
      'oauth-settings-reload',
    ],
    [
      '/api/account/github',
      'account-github',
      'account-github-unlink',
      'account-github-reload',
    ],
  ]) {
    const loading = await oauthFault(page, {
      path,
      method: 'GET',
      hold: true,
      reload: true,
    });
    try {
      await page.reload();
      assert.equal((await loading.result()).status, 200);
      await page.waitForSelector(
        `[data-testid="${root}"][data-state="loading"]`,
      );
      for (const theme of ['light', 'dark']) {
        await setTheme(page, theme);
        await ui.geometry(`${root}-loading-${theme}`);
      }
      await loading.release();
      await ui.ready();
    } finally {
      await loading.dispose();
    }
    const error = await oauthFault(page, {
      path,
      method: 'GET',
      lose: true,
      reload: true,
    });
    try {
      await page.reload();
      assert.equal((await error.result()).status, 200);
      await page.waitForSelector(`[data-testid="${root}"][data-state="error"]`);
      assert.equal(
        await page.evaluate(
          (id) => document.querySelector(`[data-testid="${id}"]`) === null,
          disabledAction,
        ),
        true,
        'A failed read does not allow editing or unlinking stale data',
      );
      assert.equal(
        await page.evaluate((root) => {
          const other = document.querySelector(
            `[data-testid="${root === 'oauth-settings' ? 'account-github' : 'oauth-settings'}"]`,
          );
          return ['ready', 'bound', 'unbound'].includes(other?.dataset.state);
        }, root),
        true,
        'A failed section read does not replace the other successfully read section',
      );
      for (const theme of ['light', 'dark']) {
        await setTheme(page, theme);
        await ui.geometry(`${root}-read-error-${theme}`);
      }
    } finally {
      await error.dispose();
    }
    await page.click(`[data-testid="${retry}"]`);
    await ui.ready();
  }
  await setTheme(page, 'light');
  report.checks.push(
    'Held real settings and binding reads show their independent loading states; lost real read responses expose errors and prevent stale editing/actions; the other section remains available; the owning Retry action recovers through a real read.',
  );
}
