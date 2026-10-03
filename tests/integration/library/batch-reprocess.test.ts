import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { collectionFixture } from '../collections/helpers.ts';
import {
  parseLibraryBatch,
  runLibraryBatch,
} from '../../../src/server/library/batch.ts';
import type { BatchCommand } from '../../../src/server/library/batch-types.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaVersions,
} from '../../../src/server/media/schema.ts';
import { patchMediaSettings } from '../../../src/server/media/settings.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';

let fixture: ReturnType<typeof collectionFixture>;
beforeEach(() => {
  fixture = collectionFixture();
});
afterEach(() => fixture.close());

function image(id: string, status: 'ready' | 'failed' = 'ready') {
  fixture.image(id);
  fixture.db.update(mediaJobs).set({ status: 'succeeded' }).run();
  fixture.db
    .update(mediaImages)
    .set({ processingStatus: status, classification: 'static' })
    .where(eq(mediaImages.id, id))
    .run();
  return id;
}
function command(
  ids: string[],
  scope: Extract<BatchCommand, { type: 'reprocess' }>['scope'] = 'all',
): Extract<BatchCommand, { type: 'reprocess' }> {
  return {
    type: 'reprocess',
    scope,
    taskIds: Object.fromEntries(ids.map((id) => [id, randomUUID()])),
  };
}
const run = (
  ids: string[],
  operation: BatchCommand,
  mode: 'apply' | 'check' = 'apply',
  query = '',
  onFailure = vi.fn(),
) =>
  runLibraryBatch(
    fixture.db,
    parseLibraryBatch({ ids, command: operation, query, mode }),
    onFailure,
  );
const task = (id: string) =>
  fixture.db.select().from(mediaJobs).where(eq(mediaJobs.id, id)).get();

it.each(['all', 'compressed', 'thumbnail', 'watermark'] as const)(
  'accepts ready %s as a durable task without changing current versions or identity',
  async (scope) => {
    const id = image('ready');
    patchMediaSettings(fixture.db, {
      watermarkMode: 'text',
      watermarkText: 'Ariso',
    });
    const before = fixture.db.select().from(mediaImages).all();
    const versions = fixture.db.select().from(mediaVersions).all();
    const objects = fixture.db.select().from(mediaObjects).all();
    const operation = command([id], scope);
    const result = (await run([id], operation)).results[0];
    expect(result).toMatchObject({
      id,
      status: 'accepted',
      inQuery: true,
      taskId: operation.taskIds[id],
      task: {
        id: operation.taskIds[id],
        status: 'queued',
        scope,
        step: 'identify',
        error: null,
        generatedVersions: [],
        expectedVersions:
          scope === 'all' ? ['compressed', 'thumbnail', 'watermark'] : [scope],
      },
    });
    expect(fixture.db.select().from(mediaImages).all()).toEqual(before);
    expect(fixture.db.select().from(mediaVersions).all()).toEqual(versions);
    expect(fixture.db.select().from(mediaObjects).all()).toEqual(objects);
    expect(task(operation.taskIds[id])).toMatchObject({
      id: operation.taskIds[id],
      imageId: id,
      kind: 'process',
      snapshot: { watermarkText: 'Ariso' },
    });
  },
);

it('keeps failed-image scope conflicts separate from ready-image watermark acceptance', async () => {
  image('failed', 'failed');
  image('ready');
  patchMediaSettings(fixture.db, {
    watermarkMode: 'text',
    watermarkText: 'Ariso',
  });
  const operation = command(['failed', 'ready'], 'watermark');
  const log = vi.fn();
  expect(
    (await run(['failed', 'ready'], operation, 'apply', '', log)).results,
  ).toMatchObject([
    {
      id: 'failed',
      status: 'failed',
      code: 'MEDIA_REPROCESS_SCOPE',
      inQuery: true,
    },
    { id: 'ready', status: 'accepted', taskId: operation.taskIds.ready },
  ]);
  expect(task(operation.taskIds.failed)).toBeUndefined();
  expect(log).not.toHaveBeenCalled();
  const retry = command(['failed']);
  expect((await run(['failed'], retry)).results[0].status).toBe('accepted');
  expect(task(retry.taskIds.failed)?.scope).toBe('all');
});

