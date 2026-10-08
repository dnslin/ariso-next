import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { collectionFixture } from '../collections/helpers.ts';
import {
  readCurrentCounts,
  readUsage,
} from '../../../src/server/analytics/usage.ts';
import {
  createAlbum,
  getOrCreateTags,
} from '../../../src/server/collections/records.ts';
import {
  mediaImages,
  mediaObjects,
  mediaVersions,
} from '../../../src/server/media/schema.ts';
import {
  storageConfigs,
  storageOrphans,
  storageProbes,
} from '../../../src/server/storage/schema.ts';
import { createSubmission } from '../../../src/server/upload/sessions.ts';
import { uploadSessions } from '../../../src/server/upload/schema.ts';
import { acceptSession } from '../../../src/server/upload/accept.ts';
import { trashImage, restoreImage } from '../../../src/server/media/trash.ts';
import { requestPermanentDelete } from '../../../src/server/media/cleanup.ts';
import {
  writeObject,
  inspectObject,
  deleteObject,
} from '../../../src/server/storage/local.ts';

let fixture: ReturnType<typeof collectionFixture>;
beforeEach(() => {
  fixture = collectionFixture();
});
afterEach(() => fixture.close());
const time = new Date(1000);
const usage = () =>
  readUsage(fixture.db, time).storages.find(
    (s) => s.id === fixture.storage.id,
  )!;
function orphan(key: string, size: number, storageId = fixture.storage.id) {
  fixture.db
    .insert(storageOrphans)
    .values({ storageId, key, size, confirmedAt: time })
    .run();
}
function probe(
  key: string,
  objectState: 'planned' | 'writing' | 'stored',
  byteSize: number | null,
) {
  fixture.db
    .insert(storageProbes)
    .values({
      id: randomUUID(),
      storageId: fixture.storage.id,
      key,
      purpose: 'connection',
      configRevision: 1,
      state: 'cleanup',
      stage: 'delete',
      objectState,
      byteSize,
      confirmedAt: time,
      report: {
        probeId: key,
        storageId: fixture.storage.id,
        revision: 1,
        passed: false,
        stale: false,
        cleanupPending: true,
        stages: [],
        deploymentRequirement: '',
        testedAt: time.toISOString(),
        ownerConfirmation: {
          wholeBucketHasNoLockRules: false,
          confirmedAt: null,
        },
      },
      createdAt: time,
      updatedAt: time,
    })
    .run();
}

it('returns true empty storage and counts all normal states, recycle separately and empty albums', () => {
  expect(usage()).toMatchObject({
    knownBytes: 0,
    unconfirmedObjects: 0,
    confirmedAt: null,
    confirmationStatus: 'confirmed',
    groups: { original: 0, derived: 0, recycle: 0, pending: 0 },
  });
  expect(readCurrentCounts(fixture.db).counts).toEqual({
    normalImages: 0,
    recycledImages: 0,
    initialProcessingFailures: 0,
    reprocessFailures: 0,
    albums: 0,
  });
  for (const processingStatus of [
    'pending',
    'processing',
    'ready',
    'failed',
  ] as const) {
    const id = fixture.image();
    fixture.db
      .update(mediaImages)
      .set({ processingStatus, visibility: 'private' })
      .where(eq(mediaImages.id, id))
      .run();
  }
  trashImage(fixture.db, fixture.image());
  const deleting = fixture.image();
  fixture.db
    .update(mediaImages)
    .set({ deletionStatus: 'cleanup_failed' })
    .where(eq(mediaImages.id, deleting))
    .run();
  fixture.db.transaction((tx) => {
    createAlbum(tx, { name: 'empty' });
    getOrCreateTags(tx, ['not an album']);
  });
  createSubmission(fixture.db, {
    requestId: 'queued',
    files: [{ queueItemId: 'one', originalName: 'one.png', declaredSize: 20 }],
  });
  fixture.db.update(storageConfigs).set({ enabled: false }).run();
  expect(readCurrentCounts(fixture.db).counts).toMatchObject({
    normalImages: 4,
    recycledImages: 2,
    albums: 1,
    initialProcessingFailures: 1,
  });
});

