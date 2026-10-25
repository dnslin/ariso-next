import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { collectionFixture } from '../collections/helpers.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
} from '../../../src/server/media/schema.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import { claimNextMediaJob } from '../../../src/server/media/queue.ts';
import { recoverMediaJobs } from '../../../src/server/media/recovery.ts';
import { findDuplicateImage } from '../../../src/server/media/duplicates.ts';
import {
  enqueueFingerprintJobs,
  readFingerprintCoverage,
  retryFingerprintJobs,
} from '../../../src/server/media/fingerprints.ts';
import { processFingerprintJob } from '../../../src/server/media/fingerprint-job.ts';
import { acceptOriginal } from '../../../src/server/media/images.ts';
import { replacementAdmission } from '../../../src/server/media/replacement.ts';
import { requestReprocess } from '../../../src/server/media/reprocess.ts';
import * as mediaStorage from '../../../src/server/media/storage.ts';
import { mediaError } from '../../../src/server/media/errors.ts';
import { trashImage } from '../../../src/server/media/trash.ts';
import { requestPermanentDelete } from '../../../src/server/media/cleanup.ts';

let fixture: ReturnType<typeof collectionFixture>;
let bytes: Buffer;
beforeEach(async () => {
  fixture = collectionFixture();
  bytes = await readFile('tests/fixtures/media-formats/source.png');
});
afterEach(() => {
  vi.restoreAllMocks();
  fixture.close();
});
function runtime() {
  return {
    ...fixture,
    temporaryRoot: join(fixture.storageRoot, 'tmp'),
    logger: { info() {}, error() {} },
  };
}
async function oldImage(id: string, write = true) {
  fixture.image(id);
  fixture.db
    .update(mediaImages)
    .set({ processingStatus: 'ready' })
    .where(eq(mediaImages.id, id))
    .run();
  fixture.db
    .update(mediaJobs)
    .set({ status: 'succeeded' })
    .where(eq(mediaJobs.imageId, id))
    .run();
  const object = fixture.db
    .select()
    .from(mediaObjects)
    .where(eq(mediaObjects.imageId, id))
    .get()!;
  const path = join(
    fixture.storageRoot,
    fixture.storage.localPath,
    'ariso',
    fixture.storage.id,
    object.key,
  );
  if (write) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
  }
  return object;
}

it('backfills existing identical originals without a unique constraint or changes to image processing state', async () => {
  await oldImage('one');
  await oldImage('two');
  enqueueFingerprintJobs(fixture.db);
  expect(readFingerprintCoverage(fixture.db)).toMatchObject({
    total: 2,
    pending: 2,
    completed: 0,
    complete: false,
  });
  const first = claimNextMediaJob(fixture.db)!;
  expect(first).toMatchObject({
    kind: 'fingerprint',
    snapshot: { watermarkMode: 'off', watermarkAsset: null },
    expectedVersions: [],
  });
  expect(claimNextMediaJob(fixture.db)).toBeNull();
  await processFingerprintJob(runtime(), first.id);
  const second = claimNextMediaJob(fixture.db)!;
  await processFingerprintJob(runtime(), second.id);
  expect(readFingerprintCoverage(fixture.db)).toMatchObject({
    total: 2,
    completed: 2,
    pending: 0,
    running: 0,
    complete: true,
  });
  expect(
    fixture.db
      .select()
      .from(mediaObjects)
      .all()
      .map((o) => o.contentSha256),
  ).toEqual([
    createHash('sha256').update(bytes).digest('hex'),
    createHash('sha256').update(bytes).digest('hex'),
  ]);
  expect(
    fixture.db
      .select()
      .from(mediaImages)
      .all()
      .every((image) => image.processingStatus === 'ready'),
  ).toBe(true);
  expect(
    findDuplicateImage(
      fixture.db,
      createHash('sha256').update(bytes).digest('hex'),
    )?.id,
  ).toBe('one');
});