it('checks the exact accepted task after lost responses and never substitutes another newer task', async () => {
  image('accepted');
  image('unknown');
  const operation = command(['accepted', 'unknown']);
  const before = fixture.db.select().from(mediaJobs).all();
  const apply = {
    ...operation,
    taskIds: { accepted: operation.taskIds.accepted },
  };
  await run(['accepted'], apply);
  fixture.db
    .update(mediaJobs)
    .set({ status: 'succeeded' })
    .where(eq(mediaJobs.id, operation.taskIds.accepted))
    .run();
  const later = command(['accepted', 'unknown']);
  await run(['accepted', 'unknown'], later);
  const all = fixture.db.select().from(mediaJobs).all();
  fixture.db.$client.pragma('query_only = ON');
  try {
    expect(
      (await run(['accepted', 'unknown'], operation, 'check')).results,
    ).toMatchObject([
      {
        id: 'accepted',
        status: 'accepted',
        taskId: operation.taskIds.accepted,
        task: { status: 'succeeded' },
      },
      {
        id: 'unknown',
        status: 'unknown',
        code: 'LIBRARY_BATCH_TASK_UNCONFIRMED',
        inQuery: true,
      },
    ]);
    expect(fixture.db.select().from(mediaJobs).all()).toEqual(all);
    expect(all.length - before.length).toBe(3);
  } finally {
    fixture.db.$client.pragma('query_only = OFF');
  }
});

it('reports saved generated versions for this task and retains acceptance after leaving the query', async () => {
  image('progress');
  const operation = command(['progress'], 'thumbnail');
  await run(['progress'], operation);
  const original = fixture.db.select().from(mediaObjects).get()!;
  fixture.db
    .insert(mediaObjects)
    .values({
      ...original,
      id: randomUUID(),
      jobId: operation.taskIds.progress,
      purpose: 'thumbnail',
      key: 'generated/progress-thumbnail.png',
      status: 'stored',
    })
    .run();
  fixture.db
    .update(mediaJobs)
    .set({ status: 'running', step: 'thumbnail' })
    .where(eq(mediaJobs.id, operation.taskIds.progress))
    .run();
  fixture.db
    .update(mediaImages)
    .set({ visibility: 'private' })
    .where(eq(mediaImages.id, 'progress'))
    .run();
  expect(
    (await run(['progress'], operation, 'check', 'visibility=public'))
      .results[0],
  ).toMatchObject({
    status: 'accepted',
    inQuery: false,
    task: {
      status: 'running',
      step: 'thumbnail',
      generatedVersions: ['thumbnail'],
    },
  });
});

it('rolls back a failed task registration and continues other selected images with diagnostics', async () => {
  image('blocked');
  image('healthy');
  fixture.db.$client.exec(
    "CREATE TRIGGER reject_batch_task BEFORE INSERT ON media_jobs WHEN NEW.image_id = 'blocked' BEGIN SELECT RAISE(ABORT, 'injected batch task registration failure'); END",
  );
  const operation = command(['blocked', 'healthy']);
  const log = vi.fn();
  expect(
    (await run(['blocked', 'healthy'], operation, 'apply', '', log)).results,
  ).toMatchObject([
    {
      id: 'blocked',
      status: 'failed',
      code: 'INTERNAL_SERVER_ERROR',
      inQuery: true,
    },
    { id: 'healthy', status: 'accepted', taskId: operation.taskIds.healthy },
  ]);
  expect(task(operation.taskIds.blocked)).toBeUndefined();
  expect(task(operation.taskIds.healthy)).toBeDefined();
  expect(log).toHaveBeenCalledWith(expect.any(Error), 'blocked');
});

it.each(['queued', 'running', 'succeeded', 'failed', 'cancelled'] as const)(
  'replays the same %s acceptance without taking a new settings snapshot or creating a new task',
  async (status) => {
    image('replay');
    const operation = command(['replay']);
    await run(['replay'], operation);
    fixture.db
      .update(mediaJobs)
      .set({
        status,
        step: 'thumbnail',
        error: status === 'failed' ? 'injected processing failure' : null,
      })
      .where(eq(mediaJobs.id, operation.taskIds.replay))
      .run();
    const original = task(operation.taskIds.replay);
    const count = fixture.db.select().from(mediaJobs).all().length;
    patchMediaSettings(fixture.db, { quality: 42 });
    for (const mode of ['apply', 'check'] as const)
      expect((await run(['replay'], operation, mode)).results[0]).toMatchObject(
        {
          status: 'accepted',
          taskId: operation.taskIds.replay,
          task: { status, step: 'thumbnail', error: original?.error },
        },
      );
    expect(task(operation.taskIds.replay)).toEqual(original);
    expect(fixture.db.select().from(mediaJobs).all()).toHaveLength(count);
  },
);

