import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readdirSync, statSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { eq } from 'drizzle-orm';
import { execa } from 'execa';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
import { mediaJobs, mediaObjects } from '../../../src/server/media/schema.ts';
import {
  claimNextMediaJob,
  startMediaQueue,
} from '../../../src/server/media/queue.ts';
import { planDerivedObject } from '../../../src/server/media/objects.ts';
import type { MediaRuntime } from '../../../src/server/media/process.ts';
import * as mediaTools from '../../../src/server/media/tools.ts';

let directory: string;
let connection: ReturnType<typeof openRuntimeDatabase>;
let runtime: MediaRuntime;
let queue: ReturnType<typeof startMediaQueue> | undefined;
type ResourceSample = {
  time: number;
  parentRssBytes: number;
  toolRssBytes: number;
  allocatedBytes: number;
  tools: { pid: number; state: string }[];
};
let samples: ResourceSample[];
let sampling: Promise<void> | undefined;
let samplingError: unknown;
let sampleTimer: ReturnType<typeof setInterval>;
function allocated(path: string): number {
  let bytes = 0;
  for (const item of readdirSync(path, { withFileTypes: true })) {
    const child = join(path, item.name);
    try {
      bytes += item.isDirectory()
        ? allocated(child)
        : statSync(child).blocks * 512;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return bytes;
}
async function sampleResources() {
  const { stdout } = await execa('ps', ['-axo', 'pid=,rss=,stat=,command='], {
    timeout: 1000,
  });
  const tools = stdout.split('\n').flatMap((line) => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
    if (
      !match ||
      ![
        `registry:temporary-path=${runtime.temporaryRoot}/media-`,
        `ArisoWorkspace=${runtime.temporaryRoot}/media-`,
      ].some((marker) => match[4].includes(marker)) ||
      match[3].startsWith('Z')
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
    parentRssBytes: process.memoryUsage().rss,
    toolRssBytes: tools.reduce((total, tool) => total + tool.rssBytes, 0),
    allocatedBytes: allocated(directory),
    tools: tools.map(({ pid, state }) => ({ pid, state })),
  });
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ariso-recovery-tools-'));
  await mkdir(join(directory, 'storage'));
  await mkdir(join(directory, 'tmp'));
  connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  migrateRuntimeDatabase(connection.db, resolve('drizzle'));
  prepareInitialStorage(connection.db, { storage: join(directory, 'storage') });
  connection.db.transaction(prepareInitialMedia);
  runtime = {
    db: connection.db,
    storageRoot: join(directory, 'storage'),
    temporaryRoot: join(directory, 'tmp'),
    logger: createRuntimeLogger('media.recovery-test', 'fatal'),
  };
  samples = [];
  samplingError = undefined;
  await sampleResources();
  sampleTimer = setInterval(() => {
    if (sampling) return;
    sampling = sampleResources()
      .catch((error) => {
        samplingError ??= error;
      })
      .finally(() => {
        sampling = undefined;
      });
  }, 25);
});
afterEach(async (context) => {
  try {
    await queue?.stop();
    clearInterval(sampleTimer);
    await sampling;
    await sampleResources();
    if (samplingError) throw samplingError;
    const remainingTools = samples.at(-1)!.tools;
    const evidence = {
      name: context.task.name,
      platform: process.platform,
      architecture: process.arch,
      node: process.version,
      samplingIntervalMs: 25,
      parentRssScope:
        'Vitest Node process; forked worker Node RSS is not included',
      toolRssScope:
        'Sampled live ImageMagick/ExifTool processes identified by this test workspace; ps RSS KiB converted to bytes',
      diskScope:
        'Actual allocated filesystem blocks in this test data directory, including SQLite/WAL, objects and scratch files',
      peakParentRssBytes: Math.max(
        ...samples.map((sample) => sample.parentRssBytes),
      ),
      toolProcessSamples: samples.reduce(
        (total, sample) => total + sample.tools.length,
        0,
      ),
      peakToolRssBytes: samples.some((sample) => sample.tools.length > 0)
        ? Math.max(...samples.map((sample) => sample.toolRssBytes))
        : null,
      peakAllocatedBytes: Math.max(
        ...samples.map((sample) => sample.allocatedBytes),
      ),
      remainingTools,
      samples,
    };
    const reportDirectory = process.env.MEDIA_RECOVERY_REPORT_DIR;
    if (reportDirectory) {
      await mkdir(reportDirectory, { recursive: true });
      await writeFile(
        join(
          reportDirectory,
          `${context.task.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`,
        ),
        JSON.stringify(evidence, null, 2) + '\n',
      );
    }
    expect(evidence.peakParentRssBytes).toBeGreaterThan(0);
    expect(evidence.peakAllocatedBytes).toBeGreaterThan(0);
    expect(remainingTools).toEqual([]);
  } finally {
    clearInterval(sampleTimer);
    queue = undefined;
    connection.close();
    await rm(directory, { recursive: true, force: true });
  }
});
async function accept(extension = 'png') {
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
      visibility: 'public',
      format: 'PNG',
      mime: 'image/png',
      byteSize: bytes.length,
      snapshot: createProcessingSnapshot(tx),
      expectedVersions: ['compressed', 'thumbnail'],
    }),
  );
  return { ...accepted, bytes, storage, key: plan.key };
}
const state = (imageId: string) => getImageAccessState(connection.db, imageId)!;
function objectPath(storage: { localPath: string; id: string }, key: string) {
  return join(runtime.storageRoot, storage.localPath, 'ariso', storage.id, key);
}
async function completed(imageId: string) {
  await expect
    .poll(() => state(imageId).latestJob?.status, {
      timeout: 10000,
      interval: 10,
    })
    .toBe('succeeded');
  expect(state(imageId).image.processingStatus).toBe('ready');
}