it('shows disabled-storage coverage instead of claiming completion and starts after re-enabling', async () => {
  await oldImage('disabled');
  fixture.db
    .update(storageConfigs)
    .set({ enabled: false })
    .where(eq(storageConfigs.id, fixture.storage.id))
    .run();
  enqueueFingerprintJobs(fixture.db);
  expect(readFingerprintCoverage(fixture.db)).toMatchObject({
    completed: 0,
    pending: 0,
    unavailable: 1,
    complete: false,
  });
  expect(claimNextMediaJob(fixture.db)).toBeNull();
  fixture.db
    .update(storageConfigs)
    .set({ enabled: true })
    .where(eq(storageConfigs.id, fixture.storage.id))
    .run();
  enqueueFingerprintJobs(fixture.db);
  await processFingerprintJob(runtime(), claimNextMediaJob(fixture.db)!.id);
  expect(readFingerprintCoverage(fixture.db).complete).toBe(true);
});

it.each(['after-claim', 'before-read', 'after-read'] as const)(
  'pauses the same claimed fingerprint at %s without consuming or replenishing retry budgets',
  async (boundary) => {
    const object = await oldImage('pausing');
    enqueueFingerprintJobs(fixture.db);
    const job = claimNextMediaJob(fixture.db)!;
    fixture.db
      .update(mediaJobs)
      .set({ retryCount: 1, recoveryCount: 2 })
      .where(eq(mediaJobs.id, job.id))
      .run();
    const disable = () =>
      fixture.db
        .update(storageConfigs)
        .set({ enabled: false })
        .where(eq(storageConfigs.id, fixture.storage.id))
        .run();
    let readCompleted = false;
    if (boundary === 'after-claim') disable();
    else {
      const read = mediaStorage.readMediaObject;
      vi.spyOn(mediaStorage, 'readMediaObject').mockImplementationOnce(
        async (...args) => {
          if (boundary === 'before-read') disable();
          const source = await read(...args);
          if (boundary === 'after-read')
            source.stream.once('end', () => {
              readCompleted = true;
              disable();
            });
          return source;
        },
      );
    }
    await processFingerprintJob(runtime(), job.id);
    expect(readCompleted).toBe(boundary === 'after-read');
    expect(
      fixture.db.select().from(mediaJobs).where(eq(mediaJobs.id, job.id)).get(),
    ).toMatchObject({
      id: job.id,
      status: 'queued',
      retryCount: 1,
      recoveryCount: 2,
      startedAt: null,
      finishedAt: null,
      nextAttemptAt: null,
    });
    expect(
      fixture.db
        .select()
        .from(mediaObjects)
        .where(eq(mediaObjects.id, object.id))
        .get()?.contentSha256,
    ).toBeNull();
    expect(readFingerprintCoverage(fixture.db)).toMatchObject({
      unavailable: 1,
      failed: 0,
      running: 0,
    });
    expect(enqueueFingerprintJobs(fixture.db)).toBe(0);
    expect(claimNextMediaJob(fixture.db)).toBeNull();
    fixture.db
      .update(storageConfigs)
      .set({ enabled: true })
      .where(eq(storageConfigs.id, fixture.storage.id))
      .run();
    expect(enqueueFingerprintJobs(fixture.db)).toBe(0);
    const resumed = claimNextMediaJob(fixture.db)!;
    expect(resumed).toMatchObject({
      id: job.id,
      retryCount: 1,
      recoveryCount: 2,
    });
    await processFingerprintJob(runtime(), resumed.id);
    expect(
      fixture.db.select().from(mediaJobs).where(eq(mediaJobs.id, job.id)).get(),
    ).toMatchObject({ status: 'succeeded', retryCount: 1, recoveryCount: 2 });
    expect(
      fixture.db
        .select()
        .from(mediaObjects)
        .where(eq(mediaObjects.id, object.id))
        .get()?.contentSha256,
    ).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(fixture.db.select().from(mediaJobs).all()).toHaveLength(2);
  },
);

