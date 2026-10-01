import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  resolveAlbumCover,
  resolveAlbumCovers,
  setAlbumCover,
} from '../../../src/server/collections/cover.ts';
import {
  addMemberships,
  removeMemberships,
} from '../../../src/server/collections/memberships.ts';
import { readAlbumMembers } from '../../../src/server/collections/queries.ts';
import { createAlbum } from '../../../src/server/collections/records.ts';
import { albums, albumImages } from '../../../src/server/collections/schema.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaVersions,
} from '../../../src/server/media/schema.ts';
import { restoreImage, trashImage } from '../../../src/server/media/trash.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import { collectionFixture } from './helpers.ts';

let fixture: ReturnType<typeof collectionFixture>;
beforeEach(() => {
  fixture = collectionFixture();
});
afterEach(() => fixture.close());

it('selects across all members after eligibility filtering with joinedAt descending and image ID ascending', () => {
  const { db } = fixture;
  const album = db.transaction((tx) => createAlbum(tx, { name: '跨页封面' }));
  for (let index = 0; index < 45; index++) {
    const id = fixture.image(`image-${String(index).padStart(2, '0')}`);
    db.update(mediaImages)
      .set({ visibility: index < 41 ? 'private' : 'public' })
      .where(eq(mediaImages.id, id))
      .run();
    db.insert(albumImages)
      .values({ albumId: album.id, imageId: id, joinedAt: new Date(1000) })
      .run();
  }
  const resolve = () => db.transaction((tx) => resolveAlbumCover(tx, album.id));
  expect(
    db
      .transaction((tx) =>
        readAlbumMembers(tx, album.id, { scope: 'normal', pageSize: 40 }),
      )
      .items.every((member) => member.image.visibility === 'private'),
  ).toBe(true);
  expect(resolve()).toEqual({
    imageId: 'image-41',
    mode: 'automatic',
    preferredCoverImageId: null,
    temporaryFallback: false,
  });
  db.update(albumImages)
    .set({ joinedAt: new Date(2000) })
    .where(
      and(
        eq(albumImages.albumId, album.id),
        eq(albumImages.imageId, 'image-44'),
      ),
    )
    .run();
  expect(resolve().imageId).toBe('image-44');
  trashImage(db, 'image-44');
  db.update(mediaImages)
    .set({ deletionStatus: 'cleanup_failed' })
    .where(eq(mediaImages.id, 'image-41'))
    .run();
  expect(resolve().imageId).toBe('image-42');
  db.update(mediaImages)
    .set({ deletionStatus: 'deleting' })
    .where(eq(mediaImages.id, 'image-42'))
    .run();
  expect(resolve().imageId).toBe('image-43');
});

it('retains a manual choice through private/trash fallback and restores it with its original membership time', () => {
  const { db } = fixture;
  const album = db.transaction((tx) => createAlbum(tx, { name: '恢复封面' }));
  const selected = { albumIds: [album.id], tagIds: [] };
  const manual = fixture.image('manual');
  const automatic = fixture.image('automatic');
  addMemberships(db, [manual, automatic], selected);
  db.update(albumImages)
    .set({ joinedAt: new Date(1000) })
    .where(eq(albumImages.imageId, manual))
    .run();
  db.update(albumImages)
    .set({ joinedAt: new Date(2000) })
    .where(eq(albumImages.imageId, automatic))
    .run();
  db.transaction((tx) => setAlbumCover(tx, album.id, manual), {
    behavior: 'immediate',
  });
  const joined = db.select().from(albumImages).all();
  const resolve = () => db.transaction((tx) => resolveAlbumCover(tx, album.id));
  expect(resolve()).toMatchObject({
    imageId: manual,
    mode: 'manual',
    temporaryFallback: false,
  });
  db.update(mediaImages)
    .set({ visibility: 'private' })
    .where(eq(mediaImages.id, manual))
    .run();
  expect(resolve()).toEqual({
    imageId: automatic,
    mode: 'automatic',
    preferredCoverImageId: manual,
    temporaryFallback: true,
  });
  trashImage(db, automatic);
  expect(resolve()).toEqual({
    imageId: null,
    mode: 'empty',
    preferredCoverImageId: manual,
    temporaryFallback: true,
  });
  restoreImage(db, automatic);
  db.update(mediaImages)
    .set({ visibility: 'public' })
    .where(eq(mediaImages.id, manual))
    .run();
  expect(resolve().mode).toBe('manual');
  trashImage(db, manual);
  expect(resolve().imageId).toBe(automatic);
  restoreImage(db, manual);
  expect(resolve()).toMatchObject({
    imageId: manual,
    mode: 'manual',
    temporaryFallback: false,
  });
  expect(db.select().from(albumImages).all()).toEqual(joined);
});

