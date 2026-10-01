import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  albums,
  albumImages,
  imageTags,
  tags,
} from '../../../src/server/collections/schema.ts';
import { readLibrarySelection } from '../../../src/server/library/selection.ts';
import {
  mediaImages,
  mediaObjects,
  mediaVersions,
} from '../../../src/server/media/schema.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import { createProductionFixture } from '../../experiments/library/production-fixture.ts';

let directory: string;
let connection: ReturnType<typeof createProductionFixture>;
const read = (ids: string[], query = '') =>
  readLibrarySelection(connection.db, { ids, query });
function seed(
  id: string,
  values: Partial<typeof mediaImages.$inferInsert> = {},
) {
  connection.db
    .insert(mediaImages)
    .values({
      id,
      storageId: 'storage-0',
      originalName: `${id}.png`,
      displayName: id,
      visibility: 'private',
      format: 'PNG',
      mime: 'image/png',
      byteSize: 100,
      processingStatus: 'ready',
      createdAt: new Date(1000),
      updatedAt: new Date(1000),
      ...values,
    })
    .run();
}
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'ariso-library-selection-'));
  connection = createProductionFixture(join(directory, 'ariso.db'), 0);
});
afterEach(() => {
  connection.close();
  rmSync(directory, { recursive: true, force: true });
});

it('returns only requested IDs still matching all filters and current album/tag membership', () => {
  for (const id of [
    'match-both',
    'match-one',
    'wrong-tag',
    'outside-album',
    'unrequested',
  ]) {
    seed(id, {
      displayName: 'Travel',
      originalName: `${id}.heic`,
      storageId: 'storage-3',
      visibility: 'public',
      format: 'HEIC',
      createdAt: new Date(2000),
    });
    if (id !== 'outside-album')
      connection.db
        .insert(albumImages)
        .values({ albumId: 'album-0', imageId: id, joinedAt: new Date(1000) })
        .run();
    if (id !== 'wrong-tag')
      connection.db
        .insert(imageTags)
        .values({ imageId: id, tagId: 'tag-1' })
        .run();
  }
  connection.db
    .insert(imageTags)
    .values({ imageId: 'match-both', tagId: 'tag-2' })
    .run();
  seed('end', {
    displayName: 'Travel',
    format: 'HEIC',
    createdAt: new Date(3000),
  });
  const query = new URLSearchParams({
    scope: 'album',
    albumId: 'album-0',
    q: ' travel ',
    storageId: 'storage-3',
    visibility: 'public',
    format: 'heif',
    status: 'ready',
    uploadedFrom: new Date(2000).toISOString(),
    uploadedBefore: new Date(3000).toISOString(),
    tagId: 'tag-1',
    pageSize: '20',
  });
  query.append('tagId', 'tag-2');
  const requested = [
    'match-one',
    'missing',
    'match-both',
    'match-one',
    'wrong-tag',
    'outside-album',
    'end',
  ];
  expect(
    read(requested, query.toString()).items.map((item) => item.id),
  ).toEqual(['match-one', 'match-both']);
  connection.db
    .delete(albumImages)
    .where(
      and(
        eq(albumImages.albumId, 'album-0'),
        eq(albumImages.imageId, 'match-one'),
      ),
    )
    .run();
  connection.db
    .delete(imageTags)
    .where(eq(imageTags.imageId, 'match-both'))
    .run();
  expect(read(requested, query.toString())).toEqual({ items: [] });
});

it('drops recycled, deleting, removed and changed records while disabled storage remains valid', () => {
  for (const id of [
    'normal',
    'disabled',
    'recycled',
    'deleting',
    'removed',
    'changed',
  ])
    seed(id);
  connection.db
    .update(mediaImages)
    .set({ trashedAt: new Date(2000) })
    .where(eq(mediaImages.id, 'recycled'))
    .run();
  connection.db
    .update(mediaImages)
    .set({ deletionStatus: 'deleting' })
    .where(eq(mediaImages.id, 'deleting'))
    .run();
  connection.db.delete(mediaImages).where(eq(mediaImages.id, 'removed')).run();
  connection.db
    .update(mediaImages)
    .set({ visibility: 'public' })
    .where(eq(mediaImages.id, 'changed'))
    .run();
  connection.db
    .update(mediaImages)
    .set({ storageId: 'storage-3' })
    .where(eq(mediaImages.id, 'disabled'))
    .run();
  const result = read(
    ['disabled', 'normal', 'recycled', 'deleting', 'removed', 'changed'],
    'visibility=private',
  );
  expect(result.items.map((item) => item.id)).toEqual(['disabled', 'normal']);
  expect(result.items[0]).toEqual({
    id: 'disabled',
    displayName: 'disabled',
    storage: { id: 'storage-3', name: 'Storage 3', enabled: false },
    thumbnailUrl: null,
  });
});

