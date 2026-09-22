import { randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { beforeEach, afterEach, expect, it } from 'vitest';
import { openRuntimeDatabase } from '../../../src/server/runtime/db.ts';
import { migrateRuntimeDatabase } from '../../../src/server/runtime/migrations.ts';
import {
  prepareInitialStorage,
  resolveUploadStorage,
} from '../../../src/server/storage/defaults.ts';
import {
  prepareInitialMedia,
  createProcessingSnapshot,
} from '../../../src/server/media/settings.ts';
import { acceptOriginal } from '../../../src/server/media/images.ts';
import {
  mediaJobs,
  mediaImages,
  mediaObjects,
} from '../../../src/server/media/schema.ts';
import { planDerivedObject } from '../../../src/server/media/objects.ts';
import { claimNextMediaJob } from '../../../src/server/media/queue.ts';
import {
  recoverMediaJobs,
  settleMediaFailure,
  advanceMediaStep,
} from '../../../src/server/media/recovery.ts';
let directory: string;
let connection: ReturnType<typeof openRuntimeDatabase>;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'ariso-recovery-'));
  mkdirSync(join(directory, 'storage'));
  connection = openRuntimeDatabase(join(directory, 'db'));
  migrateRuntimeDatabase(connection.db, resolve('drizzle'));
  prepareInitialStorage(connection.db, { storage: join(directory, 'storage') });
  connection.db.transaction(prepareInitialMedia);
});
afterEach(() => {
  connection.close();
  rmSync(directory, { recursive: true, force: true });
});
function enqueue() {
  return connection.db.transaction((tx) =>
    acceptOriginal(tx, {
      imageId: randomUUID(),
      storageId: resolveUploadStorage(tx).id,
      key: randomUUID(),
      originalName: 'input.png',
      visibility: 'private',
      format: 'PNG',
      mime: 'image/png',
      byteSize: 10,
      snapshot: createProcessingSnapshot(tx),
      expectedVersions: ['compressed', 'thumbnail'],
    }),
  );
}
const job = () => connection.db.select().from(mediaJobs).get()!;
function reopen() {
  connection.close();
  connection = openRuntimeDatabase(join(directory, 'db'));
}
it('retains the original snapshot, delay and one transient retry across reopen', () => {
  const accepted = enqueue();
  const snapshot = job().snapshot;
  claimNextMediaJob(connection.db);
  settleMediaFailure(
    connection.db,
    accepted.jobId,
    'compressed',
    Object.assign(new Error('temporary disk I/O'), { code: 'EIO' }),
  );
  expect(job()).toMatchObject({ status: 'queued', retryCount: 1, snapshot });
  reopen();
  recoverMediaJobs(connection.db);
  expect(claimNextMediaJob(connection.db)).toBeNull();
  expect(job().nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
  connection.db
    .update(mediaJobs)
    .set({ nextAttemptAt: new Date(0) })
    .run();
  claimNextMediaJob(connection.db);
  settleMediaFailure(
    connection.db,
    accepted.jobId,
    'compressed',
    Object.assign(new Error('again'), { code: 'EIO' }),
  );
  expect(job()).toMatchObject({ status: 'failed', retryCount: 1 });
  reopen();
  recoverMediaJobs(connection.db);
  expect(claimNextMediaJob(connection.db)).toBeNull();
});
it.each([
  'ENOSPC',
  'EACCES',
  'EPERM',
  'MEDIA_FORMAT_UNSUPPORTED',
  'MEDIA_PLAN_INVALID',
  'INSUFFICIENT_DISK_SPACE',
])('does not retry permanent error %s', (code) => {
  const accepted = enqueue();
  claimNextMediaJob(connection.db);
  settleMediaFailure(
    connection.db,
    accepted.jobId,
    'compressed',
    Object.assign(new Error(code), { code }),
  );
  expect(job()).toMatchObject({
    status: 'failed',
    retryCount: 0,
    nextAttemptAt: null,
  });
});
it('allows two no-progress recoveries, persists exhaustion, and does not spend the transient retry', () => {
  enqueue();
  for (let attempt = 0; attempt < 3; attempt++) {
    expect(claimNextMediaJob(connection.db)).not.toBeNull();
    reopen();
    recoverMediaJobs(connection.db);
    expect(job().retryCount).toBe(0);
  }
  expect(job()).toMatchObject({
    status: 'failed',
    recoveryCount: 2,
    error: expect.stringContaining('MEDIA_RECOVERY_EXHAUSTED'),
  });
  reopen();
  recoverMediaJobs(connection.db);
  expect(claimNextMediaJob(connection.db)).toBeNull();
  expect(connection.db.select().from(mediaImages).get()!.processingStatus).toBe(
    'failed',
  );
});
it('only committed step progress resets the recovery budget', () => {
  const accepted = enqueue();
  claimNextMediaJob(connection.db);
  recoverMediaJobs(connection.db);
  claimNextMediaJob(connection.db);
  connection.db.transaction((tx) =>
    advanceMediaStep(tx, accepted.jobId, 'compressed'),
  );
  expect(job().recoveryCount).toBe(0);
  recoverMediaJobs(connection.db);
  claimNextMediaJob(connection.db);
  connection.db.transaction((tx) =>
    advanceMediaStep(tx, accepted.jobId, 'compressed'),
  );
  expect(job().recoveryCount).toBe(1);
  connection.db.transaction((tx) =>
    advanceMediaStep(tx, accepted.jobId, 'thumbnail'),
  );
  expect(job().recoveryCount).toBe(0);
  expect(job().step).toBe('thumbnail');
});
it('recovery exhaustion does not take a ready image offline', () => {
  const accepted = enqueue();
  connection.db
    .update(mediaImages)
    .set({ processingStatus: 'ready' })
    .where(eq(mediaImages.id, accepted.imageId))
    .run();
  connection.db
    .update(mediaJobs)
    .set({ status: 'running', recoveryCount: 2 })
    .run();
  recoverMediaJobs(connection.db);
  expect(job().status).toBe('failed');
  expect(connection.db.select().from(mediaImages).get()!.processingStatus).toBe(
    'ready',
  );
});

it('does not interleave another job for the same image during the retry delay', () => {
  const first = enqueue();
  const firstJob = job();
  connection.db
    .insert(mediaJobs)
    .values({ ...firstJob, id: randomUUID() })
    .run();
  claimNextMediaJob(connection.db);
  settleMediaFailure(
    connection.db,
    first.jobId,
    'compressed',
    Object.assign(new Error('temporary'), { code: 'EIO' }),
  );
  expect(claimNextMediaJob(connection.db)).toBeNull();
  const other = enqueue();
  expect(claimNextMediaJob(connection.db)?.id).toBe(other.jobId);
});
it('recovery exhaustion preserves stored objects and records unfinished candidate cleanup', () => {
  const accepted = enqueue();
  claimNextMediaJob(connection.db);
  const plan = connection.db.transaction((tx) =>
    planDerivedObject(tx, accepted.jobId, 'thumbnail'),
  );
  connection.db.update(mediaJobs).set({ recoveryCount: 2 }).run();
  recoverMediaJobs(connection.db);
  expect(
    connection.db
      .select()
      .from(mediaObjects)
      .where(eq(mediaObjects.id, accepted.objectId))
      .get()!.status,
  ).toBe('stored');
  expect(
    connection.db
      .select()
      .from(mediaObjects)
      .where(eq(mediaObjects.id, plan.objectId))
      .get(),
  ).toMatchObject({
    status: 'cleanup_pending',
    error: expect.stringContaining('MEDIA_RECOVERY_EXHAUSTED'),
  });
});
