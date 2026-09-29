import { once } from 'node:events';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { expect, it } from 'vitest';
import { createS3Storage } from '../../../src/server/storage/s3.ts';

const errorXml = (code: string, message = 'Protocol error') =>
  `<Error><Code>${code}</Code><Message>${message}</Message><RequestId>request-157</RequestId></Error>`;
async function withEndpoint(
  respond: (request: IncomingMessage, response: ServerResponse) => void,
  run: (store: ReturnType<typeof createS3Storage>) => Promise<void>,
  enabled = false,
) {
  const server = createServer(respond);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Expected TCP address');
  const store = createS3Storage({
    id: 'probe-config',
    enabled,
    endpoint: `http://127.0.0.1:${address.port}`,
    region: 'us-east-1',
    bucket: 'private',
    pathPrefix: '前缀 + %',
    forcePathStyle: true,
    credentials: { accessKeyId: 'access-157', secretAccessKey: 'secret-157' },
  });
  try {
    await run(store);
  } finally {
    store.destroy();
    const closed = once(server, 'close');
    server.closeAllConnections();
    server.close();
    await closed;
  }
}
function xml(response: ServerResponse, status: number, body: string) {
  response.writeHead(status, {
    'content-type': 'application/xml',
    'x-amz-request-id': 'request-157',
  });
  response.end(body);
}
it.each(['Enabled', 'Suspended', 'Unexpected'])(
  '拒绝版本状态 %s',
  async (status) => {
    await withEndpoint(
      (_request, response) =>
        xml(
          response,
          200,
          `<VersioningConfiguration><Status>${status}</Status></VersioningConfiguration>`,
        ),
      async (store) => {
        await expect(store.checkBucket()).rejects.toMatchObject({
          code: 'STORAGE_BUCKET_UNSUPPORTED',
          operation: 'check-bucket',
        });
      },
    );
  },
);
it.each([
  [403, errorXml('AccessDenied')],
  [501, errorXml('NotImplemented')],
  [200, '<ObjectLockConfiguration/>'],
  [
    200,
    '<ObjectLockConfiguration><ObjectLockEnabled>Enabled</ObjectLockEnabled></ObjectLockConfiguration>',
  ],
  [403, errorXml('ObjectLockConfigurationNotFoundError')],
])('不明确的锁状态 %s 不通过', async (status, body) => {
  await withEndpoint(
    (request, response) =>
      xml(
        response,
        request.url?.includes('versioning') ? 200 : Number(status),
        request.url?.includes('versioning')
          ? '<VersioningConfiguration/>'
          : String(body),
      ),
    async (store) => {
      await expect(store.checkBucket()).rejects.toMatchObject({
        operation: 'check-bucket',
      });
    },
  );
});
it('停用配置可自动检查普通 Bucket，报告来源与诊断信息', async () => {
  await withEndpoint(
    (request, response) => {
      expect(request.headers.authorization).toContain('AWS4-HMAC-SHA256');
      xml(
        response,
        request.url?.includes('versioning') ? 200 : 404,
        request.url?.includes('versioning')
          ? '<VersioningConfiguration/>'
          : errorXml('ObjectLockConfigurationNotFoundError'),
      );
    },
    async (store) => {
      await expect(store.checkBucket()).resolves.toMatchObject({
        basis: 'configuration-apis',
        automaticVersionOrLockDetection: true,
      });
    },
  );
});
it('匿名读取同一规范 Key，无 Authorization、Cookie 或查询签名', async () => {
  await withEndpoint(
    (request, response) => {
      expect(decodeURIComponent(request.url!)).toBe(
        '/private/前缀 + %/ariso/probe-config/probes/中文 + %2F?.txt',
      );
      expect(request.headers.authorization).toBeUndefined();
      expect(request.headers.cookie).toBeUndefined();
      xml(response, 403, errorXml('AccessDenied'));
    },
    async (store) => {
      await expect(
        store.checkAnonymous('probes/中文 + %2F?.txt'),
      ).resolves.toMatchObject({
        httpStatusCode: 403,
        serviceCode: 'AccessDenied',
        requestId: 'request-157',
      });
    },
  );
});
it.each([
  [200, 'public'],
  [204, ''],
  [302, ''],
  [404, errorXml('NoSuchKey')],
  [500, errorXml('InternalError')],
  [403, errorXml('InvalidAccessKeyId')],
  [403, '<html>Forbidden</html>'],
  [403, '<html><Code>AccessDenied</Code></html>'],
  [403, '<Error><Code>AccessDenied</Code>'],
  [400, errorXml('InvalidArgument', 'Authorization')],
])('匿名 %s 未明确拒绝就失败，不跟随重定向', async (status, body) => {
  let count = 0;
  await withEndpoint(
    (_request, response) => {
      count++;
      response.setHeader('location', '/redirect-target');
      xml(response, Number(status), String(body));
    },
    async (store) => {
      await expect(store.checkAnonymous('probes/id')).rejects.toMatchObject({
        operation: 'anonymous-read',
      });
      expect(count).toBe(1);
    },
  );
});
it('匿名错误脱敏，保留服务码及 requestId', async () => {
  await withEndpoint(
    (_request, response) =>
      xml(
        response,
        500,
        errorXml(
          'InternalError',
          'secret-157 access-157 https://example.com/?X-Amz-Signature=secret-value',
        ),
      ),
    async (store) => {
      const error = await store
        .checkAnonymous('probes/id')
        .catch((error: unknown) => error);
      expect(error).toMatchObject({
        serviceCode: 'InternalError',
        requestId: 'request-157',
      });
      expect(String(error)).not.toContain('secret-157');
      expect(String(error)).not.toContain('access-157');
      expect(String(error)).not.toContain('secret-value');
    },
  );
});
it('取消正在读取的匿名响应释放请求', async () => {
  let started!: () => void;
  const receiving = new Promise<void>((resolve) => {
    started = resolve;
  });
  await withEndpoint(
    (_request, response) => {
      response.writeHead(403, { 'content-type': 'application/xml' });
      response.write('<Error>');
      started();
    },
    async (store) => {
      const controller = new AbortController();
      const result = store.checkAnonymous('probes/id', {
        signal: controller.signal,
      });
      await receiving;
      controller.abort();
      await expect(result).rejects.toMatchObject({
        operation: 'anonymous-read',
        code: 'STORAGE_OPERATION_FAILED',
      });
    },
  );
});

