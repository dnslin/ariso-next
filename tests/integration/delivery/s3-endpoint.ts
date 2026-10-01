import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';

/** Local SDK/Next HTTP regression only; never a real-service compatibility report. */
export async function startProtocolEndpoint(
  options: { stalledPut?: boolean; onPut?: () => void } = {},
) {
  const objects = new Map<string, { bytes: Buffer; contentType: string }>();
  const requests: { method: string; path: string }[] = [];
  const server = createServer(async (request, response) => {
    const url = new URL(request.url!, 'http://localhost');
    if (url.pathname === '/embed') {
      const origin = url.searchParams.get('origin')!;
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(
        ['public', 'private']
          .map((kind) => {
            const id = url.searchParams.get(kind)!;
            return `<img id="${kind}" src="${origin}/i/${id}?type=original">`;
          })
          .join(''),
      );
      return;
    }
    const path = decodeURIComponent(url.pathname);
    requests.push({ method: request.method!, path });
    if (request.method === 'PUT') {
      options.onPut?.();
      if (options.stalledPut) return;
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const bytes = Buffer.concat(chunks);
      objects.set(path, {
        bytes,
        contentType:
          request.headers['content-type'] ?? 'application/octet-stream',
      });
      response.writeHead(200, {
        etag: `"${createHash('md5').update(bytes).digest('hex')}"`,
      });
      response.end();
      return;
    }
    if (request.method === 'DELETE') {
      objects.delete(path);
      response.writeHead(204);
      response.end();
      return;
    }
    const object = objects.get(path);
    if (!object) {
      response.writeHead(404, { 'content-type': 'application/xml' });
      response.end('<Error><Code>NoSuchKey</Code></Error>');
      return;
    }
    const headers: Record<string, string> = {
      'content-type':
        url.searchParams.get('response-content-type') ?? object.contentType,
      'content-length': String(object.bytes.length),
      etag: `"${createHash('md5').update(object.bytes).digest('hex')}"`,
      'access-control-allow-origin': '*',
    };
    for (const [query, header] of [
      ['response-content-disposition', 'content-disposition'],
      ['response-cache-control', 'cache-control'],
    ]) {
      const value = url.searchParams.get(query);
      if (value) headers[header] = value;
    }
    response.writeHead(200, headers);
    response.end(request.method === 'HEAD' ? undefined : object.bytes);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing endpoint address');
  return {
    target: {
      service: 'seaweedfs' as const,
      endpoint: `http://127.0.0.1:${address.port}`,
      region: 'us-east-1',
      bucket: 'delivery-fixture',
      forcePathStyle: true,
      credentials: {
        accessKeyId: 'fixture-access',
        secretAccessKey: 'fixture-secret',
      },
    },
    embedOrigin: `http://external-${address.port}.localhost:${address.port}`,
    objects,
    requests,
    async close() {
      const closed = once(server, 'close');
      server.closeAllConnections();
      server.close();
      await closed;
    },
  };
}
