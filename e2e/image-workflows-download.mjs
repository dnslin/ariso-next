import assert from 'node:assert/strict';
import { join } from 'node:path';
import { resizeViewport } from './browser-geometry.mjs';
import { inspectWorkflowZip } from './image-workflows-fixture.mjs';
import { archiveDialog, workflowButton } from './image-workflows-page.mjs';

export async function verifyImageWorkflowDownloads({
  page,
  config,
  report,
  fixture,
  ui,
}) {
  await ui.visit();
  await ui.select(fixture.publicImage);
  await ui.select(fixture.privateImage);
  await ui.selected(2);
  await page.click(workflowButton('打包下载'));
  report.stage = 'zip-original-preflight';
  await page.waitForFunction(() => {
    const submit = document.querySelector(
      '[data-testid="library-archive-submit"]',
    );
    return (
      submit && !submit.disabled && submit.textContent.trim() === '开始下载'
    );
  });
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelectorAll('[aria-label="本次下载清单"] > li').length,
    ),
    2,
  );
  const manifest = await page.evaluate(() =>
    [...document.querySelectorAll('[aria-label="本次下载清单"] > li')].map(
      (node) => node.textContent.trim(),
    ),
  );
  for (const image of [fixture.publicImage, fixture.privateImage])
    assert.ok(manifest.some((row) => row.includes(image.displayName)));
  await ui.capture(
    'zip-original',
    archiveDialog,
    '[data-testid="library-archive-submit"]',
  );
  await resizeViewport(page, 390, 400);
  const listHeight = await page.evaluate(
    () =>
      document
        .querySelector('[aria-label="本次下载清单"]')
        .getBoundingClientRect().height,
  );
  assert.ok(
    listHeight >= 48,
    'Short-screen manifest keeps its real content height',
  );
  const visibleRows = [];
  for (const index of [0, manifest.length - 1]) {
    await page.evaluate((index) => {
      document
        .querySelectorAll('[aria-label="本次下载清单"] > li')
        [index].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }, index);
    await page.waitForFunction((index) => {
      const list = document.querySelector('[aria-label="本次下载清单"]');
      const body = list.closest('[data-slot="modal-body"]');
      const row = list.children[index].getBoundingClientRect();
      const listBounds = list.getBoundingClientRect();
      const bodyBounds = body.getBoundingClientRect();
      return (
        row.top >= Math.max(listBounds.top, bodyBounds.top) - 1 &&
        row.bottom <= Math.min(listBounds.bottom, bodyBounds.bottom) + 1
      );
    }, index);
    visibleRows.push(
      await page.evaluate((index) => {
        const row = document.querySelectorAll(
          '[aria-label="本次下载清单"] > li',
        )[index];
        const rect = row.getBoundingClientRect();
        return {
          text: row.textContent.trim(),
          top: rect.top,
          bottom: rect.bottom,
        };
      }, index),
    );
  }
  assert.deepEqual(
    visibleRows.map((row) => row.text),
    [manifest[0], manifest.at(-1)],
  );
  const action = await page.evaluate(() => {
    const rect = document
      .querySelector('[data-testid="library-archive-submit"]')
      .getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
      top: rect.top,
      bottom: rect.bottom,
    };
  });
  assert.ok(action.width >= 44 && action.height >= 44);
  assert.ok(action.top >= 0 && action.bottom <= 400);
  const listScreenshot =
    'image-workflows-zip-original-manifest-short-390x400.png';
  await page.screenshot({ path: join(config.output, listScreenshot) });
  report.layouts.push({
    scene: 'zip-original-scroll-manifest',
    width: 390,
    height: 400,
    screenshot: listScreenshot,
    listHeight,
    visibleRows,
    target: action,
  });
  report.checks.push({
    scenario: 'archive-short-preflight-manifest-readable',
    listHeight,
    visibleRows,
    primaryActionVisible: true,
  });
  await resizeViewport(page, 1440, 1000);
  await ui.modalKeyboard(
    archiveDialog,
    '[data-testid="library-archive-version"]',
  );
  async function download(name, version) {
    const pending = page.waitForEvent('download', { timeout: 30000 });
    await page.click('[data-testid="library-archive-submit"]');
    const artifact = await pending;
    assert.match(artifact.suggestedFilename(), /\.zip$/i);
    const path = join(config.output, `image-workflows-${name}.zip`);
    await artifact.saveAs(path);
    assert.equal(await artifact.failure(), null);
    const entries = await inspectWorkflowZip(path, 2);
    const sizes = [fixture.publicImage, fixture.privateImage]
      .map(
        (image) =>
          image.versions.find((item) => item.kind === version).byteSize,
      )
      .sort((a, b) => a - b);
    assert.deepEqual(
      entries.map((item) => item.bytes).sort((a, b) => a - b),
      sizes,
      'The extracted files match the selected real versions',
    );
    report.checks.push({ scenario: name, version, entries });
    await page.click(workflowButton('知道了'));
    await page.waitForSelector(archiveDialog, { state: 'hidden' });
  }
  await download('toolbar-archive', 'original');
  await ui.selected(2);
  await page.waitForFunction(
    () => document.activeElement?.getAttribute('aria-label') === '打包下载',
  );
  await ui.select(fixture.gifImage);
  await ui.selected(3);
  await page.focus(
    workflowButton(`查看图片：${fixture.publicImage.displayName}`),
  );
  await page.keyboard.press('Shift+F10');
  await page.waitForSelector('loc=role:menuitem[name="打包下载"]');
  await page.click('loc=role:menuitem[name="打包下载"]');
  await page.waitForSelector(archiveDialog);
  await page.click('[data-testid="library-archive-version"]');
  await page.waitForSelector('loc=role:option[name="水印图"]');
  await page.click('loc=role:option[name="水印图"]');
  report.stage = 'zip-unavailable-preflight';
  await page.waitForFunction(() => {
    const dialog = document.querySelector(
      '[data-testid="library-archive-dialog"]',
    );
    return (
      dialog
        ?.querySelector('[role="alert"]')
        ?.textContent.includes('张图片不可下载') &&
      dialog.querySelector('[data-testid="library-archive-submit"]')?.disabled
    );
  });
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelectorAll('[aria-label="本次下载清单"] > li').length,
    ),
    3,
    'Unavailable files stay in the preflight manifest',
  );
  await page.waitForSelector(workflowButton('从本次下载排除这 1 张'));
  await ui.capture('zip-unavailable', archiveDialog, null, [390], ['light']);
  await page.click(workflowButton('从本次下载排除这 1 张'));
  await page.waitForFunction(
    () =>
      document.querySelectorAll('[aria-label="本次下载清单"] > li').length ===
        2 &&
      !document.querySelector('[data-testid="library-archive-submit"]')
        ?.disabled,
  );
  await download('context-menu-archive-explicit-exclusion', 'watermark');
  await ui.selected(3);
  report.checks.push({
    scenario: 'archive-preflight-keeps-owner-selection',
    selected: 3,
    downloaded: 2,
  });
}
