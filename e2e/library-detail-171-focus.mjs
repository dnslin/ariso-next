import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  image,
  workspace,
  setDetail171Theme,
  setDetail171Viewport,
} from './library-detail-171-helpers.mjs';

export async function verifyDetail171Focus(
  { page, config, report },
  imageId = image,
) {
  const endpoint = `/api/images/${imageId}`;
  for (const theme of ['light', 'dark']) {
    for (const width of [1440, 390]) {
      const script = await page.cdp('Page.addScriptToEvaluateOnNewDocument', {
        source: `(() => {
          const original = window.fetch;
          window.fetch = async (...args) => {
            if (new URL(String(args[0]), location.href).pathname !== ${JSON.stringify(endpoint)}) return original(...args);
            window.fetch = original;
            const response = await original(...args);
            await new Promise(resolve => { window.__releaseDetail171FocusRead = resolve; });
            return response;
          };
        })();`,
      });
      await page.goto(
        `${config.origin}/library?image=${imageId}&detailView=reprocess`,
      );
      await page.cdp('Page.removeScriptToEvaluateOnNewDocument', {
        identifier: script.identifier,
      });
      await page.waitForFunction(
        () =>
          typeof window.__releaseDetail171FocusRead === 'function' &&
          document.body.textContent.includes('正在读取图片详情…'),
      );
      assert.equal(
        await page.evaluate(
          () =>
            !!document.querySelector('[data-testid="detail-workspace-title"]'),
        ),
        false,
      );
      await setDetail171Theme(page, theme);
      await setDetail171Viewport(page, width);
      await page.evaluate(() => {
        window.__releaseDetail171FocusRead();
        delete window.__releaseDetail171FocusRead;
      });
      await page.waitForSelector(`${workspace} [role="radiogroup"]`);
      await page.waitForFunction(
        () =>
          document.activeElement?.dataset.testid === 'detail-workspace-title',
        undefined,
        { timeout: 3000 },
      );
      await page.evaluate(() => document.fonts.ready);
      const result = await page.evaluate(() => ({
        focused: document.activeElement?.dataset.testid,
        scrollTop: document.getElementById('main-content').scrollTop,
        overflow: document.documentElement.scrollWidth > innerWidth,
      }));
      assert.equal(result.focused, 'detail-workspace-title');
      assert.equal(result.scrollTop, 0);
      assert.equal(result.overflow, false);
      await page.screenshot({
        path: join(
          config.output,
          `detail-171-cold-focus-${theme}-${width}.png`,
        ),
      });
      report.checks.push({
        state: 'detail-171-cold-focus',
        theme,
        width,
        ...result,
      });
    }
  }
}
