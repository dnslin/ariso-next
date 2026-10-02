import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { acceptOriginal } from '../../../src/server/media/images.ts';
import { getStorageReferences } from '../../../src/server/media/references.ts';
import {
  mediaCleanupJobs,
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaVersions,
} from '../../../src/server/media/schema.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import { collectionFixture } from '../collections/helpers.ts';

let fixture: ReturnType<typeof collectionFixture>;
beforeEach(() => {
  fixture = collectionFixture();
});
afterEach(() => fixture.close());
const references = (storageId = fixture.storage.id) =>
  fixture.db.transaction((tx) => getStorageReferences(tx, storageId));

it('retains every asset state, version, undeleted object and unfinished task on disabled storage', () => {
  const { db, storage } = fixture;
  db.update(storageConfigs).set({ enabled: false }).run();
  const images = (['pending', 'processing', 'ready', 'failed'] as const).map(
    (processingStatus) => {
      const id = fixture.image();
      db.update(mediaImages)
        .set({ processingStatus })
        .where(eq(mediaImages.id, id))
        .run();
      return id;
    },
  );
  for (const deletionStatus of [null, 'deleting', 'cleanup_failed'] as const) {
    const id = fixture.image();
    images.push(id);
    db.update(mediaImages)
      .set({ trashedAt: new Date(1), deletionStatus })
      .where(eq(mediaImages.id, id))
      .run();
  }
  const imageId = images[0];
  const baseJob = db
    .select()
    .from(mediaJobs)
    .where(eq(mediaJobs.imageId, imageId))
    .get()!;
  const now = new Date();
  const states = [
    'planned',
    'writing',
    'stored',
    'cleanup_pending',
    'cleanup_failed',
    'deleted',
  ] as const;
  db.insert(mediaObjects)
    .values(
      states.map((status) => ({
        id: status,
        imageId,
        storageId: storage.id,
        key: `candidates/${status}`,
        purpose: 'temporary' as const,
        status,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .run();
  const jobStates = [
    'queued',
    'running',
    'failed',
    'succeeded',
    'cancelled',
  ] as const;
  db.insert(mediaJobs)
    .values(
      jobStates.map((status) => ({
        ...baseJob,
        id: `metadata-${status}`,
        kind: 'metadata' as const,
        status,
      })),
    )
    .run();
  db.insert(mediaCleanupJobs)
    .values(
      (['queued', 'running', 'failed', 'succeeded'] as const).map(
        (status, index) => ({
          id: `cleanup-${status}`,
          imageId: images[index],
          status,
          createdAt: now,
          updatedAt: now,
        }),
      ),
    )
    .run();

  const remoteId = randomUUID();
  db.insert(storageConfigs)
    .values({
      id: remoteId,
      name: 'other storage',
      type: 's3',
      enabled: false,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  const remote = db.transaction((tx) =>
    acceptOriginal(tx, { ...fixture.input(), storageId: remoteId }),
  );

  const snapshot = references();
  expect(snapshot.storageId).toBe(storage.id);
  expect(snapshot.images.map((image) => image.id).sort()).toEqual(
    images.sort(),
  );
  expect(snapshot.versions).toHaveLength(images.length);
  expect(
    snapshot.objects
      .filter(
        (object) =>
          object.imageId === imageId && object.purpose === 'temporary',
      )
      .map((object) => object.id)
      .sort(),
  ).toEqual(states.filter((status) => status !== 'deleted').sort());
  expect(snapshot.jobs.map((job) => job.id).sort()).toEqual(
    [
      ...db
        .select()
        .from(mediaJobs)
        .all()
        .filter((job) => images.includes(job.imageId) && job.kind === 'process')
        .map((job) => job.id),
      'metadata-queued',
      'metadata-running',
    ].sort(),
  );
  expect(snapshot.cleanupJobs.map((job) => job.id).sort()).toEqual([
    'cleanup-failed',
    'cleanup-queued',
    'cleanup-running',
  ]);
  expect(references(remoteId).images.map((image) => image.id)).toEqual([
    remote.imageId,
  ]);
  expect(references('missing')).toEqual({
    storageId: 'missing',
    images: [],
    versions: [],
    objects: [],
    jobs: [],
    cleanupJobs: [],
  });
});

it('reads the caller transaction and releases completed deletion history without hiding database errors', () => {
  const { db } = fixture;
  const input = fixture.input();
  expect(() =>
    db.transaction((tx) => {
      const accepted = acceptOriginal(tx, input);
      expect(
        getStorageReferences(tx, input.storageId).images.map(
          (image) => image.id,
        ),
      ).toEqual([accepted.imageId]);
      throw new Error('roll back');
    }),
  ).toThrow('roll back');
  expect(references().images).toEqual([]);

  const imageId = fixture.image();
  const now = new Date();
  db.insert(mediaCleanupJobs)
    .values({
      id: 'completed',
      imageId,
      status: 'succeeded',
      createdAt: now,
      updatedAt: now,
    })
    .run();
  db.transaction((tx) => {
    tx.delete(mediaVersions).where(eq(mediaVersions.imageId, imageId)).run();
    tx.delete(mediaObjects).where(eq(mediaObjects.imageId, imageId)).run();
    tx.delete(mediaJobs).where(eq(mediaJobs.imageId, imageId)).run();
    tx.delete(mediaImages).where(eq(mediaImages.id, imageId)).run();
  });
  expect(references()).toEqual({
    storageId: fixture.storage.id,
    images: [],
    versions: [],
    objects: [],
    jobs: [],
    cleanupJobs: [],
  });
  expect(db.select().from(mediaCleanupJobs).get()!.status).toBe('succeeded');
  db.$client.exec('DROP TABLE media_cleanup_jobs');
  expect(() => references()).toThrow('no such table');
});
