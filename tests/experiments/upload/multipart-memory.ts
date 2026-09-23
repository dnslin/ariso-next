import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { receive, type Result } from './parser.ts';

type Measurement = {
  fileBytes: number;
  baselineRss: number;
  peakRss: number;
  rssGrowth: number;
  clientDrainCount: number;
  result: Result;
};
const boundary = 'memory-boundary';
const MiB = 1024 * 1024;

// Each size gets a fresh receiver process, isolating server RSS from the producer
// and avoiding a warmed allocator hiding growth in the second measurement.
export async function measureMemory(): Promise<Measurement[]> {
  const measurements: Measurement[] = [];
  for (const size of [50 * MiB, 200 * MiB]) {
    const child = fork(fileURLToPath(import.meta.url), ['--receiver'], {
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
    try {
      const [ready] = (await once(child, 'message')) as [{ port: number }];
      const message = once(child, 'message');
      const client = request({
        hostname: '127.0.0.1',
        port: ready.port,
        method: 'POST',
        headers: {
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
      });
      const ended = new Promise<void>((resolve, reject) => {
        client.on('error', reject);
        client.on('response', (response) => {
          response.resume();
          response.on('error', reject);
          response.on('end', () =>
            response.statusCode === 200
              ? resolve()
              : reject(new Error(`HTTP ${response.statusCode}`)),
          );
        });
      });
      let drains = 0;
      const write = async (chunk: Buffer) => {
        if (!client.write(chunk)) {
          drains++;
          await once(client, 'drain');
        }
      };
      await write(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="memory.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`,
        ),
      );
      const chunk = Buffer.alloc(65536, 0x61);
      for (let sent = 0; sent < size; sent += chunk.length) await write(chunk);
      client.end(`\r\n--${boundary}--\r\n`);
      await ended;
      const [measurement] = (await message) as [
        Omit<Measurement, 'fileBytes' | 'clientDrainCount'>,
      ];
      assert.equal(measurement.result.code, 'OK');
      assert.equal(measurement.result.diskBytes, size);
      assert.equal(measurement.result.cleaned, true);
      assert(drains > 0);
      assert(measurement.result.peakBuffered < MiB);
      measurements.push({
        fileBytes: size,
        clientDrainCount: drains,
        ...measurement,
      });
    } finally {
      child.kill();
      await once(child, 'exit');
    }
  }
  // Increasing the body by 150 MiB must not retain that additional body in RSS.
  // Absolute peaks avoid comparing ratios against a near-zero initial growth.
  assert(
    measurements[1]!.peakRss - measurements[0]!.peakRss < 75 * MiB,
    '200 MiB receiver must not retain a linear copy of the additional 150 MiB body',
  );
  return measurements;
}

if (process.argv.includes('--receiver')) {
  const root = await mkdtemp(join(tmpdir(), 'ariso-parser-memory-'));
  const server = createServer((req, res) => {
    const baselineRss = process.memoryUsage().rss;
    let peakRss = baselineRss;
    const sampler = setInterval(() => {
      peakRss = Math.max(peakRss, process.memoryUsage().rss);
    }, 5);
    void receive(req, root, true, 200 * MiB)
      .then(async (result) => {
        clearInterval(sampler);
        peakRss = Math.max(peakRss, process.memoryUsage().rss);
        await rm(root, { recursive: true });
        process.send?.({
          baselineRss,
          peakRss,
          rssGrowth: peakRss - baselineRss,
          result,
        });
        res.writeHead(result.code === 'OK' ? 200 : 400);
        res.end();
        server.close();
      })
      .catch((error: unknown) => {
        clearInterval(sampler);
        console.error(error);
        process.exitCode = 1;
        res.destroy(error as Error);
        server.close();
      });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  process.send?.({ port: address.port });
}
