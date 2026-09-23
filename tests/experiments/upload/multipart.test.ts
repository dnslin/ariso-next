import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { receive, maximum, fieldBudget, type Result } from './parser.ts';
import { measureMemory } from './multipart-memory.ts';

const boundary = 'ariso-upload-v03-boundary';
type Part = { name: string; value: string } | { name: string; size: number };

function* body(parts: Part[], truncated = false): Generator<Buffer> {
  for (const part of parts) {
    yield Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"${'size' in part ? '; filename="sample.bin"\r\nContent-Type: application/octet-stream' : ''}\r\n\r\n`,
    );
    if ('size' in part) {
      const chunk = Buffer.alloc(65536, 0x61);
      for (let remaining = part.size; remaining > 0; remaining -= chunk.length)
        yield chunk.subarray(0, Math.min(remaining, chunk.length));
    } else yield Buffer.from(part.value);
    yield Buffer.from('\r\n');
  }
  if (!truncated) yield Buffer.from(`--${boundary}--\r\n`);
}

// All cases cross a real loopback HTTP socket and write a real temporary file.
test(
  'Busboy 1.6.0 real HTTP multipart acceptance and bounded streaming',
  { timeout: 60000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'ariso-multipart-'));
    const observations: (Result & {
      name: string;
      clientDrainCount: number;
      rssDelta: number;
      durationMs: number;
    })[] = [];
    let settle: ((result: Result) => void) | undefined;
    const server = createServer((req, res) => {
      void receive(req, root, req.url === '/slow')
        .then((result) => {
          settle?.(result);
          if (!res.destroyed) {
            res.writeHead(result.code === 'OK' ? 200 : 400);
            res.end(JSON.stringify(result));
          }
        })
        .catch((error: unknown) => {
          res.destroy(error as Error);
        });
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert(address && typeof address !== 'string');
    async function run(
      name: string,
      parts: Part[],
      expected: string,
      options: {
        known?: boolean;
        truncated?: boolean;
        disconnect?: boolean;
        slow?: boolean;
      } = {},
    ) {
      const start = performance.now();
      const initialRss = process.memoryUsage().rss;
      let peakRss = initialRss;
      const sample = setInterval(() => {
        peakRss = Math.max(peakRss, process.memoryUsage().rss);
      }, 5);
      const received = new Promise<Result>((resolve) => {
        settle = resolve;
      });
      const headers: Record<string, string | number> = {
        'content-type': `multipart/form-data; boundary=${boundary}`,
      };
      if (options.known)
        headers['content-length'] = [...body(parts, options.truncated)].reduce(
          (sum, chunk) => sum + chunk.length,
          0,
        );
      const client = request({
        hostname: '127.0.0.1',
        port: address && typeof address !== 'string' ? address.port : 0,
        method: 'POST',
        path: options.slow ? '/slow' : '/',
        headers,
      });
      client.on('error', (error) => {
        if (!options.disconnect) throw error;
      });
      const response = new Promise<void>((resolve) =>
        client.on('response', (res) => {
          res.resume();
          res.on('end', resolve);
        }),
      );
      let drains = 0;
      let sent = 0;
      try {
        for (const chunk of body(parts, options.truncated)) {
          sent += chunk.length;
          if (!client.write(chunk)) {
            drains++;
            await once(client, 'drain');
          }
          if (options.disconnect && sent > 128 * 1024) {
            await delay(20);
            client.destroy();
            break;
          }
        }
        if (!options.disconnect) client.end();
        const result = await received;
        if (!options.disconnect) await response;
        assert.equal(result.code, expected, name);
        assert.equal(result.cleaned, true, `${name}: temporary files removed`);
        if (expected === 'OK')
          assert.equal(result.diskBytes, result.bytes, `${name}: disk count`);
        const reportedFields = Object.fromEntries(
          Object.entries(result.fields).map(([key, values]) => [
            key,
            values.map((value) =>
              value.length > 80 ? `[${Buffer.byteLength(value)} bytes]` : value,
            ),
          ]),
        );
        observations.push({
          name,
          ...result,
          fields: reportedFields,
          clientDrainCount: drains,
          rssDelta: peakRss - initialRss,
          durationMs: Math.round(performance.now() - start),
        });
        return result;
      } finally {
        clearInterval(sample);
        client.destroy();
      }
    }
    try {
      const file = { name: 'file', size: 32 };
      const metadata = [
        { name: 'storageId', value: 'store' },
        { name: 'albumId', value: 'one' },
        { name: 'albumId', value: 'two' },
        { name: 'tag', value: '旅行' },
        { name: 'tag', value: 'a,b' },
        { name: 'visibility', value: 'private' },
      ];
      for (let position = 0; position <= metadata.length; position++) {
        const result = await run(
          `file-position-${position}`,
          [...metadata.slice(0, position), file, ...metadata.slice(position)],
          'OK',
          { known: position === 0 },
        );
        assert.deepEqual(result.fields.albumId, ['one', 'two']);
        assert.deepEqual(result.fields.tag, ['旅行', 'a,b']);
      }
      await run('second-file', [file, file], 'SECOND_FILE');
      await run('truncated', [file], 'TRUNCATED', { truncated: true });
      await run(
        'unknown-field',
        [file, { name: 'albumId[]', value: 'one' }],
        'UNKNOWN_FIELD',
      );
      for (const name of ['storageId', 'visibility'])
        await run(
          `duplicate-${name}`,
          [file, { name, value: 'a' }, { name, value: 'b' }],
          'DUPLICATE_SCALAR',
        );
      await run(
        'single-field-limit',
        [file, { name: 'tag', value: 'x'.repeat(fieldBudget + 2) }],
        'FIELDS_TOO_LARGE',
      );
      await run(
        'aggregate-field-limit',
        [
          file,
          { name: 'tag', value: 'x'.repeat(fieldBudget / 2) },
          { name: 'tag', value: 'x'.repeat(fieldBudget / 2) },
        ],
        'FIELDS_TOO_LARGE',
      );
      await run('empty-file', [{ name: 'file', size: 0 }], 'EMPTY_FILE');
      await run('missing-file', metadata, 'MISSING_FILE');
      await run(
        'unknown-file-field',
        [{ name: 'other', size: 32 }],
        'UNKNOWN_FILE_FIELD',
      );
      const exact = await run(
        '50MiB-unknown-length-slow',
        [{ name: 'file', size: maximum }],
        'OK',
        { slow: true },
      );
      assert.equal(exact.bytes, maximum);
      assert(
        exact.peakBuffered < 1024 * 1024,
        'slow disk must bound stream buffers below 1 MiB',
      );
      assert(
        observations.at(-1)!.clientDrainCount > 0,
        'HTTP producer encountered backpressure',
      );
      await run('50MiB-known-length', [{ name: 'file', size: maximum }], 'OK', {
        known: true,
      });
      await run(
        '50MiB-plus-one',
        [{ name: 'file', size: maximum + 1 }],
        'FILE_TOO_LARGE',
      );
      await run(
        'disconnect',
        [{ name: 'file', size: maximum }],
        'DISCONNECTED',
        { disconnect: true, slow: true },
      );
      const report = {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        parser: 'busboy@1.6.0',
        maximum,
        fieldBudget,
        cases: observations,
        serverMemory: await measureMemory(),
      };
      if (process.env.UPLOAD_MULTIPART_REPORT)
        await writeFile(
          process.env.UPLOAD_MULTIPART_REPORT,
          `${JSON.stringify(report, null, 2)}\n`,
        );
      console.log(JSON.stringify(report));
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(root, { recursive: true });
    }
  },
);
