import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readdirSync, realpathSync, statSync, statfsSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  open,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { execa } from 'execa';
import { eq } from 'drizzle-orm';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import { createRuntimeLogger } from '../../../src/server/runtime/logger.ts';
import {
  prepareInitialStorage,
  resolveUploadStorage,
} from '../../../src/server/storage/defaults.ts';
import {
  planLocalWrite,
  writeObject,
} from '../../../src/server/storage/local.ts';
import {
  acceptOriginal,
  getImageAccessState,
} from '../../../src/server/media/images.ts';
import {
  createProcessingSnapshot,
  prepareInitialMedia,
  updateMediaSettings,
} from '../../../src/server/media/settings.ts';
import { initialMediaSettings } from '../../../src/server/media/validation.ts';
import { mediaJobs } from '../../../src/server/media/schema.ts';
import { startMediaQueue } from '../../../src/server/media/queue.ts';
import { describeProcessingError } from '../../../src/server/media/formats.ts';
import type { MediaRuntime } from '../../../src/server/media/process.ts';

const MiB = 1024 * 1024;
const volume = realpathSync(process.argv[2] ?? '/tmp/ariso-media-64-volume');
const filesystem = statfsSync(volume);
assert.ok(
  filesystem.blocks * filesystem.bsize <= 512 * MiB,
  'Refuse to fill any filesystem larger than the dedicated 512 MiB test boundary',
);
assert.notEqual(
  statSync(volume).dev,
  statSync(dirname(volume)).dev,
  'The fill target must be its own mounted filesystem',
);
const reportPath = resolve('test-results/media-64/low-space.json');
const directory = await mkdtemp(join(tmpdir(), 'ariso-media-recovery-'));
const work = join(volume, `issue64-${randomUUID()}`);
await mkdir(directory, { recursive: true });
await mkdir(join(work, 'storage'), { recursive: true });
await mkdir(join(work, 'tmp'));
const databasePath = join(directory, 'ariso.db');
let connection = openRuntimeDatabase(databasePath);
migrateRuntimeDatabase(connection.db, resolve('drizzle'));
prepareInitialStorage(connection.db, { storage: join(work, 'storage') });
connection.db.transaction(prepareInitialMedia);
const runtime: MediaRuntime = {
  db: connection.db,
  storageRoot: join(work, 'storage'),
  temporaryRoot: join(work, 'tmp'),
  logger: createRuntimeLogger('media.low-space', 'fatal'),
};
let queue: ReturnType<typeof startMediaQueue> | undefined;
let phase = 'initial';
type Sample = {
  time: number;
  phase: string;
  freeBytes: number;
  parentRssBytes: number;
  allocatedBytes: number;
  tools: { pid: number; rssBytes: number; state: string }[];
};
const samples: Sample[] = [];
function freeBytes() {
  const info = statfsSync(volume);
  return info.bavail * info.bsize;
}
function allocated(path: string): number {
  return readdirSync(path, { withFileTypes: true }).reduce((total, entry) => {
    const child = join(path, entry.name);
    try {
      return (
        total +
        (entry.isDirectory() ? allocated(child) : statSync(child).blocks * 512)
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return total;
      throw error;
    }
  }, 0);
}
async function sample() {
  const { stdout } = await execa('ps', ['-axo', 'pid=,rss=,stat=,command='], {
    timeout: 1000,
  });
  const tools = stdout.split('\n').flatMap((line) => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
    if (
      !match ||
      match[3].startsWith('Z') ||
      !match[4].includes(runtime.temporaryRoot + '/media-')
    )
      return [];
    return [
      {
        pid: Number(match[1]),
        rssBytes: Number(match[2]) * 1024,
        state: match[3],
      },
    ];
  });
  samples.push({
    time: Date.now(),
    phase,
    freeBytes: freeBytes(),
    parentRssBytes: process.memoryUsage().rss,
    allocatedBytes: allocated(work),
    tools,
  });
}
function digest(bytes: Buffer) {
  return createHash('sha256').update(bytes).digest('hex');
}
async function accept(extension: 'jpg' | 'png') {
  const bytes = await readFile(
    resolve(`tests/fixtures/runtime/images/sample.${extension}`),
  );
  const storage = resolveUploadStorage(connection.db);
  const plan = planLocalWrite('uploads');
  await writeObject(runtime.storageRoot, storage, plan, Readable.from(bytes));
  const accepted = connection.db.transaction((tx) =>
    acceptOriginal(tx, {
      imageId: randomUUID(),
      storageId: storage.id,
      key: plan.key,
      originalName: `sample.${extension}`,
      visibility: 'private',
      format: extension === 'jpg' ? 'JPEG' : 'PNG',
      mime: extension === 'jpg' ? 'image/jpeg' : 'image/png',
      byteSize: bytes.length,
      snapshot: createProcessingSnapshot(tx),
      expectedVersions: ['compressed', 'thumbnail'],
    }),
  );
  return {
    ...accepted,
    storage,
    path: join(
      runtime.storageRoot,
      storage.localPath,
      'ariso',
      storage.id,
      plan.key,
    ),
    digest: digest(bytes),
    extension,
  };
}
async function verifyOriginal(image: Awaited<ReturnType<typeof accept>>) {
  assert.equal(digest(await readFile(image.path)), image.digest);
}
async function terminal(jobId: string) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const job = connection.db
      .select()
      .from(mediaJobs)
      .where(eq(mediaJobs.id, jobId))
      .get()!;
    if (job.status === 'succeeded' || job.status === 'failed') return job;
    await delay(10);
  }
  throw new Error(`Job did not finish: ${jobId}`);
}
async function stop() {
  await queue?.stop();
  queue = undefined;
}
const evidence: Record<string, unknown> = {
  node: process.version,
  platform: process.platform,
  architecture: process.arch,
  volume,
  volumeBytes: filesystem.blocks * filesystem.bsize,
  databasePath,
  work,
  initialFreeBytes: freeBytes(),
  measurement:
    '25 ms samples; main Node RSS; actual allocated blocks under the dedicated volume work directory; ps observes live workspace-marked tools',
  cases: [],
};
const cases = evidence.cases as Record<string, unknown>[];
let sampling: Promise<void> | undefined;
let samplingError: unknown;
await sample();
const timer = setInterval(() => {
  if (!sampling)
    sampling = sample()
      .catch((error) => {
        samplingError = error;
      })
      .finally(() => {
        sampling = undefined;
      });
}, 25);
const filler = join(work, 'dedicated-volume-filler');
try {
  for (const concurrency of [1, 2, 3, 4]) {
    phase = `small-concurrency-${concurrency}`;
    connection.db.transaction((tx) =>
      updateMediaSettings(tx, { ...initialMediaSettings, concurrency }),
    );
    const images = [];
    for (let index = 0; index < concurrency * 2; index++)
      images.push(await accept(index % 2 ? 'jpg' : 'png'));
    const before = freeBytes();
    assert.ok(before > 256 * MiB && before < 512 * MiB);
    const started = Date.now();
    queue = startMediaQueue(runtime);
    const initiallyRunning = connection.db
      .select()
      .from(mediaJobs)
      .where(eq(mediaJobs.status, 'running'))
      .all().length;
    assert.equal(initiallyRunning, concurrency);
    const jobs = await Promise.all(
      images.map((image) => terminal(image.jobId)),
    );
    for (const job of jobs)
      assert.equal(job.status, 'succeeded', job.error ?? '');
    await stop();
    for (const image of images) {
      await verifyOriginal(image);
      const state = getImageAccessState(connection.db, image.imageId)!;
      assert.equal(state.versions.filter((version) => version.saved).length, 3);
    }
    await sample();
    assert.deepEqual(samples.at(-1)!.tools, []);
    cases.push({
      phase,
      concurrency,
      initiallyRunning,
      durationMs: Date.now() - started,
      beforeFreeBytes: before,
      afterFreeBytes: freeBytes(),
      originals: images.map(({ imageId, digest, extension }) => ({
        imageId,
        digest,
        extension,
      })),
      status: 'passed',
    });
  }

  // Originals and owning database rows exist before external space consumption.
  const lowImage = await accept('png');
  const fullImage = await accept('jpg');
  // Hold the second task out of the first observation without changing media behavior.
  connection.db
    .update(mediaJobs)
    .set({ nextAttemptAt: new Date(Date.now() + 60000) })
    .where(eq(mediaJobs.id, fullImage.jobId))
    .run();
  phase = 'low-water-production-queue';
  const handle = await open(filler, 'wx');
  try {
    const block = Buffer.alloc(MiB, 0x5a);
    while (freeBytes() > 240 * MiB) await handle.write(block);
    const before = freeBytes();
    queue = startMediaQueue(runtime);
    const lowJob = await terminal(lowImage.jobId);
    await stop();
    assert.equal(lowJob.status, 'failed');
    assert.match(lowJob.error!, /INSUFFICIENT_DISK_SPACE/);
    assert.equal(lowJob.retryCount, 0);
    await verifyOriginal(lowImage);
    cases.push({
      phase,
      beforeFreeBytes: before,
      status: lowJob.status,
      error: lowJob.error,
      retryCount: lowJob.retryCount,
      originalDigest: lowImage.digest,
      boundary:
        'Real production queue rejected below 256 MiB before launching image processing; no forced statfs values',
    });

    phase = 'real-enospc-storage-write';
    // Fill only the already validated, dedicated <=512 MiB mounted filesystem.
    for (const chunk of [block, Buffer.alloc(4096, 0x5a)]) {
      await assert.rejects(
        async () => {
          while (true) await handle.write(chunk);
        },
        { code: 'ENOSPC' },
      );
    }
    const fullFree = freeBytes();
    assert.ok(fullFree < 4096);
    let writeFailure: unknown;
    try {
      await writeObject(
        runtime.storageRoot,
        fullImage.storage,
        planLocalWrite('uploads'),
        Readable.from(Buffer.alloc(64 * 1024, 0x42)),
      );
      assert.fail('Full-volume storage write unexpectedly succeeded');
    } catch (error) {
      writeFailure = error;
    }
    let native = writeFailure;
    while (native instanceof Error && native.cause) native = native.cause;
    assert.equal((native as NodeJS.ErrnoException).code, 'ENOSPC');
    await verifyOriginal(lowImage);
    await verifyOriginal(fullImage);
    cases.push({
      phase,
      beforeFreeBytes: fullFree,
      nativeCode: (native as NodeJS.ErrnoException).code,
      diagnostic: describeProcessingError(writeFailure),
      originalDigests: [lowImage.digest, fullImage.digest],
      boundary:
        'Actual writeObject storage operation failed ENOSPC after an external filler exhausted this volume. This bypasses the media low-water guard; it is not claimed as an end-to-end media write ENOSPC.',
    });

    phase = 'full-volume-production-queue';
    connection.db
      .update(mediaJobs)
      .set({ nextAttemptAt: null })
      .where(eq(mediaJobs.id, fullImage.jobId))
      .run();
    queue = startMediaQueue(runtime);
    const fullJob = await terminal(fullImage.jobId);
    await stop();
    assert.equal(fullJob.status, 'failed');
    assert.match(fullJob.error!, /INSUFFICIENT_DISK_SPACE/);
    assert.equal(fullJob.retryCount, 0);
    await verifyOriginal(fullImage);
    cases.push({
      phase,
      freeBytes: freeBytes(),
      error: fullJob.error,
      retryCount: fullJob.retryCount,
      originalDigest: fullImage.digest,
      boundary:
        'Actual production queue failure on the full volume; database remains on the host volume so failure can be durably recorded.',
    });
  } finally {
    await handle.close();
  }
  await rm(filler);
  phase = 'reopen-after-space-recovered';
  connection.close();
  connection = openRuntimeDatabase(databasePath);
  runtime.db = connection.db;
  queue = startMediaQueue(runtime);
  await delay(250);
  await stop();
  for (const image of [lowImage, fullImage]) {
    const job = connection.db
      .select()
      .from(mediaJobs)
      .where(eq(mediaJobs.id, image.jobId))
      .get()!;
    assert.equal(job.status, 'failed');
    assert.equal(job.retryCount, 0);
    await verifyOriginal(image);
  }
  cases.push({
    phase,
    freeBytes: freeBytes(),
    status: 'passed',
    detail:
      'Reopening the persistent database and restarting the production queue does not restart either permanent disk-space failure.',
  });
  evidence.status = 'passed';
} catch (error) {
  evidence.status = 'failed';
  evidence.error = error instanceof Error ? error.stack : String(error);
  throw error;
} finally {
  await stop();
  clearInterval(timer);
  await sampling;
  await rm(filler, { force: true });
  await sample();
  evidence.samples = samples;
  evidence.peakParentRssBytes = Math.max(
    ...samples.map((item) => item.parentRssBytes),
  );
  evidence.peakToolRssBytes = Math.max(
    ...samples.map((item) =>
      item.tools.reduce((total, tool) => total + tool.rssBytes, 0),
    ),
  );
  evidence.peakAllocatedBytes = Math.max(
    ...samples.map((item) => item.allocatedBytes),
  );
  evidence.minimumFreeBytes = Math.min(
    ...samples.map((item) => item.freeBytes),
  );
  evidence.remainingTools = samples.at(-1)!.tools;
  evidence.samplingError =
    samplingError instanceof Error ? samplingError.stack : samplingError;
  if (samplingError || samples.at(-1)!.tools.length > 0)
    evidence.status = 'failed';
  await writeFile(reportPath, JSON.stringify(evidence, null, 2) + '\n');
  connection.close();
  await rm(directory, { recursive: true, force: true });
  await rm(work, { recursive: true, force: true });
  assert.deepEqual(evidence.remainingTools, []);
  if (samplingError) throw samplingError;
}
console.log(`Evidence: ${reportPath}`);
