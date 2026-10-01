import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  createTag,
  listTags,
  readTag,
  renameTag,
} from '../../../src/server/collections/tag-management.ts';
import { parseTagQuery } from '../../../src/server/collections/tag-query.ts';
import { deleteTag } from '../../../src/server/collections/records.ts';
import { addMemberships } from '../../../src/server/collections/memberships.ts';
import { tags, imageTags } from '../../../src/server/collections/schema.ts';
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

it('paginates in stable creation order and searches case-folded literal substrings', () => {
  const { db } = fixture;
  for (let index = 0; index < 85; index++)
    db.insert(tags)
      .values({
        id: `tag-${String(index).padStart(3, '0')}`,
        displayName: index === 0 ? 'Straße%_é' : `标签${index}`,
        normalizedKey: index === 0 ? 'strasse%_é' : `标签${index}`,
        createdAt: new Date(index === 84 ? 2000 : 1000),
        updatedAt: new Date(0),
      })
      .run();
  for (const pageSize of [20, 40, 80]) {
    const pages = Array.from({ length: Math.ceil(85 / pageSize) }, (_, index) =>
      listTags(
        db,
        parseTagQuery(
          new URLSearchParams({
            pageSize: String(pageSize),
            page: String(index + 1),
          }),
        ),
      ),
    );
    expect(pages.every((page) => page.total === 85)).toBe(true);
    expect(pages.flatMap((page) => page.items.map((row) => row.id))).toEqual([
      'tag-084',
      ...Array.from(
        { length: 84 },
        (_, index) => `tag-${String(index).padStart(3, '0')}`,
      ),
    ]);
  }
  expect(
    listTags(
      db,
      parseTagQuery(new URLSearchParams({ q: ' STRASSE%_e\u0301 ' })),
    ).items.map((row) => row.id),
  ).toEqual(['tag-000']);
  expect(
    listTags(db, parseTagQuery(new URLSearchParams({ page: '99' }))),
  ).toMatchObject({ items: [], total: 85 });
});

it('reuses the first display form, renames without replacing relations, and rejects conflicts', () => {
  const { db } = fixture;
  const created = db.transaction((tx) => createTag(tx, { name: ' Straße ' }));
  expect(created).toMatchObject({
    reused: false,
    tag: { displayName: 'Straße', imageCount: 0 },
  });
  expect(db.transaction((tx) => createTag(tx, { name: 'STRASSE' }))).toEqual({
    tag: created.tag,
    reused: true,
  });
  expect(
    db.transaction((tx) => renameTag(tx, created.tag.id, { name: 'STRASSE' })),
  ).toEqual({ tag: created.tag, changed: false });
  const imageId = fixture.image();
  addMemberships(db, [imageId], { albumIds: [], tagIds: [created.tag.id] });
  const renamed = db.transaction((tx) =>
    renameTag(tx, created.tag.id, { name: ' e\u0301 ' }),
  );
  expect(renamed).toMatchObject({
    changed: true,
    tag: { id: created.tag.id, displayName: 'é', imageCount: 1 },
  });
  const before = db
    .select()
    .from(tags)
    .where(eq(tags.id, created.tag.id))
    .get();
  const occupied = db.transaction((tx) => createTag(tx, { name: 'Go' }));
  expect(() =>
    db.transaction((tx) => renameTag(tx, created.tag.id, { name: 'GO' })),
  ).toThrow(expect.objectContaining({ code: 'COLLECTION_TAG_CONFLICT' }));
  expect(
    db.select().from(tags).where(eq(tags.id, created.tag.id)).get(),
  ).toEqual(before);
  expect(db.select().from(imageTags).all()).toEqual([
    { imageId, tagId: created.tag.id },
  ]);
  expect(db.transaction((tx) => readTag(tx, occupied.tag.id)).imageCount).toBe(
    0,
  );
  expect(() =>
    db.transaction((tx) => renameTag(tx, 'missing', { name: '有效' })),
  ).toThrow(expect.objectContaining({ code: 'COLLECTION_TARGET_NOT_FOUND' }));
  for (const name of [' ', 'x\n', 'x\0', 'a'.repeat(51)]) {
    expect(() => db.transaction((tx) => createTag(tx, { name }))).toThrow(
      expect.objectContaining({ code: 'COLLECTION_INVALID_INPUT' }),
    );
    expect(() =>
      db.transaction((tx) => renameTag(tx, created.tag.id, { name })),
    ).toThrow(expect.objectContaining({ code: 'COLLECTION_INVALID_INPUT' }));
  }
});

it('counts normal members and deletes all relations including trash without touching media', () => {
  const { db } = fixture;
  const { tag } = db.transaction((tx) => createTag(tx, { name: 'Go' }));
  const { tag: other } = db.transaction((tx) =>
    createTag(tx, { name: '其他' }),
  );
  const ids = ['normal', 'trash', 'deleting'].map((id) => fixture.image(id));
  addMemberships(db, ids, { albumIds: [], tagIds: [tag.id, other.id] });
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
  expect(db.transaction((tx) => readTag(tx, tag.id)).imageCount).toBe(1);
  expect(
    listTags(db, parseTagQuery(new URLSearchParams())).items.map(
      (item) => item.imageCount,
    ),
  ).toEqual([1, 1]);
  const before = {
    images: db.select().from(mediaImages).all(),
    jobs: db.select().from(mediaJobs).all(),
    objects: db.select().from(mediaObjects).all(),
  };
  expect(db.transaction((tx) => deleteTag(tx, tag.id))).toBe(true);
  expect(db.transaction((tx) => deleteTag(tx, tag.id))).toBe(false);
  expect(db.select().from(imageTags).all()).toHaveLength(3);
  expect(db.select().from(mediaImages).all()).toEqual(before.images);
  expect(db.select().from(mediaJobs).all()).toEqual(before.jobs);
  expect(db.select().from(mediaObjects).all()).toEqual(before.objects);
  db.update(mediaImages)
    .set({ trashedAt: null })
    .where(eq(mediaImages.id, 'trash'))
    .run();
  expect(db.transaction((tx) => readTag(tx, other.id)).imageCount).toBe(2);
  const recreated = db.transaction((tx) => createTag(tx, { name: 'Go' })).tag;
  expect(recreated.id).not.toBe(tag.id);
  expect(recreated.imageCount).toBe(0);
});
