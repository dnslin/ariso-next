import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, statfs, writeFile } from 'node:fs/promises';
import { createServer, get } from 'node:http';
import { tmpdir, totalmem, cpus } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { Worker } from 'node:worker_threads';
import Database from 'better-sqlite3';
import { checkAgeProfile, MiB, PASSWORD } from './archive.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const mode = process.argv[2] ?? '--small';
assert(
  ['--small', '--all', '--scale'].includes(mode),
  'use --small, --scale or --all',
);
const largeBytes = 4 * 1024 ** 3 + MiB;
const root = await mkdtemp(join(tmpdir(), 'ariso-format-experiment-'));
const free = await statfs(root);
assert(
  free.bavail * free.bsize > 14 * 1024 ** 3,
  'At least 14 GiB free is required for the real large-file experiment',
);
const report = {
  scope: 'isolated-format-experiment-not-product-implementation',
  startedAt: new Date().toISOString(),
  command: `${process.execPath} tests/experiments/backup/format/run.mjs ${mode}`,
  environment: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpu: cpus()[0]?.model,
    cpus: cpus().length,
    totalMemoryBytes: totalmem(),
    freeDiskBytes: free.bavail * free.bsize,
  },
  parameters: {
    zip64: true,
    store: true,
    scryptLogN: 18,
    largeBytes,
    objectEntries: 100000,
  },
  instrumentation: {
    rssSampleIntervalMs: 50,
    webStreamQueueSizing: 'byteLength',
    sha256:
      'only marked comparison fixtures; every entry still validates CRC and length',
  },
  cases: [],
  workerMeasurements: [],
};
const server = createServer((_request, response) => response.end('responsive'));
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const port = server.address().port;

async function runWorker(label, job, cancelAtBytes) {
  const started = performance.now();
  const baselineRss = process.memoryUsage().rss;
  let peakRss = baselineRss;
  const latency = [];
  const stages = [];
  let pendingPing = false;
  let pingFailures = 0;
  const delay = monitorEventLoopDelay({ resolution: 10 });
  delay.enable();
  const worker = new Worker(new URL('./worker.mjs', import.meta.url), {
    workerData: job,
  });
  let result;
  let cancelRequested = false;
  const timer = setInterval(() => {
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
    if (pendingPing) return;
    pendingPing = true;
    const begin = performance.now();
    const request = get(
      { hostname: '127.0.0.1', port, path: '/', agent: false },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => {
          if (body !== 'responsive' || response.statusCode !== 200)
            pingFailures++;
          latency.push(performance.now() - begin);
          pendingPing = false;
        });
      },
    );
    request.on('error', () => {
      pingFailures++;
      pendingPing = false;
    });
  }, 50);
  let progressAt = performance.now();
  const finished = new Promise((resolve, reject) => {
    worker.on('message', (message) => {
      peakRss = Math.max(peakRss, process.memoryUsage().rss);
      if (message.type === 'result') result = message;
      if (message.type === 'progress') {
        if (message.stage === 'kdf-start' || message.stage === 'kdf-complete')
          stages.push({
            stage: message.stage,
            atMs: performance.now() - started,
          });
        if (performance.now() - progressAt >= 10000) {
          console.log(
            JSON.stringify({
              label,
              stage: message.stage,
              bytes: message.inputBytes,
              count: message.count,
            }),
          );
          progressAt = performance.now();
        }
        if (
          cancelAtBytes &&
          message.inputBytes >= cancelAtBytes &&
          !cancelRequested
        ) {
          cancelRequested = true;
          void worker.terminate().catch(reject);
        }
      }
    });
    worker.once('error', reject);
    worker.once('exit', (exitCode) => {
      if (cancelRequested) resolve({ cancelled: true, exitCode });
      else if (result) resolve(result);
      else
        reject(
          new Error(`${label}: worker exited ${exitCode} without a result`),
        );
    });
  });
  try {
    const outcome = await finished;
    const ordered = latency.toSorted((a, b) => a - b);
    const measurement = {
      label,
      elapsedMs: performance.now() - started,
      baselineRss,
      peakRss,
      rssGrowth: peakRss - baselineRss,
      mainEventLoopMaxMs: delay.max / 1e6,
      mainEventLoopP99Ms: delay.percentile(99) / 1e6,
      httpProbeCount: ordered.length,
      httpProbeFailures: pingFailures,
      httpP95Ms: ordered[Math.floor((ordered.length - 1) * 0.95)] ?? null,
      httpMaxMs: ordered.at(-1) ?? null,
      stages,
      workerExited: worker.threadId === -1,
    };
    report.workerMeasurements.push(measurement);
    assert.equal(
      pingFailures,
      0,
      'loopback probe failed during worker activity',
    );
    assert.equal(worker.threadId, -1, 'worker must actually exit');
    if (stages.some((stage) => stage.stage === 'kdf-complete'))
      assert(
        ordered.length > 0,
        'main HTTP server must respond while a KDF worker is active',
      );
    return outcome;
  } finally {
    clearInterval(timer);
    delay.disable();
    if (worker.threadId !== -1) await worker.terminate();
  }
}

