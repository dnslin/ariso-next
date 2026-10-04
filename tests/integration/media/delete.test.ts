import { cleanupMediaObject } from '../../../src/server/media/cleanup-object.ts';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  requestPermanentDelete,
  retryMediaCleanup,
  readMediaCleanup,
  cleanupPermanentDeletes,
} from '../../../src/server/media/cleanup.ts';
import { acceptOriginal } from '../../../src/server/media/images.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaVersions,
  mediaMetadata,
  mediaCleanupJobs,
} from '../../../src/server/media/schema.ts';
import {
  createProcessingSnapshot,
  prepareInitialMedia,
} from '../../../src/server/media/settings.ts';
import { restoreImage, trashImage } from '../../../src/server/media/trash.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import {
  prepareInitialStorage,
  resolveLocalUploadStorage,
} from '../../../src/server/storage/defaults.ts';
import * as local from '../../../src/server/storage/local.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import {
  albums,
  albumImages,
  tags,
  imageTags,
} from '../../../src/server/collections/schema.ts';
import { analyticsImageTotals } from '../../../src/server/analytics/schema.ts';
import {
  cleanupMediaCandidates,
  recoverMediaCandidateCleanup,
} from '../../../src/server/media/candidate-cleanup.ts';
import { recoverMediaJobs } from '../../../src/server/media/recovery.ts';
import { startMediaQueue } from '../../../src/server/media/queue.ts';
import * as processing from '../../../src/server/media/process.ts';

let directory: string;
let connection: ReturnType<typeof openRuntimeDatabase>;
let queue: ReturnType<typeof startMediaQueue> | undefined;
const logger = { info: vi.fn(), error: vi.fn() };
const runtime = () => ({
  db: connection.db,
  storageRoot: join(directory, 'storage'),
  temporaryRoot: join(directory, 'tmp'),
  logger,
});
const cleanup = () => cleanupPermanentDeletes(runtime(), new Set());

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ariso-delete-'));
  await mkdir(join(directory, 'storage'));
  await mkdir(join(directory, 'tmp'));
  connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  migrateRuntimeDatabase(connection.db, resolve('drizzle'));
  prepareInitialStorage(connection.db, { storage: join(directory, 'storage') });
  connection.db.transaction(prepareInitialMedia);
});
afterEach(async () => {
  await queue?.stop();
  queue = undefined;
  vi.restoreAllMocks();
  connection.close();
  await rm(directory, { recursive: true, force: true });
});