it('does not revive a real read failure merely because its diagnostic path contains STORAGE_DISABLED', async () => {
  await oldImage('STORAGE_DISABLED-missing', false);
  enqueueFingerprintJobs(fixture.db);
  const job = claimNextMediaJob(fixture.db)!;
  fixture.db
    .update(mediaJobs)
    .set({ retryCount: 1, recoveryCount: 2 })
    .where(eq(mediaJobs.id, job.id))
    .run();
  await processFingerprintJob(runtime(), job.id);
  const failed = fixture.db
    .select()
    .from(mediaJobs)
    .where(eq(mediaJobs.id, job.id))
    .get()!;
  expect(failed).toMatchObject({
    status: 'failed',
    retryCount: 1,
    recoveryCount: 2,
  });
  expect(failed.error).toContain('STORAGE_OBJECT_MISSING');
  expect(failed.error).toContain('STORAGE_DISABLED');
  enqueueFingerprintJobs(fixture.db);
  expect(
    fixture.db.select().from(mediaJobs).where(eq(mediaJobs.id, job.id)).get(),
  ).toEqual(failed);
  expect(claimNextMediaJob(fixture.db)).toBeNull();
  expect(readFingerprintCoverage(fixture.db)).toMatchObject({
    failed: 1,
    pending: 0,
    completed: 0,
  });
});

it('keeps permanent deletion authoritative when storage is also disabled at the read boundary', async () => {
  const object = await oldImage('deleting');
  enqueueFingerprintJobs(fixture.db);
  const job = claimNextMediaJob(fixture.db)!;
  fixture.db
    .update(mediaJobs)
    .set({ retryCount: 1, recoveryCount: 2 })
    .where(eq(mediaJobs.id, job.id))
    .run();
  const read = mediaStorage.readMediaObject;
  vi.spyOn(mediaStorage, 'readMediaObject').mockImplementationOnce(
    async (...args) => {
      fixture.db
        .update(storageConfigs)
        .set({ enabled: false })
        .where(eq(storageConfigs.id, fixture.storage.id))
        .run();
      trashImage(fixture.db, 'deleting');
      requestPermanentDelete(fixture.db, 'deleting');
      return read(...args);
    },
  );
  await processFingerprintJob(runtime(), job.id);
  expect(
    fixture.db.select().from(mediaJobs).where(eq(mediaJobs.id, job.id)).get(),
  ).toMatchObject({ status: 'cancelled', retryCount: 1, recoveryCount: 2 });
  expect(
    fixture.db
      .select()
      .from(mediaObjects)
      .where(eq(mediaObjects.id, object.id))
      .get()?.contentSha256,
  ).toBeNull();
});

it('leaves an interrupted disabled-storage attempt to the existing recovery budget', async () => {
  await oldImage('interrupted-disabled');
  enqueueFingerprintJobs(fixture.db);
  const job = claimNextMediaJob(fixture.db)!;
  fixture.db
    .update(mediaJobs)
    .set({ retryCount: 1, recoveryCount: 1 })
    .where(eq(mediaJobs.id, job.id))
    .run();
  const signal = new AbortController();
  const read = mediaStorage.readMediaObject;
  vi.spyOn(mediaStorage, 'readMediaObject').mockImplementationOnce(
    async (...args) => {
      fixture.db
        .update(storageConfigs)
        .set({ enabled: false })
        .where(eq(storageConfigs.id, fixture.storage.id))
        .run();
      signal.abort(
        mediaError('MEDIA_INTERRUPTED', 'controlled runtime shutdown'),
      );
      return read(...args);
    },
  );
  await processFingerprintJob(runtime(), job.id, signal.signal);
  expect(
    fixture.db.select().from(mediaJobs).where(eq(mediaJobs.id, job.id)).get(),
  ).toMatchObject({ status: 'running', retryCount: 1, recoveryCount: 1 });
  recoverMediaJobs(fixture.db);
  expect(
    fixture.db.select().from(mediaJobs).where(eq(mediaJobs.id, job.id)).get(),
  ).toMatchObject({ status: 'queued', retryCount: 1, recoveryCount: 2 });
  expect(claimNextMediaJob(fixture.db)).toBeNull();
});

it('retains failed originals in coverage and retries explicitly without changing their asset state', async () => {
  const object = await oldImage('missing', false);
  enqueueFingerprintJobs(fixture.db);
  await processFingerprintJob(runtime(), claimNextMediaJob(fixture.db)!.id);
  expect(readFingerprintCoverage(fixture.db)).toMatchObject({
    failed: 1,
    completed: 0,
    complete: false,
    failures: [{ imageId: 'missing' }],
  });
  enqueueFingerprintJobs(fixture.db);
  expect(claimNextMediaJob(fixture.db)).toBeNull();
  const path = join(
    fixture.storageRoot,
    fixture.storage.localPath,
    'ariso',
    fixture.storage.id,
    object.key,
  );
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  retryFingerprintJobs(fixture.db);
  await processFingerprintJob(runtime(), claimNextMediaJob(fixture.db)!.id);
  expect(readFingerprintCoverage(fixture.db).complete).toBe(true);
});

