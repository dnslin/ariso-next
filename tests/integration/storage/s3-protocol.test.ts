import { once } from 'node:events';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import { CopyObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { expect, it } from 'vitest';
import type { StorageConfig } from '../../experiments/storage-s3/config.ts';
import {
  checkAnonymous,
  checkCapabilities,
  createClient,
  errorEvidence,
  unsignedObjectUrl,
} from '../../experiments/storage-s3/protocol.ts';
import { newReport, runService } from '../../experiments/storage-s3/suite.ts';

type Reply = { status: number; body: string; headers?: Record<string, string> };
type Request = {
  method: string | undefined;
  url: string;
  headers: IncomingHttpHeaders;
  body: string;
};

const errorXml = (code: string) =>
  `<Error><Code>${code}</Code><Message>Protocol fixture error</Message><RequestId>fixture-request</RequestId></Error>`;

// Real SDK serialization, HTTP and deserialization; this is not a service compatibility report.
async function withEndpoint(
  respond: (request: Request) => Reply,
  run: (fixture: {
    config: StorageConfig;
    client: S3Client;
    requests: Request[];
  }) => Promise<void>,
) {
  const requests: Request[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const observed = {
        method: request.method,
        url: request.url ?? '/',
        headers: request.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      };
      requests.push(observed);
      const reply = respond(observed);
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
    throw new Error('Expected a TCP fixture address');
  const config: StorageConfig = {
    service: 'aws',
    endpoint: `http://127.0.0.1:${address.port}`,
    region: 'us-east-1',
    bucket: 'protocol-fixture',
    forcePathStyle: true,
    credentials: {
      accessKeyId: 'fixture-access',
      secretAccessKey: 'fixture-secret',
    },
    serviceVersion: 'local HTTP fixture',
    revision: 'fixture-revision',
    ownerConfirmation: {
      revision: 'fixture-revision',
      privateBucketAndNoPublicAliases: true,
      evidence: 'Local protocol regression only',
    },
  };
  const client = createClient(config);
  try {
    await run({ config, client, requests });
  } finally {
    client.destroy();
    const closed = once(server, 'close');
    server.closeAllConnections();
    server.close();
    await closed;
  }
}

it.each(['Enabled', 'Suspended'])(
  '真实 SDK 读取版本状态 %s 后拒绝 Bucket',
  async (status) => {
    await withEndpoint(
      () => ({
        status: 200,
        body: `<VersioningConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Status>${status}</Status></VersioningConfiguration>`,
      }),
      async ({ client, config, requests }) => {
        await expect(checkCapabilities(client, config)).rejects.toThrow(
          `Unsupported versioning: ${status}`,
        );
        expect(requests).toHaveLength(1);
        expect(requests[0]?.url).toContain('versioning');
      },
    );
  },
);

it.each([
  { name: 'AccessDenied', status: 403, body: errorXml('AccessDenied') },
  { name: 'NotImplemented', status: 501, body: errorXml('NotImplemented') },
  { name: '未知空响应', status: 200, body: '<ObjectLockConfiguration/>' },
  {
    name: '已开启锁',
    status: 200,
    body: '<ObjectLockConfiguration><ObjectLockEnabled>Enabled</ObjectLockEnabled></ObjectLockConfiguration>',
  },
  {
    name: '错误状态的未配置锁声明',
    status: 403,
    body: errorXml('ObjectLockConfigurationNotFoundError'),
  },
])('锁配置 $name 不能算能力通过', async ({ status, body }) => {
  await withEndpoint(
    ({ url }) =>
      new URL(url, 'http://fixture').searchParams.has('versioning')
        ? { status: 200, body: '<VersioningConfiguration/>' }
        : { status, body },
    async ({ client, config }) => {
      await expect(checkCapabilities(client, config)).rejects.toThrow(
        /Lock configuration unknown|Object lock is enabled or unconfirmed/,
      );
    },
  );
});

it('未版本化且明确 404 ObjectLockConfigurationNotFoundError 才通过配置 API 检查', async () => {
  await withEndpoint(
    ({ url }) =>
      new URL(url, 'http://fixture').searchParams.has('versioning')
        ? { status: 200, body: '<VersioningConfiguration/>' }
        : {
            status: 404,
            body: errorXml('ObjectLockConfigurationNotFoundError'),
          },
    async ({ client, config, requests }) => {
      const result = await checkCapabilities(client, config);
      expect(result).toMatchObject({
        basis: 'configuration-apis',
        lock: {
          name: 'ObjectLockConfigurationNotFoundError',
          httpStatusCode: 404,
          requestId: 'fixture-request',
        },
      });
      expect(requests.map(({ headers }) => headers.authorization)).toEqual([
        expect.stringContaining('AWS4-HMAC-SHA256'),
        expect.stringContaining('AWS4-HMAC-SHA256'),
      ]);
    },
  );
});

it('匿名探测使用 SDK 编码的对象地址且不发送 Authorization、Cookie 或签名', async () => {
  await withEndpoint(
    () => ({ status: 403, body: errorXml('AccessDenied') }),
    async ({ client, config, requests }) => {
      const key = '探测/a + %.svg';
      const url = await unsignedObjectUrl(client, config.bucket, key);
      expect(requests).toHaveLength(0);
      expect(decodeURIComponent(new URL(url).pathname)).toBe(
        `/${config.bucket}/${key}`,
      );
      expect(new URL(url).search).toBe('');
      await expect(checkAnonymous(url)).resolves.toMatchObject({
        status: 403,
        code: 'AccessDenied',
        requestId: 'fixture-request',
      });
      expect(requests).toHaveLength(1);
      expect(requests[0]).toMatchObject({ method: 'GET' });
      expect(requests[0]?.headers.authorization).toBeUndefined();
      expect(requests[0]?.headers.cookie).toBeUndefined();
    },
  );
});

it.each([
  { name: '公开 200', status: 200, body: '<svg/>' },
  { name: '公开 204', status: 204, body: '' },
  { name: '跳转 302', status: 302, body: '' },
  { name: '未知 404', status: 404, body: errorXml('NoSuchKey') },
  { name: '服务错误 500', status: 500, body: errorXml('InternalError') },
  {
    name: '非 AccessDenied 403',
    status: 403,
    body: errorXml('InvalidAccessKeyId'),
  },
  {
    name: '代理 HTML 403',
    status: 403,
    body: '<html><body>Forbidden</body></html>',
  },
])('匿名 $name 不算私有证据，重定向也不跟随', async ({ status, body }) => {
  await withEndpoint(
    ({ url }) =>
      url === '/redirect-target'
        ? { status: 403, body: errorXml('AccessDenied') }
        : { status, body, headers: { location: '/redirect-target' } },
    async ({ config, requests }) => {
      await expect(
        checkAnonymous(`${config.endpoint}/probe`),
      ).rejects.toThrow();
      expect(requests.map(({ url }) => url)).toEqual(['/probe']);
    },
  );
});

it('CopyObject 的 HTTP 200 内部错误由真实 SDK 抛出，保留服务 code 和 requestId', async () => {
  await withEndpoint(
    () => ({ status: 200, body: errorXml('InternalError') }),
    async ({ client, config, requests }) => {
      let caught: unknown;
      try {
        await client.send(
          new CopyObjectCommand({
            Bucket: config.bucket,
            Key: 'destination.svg',
            CopySource: `${config.bucket}/source.svg`,
            CopySourceIfMatch: '"source-etag"',
          }),
        );
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(Error);
      expect(errorEvidence(caught)).toMatchObject({
        name: 'InternalError',
        message: 'Protocol fixture error',
        requestId: 'fixture-request',
      });
      expect(requests).toHaveLength(1);
      expect(requests[0]?.headers['x-amz-copy-source-if-match']).toBe(
        '"source-etag"',
      );
    },
  );
});

it('普通 Bucket 检查失败保存 failed 报告，且不创建或删除对象', async () => {
  await withEndpoint(
    () => ({
      status: 200,
      body: '<VersioningConfiguration><Status>Enabled</Status></VersioningConfiguration>',
    }),
    async ({ config, requests }) => {
      const report = newReport('aws');
      const saved: string[] = [];
      await runService(config, report, async () => {
        saved.push(JSON.stringify(report));
      });
      expect(report.status).toBe('failed');
      expect(report.keys).toEqual([]);
      expect(report.checks).toEqual([
        expect.objectContaining({ name: 'ordinary-bucket', status: 'failed' }),
      ]);
      expect(JSON.parse(saved.at(-1)!)).toEqual(report);
      expect(requests).toHaveLength(1);
      expect(requests[0]?.method).toBe('GET');
      expect(requests[0]?.url).toContain('versioning');
    },
  );
});

it('对象写入前保存明确 Key，匿名检测失败后仍删除全部 Key 并保留失败报告', async () => {
  const objects = new Map<string, { body: string; etag: string }>();
  const saved: ReturnType<typeof newReport>[] = [];
  const writesWereRegistered: boolean[] = [];
  const deleted: string[] = [];
  await withEndpoint(
    ({ method, url, headers, body }) => {
      const parsed = new URL(url, 'http://fixture');
      if (parsed.searchParams.has('versioning'))
        return { status: 200, body: '<VersioningConfiguration/>' };
      if (parsed.searchParams.has('object-lock'))
        return {
          status: 404,
          body: errorXml('ObjectLockConfigurationNotFoundError'),
        };
      const key = decodeURIComponent(parsed.pathname)
        .split('/')
        .slice(2)
        .join('/');
      const object = objects.get(key);
      if (method === 'PUT') {
        writesWereRegistered.push(saved.at(-1)?.keys.includes(key) ?? false);
        if (headers['x-amz-copy-source']) {
          const copyKey = decodeURIComponent(
            String(headers['x-amz-copy-source']),
          )
            .split('/')
            .slice(1)
            .join('/');
          const source = objects.get(copyKey);
          if (!source || source.etag !== headers['x-amz-copy-source-if-match'])
            return { status: 412, body: errorXml('PreconditionFailed') };
          objects.set(key, { ...source });
          return {
            status: 200,
            body: `<CopyObjectResult><ETag>${source.etag}</ETag></CopyObjectResult>`,
          };
        }
        objects.set(key, {
          body,
          etag: object ? '"changed"' : '"original"',
        });
        return { status: 200, body: '' };
      }
      if (method === 'DELETE') {
        deleted.push(key);
        objects.delete(key);
        return {
          status: 204,
          body: '',
          headers: { 'x-amz-delete-marker': 'false' },
        };
      }
      if (!headers.authorization)
        return { status: 403, body: '<html>Proxy denied request</html>' };
      if (!object) return { status: 404, body: errorXml('NoSuchKey') };
      if (headers['if-match'] && headers['if-match'] !== object.etag)
        return { status: 412, body: errorXml('PreconditionFailed') };
      return {
        status: 200,
        body: method === 'HEAD' ? '' : object.body,
        headers: {
          'content-type': 'image/svg+xml',
          'content-length': String(Buffer.byteLength(object.body)),
          etag: object.etag,
        },
      };
    },
    async ({ config }) => {
      const report = newReport('aws');
      await runService(config, report, async () => {
        saved.push(structuredClone(report));
      });
      expect(report.status).toBe('failed');
      expect(report.checks).toEqual([
        expect.objectContaining({ name: 'ordinary-bucket', status: 'passed' }),
        expect.objectContaining({
          name: 'stream-put-get-head',
          status: 'passed',
        }),
        expect.objectContaining({
          name: 'anonymous-private-get',
          status: 'failed',
        }),
        ...report.keys.map((key) =>
          expect.objectContaining({ name: `delete:${key}`, status: 'passed' }),
        ),
      ]);
      expect(writesWereRegistered).toEqual([true, true, true, true]);
      expect(deleted).toEqual(report.keys);
      expect(objects.size).toBe(0);
      expect(saved.at(-1)).toEqual(report);
    },
  );
});
