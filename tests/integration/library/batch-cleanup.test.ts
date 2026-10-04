import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { collectionFixture } from '../collections/helpers.ts';
import {
  parseLibraryBatch,
  runLibraryBatch,
} from '../../../src/server/library/batch.ts';
import type { BatchCommand } from '../../../src/server/library/batch-types.ts';
import { readLibraryPage } from '../../../src/server/library/queries.ts';
import { parseLibraryQuery } from '../../../src/server/library/query-schema.ts';
import {
  cleanupPermanentDeletes,
  readMediaCleanup,
  requestPermanentDelete,
} from '../../../src/server/media/cleanup.ts';
import {
  mediaCleanupJobs,
  mediaImages,
  mediaJobs,
  mediaObjects,
} from '../../../src/server/media/schema.ts';
import { trashImage } from '../../../src/server/media/trash.ts';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import * as local from '../../../src/server/storage/local.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';

let fixture: ReturnType<typeof collectionFixture>;
beforeEach(() => {
  fixture = collectionFixture();
});
afterEach(() => {
  vi.restoreAllMocks();
  fixture.close();
});
const logger = { info: vi.fn(), error: vi.fn() };
const runtime = () => ({
  db: fixture.db,
  storageRoot: fixture.storageRoot,
  temporaryRoot: join(dirname(fixture.storageRoot), 'tmp'),
  logger,
});
const run = (
  ids: string[],
  command: BatchCommand = { type: 'delete-permanent' },
  mode: 'apply' | 'check' = 'apply',
  query = 'scope=trash',
  onFailure = vi.fn(),
) =>
  runLibraryBatch(
    fixture.db,
    parseLibraryBatch({ ids, command, query, mode }),
    onFailure,
  );
const image = (id: string) =>
  fixture.db.select().from(mediaImages).where(eq(mediaImages.id, id)).get();
