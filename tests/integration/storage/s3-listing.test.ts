import { once } from 'node:events';
import { createServer, type ServerResponse } from 'node:http';
import { expect, it } from 'vitest';
import { createS3Storage } from '../../../src/server/storage/s3.ts';

const namespace = '照片 + %/ariso/test-storage/';
const xmlEscape = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
const listing = (
  entries: { key: string; size: number }[] = [],
  next?: string,
) =>
  `<ListBucketResult><IsTruncated>${Boolean(next)}</IsTruncated>${
    next
      ? `<NextContinuationToken>${xmlEscape(next)}</NextContinuationToken>`
      : ''
  }${entries
    .map(
      ({ key, size }) =>
        `<Contents><Key>${xmlEscape(key)}</Key><Size>${size}</Size></Contents>`,
    )
    .join('')}</ListBucketResult>`;

// Exercise the actual SDK and HTTP protocol; not remote service compatibility evidence.
async function withEndpoint(
  respond: (url: URL, response: ServerResponse) => void,
  run: (fixture: {
    storage: ReturnType<typeof createS3Storage>;
    disabled: ReturnType<typeof createS3Storage>;
    requests: URL[];
  }) => Promise<void>,
) {
  const requests: URL[] = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    requests.push(url);
    respond(url, response);
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
    pathPrefix: '/照片 + %/',
    forcePathStyle: true,
    credentials: {
      accessKeyId: 'fixture-access',
      secretAccessKey: 'fixture-secret',
    },
  };
  const storage = createS3Storage(config);
  const disabled = createS3Storage({ ...config, enabled: false });
  try {
    await run({ storage, disabled, requests });
  } finally {
    storage.destroy();
    disabled.destroy();
    const closed = once(server, 'close');
    server.closeAllConnections();
    server.close();
    await closed;
  }
}

function reply(response: ServerResponse, body: string, status = 200) {
  response.writeHead(status, {
    'content-type': 'application/xml',
    'x-amz-request-id': 'listing-request',
  });
  response.end(body);
}

it('列举不请求URL编码，保留SeaweedFS中空格、literal +、百分号和XML字符的原始Key', async () => {
  const key = `${namespace}images/中文 + %2F?&<.bin`;
  await withEndpoint(
    (url, response) => {
      const encoded = url.searchParams.get('encoding-type') === 'url';
      // Real SeaweedFS XML percent-encodes directories but query-encodes the filename.
      const returnedKey = encoded
        ? `${encodeURIComponent(`${namespace}images/`)}${new URLSearchParams({ key: '中文 + %2F?&<.bin' }).toString().slice(4)}`
        : xmlEscape(key);
      reply(
        response,
        `<ListBucketResult>${encoded ? '<EncodingType>url</EncodingType>' : ''}<IsTruncated>false</IsTruncated><Contents><Key>${returnedKey}</Key><Size>7</Size></Contents></ListBucketResult>`,
      );
    },
    async ({ storage, requests }) => {
      expect(await Array.fromAsync(storage.listObjects())).toEqual([
        [{ key: 'images/中文 + %2F?&<.bin', size: 7 }],
      ]);
      expect(requests[0].searchParams.has('encoding-type')).toBe(false);
    },
  );
});

it('禁用配置仍按固定命名空间逐页列举，保留原始Key、大小及不透明续页令牌', async () => {
  const token = 'opaque + %2F/中文&token';
  await withEndpoint(
    (url, response) =>
      reply(
        response,
        url.searchParams.has('continuation-token')
          ? listing([
              { key: `${namespace}uploads/session/file.partial`, size: 9 },
            ])
          : listing(
              [
                { key: `${namespace}images/中文 + %2F?.png`, size: 127 },
                { key: `${namespace}probes/zero`, size: 0 },
              ],
              token,
            ),
      ),
    async ({ disabled, requests }) => {
      const batches = await Array.fromAsync(
        disabled.listObjects({ batchSize: 2 }),
      );
      expect(batches).toEqual([
        [
          { key: 'images/中文 + %2F?.png', size: 127 },
          { key: 'probes/zero', size: 0 },
        ],
        [{ key: 'uploads/session/file.partial', size: 9 }],
      ]);
      expect(requests).toHaveLength(2);
      for (const url of requests) {
        expect(url.pathname).toBe('/test-bucket/');
        expect(url.searchParams.get('prefix')).toBe(namespace);
        expect(url.searchParams.get('list-type')).toBe('2');
        expect(url.searchParams.has('encoding-type')).toBe(false);
        expect(url.searchParams.get('max-keys')).toBe('2');
        expect(url.searchParams.has('delimiter')).toBe(false);
      }
      expect(requests[0].searchParams.has('continuation-token')).toBe(false);
      expect(requests[1].searchParams.get('continuation-token')).toBe(token);
    },
  );
});

it('空结果不产生空批次，默认最多1000个对象且空续页仍会继续', async () => {
  await withEndpoint(
    (url, response) =>
      reply(
        response,
        listing(
          [],
          url.searchParams.has('continuation-token') ? undefined : 'next',
        ),
      ),
    async ({ storage, requests }) => {
      expect(await Array.fromAsync(storage.listObjects())).toEqual([]);
      expect(requests).toHaveLength(2);
      expect(
        requests.every((url) => url.searchParams.get('max-keys') === '1000'),
      ).toBe(true);
    },
  );
});

