import { afterEach, expect, it } from 'vitest';
import { readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  createTransportLab,
  sendBody,
} from '../../experiments/upload-transport/lab.ts';

const labs: Awaited<ReturnType<typeof createTransportLab>>[] = [];
afterEach(async () => {
  for (const lab of labs.splice(0)) await lab.close();
});
async function start(options = {}) {
  const lab = await createTransportLab(options);
  labs.push(lab);
  return lab;
}

it('50 MiB 等号接受且磁盘字节一致；未知长度超过一字节拒绝并清理', async () => {
  const lab = await start();
  const size = 50 * 1024 * 1024;
  const accepted = await sendBody(lab.url, { bytes: size, declared: size });
  expect(accepted.status).toBe(201);
  expect(
    (await readFile(join(lab.directory, 'original'))).equals(
      Buffer.alloc(size, 42),
    ),
  ).toBe(true);
  const rejected = await sendBody(lab.url, { bytes: size + 1 });
  expect(rejected).toMatchObject({
    status: 413,
    body: { code: 'UPLOAD_TOO_LARGE' },
  });
  expect(await readdir(lab.directory)).toEqual(['original']);
}, 20_000);

it('未知长度正常接收，空文件拒绝', async () => {
  const lab = await start();
  expect((await sendBody(lab.url, { bytes: 65537 })).status).toBe(201);
  expect((await sendBody(lab.url, { bytes: 0 })).status).toBe(400);
  expect(await readdir(lab.directory)).toEqual(['original']);
});

it('代理传输进展刷新 idle，但总接收预算独立到期并清理', async () => {
  const lab = await start({ idleMs: 300, totalMs: 650 });
  const result = await sendBody(lab.url, {
    bytes: 30,
    chunkBytes: 1,
    intervalMs: 80,
  });
  expect(result).toMatchObject({
    status: 408,
    body: { code: 'UPLOAD_TOTAL_TIMEOUT' },
  });
  expect(result.elapsedMs).toBeGreaterThanOrEqual(600);
  expect(await readdir(lab.directory)).toEqual([]);
});

it('代理上的连续无进展触发 idle 清理', async () => {
  const lab = await start({ idleMs: 120, totalMs: 2000 });
  const result = await sendBody(lab.url, {
    bytes: 2,
    chunkBytes: 1,
    intervalMs: 400,
  });
  expect(result).toMatchObject({
    status: 408,
    body: { code: 'UPLOAD_IDLE_TIMEOUT' },
  });
  expect(await readdir(lab.directory)).toEqual([]);
});

it('客户端断连传播到上游并清理半文件', async () => {
  const lab = await start();
  await sendBody(lab.url, { bytes: 2 });
  await sendBody(lab.url, {
    bytes: 1024 * 1024,
    chunkBytes: 1024,
    intervalMs: 10,
    disconnectAfterBytes: 2048,
  });
  await lab.nextReception(1);
  expect(lab.receptions.at(-1)?.code).toBe('UPLOAD_DISCONNECTED');
  expect(await readdir(lab.directory)).toEqual(['original']);
});

it('API 等待预算到期返回真实 processing，不修改任务', async () => {
  const lab = await start({ waitMs: 100 });
  const result = await fetch(`${lab.url}/wait`);
  expect(result.status).toBe(504);
  expect(await result.json()).toMatchObject({
    imageId: 'image-one',
    status: 'processing',
    code: 'UPLOAD_WAIT_TIMEOUT',
  });
  expect(lab.job.status).toBe('processing');
});

it.each(['ready', 'failed'] as const)(
  '最后读取到 %s 时优先返回终态',
  async (status) => {
    const lab = await start({ waitMs: 100 });
    const response = fetch(`${lab.url}/wait`);
    await lab.waitingStarted;
    lab.job.status = status;
    const result = await response;
    expect(result.status).toBe(status === 'ready' ? 201 : 422);
    expect(await result.json()).toMatchObject({ status });
  },
);

it('API 等待中客户端断连不取消后台任务', async () => {
  const lab = await start({ waitMs: 100 });
  const controller = new AbortController();
  const response = fetch(`${lab.url}/wait`, { signal: controller.signal });
  await lab.waitingStarted;
  controller.abort();
  await expect(response).rejects.toThrow();
  expect(lab.job.status).toBe('processing');
  lab.job.status = 'ready';
  expect((await fetch(`${lab.url}/wait`)).status).toBe(201);
});

it('已声明超限在接收前拒绝，伪造较大声明后断连清理', async () => {
  const lab = await start();
  const refused = await sendBody(lab.url, {
    bytes: 1,
    declared: 50 * 1024 * 1024 + 1,
  });
  expect(refused.status).toBe(413);
  expect(lab.receptions[0]?.bytes).toBe(0);
  const other = await start();
  await sendBody(other.url, {
    bytes: 20,
    declared: 100,
    chunkBytes: 10,
    intervalMs: 10,
    disconnectAfterBytes: 20,
  });
  await other.nextReception();
  expect(other.receptions[0]).toMatchObject({
    code: 'UPLOAD_DISCONNECTED',
    bytes: 20,
  });
  expect(await readdir(other.directory)).toEqual([]);
});

it('GET 实验页面声明真实字节上限和预算且不创建接收文件', async () => {
  const lab = await start({ idleMs: 120, totalMs: 1800, waitMs: 900 });
  const response = await fetch(lab.url);
  expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
  const html = await response.text();
  expect(html).toContain('<meta name="viewport"');
  expect(html).toContain(
    '独立 Node HTTP 代理与磁盘接收实验，不是业务上传页面。',
  );
  expect(html).toContain('"maxBytes":52428800');
  expect(html).toContain('"waitMs":900');
  expect(lab.receptions).toEqual([]);
  expect(await readdir(lab.directory)).toEqual([]);
});

it('暂存目录丢失时保留真实写入错误，不伪报接收成功', async () => {
  const lab = await start();
  await rm(lab.directory, { recursive: true });
  const result = await sendBody(lab.url, { bytes: 20 });
  expect(result.status).toBe(500);
  expect(result.body.code).toContain('UPLOAD_FILE_ERROR:');
  expect(result.body.code).toContain('ENOENT');
  expect(result.body.code).toContain(lab.directory);
});