function seed(id: string) {
  fixture.image(id);
  fixture.db
    .update(mediaJobs)
    .set({ status: 'succeeded' })
    .where(eq(mediaJobs.imageId, id))
    .run();
  trashImage(fixture.db, id);
  return id;
}
async function asset(id: string) {
  seed(id);
  const key = fixture.input(id).key;
  await local.writeObject(
    fixture.storageRoot,
    fixture.storage,
    { key, temporaryKey: `${key}.partial` },
    Readable.from('original bytes'),
  );
  return { id, key };
}
async function extra(id: string) {
  const plan = local.planLocalWrite('images');
  await local.writeObject(
    fixture.storageRoot,
    fixture.storage,
    plan,
    Readable.from('extra bytes'),
  );
  const objectId = randomUUID();
  fixture.db
    .insert(mediaObjects)
    .values({
      id: objectId,
      imageId: id,
      storageId: fixture.storage.id,
      key: plan.key,
      purpose: 'temporary',
      status: 'writing',
      byteSize: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();
  return { objectId, key: plan.key };
}
function retryCommand(
  id: string,
): Extract<BatchCommand, { type: 'retry-cleanup' }> {
  const cleanup = readMediaCleanup(fixture.db, id);
  return {
    type: 'retry-cleanup',
    attempts: { [id]: { taskId: cleanup.jobId, cycle: cleanup.cycle } },
  };
}

it('accepts real local cleanup without removing records, permits disabled maintenance, then confirms durable success after image removal', async () => {
  const { id, key } = await asset('local');
  fixture.db.update(storageConfigs).set({ enabled: false }).run();
  const accepted = (
    await run([id], undefined, 'apply', 'scope=trash&deletionStatus=none')
  ).results[0];
  const cleanup = readMediaCleanup(fixture.db, id);
  expect(accepted).toMatchObject({
    status: 'accepted',
    taskId: cleanup.jobId,
    inQuery: false,
    cleanup: {
      status: 'queued',
      cycle: 1,
      totalObjects: 1,
      deletedObjects: 0,
      remaining: [{ key, status: 'cleanup_pending' }],
    },
  });
  expect(image(id)?.deletionStatus).toBe('deleting');
  expect(
    readLibraryPage(
      fixture.db,
      parseLibraryQuery(new URLSearchParams('scope=trash')),
    ).total,
  ).toBe(1);
  expect(
    await local.inspectObject(fixture.storageRoot, fixture.storage, key),
  ).toEqual({ size: 14 });
  expect((await run([id])).results[0]).toMatchObject({
    status: 'unchanged',
    code: 'MEDIA_CLEANUP_ALREADY_REQUESTED',
    taskId: cleanup.jobId,
    cleanup: { cycle: 1 },
  });
  await cleanupPermanentDeletes(runtime(), new Set());
  expect(
    await local.inspectObject(fixture.storageRoot, fixture.storage, key),
  ).toBeNull();
  expect(image(id)).toBeUndefined();
  expect((await run([id], undefined, 'check')).results[0]).toMatchObject({
    status: 'accepted',
    taskId: cleanup.jobId,
    inQuery: false,
    cleanup: {
      status: 'succeeded',
      remaining: [],
      totalObjects: null,
      deletedObjects: null,
      deletedPurposes: null,
      finishedAt: expect.any(String),
    },
  });
});

it('rechecks every image query membership, rolls back failed task registration, and continues the rest of the selection', async () => {
  for (const id of ['first', 'restored', 'blocked', 'healthy']) seed(id);
  fixture.db.$client.exec(
    "CREATE TRIGGER reject_cleanup_task BEFORE INSERT ON media_cleanup_jobs WHEN NEW.image_id = 'blocked' BEGIN SELECT RAISE(ABORT, 'injected cleanup registration failure'); END",
  );
  const log = vi.fn();
  const pending = run(
    ['first', 'restored', 'blocked', 'missing', 'healthy'],
    undefined,
    'apply',
    'scope=trash',
    log,
  );
  fixture.db
    .update(mediaImages)
    .set({ trashedAt: null })
    .where(eq(mediaImages.id, 'restored'))
    .run();
  expect((await pending).results).toMatchObject([
    { id: 'first', status: 'accepted' },
    {
      id: 'restored',
      status: 'failed',
      code: 'LIBRARY_IMAGE_OUTSIDE_QUERY',
      inQuery: false,
    },
    {
      id: 'blocked',
      status: 'failed',
      code: 'INTERNAL_SERVER_ERROR',
      inQuery: true,
    },
    {
      id: 'missing',
      status: 'failed',
      code: 'MEDIA_IMAGE_NOT_FOUND',
      inQuery: false,
    },
    { id: 'healthy', status: 'accepted' },
  ]);
  expect(image('blocked')?.deletionStatus).toBeNull();
  expect(
    fixture.db
      .select()
      .from(mediaObjects)
      .where(eq(mediaObjects.imageId, 'blocked'))
      .get()?.status,
  ).toBe('stored');
  expect(log).toHaveBeenCalledWith(expect.any(Error), 'blocked');
  expect(
    fixture.db
      .select()
      .from(mediaCleanupJobs)
      .all()
      .map((job) => job.imageId),
  ).toEqual(['first', 'healthy']);
});

it('checks unknown outcomes without writing or treating a missing asset or old failed cycle as successful acceptance', async () => {
  seed('unsubmitted');
  seed('failed');
  requestPermanentDelete(fixture.db, 'failed');
  fixture.db.update(mediaCleanupJobs).set({ status: 'failed' }).run();
  fixture.db
    .update(mediaImages)
    .set({ deletionStatus: 'cleanup_failed' })
    .where(eq(mediaImages.id, 'failed'))
    .run();
  const command = retryCommand('failed');
  const jobs = fixture.db.select().from(mediaCleanupJobs).all();
  const objects = fixture.db.select().from(mediaObjects).all();
  fixture.db.$client.pragma('query_only = ON');
  try {
    expect(
      (await run(['unsubmitted', 'missing'], undefined, 'check')).results,
    ).toMatchObject([
      {
        id: 'unsubmitted',
        status: 'unknown',
        inQuery: true,
        code: 'LIBRARY_BATCH_TASK_UNCONFIRMED',
      },
      {
        id: 'missing',
        status: 'unknown',
        inQuery: false,
        code: 'LIBRARY_BATCH_TASK_UNCONFIRMED',
      },
    ]);
    expect((await run(['failed'], command, 'check')).results[0]).toMatchObject({
      status: 'unknown',
      code: 'LIBRARY_BATCH_TASK_UNCONFIRMED',
    });
    expect(fixture.db.select().from(mediaCleanupJobs).all()).toEqual(jobs);
    expect(fixture.db.select().from(mediaObjects).all()).toEqual(objects);
  } finally {
    fixture.db.$client.pragma('query_only = OFF');
  }
});

it('preserves actual partial cleanup, finite attempts across restart, and exact manual retry cycles', async () => {
  const { id, key } = await asset('partial');
  const remaining = await extra(id);
  await run([id]);
  const actualDelete = local.deleteObject;
  const failure = vi
    .spyOn(local, 'deleteObject')
    .mockImplementation(async (...args) => {
      if (args[2] === remaining.key)
        throw Object.assign(new Error('busy object'), { code: 'EBUSY' });
      return actualDelete(...args);
    });
  await cleanupPermanentDeletes(runtime(), new Set());
  expect(readMediaCleanup(fixture.db, id)).toMatchObject({
    status: 'running',
    totalObjects: 2,
    deletedObjects: 1,
    deletedPurposes: ['original'],
    remaining: [
      {
        key: remaining.key,
        byteSize: 11,
        attempts: 1,
        status: 'cleanup_pending',
      },
    ],
  });
  expect(
    await local.inspectObject(fixture.storageRoot, fixture.storage, key),
  ).toBeNull();
  const reopened = openRuntimeDatabase(
    join(dirname(fixture.storageRoot), 'ariso.db'),
  );
  try {
    await cleanupPermanentDeletes({ ...runtime(), db: reopened.db }, new Set());
    expect(
      failure.mock.calls.filter((args) => args[2] === remaining.key),
    ).toHaveLength(1);
    reopened.db
      .update(mediaObjects)
      .set({ nextCleanupAt: new Date(0) })
      .run();
    await cleanupPermanentDeletes({ ...runtime(), db: reopened.db }, new Set());
    expect(readMediaCleanup(reopened.db, id)).toMatchObject({
      status: 'failed',
      remaining: [{ attempts: 2 }],
    });
  } finally {
    reopened.close();
  }
  expect(
    failure.mock.calls.filter((args) => args[2] === remaining.key),
  ).toHaveLength(2);
  const command = retryCommand(id);
  expect((await run([id], command, 'check')).results[0].status).toBe('unknown');
  expect((await run([id], { type: 'restore' })).results[0]).toMatchObject({
    status: 'failed',
    code: 'MEDIA_DELETION_STARTED',
  });
  expect((await run([id], command)).results[0]).toMatchObject({
    status: 'accepted',
    taskId: command.attempts[id].taskId,
    cleanup: {
      status: 'queued',
      cycle: 2,
      totalObjects: 2,
      deletedObjects: 1,
      remaining: [{ key: remaining.key, attempts: 0, byteSize: 11 }],
    },
  });
  expect((await run([id], command)).results[0]).toMatchObject({
    status: 'unchanged',
    cleanup: { cycle: 2 },
  });
  failure.mockRestore();
  await cleanupPermanentDeletes(runtime(), new Set());
  expect((await run([id], command, 'check')).results[0]).toMatchObject({
    status: 'accepted',
    inQuery: false,
    cleanup: { status: 'succeeded', cycle: 2 },
  });
});

it('reports unknown bytes after a permission failure, keeps the failure task distinct from registration failure, and cannot retry a changed task or cycle', async () => {
  const { id } = await asset('permission');
  const remaining = await extra(id);
  await run([id]);
  const actualInspect = local.inspectObject;
  const failure = vi
    .spyOn(local, 'inspectObject')
    .mockImplementation(async (...args) => {
      if (args[2] === remaining.key)
        throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
      return actualInspect(...args);
    });
  await cleanupPermanentDeletes(runtime(), new Set());
  const before = readMediaCleanup(fixture.db, id);
  expect(before).toMatchObject({
    status: 'failed',
    totalObjects: 2,
    deletedObjects: 1,
    remaining: [
      {
        key: remaining.key,
        attempts: 1,
        byteSize: null,
        error: expect.stringContaining('permission denied'),
      },
    ],
  });
  expect((await run([id])).results[0]).toMatchObject({
    status: 'unchanged',
    cleanup: { status: 'failed' },
  });
  const command = retryCommand(id);
  const wrong = {
    ...command,
    attempts: { [id]: { taskId: 'other-task', cycle: 1 } },
  };
  expect((await run([id], wrong)).results[0]).toMatchObject({
    status: 'failed',
    code: 'MEDIA_CLEANUP_TASK_CONFLICT',
  });
  expect(readMediaCleanup(fixture.db, id)).toEqual(before);
  failure.mockRestore();
  await run([id], command);
  fixture.db.update(mediaCleanupJobs).set({ status: 'failed' }).run();
  const next = retryCommand(id);
  await run([id], next);
  expect((await run([id], command, 'check')).results[0]).toMatchObject({
    status: 'failed',
    code: 'MEDIA_CLEANUP_CYCLE_CHANGED',
  });
});

it('accepts S3 tasks through the current media provider without pretending the remote objects were verified', async () => {
  seed('remote');
  fixture.db.update(storageConfigs).set({ type: 's3', enabled: false }).run();
  expect((await run(['remote'])).results[0]).toMatchObject({
    status: 'accepted',
    cleanup: {
      status: 'queued',
      cycle: 1,
      remaining: [{ key: 'uploads/remote.png' }],
    },
  });
  expect(image('remote')?.deletionStatus).toBe('deleting');
});

it('accepts explicit 201-image selections in independent 200-item and final requests', async () => {
  const ids = Array.from({ length: 201 }, (_, index) =>
    seed(`selected-${index}`),
  );
  const results = [
    ...(await run(ids.slice(0, 200))).results,
    ...(await run(ids.slice(200))).results,
  ];
  expect(results.map((result) => result.id)).toEqual(ids);
  expect(
    results.every((result) => result.status === 'accepted' && result.taskId),
  ).toBe(true);
  expect(fixture.db.select().from(mediaCleanupJobs).all()).toHaveLength(201);
  expect(
    readLibraryPage(
      fixture.db,
      parseLibraryQuery(new URLSearchParams('scope=trash')),
    ).total,
  ).toBe(201);
});
