import { createServer } from 'node:http';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fakeBrowser, resetBrowser, stores } from './browser-fake';
import { successfulResponse } from './fixtures';
vi.mock('wxt/browser', async () => ({
  browser: (await import('./browser-fake')).fakeBrowser,
}));
import { App } from '../entrypoints/uploader/App';
import { UploadController } from '../lib/controller';
import { defaultSettings } from '../lib/settings-input';
import { sourceRequestsKey } from '../lib/sources';
import type { Capabilities } from '../lib/types';

let server: ReturnType<typeof createServer>;
let siteUrl: string;
let root: Root;
let container: HTMLDivElement;
let controller: UploadController;
let capabilities: Capabilities;
let uploaded: string[];

beforeEach(async () => {
  resetBrowser();
  uploaded = [];
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return true;
    },
  }));
  URL.createObjectURL = vi.fn(() => `blob:${crypto.randomUUID()}`);
  URL.revokeObjectURL = vi.fn();
  capabilities = {
    maxFileBytes: 1000000,
    queueLimit: 10,
    defaultVisibility: 'public',
    defaultLinkVersion: 'compressed',
    defaultStorageAvailable: true,
    requestId: 'ui-capability',
  };
  server = createServer(async (request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader(
      'Access-Control-Allow-Headers',
      'authorization,content-type',
    );
    if (request.method === 'OPTIONS') {
      response.end();
      return;
    }
    response.setHeader('content-type', 'application/json');
    if (request.url === '/api/upload/capabilities') {
      response.end(JSON.stringify(capabilities));
      return;
    }
    let body = '';
    for await (const part of request) body += String(part);
    uploaded.push(body);
    response.statusCode = 201;
    response.end(JSON.stringify(successfulResponse()));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  siteUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  controller = new UploadController();
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  await new Promise<void>((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function mount(saved = true) {
  if (saved)
    stores.local['ariso.connection'] = {
      settings: { ...defaultSettings, siteUrl, token: 'ui-only-upload-key' },
      capabilities,
    };
  await act(async () => root.render(createElement(App, { controller })));
  await until(() =>
    saved ? !!findButton('选择图片') : !!findButton('设置连接'),
  );
}
function findButton(name: string) {
  const buttons = Array.from(document.querySelectorAll('button'));
  return (
    buttons.find((button) => button.textContent?.trim() === name) ??
    buttons.find((button) => button.getAttribute('aria-label') === name)
  );
}
async function click(name: string) {
  const target = findButton(name);
  expect(target, `button ${name}`).toBeDefined();
  await act(async () => target!.click());
}
function field(label: string) {
  const element = Array.from(document.querySelectorAll('label')).find(
    (item) => item.textContent?.trim() === label,
  );
  const input = element?.htmlFor
    ? document.getElementById(element.htmlFor)
    : null;
  expect(input, `input ${label}`).toBeInstanceOf(HTMLInputElement);
  return input as HTMLInputElement;
}
async function fill(label: string, value: string) {
  const input = field(label);
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function addFile() {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  expect(input).not.toBeNull();
  await act(async () => {
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [
        new File(
          [new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4])],
          'ui-image.png',
          { type: 'image/png' },
        ),
      ],
    });
    input!.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
async function until(predicate: () => boolean) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    if (predicate()) return;
  }
  expect(predicate()).toBe(true);
}

async function pasteImage(target: EventTarget, name = 'clipboard-image.png') {
  const file = new File([new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4])], name, {
    type: 'image/png',
  });
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: {
      items: [{ kind: 'file', type: file.type, getAsFile: () => file }],
      getData: () => '',
    },
  });
  await act(async () => {
    target.dispatchEvent(event);
  });
  return event;
}

it('初始 body 焦点的图片粘贴加入队列', async () => {
  await mount();
  const event = await pasteImage(document.body);
  expect(controller.getSnapshot().items).toMatchObject([
    { name: 'clipboard-image.png', source: 'clipboard', state: 'queued' },
  ]);
  expect(event.defaultPrevented).toBe(true);
});

it('root 内部图片粘贴只加入一次', async () => {
  await mount();
  await pasteImage(container.querySelector('h1')!);
  expect(controller.getSnapshot().items).toHaveLength(1);
  expect(controller.getSnapshot().items[0]?.source).toBe('clipboard');
});

it('图片粘贴不拦截输入框、文本域或可编辑区域', async () => {
  await mount();
  await click('设置');
  await click('更多上传设置');
  const textarea = document.createElement('textarea');
  const editor = document.createElement('div');
  editor.contentEditable = 'true';
  Object.defineProperty(editor, 'isContentEditable', { value: true });
  container.append(textarea, editor);
  for (const target of [field('默认标签（可选）'), textarea, editor])
    expect((await pasteImage(target)).defaultPrevented).toBe(false);
  expect(controller.getSnapshot().items).toHaveLength(0);
});

it('连接弹窗打开时不把 body 图片粘贴当作上传', async () => {
  await mount();
  await click('设置');
  await click(new URL(siteUrl).host);
  expect((await pasteImage(document.body)).defaultPrevented).toBe(false);
  expect(controller.getSnapshot().items).toHaveLength(0);
});

