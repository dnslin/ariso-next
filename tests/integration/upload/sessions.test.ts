import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collectionFixture } from '../collections/helpers.ts';
import {
  createSubmission,
  cancelSession,
  getSubmission,
  requireSessionStorage,
} from '../../../src/server/upload/sessions.ts';
import {
  uploadSessions,
  uploadSettings,
  uploadSubmissions,
} from '../../../src/server/upload/schema.ts';
import {
  mediaSettings,
  mediaImages,
  mediaJobs,
  mediaVersions,
  mediaObjects,
} from '../../../src/server/media/schema.ts';
import {
  storageConfigs,
  storageSettings,
} from '../../../src/server/storage/schema.ts';

let fixture: ReturnType<typeof collectionFixture>;
beforeEach(() => {
  fixture = collectionFixture();
});
afterEach(() => {
  fixture.close();
});
const input = (requestId = 'request', count = 1, size = 10) => ({
  requestId,
  files: Array.from({ length: count }, (_, i) => ({
    queueItemId: `q${i}`,
    originalName: 'photo.png',
    declaredSize: size,
  })),
});

describe('persisted upload submissions', () => {
  it('freezes settings and only new submissions see changes', () => {
    const { db } = fixture;
    const first = createSubmission(db, input('first'));
    expect(first.sessions[0].groupIndex).toBe(0);
    expect(new Set(first.sessions.map((s) => s.candidateImageId)).size).toBe(1);
    db.update(mediaSettings)
      .set({ quality: 33, defaultVisibility: 'private' })
      .run();
    db.update(uploadSettings).set({ maxFileBytes: 1, batchSize: 1 }).run();
    expect(createSubmission(db, input('first'))).toEqual(first);
    expect(getSubmission(db, first.id).snapshot.quality).toBe(82);
    expect(createSubmission(db, input('second', 1, 1))).toMatchObject({
      maxFileBytes: 1,
      visibility: 'private',
      snapshot: { quality: 33 },
    });
    expect(() => createSubmission(db, input('first', 1, 11))).toThrow(
      expect.objectContaining({ code: 'UPLOAD_REQUEST_CONFLICT' }),
    );
  });
  it('accepts exactly 50 MiB, rejects above it and rolls back missing collection targets', () => {
    const { db } = fixture;
    createSubmission(db, input('equal', 1, 50 * 1024 * 1024));
    expect(() =>
      createSubmission(db, input('over', 1, 50 * 1024 * 1024 + 1)),
    ).toThrow(expect.objectContaining({ status: 413 }));
    expect(() =>
      createSubmission(db, { ...input('missing'), albumIds: ['missing'] }),
    ).toThrow();
    expect(db.select().from(uploadSubmissions).all()).toHaveLength(1);
    expect(db.select().from(uploadSessions).all()).toHaveLength(1);
  });
  it('does not choose another target when default is absent or fixed target is disabled', () => {
    const { db, storage } = fixture;
    const first = createSubmission(db, input());
    db.update(storageSettings).set({ defaultStorageId: null }).run();
    expect(() => createSubmission(db, input('next'))).toThrow(
      expect.objectContaining({ code: 'DEFAULT_STORAGE_UNSET' }),
    );
    db.update(storageConfigs)
      .set({ enabled: false })
      .where(eq(storageConfigs.id, storage.id))
      .run();
    expect(() => requireSessionStorage(db, first.sessions[0])).toThrow(
      expect.objectContaining({ code: 'STORAGE_DISABLED' }),
    );
  });
  it('retains accepted history after the actual asset and job are deleted', () => {
    const { db } = fixture;
    const submission = createSubmission(db, input());
    const imageId = fixture.image();
    const job = db
      .select()
      .from(mediaJobs)
      .where(eq(mediaJobs.imageId, imageId))
      .get()!;
    db.update(uploadSessions)
      .set({ state: 'accepted', imageId, jobId: job.id })
      .where(eq(uploadSessions.id, submission.sessions[0].id))
      .run();
    db.transaction((tx) => {
      tx.delete(mediaVersions).where(eq(mediaVersions.imageId, imageId)).run();
      tx.delete(mediaObjects).where(eq(mediaObjects.imageId, imageId)).run();
      tx.delete(mediaJobs).where(eq(mediaJobs.imageId, imageId)).run();
      tx.delete(mediaImages).where(eq(mediaImages.id, imageId)).run();
    });
    expect(getSubmission(db, submission.id).sessions[0]).toMatchObject({
      state: 'accepted',
      imageId,
      jobId: job.id,
      image: null,
      job: null,
    });
  });
  it('cancels before acceptance while retaining concrete cleanup responsibility and accepted result IDs', () => {
    const { db } = fixture;
    const submission = createSubmission(db, input('r'));
    const first = submission.sessions[0];
    const secondSubmission = createSubmission(db, input('second'));
    const second = secondSubmission.sessions[0];
    db.update(uploadSessions)
      .set({ state: 'receiving', temporaryKey: `uploads/${first.id}.partial` })
      .where(eq(uploadSessions.id, first.id))
      .run();
    expect(cancelSession(db, first.id)).toMatchObject({
      state: 'cancelled',
      cleanupStatus: 'pending',
      temporaryKey: `uploads/${first.id}.partial`,
    });
    db.update(uploadSessions)
      .set({
        state: 'accepted',
        imageId: 'historical-image',
        jobId: 'historical-job',
      })
      .where(eq(uploadSessions.id, second.id))
      .run();
    expect(() => cancelSession(db, second.id)).toThrow(
      expect.objectContaining({ status: 409, imageId: 'historical-image' }),
    );
    expect(getSubmission(db, secondSubmission.id).sessions[0]).toMatchObject({
      state: 'accepted',
      imageId: 'historical-image',
      jobId: 'historical-job',
      image: null,
      job: null,
    });
  });
});
