import { createServer } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser, permissionRequests, resetBrowser } from './browser-fake';
vi.mock('wxt/browser', async () => ({
  browser: (await import('./browser-fake')).fakeBrowser,
}));
import {
  authorizeAndFetchSource,
  dismissSourceRequest,
  fetchSource,
  readSourceRequests,
  sourceOrigin,
  sourceRequestsKey,
  subscribeSourceRequests,
} from '../lib/sources';
import { originPattern } from '../lib/permissions';

let server: ReturnType<typeof createServer>;
let base: string;
let headers: Record<string, string | string[] | undefined>;
beforeEach(async () => {
  resetBrowser();
  headers = {};
  server = createServer((req, res) => {
    headers = req.headers;
    if (req.url === '/redirect') {
      res.statusCode = 302;
      res.setHeader('location', '/photo.png');
      res.end();
      return;
    }
    if (req.url === '/login.png') {
      res.setHeader('content-type', 'text/html');
      res.end('<html>Login required</html>');
      return;
    }
    if (req.url === '/denied') {
      res.statusCode = 403;
      res.end('Denied');
      return;
    }
    res.setHeader('content-type', 'image/png');
    res.end(Buffer.from([137, 80, 78, 71, 1, 2, 3, 4]));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  vi.restoreAllMocks();
});
describe('网页来源边界', () => {
  it('下载真实图片且不发送Ariso Token或Cookie', async () => {
    storesToken();
    const file = await fetchSource({ id: '1', url: base + '/photo.png' }, 1024);
    expect(file).toMatchObject({
      name: 'photo.png',
      size: 8,
      type: 'image/png',
    });
    expect(headers.authorization).toBeUndefined();
    expect(headers.cookie).toBeUndefined();
  });
  it('手势内同步申请真实图片域名，随机端口不进入匹配模式', async () => {
    const pending = authorizeAndFetchSource(
      { id: '2', url: base + '/photo.png' },
      1024,
    );
    expect(permissionRequests).toEqual([['http://127.0.0.1/*']]);
    expect((await pending).size).toBe(8);
    expect(originPattern('https://cdn.example:9443/photo.png')).toBe(
      'https://cdn.example/*',
    );
  });
  it.each(['/redirect', '/login.png', '/denied'])(
    '来源 %s 不能被当成图片上传',
    async (path) => {
      await expect(
        fetchSource({ id: '3', url: base + path }, 1024),
      ).rejects.toThrow();
    },
  );
  it('超过服务器大小上限立即拒绝', async () => {
    await expect(
      fetchSource({ id: '4', url: base + '/photo.png' }, 4),
    ).rejects.toThrow('大小限制');
  });
  it('拒绝blob和携带账号的URL', () => {
    expect(() => sourceOrigin('blob:https://example/id')).toThrow();
    expect(() =>
      sourceOrigin('https://user:secret@example/image.png'),
    ).toThrow();
  });
  it('独立任务键支持新右键与旧任务消费，不丢新增请求', async () => {
    const seen: Array<number> = [];
    const unsubscribe = subscribeSourceRequests((requests) =>
      seen.push(requests.length),
    );
    await fakeBrowser.storage.session.set({
      [sourceRequestsKey + 'one']: { id: 'one', url: base + '/one.png' },
    });
    await Promise.all([
      dismissSourceRequest('one'),
      fakeBrowser.storage.session.set({
        [sourceRequestsKey + 'two']: { id: 'two', url: base + '/two.png' },
      }),
    ]);
    expect(await readSourceRequests()).toEqual([
      { id: 'two', url: base + '/two.png' },
    ]);
    await vi.waitFor(() => expect(seen).toContain(1));
    unsubscribe();
  });
  it('订阅读取乱序返回时，仅投递最新来源列表', async () => {
    const one = { id: 'one', url: base + '/one.png' };
    const two = { id: 'two', url: base + '/two.png' };
    let releaseRead!: () => void;
    const late = new Promise<Record<string, unknown>>((resolve) => {
      releaseRead = () => resolve({ [sourceRequestsKey + 'one']: one });
    });
    vi.spyOn(fakeBrowser.storage.session, 'get').mockImplementationOnce(
      () => late,
    );
    const seen: string[][] = [];
    const unsubscribe = subscribeSourceRequests((requests) =>
      seen.push(requests.map((request) => request.id)),
    );
    await fakeBrowser.storage.session.set({ [sourceRequestsKey + 'one']: one });
    await fakeBrowser.storage.session.set({ [sourceRequestsKey + 'two']: two });
    await vi.waitFor(() => expect(seen).toEqual([['one', 'two']]));
    releaseRead();
    await late;
    // Settle the async storage read, then its subscription delivery.
    await Promise.resolve();
    await Promise.resolve();
    expect(seen).toEqual([['one', 'two']]);
    unsubscribe();
  });
  it('取消订阅后，已发起但尚未返回的读取不再回调', async () => {
    let releaseRead!: () => void;
    const late = new Promise<Record<string, unknown>>((resolve) => {
      releaseRead = () =>
        resolve({
          [sourceRequestsKey + 'one']: { id: 'one', url: base + '/one.png' },
        });
    });
    vi.spyOn(fakeBrowser.storage.session, 'get').mockImplementationOnce(
      () => late,
    );
    const seen: unknown[] = [];
    const unsubscribe = subscribeSourceRequests((requests) =>
      seen.push(requests),
    );
    await fakeBrowser.storage.session.set({
      [sourceRequestsKey + 'one']: { id: 'one', url: base + '/one.png' },
    });
    unsubscribe();
    releaseRead();
    await late;
    await Promise.resolve();
    await Promise.resolve();
    expect(seen).toEqual([]);
  });
});
function storesToken() {
  void fakeBrowser.storage.local.set({
    'ariso.connection': { settings: { token: 'not-for-the-source' } },
  });
}
