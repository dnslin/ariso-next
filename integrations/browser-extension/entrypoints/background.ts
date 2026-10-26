import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';
import { protectSettings } from '../lib/settings';
import { sourceRequestsKey } from '../lib/sources';

const windowKey = 'ariso.uploadWindow';
let opening: Promise<void> | null = null;

function report(error: unknown) {
  console.error('Ariso 扩展操作失败', error);
  void browser.action.setBadgeText({ text: '!' });
}

export async function openUploadWindow() {
  if (opening) return opening;
  opening = (async () => {
    const id = (await browser.storage.session.get(windowKey))[windowKey] as
      number | undefined;
    if (id !== undefined) {
      try {
        await browser.windows.update(id, { focused: true, state: 'normal' });
        return;
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !error.message.includes('No window with id')
        )
          throw error;
      }
    }
    const created = await browser.windows.create({
      url: browser.runtime.getURL('/uploader.html'),
      type: 'popup',
      width: 392,
      height: 560,
      focused: true,
    });
    const createdId = created?.id;
    if (createdId === undefined) throw new Error('浏览器没有返回上传窗口编号');
    await browser.storage.session.set({ [windowKey]: createdId });
  })();
  try {
    await opening;
    await browser.action.setBadgeText({ text: '' });
  } finally {
    opening = null;
  }
}

export default defineBackground(() => {
  void protectSettings().catch(report);
  browser.runtime.onInstalled.addListener(() => {
    void browser.contextMenus
      .removeAll()
      .then(() =>
        browser.contextMenus.create({
          id: 'ariso.save-image',
          title: '保存到 Ariso',
          contexts: ['image'],
        }),
      )
      .catch(report);
  });
  browser.action.onClicked.addListener(() => {
    void openUploadWindow().catch(report);
  });
  browser.contextMenus.onClicked.addListener((info) => {
    if (info.menuItemId !== 'ariso.save-image' || !info.srcUrl) return;
    void (async () => {
      const source = new URL(info.srcUrl!);
      // Unsupported inline images still open the UI with a readable error, without retaining their bytes.
      const url = ['http:', 'https:'].includes(source.protocol)
        ? source.href
        : source.protocol;
      const id = crypto.randomUUID();
      // Separate keys let source consumption and later right-clicks proceed without lost updates.
      await browser.storage.session.set({
        [sourceRequestsKey + id]: { id, url },
      });
      await openUploadWindow();
    })().catch(report);
  });
});
