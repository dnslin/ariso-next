import { eq } from 'drizzle-orm';
import { beforeEach, afterEach, expect, it } from 'vitest';
import { collectionFixture } from '../collections/helpers.ts';
import {
  createAlbum,
  getOrCreateTags,
} from '../../../src/server/collections/records.ts';
import { addMemberships } from '../../../src/server/collections/memberships.ts';
import {
  albums,
  albumImages,
  imageTags,
} from '../../../src/server/collections/schema.ts';
import {
  mediaImages,
  mediaObjects,
  mediaVersions,
  mediaJobs,
} from '../../../src/server/media/schema.ts';
import { updateImageFields } from '../../../src/server/media/image-fields.ts';
import { updateImageCollections } from '../../../src/server/library/image-collections.ts';
import { readLibraryDetail } from '../../../src/server/library/detail.ts';
import { siteSettings } from '../../../src/server/site/schema.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';

let fixture: ReturnType<typeof collectionFixture>;
beforeEach(() => {
  fixture = collectionFixture();
  fixture.db
    .insert(siteSettings)
    .values({
      publicUrl: 'https://example.test',
      timeZone: 'UTC',
      updatedAt: new Date(),
    })
    .run();
});
afterEach(() => fixture.close());

it('updates only display name and visibility, preserves original identity and makes equal-value edits a no-op', () => {
  const { db } = fixture;
  const id = fixture.image();
  const before = db.select().from(mediaImages).get()!;
  const objects = db.select().from(mediaObjects).all();
  const versions = db.select().from(mediaVersions).all();
  const jobs = db.select().from(mediaJobs).all();
  const name = `${'😀'.repeat(250)}.jpg`;
  expect(
    db.transaction((tx) =>
      updateImageFields(tx, id, {
        displayName: ` ${name} `,
        visibility: 'private',
      }),
    ),
  ).toEqual({ changed: true });
  const after = db.select().from(mediaImages).get()!;
  expect(after).toEqual({
    ...before,
    displayName: name,
    visibility: 'private',
    updatedAt: expect.any(Date),
  });
  expect(db.select().from(mediaObjects).all()).toEqual(objects);
  expect(db.select().from(mediaVersions).all()).toEqual(versions);
  expect(db.select().from(mediaJobs).all()).toEqual(jobs);
  expect(
    db.transaction((tx) =>
      updateImageFields(tx, id, { displayName: name, visibility: 'private' }),
    ),
  ).toEqual({ changed: false });
  expect(db.select().from(mediaImages).get()).toEqual(after);
});

it('rejects invalid names and unknown fields and permits field edits in every processing state with disabled storage', () => {
  const { db } = fixture;
  const id = fixture.image();
  const before = db.select().from(mediaImages).get()!;
  for (const patch of [
    {},
    { displayName: '' },
    { displayName: '  ' },
    { displayName: '😀'.repeat(256) },
    { displayName: '\nname' },
    { displayName: 'name\u0000' },
    { displayName: 'name\u2028' },
    { visibility: 'hidden' },
    { originalName: 'changed' },
  ])
    expect(() =>
      db.transaction((tx) => updateImageFields(tx, id, patch)),
    ).toThrow();
  expect(db.select().from(mediaImages).get()).toEqual(before);
  db.update(storageConfigs).set({ enabled: false }).run();
  for (const processingStatus of [
    'pending',
    'processing',
    'failed',
    'ready',
  ] as const) {
    db.update(mediaImages).set({ processingStatus }).run();
    db.transaction((tx) =>
      updateImageFields(tx, id, { displayName: processingStatus }),
    );
    expect(db.select().from(mediaImages).get()!.displayName).toBe(
      processingStatus,
    );
  }
  for (const patch of [
    { trashedAt: new Date() },
    { deletionStatus: 'deleting' as const },
    { deletionStatus: 'cleanup_failed' as const },
  ]) {
    db.update(mediaImages)
      .set({ trashedAt: null, deletionStatus: null, ...patch })
      .run();
    expect(() =>
      db.transaction((tx) =>
        updateImageFields(tx, id, { visibility: 'public' }),
      ),
    ).toThrow('仅允许读取');
  }
  expect(() =>
    db.transaction((tx) =>
      updateImageFields(tx, 'missing', { displayName: 'missing' }),
    ),
  ).toThrow('图片不存在');
});