it('body 粘贴文字地址提示使用网页右键，不远程导入', async () => {
  await mount();
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: { items: [], getData: () => 'https://source.example/image.png' },
  });
  await act(async () => {
    document.body.dispatchEvent(event);
  });
  expect(container.textContent).toContain(
    '请在网页图片上右键保存，或粘贴图片文件。',
  );
  expect(controller.getSnapshot().items).toHaveLength(0);
  expect(uploaded).toHaveLength(0);
});

it('真实图片队列区分字节、KiB和MiB边界', async () => {
  capabilities.maxFileBytes = 2 * 1024 * 1024;
  await mount();
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  const files = [83, 1023, 1024, 1024 * 1024].map(
    (bytes, index) =>
      new File([new Uint8Array(bytes)], `size-${index}.png`, {
        type: 'image/png',
      }),
  );
  await act(async () => {
    Object.defineProperty(input, 'files', { configurable: true, value: files });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const rows = Array.from(container.querySelectorAll('li')).map(
    (row) => row.textContent,
  );
  expect(rows).toHaveLength(4);
  for (const [index, label] of ['83 B', '1023 B', '1 KiB', '1.0 MiB'].entries())
    expect(rows[index]).toContain(label);
});

it('首次使用仅提供连接，不用假能力开放上传', async () => {
  await mount(false);
  expect(findButton('选择图片')).toBeUndefined();
  expect(findButton('设置连接')).toBeDefined();
  expect(document.body.textContent).not.toContain('50 MiB');
});

it('只在新来源首次到达时从设置返回队列', async () => {
  await mount();
  const first = { id: 'source-one', url: 'https://source.example/one.png' };
  await act(async () =>
    fakeBrowser.storage.session.set({ [sourceRequestsKey + first.id]: first }),
  );
  await click('设置');
  expect(container.querySelector('h1')?.textContent).toBe('设置');
  await act(async () =>
    fakeBrowser.storage.session.set({ [sourceRequestsKey + first.id]: first }),
  );
  expect(container.querySelector('h1')?.textContent).toBe('设置');
  await act(async () =>
    fakeBrowser.storage.session.set({
      [sourceRequestsKey + 'source-two']: {
        id: 'source-two',
        url: 'https://source.example/two.png',
      },
    }),
  );
  expect(container.querySelector('h1')?.textContent).toBe('Ariso');
  expect(
    document.querySelector('[aria-label="待读取的网页图片"]'),
  ).not.toBeNull();
});

it('默认存储不可用时禁上传，指定目标后可以开始', async () => {
  capabilities.defaultStorageAvailable = false;
  await mount();
  await addFile();
  expect(findButton('上传 1 张')?.disabled).toBe(true);
  expect(
    document.querySelector('a[href="' + siteUrl + '/settings/storage"]'),
  ).not.toBeNull();
  await click('设置');
  await click('更多上传设置');
  await fill('存储 ID（可选）', 'chosen-storage');
  await click('返回上传');
  expect(findButton('上传 1 张')?.disabled).toBe(false);
});

it('Token 默认遮挡，取消连接草稿不改变保存的地址和密钥', async () => {
  await mount();
  await click('设置');
  await click(new URL(siteUrl).host);
  expect(field('上传 Token').type).toBe('password');
  await fill('站点地址', 'https://cancelled.example');
  await fill('上传 Token', 'discarded-key');
  await click('取消');
  const saved = stores.local['ariso.connection'] as {
    settings: { siteUrl: string; token: string };
  };
  expect(saved.settings).toMatchObject({
    siteUrl,
    token: 'ui-only-upload-key',
  });
  expect(findButton(new URL(siteUrl).host)).toBeDefined();
});

it('私有上传真实完成后只提供查看，不提供匿名链接复制', async () => {
  capabilities.defaultVisibility = 'private';
  await mount();
  await addFile();
  await click('上传 1 张');
  await until(() => controller.getSnapshot().items[0]?.state === 'ready');
  expect(uploaded).toHaveLength(1);
  expect(uploaded[0]).toMatch(/name="visibility"\r\n\r\nprivate/);
  expect(container.textContent).toContain('已私有保存');
  expect(findButton('复制链接')).toBeUndefined();
  expect(findButton('复制全部链接')).toBeUndefined();
  await click('查看');
  expect(
    document.querySelector('a[href="' + siteUrl + '/library"]'),
  ).not.toBeNull();
});

it('不支持的来源显示获取失败而不让页面崩溃', async () => {
  await mount();
  await act(async () =>
    fakeBrowser.storage.session.set({
      [sourceRequestsKey + 'source-blob']: { id: 'source-blob', url: 'blob:' },
    }),
  );
  await until(
    () =>
      !!document.querySelector(
        '[aria-label="待读取的网页图片"] [role="alert"]',
      ),
  );
  expect(container.querySelector('h1')?.textContent).toBe('Ariso');
  expect(controller.getSnapshot().items).toHaveLength(0);
});