async function asset() {
  const storage = resolveLocalUploadStorage(connection.db);
  const plan = local.planLocalWrite('uploads');
  await local.writeObject(
    runtime().storageRoot,
    storage,
    plan,
    Readable.from('original bytes'),
  );
  const accepted = connection.db.transaction((tx) =>
    acceptOriginal(tx, {
      imageId: randomUUID(),
      storageId: storage.id,
      key: plan.key,
      originalName: 'delete.png',
      visibility: 'public',
      format: 'PNG',
      mime: 'image/png',
      byteSize: 14,
      snapshot: createProcessingSnapshot(tx),
      expectedVersions: [],
    }),
  );
  connection.db
    .update(mediaJobs)
    .set({ status: 'succeeded' })
    .where(eq(mediaJobs.id, accepted.jobId))
    .run();
  return { ...accepted, storage, key: plan.key };
}
async function extra(
  image: Awaited<ReturnType<typeof asset>>,
  status: (typeof mediaObjects.$inferSelect)['status'],
  content = 'extra',
) {
  const plan = local.planLocalWrite('images');
  await local.writeObject(
    runtime().storageRoot,
    image.storage,
    plan,
    Readable.from(content),
  );
  const objectId = randomUUID();
  connection.db
    .insert(mediaObjects)
    .values({
      id: objectId,
      imageId: image.imageId,
      jobId: image.jobId,
      storageId: image.storage.id,
      key: plan.key,
      purpose: 'temporary',
      status,
      byteSize: status === 'writing' ? null : content.length,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();
  return { objectId, key: plan.key };
}

it('accepts only trashed local images and keeps duplicate requests and the deleted result idempotent', async () => {
  const image = await asset();
  expect(() => requestPermanentDelete(connection.db, image.imageId)).toThrow(
    '只能永久删除回收站',
  );
  trashImage(connection.db, image.imageId);
  const accepted = requestPermanentDelete(connection.db, image.imageId);
  expect(accepted.status).toBe('queued');
  expect(accepted).toMatchObject({ waitingForWrites: false });
  expect(requestPermanentDelete(connection.db, image.imageId)).toEqual(
    accepted,
  );
  expect(() => restoreImage(connection.db, image.imageId)).toThrow(
    '已开始永久删除',
  );
  expect(connection.db.select().from(mediaImages).get()!.processingStatus).toBe(
    'pending',
  );
  await cleanup();
  expect(readMediaCleanup(connection.db, image.imageId)).toMatchObject({
    jobId: accepted.jobId,
    status: 'succeeded',
    remaining: [],
    waitingForWrites: false,
  });
  expect(retryMediaCleanup(connection.db, image.imageId)).toEqual(
    readMediaCleanup(connection.db, image.imageId),
  );
  expect(requestPermanentDelete(connection.db, image.imageId)).toEqual(
    readMediaCleanup(connection.db, image.imageId),
  );
  expect(() => requestPermanentDelete(connection.db, 'missing')).toThrow(
    '图片不存在',
  );
});

it('clears original, current, candidate, old and unknown objects on disabled storage, cascading relationships and retaining history', async () => {
  const image = await asset();
  const keys = [image.key];
  for (const state of [
    'stored',
    'writing',
    'cleanup_pending',
    'cleanup_failed',
    'planned',
  ] as const)
    keys.push((await extra(image, state)).key);
  const now = new Date();
  const db = connection.db;
  db.insert(albums)
    .values({
      id: 'album',
      name: 'album',
      description: '',
      preferredCoverImageId: image.imageId,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  db.insert(albumImages)
    .values({ albumId: 'album', imageId: image.imageId, joinedAt: now })
    .run();
  db.insert(tags)
    .values({
      id: 'tag',
      displayName: 'tag',
      normalizedKey: 'tag',
      createdAt: now,
      updatedAt: now,
    })
    .run();
  db.insert(imageTags).values({ imageId: image.imageId, tagId: 'tag' }).run();
  db.insert(analyticsImageTotals)
    .values({
      imageId: image.imageId,
      originalCount: 3,
      compressedCount: 2,
      watermarkCount: 1,
    })
    .run();
  const history = db.select().from(analyticsImageTotals).all();
  trashImage(db, image.imageId);
  requestPermanentDelete(db, image.imageId);
  db.update(storageConfigs).set({ enabled: false }).run();
  await cleanup();
  for (const key of keys)
    expect(
      await local.inspectObject(runtime().storageRoot, image.storage, key),
    ).toBeNull();
  for (const table of [
    mediaImages,
    mediaVersions,
    mediaObjects,
    mediaJobs,
    mediaMetadata,
    albumImages,
    imageTags,
  ])
    expect(db.select().from(table).all()).toEqual([]);
  expect(db.select().from(albums).get()!.preferredCoverImageId).toBeNull();
  expect(db.select().from(tags).all()).toHaveLength(1);
  expect(db.select().from(analyticsImageTotals).all()).toEqual(history);
  expect(db.select().from(mediaCleanupJobs).get()!.status).toBe('succeeded');
});

it('persists partial success, retries temporary failure once across restart and opens only a manual finite cycle', async () => {
  const image = await asset();
  const failed = await extra(image, 'writing');
  trashImage(connection.db, image.imageId);
  requestPermanentDelete(connection.db, image.imageId);
  const actual = local.deleteObject;
  const spy = vi
    .spyOn(local, 'deleteObject')
    .mockImplementation(async (...args) => {
      if (args[2] === failed.key)
        throw Object.assign(new Error('busy object'), { code: 'EBUSY' });
      return actual(...args);
    });
  await cleanup();
  expect(readMediaCleanup(connection.db, image.imageId)).toMatchObject({
    status: 'running',
    remaining: [
      { key: failed.key, attempts: 1, status: 'cleanup_pending', byteSize: 5 },
    ],
  });
  expect(
    await local.inspectObject(runtime().storageRoot, image.storage, image.key),
  ).toBeNull();
  connection.close();
  connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  recoverMediaCandidateCleanup(connection.db);
  await cleanup();
  expect(spy.mock.calls.filter((args) => args[2] === failed.key)).toHaveLength(
    1,
  );
  connection.db
    .update(mediaObjects)
    .set({ nextCleanupAt: new Date(0) })
    .run();
  await cleanup();
  expect(readMediaCleanup(connection.db, image.imageId)).toMatchObject({
    status: 'failed',
    remaining: [{ key: failed.key, attempts: 2 }],
  });
  connection.close();
  connection = openRuntimeDatabase(join(directory, 'ariso.db'));
  recoverMediaCandidateCleanup(connection.db);
  await cleanupMediaCandidates(runtime());
  await cleanup();
  expect(spy.mock.calls.filter((args) => args[2] === failed.key)).toHaveLength(
    2,
  );
  expect(() => restoreImage(connection.db, image.imageId)).toThrow(
    '已开始永久删除',
  );
  spy.mockRestore();
  const retry = retryMediaCleanup(connection.db, image.imageId);
  expect(retry).toMatchObject({
    cycle: 2,
    status: 'queued',
    remaining: [{ attempts: 0 }],
  });
  expect(retryMediaCleanup(connection.db, image.imageId)).toEqual(retry);
  await cleanup();
  expect(readMediaCleanup(connection.db, image.imageId)).toMatchObject({
    status: 'succeeded',
    remaining: [],
  });
});

it('does not retry permission errors or hide failed settlement, and reconciles a crash after successful deletion', async () => {
  const image = await asset();
  trashImage(connection.db, image.imageId);
  requestPermanentDelete(connection.db, image.imageId);
  const spy = vi
    .spyOn(local, 'deleteObject')
    .mockRejectedValue(
      Object.assign(new Error('permission denied'), { code: 'EACCES' }),
    );
  await cleanup();
  expect(readMediaCleanup(connection.db, image.imageId)).toMatchObject({
    status: 'failed',
    remaining: [
      { attempts: 1, error: expect.stringContaining('permission denied') },
    ],
  });
  await cleanup();
  expect(spy).toHaveBeenCalledTimes(1);
  spy.mockRestore();
  retryMediaCleanup(connection.db, image.imageId);
  connection.db.$client.exec(
    "CREATE TRIGGER reject_deleted BEFORE UPDATE OF status ON media_objects WHEN NEW.status = 'deleted' BEGIN SELECT RAISE(ABORT, 'settlement failure'); END",
  );
  await expect(cleanup()).rejects.toThrow('settlement failure');
  expect(
    await local.inspectObject(runtime().storageRoot, image.storage, image.key),
  ).toBeNull();
  connection.db.$client.exec('DROP TRIGGER reject_deleted');
  connection.db.update(mediaObjects).set({ cleanupAttempts: 2 }).run();
  const noRepeat = vi.spyOn(local, 'deleteObject');
  await cleanup();
  expect(noRepeat).not.toHaveBeenCalled();
  expect(readMediaCleanup(connection.db, image.imageId).status).toBe(
    'succeeded',
  );
});

it('cancels a running writer and waits for its promise before clearing a late object', async () => {
  const image = await asset();
  connection.db
    .update(mediaJobs)
    .set({ status: 'queued' })
    .where(eq(mediaJobs.id, image.jobId))
    .run();
  let release!: () => void;
  const paused = new Promise<void>((resolve) => {
    release = resolve;
  });
  let receivedSignal: AbortSignal | undefined;
  vi.spyOn(processing, 'processMediaJob').mockImplementation(
    async (_runtime, id, signal) => {
      receivedSignal = signal;
      await paused;
      await extra(image, 'writing', 'late writer');
      connection.db
        .update(mediaJobs)
        .set({ status: 'cancelled' })
        .where(eq(mediaJobs.id, id))
        .run();
    },
  );
  queue = startMediaQueue(runtime());
  await vi.waitFor(() => expect(receivedSignal).toBeDefined());
  trashImage(connection.db, image.imageId);
  requestPermanentDelete(connection.db, image.imageId);
  try {
    expect(readMediaCleanup(connection.db, image.imageId)).toMatchObject({
      status: 'queued',
      waitingForWrites: true,
    });
    await vi.waitFor(() => expect(receivedSignal!.aborted).toBe(true));
    await cleanupPermanentDeletes(runtime(), new Set([image.imageId]));
    expect(
      await local.inspectObject(
        runtime().storageRoot,
        image.storage,
        image.key,
      ),
    ).toEqual({ size: 14 });
  } finally {
    release();
  }
  await vi.waitFor(
    () =>
      expect(readMediaCleanup(connection.db, image.imageId).status).toBe(
        'succeeded',
      ),
    { timeout: 5000 },
  );
  expect(readMediaCleanup(connection.db, image.imageId)).toMatchObject({
    status: 'succeeded',
    waitingForWrites: false,
  });
});

it('recovery cancels deleting content jobs without resetting processing state or republishing objects', async () => {
  const image = await asset();
  connection.db.update(mediaJobs).set({ status: 'running' }).run();
  trashImage(connection.db, image.imageId);
  requestPermanentDelete(connection.db, image.imageId);
  recoverMediaJobs(connection.db);
  expect(connection.db.select().from(mediaJobs).get()!.status).toBe(
    'cancelled',
  );
  expect(connection.db.select().from(mediaImages).get()!.processingStatus).toBe(
    'pending',
  );
  await cleanup();
  expect(readMediaCleanup(connection.db, image.imageId).status).toBe(
    'succeeded',
  );
});

for (const checkpoint of ['intent', 'deleted'] as const) {
  it(`resumes a real SIGKILL after durable ${checkpoint} without resetting the budget`, async () => {
    const image = await asset();
    const second = await extra(image, 'writing');
    trashImage(connection.db, image.imageId);
    requestPermanentDelete(connection.db, image.imageId);
    const child = fork(
      resolve('tests/fixtures/media/delete-worker.ts'),
      [directory, checkpoint],
      {
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        execArgv: [],
      },
    );
    let errors = '';
    child.stderr!.on('data', (chunk) => {
      errors += String(chunk);
    });
    const closed = once(child, 'exit');
    try {
      const message = await Promise.race([
        once(child, 'message'),
        closed.then(() => {
          throw new Error(`Worker exited before checkpoint: ${errors}`);
        }),
      ]);
      expect(message[0]).toEqual({ checkpoint });
      child.kill('SIGKILL');
      expect(await closed).toEqual([null, 'SIGKILL']);
      const before = readMediaCleanup(connection.db, image.imageId);
      expect(before.status).toBe('running');
      if (checkpoint === 'intent')
        expect(before.remaining.some((object) => object.attempts === 1)).toBe(
          true,
        );
      else expect(before.remaining).toHaveLength(1);
      connection.close();
      connection = openRuntimeDatabase(join(directory, 'ariso.db'));
      await cleanup();
      expect(readMediaCleanup(connection.db, image.imageId)).toMatchObject({
        status: 'succeeded',
        remaining: [],
      });
      for (const key of [image.key, second.key])
        expect(
          await local.inspectObject(runtime().storageRoot, image.storage, key),
        ).toBeNull();
    } finally {
      if (child.exitCode === null && child.signalCode === null)
        child.kill('SIGKILL');
      await closed;
    }
  }, 15000);
}

it('persists a temporary error and its next automatic attempt in one settlement', async () => {
  const image = await asset();
  trashImage(connection.db, image.imageId);
  requestPermanentDelete(connection.db, image.imageId);
  const object = connection.db
    .select()
    .from(mediaObjects)
    .where(eq(mediaObjects.id, image.objectId))
    .get()!;
  vi.spyOn(local, 'deleteObject').mockRejectedValue(
    Object.assign(new Error('I/O interrupted'), { code: 'EIO' }),
  );
  const retryAt = new Date(Date.now() + 5000);
  await cleanupMediaObject(runtime(), image.storage, object, { retryAt });
  expect(
    connection.db
      .select()
      .from(mediaObjects)
      .where(eq(mediaObjects.id, object.id))
      .get(),
  ).toMatchObject({
    status: 'cleanup_pending',
    nextCleanupAt: retryAt,
    error: expect.stringContaining('I/O interrupted'),
  });
});

it.each([
  { code: 'EBUSY', repeat: false, expected: 'succeeded', attempts: 2 },
  { code: 'EBUSY', repeat: true, expected: 'failed', attempts: 2 },
  { code: 'EACCES', repeat: false, expected: 'failed', attempts: 1 },
])(
  'merges in-flight candidate $code into deletion with repeat=$repeat',
  async ({ code, repeat, expected, attempts }) => {
    const image = await asset();
    const candidate = await extra(image, 'cleanup_pending');
    const actual = local.deleteObject;
    let started!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const paused = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    vi.spyOn(local, 'deleteObject').mockImplementation(async (...args) => {
      if (args[2] === candidate.key) {
        calls++;
        if (calls === 1) {
          started();
          await paused;
        }
        if (calls === 1 || repeat)
          throw Object.assign(new Error('candidate failure at handoff'), {
            code,
          });
      }
      return actual(...args);
    });
    const oldCleanup = cleanupMediaCandidates(runtime());
    await entered;
    trashImage(connection.db, image.imageId);
    requestPermanentDelete(connection.db, image.imageId);
    release();
    await oldCleanup;
    expect(
      readMediaCleanup(connection.db, image.imageId).remaining.find(
        (object) => object.key === candidate.key,
      ),
    ).toMatchObject({
      attempts: 1,
      status: code === 'EBUSY' ? 'cleanup_pending' : 'cleanup_failed',
    });
    connection.db
      .update(mediaObjects)
      .set({ nextCleanupAt: new Date(0) })
      .where(eq(mediaObjects.id, candidate.objectId))
      .run();
    await cleanup();
    expect(readMediaCleanup(connection.db, image.imageId).status).toBe(
      expected,
    );
    expect(calls).toBe(attempts);
    await cleanup();
    expect(calls).toBe(attempts);
    if (expected === 'succeeded')
      expect(readMediaCleanup(connection.db, image.imageId).remaining).toEqual(
        [],
      );
    else
      expect(
        readMediaCleanup(connection.db, image.imageId).remaining,
      ).toMatchObject([{ attempts, key: candidate.key }]);
  },
);

it('accepts S3 deletion as a persistent task before asynchronous object cleanup', async () => {
  const image = await asset();
  trashImage(connection.db, image.imageId);
  connection.db.update(storageConfigs).set({ type: 's3' }).run();
  const accepted = requestPermanentDelete(connection.db, image.imageId);
  expect(accepted.status).toBe('queued');
  expect(accepted.remaining).toMatchObject([
    { key: image.key, status: 'cleanup_pending', attempts: 0 },
  ]);
  expect(connection.db.select().from(mediaImages).get()!.deletionStatus).toBe(
    'deleting',
  );
  expect(connection.db.select().from(mediaCleanupJobs).all()).toHaveLength(1);
  expect(requestPermanentDelete(connection.db, image.imageId)).toEqual(
    accepted,
  );
  expect(
    await local.inspectObject(runtime().storageRoot, image.storage, image.key),
  ).toEqual({ size: 14 });
});