it('replaces only provided relation dimensions, preserves surviving joined times and clears removed covers', () => {
  const { db } = fixture;
  const id = fixture.image();
  const [a, b, c] = db.transaction((tx) =>
    ['A', 'B', 'C'].map((name) => createAlbum(tx, { name })),
  );
  const [tag] = db.transaction((tx) => getOrCreateTags(tx, ['Tag']));
  addMemberships(db, [id], { albumIds: [a.id, b.id], tagIds: [tag.id] });
  db.update(albumImages)
    .set({ joinedAt: new Date(1000) })
    .run();
  db.update(albums).set({ preferredCoverImageId: id }).run();
  const before = db
    .select()
    .from(albumImages)
    .where(eq(albumImages.albumId, b.id))
    .get();
  const result = updateImageCollections(db, id, {
    albumIds: [b.id, c.id, c.id],
  });
  expect(result.albums.map((album) => album.id)).toEqual([b.id, c.id]);
  expect(result.tags).toEqual([{ id: tag.id, displayName: 'Tag' }]);
  expect(
    db.select().from(albumImages).where(eq(albumImages.albumId, b.id)).get(),
  ).toEqual(before);
  expect(
    db.select().from(albums).where(eq(albums.id, a.id)).get()!
      .preferredCoverImageId,
  ).toBeNull();
  expect(
    db.select().from(albums).where(eq(albums.id, b.id)).get()!
      .preferredCoverImageId,
  ).toBe(id);
  expect(updateImageCollections(db, id, { tagIds: [] }).tags).toEqual([]);
  expect(db.select().from(imageTags).all()).toEqual([]);
  expect(updateImageCollections(db, id, { albumIds: [] }).albums).toEqual([]);
});

it('rolls back an entire relation edit on removed targets, storage faults and read-only lifecycle states', () => {
  const { db } = fixture;
  const id = fixture.image();
  const [a, b] = db.transaction((tx) =>
    ['A', 'B'].map((name) => createAlbum(tx, { name })),
  );
  addMemberships(db, [id], { albumIds: [a.id], tagIds: [] });
  const before = db.select().from(albumImages).all();
  expect(() => updateImageCollections(db, 'missing', { albumIds: [] })).toThrow(
    '图片不存在',
  );
  expect(() =>
    updateImageCollections(db, id, { albumIds: [b.id], tagIds: ['removed'] }),
  ).toThrow('目标不存在');
  expect(db.select().from(albumImages).all()).toEqual(before);
  db.$client.exec(
    `CREATE TRIGGER reject_image_relation BEFORE DELETE ON album_images BEGIN SELECT RAISE(ABORT, 'injected remove failure'); END`,
  );
  expect(() => updateImageCollections(db, id, { albumIds: [b.id] })).toThrow(
    'injected remove failure',
  );
  expect(db.select().from(albumImages).all()).toEqual(before);
  db.$client.exec('DROP TRIGGER reject_image_relation');
  db.update(mediaImages).set({ trashedAt: new Date() }).run();
  expect(() => updateImageCollections(db, id, { albumIds: [] })).toThrow(
    '已回收',
  );
  expect(db.select().from(albumImages).all()).toEqual(before);
});

it('reports real processing scopes separately from storage, versions and metadata jobs', () => {
  const { db } = fixture;
  const id = fixture.image();
  db.update(mediaImages)
    .set({ processingStatus: 'ready', classification: 'static' })
    .run();
  db.update(mediaJobs).set({ status: 'succeeded' }).run();
  let detail = readLibraryDetail(db, id);
  expect(detail.actions.editUnavailableReason).toBeNull();
  expect(detail.reprocess.scopes.all).toBeNull();
  expect(detail.reprocess.scopes.watermark).toBe('对应处理开关已关闭');
  expect(detail.reprocess.expectedVersions).toEqual([
    'compressed',
    'thumbnail',
  ]);
  expect(detail.versions[0].status).toBe('saved');
  const job = db.select().from(mediaJobs).get()!;
  db.insert(mediaJobs)
    .values({
      ...job,
      id: 'metadata',
      kind: 'metadata',
      status: 'running',
      step: 'metadata',
    })
    .run();
  detail = readLibraryDetail(db, id);
  expect(detail.activeJob).toBeNull();
  expect(detail.metadataJob).toMatchObject({
    id: 'metadata',
    status: 'running',
  });
  expect(detail.reprocess.scopes.all).toBe('图片已有活动内容任务');
  expect(detail.actions.metadataReadUnavailableReason).toBeNull();
  db.update(storageConfigs).set({ enabled: false }).run();
  detail = readLibraryDetail(db, id);
  expect(detail.actions.editUnavailableReason).toBeNull();
  expect(detail.actions.metadataReadUnavailableReason).toBe('存储已停用');
  expect(detail.reprocess.scopes.all).toContain('存储已停用');
});
