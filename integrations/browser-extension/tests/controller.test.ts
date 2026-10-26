import { createServer } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UploadController } from '../lib/controller';
import { defaultSettings } from '../lib/settings-input';
import type { Capabilities } from '../lib/types';
import { successfulResponse } from './fixtures';

const capabilities: Capabilities = {
  maxFileBytes: 1000000,
  queueLimit: 10,
  defaultVisibility: 'public',
  defaultLinkVersion: 'compressed',
  defaultStorageAvailable: true,
  requestId: 'cap-1',
};
let controller: UploadController;
let server: ReturnType<typeof createServer>;
let siteUrl: string;
let responses: Array<{ status: number; body: unknown }>;
let received: Array<{ authorization?: string; body: string }>;
let releases: Array<() => void>;
let hold: boolean;

beforeEach(async () => {
  vi.stubGlobal('URL', URL);
  URL.createObjectURL = vi.fn(() => `blob:${crypto.randomUUID()}`);
  URL.revokeObjectURL = vi.fn();
  responses = [];
  received = [];
  releases = [];
  hold = false;
  server = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'authorization,content-type');
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }
    let body = '';
    for await (const part of req) body += String(part);
    received.push({ authorization: req.headers.authorization, body });
    const response = responses.shift() ?? {
      status: 201,
      body: successfulResponse(),
    };
    if (hold) await new Promise<void>((resolve) => releases.push(resolve));
    res.statusCode = response.status;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(response.body));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  siteUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  controller = new UploadController(capabilities);
});
afterEach(async () => {
  releases.forEach((release) => release());
  controller.destroy();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  vi.restoreAllMocks();
});
const image = () =>
  new File([new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4])], 'same-name.png', {
    type: 'image/png',
  });
const settings = () => ({
  ...defaultSettings,
  siteUrl,
  token: 'upload-test-key',
});

describe('真实 Uppy/XHR 上传', () => {
  it('同一文件显式加入两次，产生两个独立上传和正确结果', async () => {
    const file = image();
    expect(controller.addFiles([file, file]).added).toBe(2);
    const ids = controller.getSnapshot().items.map((item) => item.id);
    expect(new Set(ids).size).toBe(2);
    await controller.start(settings());
    expect(received).toHaveLength(2);
    expect(controller.getSnapshot()).toMatchObject({
      busy: false,
      items: [
        { id: ids[0], state: 'ready' },
        { id: ids[1], state: 'ready' },
      ],
    });
    expect(received[0]?.authorization).toBe('Bearer upload-test-key');
    expect(received[0]?.body).toContain('name="visibility"');
    expect(received[0]?.body).not.toContain('name="queueId"');
    expect(received[0]?.body).not.toContain('name="source"');
    expect(received[0]?.body).not.toContain('name="storageId"');
    expect(received[0]?.body).not.toContain('name="albumId"');
    expect(received[0]?.body).not.toContain('name="tag"');
    expect(received[0]?.body).not.toContain('\r\n\r\nundefined\r\n');
  });
  it('显式配置存储、相册和标签时，发送真实字段值', async () => {
    controller.addFiles([image()]);
    await controller.start({
      ...settings(),
      storageId: 'local-target',
      albumId: 'album-7',
      tag: '博客,配图',
    });
    expect(received).toHaveLength(1);
    expect(received[0]?.body).toContain(
      'name="storageId"\r\n\r\nlocal-target\r\n',
    );
    expect(received[0]?.body).toContain('name="albumId"\r\n\r\nalbum-7\r\n');
    expect(received[0]?.body).toContain('name="tag"\r\n\r\n博客,配图\r\n');
    expect(received[0]?.body).not.toContain('name="queueId"');
  });
  it('新批次不会自动重发旧的失败图片', async () => {
    responses.push({
      status: 409,
      body: {
        imageId: null,
        status: 'not_created',
        error: {
          code: 'UPLOAD_DUPLICATE',
          stage: 'deduplication',
          message: '重复',
        },
        requestId: 'duplicate-1',
      },
    });
    controller.addFiles([image()]);
    await controller.start(settings());
    expect(controller.getSnapshot().items[0]?.state).toBe('duplicate');
    controller.addFiles([image()]);
    await controller.start(settings());
    expect(received).toHaveLength(2);
    expect(controller.getSnapshot().items.map((item) => item.state)).toEqual([
      'duplicate',
      'ready',
    ]);
  });
  it('进行中的批次固定可见性，之后新加入的文件仍待上传', async () => {
    hold = true;
    controller.addFiles([image()]);
    const running = controller.start({ ...settings(), visibility: 'private' });
    await vi.waitFor(() => expect(received).toHaveLength(1));
    controller.addFiles([image()]);
    expect(controller.getSnapshot().busy).toBe(true);
    releases.forEach((release) => release());
    await running;
    expect(
      controller
        .getSnapshot()
        .items.map((item) => [item.state, item.visibility]),
    ).toEqual([
      ['ready', 'private'],
      ['queued', undefined],
    ]);
    expect(received[0]?.body).toMatch(/name="visibility"\r\n\r\nprivate/);
  });
  it('停止已发送请求后标记待核对，不假装删除服务器图片', async () => {
    hold = true;
    controller.addFiles([image()]);
    const running = controller.start(settings());
    await vi.waitFor(() => expect(received).toHaveLength(1));
    controller.stop();
    releases.forEach((release) => release());
    await running;
    expect(controller.getSnapshot().items[0]).toMatchObject({
      state: 'unknown',
    });
    expect(received).toHaveLength(1);
  });
  it('客户端限制来自站点能力，且始终保留已加入文件', () => {
    controller.setCapabilities({
      ...capabilities,
      queueLimit: 1,
      maxFileBytes: 8,
    });
    expect(controller.addFiles([image(), image()])).toMatchObject({
      added: 1,
      rejected: 1,
    });
    expect(controller.getSnapshot().items).toHaveLength(1);
  });
});
