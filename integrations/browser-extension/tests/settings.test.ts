import { createServer } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fakeBrowser,
  permissionRequests,
  resetBrowser,
  stores,
} from './browser-fake';
vi.mock('wxt/browser', async () => ({
  browser: (await import('./browser-fake')).fakeBrowser,
}));
import {
  connect,
  defaultSettings,
  disconnect,
  readConnection,
  savePreferences,
} from '../lib/settings';

let server: ReturnType<typeof createServer>;
let siteUrl: string;
let received: { url?: string; authorization?: string };
const capabilities = {
  maxFileBytes: 52428800,
  queueLimit: 100,
  defaultVisibility: 'private',
  defaultLinkVersion: 'compressed',
  defaultStorageAvailable: true,
  requestId: 'capability-1',
};
beforeEach(async () => {
  resetBrowser();
  received = {};
  server = createServer((req, res) => {
    received = { url: req.url, authorization: req.headers.authorization };
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(capabilities));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  siteUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  vi.restoreAllMocks();
});
describe('连接与本机配置', () => {
  it('先请求权限，再真实GET认证和保存，保存preferences保留Token', async () => {
    const pending = connect({
      ...defaultSettings,
      siteUrl,
      token: 'upload-key',
    });
    expect(permissionRequests).toEqual([['http://127.0.0.1/*']]);
    const result = await pending;
    expect(received).toEqual({
      url: '/api/upload/capabilities',
      authorization: 'Bearer upload-key',
    });
    expect(result.capabilities.defaultVisibility).toBe('private');
    await savePreferences({ ...result.settings, theme: 'dark' });
    expect((await readConnection())?.settings).toMatchObject({
      token: 'upload-key',
      theme: 'dark',
    });
    await disconnect();
    expect(await readConnection()).toBeNull();
  });
  it('拒绝域名权限不保存连接或发起能力请求', async () => {
    resetBrowser(false);
    await expect(
      connect({ ...defaultSettings, siteUrl, token: 'upload-key' }),
    ).rejects.toThrow('未允许');
    expect(received).toEqual({});
    expect(stores.local).toEqual({});
    await disconnect();
    expect(await readConnection()).toBeNull();
  });
  it('较早的偏好读取延迟完成时，不会复活之后已断开的连接', async () => {
    const saved = await connect({
      ...defaultSettings,
      siteUrl,
      token: 'upload-key',
    });
    const originalGet = fakeBrowser.storage.local.get;
    let releaseRead!: () => void;
    const captured = await originalGet('ariso.connection');
    vi.spyOn(fakeBrowser.storage.local, 'get').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseRead = () => resolve(captured);
        }),
    );
    const saving = savePreferences({ ...saved.settings, theme: 'dark' });
    await vi.waitFor(() => expect(releaseRead).toBeTypeOf('function'));
    const removing = disconnect();
    releaseRead();
    await Promise.all([saving, removing]);
    expect(await readConnection()).toBeNull();
  });
  it('连续偏好修改按意图顺序落盘，而不是由读取返回速度决定', async () => {
    const saved = await connect({
      ...defaultSettings,
      siteUrl,
      token: 'upload-key',
    });
    const captured = await fakeBrowser.storage.local.get('ariso.connection');
    let releaseRead!: () => void;
    vi.spyOn(fakeBrowser.storage.local, 'get').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseRead = () => resolve(captured);
        }),
    );
    const first = savePreferences({ ...saved.settings, tag: 'first' });
    await vi.waitFor(() => expect(releaseRead).toBeTypeOf('function'));
    const second = savePreferences({ ...saved.settings, tag: 'second' });
    releaseRead();
    await Promise.all([first, second]);
    expect((await readConnection())?.settings.tag).toBe('second');
  });
  it('连接测试晚返回时，不会覆盖之后的断开意图', async () => {
    let releaseResponse!: () => void;
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseResponse = () =>
            resolve(
              new Response(JSON.stringify(capabilities), {
                headers: { 'content-type': 'application/json' },
              }),
            );
        }),
    );
    const connecting = connect({
      ...defaultSettings,
      siteUrl,
      token: 'upload-key',
    });
    expect(permissionRequests).toEqual([['http://127.0.0.1/*']]);
    await vi.waitFor(() => expect(releaseResponse).toBeTypeOf('function'));
    const removing = disconnect();
    releaseResponse();
    await Promise.all([connecting, removing]);
    expect(await readConnection()).toBeNull();
  });
});
