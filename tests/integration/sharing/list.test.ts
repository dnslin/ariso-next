import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { setAlbumCover } from '../../../src/server/collections/cover.ts';
import { addMemberships } from '../../../src/server/collections/memberships.ts';
import { createAlbum } from '../../../src/server/collections/records.ts';
import {
  mediaImages,
  mediaObjects,
  mediaVersions,
} from '../../../src/server/media/schema.ts';
import {
  createShare,
  listShares,
  parseShareQuery,
  readOwnerShare,
} from '../../../src/server/sharing/configuration.ts';
import { initializeSiteSettings } from '../../../src/server/site/settings.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import { collectionFixture } from '../collections/helpers.ts';

let fixture: ReturnType<typeof collectionFixture>;
beforeEach(() => {
  fixture = collectionFixture();
  fixture.db.transaction((tx) =>
    initializeSiteSettings(tx, {
      publicUrl: 'https://images.example.test',
      timeZone: 'Asia/Shanghai',
    }),
  );
});
afterEach(() => fixture.close());
const query = (params: Record<string, string> = {}) =>
  parseShareQuery(new URLSearchParams(params));
function thumbnail(imageId: string) {
  const { db } = fixture;
  const now = new Date();
  db.insert(mediaObjects)
    .values({
      id: `${imageId}-thumbnail`,
      imageId,
      storageId: fixture.storage.id,
      key: `covers/${imageId}.webp`,
      purpose: 'thumbnail',
      status: 'stored',
      byteSize: 100,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  db.insert(mediaVersions)
    .values({
      imageId,
      kind: 'thumbnail',
      objectId: `${imageId}-thumbnail`,
      byteSize: 100,
      format: 'WEBP',
      mime: 'image/webp',
      width: 100,
      height: 80,
      createdAt: now,
    })
    .run();
}

it('lists live public counts and the selected cover placeholder without adding presentation fields to configuration responses', async () => {
  const { db } = fixture;
  const album = db.transaction((tx) => createAlbum(tx, { name: '分享封面' }));
  const empty = db.transaction((tx) => createAlbum(tx, { name: '空分享' }));
  const privateOnly = db.transaction((tx) =>
    createAlbum(tx, { name: '仅私有成员' }),
  );
  db.transaction((tx) => createAlbum(tx, { name: '尚未分享' }));
  const ids = [
    'selected',
    'ready',
    'processing',
    'failed',
    'private',
    'trashed',
    'deleting',
  ].map((id) => fixture.image(id));
  addMemberships(db, ids, { albumIds: [album.id], tagIds: [] });
  addMemberships(db, ['private'], { albumIds: [privateOnly.id], tagIds: [] });
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
  db.update(mediaImages)
    .set({ processingStatus: 'processing' })
    .where(eq(mediaImages.id, 'processing'))
    .run();
  db.update(mediaImages)
    .set({ processingStatus: 'failed' })
    .where(eq(mediaImages.id, 'failed'))
    .run();
  db.update(mediaImages)
    .set({ processingStatus: 'ready' })
    .where(eq(mediaImages.id, 'ready'))
    .run();
  thumbnail('ready');
  db.transaction((tx) => setAlbumCover(tx, album.id, 'selected'));
  const configured = await createShare(db, album.id);
  await createShare(db, empty.id);
  await createShare(db, privateOnly.id);
  const current = () =>
    listShares(db, query()).items.find((item) => item.albumId === album.id)!;
  expect(current()).toEqual({
    ...configured,
    publicImageCount: 4,
    cover: {
      imageId: 'selected',
      displayName: 'sample',
      status: 'processing',
      thumbnailUrl: null,
    },
  });
  expect(readOwnerShare(db, album.id)).toEqual(configured);
  expect(listShares(db, query()).total).toBe(3);
  for (const albumId of [empty.id, privateOnly.id])
    expect(
      listShares(db, query()).items.find((item) => item.albumId === albumId),
    ).toMatchObject({
      publicImageCount: 0,
      cover: {
        imageId: null,
        displayName: null,
        status: 'empty',
        thumbnailUrl: null,
      },
    });
  thumbnail('selected');
  for (const [processingStatus, status] of [
    ['failed', 'failed'],
    ['ready', 'ready'],
  ] as const) {
    db.update(mediaImages)
      .set({ processingStatus })
      .where(eq(mediaImages.id, 'selected'))
      .run();
    expect(current().cover).toEqual({
      imageId: 'selected',
      displayName: 'sample',
      status,
      thumbnailUrl: status === 'ready' ? '/i/selected?type=thumbnail' : null,
    });
  }
  db.update(storageConfigs).set({ enabled: false }).run();
  expect(current()).toMatchObject({
    publicImageCount: 4,
    cover: { imageId: 'selected', status: 'disabled', thumbnailUrl: null },
  });
  db.update(storageConfigs).set({ enabled: true }).run();
  db.update(mediaObjects)
    .set({ status: 'writing' })
    .where(eq(mediaObjects.id, 'selected-thumbnail'))
    .run();
  expect(current().cover).toEqual({
    imageId: 'selected',
    displayName: 'sample',
    status: 'missing',
    thumbnailUrl: null,
  });
  db.update(mediaImages)
    .set({ trashedAt: new Date() })
    .where(inArray(mediaImages.id, ['selected', 'ready']))
    .run();
  expect(current().publicImageCount).toBe(2);
});

it('keeps stable paging and reads only this page with a fixed number of metadata queries', async () => {
  const { db } = fixture;
  for (let index = 0; index < 85; index++) {
    const id = `cover-${String(index).padStart(3, '0')}`;
    fixture.image(id);
    thumbnail(id);
    db.update(mediaImages)
      .set({ processingStatus: 'ready' })
      .where(eq(mediaImages.id, id))
      .run();
    const album = db.transaction((tx) =>
      createAlbum(tx, { name: `相册-${id}` }),
    );
    addMemberships(db, [id], { albumIds: [album.id], tagIds: [] });
    await createShare(db, album.id);
  }
  const queries: string[] = [];
  const observed = drizzle(db.$client, {
    logger: {
      logQuery(statement) {
        queries.push(statement);
      },
    },
  });
  const small = listShares(observed, query({ pageSize: '20' }));
  const smallQueries = [...queries];
  queries.length = 0;
  const large = listShares(observed, query({ pageSize: '80' }));
  const largeQueries = [...queries];
  expect(small.items).toHaveLength(20);
  expect(large.items).toHaveLength(80);
  expect(small.total).toBe(85);
  expect(large.total).toBe(85);
  expect(large.items.slice(0, 20)).toEqual(small.items);
  expect(
    large.items.every(
      (item) => item.publicImageCount === 1 && item.cover.status === 'ready',
    ),
  ).toBe(true);
  expect(largeQueries.length).toBe(smallQueries.length);
  expect(
    largeQueries.filter((statement) => statement.startsWith('select')).length,
  ).toBeLessThanOrEqual(7);
  expect(
    largeQueries.every(
      (statement) =>
        !/\bmedia_jobs\b|^\s*(insert|update|delete)/i.test(statement),
    ),
  ).toBe(true);
  const last = listShares(db, query({ page: '2', pageSize: '80' }));
  expect(last.items).toHaveLength(5);
  expect(
    new Set([...large.items, ...last.items].map((item) => item.id)).size,
  ).toBe(85);
  expect(listShares(db, query({ q: small.items[0].albumName })).items).toEqual([
    small.items[0],
  ]);
  expect(listShares(db, query({ page: '99' }))).toEqual({
    items: [],
    total: 85,
    page: 99,
    pageSize: 40,
  });
});
