import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { acceptOriginal } from '../../../src/server/media/images.ts';
import {
  claimNextMediaJob,
  startMediaQueue,
} from '../../../src/server/media/queue.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaVersions,
  mediaMetadata,
} from '../../../src/server/media/schema.ts';
import {
  createProcessingSnapshot,
  prepareInitialMedia,
} from '../../../src/server/media/settings.ts';
import {
  requestMetadataRead,
  readMediaMetadata,
} from '../../../src/server/media/metadata.ts';
import {
  recoverMediaJobs,
  settleMediaFailure,
} from '../../../src/server/media/recovery.ts';
import * as processing from '../../../src/server/media/process.ts';
import * as metadataProcessing from '../../../src/server/media/metadata-job.ts';
import { requestPermanentDelete } from '../../../src/server/media/cleanup.ts';
import { createSecretCrypto } from '../../../src/server/runtime/crypto.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import {
  prepareInitialStorage,
  resolveLocalUploadStorage,
} from '../../../src/server/storage/defaults.ts';

let directory: string;
let connection: ReturnType<typeof openRuntimeDatabase>;
let queue: ReturnType<typeof startMediaQueue> | undefined;
const logger = { info: vi.fn(), error: vi.fn() };

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'ariso-media-queue-'));
  mkdirSync(join(directory, 'storage'));
  mkdirSync(join(directory, 'tmp'));
  connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  migrateRuntimeDatabase(connection.db, resolve('drizzle'));
  prepareInitialStorage(connection.db, { storage: join(directory, 'storage') });
  connection.db.transaction((tx) => prepareInitialMedia(tx));
  logger.info.mockClear();
  logger.error.mockClear();
});

afterEach(async () => {
  await queue?.stop();
  queue = undefined;
  vi.restoreAllMocks();
  connection.close();
  rmSync(directory, { recursive: true, force: true });
});

function enqueue(storageId = resolveLocalUploadStorage(connection.db).id) {
  return connection.db.transaction((tx) =>
    acceptOriginal(tx, {
      imageId: randomUUID(),
      storageId,
      key: `missing/${randomUUID()}`,
      originalName: 'missing.png',
      visibility: 'private',
      format: 'PNG',
      mime: 'image/png',
      byteSize: 1,
      snapshot: createProcessingSnapshot(tx),
      expectedVersions: ['compressed', 'thumbnail'],
    }),
  );
}

function start() {
  queue = startMediaQueue({
    db: connection.db,
    storageRoot: join(directory, 'storage'),
    temporaryRoot: join(directory, 'tmp'),
    logger,
  });
  return queue;
}

const job = (id: string) =>
  connection.db.select().from(mediaJobs).where(eq(mediaJobs.id, id)).get()!;