it('clears explicit manual choices on switch to automatic, removal and final image deletion', () => {
  const { db } = fixture;
  const album = db.transaction((tx) => createAlbum(tx, { name: '清空选择' }));
  const imageId = fixture.image('selected');
  const selection = { albumIds: [album.id], tagIds: [] };
  addMemberships(db, [imageId], selection);
  const set = (id: string | null) =>
    db.transaction((tx) => setAlbumCover(tx, album.id, id), {
      behavior: 'immediate',
    });
  const resolve = () => db.transaction((tx) => resolveAlbumCover(tx, album.id));
  set(imageId);
  set(null);
  expect(resolve()).toMatchObject({
    mode: 'automatic',
    preferredCoverImageId: null,
  });
  set(imageId);
  removeMemberships(db, [imageId], selection);
  addMemberships(db, [imageId], selection);
  expect(resolve()).toMatchObject({
    mode: 'automatic',
    preferredCoverImageId: null,
  });
  set(imageId);
  db.update(mediaImages)
    .set({ deletionStatus: 'deleting' })
    .where(eq(mediaImages.id, imageId))
    .run();
  expect(resolve()).toEqual({
    imageId: null,
    mode: 'empty',
    preferredCoverImageId: imageId,
    temporaryFallback: true,
  });
  db.transaction((tx) => {
    tx.delete(mediaVersions).where(eq(mediaVersions.imageId, imageId)).run();
    tx.delete(mediaObjects).where(eq(mediaObjects.imageId, imageId)).run();
    tx.delete(mediaJobs).where(eq(mediaJobs.imageId, imageId)).run();
    tx.delete(mediaImages).where(eq(mediaImages.id, imageId)).run();
  });
  expect(resolve()).toEqual({
    imageId: null,
    mode: 'empty',
    preferredCoverImageId: null,
    temporaryFallback: false,
  });
});

it.each(['pending', 'processing', 'failed', 'ready'] as const)(
  'keeps %s identity selected despite disabled storage without copying objects',
  (processingStatus) => {
    const { db } = fixture;
    const album = db.transaction((tx) =>
      createAlbum(tx, { name: '状态不改变身份' }),
    );
    const first = fixture.image('first');
    const next = fixture.image('next');
    addMemberships(db, [first, next], { albumIds: [album.id], tagIds: [] });
    db.update(albumImages)
      .set({ joinedAt: new Date(1000) })
      .run();
    db.update(mediaImages)
      .set({ processingStatus })
      .where(eq(mediaImages.id, first))
      .run();
    db.update(mediaImages)
      .set({ processingStatus: 'ready' })
      .where(eq(mediaImages.id, next))
      .run();
    db.update(storageConfigs).set({ enabled: false }).run();
    const objects = db.select().from(mediaObjects).all();
    const jobs = db.select().from(mediaJobs).all();
    expect(
      db.transaction((tx) => resolveAlbumCover(tx, album.id)),
    ).toMatchObject({ imageId: first, mode: 'automatic' });
    db.transaction((tx) => setAlbumCover(tx, album.id, first), {
      behavior: 'immediate',
    });
    expect(
      db.transaction((tx) => resolveAlbumCover(tx, album.id)),
    ).toMatchObject({ imageId: first, mode: 'manual' });
    expect(db.select().from(mediaObjects).all()).toEqual(objects);
    expect(db.select().from(mediaJobs).all()).toEqual(jobs);
  },
);

