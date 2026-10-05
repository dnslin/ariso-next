import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { setAlbumCover } from '../../../src/server/collections/cover.ts';
import {
  addMemberships,
  removeMemberships,
} from '../../../src/server/collections/memberships.ts';
import {
  createAlbum,
  deleteAlbum,
} from '../../../src/server/collections/records.ts';
import { albumImages } from '../../../src/server/collections/schema.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaVersions,
} from '../../../src/server/media/schema.ts';
import { initializeSiteSettings } from '../../../src/server/site/settings.ts';
import {
  createShare,
  rotateShare,
  updateShare,
} from '../../../src/server/sharing/configuration.ts';
import { digestGrantSecret } from '../../../src/server/sharing/authorization.ts';
import {
  readPublicSharePage,
  refreshPublicShare,
} from '../../../src/server/sharing/public-query.ts';
import {
  albumShares,
  shareGrants,
} from '../../../src/server/sharing/schema.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import { collectionFixture } from '../collections/helpers.ts';

let fixture: ReturnType<typeof collectionFixture>;
let albumId: string;
let token: string;
const now = new Date('2026-10-06T00:00:00Z');

beforeEach(async () => {
  fixture = collectionFixture();
  fixture.db.transaction((tx) =>
    initializeSiteSettings(tx, {
      publicUrl: 'https://sharing.example.test',
      timeZone: 'Asia/Shanghai',
    }),
  );
  albumId = fixture.db.transaction((tx) =>
    createAlbum(tx, {
      name: '<共享相册>',
      description: '<script>plain text</script>',
    }),
  ).id;
  token = (await createShare(fixture.db, albumId)).token;
});
afterEach(() => fixture.close());

