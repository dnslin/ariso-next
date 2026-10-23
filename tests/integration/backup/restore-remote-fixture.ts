import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';

const xml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
export async function remoteEndpoint() {
  const objects = new Map<string, Buffer>();
  const failures: unknown[] = [];
  const requests: Array<{
    method: string;
    key: string;
    conditional: boolean;
    bytes?: number;
  }> = [];
  const control: {
    failDelete: boolean;
    failWrite: string;
    dropDeleteResponse: string;
    ignoreConditional: boolean;
    writeFailureStatus: number;
    beforeCommit?: (key: string) => Promise<void>;
    beforeDelete?: (key: string) => Promise<void>;
    holdWrite?: (key: string) => Promise<void>;
  } = {
    failDelete: false,
    failWrite: '',
    dropDeleteResponse: '',
    ignoreConditional: false,
    writeFailureStatus: 500,
  };
  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url!, 'http://localhost');
      const key = decodeURIComponent(url.pathname).replace(/^\/[^/]+\//, '');
      const method = request.method!;
      const record: (typeof requests)[number] = {
        method,
        key,
        conditional: request.headers['if-none-match'] === '*',
      };
      requests.push(record);
      const error = (status: number, code: string) => {
        response.writeHead(status, { 'content-type': 'application/xml' });
        response.end(
          `<Error><Code>${code}</Code><Message>${code}</Message></Error>`,
        );
      };
      if (url.searchParams.has('versioning')) {
        response.setHeader('content-type', 'application/xml');
        response.end('<VersioningConfiguration/>');
      } else if (url.searchParams.has('object-lock'))
        error(404, 'ObjectLockConfigurationNotFoundError');
      else if (url.searchParams.has('list-type')) {
        const prefix = url.searchParams.get('prefix')!;
        response.setHeader('content-type', 'application/xml');
        response.end(
          `<ListBucketResult><IsTruncated>false</IsTruncated>${[...objects]
            .filter(([name]) => name.startsWith(prefix))
            .map(
              ([name, bytes]) =>
                `<Contents><Key>${xml(name)}</Key><Size>${bytes.length}</Size></Contents>`,
            )
            .join('')}</ListBucketResult>`,
        );
      } else if (method === 'PUT') {
        if (request.headers['x-amz-copy-source']) {
          const sourceKey = decodeURIComponent(
            String(request.headers['x-amz-copy-source']),
          ).replace(/^\/?[^/]+\//, '');
          const bytes = objects.get(sourceKey);
          if (!bytes) return error(404, 'NoSuchKey');
          const etag =
            '"' + createHash('md5').update(bytes).digest('hex') + '"';
          if (request.headers['x-amz-copy-source-if-match'] !== etag)
            return error(412, 'PreconditionFailed');
          objects.set(key, Buffer.from(bytes));
          response.writeHead(200, { 'content-type': 'application/xml' });
          response.end(
            `<CopyObjectResult><ETag>${xml(etag)}</ETag><LastModified>${new Date().toISOString()}</LastModified></CopyObjectResult>`,
          );
          return;
        }
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        const bytes = Buffer.concat(chunks);
        record.bytes = bytes.length;
        if (control.failWrite && key.endsWith(control.failWrite))
          return error(
            control.writeFailureStatus,
            control.writeFailureStatus === 403
              ? 'AccessDenied'
              : 'InternalError',
          );
        await control.beforeCommit?.(key);
        if (
          !control.ignoreConditional &&
          request.headers['if-none-match'] === '*' &&
          objects.has(key)
        )
          return error(412, 'PreconditionFailed');
        objects.set(key, bytes);
        await control.holdWrite?.(key);
        response.writeHead(200, {
          etag: '"' + createHash('md5').update(bytes).digest('hex') + '"',
        });
        response.end();
      } else if (method === 'DELETE') {
        if (control.failDelete) return error(403, 'AccessDenied');
        await control.beforeDelete?.(key);
        objects.delete(key);
        if (
          control.dropDeleteResponse &&
          key.endsWith(control.dropDeleteResponse)
        ) {
          response.destroy();
          return;
        }
        response.writeHead(204);
        response.end();
      } else if (method === 'GET' || method === 'HEAD') {
        if (
          !request.headers.authorization &&
          !url.searchParams.has('X-Amz-Signature')
        )
          return error(403, 'AccessDenied');
        const bytes = objects.get(key);
        if (!bytes) return error(404, 'NoSuchKey');
        const etag = '"' + createHash('md5').update(bytes).digest('hex') + '"';
        if (request.headers['if-match'] && request.headers['if-match'] !== etag)
          return error(412, 'PreconditionFailed');
        response.writeHead(200, {
          'content-length': bytes.length,
          'content-type':
            url.searchParams.get('response-content-type') ??
            'application/octet-stream',
          etag,
        });
        response.end(method === 'HEAD' ? undefined : bytes);
      } else error(400, 'InvalidRequest');
    })().catch((error) => {
      if (!request.aborted) failures.push(error);
      response.destroy();
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Expected TCP endpoint');
  return {
    endpoint: `http://127.0.0.1:${address.port}`,
    objects,
    requests,
    control,
    async close() {
      const closed = once(server, 'close');
      server.closeAllConnections();
      server.close();
      await closed;
      if (failures.length)
        throw new AggregateError(failures, 'S3 protocol fixture failed');
    },
  };
}