// These cases require real ImageMagick and ExifTool. A startup spy applies OS
// signals where a test must keep a real tool active across a queue failure.
describe('T-MED-04 actual processing recovery', () => {
  it.each(['claim', 'settlement'] as const)(
    'preserves healthy concurrent work for recovery after a queue %s failure',
    async (failureSource) => {
      connection.db.transaction((tx) =>
        updateMediaSettings(tx, { ...initialMediaSettings, concurrency: 2 }),
      );
      const healthy = await accept();
      const failing = await accept();
      const waiting = await accept();
      let occupiedPath: string | undefined;
      let paused = false;
      const actualStart = mediaTools.startMediaTool;
      const controlledStart: typeof mediaTools.startMediaTool = (
        command,
        args,
        options,
      ) => {
        const tool = actualStart(command, args, options);
        if (
          failureSource === 'settlement' &&
          options.workspace.endsWith(`media-${healthy.jobId}`) &&
          !paused
        ) {
          // Keep a real healthy tool active until the other job's settlement
          // fails. The production cancellation path must terminate it.
          tool.child.kill('SIGSTOP');
          paused = true;
        }
        return tool;
      };
      const spy = vi
        .spyOn(mediaTools, 'startMediaTool')
        .mockImplementation(controlledStart);
      try {
        if (failureSource === 'settlement') {
          occupiedPath = objectPath(
            failing.storage,
            `images/${failing.imageId}/compressed`,
          );
          await mkdir(dirname(occupiedPath), { recursive: true });
          await writeFile(occupiedPath, 'prevent this job from writing');
        }
        connection.db.$client.exec(`
          CREATE TRIGGER fail_queue_operation BEFORE UPDATE OF status ON media_jobs
          WHEN NEW.id = '${failing.jobId}' AND NEW.status = '${failureSource === 'claim' ? 'running' : 'failed'}'
          BEGIN SELECT RAISE(ABORT, 'controlled queue ${failureSource} failure'); END;
        `);
        queue = startMediaQueue(runtime);
        await expect
          .poll(() => state(healthy.imageId).latestJob?.error, {
            timeout: 5000,
            interval: 10,
          })
          .toContain('MEDIA_');
        const stopped = queue.stop();
        queue = undefined;
        await expect(stopped).rejects.toThrow(
          `controlled queue ${failureSource} failure`,
        );
        if (failureSource === 'settlement') expect(paused).toBe(true);
        expect(state(healthy.imageId).latestJob).toMatchObject({
          status: 'running',
          error: expect.stringContaining('MEDIA_INTERRUPTED'),
          retryCount: 0,
          finishedAt: null,
        });
        expect(state(healthy.imageId).image.processingStatus).toBe(
          'processing',
        );
        connection.db.$client.exec('DROP TRIGGER fail_queue_operation');
        if (occupiedPath) await rm(occupiedPath);
        connection.close();
        connection = openRuntimeDatabase(join(directory, 'ariso.db'));
        runtime.db = connection.db;
        queue = startMediaQueue(runtime);
        await Promise.all(
          [healthy, failing, waiting].map((image) => completed(image.imageId)),
        );
        expect(state(healthy.imageId).latestJob?.retryCount).toBe(0);
        expect(
          await readFile(objectPath(healthy.storage, healthy.key)),
        ).toEqual(healthy.bytes);
      } finally {
        spy.mockRestore();
      }
    },
    20000,
  );

  it('repeats interrupted terminal recovery cleanup without reopening the failed job or deleting unknown workspaces', async () => {
    const accepted = await accept();
    connection.db
      .update(mediaJobs)
      .set({
        status: 'failed',
        recoveryCount: 2,
        step: 'compressed',
        error: 'compressed: MEDIA_RECOVERY_EXHAUSTED',
      })
      .where(eq(mediaJobs.id, accepted.jobId))
      .run();
    // The previous recovery committed exhaustion but died before removing scratch.
    const owned = join(runtime.temporaryRoot, `media-${accepted.jobId}`);
    const unknown = join(runtime.temporaryRoot, `media-${randomUUID()}`);
    await mkdir(owned);
    await mkdir(unknown);
    await writeFile(join(owned, 'leftover-cache'), 'owned');
    await writeFile(join(unknown, 'keep'), 'unknown owner');
    queue = startMediaQueue(runtime);
    await expect
      .poll(
        async () => {
          try {
            await stat(owned);
            return false;
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true;
            throw error;
          }
        },
        { timeout: 3000, interval: 10 },
      )
      .toBe(true);
    expect(state(accepted.imageId).latestJob).toMatchObject({
      status: 'failed',
      recoveryCount: 2,
      step: 'compressed',
      error: 'compressed: MEDIA_RECOVERY_EXHAUSTED',
    });
    expect(await readFile(join(unknown, 'keep'), 'utf8')).toBe('unknown owner');
    expect(await readFile(objectPath(accepted.storage, accepted.key))).toEqual(
      accepted.bytes,
    );
  });

  it.each([
    { extension: 'jpg', signal: 'SIGKILL' as const },
    { extension: 'png', signal: 'SIGKILL' as const },
    { extension: 'png', signal: 'SIGTERM' as const },
  ])(
    '$extension survives a real worker $signal after compressed publication',
    async ({ extension, signal }) => {
      const accepted = await accept(extension);
      const ownTemporary = join(
        runtime.temporaryRoot,
        `media-${accepted.jobId}`,
      );
      const otherTemporary = join(runtime.temporaryRoot, 'other-upload');
      await mkdir(ownTemporary);
      await mkdir(otherTemporary);
      await writeFile(join(ownTemporary, 'interrupted-cache'), 'owned');
      await writeFile(join(otherTemporary, 'keep'), 'another owner');
      const child = fork(
        resolve('tests/fixtures/media/recovery-worker.ts'),
        [directory],
        {
          execPath: process.execPath,
          execArgv: [],
          stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        },
      );
      let logs = '';
      child.stdout!.on('data', (value) => {
        logs += value;
      });
      child.stderr!.on('data', (value) => {
        logs += value;
      });
      const closed = once(child, 'close');
      try {
        const checkpoint = await Promise.race([
          once(child, 'message'),
          closed.then(() => {
            throw new Error(`Worker exited before checkpoint: ${logs}`);
          }),
          new Promise<never>((_, reject) => {
            const timer = setTimeout(
              () => reject(new Error(`Checkpoint timeout: ${logs}`)),
              10000,
            );
            timer.unref();
            closed.then(() => clearTimeout(timer));
          }),
        ]);
        expect(checkpoint[0]).toEqual({ checkpoint: 'compressed-published' });
        const before = state(accepted.imageId);
        expect(before.latestJob?.status).toBe('running');
        const saved = before.versions
          .filter((version) => version.saved)
          .map((version) => ({
            kind: version.kind,
            objectId: version.saved!.object.id,
          }));
        expect(saved.map((version) => version.kind)).toEqual([
          'original',
          'compressed',
        ]);
        const compressedPath = objectPath(
          accepted.storage,
          before.versions.find((version) => version.kind === 'compressed')!
            .saved!.object.key,
        );
        const compressedBytes = await readFile(compressedPath);
        // Create the owned scratch marker while the real worker is paused. It
        // must survive SIGKILL and be cleaned by recovery, not initial startup.
        await writeFile(join(ownTemporary, 'interrupted-cache'), 'owned');
        child.kill(signal);
        if (signal === 'SIGTERM') child.kill('SIGCONT');
        const [code, exitSignal] = await closed;
        expect(signal === 'SIGKILL' ? exitSignal : code, logs).toBe(
          signal === 'SIGKILL' ? 'SIGKILL' : 143,
        );
        expect(state(accepted.imageId).latestJob?.status).toBe('running');
        if (signal === 'SIGTERM')
          expect(state(accepted.imageId).latestJob?.error).toContain(
            'MEDIA_INTERRUPTED',
          );
        if (signal === 'SIGKILL')
          expect(
            await readFile(join(ownTemporary, 'interrupted-cache'), 'utf8'),
          ).toBe('owned');
        queue = startMediaQueue(runtime);
        await completed(accepted.imageId);
        for (const version of saved) {
          expect(
            state(accepted.imageId).versions.find(
              (item) => item.kind === version.kind,
            )?.saved?.object.id,
          ).toBe(version.objectId);
        }
        expect(await readFile(compressedPath)).toEqual(compressedBytes);
        const published = connection.db
          .select()
          .from(mediaObjects)
          .where(eq(mediaObjects.jobId, accepted.jobId))
          .all()
          .filter((object) => object.status === 'stored');
        expect(published.map((object) => object.purpose).sort()).toEqual([
          'compressed',
          'thumbnail',
        ]);
        expect(
          await readFile(objectPath(accepted.storage, accepted.key)),
        ).toEqual(accepted.bytes);
        expect(await readFile(join(otherTemporary, 'keep'), 'utf8')).toBe(
          'another owner',
        );
        await expect(stat(ownTemporary)).rejects.toMatchObject({
          code: 'ENOENT',
        });
      } finally {
        if (child.exitCode === null && child.signalCode === null)
          child.kill('SIGKILL');
        await closed;
      }
    },
    20000,
  );

  it('cleans unfinished objects for an already stored step without replacing its published versions', async () => {
    const accepted = await accept();
    queue = startMediaQueue(runtime);
    await completed(accepted.imageId);
    await queue.stop();
    queue = undefined;
    const savedIds = state(accepted.imageId).versions.map(
      (version) => version.saved?.object.id,
    );
    const candidate = connection.db.transaction((tx) =>
      planDerivedObject(tx, accepted.jobId, 'compressed'),
    );
    connection.db
      .update(mediaObjects)
      .set({ status: 'writing' })
      .where(eq(mediaObjects.id, candidate.objectId))
      .run();
    connection.db
      .update(mediaObjects)
      .set({ status: 'writing' })
      .where(eq(mediaObjects.id, candidate.temporaryObjectId))
      .run();
    const candidatePath = objectPath(accepted.storage, candidate.key);
    const partialPath = objectPath(accepted.storage, candidate.temporaryKey);
    await mkdir(dirname(candidatePath), { recursive: true });
    await writeFile(candidatePath, 'unpublished duplicate');
    await writeFile(partialPath, 'unfinished partial');
    connection.db
      .update(mediaJobs)
      .set({ status: 'running' })
      .where(eq(mediaJobs.id, accepted.jobId))
      .run();
    queue = startMediaQueue(runtime);
    await completed(accepted.imageId);
    expect(
      state(accepted.imageId).versions.map(
        (version) => version.saved?.object.id,
      ),
    ).toEqual(savedIds);
    for (const id of [candidate.objectId, candidate.temporaryObjectId]) {
      expect(
        connection.db
          .select()
          .from(mediaObjects)
          .where(eq(mediaObjects.id, id))
          .get(),
      ).toMatchObject({ status: 'deleted', byteSize: 0 });
    }
    await expect(stat(candidatePath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(stat(partialPath)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(objectPath(accepted.storage, accepted.key))).toEqual(
      accepted.bytes,
    );
  }, 15000);

  it.each(['complete-final', 'truncated-final', 'partial-only'] as const)(
    'recovery validates %s bytes before claiming a writing object',
    async (mode) => {
      const accepted = await accept();
      expect(claimNextMediaJob(connection.db)?.id).toBe(accepted.jobId);
      const candidate = connection.db.transaction((tx) =>
        planDerivedObject(tx, accepted.jobId, 'compressed'),
      );
      connection.db
        .update(mediaObjects)
        .set({ status: 'writing' })
        .where(eq(mediaObjects.jobId, accepted.jobId))
        .run();
      const output = await execa(
        'magick',
        ['png:-', '-strip', '-quality', '82', 'webp:-'],
        { input: accepted.bytes, encoding: 'buffer' },
      );
      const target = objectPath(
        accepted.storage,
        mode === 'partial-only' ? candidate.temporaryKey : candidate.key,
      );
      await mkdir(dirname(target), { recursive: true });
      await writeFile(
        target,
        mode === 'complete-final'
          ? output.stdout
          : output.stdout.subarray(0, 20),
      );
      queue = startMediaQueue(runtime);
      await completed(accepted.imageId);
      const saved = state(accepted.imageId).versions.find(
        (version) => version.kind === 'compressed',
      )!.saved!;
      if (mode === 'complete-final') {
        expect(saved.object.id).toBe(candidate.objectId);
        expect(await readFile(target)).toEqual(Buffer.from(output.stdout));
      } else {
        expect(saved.object.id).not.toBe(candidate.objectId);
        await expect(stat(target)).rejects.toMatchObject({ code: 'ENOENT' });
      }
      const bytes = await readFile(
        objectPath(accepted.storage, saved.object.key),
      );
      await expect(
        execa('magick', ['webp:-', 'null:'], { input: bytes }),
      ).resolves.toMatchObject({ exitCode: 0 });
      expect(
        await readFile(objectPath(accepted.storage, accepted.key)),
      ).toEqual(accepted.bytes);
    },
    15000,
  );

  it.each([1, 2, 3, 4])(
    'runs actual tools with concurrency %i, and lowering to one preserves active work',
    async (concurrency) => {
      connection.db.transaction((tx) =>
        updateMediaSettings(tx, { ...initialMediaSettings, concurrency }),
      );
      const accepted = [];
      for (let index = 0; index < concurrency + 2; index += 1)
        accepted.push(await accept(index % 2 ? 'jpg' : 'png'));
      connection.db.$client.exec(`
      CREATE TABLE claim_observations (active INTEGER NOT NULL, allowed INTEGER NOT NULL);
      CREATE TRIGGER observe_claim AFTER UPDATE OF status ON media_jobs
      WHEN NEW.status = 'running' AND OLD.status <> 'running'
      BEGIN INSERT INTO claim_observations SELECT (SELECT count(*) FROM media_jobs WHERE status = 'running'), (SELECT concurrency FROM media_settings); END;
    `);
      queue = startMediaQueue(runtime);
      expect(
        connection.db
          .select()
          .from(mediaJobs)
          .where(eq(mediaJobs.status, 'running'))
          .all(),
      ).toHaveLength(concurrency);
      connection.db.transaction((tx) =>
        updateMediaSettings(tx, { ...initialMediaSettings, concurrency: 1 }),
      );
      expect(
        connection.db
          .select()
          .from(mediaJobs)
          .where(eq(mediaJobs.status, 'running'))
          .all(),
      ).toHaveLength(concurrency);
      await Promise.all(accepted.map((image) => completed(image.imageId)));
      const observations = connection.db.$client
        .prepare('SELECT active, allowed FROM claim_observations')
        .all() as { active: number; allowed: number }[];
      expect(observations).toHaveLength(concurrency + 2);
      expect(Math.max(...observations.map((row) => row.active))).toBe(
        concurrency,
      );
      for (const row of observations)
        expect(row.active).toBeLessThanOrEqual(row.allowed);
      for (const image of accepted)
        expect(state(image.imageId).latestJob).toMatchObject({
          status: 'succeeded',
          retryCount: 0,
          error: null,
        });
    },
    20000,
  );
});
