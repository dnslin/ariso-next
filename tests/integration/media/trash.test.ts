import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { trashImage, restoreImage } from '../../../src/server/media/trash.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaVersions,
} from '../../../src/server/media/schema.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import {
  createAlbum,
  deleteAlbum,
  deleteTag,
  getOrCreateTags,
} from '../../../src/server/collections/records.ts';
import { addMemberships } from '../../../src/server/collections/memberships.ts';
import {
  albumImages,
  imageTags,
} from '../../../src/server/collections/schema.ts';
import { collectionFixture } from '../collections/helpers.ts';

let fixture: ReturnType<typeof collectionFixture>;
beforeEach(() => {
  fixture = collectionFixture();
});
afterEach(() => fixture.close());

it.each(['pending', 'processing', 'ready', 'failed'] as const)(
  'only changes trash state for %s images, preserving content and idempotency',
  (processingStatus) => {
    const { db } = fixture;
    const id = fixture.image();
    db.update(mediaImages)
      .set({ processingStatus, visibility: 'private' })
      .where(eq(mediaImages.id, id))
      .run();
    const snapshot = () => ({
      image: db.select().from(mediaImages).get()!,
      objects: db.select().from(mediaObjects).all(),
      versions: db.select().from(mediaVersions).all(),
      jobs: db.select().from(mediaJobs).all(),
    });
    const before = snapshot();
    expect(restoreImage(db, id)).toEqual({ imageId: id, trashedAt: null });
    const result = trashImage(db, id);
    expect(result.trashedAt).toBeInstanceOf(Date);
    expect(snapshot()).toEqual({
      ...before,
      image: { ...before.image, trashedAt: result.trashedAt },
    });
    // A no-op must not issue another UPDATE, even when the clock has advanced.
    db.$client.exec(
      "CREATE TRIGGER reject_update BEFORE UPDATE ON media_images BEGIN SELECT RAISE(ABORT, 'unexpected update'); END",
    );
    expect(trashImage(db, id)).toEqual(result);
    db.$client.exec('DROP TRIGGER reject_update');
    expect(restoreImage(db, id)).toEqual({ imageId: id, trashedAt: null });
    db.$client.exec(
      "CREATE TRIGGER reject_update BEFORE UPDATE ON media_images BEGIN SELECT RAISE(ABORT, 'unexpected update'); END",
    );
    expect(restoreImage(db, id)).toEqual({ imageId: id, trashedAt: null });
    expect(snapshot()).toEqual(before);
  },
);

it('preserves surviving relations and join times on disabled storage without rebuilding deleted targets', () => {
  const { db } = fixture;
  const id = fixture.image();
  const { keep, remove, keepTag, removeTag } = db.transaction((tx) => {
    const keep = createAlbum(tx, { name: 'keep' });
    const remove = createAlbum(tx, { name: 'remove' });
    const [keepTag, removeTag] = getOrCreateTags(tx, ['keep', 'remove']);
    return { keep, remove, keepTag, removeTag };
  });
  addMemberships(db, [id], {
    albumIds: [keep.id, remove.id],
    tagIds: [keepTag.id, removeTag.id],
  });
  const memberships = db.select().from(albumImages).all();
  const tagMemberships = db.select().from(imageTags).all();
  db.update(storageConfigs).set({ enabled: false }).run();
  trashImage(db, id);
  expect(db.select().from(albumImages).all()).toEqual(memberships);
  expect(db.select().from(imageTags).all()).toEqual(tagMemberships);
  db.transaction((tx) => {
    deleteAlbum(tx, remove.id);
    deleteTag(tx, removeTag.id);
    createAlbum(tx, { name: 'remove' });
    getOrCreateTags(tx, ['remove']);
  });
  restoreImage(db, id);
  expect(db.select().from(albumImages).all()).toEqual(
    memberships.filter((row) => row.albumId === keep.id),
  );
  expect(db.select().from(imageTags).all()).toEqual(
    tagMemberships.filter((row) => row.tagId === keepTag.id),
  );
  expect(db.select().from(storageConfigs).get()!.enabled).toBe(false);
});

it.each(['deleting', 'cleanup_failed'] as const)(
  'rejects both mutations after %s without changing state',
  (deletionStatus) => {
    const { db } = fixture;
    const id = fixture.image();
    trashImage(db, id);
    db.update(mediaImages)
      .set({ deletionStatus })
      .where(eq(mediaImages.id, id))
      .run();
    const before = db.select().from(mediaImages).get();
    for (const operation of [trashImage, restoreImage]) {
      expect(() => operation(db, id)).toThrow(
        expect.objectContaining({
          code: 'MEDIA_DELETION_STARTED',
          status: 409,
        }),
      );
      expect(db.select().from(mediaImages).get()).toEqual(before);
    }
  },
);

it('distinguishes missing images and propagates database failures with state intact', () => {
  const { db } = fixture;
  for (const operation of [trashImage, restoreImage])
    expect(() => operation(db, 'missing')).toThrow(
      expect.objectContaining({ code: 'MEDIA_IMAGE_NOT_FOUND', status: 404 }),
    );
  const id = fixture.image();
  const before = db.select().from(mediaImages).get();
  db.$client.exec(
    "CREATE TRIGGER reject_update BEFORE UPDATE ON media_images BEGIN SELECT RAISE(ABORT, 'injected failure'); END",
  );
  expect(() => trashImage(db, id)).toThrow();
  expect(db.select().from(mediaImages).get()).toEqual(before);
});
