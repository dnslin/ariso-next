import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import {
  captureCorsDialog,
  settleCorsScreenshot,
  verifyCopiedCorsExample,
} from './storage-cors-layout.mjs';

async function changeSiteOrigin(config, origin) {
  await promisify(execFile)(
    config.nodeExecutable,
    [
      '--input-type=module',
      '-e',
      `
    import { openRuntimeDatabase } from './src/server/runtime/db.ts';
    import { requireSiteSettings, updateSiteSettings } from './src/server/site/settings.ts';
    import { siteSettingsInputSchema } from './src/server/site/validation.ts';
    import { invalidateS3Cors } from './src/server/storage/cors.ts';
    const connection = openRuntimeDatabase(process.argv[1]);
    try {
      connection.db.transaction(tx => {
        const current = requireSiteSettings(tx);
        const input = siteSettingsInputSchema.parse({publicUrl: process.argv[2], timeZone: current.timeZone});
        updateSiteSettings(tx, input);
        invalidateS3Cors(tx);
      });
    } finally { connection.close(); }
  `,
      config.databasePath,
      origin,
    ],
    { cwd: config.projectDirectory },
  );
}

export async function verifyLongCorsOrigin(page, config, storageId, report) {
  const longOrigin = `${new URL(config.origin).protocol}//${'cors-'.repeat(10)}source.${'long-'.repeat(10)}example.test`;
  await changeSiteOrigin(config, longOrigin);
  try {
    await page.goto(`${config.origin}/settings/storage/${storageId}/cors`);
    await page.waitForSelector(
      '[data-testid="storage-cors"][data-state="invalidated"]',
    );
    await page.click('loc=role:button[name="查看 CORS 示例"]');
    await page.waitForSelector('textarea[aria-label="CORS 配置 JSON"]');
    await page.focus('textarea[aria-label="CORS 配置 JSON"]');
    await page.keyboard.press('ControlOrMeta+A');
    const content = await page.evaluate(() => {
      const text = document.querySelector(
        'textarea[aria-label="CORS 配置 JSON"]',
      );
      return {
        value: text.value,
        selected:
          text.selectionStart === 0 && text.selectionEnd === text.value.length,
      };
    });
    assert.equal(JSON.parse(content.value)[0].AllowedOrigins[0], longOrigin);
    assert.equal(content.selected, true);
    await captureCorsDialog(page, config, 'long-origin-example', report);
    await page.cdp('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 480,
      mobile: true,
      deviceScaleFactor: 1,
    });
    await page.click('loc=role:button[name="复制 CORS 示例"]');
    await page.waitForFunction(() =>
      document.body.textContent.includes('已复制到剪贴板'),
    );
    await verifyCopiedCorsExample(page, report);
    await settleCorsScreenshot(page);
    const geometry = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const bounds = dialog.getBoundingClientRect();
      const field = dialog.querySelector('textarea');
      const footer = dialog.querySelector('[data-slot="modal-footer"]');
      const body = dialog.querySelector('[data-slot="modal-body"]');
      const bodyBounds = body.getBoundingClientRect();
      const fieldBounds = field.getBoundingClientRect();
      const footerBounds = footer.getBoundingClientRect();
      return {
        scrollWidth: document.documentElement.scrollWidth,
        top: bounds.top,
        bottom: bounds.bottom,
        fieldBottom: fieldBounds.bottom,
        footerTop: footerBounds.top,
        fieldHeight: fieldBounds.height,
        fieldScrollHeight: field.scrollHeight,
        body: {
          top: bodyBounds.top,
          bottom: bodyBounds.bottom,
          left: bodyBounds.left,
          width: bodyBounds.width,
          height: bodyBounds.height,
          overflowY: getComputedStyle(body).overflowY,
          clientHeight: body.clientHeight,
          scrollHeight: body.scrollHeight,
        },
      };
    });
    assert.ok(
      geometry.scrollWidth <= 390 &&
        geometry.top >= 0 &&
        geometry.bottom <= 481,
    );
    await page.screenshot({
      path: join(config.output, 'cors-long-origin-example-short-390.png'),
    });
    report.longOriginGeometry = geometry;
    assert.ok(
      geometry.body.bottom <= geometry.footerTop &&
        ['auto', 'scroll'].includes(geometry.body.overflowY),
      'Long JSON content must be clipped inside a scrollable body above the footer',
    );
    await page.focus('textarea[aria-label="CORS 配置 JSON"]');
    await page.keyboard.press('ControlOrMeta+A');
    assert.equal(
      await page.evaluate(() => {
        const field = document.querySelector('textarea');
        return (
          field.selectionStart === 0 &&
          field.selectionEnd === field.value.length
        );
      }),
      true,
    );
    await page.mouse.move(
      geometry.body.left + geometry.body.width / 2,
      geometry.body.top + geometry.body.height / 2,
    );
    await page.mouse.wheel(0, geometry.body.scrollHeight);
    await page.waitForFunction(() => {
      const body = document.querySelector('[data-slot="modal-body"]');
      return body.scrollTop + body.clientHeight >= body.scrollHeight - 1;
    });
    report.longOriginScroll = await page.evaluate(() => {
      const body = document.querySelector('[data-slot="modal-body"]');
      return {
        scrollTop: body.scrollTop,
        clientHeight: body.clientHeight,
        scrollHeight: body.scrollHeight,
      };
    });
    await page.screenshot({
      path: join(
        config.output,
        'cors-long-origin-example-short-scrolled-390.png',
      ),
    });
    await page.click('loc=role:button[name="返回直传设置"]');
    await page.waitForSelector('[role="dialog"]', { state: 'hidden' });
    report.checks.push(
      'A real transactional site-origin update invalidates CORS; a long valid origin remains complete in selectable/copyable JSON and usable at 390×480; no request is made to the synthetic domain',
    );
  } finally {
    await changeSiteOrigin(config, config.origin);
    await page.goto(`${config.origin}/settings/storage/${storageId}/cors`);
    await page.waitForSelector(
      '[data-testid="storage-cors"][data-state="invalidated"]',
    );
  }
}
