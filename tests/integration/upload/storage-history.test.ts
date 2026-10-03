import { Readable } from 'node:stream';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { collectionFixture } from '../collections/helpers.ts';
import { cleanupSession } from '../../../src/server/upload/cleanup.ts';
import {
  createSubmission,
  cancelSession,
  getSession,
  getSubmission,
} from '../../../src/server/upload/sessions.ts';
import {
  uploadSessions,
  uploadSubmissions,
} from '../../../src/server/upload/schema.ts';
import {
  readUploadReferences,
  releaseStorageHistory,
} from '../../../src/server/upload/usage.ts';
import { writeObject } from '../../../src/server/storage/local.ts';
import {
  storageConfigs,
  storageSettings,
} from '../../../src/server/storage/schema.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaVersions,
} from '../../../src/server/media/schema.ts';

let fixture: ReturnType<typeof collectionFixture>;
beforeEach(() => {
  fixture = collectionFixture();
});
afterEach(() => {
  fixture.close();
});
const submission = (requestId = 'history', storageId = fixture.storage.id) =>
  createSubmission(fixture.db, {
    requestId,
    storageId,
    files: [
      { queueItemId: 'file', originalName: 'photo.png', declaredSize: 7 },
    ],
  });

it('真实取消后无对象责任的短期结果可释放，存储外键不再阻止空配置删除且邻近历史不动', () => {
  const { db, storage } = fixture;
  db.insert(storageConfigs)
    .values({
      ...storage,
      id: 'neighbor',
      name: 'neighbor',
      localPath: 'neighbor',
    })
    .run();
  const neighbor = submission('neighbor-result', 'neighbor');
  cancelSession(db, neighbor.sessions[0].id);
  const retained = getSubmission(db, neighbor.id);
  const cancelled = submission();
  cancelSession(db, cancelled.sessions[0].id);
  expect(readUploadReferences(db)).toEqual([]);
  releaseStorageHistory(db, storage.id);
  releaseStorageHistory(db, storage.id);
  expect(() => getSubmission(db, cancelled.id)).toThrow(
    expect.objectContaining({ code: 'UPLOAD_SUBMISSION_NOT_FOUND' }),
  );
  expect(getSubmission(db, neighbor.id)).toEqual(retained);
  db.update(storageSettings).set({ defaultStorageId: null }).run();
  expect(() =>
    db.delete(storageConfigs).where(eq(storageConfigs.id, storage.id)).run(),
  ).not.toThrow();
});

it.each([
  { state: 'queued' as const },
  { state: 'receiving' as const },
  { state: 'validating' as const },
  { state: 'finalizing' as const },
  { cleanupStatus: 'pending' as const },
  { cleanupStatus: 'failed' as const },
  { temporaryKey: 'uploads/known-source' },
  { finalKey: 'images/known-candidate' },
  { temporaryPath: '/controlled/tmp/known-file' },
])('活动或已知清理责任不被历史释放函数删除：%j', (values) => {
  const { db, storage } = fixture;
  const current = submission();
  db.update(uploadSessions)
    .set({ state: 'failed', ...values })
    .where(eq(uploadSessions.id, current.sessions[0].id))
    .run();
  const before = getSubmission(db, current.id);
  releaseStorageHistory(db, storage.id);
  expect(getSubmission(db, current.id)).toEqual(before);
  expect(readUploadReferences(db)).toHaveLength(1);
});

it('真实已知本地对象先取消并完成清理后才可释放历史', async () => {
  const { db, storage, storageRoot } = fixture;
  const current = submission();
  const id = current.sessions[0].id;
  const plan = {
    key: `uploads/${id}/source`,
    temporaryKey: `uploads/${id}/source.partial`,
  };
  await writeObject(storageRoot, storage, plan, Readable.from(['bytes']));
  db.update(uploadSessions)
    .set({ temporaryKey: plan.key })
    .where(eq(uploadSessions.id, id))
    .run();
  expect(cancelSession(db, id)).toMatchObject({
    state: 'cancelled',
    cleanupStatus: 'pending',
    temporaryKey: plan.key,
  });
  releaseStorageHistory(db, storage.id);
  expect(getSession(db, id).temporaryKey).toBe(plan.key);
  await cleanupSession({ db, storageRoot }, id);
  expect(getSession(db, id)).toMatchObject({
    temporaryKey: null,
    cleanupStatus: 'none',
  });
  releaseStorageHistory(db, storage.id);
  expect(db.select().from(uploadSessions).all()).toEqual([]);
  expect(db.select().from(uploadSubmissions).all()).toEqual([]);
});

it('accepted历史释放不删除已交接媒体、任务、对象或版本', () => {
  const { db, storage } = fixture;
  const imageId = fixture.image();
  const job = db
    .select()
    .from(mediaJobs)
    .where(eq(mediaJobs.imageId, imageId))
    .get()!;
  const current = submission();
  db.update(uploadSessions)
    .set({ state: 'accepted', imageId, jobId: job.id })
    .where(eq(uploadSessions.id, current.sessions[0].id))
    .run();
  const media = () => ({
    images: db.select().from(mediaImages).all(),
    jobs: db.select().from(mediaJobs).all(),
    objects: db.select().from(mediaObjects).all(),
    versions: db.select().from(mediaVersions).all(),
  });
  const before = media();
  releaseStorageHistory(db, storage.id);
  expect(db.select().from(uploadSessions).all()).toEqual([]);
  expect(db.select().from(uploadSubmissions).all()).toEqual([]);
  expect(media()).toEqual(before);
});

it('组合删除事务回滚时短期结果也回滚，不留下半次删除', () => {
  const { db, storage } = fixture;
  const current = submission();
  cancelSession(db, current.sessions[0].id);
  const before = getSubmission(db, current.id);
  expect(() =>
    db.transaction((tx) => {
      releaseStorageHistory(tx, storage.id);
      throw new Error('configuration deletion failed');
    }),
  ).toThrow('configuration deletion failed');
  expect(getSubmission(db, current.id)).toEqual(before);
});
