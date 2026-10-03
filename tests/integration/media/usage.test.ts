import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { readMediaUsage } from '../../../src/server/media/usage.ts';
import {
  mediaCleanupJobs,
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaVersions,
} from '../../../src/server/media/schema.ts';
import { trashImage, restoreImage } from '../../../src/server/media/trash.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import { acceptOriginal } from '../../../src/server/media/images.ts';
import {
  requestPermanentDelete,
  retryMediaCleanup,
} from '../../../src/server/media/cleanup.ts';
import { collectionFixture } from '../collections/helpers.ts';

let fixture: ReturnType<typeof collectionFixture>;
beforeEach(() => {
  fixture = collectionFixture();
});
afterEach(() => fixture.close());
const usage = () => fixture.db.transaction(readMediaUsage);
const confirmedAt = new Date(1000);

it.each(['delete acceptance', 'manual retry', 'budget update'] as const)(
  'keeps object size confirmation time through %s without an object inspection',
  (operation) => {
    const { db } = fixture;
    const imageId = fixture.image();
    trashImage(db, imageId);
    if (operation === 'manual retry') {
      requestPermanentDelete(db, imageId);
      db.update(mediaCleanupJobs).set({ status: 'failed' }).run();
    }
    db.update(mediaObjects)
      .set({
        updatedAt: confirmedAt,
        byteSizeConfirmedAt: confirmedAt,
      })
      .run();
    const before = usage()[0].confirmedAt;
    expect(before).toEqual(confirmedAt);
    if (operation === 'delete acceptance') requestPermanentDelete(db, imageId);
    if (operation === 'manual retry') retryMediaCleanup(db, imageId);
    if (operation === 'budget update')
      db.update(mediaObjects)
        .set({ cleanupAttempts: 1, updatedAt: new Date() })
        .run();
    expect(usage()[0].confirmedAt).toEqual(before);
  },
);

function object(
  imageId: string,
  status: (typeof mediaObjects.$inferSelect)['status'],
  byteSize: number | null,
  purpose: (typeof mediaObjects.$inferSelect)['purpose'] = 'temporary',
) {
  const image = fixture.db
    .select()
    .from(mediaImages)
    .where(eq(mediaImages.id, imageId))
    .get()!;
  const id = randomUUID();
  fixture.db
    .insert(mediaObjects)
    .values({
      id,
      imageId,
      storageId: image.storageId,
      key: `candidate/${id}`,
      purpose,
      status,
      byteSize,
      byteSizeConfirmedAt:
        byteSize !== null && status !== 'planned' && status !== 'writing'
          ? confirmedAt
          : null,
      createdAt: confirmedAt,
      updatedAt: confirmedAt,
    })
    .run();
  return id;
}

it('counts each physical object once and keeps writing or unconfirmed cleanup separate from known bytes', () => {
  const { db } = fixture;
  const imageId = fixture.image();
  db.update(mediaObjects)
    .set({ updatedAt: confirmedAt, byteSizeConfirmedAt: confirmedAt })
    .run();
  const thumbnailId = object(imageId, 'stored', 30, 'thumbnail');
  db.insert(mediaVersions)
    .values({
      imageId,
      kind: 'thumbnail',
      objectId: thumbnailId,
      byteSize: 9999,
      format: 'WEBP',
      mime: 'image/webp',
      createdAt: confirmedAt,
    })
    .run();
  object(imageId, 'stored', 20, 'compressed');
  object(imageId, 'cleanup_failed', 10);
  object(imageId, 'cleanup_pending', 5);
  object(imageId, 'writing', 999);
  object(imageId, 'writing', null);
  object(imageId, 'stored', null);
  object(imageId, 'cleanup_failed', null);
  object(imageId, 'cleanup_pending', null);
  object(imageId, 'planned', 5000);
  object(imageId, 'deleted', 5000);
  db.update(storageConfigs).set({ enabled: false }).run();

  expect(usage()).toEqual([
    {
      storageId: fixture.storage.id,
      normalImages: 1,
      recycledImages: 0,
      initialProcessingFailures: 0,
      reprocessFailures: 0,
      knownBytes: 165,
      unconfirmedObjects: 5,
      groups: { recycle: 0, original: 100, derived: 30, pending: 35 },
      confirmedAt,
    },
  ]);
});

it('moves all asset objects between normal and recycle without changing totals, then reduces only confirmed deletions', () => {
  const { db } = fixture;
  const imageId = fixture.image();
  const thumbnailId = object(imageId, 'stored', 30, 'thumbnail');
  db.insert(mediaVersions)
    .values({
      imageId,
      kind: 'thumbnail',
      objectId: thumbnailId,
      byteSize: 30,
      format: 'WEBP',
      mime: 'image/webp',
      createdAt: confirmedAt,
    })
    .run();
  object(imageId, 'cleanup_failed', 20);
  const unknownId = object(imageId, 'writing', 4000);
  const before = usage()[0];
  trashImage(db, imageId);
  expect(usage()[0]).toMatchObject({
    normalImages: 0,
    recycledImages: 1,
    knownBytes: 150,
    unconfirmedObjects: 1,
    groups: { recycle: 150, original: 0, derived: 0, pending: 0 },
  });
  restoreImage(db, imageId);
  expect(usage()[0]).toEqual(before);
  // Permanent deletion excludes the asset from the normal count even if trash is absent.
  db.update(mediaImages)
    .set({ deletionStatus: 'deleting' })
    .where(eq(mediaImages.id, imageId))
    .run();
  expect(usage()[0]).toMatchObject({
    normalImages: 0,
    recycledImages: 1,
    knownBytes: 150,
  });
  db.update(mediaObjects)
    .set({ status: 'deleted', byteSize: 0 })
    .where(eq(mediaObjects.id, thumbnailId))
    .run();
  expect(usage()[0]).toMatchObject({
    recycledImages: 1,
    knownBytes: 120,
    unconfirmedObjects: 1,
  });
  db.update(mediaObjects)
    .set({ status: 'deleted', byteSize: 0 })
    .where(eq(mediaObjects.id, unknownId))
    .run();
  expect(usage()[0]).toMatchObject({ knownBytes: 120, unconfirmedObjects: 0 });
});