it('returns a thumbnail URL only for a saved thumbnail on enabled storage, without leaking object keys', () => {
  seed('thumbnail');
  seed('no-thumbnail');
  connection.db
    .insert(mediaObjects)
    .values({
      id: 'thumb-object',
      imageId: 'thumbnail',
      storageId: 'storage-0',
      key: 'private-thumb-key',
      purpose: 'thumbnail',
      status: 'stored',
      byteSize: 10,
      format: 'WEBP',
      mime: 'image/webp',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();
  connection.db
    .insert(mediaVersions)
    .values({
      imageId: 'thumbnail',
      kind: 'thumbnail',
      objectId: 'thumb-object',
      byteSize: 10,
      format: 'WEBP',
      mime: 'image/webp',
      createdAt: new Date(),
    })
    .run();
  expect(
    read(['thumbnail', 'no-thumbnail']).items.map((item) => item.thumbnailUrl),
  ).toEqual(['/i/thumbnail?type=thumbnail', null]);
  expect(Object.keys(read(['thumbnail']).items[0]).sort()).toEqual([
    'displayName',
    'id',
    'storage',
    'thumbnailUrl',
  ]);
  connection.db
    .update(mediaObjects)
    .set({ status: 'cleanup_pending' })
    .where(eq(mediaObjects.id, 'thumb-object'))
    .run();
  expect(read(['thumbnail']).items[0].thumbnailUrl).toBeNull();
  connection.db
    .update(mediaObjects)
    .set({ status: 'stored' })
    .where(eq(mediaObjects.id, 'thumb-object'))
    .run();
  connection.db
    .update(storageConfigs)
    .set({ enabled: false })
    .where(eq(storageConfigs.id, 'storage-0'))
    .run();
  expect(read(['thumbnail']).items[0]).toMatchObject({
    thumbnailUrl: null,
    storage: { enabled: false },
  });
  expect(JSON.stringify(read(['thumbnail']))).not.toContain(
    'private-thumb-key',
  );
});

it.each([
  'albumId=missing',
  'scope=album&albumId=missing',
  'tagId=missing',
  'storageId=missing',
])(
  'reports stale filter references rather than silently returning an empty list: %s',
  (query) => {
    seed('image');
    expect(() => read(['image'], query)).toThrow(
      expect.objectContaining({ code: 'LIBRARY_STALE_REFERENCE', status: 409 }),
    );
  },
);

it('does not retarget removed collections to replacements with the same name', () => {
  seed('image');
  connection.db.delete(albums).where(eq(albums.id, 'album-0')).run();
  connection.db.delete(tags).where(eq(tags.id, 'tag-0')).run();
  connection.db
    .insert(albums)
    .values({
      id: 'replacement',
      name: 'Album 0',
      description: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();
  expect(() => read(['image'], 'albumId=album-0')).toThrow(
    expect.objectContaining({ code: 'LIBRARY_STALE_REFERENCE' }),
  );
  expect(() => read(['image'], 'tagId=tag-0')).toThrow(
    expect.objectContaining({ code: 'LIBRARY_STALE_REFERENCE' }),
  );
});

it('accepts at most 200 explicit selections, preserves requested order, and rejects unknown or page-dependent input', () => {
  const ids = Array.from({ length: 200 }, (_, i) => `image-${i}`);
  for (const id of ids) seed(id);
  const requested = [...ids].reverse();
  expect(read(requested).items.map((item) => item.id)).toEqual(requested);
  for (const input of [
    { ids: [], query: '' },
    { ids: [...ids, 'extra'], query: '' },
    { ids: [''], query: '' },
    { ids: ['image-1'] },
    { ids: ['image-1'], query: {} },
    { ids: ['image-1'], query: '', extra: true },
    ...[
      'page=1',
      'cursor=abc',
      'scope=trash',
      'pageSize=200',
      'unknown=1',
      'uploadedFrom=invalid',
      'scope=album',
      'q=a&q=b',
    ].map((query) => ({ ids: ['image-1'], query })),
  ]) {
    expect(() => readLibrarySelection(connection.db, input)).toThrow(
      expect.objectContaining({ code: 'LIBRARY_INVALID_QUERY', status: 400 }),
    );
  }
});