it('rejects task identity reuse for another image, kind or range without creating new tasks', async () => {
  image('first');
  image('second');
  const original = command(['first']);
  await run(['first'], original);
  const count = fixture.db.select().from(mediaJobs).all().length;
  for (const [ids, operation] of [
    [['second'], { ...original, taskIds: { second: original.taskIds.first } }],
    [['first'], { ...original, scope: 'thumbnail' }],
  ] as [string[], Extract<BatchCommand, { type: 'reprocess' }>][])
    for (const mode of ['apply', 'check'] as const)
      expect((await run(ids, operation, mode)).results[0]).toMatchObject({
        status: 'failed',
        code: 'MEDIA_REPROCESS_TASK_CONFLICT',
      });
  fixture.db
    .update(mediaJobs)
    .set({ kind: 'metadata' })
    .where(eq(mediaJobs.id, original.taskIds.first))
    .run();
  expect((await run(['first'], original, 'check')).results[0]).toMatchObject({
    status: 'failed',
    code: 'MEDIA_REPROCESS_TASK_CONFLICT',
  });
  expect(fixture.db.select().from(mediaJobs).all()).toHaveLength(count);
});

it('takes current settings independently for each image and later 200-item HTTP chunks', async () => {
  const ids = Array.from({ length: 201 }, (_, index) =>
    image(`image-${index}`),
  );
  patchMediaSettings(fixture.db, { quality: 31 });
  const first = command(ids.slice(0, 200));
  const pending = run(ids.slice(0, 200), first);
  patchMediaSettings(fixture.db, { quality: 53 });
  expect(
    (await pending).results.every((item) => item.status === 'accepted'),
  ).toBe(true);
  expect(task(first.taskIds[ids[0]])?.snapshot.quality).toBe(31);
  expect(task(first.taskIds[ids[1]])?.snapshot.quality).toBe(53);
  patchMediaSettings(fixture.db, { quality: 77 });
  const last = command(ids.slice(200));
  await run(ids.slice(200), last);
  expect(task(last.taskIds[ids[200]])?.snapshot.quality).toBe(77);
  patchMediaSettings(fixture.db, { quality: 99 });
  expect(task(first.taskIds[ids[0]])?.snapshot.quality).toBe(31);
  expect(task(last.taskIds[ids[200]])?.snapshot.quality).toBe(77);
});

it('rechecks current query, storage, active task, disabled ranges and format for every item', async () => {
  const ids = [
    'disabled',
    'active',
    'animated',
    'outside',
    'deleting',
    'missing',
  ];
  for (const id of ids.slice(0, -1)) image(id);
  const active = command(['active']);
  await run(['active'], active);
  fixture.db
    .update(mediaImages)
    .set({ classification: 'animated' })
    .where(eq(mediaImages.id, 'animated'))
    .run();
  fixture.db
    .update(mediaImages)
    .set({ trashedAt: new Date() })
    .where(eq(mediaImages.id, 'outside'))
    .run();
  fixture.db
    .update(mediaImages)
    .set({ deletionStatus: 'deleting' })
    .where(eq(mediaImages.id, 'deleting'))
    .run();
  patchMediaSettings(fixture.db, {
    compressionEnabled: false,
    defaultLinkVersion: 'original',
  });
  expect((await run(ids, command(ids, 'compressed'))).results).toMatchObject([
    { id: 'disabled', status: 'failed', code: 'MEDIA_REPROCESS_DISABLED' },
    { id: 'active', status: 'failed', code: 'MEDIA_JOB_CONFLICT' },
    { id: 'animated', status: 'failed', code: 'MEDIA_REPROCESS_DISABLED' },
    {
      id: 'outside',
      status: 'failed',
      code: 'LIBRARY_IMAGE_OUTSIDE_QUERY',
      inQuery: false,
    },
    {
      id: 'deleting',
      status: 'failed',
      code: 'LIBRARY_IMAGE_OUTSIDE_QUERY',
      inQuery: false,
    },
    {
      id: 'missing',
      status: 'failed',
      code: 'MEDIA_IMAGE_NOT_FOUND',
      inQuery: false,
    },
  ]);
  patchMediaSettings(fixture.db, { compressionEnabled: true });
  expect(
    (await run(['animated'], command(['animated'], 'compressed'))).results[0],
  ).toMatchObject({ code: 'MEDIA_REPROCESS_NOT_APPLICABLE' });
  fixture.db.update(storageConfigs).set({ enabled: false }).run();
  expect(
    (await run(['disabled'], command(['disabled']))).results[0],
  ).toMatchObject({ code: 'STORAGE_DISABLED' });
});
