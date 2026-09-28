import { once } from 'node:events';
import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { setImmediate } from 'node:timers/promises';
import { expect, it } from 'vitest';
import { createS3Storage } from '../../../src/server/storage/s3.ts';

type Request = {
  method: string | undefined;
  url: string;
  headers: IncomingHttpHeaders;
  body: Buffer;
};
type Reply = {
  status: number;
  body?: string | Buffer;
  headers?: Record<string, string>;
};
const errorXml = (code: string, message = 'Fixture failure') =>
  `<Error><Code>${code}</Code><Message>${message}</Message><RequestId>fixture-request</RequestId></Error>`;

// Exercises production storage with real SDK serialization and localhost HTTP.
// These fixtures do not stand in for remote service compatibility evidence.
async function withEndpoint(
  respond: (request: Request, response: ServerResponse) => Reply | void,
  run: (fixture: {
    storage: ReturnType<typeof createS3Storage>;
    disabled: ReturnType<typeof createS3Storage>;
    requests: Request[];
    incoming: { request: IncomingMessage; response: ServerResponse }[];
  }) => Promise<void>,
) {
  const requests: Request[] = [];
  const incoming: { request: IncomingMessage; response: ServerResponse }[] = [];
  const server = createServer((request, response) => {
    incoming.push({ request, response });
    const chunks: Buffer[] = [];
    request.on('error', () => {
      /* Aborted requests are intentional fixture inputs. */
    });
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const observed = {
        method: request.method,
        url: request.url ?? '/',
        headers: request.headers,
        body: Buffer.concat(chunks),
      };
      requests.push(observed);
      const reply = respond(observed, response);
      if (!reply) return;
      response.writeHead(reply.status, {
        'content-type': 'application/xml',
        'x-amz-request-id': 'fixture-request',
        ...reply.headers,
      });
      response.end(reply.body);
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Expected TCP fixture address');
  const config = {
    id: 'test-storage',
    enabled: true,
    endpoint: `http://127.0.0.1:${address.port}`,
    region: 'us-east-1',
    bucket: 'test-bucket',
    pathPrefix: '照片 + %',
    forcePathStyle: true,
    credentials: {
      accessKeyId: 'fixture-access',
      secretAccessKey: 'fixture-secret',
    },
  };
  const storage = createS3Storage(config);
  const disabled = createS3Storage({ ...config, enabled: false });
  try {
    await run({ storage, disabled, requests, incoming });
  } finally {
    storage.destroy();
    disabled.destroy();
    const closed = once(server, 'close');
    server.closeAllConnections();
    server.close();
    await closed;
  }
}

it('生产 API 流式 PUT 保留字节、实际大小和编码 Key，GET 后流关闭且连接可再次使用', async () => {
  const bytes = Buffer.from([0, 255, 1, 128, 42]);
  const key = 'uploads/session/中文 + %2F?.png';
  await withEndpoint(
    ({ method }): Reply =>
      method === 'PUT'
        ? { status: 200, headers: { etag: '"opaque-etag"' } }
        : {
            status: 200,
            body: bytes,
            headers: {
              etag: '"opaque-etag"',
              'content-length': String(bytes.length),
              'content-type': 'image/png',
            },
          },
    async ({ storage, requests }) => {
      const source = Readable.from([bytes]);
      await storage.writeObject(key, source, {
        size: bytes.length,
        contentType: 'image/png',
      });
      expect(source.destroyed).toBe(true);
      expect(requests[0]?.body).toEqual(bytes);
      expect(requests[0]?.headers['content-length']).toBe(String(bytes.length));
      expect(requests[0]?.headers['content-type']).toBe('image/png');
      expect(
        requests[0]?.headers['x-amz-sdk-checksum-algorithm'],
      ).toBeUndefined();
      expect(
        decodeURIComponent(
          new URL(requests[0]!.url, 'http://fixture').pathname,
        ),
      ).toBe(`/test-bucket/照片 + %/ariso/test-storage/${key}`);
      const result = await storage.readObject(key, {
        ifMatch: '"opaque-etag"',
      });
      expect(result).toMatchObject({
        size: bytes.length,
        contentType: 'image/png',
        etag: '"opaque-etag"',
        metadata: { requestId: 'fixture-request' },
      });
      expect(await buffer(result.stream)).toEqual(bytes);
      expect(result.stream.destroyed).toBe(true);
      expect(requests[1]?.headers['if-match']).toBe('"opaque-etag"');
      expect(await storage.inspectObject(key)).toMatchObject({
        size: bytes.length,
      });
    },
  );
});

it('条件复制编码源 Key 一次并保留 opaque ETag，不把 ETag 当文件摘要', async () => {
  const source = 'uploads/session/中文 + %2F?.png';
  const target = 'images/image/original/file.png';
  await withEndpoint(
    () => ({
      status: 200,
      body: '<CopyObjectResult><ETag>"opaque-etag-7"</ETag></CopyObjectResult>',
    }),
    async ({ storage, requests }) => {
      await expect(
        storage.copyObject(source, target, '"opaque-source-3"'),
      ).resolves.toMatchObject({
        etag: '"opaque-etag-7"',
        metadata: { requestId: 'fixture-request' },
      });
      expect(
        decodeURIComponent(String(requests[0]?.headers['x-amz-copy-source'])),
      ).toBe(`test-bucket/照片 + %/ariso/test-storage/${source}`);
      expect(requests[0]?.headers['x-amz-copy-source-if-match']).toBe(
        '"opaque-source-3"',
      );
      expect(
        decodeURIComponent(
          new URL(requests[0]!.url, 'http://fixture').pathname,
        ),
      ).toBe(`/test-bucket/照片 + %/ariso/test-storage/${target}`);
    },
  );
});

it.each(['read', 'copy'] as const)(
  '%s 的 412 保留对象已变化错误，不重试或去掉条件',
  async (operation) => {
    await withEndpoint(
      () => ({ status: 412, body: errorXml('PreconditionFailed') }),
      async ({ storage, requests }) => {
        const request =
          operation === 'read'
            ? storage.readObject('uploads/session/file', {
                ifMatch: '"validated"',
              })
            : storage.copyObject(
                'uploads/session/file',
                'images/image/original/file',
                '"validated"',
              );
        await expect(request).rejects.toMatchObject({
          code: 'STORAGE_OBJECT_CHANGED',
          storageId: 'test-storage',
          operation,
          serviceCode: 'PreconditionFailed',
          httpStatusCode: 412,
          requestId: 'fixture-request',
        });
        expect(requests).toHaveLength(1);
      },
    );
  },
);

it('CopyObject HTTP 200 中的错误仍拒绝，保留服务错误且只尝试一次', async () => {
  await withEndpoint(
    () => ({ status: 200, body: errorXml('InternalError') }),
    async ({ storage, requests }) => {
      await expect(
        storage.copyObject(
          'uploads/session/file',
          'images/image/original/file',
          '"validated"',
        ),
      ).rejects.toMatchObject({
        code: 'STORAGE_OPERATION_FAILED',
        serviceCode: 'InternalError',
        operation: 'copy',
        requestId: 'fixture-request',
        key: 'images/image/original/file',
      });
      expect(requests).toHaveLength(1);
    },
  );
});

it('仅 HEAD 404 返回缺失，GET 缺失与 HEAD 权限故障保留不同错误', async () => {
  await withEndpoint(
    ({ url }) =>
      url.includes('denied')
        ? { status: 403, body: errorXml('AccessDenied') }
        : { status: 404, body: errorXml('NoSuchKey') },
    async ({ storage }) => {
      await expect(storage.inspectObject('images/missing')).resolves.toBeNull();
      await expect(storage.readObject('images/missing')).rejects.toMatchObject({
        code: 'STORAGE_OBJECT_MISSING',
        httpStatusCode: 404,
        requestId: 'fixture-request',
      });
      await expect(
        storage.inspectObject('images/denied'),
      ).rejects.toMatchObject({
        code: 'STORAGE_OPERATION_FAILED',
        httpStatusCode: 403,
        operation: 'inspect',
      });
    },
  );
});

it('DELETE 只删除明确 Key，重复删除成功；权限或网络服务失败不能被视为已清理', async () => {
  await withEndpoint(
    ({ url }) =>
      url.includes('denied')
        ? { status: 403, body: errorXml('AccessDenied') }
        : url.includes('unavailable')
          ? { status: 503, body: errorXml('SlowDown') }
          : { status: 204 },
    async ({ storage, requests }) => {
      await storage.deleteObject('uploads/session/file');
      await storage.deleteObject('uploads/session/file');
      await expect(
        storage.deleteObject('uploads/session/denied'),
      ).rejects.toMatchObject({
        code: 'STORAGE_OPERATION_FAILED',
        serviceCode: 'AccessDenied',
        httpStatusCode: 403,
      });
      await expect(
        storage.deleteObject('uploads/session/unavailable'),
      ).rejects.toMatchObject({
        code: 'STORAGE_OPERATION_FAILED',
        serviceCode: 'SlowDown',
        httpStatusCode: 503,
        metadata: { attempts: 1 },
      });
      expect(requests).toHaveLength(4);
      expect(requests.every((request) => request.method === 'DELETE')).toBe(
        true,
      );
      expect(requests[0]?.url).toBe(requests[1]?.url);
    },
  );
});

it('错误保留诊断位置与安全 cause，但不回显凭据或完整签名 URL', async () => {
  await withEndpoint(
    () => ({
      status: 403,
      body: errorXml(
        'AccessDenied',
        'fixture-access fixture-secret https://example.test/image?X-Amz-Signature=hidden-signature',
      ),
    }),
    async ({ storage }) => {
      const error = await storage
        .deleteObject('images/image/original/file')
        .catch((cause: unknown) => cause);
      expect(error).toMatchObject({
        code: 'STORAGE_OPERATION_FAILED',
        storageId: 'test-storage',
        key: 'images/image/original/file',
        operation: 'delete',
        serviceCode: 'AccessDenied',
        httpStatusCode: 403,
        requestId: 'fixture-request',
        cause: expect.any(Error),
      });
      const diagnostic = `${String(error)} ${JSON.stringify(error)} ${String((error as Error).cause)}`;
      expect(diagnostic).not.toMatch(
        /fixture-access|fixture-secret|hidden-signature|X-Amz-Signature/,
      );
    },
  );
});

it('停用拒绝新读写、复制、签名；维护 HEAD 和 DELETE 仍可用，拒绝的输入流也会关闭', async () => {
  await withEndpoint(
    ({ method }): Reply =>
      method === 'DELETE'
        ? { status: 204 }
        : {
            status: 200,
            headers: {
              'content-length': '5',
              etag: '"existing"',
              'content-type': 'image/png',
            },
          },
    async ({ disabled, requests }) => {
      const source = Readable.from(['bytes']);
      for (const request of [
        disabled.writeObject('uploads/session/file', source, {
          size: 5,
          contentType: 'image/png',
        }),
        disabled.readObject('images/file'),
        disabled.copyObject(
          'uploads/session/file',
          'images/file',
          '"existing"',
        ),
        disabled.signUpload('uploads/session/file', 'image/png'),
        disabled.signRead('images/file', { method: 'HEAD' }),
      ])
        await expect(request).rejects.toMatchObject({
          code: 'STORAGE_DISABLED',
        });
      expect(source.destroyed).toBe(true);
      expect(requests).toHaveLength(0);
      await expect(
        disabled.inspectObject('images/file'),
      ).resolves.toMatchObject({ size: 5, etag: '"existing"' });
      await disabled.deleteObject('images/file');
      expect(requests.map((request) => request.method)).toEqual([
        'HEAD',
        'DELETE',
      ]);
    },
  );
});

it('PUT 源流失败关闭输入并保留错误，后续请求不受影响', async () => {
  await withEndpoint(
    () => ({ status: 200, headers: { 'content-length': '0' } }),
    async ({ storage }) => {
      const source = Readable.from(
        (async function* () {
          yield Buffer.alloc(64 * 1024);
          throw new Error('upload input failed');
        })(),
      );
      await expect(
        storage.writeObject('uploads/session/file', source, {
          size: 128 * 1024,
          contentType: 'image/png',
        }),
      ).rejects.toMatchObject({
        code: 'STORAGE_OPERATION_FAILED',
        operation: 'write',
        cause: { message: 'upload input failed' },
      });
      expect(source.destroyed).toBe(true);
      await expect(
        storage.inspectObject('images/after'),
      ).resolves.toMatchObject({ size: 0 });
    },
  );
});

it('PUT 传输中取消释放源流与在途 HTTP 连接，之后仍能请求', async () => {
  await withEndpoint(
    () => ({ status: 200, headers: { 'content-length': '0' } }),
    async ({ storage, incoming }) => {
      const controller = new AbortController();
      let sent = false;
      const source = new Readable({
        read() {
          if (!sent) {
            sent = true;
            this.push(Buffer.alloc(64 * 1024));
          }
        },
      });
      const write = storage.writeObject('uploads/session/file', source, {
        size: 128 * 1024,
        contentType: 'image/png',
        signal: controller.signal,
      });
      const rejected = expect(write).rejects.toMatchObject({
        code: 'STORAGE_OPERATION_FAILED',
        operation: 'write',
      });
      await expect.poll(() => incoming.length).toBe(1);
      controller.abort(new Error('cancel upload'));
      await rejected;
      expect(source.destroyed).toBe(true);
      await expect.poll(() => incoming[0]?.response.destroyed).toBe(true);
      await expect(
        storage.inspectObject('images/after'),
      ).resolves.toMatchObject({ size: 0 });
    },
  );
});

it.each(['signal', 'destroy'] as const)(
  'GET 未开始消费即 %s 时释放响应连接，之后仍能请求',
  async (action) => {
    await withEndpoint(
      ({ method }, response) => {
        if (method === 'HEAD')
          return { status: 200, headers: { 'content-length': '0' } };
        response.writeHead(200, {
          'content-length': String(128 * 1024),
          'content-type': 'image/png',
        });
        response.write(Buffer.alloc(64 * 1024));
      },
      async ({ storage, incoming }) => {
        const controller = new AbortController();
        const result = await storage.readObject('images/partial', {
          signal: controller.signal,
        });
        // Observe the failure even though the consumer never starts reading bytes.
        const closed = new Promise<void>((resolve) =>
          result.stream.once('close', resolve),
        );
        const errors: unknown[] = [];
        result.stream.on('error', (error) => errors.push(error));
        if (action === 'signal') controller.abort(new Error('cancel download'));
        else result.stream.destroy();
        await closed;
        expect(result.stream.destroyed).toBe(true);
        if (action === 'signal')
          expect(errors).toEqual([
            expect.objectContaining({
              code: 'STORAGE_OPERATION_FAILED',
              operation: 'read',
            }),
          ]);
        await expect.poll(() => incoming[0]?.response.destroyed).toBe(true);
        await expect(
          storage.inspectObject('images/after'),
        ).resolves.toMatchObject({ size: 0 });
      },
    );
  },
);

it('GET 消费中远端截断保留读取失败并关闭流，之后仍能请求', async () => {
  await withEndpoint(
    ({ method }, response) => {
      if (method === 'HEAD')
        return { status: 200, headers: { 'content-length': '0' } };
      response.writeHead(200, {
        'content-length': String(128 * 1024),
        'content-type': 'image/png',
      });
      response.write(Buffer.alloc(64 * 1024));
    },
    async ({ storage, incoming }) => {
      const result = await storage.readObject('images/truncated');
      const consumed = expect(buffer(result.stream)).rejects.toMatchObject({
        code: 'STORAGE_OPERATION_FAILED',
        operation: 'read',
        key: 'images/truncated',
      });
      incoming[0]!.response.destroy();
      await consumed;
      expect(result.stream.destroyed).toBe(true);
      await expect(
        storage.inspectObject('images/after'),
      ).resolves.toMatchObject({ size: 0 });
    },
  );
});

it('PUT 远端提前拒绝时关闭仍未结束的输入流，保留服务错误', async () => {
  await withEndpoint(
    () => ({ status: 200, headers: { 'content-length': '0' } }),
    async ({ storage, incoming }) => {
      let sent = false;
      const source = new Readable({
        read() {
          if (!sent) {
            sent = true;
            this.push(Buffer.alloc(64 * 1024));
          }
        },
      });
      const write = storage.writeObject('uploads/session/file', source, {
        size: 128 * 1024,
        contentType: 'image/png',
      });
      const rejected = expect(write).rejects.toMatchObject({
        code: 'STORAGE_OPERATION_FAILED',
        operation: 'write',
        serviceCode: 'AccessDenied',
        httpStatusCode: 403,
      });
      await expect.poll(() => incoming.length).toBe(1);
      incoming[0]!.response.writeHead(403, {
        'content-type': 'application/xml',
        connection: 'close',
      });
      incoming[0]!.response.end(errorXml('AccessDenied'));
      await rejected;
      expect(source.destroyed).toBe(true);
      await expect.poll(() => incoming[0]?.response.destroyed).toBe(true);
      await expect(
        storage.inspectObject('images/after'),
      ).resolves.toMatchObject({ size: 0 });
    },
  );
});

it('GET 消费中取消关闭响应和流，之后仍能请求', async () => {
  await withEndpoint(
    ({ method }, response) => {
      if (method === 'HEAD')
        return { status: 200, headers: { 'content-length': '0' } };
      response.writeHead(200, {
        'content-length': String(128 * 1024),
        'content-type': 'image/png',
      });
      response.write(Buffer.alloc(64 * 1024));
    },
    async ({ storage, incoming }) => {
      const controller = new AbortController();
      const result = await storage.readObject('images/partial', {
        signal: controller.signal,
      });
      const firstChunk = once(result.stream, 'data');
      const consumed = expect(buffer(result.stream)).rejects.toMatchObject({
        code: 'STORAGE_OPERATION_FAILED',
        operation: 'read',
      });
      await firstChunk;
      controller.abort(new Error('cancel after first bytes'));
      await consumed;
      expect(result.stream.destroyed).toBe(true);
      await expect.poll(() => incoming[0]?.response.destroyed).toBe(true);
      await expect(
        storage.inspectObject('images/after'),
      ).resolves.toMatchObject({ size: 0 });
    },
  );
});

it('GET 等待下一块时消费者 destroy 立即关闭远端连接', async () => {
  await withEndpoint(
    ({ method }, response) => {
      if (method === 'HEAD')
        return { status: 200, headers: { 'content-length': '0' } };
      response.writeHead(200, {
        'content-length': String(128 * 1024),
        'content-type': 'image/png',
      });
      response.write(Buffer.alloc(64 * 1024));
    },
    async ({ storage, incoming }) => {
      const result = await storage.readObject('images/partial');
      const firstChunk = once(result.stream, 'data');
      result.stream.resume();
      await firstChunk;
      // Let the flowing consumer request its next chunk before destroying it.
      await setImmediate();
      const closed = once(result.stream, 'close');
      result.stream.destroy();
      await closed;
      expect(result.stream.destroyed).toBe(true);
      await expect.poll(() => incoming[0]?.response.destroyed).toBe(true);
      await expect(
        storage.inspectObject('images/after'),
      ).resolves.toMatchObject({ size: 0 });
    },
  );
});

it('请求前已取消时不发 HTTP，PUT 输入仍被关闭', async () => {
  await withEndpoint(
    () => ({ status: 204 }),
    async ({ storage, incoming }) => {
      const controller = new AbortController();
      controller.abort(new Error('cancelled before request'));
      const source = Readable.from(['bytes']);
      await expect(
        storage.writeObject('uploads/session/file', source, {
          size: 5,
          contentType: 'image/png',
          signal: controller.signal,
        }),
      ).rejects.toMatchObject({
        code: 'STORAGE_OPERATION_FAILED',
        operation: 'write',
      });
      await expect(
        storage.readObject('images/file', { signal: controller.signal }),
      ).rejects.toMatchObject({
        code: 'STORAGE_OPERATION_FAILED',
        operation: 'read',
      });
      expect(source.destroyed).toBe(true);
      expect(incoming).toHaveLength(0);
    },
  );
});

it('远端连接重置不当作对象缺失或清理成功，也不暗中重试', async () => {
  await withEndpoint(
    (_request, response) => {
      response.destroy();
    },
    async ({ storage, requests }) => {
      await expect(storage.inspectObject('images/file')).rejects.toMatchObject({
        code: 'STORAGE_OPERATION_FAILED',
        operation: 'inspect',
        storageId: 'test-storage',
        key: 'images/file',
      });
      await expect(storage.deleteObject('images/file')).rejects.toMatchObject({
        code: 'STORAGE_OPERATION_FAILED',
        operation: 'delete',
        storageId: 'test-storage',
        key: 'images/file',
      });
      expect(requests.map((request) => request.method)).toEqual([
        'HEAD',
        'DELETE',
      ]);
    },
  );
});
