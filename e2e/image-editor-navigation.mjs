import assert from 'node:assert/strict';
import { join } from 'node:path';
import { resizeViewport } from './browser-geometry.mjs';
import {
  button,
  drawMask,
  editor,
  field,
  readyEditor,
} from './image-editor-helpers.mjs';

const dialog = '[role="dialog"][aria-label="离开图片编辑器"]';
const exit = `${editor} > div:first-child button:text-is("退出编辑")`;

export async function verifyEditorLeave({ page, config, report, fixture, ui }) {
  report.stage = 'draft-navigation-open-single';
  async function assertDraft(text) {
    await page.click(button('水印'));
    assert.equal(
      await page.evaluate(
        (selector) => document.querySelector(selector)?.value,
        await field(page, '水印文字'),
      ),
      text,
    );
    await page.click(button('打码'));
    await page.waitForFunction(() =>
      document
        .querySelector('[aria-label="编辑参数"]')
        ?.textContent.includes('已添加 1 处'),
    );
    await page.click(button('水印'));
  }
  async function addDraft(text) {
    await drawMask(page);
    await page.click(button('水印'));
    await page.fill(await field(page, '水印文字'), text);
  }
  await ui.visit();
  await ui.openDetail(fixture.privateImage);
  await ui.more('编辑图片');
  await readyEditor(page);
  await addDraft('NAV-SINGLE');
  const origin = await page.url();
  for (const action of ['exit', 'back', 'sidebar', 'current-sidebar']) {
    report.stage = `draft-navigation-cancel-${action}`;
    const input = await field(page, '水印文字');
    if (action === 'back') await page.focus(input);
    if (action === 'exit') await page.click(exit);
    else if (action === 'back') await page.evaluate(() => history.back());
    else
      await page.click(
        `a[href="${action === 'current-sidebar' ? '/library' : '/albums'}"]`,
      );
    await page.waitForSelector(dialog);
    assert.equal(await page.url(), origin);
    if (action === 'back')
      await page.screenshot({
        path: join(config.output, 'image-editor-leave-confirm-desktop.png'),
      });
    await page.click(`${dialog} button:text-is("继续编辑")`);
    await page.waitForSelector(dialog, { state: 'hidden' });
    if (action === 'back')
      await page.waitForFunction(
        (selector) =>
          document.activeElement === document.querySelector(selector),
        input,
      );
    await assertDraft('NAV-SINGLE');
  }
  report.stage = 'draft-navigation-discard-current-library';
  await page.click('a[href="/library"]');
  await page.waitForSelector(dialog);
  await page.click(`${dialog} button:text-is("返回")`);
  await page.waitForURL(`${config.origin}/library`);
  await page.waitForSelector(editor, { state: 'hidden' });
  report.checks.push({
    scenario:
      'single-draft-back-exit-sidebar-current-library-cancel-and-discard',
    confirmed: true,
  });

  for (const view of ['templates', 'batch']) {
    report.stage = `draft-navigation-${view}-open`;
    await ui.visit();
    await ui.select(fixture.publicImage);
    await ui.select(fixture.privateImage);
    await ui.selected(2);
    await page.click(button('更多图片操作'));
    await page.click('loc=role:menuitem[name="编辑所选图片"]');
    await readyEditor(page, 'batch');
    await page.click(button('返回编辑'));
    await readyEditor(page);
    await addDraft(`NAV-${view}`);
    await page.click(button(view === 'templates' ? '编辑模板' : '批量设置'));
    await page.waitForSelector(`${editor}[data-view="${view}"]`);
    await resizeViewport(page, 390, 600);
    await page.evaluate(() => history.back());
    await page.waitForSelector(dialog);
    if (view === 'templates')
      await page.screenshot({
        path: join(config.output, 'image-editor-leave-confirm-mobile.png'),
      });
    await page.click(`${dialog} button:text-is("继续编辑")`);
    await page.waitForSelector(dialog, { state: 'hidden' });
    await page.click(
      button(view === 'templates' ? '编辑图片并创建模板' : '返回编辑'),
    );
    await readyEditor(page);
    await assertDraft(`NAV-${view}`);
    await page.click(button(view === 'templates' ? '编辑模板' : '批量设置'));
    await page.waitForSelector(`${editor}[data-view="${view}"]`);
    const key = `ariso:editor-review-refresh:${view}`;
    report.stage = `draft-navigation-${view}-real-reload`;
    const marker = await page.evaluate((key) => {
      const marker = crypto.randomUUID();
      window.__editorReviewDocument = marker;
      window.addEventListener('beforeunload', (event) => {
        sessionStorage.setItem(
          key,
          JSON.stringify({ marker, prevented: event.defaultPrevented }),
        );
      });
      return marker;
    }, key);
    const receipt = await page.reload();
    if (receipt?.dialog) await page.acceptDialog();
    await page.waitForFunction(
      (marker) => window.__editorReviewDocument !== marker,
      marker,
    );
    const refresh = await page.evaluate((key) => {
      const result = JSON.parse(sessionStorage.getItem(key));
      sessionStorage.removeItem(key);
      return result;
    }, key);
    assert.deepEqual(
      refresh,
      { marker, prevented: true },
      'Real reload warns even when Editor is unmounted',
    );
    report.checks.push({
      scenario: `batch-draft-${view}-back-cancel-and-real-reload-warning`,
      refresh,
    });
  }
  await ui.visit();
}