async function success(label, job) {
  const result = await runWorker(label, job);
  assert(result.ok, `${label}: ${result.error?.message ?? 'worker failed'}`);
  return result.result;
}

async function check(label, operation) {
  const begin = performance.now();
  try {
    const details = await operation();
    report.cases.push({
      label,
      status: 'passed',
      elapsedMs: performance.now() - begin,
      ...details,
    });
    console.log(JSON.stringify({ case: label, status: 'passed' }));
  } catch (error) {
    report.cases.push({
      label,
      status: 'failed',
      elapsedMs: performance.now() - begin,
      error: error.message,
    });
    throw error;
  }
}

async function expectDecryptFailure(label, source, password, noKdf = false) {
  const target = join(root, `${label}.zip`);
  const result = await runWorker(label, {
    kind: 'decrypt',
    source,
    target,
    password,
  });
  assert.equal(result.ok, false, `${label} must fail`);
  assert.equal(
    existsSync(target),
    false,
    'failed decryption must not publish a ZIP',
  );
  assert.equal(
    existsSync(`${target}.part`),
    false,
    'failed decryption must remove its partial plaintext',
  );
  if (noKdf)
    assert.equal(
      report.workerMeasurements.at(-1).stages.length,
      0,
      'resource profile must reject before KDF',
    );
  return { observedError: result.error.message };
}

function replaceName(buffer, before, after) {
  assert.equal(Buffer.byteLength(before), Buffer.byteLength(after));
  const result = Buffer.from(buffer);
  let count = 0;
  for (
    let offset = 0;
    (offset = result.indexOf(before, offset)) >= 0;
    offset += before.length
  ) {
    result.write(after, offset, 'utf8');
    count++;
  }
  assert.equal(count, 2, 'mutate both local and central names');
  return result;
}

function centralOffset(buffer, name) {
  const signature = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
  for (
    let offset = 0;
    (offset = buffer.indexOf(signature, offset)) >= 0;
    offset += 4
  ) {
    const length = buffer.readUInt16LE(offset + 28);
    if (buffer.subarray(offset + 46, offset + 46 + length).toString() === name)
      return offset;
  }
  throw new Error(`central entry missing: ${name}`);
}

function cli(mode, source, target) {
  const binary =
    process.env.AGE_BINARY ??
    join(directory, '../../../..', '.data/backup-experiment-tools/bin/age');
  assert(existsSync(binary), `official age CLI missing: ${binary}`);
  const command = spawnSync(
    '/usr/bin/python3',
    [join(directory, 'age-cli.py')],
    {
      input: JSON.stringify({
        binary,
        mode,
        source,
        target,
        password: PASSWORD,
      }),
      encoding: 'utf8',
      timeout: 65000,
    },
  );
  assert.equal(
    command.status,
    0,
    `age CLI ${mode}: ${command.stdout} ${command.stderr}`,
  );
  return JSON.parse(command.stdout);
}