it('separates storage totals and leaves unknown occupancy unconfirmed without reading files', () => {
  const { db } = fixture;
  const now = new Date();
  const remoteId = randomUUID();
  db.insert(storageConfigs)
    .values({
      id: remoteId,
      name: 'disabled remote',
      type: 's3',
      enabled: false,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  const remote = db.transaction((tx) =>
    acceptOriginal(tx, {
      ...fixture.input(),
      storageId: remoteId,
      key: 'missing-on-remote',
      byteSize: 200,
    }),
  );
  fixture.image();
  db.update(mediaObjects)
    .set({ status: 'writing', byteSize: 900 })
    .where(eq(mediaObjects.id, remote.objectId))
    .run();
  const rows = usage();
  expect(rows).toHaveLength(2);
  expect(
    rows.find((row) => row.storageId === fixture.storage.id),
  ).toMatchObject({ normalImages: 1, knownBytes: 100, unconfirmedObjects: 0 });
  expect(rows.find((row) => row.storageId === remoteId)).toEqual({
    storageId: remoteId,
    normalImages: 1,
    recycledImages: 0,
    initialProcessingFailures: 0,
    reprocessFailures: 0,
    knownBytes: 0,
    unconfirmedObjects: 1,
    groups: { recycle: 0, original: 0, derived: 0, pending: 0 },
    confirmedAt: null,
  });
});

it.each(['original', 'pending'] as const)(
  'keeps the storage confirmation time unknown when an occupied %s object has no confirmation timestamp',
  (group) => {
    const { db } = fixture;
    const imageId = fixture.image();
    db.update(mediaObjects).set({ byteSizeConfirmedAt: confirmedAt }).run();
    const unknownTimeId = object(imageId, 'cleanup_failed', 17);
    object(imageId, 'cleanup_pending', 20);
    db.update(mediaObjects)
      .set({ byteSizeConfirmedAt: null })
      .where(
        group === 'original'
          ? eq(mediaObjects.purpose, 'original')
          : eq(mediaObjects.id, unknownTimeId),
      )
      .run();
    expect(usage()[0]).toMatchObject({
      knownBytes: 137,
      unconfirmedObjects: 0,
      confirmedAt: null,
    });
  },
);

it('does not turn planned or writing declared sizes into known occupancy when deletion is accepted', () => {
  const { db } = fixture;
  const imageId = fixture.image();
  object(imageId, 'planned', 5000);
  object(imageId, 'writing', 9000);
  expect(usage()[0]).toMatchObject({ knownBytes: 100, unconfirmedObjects: 1 });
  trashImage(db, imageId);
  requestPermanentDelete(db, imageId);
  expect(usage()[0]).toMatchObject({ knownBytes: 100, unconfirmedObjects: 2 });
});

it('counts current normal initial failures and only the latest process failure on ready images', () => {
  const { db } = fixture;
  const initial = fixture.image();
  db.update(mediaImages)
    .set({ processingStatus: 'failed' })
    .where(eq(mediaImages.id, initial))
    .run();
  const recycled = fixture.image();
  db.update(mediaImages)
    .set({ processingStatus: 'failed' })
    .where(eq(mediaImages.id, recycled))
    .run();
  trashImage(db, recycled);
  const ready = fixture.image();
  db.update(mediaImages)
    .set({ processingStatus: 'ready' })
    .where(eq(mediaImages.id, ready))
    .run();
  const initialJob = db
    .select()
    .from(mediaJobs)
    .where(eq(mediaJobs.imageId, ready))
    .get()!;
  db.update(mediaJobs)
    .set({ status: 'failed' })
    .where(eq(mediaJobs.id, initialJob.id))
    .run();
  // Same timestamps are ordered by insertion order, as in getImageAccessState.
  db.insert(mediaJobs)
    .values({ ...initialJob, id: '000-later-failure', status: 'failed' })
    .run();
  db.insert(mediaJobs)
    .values({
      ...initialJob,
      id: 'metadata-failed',
      kind: 'metadata',
      status: 'failed',
    })
    .run();
  expect(usage()[0]).toMatchObject({
    normalImages: 2,
    recycledImages: 1,
    initialProcessingFailures: 1,
    reprocessFailures: 1,
  });
  db.insert(mediaJobs)
    .values({ ...initialJob, id: 'resolved', status: 'succeeded' })
    .run();
  expect(usage()[0]).toMatchObject({
    initialProcessingFailures: 1,
    reprocessFailures: 0,
  });
});

it('uses the caller snapshot without changing records and propagates database failures', () => {
  const { db } = fixture;
  expect(usage()).toEqual([]);
  expect(() =>
    db.transaction((tx) => {
      acceptOriginal(tx, fixture.input());
      expect(readMediaUsage(tx)[0]).toMatchObject({
        normalImages: 1,
        knownBytes: 100,
      });
      throw new Error('rollback');
    }),
  ).toThrow('rollback');
  expect(usage()).toEqual([]);
  fixture.image();
  const before = db.select().from(mediaObjects).all();
  usage();
  expect(db.select().from(mediaObjects).all()).toEqual(before);
  db.$client.exec('DROP TABLE media_versions');
  expect(() => usage()).toThrow('no such table');
});
