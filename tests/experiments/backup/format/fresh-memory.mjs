import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, get } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { MiB, PASSWORD } from './archive.mjs';

const directory = dirname(fileURLToPath(import.meta.url));

if (process.argv[2] === '--phase') {
  const { label, job, reportPath } = JSON.parse(
    await readFile(process.argv[3], 'utf8'),
  );
  const baselineRss = process.memoryUsage().rss;
  let peakRss = baselineRss;
  const latencies = [];
  const snapshots = [];
  let pending = false;
  let failures = 0;
  const server = createServer((_request, response) => response.end('ok'));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  const delays = monitorEventLoopDelay({ resolution: 10 });
  delays.enable();
  const started = performance.now();
  const worker = new Worker(new URL('./worker.mjs', import.meta.url), {
    workerData: job,
  });
  let result;
  const timer = setInterval(() => {
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
    if (pending) return;
    pending = true;
    const begin = performance.now();
    const request = get(
      { hostname: '127.0.0.1', port, path: '/', agent: false },
      (response) => {
        response.resume();
        response.on('end', () => {
          latencies.push(performance.now() - begin);
          pending = false;
        });
      },
    );
    request.on('error', () => {
      failures++;
      pending = false;
    });
  }, 25);
  try {
    worker.on('message', (message) => {
      peakRss = Math.max(peakRss, process.memoryUsage().rss);
      if (message.type === 'result') result = message;
      if (message.memory)
        snapshots.push({ stage: message.stage, ...message.memory });
    });
    const [exitCode] = await once(worker, 'exit');
    assert.equal(exitCode, 0);
    assert.equal(worker.threadId, -1);
    assert(result?.ok, result?.error?.message ?? 'missing result');
    assert.equal(failures, 0);
    assert(latencies.length > 0);
    latencies.sort((a, b) => a - b);
    await writeFile(
      reportPath,
      JSON.stringify(
        {
          label,
          status: 'passed',
          result: result.result,
          elapsedMs: performance.now() - started,
          baselineRss,
          peakRss,
          sampleIntervalMs: 25,
          mainEventLoopMaxMs: delays.max / 1e6,
          httpProbeCount: latencies.length,
          httpProbeFailures: failures,
          httpP95Ms: latencies[Math.floor((latencies.length - 1) * 0.95)],
          httpMaxMs: latencies.at(-1),
          snapshots,
          workerExited: true,
        },
        null,
        2,
      ),
    );
  } finally {
    clearInterval(timer);
    delays.disable();
    if (worker.threadId !== -1) await worker.terminate();
    await new Promise((resolve) => server.close(resolve));
  }
} else {
  const comparing = process.argv[2] === '--compare';
  const yazlModule = process.env.YAZL_MODULE;
  if (comparing)
    assert(
      yazlModule && existsSync(yazlModule),
      'YAZL_MODULE must point to the separately installed control writer',
    );
  const root = await mkdtemp(join(tmpdir(), 'ariso-format-fresh-memory-'));
  const report = {
    command: `${process.execPath} tests/experiments/backup/format/fresh-memory.mjs${comparing ? ' --compare' : ''}`,
    node: process.version,
    startedAt: new Date().toISOString(),
    processIsolation:
      'new Node process per operation; one worker plus loopback HTTP probe in each',
    instrumentation: {
      rssSampleIntervalMs: 25,
      webStreamQueueSizing: 'byteLength',
      sha256:
        'only marked comparison fixtures; every entry still validates CRC and length',
    },
    ...(comparing
      ? {
          comparison: {
            yazlVersion: '3.3.1',
            repeats: 2,
            workload:
              '100000 objects plus manifest; identical plaintext and validation',
          },
        }
      : {}),
    measurements: [],
  };
  async function run(label, job) {
    const input = join(root, `${label}-job.json`);
    const reportPath = join(root, `${label}-result.json`);
    await writeFile(input, JSON.stringify({ label, job, reportPath }));
    const child = spawn(
      process.execPath,
      [fileURLToPath(import.meta.url), '--phase', input],
      { stdio: ['ignore', 'inherit', 'inherit'] },
    );
    const [code] = await once(child, 'exit');
    assert.equal(code, 0, label);
    const result = JSON.parse(await readFile(reportPath, 'utf8'));
    report.measurements.push(result);
    console.log(
      JSON.stringify({
        label,
        peakMiB: result.peakRss / MiB,
        elapsedMs: result.elapsedMs,
      }),
    );
    return result.result;
  }
  try {
    const workloads = comparing
      ? [
          { scope: 'many', writer: 'zip-stream', label: 'zip-stream-1' },
          { scope: 'many', writer: 'yazl', label: 'yazl-1' },
          { scope: 'many', writer: 'zip-stream', label: 'zip-stream-2' },
          { scope: 'many', writer: 'yazl', label: 'yazl-2' },
        ]
      : [
          { scope: 'large', label: 'large' },
          { scope: 'many', label: 'many' },
        ];
    for (const { scope, writer, label } of workloads) {
      const age = join(root, `${label}.age`);
      const zip = join(root, `${label}.zip`);
      const archive = await run(`${label}-encrypt`, {
        kind: writer === 'yazl' ? 'yazl-archive' : 'archive',
        scope,
        target: age,
        bytes: 4 * 1024 ** 3 + MiB,
        entries: 100000,
        yazlModule,
      });
      await run(`${label}-decrypt`, {
        kind: 'decrypt',
        source: age,
        target: zip,
        password: PASSWORD,
      });
      const verified = await run(`${label}-validate`, {
        kind: 'validate',
        source: zip,
        expected: archive.expected,
      });
      assert.equal(verified.bytes, archive.inputBytes);
      assert.equal(verified.count, scope === 'many' ? 100001 : 2);
      await rm(age);
      await rm(zip);
    }
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    report.error = error.stack;
    process.exitCode = 1;
  } finally {
    await rm(root, { force: true, recursive: true });
    report.cleanedTemporaryDirectory = !existsSync(root);
    report.finishedAt = new Date().toISOString();
    await writeFile(
      join(
        directory,
        comparing
          ? 'report-writer-comparison.json'
          : 'report-fresh-memory.json',
      ),
      JSON.stringify(report, null, 2) + '\n',
    );
  }
}
