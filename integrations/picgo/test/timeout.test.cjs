const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createServer } = require('node:http');
const { test } = require('node:test');
const { Request } = require('picgo');
const plugin = require('../index.cjs');

test('describes and preserves idle timeout during a continuously streamed response', async (t) => {
  let requests = 0;
  let timer;
  const url = 'https://public.example/i/streamed?type=original';
  const server = createServer((request, response) => {
    requests++;
    request.resume();
    response.writeHead(201, { 'content-type': 'application/json' });
    response.write(' ');
    let chunks = 0;
    // Keep the connection active beyond the configured one-second timeout.
    timer = setInterval(() => {
      response.write(' ');
      if (++chunks !== 6) return;
      clearInterval(timer);
      response.end(
        JSON.stringify({
          imageId: 'streamed',
          status: 'ready',
          requestId: 'streamed-request',
          actualVersion: 'original',
          defaultResolution: { available: true },
          versions: { original: { url, mime: 'image/png' } },
          processing: { status: 'succeeded', warnings: [] },
        }),
      );
    }, 250);
  });
  t.after(async () => {
    clearInterval(timer);
    server.closeAllConnections();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const transport = new Request({ getConfig: () => undefined });
  let uploader;
  const ctx = {
    output: [{ fileName: 'streamed.png', buffer: Buffer.from('image') }],
    getConfig: () => ({
      siteUrl: `http://127.0.0.1:${server.address().port}`,
      token: 'timeout-test-token',
      timeoutSeconds: 1,
    }),
    helper: { uploader: { register: (_, value) => (uploader = value) } },
    request: transport.request.bind(transport),
    emit: () => {},
    log: { info: () => {}, warn: () => {} },
  };
  plugin(ctx).register();
  const started = performance.now();
  await uploader.handle(ctx);
  assert.ok(performance.now() - started >= 1000);
  assert.equal(requests, 1);
  assert.deepEqual(
    ctx.output.map((item) => item.imgUrl),
    [url],
  );
  const field = uploader
    .config(ctx)
    .find((item) => item.name === 'timeoutSeconds');
  assert.match(field.alias, /空闲超时/);
  assert.match(field.message, /不是.*总时限/);
  assert.match(field.message, /持续传输.*超过/);
});
