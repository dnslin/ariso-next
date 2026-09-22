import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  createReadStream,
  readFileSync,
  readdirSync,
  statSync,
  statfsSync,
} from 'node:fs';
import { mkdir, open, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { execa } from 'execa';

export const MiB = 1024 * 1024;
export const baseline = {
  memory: 256 * MiB,
  disk: 512 * MiB,
  lowWater: 256 * MiB,
  imageTimeout: 120000,
  metadataTimeout: 30000,
  killDelay: 1000,
};
export function freeBytes(path) {
  const info = statfsSync(path);
  return info.bavail * info.bsize;
}
export function cacheBudget(free, concurrency) {
  return Math.min(
    baseline.disk,
    Math.max(0, Math.floor((free - baseline.lowWater) / concurrency)),
  );
}
export function limits(disk, memory = baseline.memory) {
  return [
    '-limit',
    'memory',
    String(memory),
    '-limit',
    'map',
    '0',
    '-limit',
    'disk',
    String(disk),
    '-limit',
    'thread',
    '1',
  ];
}
export async function hash(path) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest('hex');
}
function allocated(path) {
  let bytes = 0;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    try {
      bytes += entry.isDirectory()
        ? allocated(child)
        : statSync(child).blocks * 512;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return bytes;
}

// Linux /proc measurements are observations, never admission limits.
export function createMeasurement(directory, commands) {
  const active = new Set();
  function sample() {
    let childRss = 0;
    for (const child of active) {
      if (!child.pid) continue;
      try {
        const status = readFileSync(`/proc/${child.pid}/status`, 'utf8');
        childRss += Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1] ?? 0) * 1024;
      } catch (error) {
        if (error.code !== 'ENOENT' && error.code !== 'ESRCH') throw error;
      }
    }
    return {
      time: Date.now(),
      active: active.size,
      childRss,
      parentRss: process.memoryUsage().rss,
      allocated: allocated(directory),
      free: freeBytes(directory),
    };
  }
  async function run(file, args, options = {}) {
    const start = Date.now();
    const child = execa(file, args, {
      timeout:
        file === 'exiftool' ? baseline.metadataTimeout : baseline.imageTimeout,
      forceKillAfterDelay: baseline.killDelay,
      maxBuffer: 32 * MiB,
      ...options,
    });
    active.add(child);
    try {
      return await child;
    } finally {
      active.delete(child);
      commands.push({ file, args, durationMs: Date.now() - start });
    }
  }
  async function measure(name, action) {
    const curve = [sample()];
    let samplingError;
    const timer = setInterval(() => {
      try {
        curve.push(sample());
      } catch (error) {
        samplingError ??= error;
      }
    }, 25);
    try {
      const result = await action();
      if (samplingError) throw samplingError;
      return { name, result, curve, durationMs: Date.now() - curve[0].time };
    } catch (error) {
      error.measurement = { name, curve };
      throw error;
    } finally {
      clearInterval(timer);
      curve.push(sample());
    }
  }
  return { run, measure };
}

