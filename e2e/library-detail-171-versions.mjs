import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  image,
  verifyDetailControls,
  setDetail171Theme,
  setDetail171Viewport,
} from './library-detail-171-helpers.mjs';

export async function verifyDetail171Versions({ page, config, report }) {
  await page.goto(`${config.origin}/library?image=${image}`);
  await page.waitForSelector('[data-testid="detail-body"]');
  await page.click('loc=role:tab[name="压缩图"]');
  await page.click('[data-testid="detail-version-entry"]');
  await page.waitForSelector('[data-testid="detail-versions"]');
  assert.equal(
    new URL(await page.url()).searchParams.get('detailView'),
    'versions',
  );
  assert.equal(
    await page.evaluate(
      () => document.querySelectorAll('[data-testid^="version-info-"]').length,
    ),
    4,
  );
  assert.ok(
    await page.evaluate(() =>
      document
        .querySelector('[data-testid="detail-versions"]')
        .textContent.includes('当前预览压缩图'),
    ),
  );
  for (const theme of ['light', 'dark']) {
    await setDetail171Theme(page, theme);
    for (const width of [360, 390, 430, 768, 1440]) {
      await setDetail171Viewport(page, width);
      const layout = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        targets: [
          ...document.querySelectorAll(
            '[data-testid="detail-versions"] button,.shell-footer button',
          ),
        ]
          .filter((node) => node.getClientRects().length)
          .map((node) => ({
            name: node.textContent,
            width: node.getBoundingClientRect().width,
            height: node.getBoundingClientRect().height,
          })),
      }));
      assert.equal(layout.overflow, false);
      for (const target of layout.targets)
        assert.ok(
          target.width >= 44 && target.height >= 44,
          `Version action target ${target.name}`,
        );
      if ([390, 1440].includes(width))
        await verifyDetailControls(page, {
          tip: '版本说明',
          returnText: '返回图库',
          explanation: '这里展示当前已保存的版本，没有历史回滚功能。',
        });
      await page.screenshot({
        path: join(config.output, `detail-171-versions-${theme}-${width}.png`),
      });
    }
  }
  await page.focus('loc=role:button[name="返回详情"]');
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-testid="detail-body"]');
  assert.ok(
    await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="detail-preview"]')]
        .find((node) => node.getClientRects().length)
        ?.getAttribute('src')
        .includes('type=compressed'),
    ),
  );
  await page.click('[data-testid="detail-version-entry"]');
  await page.waitForSelector('[data-testid="detail-versions"]');
  await page.click('[data-testid="detail-return"]');
  await page.waitForFunction(
    () => !new URL(location.href).searchParams.has('image'),
  );
  report.checks.push(
    'Version workspace uses one owner shell, shows four actual states across five widths/light-dark, preserves the explicit compressed preview on keyboard return, and closes subview directly to the source list.',
    'Version explanation defaults closed; pointer and Enter open its real dialog, Escape restores trigger focus, popup fits desktop/phone viewport, and the icon return control keeps transparent hover and keyboard focus.',
  );
}