describe('persistent media queue', () => {
  it('preserves interrupted input and only removes inputs of known terminal media jobs', async () => {
    const active = enqueue();
    const settled = enqueue();
    connection.db
      .update(mediaJobs)
      .set({ status: 'running' })
      .where(eq(mediaJobs.id, active.jobId))
      .run();
    connection.db
      .update(mediaJobs)
      .set({ status: 'failed' })
      .where(eq(mediaJobs.id, settled.jobId))
      .run();
    const unknownId = randomUUID();
    for (const id of [active.jobId, settled.jobId, unknownId]) {
      const input = join(directory, 'tmp', `media-input-${id}`);
      mkdirSync(input);
      writeFileSync(join(input, 'original'), 'owned input');
    }
    vi.spyOn(processing, 'processMediaJob').mockImplementation(
      async (runtime, jobId) => {
        expect(jobId).toBe(active.jobId);
        expect(
          existsSync(
            join(runtime.temporaryRoot, `media-input-${jobId}`, 'original'),
          ),
        ).toBe(true);
      },
    );
    start();
    await vi.waitFor(() =>
      expect(processing.processMediaJob).toHaveBeenCalledOnce(),
    );
    expect(job(active.jobId).recoveryCount).toBe(1);
    expect(
      existsSync(join(directory, 'tmp', `media-input-${settled.jobId}`)),
    ).toBe(false);
    expect(
      existsSync(
        join(directory, 'tmp', `media-input-${unknownId}`, 'original'),
      ),
    ).toBe(true);
  });

  it('claims only queued work and persists its timestamp, snapshot and processing state', () => {
    const accepted = enqueue();
    const before = job(accepted.jobId);
    const claimed = claimNextMediaJob(connection.db)!;
    expect(claimed).toMatchObject({
      id: accepted.jobId,
      status: 'running',
      snapshot: before.snapshot,
      expectedVersions: before.expectedVersions,
      finishedAt: null,
    });
    expect(claimed.startedAt).toBeInstanceOf(Date);
    expect(job(accepted.jobId)).toEqual(claimed);
    expect(
      connection.db.select().from(mediaImages).get()!.processingStatus,
    ).toBe('processing');
    expect(claimNextMediaJob(connection.db)).toBeNull();
  });

  it('keeps a ready image available and never interleaves jobs for the same image', () => {
    const first = enqueue();
    const queued = job(first.jobId);
    const secondId = randomUUID();
    connection.db
      .insert(mediaJobs)
      .values({ ...queued, id: secondId })
      .run();
    connection.db.update(mediaImages).set({ processingStatus: 'ready' }).run();
    expect(claimNextMediaJob(connection.db)!.id).toBe(first.jobId);
    expect(
      connection.db.select().from(mediaImages).get()!.processingStatus,
    ).toBe('ready');
    expect(claimNextMediaJob(connection.db)).toBeNull();
    connection.db
      .update(mediaJobs)
      .set({ status: 'succeeded', finishedAt: new Date() })
      .where(eq(mediaJobs.id, first.jobId))
      .run();
    expect(claimNextMediaJob(connection.db)!.id).toBe(secondId);
  });

  it('two connections cannot claim the same task and queued work survives reopening', () => {
    const first = enqueue();
    const second = enqueue();
    connection.close();
    connection = openRuntimeDatabase(join(directory, 'ariso.db'));
    const observer = openRuntimeDatabase(join(directory, 'ariso.db'));
    try {
      expect(claimNextMediaJob(observer.db)!.id).toBe(first.jobId);
      expect(claimNextMediaJob(connection.db)!.id).toBe(second.jobId);
      expect(claimNextMediaJob(observer.db)).toBeNull();
      expect(claimNextMediaJob(connection.db)).toBeNull();
      expect(job(first.jobId).status).toBe('running');
    } finally {
      observer.close();
    }
  });

  it('rolls back the claim if updating image processing state fails', () => {
    const accepted = enqueue();
    connection.db.$client.exec(
      "CREATE TRIGGER interrupt BEFORE UPDATE ON media_images BEGIN SELECT RAISE(ABORT, 'image state failed'); END",
    );
    expect(() => claimNextMediaJob(connection.db)).toThrow(
      'image state failed',
    );
    expect(job(accepted.jobId)).toMatchObject({
      status: 'queued',
      startedAt: null,
    });
  });

  it('polls new persistent work and continues after an original object is missing', async () => {
    start();
    const first = enqueue();
    const second = enqueue();
    await vi.waitFor(() => {
      expect(job(first.jobId).status).toBe('failed');
      expect(job(second.jobId).status).toBe('failed');
    });
    expect(job(first.jobId).error).toContain('STORAGE_OBJECT_MISSING');
    expect(job(first.jobId).finishedAt).toBeInstanceOf(Date);
    expect(job(second.jobId).startedAt).toBeInstanceOf(Date);
    expect(connection.db.select().from(mediaVersions).all()).toHaveLength(2);
    expect(connection.db.select().from(mediaObjects).all()).toHaveLength(2);
  });

  it('stop is repeatable, wakes idle polling and prevents further claims', async () => {
    const active = start();
    await active.stop();
    await active.stop();
    const accepted = enqueue();
    await setTimeout(300);
    expect(job(accepted.jobId).status).toBe('queued');
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('stop waits for the current task to persist its outcome without claiming the next task', async () => {
    const actual = processing.processMediaJob;
    const processor = vi
      .spyOn(processing, 'processMediaJob')
      .mockImplementation(async (runtime, id, signal) => {
        // Hold the real processor at entry so shutdown, rather than a missing-source failure, ends this job.
        await new Promise<void>((resolve) =>
          signal!.addEventListener('abort', () => resolve(), { once: true }),
        );
        await actual(runtime, id, signal);
      });
    const first = enqueue();
    const second = enqueue();
    const active = start();
    await vi.waitFor(() => expect(processor).toHaveBeenCalledOnce());
    expect(job(first.jobId).status).toBe('running');
    await active.stop();
    expect(job(first.jobId).status).toBe('running');
    expect(job(first.jobId).finishedAt).toBeNull();
    expect(job(first.jobId).error).toContain('MEDIA_INTERRUPTED');
    expect(job(first.jobId).retryCount).toBe(0);
    expect(job(second.jobId).status).toBe('queued');
  });

  it('stops after the database closes without repeatedly accessing a closed connection', async () => {
    start();
    connection.close();
    await setTimeout(300);
    await queue!.stop();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('reports a database scheduling failure rather than swallowing it or retrying forever', async () => {
    enqueue();
    connection.db.$client.exec(
      "CREATE TRIGGER interrupt BEFORE UPDATE ON media_jobs BEGIN SELECT RAISE(ABORT, 'queue database failed'); END",
    );
    start();
    await vi.waitFor(() => expect(logger.error).toHaveBeenCalledOnce());
    await expect(queue!.stop()).rejects.toThrow('queue database failed');
    queue = undefined;
    expect(logger.error).toHaveBeenCalledOnce();
    expect(logger.error.mock.calls[0][0].err.message).toContain(
      'queue database failed',
    );
    expect(connection.db.select().from(mediaJobs).get()!.status).toBe('queued');
  });
});

async function remoteCleanup() {
  let entered = false;
  let deletes = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const server = createServer(async (request, response) => {
    if (request.method === 'DELETE') {
      entered = true;
      deletes++;
      await gate;
      response.writeHead(204).end();
    } else response.writeHead(200, { 'content-length': '4' }).end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const secretCrypto = createSecretCrypto(Buffer.alloc(32, 1));
  const storageId = randomUUID();
  const now = new Date();
  connection.db
    .insert(storageConfigs)
    .values({
      id: storageId,
      name: 'held cleanup fixture',
      type: 's3',
      enabled: true,
      endpoint: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
      region: 'test',
      bucket: 'test',
      pathPrefix: '',
      forcePathStyle: true,
      accessKeyEncrypted: secretCrypto.encryptSecret('test'),
      secretKeyEncrypted: secretCrypto.encryptSecret('test'),
      createdAt: now,
      updatedAt: now,
    })
    .run();
  const settled = enqueue(storageId);
  connection.db
    .update(mediaJobs)
    .set({ status: 'succeeded' })
    .where(eq(mediaJobs.id, settled.jobId))
    .run();
  const objectId = randomUUID();
  connection.db
    .insert(mediaObjects)
    .values({
      id: objectId,
      imageId: settled.imageId,
      jobId: settled.jobId,
      storageId,
      key: 'candidate/held',
      purpose: 'temporary',
      status: 'cleanup_pending',
      byteSize: 4,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return {
    objectId,
    start() {
      queue = startMediaQueue({
        db: connection.db,
        storageRoot: join(directory, 'storage'),
        temporaryRoot: join(directory, 'tmp'),
        secretCrypto,
        logger,
      });
      return queue;
    },
    async entered() {
      await vi.waitFor(() => expect(entered).toBe(true));
    },
    get deletes() {
      return deletes;
    },
    release,
    async close() {
      release();
      try {
        await queue?.stop();
      } finally {
        queue = undefined;
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
    },
  };
}

describe('remote maintenance scheduling', () => {
  it('claims unrelated Local work and interrupts deletion while remote DELETE is still pending', async () => {
    const cleanup = await remoteCleanup();
    let activeSignal: AbortSignal | undefined;
    vi.spyOn(processing, 'processMediaJob').mockImplementation(
      async (runtime, id, signal) => {
        activeSignal = signal;
        await new Promise<void>((resolve) =>
          signal!.addEventListener(
            'abort',
            () => {
              settleMediaFailure(runtime.db, id, 'identify', signal!.reason);
              resolve();
            },
            { once: true },
          ),
        );
      },
    );
    try {
      cleanup.start();
      await cleanup.entered();
      const next = enqueue();
      await vi.waitFor(() => expect(job(next.jobId).status).toBe('running'));
      expect(job(next.jobId).startedAt).toBeInstanceOf(Date);
      connection.db
        .update(mediaImages)
        .set({ trashedAt: new Date() })
        .where(eq(mediaImages.id, next.imageId))
        .run();
      requestPermanentDelete(connection.db, next.imageId);
      await vi.waitFor(() => expect(job(next.jobId).status).toBe('cancelled'));
      expect(activeSignal?.reason.code).toBe('MEDIA_IMAGE_DELETING');
      // Keep the same remote operation pending beyond another maintenance interval.
      await setTimeout(1100);
      expect(cleanup.deletes).toBe(1);
      expect(
        connection.db
          .select()
          .from(mediaObjects)
          .where(eq(mediaObjects.id, cleanup.objectId))
          .get()!.status,
      ).toBe('cleanup_pending');
    } finally {
      await cleanup.close();
    }
  });

  it('aborts and settles in-flight remote maintenance before stop resolves', async () => {
    const cleanup = await remoteCleanup();
    try {
      const active = cleanup.start();
      await cleanup.entered();
      await active.stop();
      expect(
        connection.db
          .select()
          .from(mediaObjects)
          .where(eq(mediaObjects.id, cleanup.objectId))
          .get(),
      ).toMatchObject({
        status: 'cleanup_pending',
        error: null,
      });
      const next = enqueue();
      await setTimeout(100);
      expect(job(next.jobId).status).toBe('queued');
      await active.stop();
    } finally {
      await cleanup.close();
    }
  });

  it('stops claiming and reports remote cleanup database settlement failure', async () => {
    const cleanup = await remoteCleanup();
    connection.db.$client.exec(
      `CREATE TRIGGER interrupt_cleanup BEFORE UPDATE ON media_objects WHEN NEW.id = '${cleanup.objectId}' BEGIN SELECT RAISE(ABORT, 'candidate settlement failed'); END`,
    );
    try {
      const active = cleanup.start();
      await cleanup.entered();
      cleanup.release();
      await vi.waitFor(() => expect(logger.error).toHaveBeenCalled());
      const next = enqueue();
      await setTimeout(100);
      expect(job(next.jobId).status).toBe('queued');
      await expect(active.stop()).rejects.toThrow(
        'candidate settlement failed',
      );
      queue = undefined;
      expect(
        connection.db
          .select()
          .from(mediaObjects)
          .where(eq(mediaObjects.id, cleanup.objectId))
          .get()!.status,
      ).toBe('cleanup_pending');
    } finally {
      await cleanup.close();
    }
  });
});

describe('metadata scheduling and recovery', () => {
  function finishedImage() {
    const accepted = enqueue();
    connection.db
      .update(mediaJobs)
      .set({ status: 'failed' })
      .where(eq(mediaJobs.id, accepted.jobId))
      .run();
    connection.db
      .update(mediaImages)
      .set({ processingStatus: 'failed' })
      .where(eq(mediaImages.id, accepted.imageId))
      .run();
    return accepted;
  }

  it('shares the configured concurrency slots with processing work', async () => {
    const image = finishedImage();
    const metadata = requestMetadataRead(connection.db, image.imageId);
    const process = enqueue();
    const releases: (() => void)[] = [];
    const block = async (_runtime: unknown, id: string) => {
      await new Promise<void>((resolve) => releases.push(resolve));
      connection.db
        .update(mediaJobs)
        .set({ status: 'succeeded' })
        .where(eq(mediaJobs.id, id))
        .run();
    };
    const metadataSpy = vi
      .spyOn(metadataProcessing, 'processMetadataJob')
      .mockImplementation(block);
    const processSpy = vi
      .spyOn(processing, 'processMediaJob')
      .mockImplementation(block);
    start();
    try {
      await vi.waitFor(() => expect(metadataSpy).toHaveBeenCalledOnce());
      await setTimeout(100);
      expect(processSpy).not.toHaveBeenCalled();
      expect(job(metadata.jobId).status).toBe('running');
      expect(job(process.jobId).status).toBe('queued');
      releases.shift()!();
      await vi.waitFor(() => expect(processSpy).toHaveBeenCalledOnce());
    } finally {
      for (const release of releases) release();
    }
  });

  it('keeps failed image state and successful metadata through retries and exhausted restart recovery', () => {
    const image = finishedImage();
    const { jobId } = requestMetadataRead(connection.db, image.imageId);
    const readAt = new Date(12345);
    const data = { 'IFD0:Main:Artist': '1.10' };
    connection.db.update(mediaMetadata).set({ data, readAt }).run();
    const before = connection.db.select().from(mediaImages).get();
    expect(claimNextMediaJob(connection.db)!.id).toBe(jobId);
    settleMediaFailure(
      connection.db,
      jobId,
      'metadata',
      Object.assign(new Error('temporary read error'), { code: 'EIO' }),
    );
    expect(job(jobId)).toMatchObject({ status: 'queued', retryCount: 1 });
    expect(readMediaMetadata(connection.db, image.imageId)).toMatchObject({
      status: 'queued',
      historical: true,
      data,
      readAt,
    });
    connection.db
      .update(mediaJobs)
      .set({ nextAttemptAt: null })
      .where(eq(mediaJobs.id, jobId))
      .run();
    for (let attempt = 0; attempt < 3; attempt++) {
      expect(claimNextMediaJob(connection.db)!.id).toBe(jobId);
      expect(recoverMediaJobs(connection.db)).toEqual([jobId]);
    }
    expect(job(jobId)).toMatchObject({ status: 'failed', recoveryCount: 2 });
    expect(readMediaMetadata(connection.db, image.imageId)).toMatchObject({
      status: 'failed',
      historical: true,
      data,
      readAt,
      error: expect.stringContaining('MEDIA_RECOVERY_EXHAUSTED'),
    });
    expect(connection.db.select().from(mediaImages).get()).toEqual(before);
    expect(connection.db.select().from(mediaObjects).all()).toHaveLength(1);
  });
});
