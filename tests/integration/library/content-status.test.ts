import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { collectionFixture } from '../collections/helpers.ts';
import { initializeSiteSettings } from '../../../src/server/site/settings.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaVersions,
} from '../../../src/server/media/schema.ts';
import { readLibraryDetail } from '../../../src/server/library/detail.ts';
import {
  readLibraryPage,
  readLibraryStatus,
} from '../../../src/server/library/queries.ts';
import {
  hasActiveDetailTask,
  detailStatusChanged,
} from '../../../src/components/library/read-detail-status.ts';

let app: ReturnType<typeof collectionFixture>;
let originalJob: typeof mediaJobs.$inferSelect;
beforeEach(() => {
  app = collectionFixture();
  app.db.transaction((tx) =>
    initializeSiteSettings(tx, {
      publicUrl: 'https://images.example.test',
      timeZone: 'Asia/Shanghai',
    }),
  );
  app.image('image');
  app.db
    .update(mediaImages)
    .set({ processingStatus: 'ready', classification: 'static' })
    .where(eq(mediaImages.id, 'image'))
    .run();
  app.db.update(mediaJobs).set({ status: 'succeeded', step: 'complete' }).run();
  originalJob = app.db.select().from(mediaJobs).get()!;
  app.db
    .insert(mediaJobs)
    .values({
      ...originalJob,
      id: 'prior-process-failure',
      status: 'failed',
      error: '旧重处理失败',
      createdAt: new Date(0),
    })
    .run();
});
afterEach(() => app.close());
const records = () => [
  readLibraryDetail(app.db, 'image'),
  readLibraryPage(app.db).items[0],
  readLibraryStatus(app.db, { ids: ['image'] }).items[0],
];

it.each(['replace', 'size'] as const)(
  'exposes %s as active content work without changing process history',
  (kind) => {
    app.db
      .insert(mediaJobs)
      .values({
        ...originalJob,
        id: 'current-content-work',
        kind,
        status: 'queued',
        step: kind === 'replace' ? 'receiving' : 'size',
        expectedVersions: [],
      })
      .run();
    for (const record of records()) {
      expect(record.activeJob).toMatchObject({
        id: 'current-content-work',
        kind,
        status: 'queued',
      });
      expect(hasActiveDetailTask(record)).toBe(true);
      expect(record.processingJob?.id).toBe(originalJob.id);
      expect(record.latestFailedJob).toMatchObject({
        id: 'prior-process-failure',
        error: '旧重处理失败',
      });
    }
    const before = readLibraryDetail(app.db, 'image');
    app.db
      .update(mediaJobs)
      .set({ status: 'succeeded', step: 'complete' })
      .where(eq(mediaJobs.id, 'current-content-work'))
      .run();
    const after = readLibraryStatus(app.db, { ids: ['image'] }).items[0];
    expect(after.activeJob).toBeNull();
    expect(hasActiveDetailTask(after)).toBe(false);
    expect(detailStatusChanged(before, after)).toBe(true);
  },
);

it.each(['replace', 'size'] as const)(
  'keeps failed %s tasks out of process failure summaries',
  (kind) => {
    app.db
      .insert(mediaJobs)
      .values({
        ...originalJob,
        id: 'failed-content-work',
        kind,
        status: 'failed',
        error: '这不是重处理失败',
        createdAt: new Date(Date.now() + 1),
      })
      .run();
    for (const record of records()) {
      expect(record.activeJob).toBeNull();
      expect(record.processingJob?.id).toBe(originalJob.id);
      expect(record.latestFailedJob?.id).toBe('prior-process-failure');
    }
  },
);

it('changes the owner thumbnail URL when equal-size replacement bytes are published', () => {
  const now = new Date();
  function publish(objectId: string) {
    app.db
      .insert(mediaObjects)
      .values({
        id: objectId,
        imageId: 'image',
        storageId: app.storage.id,
        jobId: originalJob.id,
        key: `derived/${objectId}`,
        purpose: 'thumbnail',
        status: 'stored',
        byteSize: 10,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    app.db
      .insert(mediaVersions)
      .values({
        imageId: 'image',
        kind: 'thumbnail',
        objectId,
        width: 10,
        height: 10,
        byteSize: 10,
        format: 'WEBP',
        mime: 'image/webp',
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: [mediaVersions.imageId, mediaVersions.kind],
        set: { objectId },
      })
      .run();
  }
  publish('before');
  const old = readLibraryStatus(app.db, { ids: ['image'] }).items[0];
  publish('after');
  const current = readLibraryStatus(app.db, { ids: ['image'] }).items[0];
  expect(current.thumbnailUrl).not.toBe(old.thumbnailUrl);
  expect(
    new URL(
      current.thumbnailUrl!,
      'https://images.example.test',
    ).searchParams.get('v'),
  ).toBe('after');
  expect(
    app.db
      .select()
      .from(mediaVersions)
      .where(
        and(
          eq(mediaVersions.imageId, 'image'),
          eq(mediaVersions.kind, 'thumbnail'),
        ),
      )
      .get()?.objectId,
  ).toBe('after');
});