try {
  const database = join(root, 'fixture.db');
  const db = new Database(database);
  db.exec('CREATE TABLE fixture (id TEXT PRIMARY KEY, title TEXT NOT NULL)');
  db.prepare('INSERT INTO fixture VALUES (?, ?)').run(
    'sample-1',
    '中文原图与相册',
  );
  db.close();
  const tinyAge = join(root, 'tiny.zip.age');
  const tinyZip = join(root, 'tiny.zip');
  let tiny;
  await check('small-streaming-roundtrip-and-unicode', async () => {
    tiny = await success('tiny-encrypt', {
      kind: 'archive',
      target: tinyAge,
      scope: 'tiny',
      database,
    });
    const decrypted = await success('tiny-decrypt', {
      kind: 'decrypt',
      source: tinyAge,
      target: tinyZip,
      password: PASSWORD,
    });
    const verified = await success('tiny-validate', {
      kind: 'validate',
      source: tinyZip,
      expected: tiny.expected,
    });
    assert.equal(verified.count, 6);
    assert.equal(verified.bytes, tiny.inputBytes);
    const header = await checkAgeProfile(tinyAge);
    assert.equal(header.logN, 18);
    return {
      entryCount: verified.count,
      originalBytes: verified.bytes,
      ciphertextBytes: tiny.archiveBytes,
      header,
      zipBytes: decrypted.zipBytes,
    };
  });

  if (mode !== '--scale') {
    await check('wrong-password-does-not-publish', () =>
      expectDecryptFailure(
        'wrong-password',
        tinyAge,
        'a deliberately wrong fixture password',
      ),
    );
    const ciphertext = await readFile(tinyAge);
    const profile = await checkAgeProfile(tinyAge);
    const flipped = Buffer.from(ciphertext);
    flipped[profile.headerBytes + 40] ^= 1;
    const flippedPath = join(root, 'flipped.age');
    await writeFile(flippedPath, flipped);
    await check('ciphertext-bit-flip-rejected', () =>
      expectDecryptFailure('bit-flip', flippedPath, PASSWORD),
    );
    const truncatedPath = join(root, 'truncated.age');
    await writeFile(truncatedPath, ciphertext.subarray(0, -17));
    await check('missing-final-authentication-rejected', () =>
      expectDecryptFailure('truncated', truncatedPath, PASSWORD),
    );
    const factorPath = join(root, 'factor.age');
    const factor = Buffer.from(ciphertext);
    const position = factor.subarray(0, profile.headerBytes).indexOf(' 18\n');
    assert(position >= 0);
    factor.write(' 20\n', position);
    await writeFile(factorPath, factor);
    await check('excessive-kdf-profile-rejected-before-kdf', () =>
      expectDecryptFailure('factor', factorPath, PASSWORD, true),
    );
    const longHeaderPath = join(root, 'long-header.age');
    await writeFile(
      longHeaderPath,
      Buffer.concat([
        Buffer.from('age-encryption.org/v1\n' + 'x'.repeat(1100) + '\n'),
        ciphertext,
      ]),
    );
    await check('oversized-header-rejected-before-kdf', () =>
      expectDecryptFailure('long-header', longHeaderPath, PASSWORD, true),
    );

    const rawZip = await readFile(tinyZip);
    const badCrc = Buffer.from(rawZip);
    const offset = centralOffset(badCrc, 'objects/local/a.bin');
    badCrc.writeUInt32LE(
      (badCrc.readUInt32LE(offset + 16) ^ 1) >>> 0,
      offset + 16,
    );
    const badSize = Buffer.from(rawZip);
    badSize.writeUInt32LE(badSize.readUInt32LE(offset + 24) + 1, offset + 24);
    const mutations = [
      ['zip-crc-mismatch', badCrc, /CRC_MISMATCH/],
      ['zip-size-mismatch', badSize, /size|SIZE|stored|mismatch/],
      [
        'zip-path-escape',
        replaceName(rawZip, 'manifest.json', '../evil/x.bin'),
        /relative path|PATH|path/,
      ],
      [
        'zip-duplicate-entry',
        replaceName(rawZip, 'objects/local/b.bin', 'objects/local/a.bin'),
        /DUPLICATE_ENTRY/,
      ],
    ];
    for (const [label, bytes, pattern] of mutations) {
      await check(label, async () => {
        const source = join(root, `${label}.zip`);
        await writeFile(source, bytes);
        const result = await runWorker(label, { kind: 'validate', source });
        assert.equal(result.ok, false);
        assert.match(result.error.message, pattern);
        return { observedError: result.error.message };
      });
    }

    await check('source-read-failure-does-not-publish', async () => {
      const target = join(root, 'source-failure.age');
      const result = await runWorker('source-failure', {
        kind: 'archive',
        target,
        scope: 'source-failure',
        bytes: 4 * MiB,
      });
      assert.equal(result.ok, false);
      assert.match(result.error.message, /INJECTED_SOURCE_READ_FAILURE/);
      assert(!existsSync(target));
      assert(!existsSync(`${target}.part`));
    });
    await check('worker-cancellation-does-not-publish', async () => {
      const target = join(root, 'cancel.age');
      const result = await runWorker(
        'cancel-worker',
        { kind: 'archive', target, scope: 'cancel', bytes: largeBytes },
        8 * MiB,
      );
      assert(result.cancelled);
      assert(!existsSync(target));
      const retainedPartial = existsSync(`${target}.part`);
      await rm(`${target}.part`, { force: true });
      return {
        retainedPartialAfterForcedTermination: retainedPartial,
        coordinatorRemovedPartial: true,
      };
    });
    await check('official-age-cli-bidirectional', async () => {
      const cliZip = join(root, 'cli-decoded.zip');
      const cliAge = join(root, 'cli-encrypted.age');
      const decoded = join(root, 'cli-roundtrip.zip');
      const decrypt = cli('decrypt', tinyAge, cliZip);
      await success('cli-decrypted-zip-validate', {
        kind: 'validate',
        source: cliZip,
        expected: tiny.expected,
      });
      const encrypt = cli('encrypt', tinyZip, cliAge);
      const profile = await checkAgeProfile(cliAge);
      await success('cli-generated-age-decrypt', {
        kind: 'decrypt',
        source: cliAge,
        target: decoded,
        password: PASSWORD,
      });
      await success('cli-generated-zip-validate', {
        kind: 'validate',
        source: decoded,
        expected: tiny.expected,
      });
      return { decrypt, encrypt, profile };
    });
  }

  if (mode === '--all' || mode === '--scale') {
    await check('zip64-real-file-over-4gib', async () => {
      const age = join(root, 'large.zip.age');
      const zip = join(root, 'large.zip');
      const archive = await success('large-encrypt', {
        kind: 'archive',
        target: age,
        scope: 'large',
        bytes: largeBytes,
      });
      assert(archive.archiveBytes > 2 ** 32);
      await success('large-decrypt', {
        kind: 'decrypt',
        source: age,
        target: zip,
        password: PASSWORD,
      });
      const verified = await success('large-validate', {
        kind: 'validate',
        source: zip,
        expected: archive.expected,
      });
      assert.equal(verified.count, 2);
      assert.equal(verified.bytes, archive.inputBytes);
      await rm(age);
      await rm(zip);
      return {
        payloadBytes: largeBytes,
        ciphertextBytes: archive.archiveBytes,
        verifiedBytes: verified.bytes,
        entryCount: verified.count,
      };
    });
    await check('zip64-one-hundred-thousand-objects', async () => {
      const age = join(root, 'many.zip.age');
      const zip = join(root, 'many.zip');
      const archive = await success('many-encrypt', {
        kind: 'archive',
        target: age,
        scope: 'many',
        entries: 100000,
      });
      await success('many-decrypt', {
        kind: 'decrypt',
        source: age,
        target: zip,
        password: PASSWORD,
      });
      const verified = await success('many-validate', {
        kind: 'validate',
        source: zip,
        expected: archive.expected,
      });
      assert.equal(archive.count, 100001);
      assert.equal(verified.count, 100001);
      assert.equal(archive.inputBytes, verified.bytes);
      await rm(age);
      await rm(zip);
      return {
        objectCount: 100000,
        archiveEntryCount: verified.count,
        ciphertextBytes: archive.archiveBytes,
        verifiedBytes: verified.bytes,
      };
    });
  }
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error.stack;
  process.exitCode = 1;
} finally {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await rm(root, { recursive: true, force: true });
  report.cleanedTemporaryDirectory = !existsSync(root);
  report.finishedAt = new Date().toISOString();
  const output = join(directory, `report-${mode.slice(2)}.json`);
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify({
      status: report.status,
      cases: report.cases.length,
      report: output,
      cleanup: report.cleanedTemporaryDirectory,
    }),
  );
}
