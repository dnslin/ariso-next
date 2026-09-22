import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
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
} from '../../../src/server/media/schema.ts';
import {
  createProcessingSnapshot,
  prepareInitialMedia,
} from '../../../src/server/media/settings.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import {
  prepareInitialStorage,
  resolveUploadStorage,
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
  connection.close();
  rmSync(directory, { recursive: true, force: true });
});

function enqueue() {
  return connection.db.transaction((tx) =>
    acceptOriginal(tx, {
      imageId: randomUUID(),
      storageId: resolveUploadStorage(connection.db).id,
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
    const first = enqueue();
    const second = enqueue();
    const active = start();
    expect(job(first.jobId).status).toBe('running');
    await active.stop();
    expect(job(first.jobId).status).toBe('failed');
    expect(job(first.jobId).finishedAt).toBeInstanceOf(Date);
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
    await queue!.stop();
    expect(logger.error).toHaveBeenCalledOnce();
    expect(logger.error.mock.calls[0][0].err.message).toContain(
      'queue database failed',
    );
    expect(connection.db.select().from(mediaJobs).get()!.status).toBe('queued');
  });
});