it('deduplicates exact identities across providers, keeps planned zero and writing unknown despite scanner sizes', () => {
  const imageId = fixture.image();
  const original = fixture.db.select().from(mediaObjects).get()!;
  fixture.db.update(mediaObjects).set({ byteSizeConfirmedAt: time }).run();
  const add = (
    key: string,
    status: typeof original.status,
    bytes: number | null,
    purpose: typeof original.purpose = 'temporary',
  ) => {
    const id = randomUUID();
    fixture.db
      .insert(mediaObjects)
      .values({
        ...original,
        id,
        imageId,
        key,
        purpose,
        status,
        byteSize: bytes,
        byteSizeConfirmedAt: time,
      })
      .run();
    return id;
  };
  const thumbnail = add('thumb', 'stored', 30, 'thumbnail');
  fixture.db
    .insert(mediaVersions)
    .values({
      imageId,
      kind: 'thumbnail',
      objectId: thumbnail,
      byteSize: 9000,
      format: 'PNG',
      mime: 'image/png',
      createdAt: time,
    })
    .run();
  add('candidate', 'stored', 10);
  add('old', 'cleanup_failed', 20);
  add('writing', 'writing', 999);
  add('planned', 'planned', 999);
  add('deleted', 'deleted', 50);
  for (const [key, size] of [
    [original.key, 100],
    ['thumb', 30],
    ['writing', 999],
    ['planned', 999],
    ['deleted', 50],
  ] as const)
    orphan(key, size);
  probe('probe', 'stored', 5);
  orphan('probe', 900);
  probe('unknown-probe', 'stored', null);
  probe('writing-probe', 'writing', 888);
  probe('planned-probe', 'planned', 888);
  orphan('planned-probe', 888);
  const session = createSubmission(fixture.db, {
    requestId: 'duplicate',
    files: [{ queueItemId: 'one', originalName: 'one.png', declaredSize: 20 }],
  }).sessions[0];
  fixture.db
    .update(uploadSessions)
    .set({
      state: 'finalizing',
      temporaryKey: original.key,
      temporaryBytes: 900,
      finalKey: 'upload',
      finalBytes: 7,
      confirmedAt: time,
    })
    .where(eq(uploadSessions.id, session.id))
    .run();
  orphan('upload', 800);
  expect(usage()).toMatchObject({
    knownBytes: 222,
    unconfirmedObjects: 3,
    confirmedAt: time,
    confirmationStatus: 'unconfirmed',
    groups: { original: 100, derived: 30, recycle: 0, pending: 92 },
  });
  const other = randomUUID();
  fixture.db
    .insert(storageConfigs)
    .values({
      id: other,
      name: 'disabled empty remote',
      type: 's3',
      enabled: false,
      accessKeyEncrypted: 'must not leak',
      localPath: 'must not leak',
      createdAt: time,
      updatedAt: time,
    })
    .run();
  orphan(original.key, 9, other);
  expect(
    readUsage(fixture.db).storages.find((s) => s.id === other),
  ).toMatchObject({ knownBytes: 9, enabled: false });
  expect(JSON.stringify(readUsage(fixture.db))).not.toContain('must not leak');
  expect(JSON.stringify(readUsage(fixture.db))).not.toContain(original.key);
});

