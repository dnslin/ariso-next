import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  listAlbums,
  parseAlbumQuery,
  readAlbum,
} from '../../../src/server/collections/album-management.ts';
import {
  createAlbum,
  deleteAlbum,
  updateAlbum,
} from '../../../src/server/collections/records.ts';
import { addMemberships } from '../../../src/server/collections/memberships.ts';
import { albums, albumImages } from '../../../src/server/collections/schema.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
} from '../../../src/server/media/schema.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import { collectionFixture } from './helpers.ts';
let fixture: ReturnType<typeof collectionFixture>;
beforeEach(() => {
  fixture = collectionFixture();
});
afterEach(() => fixture.close());
it('paginates in stable creation order and searches normalized literal substrings', () => {
  const { db } = fixture;
  for (let index = 0; index < 85; index++)
    db.insert(albums)
      .values({
        id: `album-${String(index).padStart(3, '0')}`,
        name: index === 0 ? 'é%_相册' : '相册',
        description: '',
        createdAt: new Date(index === 84 ? 2000 : 1000),
        updatedAt: new Date(0),
      })
      .run();
  for (const pageSize of [20, 40, 80]) {
    const pages = Array.from({ length: Math.ceil(85 / pageSize) }, (_, index) =>
      listAlbums(
        db,
        parseAlbumQuery(
          new URLSearchParams({
            pageSize: String(pageSize),
            page: String(index + 1),
          }),
        ),
      ),
    );
    expect(pages.every((page) => page.total === 85)).toBe(true);
    expect(pages.flatMap((page) => page.items.map((row) => row.id))).toEqual([
      'album-084',
      ...Array.from(
        { length: 84 },
        (_, index) => `album-${String(index).padStart(3, '0')}`,
      ),
    ]);
  }
  expect(
    listAlbums(
      db,
      parseAlbumQuery(new URLSearchParams({ q: ' e\u0301%_ ' })),
    ).items.map((item) => item.id),
  ).toEqual(['album-000']);
  expect(
    listAlbums(db, parseAlbumQuery(new URLSearchParams({ page: '99' }))),
  ).toMatchObject({ items: [], total: 85 });
});
it('counts normal private/failed members even with disabled storage and deletes only organization records', () => {
  const { db } = fixture;
  const album = db.transaction((tx) =>
    createAlbum(tx, { name: ' 旅行 ', description: ' 注释 ' }),
  );
  const other = db.transaction((tx) => createAlbum(tx, { name: '旅行' }));
  const ids = ['normal', 'trash', 'deleting'].map((id) => fixture.image(id));
  addMemberships(db, ids, { albumIds: [album.id, other.id], tagIds: [] });
  db.update(mediaImages)
    .set({ visibility: 'private', processingStatus: 'failed' })
    .run();
  db.update(storageConfigs).set({ enabled: false }).run();
  db.update(mediaImages)
    .set({ trashedAt: new Date() })
    .where(eq(mediaImages.id, 'trash'))
    .run();
  db.update(mediaImages)
    .set({ deletionStatus: 'deleting' })
    .where(eq(mediaImages.id, 'deleting'))
    .run();
  expect(db.transaction((tx) => readAlbum(tx, album.id))).toMatchObject({
    name: '旅行',
    description: '注释',
    imageCount: 1,
  });
  db.transaction((tx) =>
    updateAlbum(tx, album.id, {
      name: ' e\u0301 ',
      description: ' 多行\n说明 ',
    }),
  );
  expect(db.transaction((tx) => readAlbum(tx, album.id))).toMatchObject({
    name: 'é',
    description: '多行\n说明',
    imageCount: 1,
  });
  expect(() =>
    db.transaction((tx) => updateAlbum(tx, album.id, { name: ' ' })),
  ).toThrow();
  expect(() =>
    db.transaction((tx) => updateAlbum(tx, 'missing', { name: '有效' })),
  ).toThrow('相册不存在');
  const before = {
    images: db.select().from(mediaImages).all(),
    jobs: db.select().from(mediaJobs).all(),
    objects: db.select().from(mediaObjects).all(),
  };
  expect(db.transaction((tx) => deleteAlbum(tx, album.id))).toBe(true);
  expect(db.select().from(albumImages).all()).toHaveLength(3);
  expect(db.select().from(mediaImages).all()).toEqual(before.images);
  expect(db.select().from(mediaJobs).all()).toEqual(before.jobs);
  expect(db.select().from(mediaObjects).all()).toEqual(before.objects);
  expect(() => db.transaction((tx) => readAlbum(tx, album.id))).toThrow(
    '相册不存在',
  );
  const recreated = db.transaction((tx) => createAlbum(tx, { name: 'é' }));
  expect(recreated.id).not.toBe(album.id);
  expect(db.transaction((tx) => readAlbum(tx, recreated.id)).imageCount).toBe(
    0,
  );
});
