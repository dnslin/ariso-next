import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  tokensSignIn,
  createTokensPage,
  tokenControl,
} from '../../e2e/tokens-page.mjs';
import { verifyTokenClipboard } from '../../e2e/tokens-behavior.mjs';
import { resizeViewport, setTheme } from '../../e2e/browser-geometry.mjs';
import { waitForOwnerRoute } from '../../e2e/owner-shell.mjs';

export async function run(taskSpace) {
  const config = JSON.parse(
    await readFile(new URL('./private-config.json', import.meta.url), 'utf8'),
  );
  const task = await taskSpace(8);
  const page = task.page('p1');
  const secrets = [config.credentials.password];
  const report = {
    status: 'failed',
    taskSpaceId: task.spaceId,
    checks: [],
    layouts: [],
    screenshots: [],
    requests: [],
    business: [],
    clipboard: [],
  };
  const safe = (text) =>
    secrets.reduce(
      (value, secret) => value.replaceAll(secret, '[redacted]'),
      text,
    );
  try {
    await resizeViewport(page, 1440);
    await page.goto(`${config.origin}/settings/api`);
    await tokensSignIn(page, config, report, 1440);
    for (const mode of ['pages', 'more']) {
      await page.evaluate(
        (mode) =>
          localStorage.setItem(
            'ariso:library-preferences:v1',
            JSON.stringify({ layout: 'grid', loadingMode: mode }),
          ),
        mode,
      );
      await page.goto(`${config.origin}/library`);
      await waitForOwnerRoute(page, config, '/library');
      assert.equal(
        await page.url(),
        `${config.origin}/library${mode === 'pages' ? '?page=1' : ''}`,
      );
      report.checks.push({
        scenario: 'exact-library-route',
        loadingMode: mode,
        passed: true,
      });
    }
    for (const width of [1440, 390]) {
      config.width = width;
      await resizeViewport(page, width);
      await page.goto(`${config.origin}/settings/api`);
      await page.waitForSelector(
        '[data-testid="api-page"][data-state="ready"]',
      );
      await setTheme(page, 'light');
      const ui = createTokensPage(page, config, report);
      await page.focus('loc=role:button[name="时间与记录说明"]');
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      if (width < 640) await page.keyboard.press('Enter');
      await page.waitForFunction(
        (zone) =>
          document.body.textContent.includes(`时间按站点时区 ${zone} 显示。`),
        config.tokensTimeZone,
      );
      report.checks.push({
        scenario: 'native-time-info-focus',
        width,
        passed: true,
      });
      await page.keyboard.press('Escape');
      await ui.openCreate(`历史修复验证 ${width}`);
      await page.click(tokenControl('create-submit'));
      const key = await ui.secret();
      secrets.push(key);
      await verifyTokenClipboard(page, ui, report, width, key);
      await ui.dismissNotifications();
      await page.focus(tokenControl('secret-close'));
      await page.keyboard.press('Enter');
      await page.waitForSelector('[data-testid="api-close-confirm"]');
      await ui.screenshot('close-warning', width);
      const reachable = await page.evaluate(() => {
        const node = document.querySelector(
          '[data-testid="api-confirm-close"]',
        );
        const rect = node.getBoundingClientRect();
        return node.contains(
          document.elementFromPoint(
            rect.x + rect.width / 2,
            rect.y + rect.height / 2,
          ),
        );
      });
      assert.equal(reachable, true);
      await page.focus(tokenControl('confirm-close'));
      await page.keyboard.press('Enter');
      await page.waitForSelector('[data-testid="api-create-dialog"]', {
        state: 'hidden',
      });
      report.checks.push({
        scenario: 'close-warning-overlay',
        width,
        passed: true,
      });
    }
    report.status = 'passed';
    await task.finish({ keep: [] });
  } catch (error) {
    report.error = safe(error.stack ?? String(error));
  }
  await writeFile(
    join(config.output, 'affected-browser.json'),
    safe(JSON.stringify(report, null, 2)) + '\n',
  );
  console.log({
    status: report.status,
    taskSpaceId: task.spaceId,
    report: join(config.output, 'affected-browser.json'),
  });
  if (report.error) throw new Error(report.error);
}