it('transfers actual local objects atomically, preserves retained temp bytes, and rolls back failed handoff', async () => {
  const { db } = fixture;
  const session = createSubmission(db, {
    requestId: 'handoff',
    files: [{ queueItemId: 'one', originalName: 'one.png', declaredSize: 20 }],
  }).sessions[0];
  await writeObject(
    fixture.storageRoot,
    fixture.storage,
    { key: 'original/one.png', temporaryKey: 'uploads/one.partial' },
    Readable.from(Buffer.alloc(20)),
  );
  expect(
    (
      await inspectObject(
        fixture.storageRoot,
        fixture.storage,
        'original/one.png',
      )
    )?.size,
  ).toBe(20);
  db.update(uploadSessions)
    .set({
      state: 'finalizing',
      finalKey: 'original/one.png',
      finalBytes: 20,
      byteSize: 20,
      confirmedAt: time,
    })
    .where(eq(uploadSessions.id, session.id))
    .run();
  const before = usage();
  expect(before).toMatchObject({
    knownBytes: 20,
    unconfirmedObjects: 0,
    groups: { original: 0, pending: 20 },
  });
  db.$client.exec(
    "CREATE TRIGGER fail_handoff BEFORE UPDATE OF state ON upload_sessions WHEN NEW.state='accepted' BEGIN SELECT RAISE(ABORT,'handoff failure'); END",
  );
  const facts: Parameters<typeof acceptSession>[2] = {
    format: 'PNG',
    mime: 'image/png',
    extension: 'png',
    coder: 'png',
    width: 1,
    height: 1,
  };
  expect(() => acceptSession(db, session.id, facts)).toThrow('handoff failure');
  expect(usage()).toEqual(before);
  expect(readCurrentCounts(db).counts.normalImages).toBe(0);
  db.$client.exec('DROP TRIGGER fail_handoff');
  acceptSession(db, session.id, facts);
  expect(usage()).toMatchObject({
    knownBytes: 20,
    groups: { original: 20, pending: 0 },
  });
  db.update(uploadSessions)
    .set({
      finalKey: 'original/one.png',
      finalBytes: 900,
      temporaryKey: 'uploads/retained',
      temporaryBytes: 7,
      cleanupStatus: 'failed',
    })
    .where(eq(uploadSessions.id, session.id))
    .run();
  expect(usage()).toMatchObject({
    knownBytes: 27,
    groups: { original: 20, pending: 7 },
  });
});

it('moves every media object on trash and restore and decreases bytes only after confirmed deletion', async () => {
  const { db } = fixture;
  const imageId = fixture.image();
  const original = db.select().from(mediaObjects).get()!;
  db.insert(mediaObjects)
    .values({
      ...original,
      id: randomUUID(),
      key: 'old',
      purpose: 'temporary',
      status: 'cleanup_failed',
      byteSize: 17,
    })
    .run();
  const before = usage();
  trashImage(db, imageId);
  expect(usage()).toMatchObject({
    knownBytes: 117,
    groups: { recycle: 117, original: 0, pending: 0 },
  });
  restoreImage(db, imageId);
  expect(usage()).toEqual(before);
  trashImage(db, imageId);
  requestPermanentDelete(db, imageId);
  expect(usage().knownBytes).toBe(117);
  await writeObject(
    fixture.storageRoot,
    fixture.storage,
    { key: 'old', temporaryKey: 'old.partial' },
    Readable.from(Buffer.alloc(17)),
  );
  await deleteObject(fixture.storageRoot, fixture.storage, 'old');
  expect(
    await inspectObject(fixture.storageRoot, fixture.storage, 'old'),
  ).toBeNull();
  db.update(mediaObjects)
    .set({ status: 'deleted' })
    .where(eq(mediaObjects.key, 'old'))
    .run();
  expect(usage()).toMatchObject({ knownBytes: 100, groups: { recycle: 100 } });
});

it('preserves missing known-object confirmation times, reads one caller snapshot and propagates failures', () => {
  const { db } = fixture;
  fixture.image();
  db.update(mediaObjects).set({ byteSizeConfirmedAt: null }).run();
  orphan('orphan', 17);
  expect(usage()).toMatchObject({
    knownBytes: 117,
    unconfirmedObjects: 0,
    confirmedAt: null,
  });
  const before = usage();
  expect(() =>
    db.transaction((tx) => {
      tx.insert(storageOrphans)
        .values({
          storageId: fixture.storage.id,
          key: 'new',
          size: 13,
          confirmedAt: time,
        })
        .run();
      expect(readUsage(tx).storages[0].knownBytes).toBe(130);
      throw new Error('rollback');
    }),
  ).toThrow('rollback');
  expect(usage()).toEqual(before);
  db.$client.exec('DROP TABLE storage_orphans');
  expect(() => readUsage(db)).toThrow('no such table');
});