it('服务码和嵌套原因同样脱敏，避免 XML 回显凭据', async () => {
  await withEndpoint(
    (_request, response) =>
      xml(response, 500, errorXml('secret-157', 'credential echoed')),
    async (store) => {
      const error = await store
        .checkAnonymous('probes/id')
        .catch((error: unknown) => error);
      expect(error).toMatchObject({
        serviceCode: '[redacted]',
        cause: { name: '[redacted]' },
      });
    },
  );
});
it('无效错误 XML 仍保留状态和 requestId', async () => {
  await withEndpoint(
    (_request, response) =>
      xml(response, 403, '<Error><Code>AccessDenied</Code>'),
    async (store) => {
      await expect(store.checkAnonymous('probes/id')).rejects.toMatchObject({
        httpStatusCode: 403,
        requestId: 'request-157',
      });
    },
  );
});

it.each(['<Unexpected/>', '<html>upstream page</html>', ''])(
  '未知版本配置 200 %s 不得被当作未版本化',
  async (body) => {
    let requests = 0;
    await withEndpoint(
      (request, response) => {
        requests++;
        xml(
          response,
          request.url?.includes('versioning') ? 200 : 404,
          request.url?.includes('versioning')
            ? body
            : errorXml('ObjectLockConfigurationNotFoundError'),
        );
      },
      async (store) => {
        await expect(store.checkBucket()).rejects.toMatchObject({
          operation: 'check-bucket',
          httpStatusCode: 200,
          requestId: 'request-157',
        });
        expect(requests).toBe(1);
      },
    );
  },
);
it.each([200, 302, 404])(
  '匿名 %s 收到头即拒绝并释放未结束的响应',
  async (status) => {
    await withEndpoint(
      (_request, response) => {
        response.writeHead(status, { 'content-type': 'application/xml' });
        response.write('incomplete response');
      },
      async (store) => {
        await expect(store.checkAnonymous('probes/id')).rejects.toMatchObject({
          operation: 'anonymous-read',
          httpStatusCode: status,
        });
      },
    );
  },
);
it('匿名错误 XML 超过 64 KiB 就取消读取', async () => {
  await withEndpoint(
    (_request, response) => {
      response.writeHead(403, { 'content-type': 'application/xml' });
      response.write('<Error>' + ' '.repeat(65_536));
    },
    async (store) => {
      await expect(store.checkAnonymous('probes/id')).rejects.toMatchObject({
        operation: 'anonymous-read',
        httpStatusCode: 403,
      });
    },
  );
});