function image(id: string, joinedAt = now.getTime()) {
  fixture.image(id);
  addMemberships(fixture.db, [id], { albumIds: [albumId], tagIds: [] });
  fixture.db
    .update(albumImages)
    .set({ joinedAt: new Date(joinedAt) })
    .where(and(eq(albumImages.albumId, albumId), eq(albumImages.imageId, id)))
    .run();
  fixture.db
    .update(mediaImages)
    .set({
      width: 300,
      height: 200,
      displayName: `秘密名称-${id}`,
      processingStatus: 'ready',
    })
    .where(eq(mediaImages.id, id))
    .run();
  return id;
}
function thumbnail(id: string, objectStatus: 'stored' | 'writing' = 'stored') {
  fixture.db
    .insert(mediaObjects)
    .values({
      id: `thumbnail-${id}`,
      imageId: id,
      storageId: fixture.storage.id,
      key: `private-storage-key/${id}.webp`,
      purpose: 'thumbnail',
      status: objectStatus,
      byteSize: 10,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  fixture.db
    .insert(mediaVersions)
    .values({
      imageId: id,
      kind: 'thumbnail',
      objectId: `thumbnail-${id}`,
      width: 160,
      height: 80,
      byteSize: 10,
      format: 'WEBP',
      mime: 'image/webp',
      createdAt: now,
    })
    .run();
}
const page = (cursor: unknown = null, grantSecret?: string, time = now) =>
  readPublicSharePage(fixture.db, { token, grantSecret, now: time }, cursor);
const refresh = (ids: string[], grantSecret?: string, time = now) =>
  refreshPublicShare(fixture.db, { token, grantSecret, now: time }, { ids });
const idList = (count: number) =>
  Array.from(
    { length: count },
    (_, index) => `image-${String(index).padStart(3, '0')}`,
  );

it('filters private, recycled and deleting members before total and fixed 40-item pages; cursor only contains public IDs', () => {
  const ids = idList(85);
  for (const id of ids) image(id);
  for (const [id, patch] of [
    ['private', { visibility: 'private' }],
    ['trash', { trashedAt: now }],
    ['deleting', { deletionStatus: 'deleting' }],
  ] as const) {
    image(id, now.getTime() + 1);
    fixture.db
      .update(mediaImages)
      .set(patch)
      .where(eq(mediaImages.id, id))
      .run();
  }
  const first = page();
  expect(first).toMatchObject({
    total: 85,
    albumName: '<共享相册>',
    description: '<script>plain text</script>',
    hasMore: true,
    nextCursor: ids[39],
  });
  const second = page(first.nextCursor);
  const third = page(second.nextCursor);
  expect(first.items.map((item) => item.imageId)).toEqual(ids.slice(0, 40));
  expect(second.items.map((item) => item.imageId)).toEqual(ids.slice(40, 80));
  expect(third.items.map((item) => item.imageId)).toEqual(ids.slice(80));
  expect(third).toMatchObject({ hasMore: false, nextCursor: null, total: 85 });
  expect(page(ids.at(-1)).items).toEqual([]);
  for (const item of [...first.items, first.cover!]) {
    expect(Object.keys(item).sort()).toEqual([
      'aspectRatio',
      'imageId',
      'status',
      'thumbnailUrl',
    ]);
    expect(item.aspectRatio).toBe(1.5);
  }
  const json = JSON.stringify(first);
  for (const forbidden of [
    'private',
    'trash',
    'deleting',
    'displayName',
    '秘密名称',
    'originalName',
    'storageId',
    'byteSize',
    'width',
    'height',
    'createdAt',
    'joinedAt',
    'passwordHash',
  ])
    expect(json).not.toContain(forbidden);
});

it('orders by joinedAt descending then ID ascending and resolves an anchor from only the current public set', () => {
  for (const [id, joinedAt] of [
    ['z', 2],
    ['b', 3],
    ['a', 3],
    ['old', 1],
  ] as const)
    image(id, joinedAt);
  expect(page().items.map((item) => item.imageId)).toEqual([
    'a',
    'b',
    'z',
    'old',
  ]);
  expect(page('a').items.map((item) => item.imageId)).toEqual([
    'b',
    'z',
    'old',
  ]);
  for (const id of ['missing', 'private', 'trashed', 'deleting', 'removed']) {
    if (id !== 'missing') image(id);
    if (id === 'private')
      fixture.db
        .update(mediaImages)
        .set({ visibility: 'private' })
        .where(eq(mediaImages.id, id))
        .run();
    if (id === 'trashed')
      fixture.db
        .update(mediaImages)
        .set({ trashedAt: now })
        .where(eq(mediaImages.id, id))
        .run();
    if (id === 'deleting')
      fixture.db
        .update(mediaImages)
        .set({ deletionStatus: 'deleting' })
        .where(eq(mediaImages.id, id))
        .run();
    if (id === 'removed')
      removeMemberships(fixture.db, [id], { albumIds: [albumId], tagIds: [] });
    expect(() => page(id)).toThrowError(
      expect.objectContaining({ code: 'SHARING_CURSOR_INVALID', status: 409 }),
    );
  }
  for (const params of [
    'cursor=a&cursor=b',
    'pageSize=80',
    'owner=true',
    'cursor=',
  ])
    expect(() => page(new URLSearchParams(params))).toThrowError(
      expect.objectContaining({ status: 400 }),
    );
});

it('keeps pending, processing, first failures and disabled storage in place without granting links; ready reprocessing failure stays readable', () => {
  const ids = [
    'pending',
    'processing',
    'failed',
    'ready',
    'missing',
    'writing',
  ];
  for (const id of ids) image(id);
  for (const id of ids.filter((id) => id !== 'missing'))
    thumbnail(id, id === 'writing' ? 'writing' : 'stored');
  for (const processingStatus of ['pending', 'processing', 'failed'] as const)
    fixture.db
      .update(mediaImages)
      .set({ processingStatus })
      .where(eq(mediaImages.id, processingStatus))
      .run();
  fixture.db
    .update(mediaJobs)
    .set({ status: 'failed', error: 'PRIVATE TOOL FAILURE GPS' })
    .where(eq(mediaJobs.imageId, 'ready'))
    .run();
  const result = refresh(ids);
  expect(
    result.items.map((item) => [item.imageId, item.status, item.thumbnailUrl]),
  ).toEqual([
    ['pending', 'processing', null],
    ['processing', 'processing', null],
    ['failed', 'failed', null],
    ['ready', 'ready', '/i/ready?type=thumbnail'],
    ['missing', 'missing', null],
    ['writing', 'missing', null],
  ]);
  expect(result.items[3].aspectRatio).toBe(2);
  expect(JSON.stringify(result)).not.toContain('PRIVATE');
  fixture.db.update(storageConfigs).set({ enabled: false }).run();
  expect(refresh(['ready']).items[0]).toMatchObject({
    imageId: 'ready',
    status: 'disabled',
    thumbnailUrl: null,
  });
  fixture.db.update(storageConfigs).set({ enabled: true }).run();
  fixture.db
    .update(mediaImages)
    .set({ processingStatus: 'ready' })
    .where(eq(mediaImages.id, 'processing'))
    .run();
  expect(
    refresh(['ready', 'processing']).items.map((item) => item.status),
  ).toEqual(['ready', 'ready']);
});

it('honors manual cover identity through failed delivery and temporary privacy fallback; never skips to a readable image', () => {
  image('manual', 1);
  thumbnail('manual');
  image('latest', 2);
  thumbnail('latest');
  fixture.db.transaction((tx) => setAlbumCover(tx, albumId, 'manual'));
  fixture.db
    .update(mediaImages)
    .set({ processingStatus: 'failed' })
    .where(eq(mediaImages.id, 'manual'))
    .run();
  expect(page().cover).toMatchObject({
    imageId: 'manual',
    status: 'failed',
    thumbnailUrl: null,
  });
  fixture.db
    .update(mediaImages)
    .set({ visibility: 'private' })
    .where(eq(mediaImages.id, 'manual'))
    .run();
  expect(page().cover?.imageId).toBe('latest');
  fixture.db
    .update(mediaImages)
    .set({ visibility: 'public', processingStatus: 'ready' })
    .where(eq(mediaImages.id, 'manual'))
    .run();
  expect(page().cover).toMatchObject({ imageId: 'manual', status: 'ready' });
  removeMemberships(fixture.db, ['manual'], {
    albumIds: [albumId],
    tagIds: [],
  });
  expect(page().cover?.imageId).toBe('latest');
  fixture.db.update(mediaImages).set({ visibility: 'private' }).run();
  expect(page()).toMatchObject({ total: 0, items: [], cover: null });
});

it('refreshes at most 80 IDs, preserves requested order, strips names after policy changes and treats all excluded IDs alike', async () => {
  const ids = idList(80);
  for (const id of ids) image(id);
  await updateShare(fixture.db, albumId, { showName: true, layout: 'masonry' });
  expect(refresh(ids).items[0].displayName).toBe(`秘密名称-${ids[0]}`);
  await updateShare(fixture.db, albumId, { showName: false, layout: 'grid' });
  expect(refresh(ids)).toMatchObject({ layout: 'grid', showName: false });
  expect(JSON.stringify(refresh(ids))).not.toContain('displayName');
  fixture.db
    .update(mediaImages)
    .set({ visibility: 'private' })
    .where(eq(mediaImages.id, ids[0]))
    .run();
  fixture.db
    .update(mediaImages)
    .set({ trashedAt: now })
    .where(eq(mediaImages.id, ids[1]))
    .run();
  fixture.db
    .update(mediaImages)
    .set({ deletionStatus: 'deleting' })
    .where(eq(mediaImages.id, ids[2]))
    .run();
  removeMemberships(fixture.db, [ids[3]], { albumIds: [albumId], tagIds: [] });
  expect(refresh(['missing', ...ids.slice(0, 4)]).items).toEqual([]);
  expect(
    refresh([ids[7], ids[5], ids[7]]).items.map((item) => item.imageId),
  ).toEqual([ids[7], ids[5]]);
  expect(refresh([]).items).toEqual([]);
  expect(() => refresh([...ids, 'extra'])).toThrowError(
    expect.objectContaining({ status: 400 }),
  );
});

it('checks the same fixed grant and current lifecycle before any anonymous album read', async () => {
  image('public');
  const share = await updateShare(fixture.db, albumId, {
    password: { action: 'set', value: 'pass' },
  });
  const secret = 'independent-random-grant';
  fixture.db
    .insert(shareGrants)
    .values({
      shareId: share.id,
      grantSecretHash: digestGrantSecret(secret),
      authRevision: fixture.db
        .select()
        .from(albumShares)
        .where(eq(albumShares.id, share.id))
        .get()!.authRevision,
      verifiedAt: now,
      expiresAt: new Date(now.getTime() + 86400000),
    })
    .run();
  for (const read of [() => page(), () => refresh(['public'])])
    expect(read).toThrowError(expect.objectContaining({ status: 401 }));
  expect(page(null, secret).items).toHaveLength(1);
  const before = fixture.db.select().from(shareGrants).all();
  expect(refresh(['public'], secret).items).toHaveLength(1);
  expect(fixture.db.select().from(shareGrants).all()).toEqual(before);
  expect(() =>
    page(null, secret, new Date(now.getTime() + 86400000)),
  ).toThrowError(expect.objectContaining({ status: 401 }));
  await updateShare(fixture.db, albumId, { enabled: false });
  expect(() => page(null, secret)).toThrowError(
    expect.objectContaining({ status: 410 }),
  );
  await updateShare(fixture.db, albumId, { enabled: true });
  expect(() => page(null, secret)).toThrowError(
    expect.objectContaining({ status: 401 }),
  );
  await rotateShare(fixture.db, albumId);
  expect(() => page(null, secret)).toThrowError(
    expect.objectContaining({ status: 404 }),
  );
  fixture.db.transaction((tx) => deleteAlbum(tx, albumId));
  expect(() => refresh(['public'], secret)).toThrowError(
    expect.objectContaining({ status: 404 }),
  );
  expect(fixture.db.select().from(mediaImages).all()).toHaveLength(1);
});
