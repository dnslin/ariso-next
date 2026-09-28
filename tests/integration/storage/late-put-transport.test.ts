import { once } from 'node:events';
import { createServer, type RequestListener } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { expect, it } from 'vitest';
import { put } from '../../experiments/upload-late-put/transport.ts';

// These localhost observations exercise the sender, not any provider's expiry rules.
async function withEndpoint(
  respond: RequestListener,
  run: (url: string) => Promise<void>,
) {
  const server = createServer(respond);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Expected TCP address');
  try {
    await run(`http://127.0.0.1:${address.port}/object?X-Amz-Signature=secret`);
  } finally {
    const closed = once(server, 'close');
    server.closeAllConnections();
    server.close();
    await closed;
  }
}

const options = {
  bytes: 4096,
  chunkBytes: 1024,
  intervalMs: 30,
  timeoutMs: 2000,
};

it('限速 PUT 跨过本地模拟时间窗口，完整传输后才记录响应', async () => {
  let received = 0;
  let started = 0;
  let ended = 0;
  let windowPassed = false;
  await withEndpoint(
    (request, response) => {
      started = Date.now();
      expect(request.method).toBe('PUT');
      expect(request.headers['content-length']).toBe('4096');
      expect(request.headers['content-type']).toBe('application/octet-stream');
      const window = setTimeout(() => {
        windowPassed = true;
      }, 15);
      request.on('data', (chunk: Buffer) => {
        received += chunk.length;
      });
      request.on('end', () => {
        ended = Date.now();
        clearTimeout(window);
        response.end();
      });
    },
    async (url) => {
      const result = await put(url, options);
      expect(result).toMatchObject({
        outcome: 'response',
        status: 200,
        bytesSent: 4096,
      });
      expect(received).toBe(4096);
      expect(windowPassed).toBe(true);
      expect(ended - started).toBeGreaterThanOrEqual(60);
      expect(Date.parse(result.startedAt)).toBeLessThanOrEqual(started);
      expect(Date.parse(result.finishedAt)).toBeGreaterThanOrEqual(ended);
      expect(Date.parse(result.bodyFinishedAt!)).toBeGreaterThanOrEqual(
        started + 60,
      );
      expect(Date.parse(result.bodyFinishedAt!)).toBeLessThanOrEqual(
        Date.parse(result.finishedAt),
      );
      expect(JSON.stringify(result)).not.toContain('secret');
    },
  );
});

it('同一地址可以重复 PUT，服务端实际收到两次完整请求', async () => {
  const bodies: Buffer[] = [];
  await withEndpoint(
    (request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        bodies.push(Buffer.concat(chunks));
        response.end();
      });
    },
    async (url) => {
      for (let index = 0; index < 2; index++) {
        expect(await put(url, { ...options, intervalMs: 0 })).toMatchObject({
          outcome: 'response',
          status: 200,
        });
      }
      expect(bodies.map((body) => body.length)).toEqual([4096, 4096]);
      expect(bodies[0]).toEqual(bodies[1]);
    },
  );
});

it('在给定字节数取消，连接关闭且服务端没有收到完整对象', async () => {
  let received = 0;
  let completed = false;
  let requestClosed: Promise<unknown> | undefined;
  await withEndpoint(
    (request) => {
      requestClosed = new Promise((resolve) => request.once('close', resolve));
      request.on('data', (chunk: Buffer) => {
        received += chunk.length;
      });
      request.on('end', () => {
        completed = true;
      });
    },
    async (url) => {
      const result = await put(url, { ...options, abortAfterBytes: 1500 });
      expect(result).toMatchObject({ outcome: 'aborted', bytesSent: 1500 });
      expect(result.bodyFinishedAt).toBeUndefined();
      await requestClosed;
      expect(received).toBeLessThan(4096);
      expect(completed).toBe(false);
    },
  );
});

it('服务端提前 403 时停止发送，仅保留错误 Code 和请求编号', async () => {
  await withEndpoint(
    (_request, response) => {
      response.writeHead(403, { 'x-amz-request-id': 'fixture-id' });
      response.end(
        '<Error><Code>AccessDenied</Code><Message>secret-url</Message></Error>',
      );
    },
    async (url) => {
      const result = await put(url, { ...options, intervalMs: 50 });
      expect(result).toMatchObject({
        outcome: 'response',
        status: 403,
        code: 'AccessDenied',
        requestId: 'fixture-id',
      });
      expect(result.bytesSent).toBeLessThan(4096);
      expect(result.bodyFinishedAt).toBeUndefined();
      expect(JSON.stringify(result)).not.toContain('secret');
    },
  );
});

it('连接中断返回错误证据，不把网络错误当作服务端拒绝', async () => {
  await withEndpoint(
    (request) => request.socket.destroy(),
    async (url) => {
      const result = await put(url, options);
      expect(result.outcome).toBe('error');
      expect(result.status).toBeUndefined();
      expect(result.error?.message).toBeTruthy();
      expect(result.code).toBe('ECONNRESET');
      expect(JSON.stringify(result)).not.toContain('secret');
    },
  );
});

it('服务端不响应时按总时限停止并关闭连接', async () => {
  let requestClosed: Promise<unknown> | undefined;
  await withEndpoint(
    (request) => {
      requestClosed = new Promise((resolve) => request.once('close', resolve));
      request.resume();
    },
    async (url) => {
      const result = await put(url, {
        ...options,
        intervalMs: 100,
        timeoutMs: 50,
      });
      expect(result).toMatchObject({
        outcome: 'error',
        error: { name: 'TimeoutError' },
      });
      await requestClosed;
      expect(result.bytesSent).toBeLessThan(4096);
      expect(result.bodyFinishedAt).toBeUndefined();
    },
  );
});

it('大块写入等待服务端恢复读取后完成，保持完整长度', async () => {
  let received = 0;
  await withEndpoint(
    (request, response) => {
      request.pause();
      void delay(30).then(() => request.resume());
      request.on('data', (chunk: Buffer) => {
        received += chunk.length;
      });
      request.on('end', () => response.end());
    },
    async (url) => {
      const bytes = 8 * 1024 * 1024;
      const result = await put(url, {
        ...options,
        bytes,
        chunkBytes: 1024 * 1024,
        intervalMs: 0,
      });
      expect(result).toMatchObject({
        outcome: 'response',
        status: 200,
        bytesSent: bytes,
      });
      expect(received).toBe(bytes);
    },
  );
});

it('快速写完请求体后延迟响应，不把等待响应的时间记录为写入时间', async () => {
  let responseAt = 0;
  await withEndpoint(
    (request, response) => {
      request.resume();
      request.on('end', () => {
        void delay(100).then(() => {
          responseAt = Date.now();
          response.end();
        });
      });
    },
    async (url) => {
      const result = await put(url, { ...options, intervalMs: 0 });
      expect(result).toMatchObject({
        outcome: 'response',
        bytesSent: options.bytes,
      });
      expect(Date.parse(result.bodyFinishedAt!)).toBeLessThanOrEqual(
        responseAt - 80,
      );
      expect(Date.parse(result.finishedAt)).toBeGreaterThanOrEqual(responseAt);
    },
  );
});
