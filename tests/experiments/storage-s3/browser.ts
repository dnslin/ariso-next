import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { promisify } from 'node:util';
import { svg } from './protocol.ts';
import type { BrowserProbe } from './suite.ts';

export function browserProbe(spaceId: number, output: string): BrowserProbe {
  return async (signed) => {
    // A fixed origin lets the owner configure exact CORS rules in each test bucket.
    const origin = 'http://127.0.0.1:47070';
    const server = createServer((request, response) => {
      response.setHeader('Cache-Control', 'no-store');
      if (request.url === '/') {
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(
          '<!doctype html><html lang="zh"><title>EV-STORAGE-01</title><h1>对象存储协议实验</h1><a href="/download">下载 SVG</a></html>',
        );
      } else if (request.url === '/download') {
        response.writeHead(302, {
          Location: signed.get,
          'X-Content-Type-Options': 'nosniff',
        });
        response.end();
      } else {
        response.writeHead(404);
        response.end();
      }
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(47070, '127.0.0.1', resolve);
    });
    try {
      const source = await readFile(
        new URL('./browser.mjs', import.meta.url),
        'utf8',
      );
      const child = promisify(execFile)('ego-browser', ['nodejs'], {
        timeout: 90_000,
        maxBuffer: 1024 * 1024,
      });
      child.child.stdin!.end(
        `const config = ${JSON.stringify({ spaceId, origin, output, signed, svg })};\n${source}`,
      );
      await child;
      assert.equal(await readFile(`${output}/旅行.svg`, 'utf8'), svg);
      return JSON.parse(await readFile(`${output}/browser.json`, 'utf8'));
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  };
}
