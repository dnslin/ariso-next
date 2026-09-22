// Exercises the Ego runner only. This HTTP fixture is not an S3 implementation or service acceptance.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { browserProbe } from './browser.ts';
import { overrides, svg } from './protocol.ts';

assert.equal(process.versions.node.split('.')[0], '24');
const spaceId = Number(process.env.EGO_TASK_SPACE);
assert.ok(spaceId, 'EGO_TASK_SPACE is required');
const output = resolve('test-results/storage-s3-browser-fixture');
await mkdir(output, { recursive: true });
let body = '';
const requests: {
  method: string;
  headers: Record<string, string | string[] | undefined>;
}[] = [];
const server = createServer(async (request, response) => {
  requests.push({ method: request.method!, headers: request.headers });
  response.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:47070');
  response.setHeader('Access-Control-Allow-Methods', 'PUT, GET, HEAD');
  response.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }
  if (request.method === 'PUT') {
    for await (const chunk of request) body += chunk.toString();
    response.end();
  } else {
    response.writeHead(200, {
      'Content-Type': overrides.ResponseContentType,
      'Content-Disposition': overrides.ResponseContentDisposition,
      'Cache-Control': overrides.ResponseCacheControl,
    });
    response.end(body);
  }
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
try {
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/fixture.svg`;
  const evidence = await browserProbe(
    spaceId,
    output,
  )({
    put: url,
    get: url,
    head: url,
    headers: { 'content-type': 'image/svg+xml' },
  });
  assert.equal(body, svg);
  assert.ok(requests.some((request) => request.method === 'OPTIONS'));
  for (const request of requests) {
    assert.equal(request.headers.authorization, undefined);
    assert.equal(request.headers.cookie, undefined);
  }
  await writeFile(
    `${output}/fixture.json`,
    JSON.stringify(
      {
        scope:
          'local browser runner regression only; no real storage service tested',
        evidence,
        requests,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`Browser runner regression passed: ${output}/fixture.json`);
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
