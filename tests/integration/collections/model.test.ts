import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAlbum,
  getOrCreateTags,
  deleteAlbum,
  deleteTag,
  countAlbums,
} from '../../../src/server/collections/records.ts';
import {
  addMemberships,
  removeMemberships,
  prepareUploadSelection,
} from '../../../src/server/collections/memberships.ts';
import { readAlbumMembers } from '../../../src/server/collections/queries.ts';
import {
  albums,
  albumImages,
  tags,
  imageTags,
} from '../../../src/server/collections/schema.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaVersions,
} from '../../../src/server/media/schema.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import { samples } from '../../experiments/collections/unicode.ts';
import { collectionFixture } from './helpers.ts';

let fixture: ReturnType<typeof collectionFixture>;
beforeEach(() => {
  fixture = collectionFixture();
});
afterEach(() => {
  vi.useRealTimers();
  fixture.close();
});

describe('T-COL-01 records and memberships', () => {
  it('keeps same-name albums distinct and matches Unicode keys without rewriting first display form', () => {
    const { db } = fixture;
    const first = db.transaction((tx) => createAlbum(tx, { name: ' 旅行 ' }));
    const second = db.transaction((tx) => createAlbum(tx, { name: '旅行' }));
    expect(first.id).not.toBe(second.id);
    expect(first.name).toBe(second.name);
    expect(db.transaction(countAlbums)).toBe(2);
    const expected = new Map<string, { id: string; displayName: string }>();
    for (const [name, displayName, key] of samples) {
      const [actual] = db.transaction((tx) => getOrCreateTags(tx, [name]));
      expect(actual.normalizedKey).toBe(key);
      if (expected.has(key)) expect(actual).toMatchObject(expected.get(key)!);
      else {
        expect(actual.displayName).toBe(displayName);
        expected.set(key, actual);
      }
    }
    expect(db.select().from(tags).all()).toHaveLength(expected.size);
    const selected = db.transaction((tx) =>
      prepareUploadSelection(tx, {
        albumIds: [first.id, second.id, first.id],
        tagNames: ['Go', 'GO'],
      }),
    );
    expect(selected.albumIds).toEqual([first.id, second.id]);
    expect(selected.tagIds).toHaveLength(1);
    expect(Object.isFrozen(selected.albumIds)).toBe(true);
  });

  it('enforces production tag uniqueness and exposes real database failures', () => {
    const { db } = fixture;
    const [tag] = db.transaction((tx) => getOrCreateTags(tx, ['Go']));
    expect(() =>
      db
        .insert(tags)
        .values({ ...tag, id: 'duplicate' })
        .run(),
    ).toThrow();
    db.$client.exec(
      "CREATE TRIGGER reject_tag BEFORE INSERT ON tags BEGIN SELECT RAISE(ABORT, 'write rejected'); END",
    );
    expect(() =>
      db.transaction((tx) => getOrCreateTags(tx, ['new'])),
    ).toThrow();
    expect(db.select().from(tags).all()).toEqual([tag]);
  });

  it('preserves joinedAt on duplicate add, changes it after removal, and isolates albums', () => {
    const { db } = fixture;
    const [a, b] = db.transaction((tx) => [
      createAlbum(tx, { name: '旅行' }),
      createAlbum(tx, { name: '旅行' }),
    ]);
    const imageId = fixture.image();
    const selection = { albumIds: [a.id, b.id], tagIds: [] };
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    expect(addMemberships(db, [imageId], selection)[0]).toMatchObject({
      status: 'success',
      albums: [{ status: 'added' }, { status: 'added' }],
    });
    const original = db.select().from(albumImages).all();
    vi.setSystemTime(new Date('2026-01-02T00:00:00Z'));
    expect(addMemberships(db, [imageId], selection)[0]).toMatchObject({
      albums: [{ status: 'existing' }, { status: 'existing' }],
    });
    expect(db.select().from(albumImages).all()).toEqual(original);
    db.update(albums)
      .set({ preferredCoverImageId: imageId })
      .where(eq(albums.id, a.id))
      .run();
    expect(
      removeMemberships(db, [imageId], { albumIds: [a.id], tagIds: [] })[0],
    ).toMatchObject({ albums: [{ status: 'removed' }] });
    expect(
      removeMemberships(db, [imageId], { albumIds: [a.id], tagIds: [] })[0],
    ).toMatchObject({ albums: [{ status: 'absent' }] });
    addMemberships(db, [imageId], selection);
    expect(
      db.select().from(albums).where(eq(albums.id, a.id)).get()!
        .preferredCoverImageId,
    ).toBeNull();
    expect(
      db.select().from(albumImages).where(eq(albumImages.albumId, a.id)).get()!
        .joinedAt,
    ).toEqual(new Date());
    expect(
      db.select().from(albumImages).where(eq(albumImages.albumId, b.id)).get()!
        .joinedAt,
    ).toEqual(original[0].joinedAt);
    expect(db.select().from(mediaImages).all()).toHaveLength(1);
    expect(db.select().from(mediaObjects).all()).toHaveLength(1);
  });

  it('returns per-image results and rolls back all targets when any target is missing', () => {
    const { db } = fixture;
    const selection = db.transaction((tx) => {
      const album = createAlbum(tx, { name: '目标' });
      return prepareUploadSelection(tx, {
        albumIds: [album.id],
        tagNames: ['Go', '旅行'],
      });
    });
    const valid = fixture.image();
    const trash = fixture.image();
    const deleting = fixture.image();
    db.update(mediaImages)
      .set({ trashedAt: new Date() })
      .where(eq(mediaImages.id, trash))
      .run();
    db.update(mediaImages)
      .set({ deletionStatus: 'deleting' })
      .where(eq(mediaImages.id, deleting))
      .run();
    const results = addMemberships(
      db,
      [valid, trash, deleting, 'missing-image'],
      selection,
    );
    expect(results.map((r) => r.status)).toEqual([
      'success',
      'error',
      'error',
      'error',
    ]);
    expect(results.slice(1)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'COLLECTION_IMAGE_UNAVAILABLE' }),
      ]),
    );
    const other = fixture.image();
    expect(
      addMemberships(db, [other], {
        ...selection,
        tagIds: [...selection.tagIds, 'missing-tag'],
      })[0],
    ).toMatchObject({ status: 'error', code: 'COLLECTION_TARGET_NOT_FOUND' });
    expect(
      db.select().from(albumImages).where(eq(albumImages.imageId, other)).all(),
    ).toEqual([]);
    expect(
      db.select().from(imageTags).where(eq(imageTags.imageId, other)).all(),
    ).toEqual([]);
    expect(removeMemberships(db, [trash], selection)[0]).toMatchObject({
      code: 'COLLECTION_IMAGE_UNAVAILABLE',
    });
    db.$client.exec(
      "CREATE TRIGGER fail_membership BEFORE INSERT ON image_tags BEGIN SELECT RAISE(ABORT, 'disk-like failure'); END",
    );
    expect(addMemberships(db, [other], selection)[0]).toMatchObject({
      status: 'error',
      code: 'COLLECTION_DATABASE_ERROR',
      cause: expect.any(Error),
    });
    expect(
      db.select().from(albumImages).where(eq(albumImages.imageId, other)).all(),
    ).toEqual([]);
  });

  it('reports a middle database failure with its cause while committing other images independently', () => {
    const { db } = fixture;
    const selection = db.transaction((tx) => {
      const album = createAlbum(tx, { name: 'batch' });
      return prepareUploadSelection(tx, {
        albumIds: [album.id],
        tagNames: ['Go'],
      });
    });
    const imageIds = ['first', 'failing', 'last'].map((id) =>
      fixture.image(id),
    );
    db.$client.exec(
      "CREATE TRIGGER fail_one BEFORE INSERT ON image_tags WHEN NEW.image_id = 'failing' BEGIN SELECT RAISE(ABORT, 'specific failure'); END",
    );
    const results = addMemberships(db, imageIds, selection);
    expect(results.map((row) => row.status)).toEqual([
      'success',
      'error',
      'success',
    ]);
    expect(results[1]).toMatchObject({
      imageId: 'failing',
      code: 'COLLECTION_DATABASE_ERROR',
      cause: expect.objectContaining({
        code: 'SQLITE_CONSTRAINT_TRIGGER',
        message: 'specific failure',
      }),
    });
    expect(
      db
        .select()
        .from(albumImages)
        .all()
        .map((r) => r.imageId)
        .sort(),
    ).toEqual(['first', 'last']);
    expect(
      db
        .select()
        .from(imageTags)
        .all()
        .map((r) => r.imageId)
        .sort(),
    ).toEqual(['first', 'last']);
    db.$client.exec(
      "CREATE TRIGGER fail_remove BEFORE DELETE ON image_tags WHEN OLD.image_id = 'first' BEGIN SELECT RAISE(ABORT, 'remove failure'); END",
    );
    const removed = removeMemberships(db, ['first', 'last'], selection);
    expect(removed.map((row) => row.status)).toEqual(['error', 'success']);
    expect(
      db
        .select()
        .from(albumImages)
        .all()
        .map((r) => r.imageId),
    ).toEqual(['first']);
    expect(
      db
        .select()
        .from(imageTags)
        .all()
        .map((r) => r.imageId),
    ).toEqual(['first']);
  });

  it('keeps metadata editable for private/failed/pending/processing images and disabled storage', () => {
    const { db } = fixture;
    const selection = db.transaction((tx) =>
      prepareUploadSelection(tx, { tagNames: ['Go'] }),
    );
    const imageIds = ['pending', 'processing', 'failed', 'ready'].map(
      (status) => {
        const id = fixture.image();
        db.update(mediaImages)
          .set({
            visibility: 'private',
            processingStatus: status as
              'pending' | 'processing' | 'failed' | 'ready',
          })
          .where(eq(mediaImages.id, id))
          .run();
        return id;
      },
    );
    db.update(storageConfigs)
      .set({ enabled: false })
      .where(eq(storageConfigs.id, fixture.storage.id))
      .run();
    expect(
      addMemberships(db, imageIds, selection).every(
        (r) => r.status === 'success',
      ),
    ).toBe(true);
    expect(
      removeMemberships(db, imageIds, selection).every(
        (r) => r.status === 'success',
      ),
    ).toBe(true);
  });

  it('uses foreign keys for hidden relation cleanup without deleting assets, and SET NULL on final image deletion', () => {
    const { db } = fixture;
    const [a, b] = db.transaction((tx) => [
      createAlbum(tx, { name: 'A' }),
      createAlbum(tx, { name: 'B' }),
    ]);
    const selection = db.transaction((tx) =>
      prepareUploadSelection(tx, { albumIds: [a.id, b.id], tagNames: ['Go'] }),
    );
    const imageId = fixture.image();
    addMemberships(db, [imageId], selection);
    db.update(albums).set({ preferredCoverImageId: imageId }).run();
    const joined = db
      .select()
      .from(albumImages)
      .where(eq(albumImages.albumId, b.id))
      .get()!.joinedAt;
    db.update(mediaImages)
      .set({ trashedAt: new Date() })
      .where(eq(mediaImages.id, imageId))
      .run();
    db.transaction((tx) => {
      deleteAlbum(tx, a.id);
      deleteTag(tx, selection.tagIds[0]);
    });
    expect(db.select().from(mediaImages).all()).toHaveLength(1);
    expect(db.select().from(mediaObjects).all()).toHaveLength(1);
    expect(db.select().from(mediaJobs).all()).toHaveLength(1);
    expect(db.select().from(imageTags).all()).toEqual([]);
    db.update(mediaImages)
      .set({ trashedAt: null })
      .where(eq(mediaImages.id, imageId))
      .run();
    expect(db.select().from(albumImages).all()).toEqual([
      { albumId: b.id, imageId, joinedAt: joined },
    ]);
    const recreated = db.transaction((tx) =>
      prepareUploadSelection(tx, { tagNames: ['GO'] }),
    );
    expect(recreated.tagIds).not.toEqual(selection.tagIds);
    expect(db.select().from(imageTags).all()).toEqual([]);
    expect(() =>
      db
        .insert(albumImages)
        .values({ albumId: a.id, imageId, joinedAt: new Date() })
        .run(),
    ).toThrow();
    expect(() =>
      db
        .insert(imageTags)
        .values({ imageId: 'missing', tagId: recreated.tagIds[0] })
        .run(),
    ).toThrow();
    // Final deletion order belongs to media; prove collection FK effects with real rows.
    db.transaction((tx) => {
      tx.delete(mediaVersions).run();
      tx.delete(mediaObjects).run();
      tx.delete(mediaJobs).run();
      tx.delete(mediaImages).run();
    });
    expect(db.select().from(albumImages).all()).toEqual([]);
    expect(
      db.select().from(albums).where(eq(albums.id, b.id)).get()!
        .preferredCoverImageId,
    ).toBeNull();
  });

  it('filters before count and paging, orders equal timestamps by image ID, and preserves order through processing/trash/restore', () => {
    const { db } = fixture;
    const album = db.transaction((tx) => createAlbum(tx, { name: 'order' }));
    const selected = { albumIds: [album.id], tagIds: [] };
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01'));
    for (let i = 44; i >= 0; i--) {
      const id = fixture.image(`image-${String(i).padStart(2, '0')}`);
      addMemberships(db, [id], selected);
    }
    const read = (scope: 'normal' | 'public', page = 1) =>
      db.transaction((tx) =>
        readAlbumMembers(tx, album.id, { scope, page, pageSize: 20 }),
      );
    expect(read('normal').items.map((r) => r.image.id)).toEqual(
      Array.from(
        { length: 20 },
        (_, i) => `image-${String(i).padStart(2, '0')}`,
      ),
    );
    expect(read('normal', 2).items[0].image.id).toBe('image-20');
    db.update(mediaImages)
      .set({ visibility: 'private' })
      .where(eq(mediaImages.id, 'image-00'))
      .run();
    db.update(mediaImages)
      .set({ trashedAt: new Date() })
      .where(eq(mediaImages.id, 'image-01'))
      .run();
    db.update(mediaImages)
      .set({ deletionStatus: 'cleanup_failed' })
      .where(eq(mediaImages.id, 'image-02'))
      .run();
    expect(read('normal').total).toBe(43);
    expect(read('public').total).toBe(42);
    expect(read('public').items[0].image.id).toBe('image-03');
    db.update(mediaImages)
      .set({ processingStatus: 'failed' })
      .where(eq(mediaImages.id, 'image-03'))
      .run();
    expect(read('public').items[0].image.processingStatus).toBe('failed');
    db.update(mediaImages)
      .set({ trashedAt: null })
      .where(eq(mediaImages.id, 'image-01'))
      .run();
    expect(read('normal').items[1].image.id).toBe('image-01');
    vi.setSystemTime(new Date('2026-01-02'));
    removeMemberships(db, ['image-44'], selected);
    addMemberships(db, ['image-44'], selected);
    expect(read('normal').items[0].image.id).toBe('image-44');
    expect(read('normal', 9).items).toEqual([]);
    expect(() =>
      db.transaction((tx) =>
        readAlbumMembers(tx, 'absent', { scope: 'normal' }),
      ),
    ).toThrow();
    expect(
      db
        .select()
        .from(albumImages)
        .where(
          and(
            eq(albumImages.albumId, album.id),
            eq(albumImages.imageId, 'image-01'),
          ),
        )
        .get()!.joinedAt,
    ).toEqual(new Date('2026-01-01'));
  });
});
