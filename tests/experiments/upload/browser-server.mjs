import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import busboy from 'busboy';

let records = [];
let active = 0;
let peak = 0;
let hold = 120;
const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  try {
    if (url.pathname === '/') {
      response.setHeader('Content-Type', 'text/html');
      response.end(
        '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>UPLOAD-V03</title><body><script type="module" src="/browser.js"></script></body></html>',
      );
      return;
    }
    if (url.pathname === '/browser.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(
        await readFile(
          new URL(
            '../../../test-results/upload-fixture/browser.js',
            import.meta.url,
          ),
        ),
      );
      return;
    }
    response.setHeader('Content-Type', 'application/json');
    if (url.pathname === '/metrics') {
      response.end(JSON.stringify({ active, peak, records }));
      return;
    }
    if (url.pathname === '/reset' && request.method === 'POST') {
      if (active) throw new Error('Cannot reset active requests');
      records = [];
      peak = 0;
      hold = Number(url.searchParams.get('hold') ?? 120);
      response.end('{}');
      return;
    }
    if (url.pathname.startsWith('/sign/')) {
      records.push({
        kind: 'sign',
        id: url.pathname.slice(6),
        at: performance.now(),
        active,
      });
      response.end(
        JSON.stringify({
          url: `http://${request.headers.host}/s3/${url.pathname.slice(6)}${url.search}`,
        }),
      );
      return;
    }
    if (!url.pathname.startsWith('/xhr/') && !url.pathname.startsWith('/s3/')) {
      response.writeHead(404).end('{}');
      return;
    }
    const route = url.pathname.split('/')[1];
    const id = url.pathname.split('/')[2];
    const record = {
      kind: 'upload',
      route,
      id,
      method: request.method,
      bytes: 0,
      start: performance.now(),
      end: null,
      hash: null,
      status: null,
    };
    records.push(record);
    active++;
    peak = Math.max(peak, active);
    response.once('close', () => {
      active--;
      record.end = performance.now();
    });
    const hash = createHash('sha256');
    if (route === 'xhr') {
      const parser = busboy({
        headers: request.headers,
        limits: { files: 1, fields: 0 },
      });
      parser.on('file', (_name, file) =>
        file.on('data', (chunk) => {
          record.bytes += chunk.length;
          hash.update(chunk);
        }),
      );
      await new Promise((resolve, reject) => {
        parser.on('close', resolve);
        parser.on('error', reject);
        request.on('error', reject);
        request.pipe(parser);
      });
    } else {
      for await (const chunk of request) {
        record.bytes += chunk.length;
        hash.update(chunk);
      }
    }
    record.hash = hash.digest('hex');
    await delay(hold);
    record.status = url.searchParams.get('fail') === 'true' ? 503 : 200;
    response.setHeader('ETag', '"experiment"');
    response
      .writeHead(record.status)
      .end(JSON.stringify({ url: '/received', bytes: record.bytes }));
  } catch (error) {
    if (!request.aborted) console.error(error);
    if (!response.headersSent) response.writeHead(500);
    response.end(JSON.stringify({ error: String(error) }));
  }
});
server.listen(Number(process.env.PORT ?? 3072), '127.0.0.1', () =>
  console.log(`http://127.0.0.1:${server.address().port}`),
);