it('无效批大小在请求前失败', async () => {
  await withEndpoint(
    (_url, response) => reply(response, listing()),
    async ({ storage, requests }) => {
      for (const batchSize of [0, -1, 1001, 1.5, NaN, Infinity])
        await expect(storage.listObjects({ batchSize }).next()).rejects.toThrow(
          'batchSize',
        );
      expect(requests).toHaveLength(0);
    },
  );
});

it('后续页失败保留存储、命名空间、操作和远端诊断，不暗中重试或当作结束', async () => {
  await withEndpoint(
    (url, response) =>
      reply(
        response,
        url.searchParams.has('continuation-token')
          ? '<Error><Code>AccessDenied</Code><Message>listing denied</Message></Error>'
          : listing([{ key: `${namespace}images/first`, size: 1 }], 'next'),
        url.searchParams.has('continuation-token') ? 403 : 200,
      ),
    async ({ storage, requests }) => {
      const iterator = storage.listObjects();
      expect(await iterator.next()).toEqual({
        done: false,
        value: [{ key: 'images/first', size: 1 }],
      });
      await expect(iterator.next()).rejects.toMatchObject({
        code: 'STORAGE_OPERATION_FAILED',
        storageId: 'test-storage',
        operation: 'list',
        key: namespace,
        serviceCode: 'AccessDenied',
        httpStatusCode: 403,
        requestId: 'listing-request',
      });
      expect(requests).toHaveLength(2);
    },
  );
});

it.each([
  '<html>gateway error</html>',
  '<ListBucketResult><IsTruncated>true</IsTruncated></ListBucketResult>',
  '<ListBucketResult><IsTruncated>false</IsTruncated><Contents><Key>missing-size</Key></Contents></ListBucketResult>',
  listing([{ key: '照片 + %/ariso/other-storage/images/file', size: 10 }]),
])('错误的成功响应不能伪装为空结果：%s', async (body) => {
  await withEndpoint(
    (_url, response) => reply(response, body),
    async ({ storage }) => {
      await expect(storage.listObjects().next()).rejects.toMatchObject({
        code: 'STORAGE_OPERATION_FAILED',
        operation: 'list',
        httpStatusCode: 200,
        requestId: 'listing-request',
      });
    },
  );
});

it('已取消的列举不发请求，批次之间取消不请求下一页', async () => {
  await withEndpoint(
    (_url, response) =>
      reply(
        response,
        listing([{ key: `${namespace}images/first`, size: 1 }], 'next'),
      ),
    async ({ storage, requests }) => {
      const controller = new AbortController();
      controller.abort(new Error('cancelled before request'));
      await expect(
        storage.listObjects({ signal: controller.signal }).next(),
      ).rejects.toMatchObject({ operation: 'list' });
      expect(requests).toHaveLength(0);
      const between = new AbortController();
      const iterator = storage.listObjects({ signal: between.signal });
      expect((await iterator.next()).done).toBe(false);
      between.abort(new Error('cancelled between pages'));
      await expect(iterator.next()).rejects.toMatchObject({
        operation: 'list',
      });
      expect(requests).toHaveLength(1);
    },
  );
});

it('请求途中取消会断开HTTP连接并返回列举错误', async () => {
  const controller = new AbortController();
  let observedResponse: ServerResponse | undefined;
  await withEndpoint(
    (_url, response) => {
      observedResponse = response;
      controller.abort(new Error('cancelled during request'));
    },
    async ({ storage, requests }) => {
      await expect(
        storage.listObjects({ signal: controller.signal }).next(),
      ).rejects.toMatchObject({
        code: 'STORAGE_OPERATION_FAILED',
        operation: 'list',
      });
      await expect.poll(() => observedResponse?.destroyed).toBe(true);
      expect(requests).toHaveLength(1);
    },
  );
});

it('消费者停止迭代后不预取后续页', async () => {
  await withEndpoint(
    (_url, response) =>
      reply(
        response,
        listing([{ key: `${namespace}images/first`, size: 1 }], 'next'),
      ),
    async ({ storage, requests }) => {
      for await (const batch of storage.listObjects()) {
        expect(batch).toEqual([{ key: 'images/first', size: 1 }]);
        break;
      }
      expect(requests).toHaveLength(1);
    },
  );
});

it('远端重复续页令牌时失败，避免无限请求同一页', async () => {
  await withEndpoint(
    (_url, response) =>
      reply(
        response,
        listing([{ key: `${namespace}images/first`, size: 1 }], 'same-token'),
      ),
    async ({ storage, requests }) => {
      const iterator = storage.listObjects();
      expect((await iterator.next()).done).toBe(false);
      await expect(iterator.next()).rejects.toMatchObject({
        operation: 'list',
        httpStatusCode: 200,
      });
      expect(requests).toHaveLength(2);
    },
  );
});
