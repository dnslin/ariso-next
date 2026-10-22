import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

it.each([
  [undefined, null],
  ['none', '127.0.0.1'],
  ['127.0.0.1/32', '203.0.113.9'],
  ['10.0.0.0/8', '127.0.0.1'],
])(
  'stamps the socket/proxy decision before the HTTP application (%s)',
  (setting, expected) => {
    const env = { ...process.env };
    if (setting === undefined) delete env.ARISO_TRUSTED_PROXIES;
    else env.ARISO_TRUSTED_PROXIES = setting;
    const result = execFileSync(
      process.execPath,
      [
        '--import',
        './src/cli/http.ts',
        '--input-type=module',
        '-e',
        `
    import http from 'node:http';
    import { once } from 'node:events';
    const server = http.createServer((request, response) => {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ ip: request.headers['x-ariso-client-ip'] ?? null }));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const response = await fetch('http://127.0.0.1:' + server.address().port, {
      headers: { 'X-Ariso-Client-IP': '198.51.100.1', 'X-Ariso-Client-IP-Error': 'spoof', 'X-Forwarded-For': '198.51.100.99, 203.0.113.9' }
    });
    console.log(await response.text());
    await new Promise(resolve => server.close(resolve));
  `,
      ],
      { env, encoding: 'utf8', timeout: 5000 },
    );
    expect(JSON.parse(result)).toEqual({ ip: expected });
  },
);
