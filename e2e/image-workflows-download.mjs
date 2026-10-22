import assert from 'node:assert/strict';
import { join } from 'node:path';
import { inspectWorkflowZip } from './image-workflows-fixture.mjs';
import { archiveMenu, workflowButton } from './image-workflows-page.mjs';

const versionLabels = {
  original: '原图',
  compressed: '压缩图',
  thumbnail: '缩略图',
  watermark: '水印图',
};

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
  report.stage = 'zip-toolbar-version-menu';
  await page.waitForSelector(archiveMenu);
  assert.deepEqual(
    await page.evaluate(() =>
      [
        ...document
          .querySelector('[data-testid="library-archive-menu"]')
          .querySelectorAll('[role="menuitem"]'),
      ].map((item) => item.textContent.trim()),
    ),
    Object.values(versionLabels),
  );
  await ui.capture('zip-version-menu', archiveMenu, null);

  async function chooseVersion(version) {
    const item = `loc=role:menuitem[name=${JSON.stringify(versionLabels[version])}]`;
    await page.waitForSelector(item);
    await page.focus(item);
    await page.keyboard.press('Enter');
    await page.waitForSelector(archiveMenu, { state: 'hidden' });
  }
  async function download(name, version) {
    report.stage = `zip-${name}-${version}-native-download`;
    const pending = page.waitForEvent('download', { timeout: 30000 });
    await chooseVersion(version);
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
      'The extracted files match the explicitly selected real versions',
    );
    report.checks.push({ scenario: name, version, entries });
  }
  async function contextVersions() {
    await page.focus(
      workflowButton(`查看图片：${fixture.publicImage.displayName}`),
    );
    await page.keyboard.press('Shift+F10');
    const item = 'loc=role:menuitem[name="打包下载"]';
    await page.waitForSelector(item);
    await page.focus(item);
    await page.keyboard.press('ArrowRight');
    await page.waitForSelector(archiveMenu);
  }

  await download('toolbar-archive', 'original');
  await ui.selected(2);
  await page.waitForFunction(
    () => document.activeElement?.getAttribute('aria-label') === '打包下载',
  );

  await ui.select(fixture.gifImage);
  await ui.selected(3);
  await contextVersions();
  report.stage = 'zip-context-unavailable-version';
  await chooseVersion('watermark');
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[data-slot="toast"]')].some((toast) =>
      toast.textContent.includes('无法下载水印图'),
    ),
  );
  await ui.selected(3);
  const screenshot = 'image-workflows-zip-unavailable-toast.png';
  await page.screenshot({ path: join(config.output, screenshot) });
  report.layouts.push({ scene: 'zip-unavailable-toast', screenshot });

  // The owner changes the actual selection. There is no download-only exclusion.
  await ui.select(fixture.gifImage);
  await ui.selected(2);
  await contextVersions();
  await download('context-menu-archive', 'watermark');
  await ui.selected(2);
  report.checks.push({
    scenario: 'archive-menu-keeps-owner-selection',
    selectedAfterUnavailable: 3,
    selectedAfterOwnerChange: 2,
    downloaded: 2,
  });
}
