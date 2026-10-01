import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  listOwnerAlbums,
  readOwnerAlbum,
} from '../../../src/server/library/album-covers.ts';
import { createAlbum } from '../../../src/server/collections/records.ts';
import { addMemberships } from '../../../src/server/collections/memberships.ts';
import { setAlbumCover } from '../../../src/server/collections/cover.ts';
import { parseAlbumQuery } from '../../../src/server/collections/album-management.ts';
import {
  mediaImages,
  mediaObjects,
  mediaVersions,
} from '../../../src/server/media/schema.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import { collectionFixture } from './helpers.ts';
let fixture: ReturnType<typeof collectionFixture>;
beforeEach(() => {
  fixture = collectionFixture();
});
afterEach(() => fixture.close());
it('keeps owner counts and cover identity while hiding thumbnails for failed processing and disabled storage', () => {
  const { db } = fixture;
  const album = db.transaction((tx) => createAlbum(tx, { name: '封面呈现' }));
  const ids = ['selected', 'private', 'trashed', 'deleting'].map((id) =>
    fixture.image(id),
  );
  addMemberships(db, ids, { albumIds: [album.id], tagIds: [] });
  db.update(mediaImages)
    .set({ visibility: 'private' })
    .where(eq(mediaImages.id, 'private'))
    .run();
  db.update(mediaImages)
    .set({ trashedAt: new Date() })
    .where(eq(mediaImages.id, 'trashed'))
    .run();
  db.update(mediaImages)
    .set({ deletionStatus: 'deleting' })
    .where(eq(mediaImages.id, 'deleting'))
    .run();
  db.transaction((tx) => setAlbumCover(tx, album.id, 'selected'));
  const now = new Date();
  for (const [kind, status] of [
    ['thumbnail', 'stored'],
    ['compressed', 'writing'],
  ] as const) {
    db.insert(mediaObjects)
      .values({
        id: `cover-${kind}`,
        imageId: 'selected',
        storageId: fixture.storage.id,
        key: `covers/${kind}.webp`,
        purpose: kind,
        status,
        byteSize: 100,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(mediaVersions)
      .values({
        imageId: 'selected',
        kind,
        objectId: `cover-${kind}`,
        byteSize: 100,
        format: 'WEBP',
        mime: 'image/webp',
        width: 100,
        height: 80,
        createdAt: now,
      })
      .run();
  }
  expect(
    db.transaction((tx) => readOwnerAlbum(tx, album.id)).cover.thumbnailUrl,
  ).toBeNull();
  for (const [processingStatus, status] of [
    ['pending', 'processing'],
    ['processing', 'processing'],
    ['failed', 'failed'],
    ['ready', 'ready'],
  ] as const) {
    db.update(mediaImages)
      .set({ processingStatus })
      .where(eq(mediaImages.id, 'selected'))
      .run();
    const current = db.transaction((tx) => readOwnerAlbum(tx, album.id));
    expect(current).toMatchObject({
      imageCount: 2,
      publicImageCount: 1,
      cover: {
        imageId: 'selected',
        mode: 'manual',
        status,
        thumbnailUrl: status === 'ready' ? '/i/selected?type=thumbnail' : null,
      },
    });
    expect(
      listOwnerAlbums(db, parseAlbumQuery(new URLSearchParams())).items,
    ).toEqual([current]);
  }
  db.update(storageConfigs).set({ enabled: false }).run();
  expect(
    db.transaction((tx) => readOwnerAlbum(tx, album.id)).cover,
  ).toMatchObject({
    imageId: 'selected',
    status: 'disabled',
    thumbnailUrl: null,
  });
  db.update(mediaImages)
    .set({ visibility: 'private' })
    .where(eq(mediaImages.id, 'selected'))
    .run();
  expect(db.transaction((tx) => readOwnerAlbum(tx, album.id))).toMatchObject({
    imageCount: 2,
    publicImageCount: 0,
    cover: {
      mode: 'empty',
      status: 'empty',
      preferredCoverImageId: 'selected',
      temporaryFallback: true,
      thumbnailUrl: null,
    },
  });
});
