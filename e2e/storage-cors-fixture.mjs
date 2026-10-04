import { createServer } from 'node:http';
import { once } from 'node:events';

// Real HTTP/CORS fault fixture. It does not emulate S3 signature validation or
// replace the separate R2/SeaweedFS acceptance run.
export async function startCorsFixture(origin) {
  const objects = new Map();
  const requests = [];
  let mode = 'normal';
  const heldPuts = new Set();
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/_control') {
      if (request.method === 'POST') {
        let body = '';
        for await (const chunk of request) body += chunk;
        mode = JSON.parse(body).mode;
        if (!['hold-put', 'hold-connection-put'].includes(mode)) {
          for (const held of heldPuts) held.end();
          heldPuts.clear();
        }
      }
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({ mode, objects: [...objects.keys()], requests }),
      );
      return;
    }
    requests.push({
      method: request.method,
      path: url.pathname,
      origin: request.headers.origin ?? null,
      signed: url.searchParams.has('X-Amz-Signature'),
    });
    response.setHeader('x-amz-request-id', 'cors-browser-fixture');
    if (mode !== 'deny-cors') {
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Access-Control-Allow-Methods', 'PUT, GET, HEAD');
      response.setHeader('Access-Control-Allow-Headers', 'content-type');
    }
    const error = (status, code) => {
      response.writeHead(status, { 'content-type': 'application/xml' });
      response.end(
        `<Error><Code>${code}</Code><Message>${code}</Message></Error>`,
      );
    };
    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
    } else if (url.searchParams.has('versioning')) {
      if (mode === 'configuration-denied') return error(403, 'AccessDenied');
      if (mode === 'versioning-enabled') {
        response.end(
          '<VersioningConfiguration><Status>Enabled</Status></VersioningConfiguration>',
        );
        return;
      }
      response.end('<VersioningConfiguration/>');
    } else if (url.searchParams.has('object-lock')) {
      error(404, 'ObjectLockConfigurationNotFoundError');
    } else if (
      !request.headers.authorization &&
      !url.searchParams.has('X-Amz-Signature') &&
      mode !== 'anonymous-readable'
    ) {
      if (mode === 'anonymous-unavailable') error(503, 'ServiceUnavailable');
      else error(403, 'AccessDenied');
    } else if (url.searchParams.get('list-type') === '2') {
      const prefix = url.searchParams.get('prefix') ?? '';
      const bucketPrefix = `${url.pathname.replace(/\/$/, '')}/`;
      const keys = [...objects.entries()]
        .filter(([path]) => path.startsWith(bucketPrefix))
        .map(([path, bytes]) => ({
          key: path.slice(bucketPrefix.length),
          size: bytes.length,
        }))
        .filter(({ key }) => key.startsWith(prefix));
      const escape = (value) =>
        value
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;');
      response.setHeader('content-type', 'application/xml');
      response.end(
        `<ListBucketResult><IsTruncated>false</IsTruncated><KeyCount>${keys.length}</KeyCount>${keys.map(({ key, size }) => `<Contents><Key>${escape(key)}</Key><Size>${size}</Size></Contents>`).join('')}</ListBucketResult>`,
      );
    } else if (request.method === 'PUT') {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      objects.set(url.pathname, Buffer.concat(chunks));
      if (
        (mode === 'hold-put' && url.searchParams.has('X-Amz-Signature')) ||
        mode === 'hold-connection-put'
      ) {
        heldPuts.add(response);
        response.once('close', () => heldPuts.delete(response));
        return;
      }
      response.end();
    } else if (request.method === 'DELETE') {
      if (mode === 'delete-failure') return error(403, 'AccessDenied');
      objects.delete(url.pathname);
      response.writeHead(204);
      response.end();
    } else {
      const body = objects.get(url.pathname);
      if (!body) return error(404, 'NoSuchKey');
      response.setHeader('content-length', body.length);
      response.end(request.method === 'HEAD' ? undefined : body);
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    endpoint: `http://127.0.0.1:${server.address().port}`,
    async close() {
      server.closeAllConnections();
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
