import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createServer, type IncomingHttpHeaders } from 'node:http';

export type S3FixtureObject = {
  bytes: Buffer;
  contentType: string;
  etag: string;
};
export type S3FixtureRequest = {
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
};

/** Real SDK HTTP boundary only. This fixture does not establish service compatibility. */
export async function startUploadEndpoint(
  options: { corsOrigin?: string; control?: boolean } = {},
) {
  const objects = new Map<string, S3FixtureObject>();
  const requests: S3FixtureRequest[] = [];
  const faults: {
    beforeGet?: (path: string) => void | Promise<void>;
    beforeCopy?: (path: string) => void | Promise<void>;
    copy?: 'error' | 'embedded-error' | 'lost-response';
    delete?: boolean;
  } = {};
  const gates = new Map<
    'put' | 'copy' | 'delete',
    { promise: Promise<void>; release: () => void }
  >();
  const entered = { put: 0, copy: 0, delete: 0 };
  function setGate(stage: 'put' | 'copy' | 'delete', paused: boolean) {
    gates.get(stage)?.release();
    gates.delete(stage);
    if (paused) {
      let release!: () => void;
      const promise = new Promise<void>((resolve) => {
        release = resolve;
      });
      gates.set(stage, { promise, release });
    }
  }
  const etag = (bytes: Buffer) =>
    `"${createHash('md5').update(bytes).digest('hex')}"`;
  function put(path: string, bytes: Buffer, contentType = 'image/png') {
    objects.set(path, { bytes, contentType, etag: etag(bytes) });
  }
  const server = createServer(async (request, response) => {
    const path = decodeURIComponent(
      new URL(request.url!, 'http://localhost').pathname,
    );
    const method = request.method!;
    if (options.corsOrigin) {
      response.setHeader('access-control-allow-origin', options.corsOrigin);
      response.setHeader(
        'access-control-allow-methods',
        'PUT, GET, HEAD, DELETE, OPTIONS, POST',
      );
      response.setHeader('access-control-allow-headers', 'content-type');
      response.setHeader(
        'access-control-expose-headers',
        'etag, content-length, content-type',
      );
    }
    if (path === '/control' && options.control) {
      if (method === 'POST') {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        const input = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
          delete?: boolean;
          copy?: typeof faults.copy | null;
          putGate?: boolean;
          copyGate?: boolean;
          deleteGate?: boolean;
          resetRequests?: boolean;
        };
        if (input.delete !== undefined) faults.delete = input.delete;
        if (input.copy !== undefined) faults.copy = input.copy ?? undefined;
        if (input.putGate !== undefined) setGate('put', input.putGate);
        if (input.copyGate !== undefined) setGate('copy', input.copyGate);
        if (input.deleteGate !== undefined) setGate('delete', input.deleteGate);
        if (input.resetRequests) requests.length = 0;
      }
      response.writeHead(200, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      });
      response.end(
        JSON.stringify({
          requests,
          objects: [...objects].map(([path, object]) => ({
            path,
            size: object.bytes.length,
            contentType: object.contentType,
            etag: object.etag,
          })),
          gates: {
            put: gates.has('put'),
            copy: gates.has('copy'),
            delete: gates.has('delete'),
          },
          entered,
        }),
      );
      return;
    }
    requests.push({ method, path, headers: { ...request.headers } });
    if (method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }
    function fail(status: number, code: string) {
      response.writeHead(status, {
        'content-type': 'application/xml',
        'x-amz-request-id': 'upload-fixture-request',
      });
      response.end(
        `<Error><Code>${code}</Code><Message>Injected upload fixture failure</Message><RequestId>upload-fixture-request</RequestId></Error>`,
      );
    }
    try {
      if (method === 'PUT') {
        if (request.headers['x-amz-copy-source']) {
          entered.copy++;
          await gates.get('copy')?.promise;
          await faults.beforeCopy?.(path);
          if (faults.copy === 'error') return fail(403, 'AccessDenied');
          if (faults.copy === 'embedded-error')
            return fail(200, 'InternalError');
          const sourcePath = `/${decodeURIComponent(String(request.headers['x-amz-copy-source'])).replace(/^\//, '')}`;
          const source = objects.get(sourcePath);
          if (!source) return fail(404, 'NoSuchKey');
          if (source.etag !== request.headers['x-amz-copy-source-if-match'])
            return fail(412, 'PreconditionFailed');
          objects.set(path, { ...source, bytes: Buffer.from(source.bytes) });
          if (faults.copy === 'lost-response') {
            response.destroy();
            return;
          }
          response.writeHead(200, { 'content-type': 'application/xml' });
          response.end(
            `<CopyObjectResult><ETag>${source.etag}</ETag><LastModified>${new Date().toISOString()}</LastModified></CopyObjectResult>`,
          );
          return;
        }
        entered.put++;
        await gates.get('put')?.promise;
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        const bytes = Buffer.concat(chunks);
        put(path, bytes, request.headers['content-type']);
        response.writeHead(200, { etag: etag(bytes) });
        response.end();
        return;
      }
      if (method === 'DELETE') {
        entered.delete++;
        await gates.get('delete')?.promise;
        if (faults.delete) return fail(403, 'AccessDenied');
        objects.delete(path);
        response.writeHead(204);
        response.end();
        return;
      }
      if (method === 'GET') await faults.beforeGet?.(path);
      const object = objects.get(path);
      if (!object) return fail(404, 'NoSuchKey');
      if (
        request.headers['if-match'] &&
        request.headers['if-match'] !== object.etag
      )
        return fail(412, 'PreconditionFailed');
      response.writeHead(200, {
        'content-type': object.contentType,
        'content-length': String(object.bytes.length),
        etag: object.etag,
      });
      response.end(method === 'HEAD' ? undefined : object.bytes);
    } catch (error) {
      if (!response.destroyed) response.destroy(error as Error);
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing upload endpoint address');
  return {
    objects,
    requests,
    faults,
    put,
    target: {
      endpoint: `http://127.0.0.1:${address.port}`,
      region: 'us-east-1',
      bucket: 'upload-fixture',
      forcePathStyle: true,
      credentials: {
        accessKeyId: 'fixture-access',
        secretAccessKey: 'fixture-secret',
      },
    },
    async close() {
      for (const gate of gates.values()) gate.release();
      const closed = once(server, 'close');
      server.closeAllConnections();
      server.close();
      await closed;
    },
  };
}