it('rejects nonmembers and members that become private, recycled or deleting before submission without overwriting the existing choice', () => {
  const { db } = fixture;
  const album = db.transaction((tx) => createAlbum(tx, { name: '资格重查' }));
  const valid = fixture.image('valid');
  const target = fixture.image('target');
  fixture.image('outside');
  addMemberships(db, [valid, target], { albumIds: [album.id], tagIds: [] });
  const set = (id: string | null) =>
    db.transaction((tx) => setAlbumCover(tx, album.id, id), {
      behavior: 'immediate',
    });
  set(valid);
  for (const id of ['missing', 'outside'])
    expect(() => set(id)).toThrow(
      expect.objectContaining({ code: 'COLLECTION_IMAGE_UNAVAILABLE' }),
    );
  for (const change of [
    { visibility: 'private' as const },
    { trashedAt: new Date() },
    { deletionStatus: 'deleting' as const },
  ]) {
    db.update(mediaImages)
      .set({
        visibility: 'public',
        trashedAt: null,
        deletionStatus: null,
        ...change,
      })
      .where(eq(mediaImages.id, target))
      .run();
    expect(() => set(target)).toThrow(
      expect.objectContaining({ code: 'COLLECTION_IMAGE_UNAVAILABLE' }),
    );
  }
  expect(db.transaction((tx) => resolveAlbumCover(tx, album.id))).toMatchObject(
    { imageId: valid, preferredCoverImageId: valid },
  );
  expect(() => set('')).toThrow(
    expect.objectContaining({ code: 'COLLECTION_INVALID_INPUT' }),
  );
  expect(() =>
    db.transaction((tx) => setAlbumCover(tx, 'missing', null)),
  ).toThrow(expect.objectContaining({ code: 'COLLECTION_TARGET_NOT_FOUND' }));
  expect(() =>
    db.transaction((tx) => resolveAlbumCover(tx, 'missing')),
  ).toThrow(expect.objectContaining({ code: 'COLLECTION_TARGET_NOT_FOUND' }));
});

it('exposes database write failures and preserves the existing choice', () => {
  const { db } = fixture;
  const album = db.transaction((tx) => createAlbum(tx, { name: '失败可诊断' }));
  const imageId = fixture.image();
  addMemberships(db, [imageId], { albumIds: [album.id], tagIds: [] });
  db.transaction((tx) => setAlbumCover(tx, album.id, imageId));
  db.$client.exec(
    "CREATE TRIGGER reject_cover BEFORE UPDATE ON albums BEGIN SELECT RAISE(ABORT, 'cover write rejected'); END",
  );
  expect(() =>
    db.transaction((tx) => setAlbumCover(tx, album.id, null)),
  ).toThrow();
  expect(
    db.select().from(albums).where(eq(albums.id, album.id)).get()!
      .preferredCoverImageId,
  ).toBe(imageId);
});

it('resolves multiple albums independently and includes empty albums without duplicating requested IDs', () => {
  const { db } = fixture;
  const [automatic, manual, empty] = db.transaction((tx) => [
    createAlbum(tx, { name: '自动' }),
    createAlbum(tx, { name: '手动' }),
    createAlbum(tx, { name: '空相册' }),
  ]);
  const first = fixture.image('first');
  const second = fixture.image('second');
  addMemberships(db, [first, second], {
    albumIds: [automatic.id, manual.id],
    tagIds: [],
  });
  db.update(albumImages)
    .set({ joinedAt: new Date(1000) })
    .run();
  db.transaction((tx) => setAlbumCover(tx, manual.id, second));
  const covers = db.transaction((tx) =>
    resolveAlbumCovers(tx, [automatic.id, manual.id, empty.id, manual.id]),
  );
  expect(covers.size).toBe(3);
  expect(covers.get(automatic.id)).toMatchObject({
    imageId: first,
    mode: 'automatic',
  });
  expect(covers.get(manual.id)).toMatchObject({
    imageId: second,
    mode: 'manual',
  });
  expect(covers.get(empty.id)).toEqual({
    imageId: null,
    mode: 'empty',
    preferredCoverImageId: null,
    temporaryFallback: false,
  });
  expect(db.transaction((tx) => resolveAlbumCovers(tx, []))).toEqual(new Map());
  expect(() =>
    db.transaction((tx) => resolveAlbumCovers(tx, [automatic.id, 'missing'])),
  ).toThrow(expect.objectContaining({ code: 'COLLECTION_TARGET_NOT_FOUND' }));
});