it('版本配置响应超时返回 STORAGE_TIMEOUT', async () => {
  await withEndpoint(
    (_request, response) => {
      response.writeHead(200, { 'content-type': 'application/xml' });
      response.write('<VersioningConfiguration>');
    },
    async (store) => {
      await expect(
        store.checkBucket({ signal: AbortSignal.timeout(25) }),
      ).rejects.toMatchObject({ code: 'STORAGE_TIMEOUT' });
    },
  );
});
it('匿名 XML 超时返回 STORAGE_TIMEOUT', async () => {
  await withEndpoint(
    (_request, response) => {
      response.writeHead(403, { 'content-type': 'application/xml' });
      response.write('<Error>');
    },
    async (store) => {
      await expect(
        store.checkAnonymous('probes/id', { signal: AbortSignal.timeout(25) }),
      ).rejects.toMatchObject({ code: 'STORAGE_TIMEOUT' });
    },
  );
});

it.each(['headers', 'body'] as const)(
  '鉴权读取 %s 超时返回 STORAGE_TIMEOUT',
  async (phase) => {
    await withEndpoint(
      (_request, response) => {
        if (phase === 'body') {
          response.writeHead(200, {
            'content-type': 'application/octet-stream',
            'content-length': '64',
          });
          response.write('a');
        }
      },
      async (store) => {
        const signal = AbortSignal.timeout(100);
        const reading = store.readObject('probes/id', { signal });
        const pending =
          phase === 'headers' ? reading : (await reading).stream.toArray();
        await expect(pending).rejects.toMatchObject({
          operation: 'read',
          code: 'STORAGE_TIMEOUT',
        });
      },
      true,
    );
  },
);

it.each(['headers', 'body'] as const)(
  '主动取消鉴权读取 %s 不误报超时',
  async (phase) => {
    let started!: () => void;
    const receiving = new Promise<void>((resolve) => {
      started = resolve;
    });
    await withEndpoint(
      (_request, response) => {
        if (phase === 'body') {
          response.writeHead(200, {
            'content-type': 'application/octet-stream',
            'content-length': '64',
          });
          response.write('a');
        }
        started();
      },
      async (store) => {
        const controller = new AbortController();
        const reading = store.readObject('probes/id', {
          signal: controller.signal,
        });
        const pending =
          phase === 'headers' ? reading : (await reading).stream.toArray();
        const rejected = expect(pending).rejects.toMatchObject({
          operation: 'read',
          code: 'STORAGE_OPERATION_FAILED',
        });
        await receiving;
        controller.abort(new Error('caller disconnected'));
        await rejected;
      },
      true,
    );
  },
);

it.each([201, 204])(
  '版本接口非标准成功状态 %s 不能证明未版本化',
  async (status) => {
    await withEndpoint(
      (request, response) => {
        xml(
          response,
          request.url?.includes('versioning') ? status : 404,
          request.url?.includes('versioning')
            ? ''
            : errorXml('ObjectLockConfigurationNotFoundError'),
        );
      },
      async (store) => {
        await expect(store.checkBucket()).rejects.toMatchObject({
          operation: 'check-bucket',
          httpStatusCode: status,
        });
      },
    );
  },
);
