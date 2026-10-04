import assert from 'node:assert/strict';
import { join } from 'node:path';
import { cp, mkdir, rm } from 'node:fs/promises';
import { resizeViewport, setTheme } from './browser-geometry.mjs';

/** Exercise affected shared consumers using only the runner's disposable fixture. */
export async function verifyCopyConsumers({ page, config, report, sql, h }) {
  async function checkConsumerToast(state, title) {
    await page.waitForSelector(
      `[data-slot="toast-title"]:has-text("${title}")`,
    );
    const layout = await page.evaluate((title) => {
      const node = [
        ...document.querySelectorAll('[data-slot="toast-title"]'),
      ].find((node) => node.textContent.includes(title));
      const toast = node.closest('[data-slot="toast"]');
      const close = toast.querySelector('[data-slot="toast-close"]');
      const r = toast.getBoundingClientRect();
      const c = close.getBoundingClientRect();
      return {
        width: innerWidth,
        height: innerHeight,
        placement: toast.getAttribute('data-placement'),
        radius: getComputedStyle(toast).borderRadius,
        surface: r.toJSON(),
        close: c.toJSON(),
        closeHit: close.contains(
          document.elementFromPoint(c.x + c.width / 2, c.y + c.height / 2),
        ),
        title: node.textContent,
      };
    }, title);
    assert.equal(layout.radius, '12px');
    assert.ok(
      layout.surface.bottom <= layout.height && layout.surface.top >= 0,
    );
    assert.ok(layout.surface.left >= 0 && layout.surface.right <= layout.width);
    assert.ok(layout.surface.bottom > layout.height / 2);
    assert.ok(layout.close.width >= 44 && layout.close.height >= 44);
    assert.equal(
      layout.closeHit,
      true,
      'Actual consumer toast close target is reachable',
    );
    await page.screenshot({
      path: join(config.output, `copy-consumer-toast-${state}.png`),
    });
    report.layouts.push({ state, ...layout });
    await page.click(
      '[data-slot="toast"][data-frontmost="true"] [data-slot="toast-close"]',
    );
  }
  report.stage = 'trash-context-consumer';
  await sql(
    "UPDATE media_images SET trashed_at=1810000000000 WHERE id='issue177-198'",
  );
  await page.goto(`${config.origin}/trash`);
  const record = '[data-testid="trash-record-issue177-198"]';
  await page.waitForSelector(record);
  for (const theme of ['light', 'dark']) {
    await setTheme(page, theme);
    for (const width of [390, 1440]) {
      await resizeViewport(page, width);
      await page.click(record, { button: 'right' });
      await page.waitForSelector('[role="menu"][aria-label="已选图片操作"]');
      const items = await page.evaluate(() =>
        [...document.querySelectorAll('[role="menuitem"]')].map((node) =>
          node.textContent.trim(),
        ),
      );
      assert.ok(items.includes('恢复所选'));
      assert.ok(items.includes('查看图片'));
      assert.ok(items.includes('查看已选清单'));
      assert.ok(
        items.every((name) => !/复制|重新处理|永久删除|移入回收站/.test(name)),
      );
      await page.screenshot({
        path: join(config.output, `copy-consumer-trash-${theme}-${width}.png`),
      });
      await page.keyboard.press('Escape');
      await page.waitForFunction(
        (selector) =>
          document.activeElement === document.querySelector(selector),
        record,
      );
      await page.keyboard.press('Shift+F10');
      await page.waitForSelector('loc=role:menuitem[name="恢复所选"]');
      await page.keyboard.press('Escape');
      await page.waitForFunction(
        (selector) =>
          document.activeElement === document.querySelector(selector),
        record,
      );
      report.layouts.push({
        state: 'trash-context',
        theme,
        width,
        menu: items,
        focusRestored: true,
      });
    }
  }
  await page.goto(`${config.origin}/trash?image=issue177-198`);
  await page.waitForSelector('loc=role:button[name="恢复图片"]');
  await page.click('loc=role:button[name="恢复图片"]');
  await page.waitForSelector('[data-testid="trash-confirm"]');
  await page.click('loc=role:button[name="确认恢复"]');
  await checkConsumerToast('trash-restore', '记录已恢复');
  assert.equal(
    (
      await sql("SELECT trashed_at FROM media_images WHERE id='issue177-198'")
    )[0].trashed_at,
    null,
  );
  await sql("UPDATE media_images SET trashed_at=NULL WHERE id='issue177-198'");
  report.checks.push(
    'Trash native right-click and Shift+F10 use the restore-only shared menu; Escape returns focus to the actual record, with no copy, reprocess or deletion action.',
  );
  report.stage = 'shared-toast-route-smoke';
  const [storage] = await sql(
    'SELECT id FROM storage_configs WHERE enabled=1 LIMIT 1',
  );
  for (const route of [
    '/library',
    '/albums',
    '/albums/issue177-album-a',
    '/tags',
    '/upload',
    '/trash',
    `/settings/storage/${storage.id}`,
  ]) {
    await page.goto(`${config.origin}${route}`);
    await page.waitForSelector('main');
    await h.settle();
    assert.equal(
      new URL(await page.url()).pathname,
      route,
      'Shared-provider consumer opens its actual route',
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `${route}: shared-provider route smoke has no overflow`,
    );
    report.layouts.push({
      state: 'shared-toast-route-smoke',
      route,
      width: 1440,
      theme: 'dark',
      loaded: true,
    });
  }
  report.checks.push(
    'Every implemented shared-provider consumer route mounts its real page with no horizontal overflow; actual bottom-toast placement and dismissability are checked separately in the short copy-success viewport.',
  );
  await page.goto(`${config.origin}/tags`);
  await page.waitForSelector('loc=role:button[name="新建标签"]');
  await resizeViewport(page, 390, 400);
  await page.click('loc=role:button[name="新建标签"]');
  await page.waitForSelector('#tag-name');
  await page.fill('#tag-name', 'Issue 187 Toast 消费');
  await page.click('loc=role:button[name="创建标签"]');
  await checkConsumerToast('tag-create-short', 'Issue 187 Toast 消费 已创建');
  await sql("DELETE FROM tags WHERE display_name='Issue 187 Toast 消费'");
  report.stage = 'upload-layout-consumer';
  await page.goto(`${config.origin}/upload`);
  await page.waitForSelector('[data-testid="upload-picker"]');
  for (const theme of ['light', 'dark']) {
    await setTheme(page, theme);
    for (const width of [360, 390, 430, 768, 1199, 1200, 1440]) {
      await resizeViewport(page, width);
      const layout = await page.evaluate(() => {
        const picker = document.querySelector('[data-testid="upload-picker"]');
        const rect = (node) => node.getBoundingClientRect().toJSON();
        const controls = [...picker.querySelectorAll('button')];
        return {
          width: innerWidth,
          overflow: document.documentElement.scrollWidth > innerWidth,
          buttons: controls.map((node) => ({
            name: node.textContent.trim(),
            ...rect(node),
          })),
          icon: rect(
            picker.querySelector('[data-testid="upload-idle-motion"]'),
          ),
          heading: getComputedStyle(picker.querySelector('h2')).fontSize,
          padding: getComputedStyle(picker).paddingLeft,
          description: picker.querySelector('p:last-child').textContent,
        };
      });
      assert.equal(layout.overflow, false);
      const [image, folder] = layout.buttons;
      assert.deepEqual([image.name, folder.name], ['选择图片', '选择文件夹']);
      assert.deepEqual(
        [image.height, folder.height, image.top],
        [48, 48, folder.top],
      );
      assert.equal(folder.left - image.right, 12);
      assert.equal(image.width, folder.width);
      assert.equal(layout.heading, width < 1200 ? '20px' : '28px');
      assert.deepEqual(
        [layout.icon.width, layout.icon.height],
        width < 1200 ? [32, 32] : [64, 64],
      );
      if (width < 1200) assert.equal(layout.padding, '24px');
      else assert.equal(image.width, 160);
      assert.match(layout.description, /支持多选.*单文件最大/);
      if ([390, 1440].includes(width))
        await page.screenshot({
          path: join(
            config.output,
            `copy-consumer-upload-${theme}-${width}.png`,
          ),
        });
      report.layouts.push({ state: 'upload-empty', theme, ...layout });
    }
  }
  const chooserPromise = page.waitForFileChooser({ timeout: 10000 });
  await page.click('loc=role:button[name="选择图片"]');
  const chooser = await chooserPromise;
  await chooser.setFiles(
    join(config.projectDirectory, 'tests/fixtures/runtime/images/sample.png'),
  );
  await page.waitForSelector('[data-testid="upload-item"]');
  assert.equal(
    await page.evaluate(
      () => document.querySelectorAll('[data-testid="upload-item"]').length,
    ),
    1,
  );
  assert.match(
    await page.evaluate(
      () => document.querySelector('[data-testid="upload-item"]').textContent,
    ),
    /sample.png/,
  );
  await page.reload();
  await page.waitForSelector('[data-testid="upload-picker"]');
  const directory = join(config.dataDirectory, 'issue187-input-folder');
  await mkdir(directory);
  await cp(
    join(config.projectDirectory, 'tests/fixtures/runtime/images/sample.png'),
    join(directory, 'folder-sample.png'),
  );
  try {
    const folderChooserPromise = page.waitForFileChooser({ timeout: 10000 });
    await page.click('loc=role:button[name="选择文件夹"]');
    const folderChooser = await folderChooserPromise;
    await folderChooser.setFiles(directory);
    await page.waitForSelector('[data-testid="upload-item"]');
    assert.equal(
      await page.evaluate(
        () => document.querySelectorAll('[data-testid="upload-item"]').length,
      ),
      1,
    );
    assert.match(
      await page.evaluate(
        () => document.querySelector('[data-testid="upload-item"]').textContent,
      ),
      /folder-sample.png/,
    );
    await page.reload();
    await page.waitForSelector('[data-testid="upload-picker"]');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  report.checks.push(
    'Upload empty picker preserves approved desktop geometry and uses equal 48px mobile buttons, 12px gap, 32px icon, 20px heading and 24px padding; the real native image and folder choosers still scan independent sample PNGs into the queue without uploading.',
  );
  await h.resize(1440);
}
