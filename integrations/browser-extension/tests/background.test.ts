import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  session: {} as Record<string, unknown>,
  windows: new Map<number, { id: number; url: string; focused: boolean }>(),
  nextId: 1,
  sourceClick: null as
    ((info: { menuItemId: string; srcUrl: string }) => void) | null,
}));
vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      session: {
        get: async (key: string) => ({ [key]: state.session[key] }),
        set: async (values: Record<string, unknown>) => {
          Object.assign(state.session, values);
        },
        remove: async (key: string) => {
          delete state.session[key];
        },
      },
      local: { setAccessLevel: async () => {} },
    },
    runtime: {
      getURL: (path: string) => 'chrome-extension://test' + path,
      onInstalled: { addListener: () => {} },
    },
    action: {
      onClicked: { addListener: () => {} },
      setBadgeText: async () => {},
    },
    contextMenus: {
      removeAll: async () => {},
      create: () => {},
      onClicked: {
        addListener: (
          listener: (info: { menuItemId: string; srcUrl: string }) => void,
        ) => {
          state.sourceClick = listener;
        },
      },
    },
    windows: {
      get: async (id: number) => {
        const value = state.windows.get(id);
        if (!value) throw new Error('No window with id: ' + id);
        return value;
      },
      update: async (id: number, values: { focused: boolean }) => {
        const value = state.windows.get(id);
        if (!value) throw new Error('No window with id: ' + id);
        Object.assign(value, values);
        return value;
      },
      create: async (options: { url: string; focused: boolean }) => {
        const window = { id: state.nextId++, ...options };
        state.windows.set(window.id, window);
        return window;
      },
      onRemoved: { addListener: () => {} },
    },
  },
}));
import background, { openUploadWindow } from '../entrypoints/background';
beforeEach(() => {
  state.session = {};
  state.windows.clear();
  state.nextId = 1;
  state.sourceClick = null;
});
describe('浏览器入口', () => {
  it('重复点击聚焦同一个持久小窗，已关闭的小窗可正常重开', async () => {
    await Promise.all([openUploadWindow(), openUploadWindow()]);
    expect(state.windows.size).toBe(1);
    expect(state.windows.get(1)).toMatchObject({
      url: 'chrome-extension://test/uploader.html',
      focused: true,
    });
    state.windows.delete(1);
    await openUploadWindow();
    expect(state.windows.size).toBe(1);
    expect(state.windows.get(2)).toBeDefined();
  });
  it('图片右键只转交来源任务，不带上传Token或后台fetch', async () => {
    background.main();
    state.sourceClick?.({
      menuItemId: 'ariso.save-image',
      srcUrl: 'https://cdn.example/photo.png',
    });
    await vi.waitFor(() => expect(state.windows.size).toBe(1));
    const request = Object.entries(state.session).find(([key]) =>
      key.startsWith('ariso.sourceRequest.'),
    )?.[1];
    expect(request).toMatchObject({
      url: 'https://cdn.example/photo.png',
      id: expect.any(String),
    });
    expect(JSON.stringify(state.session)).not.toContain('token');
  });
  it('不支持的内联图片仍打开窗口展示错误，且不保存整段图片字节', async () => {
    background.main();
    state.sourceClick?.({
      menuItemId: 'ariso.save-image',
      srcUrl: 'data:image/png;base64,aGVsbG8=',
    });
    await vi.waitFor(() => expect(state.windows.size).toBe(1));
    const request = Object.entries(state.session).find(([key]) =>
      key.startsWith('ariso.sourceRequest.'),
    )?.[1];
    expect(request).toMatchObject({ url: 'data:' });
  });
});
