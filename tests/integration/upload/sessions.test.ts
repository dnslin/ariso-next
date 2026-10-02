import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collectionFixture } from '../collections/helpers.ts';
import {
  createAlbum,
  getOrCreateTags,
} from '../../../src/server/collections/records.ts';
import { patchUploadSettings } from '../../../src/server/upload/settings.ts';
import { submissionResult } from '../../../src/server/upload/http.ts';
import {
  expireUploadSessions,
  purgeUploadResults,
} from '../../../src/server/upload/cleanup.ts';
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
  sessionStates,
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
  it('purges full terminal submissions exactly at the 24-hour boundary while retaining newer results', () => {
    const { db } = fixture;
    const now = new Date('2026-10-02T12:00:00.000Z');
    const cutoff = new Date(now.getTime() - 86400000);
    const terminal = createSubmission(db, input('terminal', 4));
    const states = ['accepted', 'failed', 'cancelled', 'expired'] as const;
    for (const [index, session] of terminal.sessions.entries())
      db.update(uploadSessions)
        .set({ state: states[index], updatedAt: cutoff })
        .where(eq(uploadSessions.id, session.id))
        .run();
    const recent = createSubmission(db, input('recent', 2));
    for (const [index, session] of recent.sessions.entries())
      db.update(uploadSessions)
        .set({ state: 'failed', updatedAt: new Date(cutoff.getTime() + index) })
        .where(eq(uploadSessions.id, session.id))
        .run();
    purgeUploadResults(db, now);
    expect(
      db
        .select()
        .from(uploadSubmissions)
        .all()
        .map((row) => row.id),
    ).toEqual([recent.id]);
    expect(
      db
        .select()
        .from(uploadSessions)
        .all()
        .map((row) => row.id),
    ).toEqual(recent.sessions.map((session) => session.id));
    expect(() => getSubmission(db, terminal.id)).toThrow(
      expect.objectContaining({ code: 'UPLOAD_SUBMISSION_NOT_FOUND' }),
    );
  });

  it.each([
    { name: 'queued', values: { state: 'queued' as const } },
    { name: 'receiving', values: { state: 'receiving' as const } },
    { name: 'validating', values: { state: 'validating' as const } },
    { name: 'finalizing', values: { state: 'finalizing' as const } },
    { name: 'pending cleanup', values: { cleanupStatus: 'pending' as const } },
    { name: 'failed cleanup', values: { cleanupStatus: 'failed' as const } },
    {
      name: 'known temporary object',
      values: { temporaryKey: 'uploads/old/source' },
    },
    {
      name: 'known formal candidate',
      values: { finalKey: 'original/old.png' },
    },
    {
      name: 'known local temporary path',
      values: { temporaryPath: '/controlled/tmp/uploads/old/source' },
    },
  ])(
    'retains an entire old submission with $name responsibility',
    ({ values }) => {
      const { db } = fixture;
      const now = new Date();
      const submission = createSubmission(db, input('owned', 2));
      db.update(uploadSessions)
        .set({ state: 'failed', updatedAt: new Date(now.getTime() - 86400001) })
        .where(eq(uploadSessions.submissionId, submission.id))
        .run();
      db.update(uploadSessions)
        .set(values)
        .where(eq(uploadSessions.id, submission.sessions[1].id))
        .run();
      const before = getSubmission(db, submission.id);
      purgeUploadResults(db, now);
      expect(getSubmission(db, submission.id)).toEqual(before);
    },
  );

  it('purges accepted upload history without deleting the transferred media image, job, object or version', () => {
    const { db } = fixture;
    const imageId = fixture.image();
    const job = db
      .select()
      .from(mediaJobs)
      .where(eq(mediaJobs.imageId, imageId))
      .get()!;
    const submission = createSubmission(db, input('accepted'));
    db.update(uploadSessions)
      .set({
        state: 'accepted',
        imageId,
        jobId: job.id,
        updatedAt: new Date(Date.now() - 86400001),
      })
      .where(eq(uploadSessions.id, submission.sessions[0].id))
      .run();
    const before = {
      images: db.select().from(mediaImages).all(),
      jobs: db.select().from(mediaJobs).all(),
      objects: db.select().from(mediaObjects).all(),
      versions: db.select().from(mediaVersions).all(),
    };
    purgeUploadResults(db);
    expect(db.select().from(uploadSessions).all()).toEqual([]);
    expect(db.select().from(uploadSubmissions).all()).toEqual([]);
    expect({
      images: db.select().from(mediaImages).all(),
      jobs: db.select().from(mediaJobs).all(),
      objects: db.select().from(mediaObjects).all(),
      versions: db.select().from(mediaVersions).all(),
    }).toEqual(before);
  });

  it('splits 45 files into 20/20/5 with one settings and relationship snapshot despite later changes', () => {
    const { db, storage } = fixture;
    const album = db.transaction((tx) =>
      createAlbum(tx, { name: '固定相册' }),
    )!;
    const [tag] = db.transaction((tx) => getOrCreateTags(tx, ['固定标签']));
    db.update(mediaSettings)
      .set({ watermarkMode: 'text', watermarkText: '开始时水印' })
      .run();
    const data = {
      ...input('45-files', 45, 2 * 1024 * 1024),
      albumIds: [album.id],
      tagIds: [tag.id],
    };
    const first = createSubmission(db, data);
    expect(
      [0, 1, 2].map(
        (group) => first.sessions.filter((s) => s.groupIndex === group).length,
      ),
    ).toEqual([20, 20, 5]);
    patchUploadSettings(db, { maxFileMiB: 1, batchSize: 1, queueLimit: 100 });
    db.update(mediaSettings)
      .set({
        watermarkText: '后来水印',
        quality: 33,
        defaultVisibility: 'private',
      })
      .run();
    db.update(storageSettings).set({ defaultStorageId: null }).run();
    const frozen = getSubmission(db, first.id);
    expect(frozen).toMatchObject({
      storageId: storage.id,
      visibility: 'public',
      maxFileBytes: 50 * 1024 * 1024,
      batchSize: 20,
      queueLimit: 500,
      albumIds: [album.id],
      tagIds: [tag.id],
      snapshot: { quality: 82, watermarkText: '开始时水印' },
    });
    expect(createSubmission(db, data)).toEqual(frozen);
    expect(submissionResult(frozen)).toMatchObject({
      batchSize: 20,
      albumIds: [album.id],
      tagIds: [tag.id],
    });
    expect(() =>
      createSubmission(db, {
        ...data,
        requestId: 'new-files',
        storageId: storage.id,
      }),
    ).toThrowError(expect.objectContaining({ code: 'UPLOAD_FILE_TOO_LARGE' }));
    expect(
      createSubmission(db, {
        ...input('new-small-files', 2),
        storageId: storage.id,
      }),
    ).toMatchObject({
      visibility: 'private',
      batchSize: 1,
      maxFileBytes: 1024 * 1024,
      snapshot: { quality: 33, watermarkText: '后来水印' },
      albumIds: [],
      tagIds: [],
      sessions: [
        expect.objectContaining({ groupIndex: 0 }),
        expect.objectContaining({ groupIndex: 1 }),
      ],
    });
  });
  it('freezes one multi-file submission and assigns groups from its saved batch size', () => {
    const { db } = fixture;
    db.update(uploadSettings).set({ batchSize: 2 }).run();
    const first = createSubmission(db, input('multi', 5));
    expect(first.sessions.map((session) => session.groupIndex)).toEqual([
      0, 0, 1, 1, 2,
    ]);
    expect(
      new Set(first.sessions.map((session) => session.candidateImageId)).size,
    ).toBe(5);
    expect(
      first.sessions.every((session) => session.submissionId === first.id),
    ).toBe(true);
    db.update(mediaSettings).set({ quality: 33 }).run();
    db.update(uploadSettings).set({ batchSize: 1 }).run();
    expect(createSubmission(db, input('multi', 5))).toEqual(first);
    expect(getSubmission(db, first.id).snapshot.quality).toBe(82);
    expect(createSubmission(db, input('next', 2)).snapshot.quality).toBe(33);
  });

  it('enforces the current queue limit and cancels only the selected file in a multi-file submission', () => {
    const { db } = fixture;
    db.update(uploadSettings).set({ queueLimit: 2 }).run();
    expect(() => createSubmission(db, input('too-many', 3))).toThrowError(
      expect.objectContaining({ code: 'UPLOAD_QUEUE_LIMIT' }),
    );
    expect(db.select().from(uploadSubmissions).all()).toHaveLength(0);
    const submission = createSubmission(db, input('two', 2));
    cancelSession(db, submission.sessions[0].id);
    const result = getSubmission(db, submission.id);
    expect(result.sessions.map((session) => session.state)).toEqual([
      'cancelled',
      'queued',
    ]);
    expect(result.sessions[1].candidateImageId).toBe(
      submission.sessions[1].candidateImageId,
    );
  });

  it('expires idle pre-accept sessions with constant SQL count despite completed history', () => {
    const { db } = fixture;
    const now = new Date();
    const cutoff = new Date(now.getTime() - 3_600_000);
    const expected = new Map<string, string>();
    db.transaction((tx) => {
      for (const state of sessionStates) {
        const submission = createSubmission(tx, input(state));
        tx.update(uploadSubmissions)
          .set({ lastActivityAt: cutoff })
          .where(eq(uploadSubmissions.id, submission.id))
          .run();
        tx.update(uploadSessions)
          .set({ state })
          .where(eq(uploadSessions.id, submission.sessions[0].id))
          .run();
        expected.set(
          submission.sessions[0].id,
          ['queued', 'receiving', 'validating', 'finalizing'].includes(state)
            ? 'expired'
            : state,
        );
      }
      const recent = createSubmission(tx, input('recent'));
      tx.update(uploadSubmissions)
        .set({ lastActivityAt: new Date(cutoff.getTime() + 1) })
        .where(eq(uploadSubmissions.id, recent.id))
        .run();
      expected.set(recent.sessions[0].id, 'queued');
    });
    const queries: string[] = [];
    const observed = drizzle(db.$client, {
      logger: {
        logQuery(query) {
          queries.push(query);
        },
      },
    });
    expireUploadSessions(observed, now);
    expect(
      new Map(
        db
          .select()
          .from(uploadSessions)
          .all()
          .map((s) => [s.id, s.state]),
      ),
    ).toEqual(expected);
    const firstQueryCount = queries.length;
    const before = db.select().from(uploadSessions).all();
    db.transaction((tx) => {
      for (let i = 0; i < 200; i++) {
        const history = createSubmission(tx, input(`history-${i}`));
        tx.update(uploadSubmissions)
          .set({ lastActivityAt: cutoff })
          .where(eq(uploadSubmissions.id, history.id))
          .run();
        tx.update(uploadSessions)
          .set({ state: 'accepted' })
          .where(eq(uploadSessions.id, history.sessions[0].id))
          .run();
      }
    });
    queries.length = 0;
    expireUploadSessions(observed, now);
    // Bound database round trips, not machine-dependent execution time.
    expect(queries).toHaveLength(firstQueryCount);
    const after = db.select().from(uploadSessions).all();
    expect(after.filter((s) => expected.has(s.id))).toEqual(before);
    expect(
      after
        .filter((s) => !expected.has(s.id))
        .every((s) => s.state === 'accepted'),
    ).toBe(true);
  });

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