export async function verifyResources({
  sourceDirectory,
  directory,
  run,
  measure,
}) {
  const initialFree = freeBytes(directory);
  const fs = statfsSync(directory);
  assert.ok(
    fs.blocks * fs.bsize <= 512 * MiB && initialFree > 300 * MiB,
    'Use a dedicated 384 MiB limited volume, never a host data disk',
  );
  const source = join(sourceDirectory, 'resource.png');
  await run('magick', [
    ...limits(0),
    '-size',
    '2048x1536',
    'gradient:#173047-#e7af70',
    source,
  ]);
  const originalHash = await hash(source);
  const originalBytes = (await stat(source)).size;
  const evidence = {
    initialFree,
    volumeBytes: fs.blocks * fs.bsize,
    originalHash,
    originalBytes,
    batches: [],
  };
  const sentinel = join(directory, 'unrelated');
  await writeFile(sentinel, 'preserve unrelated content');
  for (const memory of [baseline.memory, MiB]) {
    for (const concurrency of [1, 2, 3, 4]) {
      const disk = cacheBudget(freeBytes(directory), concurrency);
      const batch = await measure(
        `memory-${memory}-concurrency-${concurrency}`,
        async () => {
          const results = await Promise.allSettled(
            Array.from({ length: concurrency }, async (_, index) => {
              const work = join(directory, `job-${index}`);
              await mkdir(work);
              const output = join(work, 'thumbnail.webp');
              const result = await run(
                'magick',
                [
                  ...limits(disk, memory),
                  source,
                  '-auto-orient',
                  '-colorspace',
                  'sRGB',
                  '-resize',
                  '640x640>',
                  '-strip',
                  '-quality',
                  '80',
                  output,
                ],
                { env: { MAGICK_TEMPORARY_PATH: work } },
              );
              const { stdout } = await run('magick', [
                'identify',
                '-format',
                '%m %wx%h',
                output,
              ]);
              assert.equal(stdout, 'WEBP 640x480');
              assert.deepEqual(
                await readdir(work),
                ['thumbnail.webp'],
                'Successful process releases cache',
              );
              const bytes = (await stat(output)).size;
              await rm(work, { recursive: true });
              return { durationMs: result.durationMs, bytes };
            }),
          );
          for (const result of results)
            if (result.status === 'rejected') throw result.reason;
          return results.map((result) => result.value);
        },
      );
      assert.ok(
        Math.max(...batch.curve.map((s) => s.active)) >= concurrency,
        'Observe actual overlapping subprocesses',
      );
      assert.ok(
        Math.min(...batch.curve.map((s) => s.free)) > baseline.lowWater,
        'Small batch stays above measured low-water mark',
      );
      if (memory === MiB)
        assert.ok(
          Math.max(...batch.curve.map((s) => s.allocated)) > MiB,
          'Forced spill must actually allocate disk cache',
        );
      evidence.batches.push({ concurrency, memory, disk, ...batch });
    }
  }
  // Real ENOSPC: fill only this isolated mount. This intentionally bypasses
  // the low-water monitor to represent another writer winning the space race.
  const reserve = join(directory, 'reserve');
  await writeFile(reserve, Buffer.alloc(64 * 1024));
  const filler = join(directory, 'filler');
  const handle = await open(filler, 'wx');
  try {
    const block = Buffer.alloc(MiB, 0x5a);
    await assert.rejects(
      async () => {
        while (true) await handle.write(block);
      },
      { code: 'ENOSPC' },
    );
  } finally {
    await handle.close();
  }
  assert.equal(freeBytes(directory), 0);
  await rm(reserve);
  const partial = join(directory, 'partial.rgba');
  const exhaustion = await measure('real-enospc', async () => {
    const result = await run(
      'magick',
      [...limits(0), source, '-depth', '8', `rgba:${partial}`],
      { reject: false },
    );
    assert.ok(
      result.failed && result.exitCode !== 0,
      'Tool must report failed write',
    );
    assert.ok(
      result.stderr.includes(partial),
      'Diagnostic retains failed output path',
    );
    const probe = join(directory, 'probe');
    await assert.rejects(writeFile(probe, Buffer.alloc(4096)), {
      code: 'ENOSPC',
    });
    await rm(probe, { force: true });
    assert.equal(await hash(source), originalHash);
    return {
      exitCode: result.exitCode,
      stderr: result.stderr,
      free: freeBytes(directory),
      partialBytes: (await stat(partial)).size,
      originalHash: await hash(source),
    };
  });
  await rm(filler);
  await rm(partial);
  assert.ok(
    freeBytes(directory) >= initialFree - 4096,
    'Exact cleanup reclaims space',
  );
  evidence.exhaustion = exhaustion;
  const recovered = join(directory, 'recovered.webp');
  await run('magick', [
    ...limits(cacheBudget(freeBytes(directory), 1)),
    source,
    '-resize',
    '640x640>',
    recovered,
  ]);
  assert.equal(
    (await run('magick', ['identify', '-format', '%m %wx%h', recovered]))
      .stdout,
    'WEBP 640x480',
  );
  await rm(recovered);
  evidence.recoveredFree = freeBytes(directory);
  assert.equal(await hash(source), originalHash);
  assert.equal(readFileSync(sentinel, 'utf8'), 'preserve unrelated content');
  return evidence;
}

export async function verifyStoppedTool({ directory, sourceDirectory, run }) {
  const fifo = join(sourceDirectory, 'waiting.png');
  await run('mkfifo', [fifo]);
  const controller = new AbortController();
  const child = execa(
    'magick',
    [...limits(0), fifo, join(directory, 'cancelled.webp')],
    {
      cancelSignal: controller.signal,
      forceKillAfterDelay: baseline.killDelay,
      timeout: 10000,
      reject: false,
    },
  );
  const resultPromise = child.then((result) => result);
  try {
    const deadline = Date.now() + 3000;
    while (
      readFileSync(`/proc/${child.pid}/comm`, 'utf8').trim() !== 'magick'
    ) {
      assert.ok(Date.now() < deadline, 'Real magick executable must start');
      await delay(10);
    }
    process.kill(child.pid, 'SIGSTOP');
    while (
      !/^State:\s+T/m.test(readFileSync(`/proc/${child.pid}/status`, 'utf8'))
    ) {
      assert.ok(Date.now() < deadline, 'Tool must reach stopped state');
      await delay(10);
    }
    const start = Date.now();
    controller.abort();
    const result = await resultPromise;
    const cancellationMs = Date.now() - start;
    assert.equal(result.signal, 'SIGKILL');
    assert.ok(result.isCanceled && cancellationMs < 5000);
    assert.throws(() => process.kill(child.pid, 0), { code: 'ESRCH' });
    return {
      file: 'magick',
      signal: result.signal,
      isCanceled: result.isCanceled,
      cancellationMs,
    };
  } finally {
    if (child.exitCode === null && child.signalCode === null)
      child.kill('SIGKILL');
    await resultPromise;
    await rm(fifo);
  }
}
