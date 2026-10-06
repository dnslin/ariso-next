import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('allows a progressing upload beyond Node’s default request budget while preserving HTTP options', () => {
  const result = execFileSync(
    process.execPath,
    [
      '--import',
      './src/cli/http.ts',
      '--input-type=module',
      '-e',
      `
      import assert from 'node:assert/strict';
      import { once } from 'node:events';
      import http from 'node:http';
      const server = http.createServer({
        requestTimeout: 40,
        headersTimeout: 40,
        connectionsCheckingInterval: 10,
        keepAliveTimeout: 1234,
      }, async (request, response) => {
        let bytes = 0;
        for await (const chunk of request) bytes += chunk.length;
        response.end(String(bytes));
      });
      assert.equal(server.requestTimeout, 1_860_000);
      assert.equal(server.headersTimeout, 40);
      assert.equal(server.keepAliveTimeout, 1234);
      assert.equal(server.timeout, 0);
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const request = http.request({
        hostname: '127.0.0.1', port: server.address().port,
        method: 'POST', headers: { 'content-length': '2' }, agent: false,
      });
      request.on('error', () => {});
      const responseReady = once(request, 'response');
      request.write('a');
      await new Promise(resolve => setTimeout(resolve, 200));
      request.end('b');
      const [response] = await responseReady;
      let body = '';
      for await (const chunk of response) body += chunk;
      assert.equal(response.statusCode, 200);
      assert.equal(body, '2');
      await new Promise(resolve => server.close(resolve));
      console.log('passed');
      `,
    ],
    { encoding: 'utf8', timeout: 5000 },
  );
  expect(result.trim()).toBe('passed');
});