it('resumes interrupted fingerprint jobs through the existing persisted scheduler', async () => {
  await oldImage('interrupted');
  enqueueFingerprintJobs(fixture.db);
  const job = claimNextMediaJob(fixture.db)!;
  recoverMediaJobs(fixture.db);
  const recovered = claimNextMediaJob(fixture.db)!;
  expect(recovered).toMatchObject({
    id: job.id,
    kind: 'fingerprint',
    recoveryCount: 1,
  });
  await processFingerprintJob(runtime(), recovered.id);
  expect(readFingerprintCoverage(fixture.db).complete).toBe(true);
});

it('does not let twenty disabled-storage jobs prevent another storage from being indexed', async () => {
  for (let index = 0; index < 20; index++) await oldImage(`a-${index}`);
  enqueueFingerprintJobs(fixture.db);
  const storage = fixture.db.select().from(storageConfigs).get()!;
  fixture.db
    .update(storageConfigs)
    .set({ enabled: false })
    .where(eq(storageConfigs.id, storage.id))
    .run();
  fixture.db
    .insert(storageConfigs)
    .values({
      ...storage,
      id: 'other',
      name: 'other',
      localPath: 'other',
      enabled: true,
    })
    .run();
  fixture.db.transaction((tx) =>
    acceptOriginal(tx, { ...fixture.input('other-image'), storageId: 'other' }),
  );
  fixture.db
    .update(mediaJobs)
    .set({ status: 'succeeded' })
    .where(eq(mediaJobs.imageId, 'other-image'))
    .run();
  expect(enqueueFingerprintJobs(fixture.db)).toBe(1);
  expect(claimNextMediaJob(fixture.db)).toMatchObject({
    imageId: 'other-image',
    kind: 'fingerprint',
  });
  expect(readFingerprintCoverage(fixture.db)).toMatchObject({
    total: 21,
    unavailable: 20,
    running: 1,
  });
});

it('accepts explicit content work ahead of a queued fingerprint task', async () => {
  await oldImage('priority');
  enqueueFingerprintJobs(fixture.db);
  expect(() => replacementAdmission(fixture.db, 'priority')).not.toThrow();
  const process = requestReprocess(fixture.db, 'priority');
  expect(claimNextMediaJob(fixture.db)).toMatchObject({
    id: process.jobId,
    kind: 'process',
  });
});

it('does not acquire a write transaction once all current originals are covered, even with unhashed derivatives', async () => {
  const original = await oldImage('covered');
  fixture.db
    .update(mediaObjects)
    .set({ contentSha256: createHash('sha256').update(bytes).digest('hex') })
    .where(eq(mediaObjects.id, original.id))
    .run();
  const now = new Date();
  fixture.db
    .insert(mediaObjects)
    .values({
      id: 'derived',
      imageId: 'covered',
      storageId: fixture.storage.id,
      key: 'derived.png',
      purpose: 'thumbnail',
      status: 'stored',
      byteSize: 100,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  const writer = new Database(fixture.db.$client.name);
  fixture.db.$client.pragma('busy_timeout=0');
  try {
    writer.exec('BEGIN IMMEDIATE');
    expect(enqueueFingerprintJobs(fixture.db)).toBe(0);
  } finally {
    writer.exec('ROLLBACK');
    writer.close();
  }
});

it('discovers a later historical original after an earlier pass found no work', async () => {
  expect(enqueueFingerprintJobs(fixture.db)).toBe(0);
  await oldImage('later');
  expect(enqueueFingerprintJobs(fixture.db)).toBe(1);
  await processFingerprintJob(runtime(), claimNextMediaJob(fixture.db)!.id);
  expect(readFingerprintCoverage(fixture.db)).toMatchObject({
    completed: 1,
    complete: true,
  });
});
