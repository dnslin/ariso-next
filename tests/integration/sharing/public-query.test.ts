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
  type VersionKind,
} from '../../../src/server/media/schema.ts';
import { initializeSiteSettings } from '../../../src/server/site/settings.ts';
import {
  createShare,
  rotateShare,
  updateShare,
} from '../../../src/server/sharing/configuration.ts';
import { digestGrantSecret } from '../../../src/server/sharing/authorization.ts';
import {
  readPublicShareItems,
  readPublicSharePage,
  refreshPublicShare,
} from '../../../src/server/sharing/public-query.ts';
import {
  albumShares,
  shareGrants,
} from '../../../src/server/sharing/schema.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import type { PublicShareNeighbors } from '../../../src/server/sharing/public-types.ts';
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
function savedVersion(
  id: string,
  kind: VersionKind,
  mime = 'image/webp',
  status: 'stored' | 'writing' = 'stored',
) {
  fixture.db
    .insert(mediaObjects)
    .values({
      id: `${kind}-${id}`,
      imageId: id,
      storageId: fixture.storage.id,
      key: `private-storage-key/${kind}-${id}`,
      purpose: kind,
      status,
      byteSize: 10,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  fixture.db
    .insert(mediaVersions)
    .values({
      imageId: id,
      kind,
      objectId: `${kind}-${id}`,
      width: 300,
      height: 200,
      byteSize: 10,
      format: 'WEBP',
      mime,
      createdAt: now,
    })
    .run();
}
const page = (cursor: string | null = null, grantSecret?: string, time = now) =>
  readPublicSharePage(fixture.db, { token, grantSecret, now: time }, cursor);
const refresh = (ids: string[], grantSecret?: string, time = now) =>
  refreshPublicShare(fixture.db, { token, grantSecret, now: time }, { ids });
const idList = (count: number) =>
  Array.from(
    { length: count },
    (_, index) => `image-${String(index).padStart(3, '0')}`,
  );
const neighbors = (imageId: string, grantSecret?: string, time = now) =>
  readPublicShareItems(
    fixture.db,
    { token, grantSecret, now: time },
    new URLSearchParams({ imageId }),
  ) as PublicShareNeighbors;

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
  expect(page(ids.at(-1)!).items).toEqual([]);
  for (const item of [...first.items, first.cover!]) {
    expect(Object.keys(item).sort()).toEqual([
      'aspectRatio',
      'imageId',
      'previewUrl',
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

it('reads only the current public neighbors across page boundaries without wrapping and reports the public ordinal', () => {
  const ids = idList(85);
  for (const id of ids) image(id);
  expect(neighbors(ids[39])).toMatchObject({
    current: { imageId: ids[39], previewUrl: `/i/${ids[39]}?type=original` },
    previous: { imageId: ids[38] },
    next: { imageId: ids[40] },
    position: 40,
    total: 85,
    showName: false,
  });
  expect(neighbors(ids[0])).toMatchObject({
    current: { imageId: ids[0] },
    previous: null,
    next: { imageId: ids[1] },
    position: 1,
  });
  expect(neighbors(ids[84])).toMatchObject({
    current: { imageId: ids[84] },
    previous: { imageId: ids[83] },
    next: null,
    position: 85,
  });
  const body = JSON.stringify(neighbors(ids[39]));
  for (const forbidden of [
    'displayName',
    '秘密名称',
    'originalName',
    'storageId',
    'byteSize',
    'width',
    'height',
    'joinedAt',
    'versions',
    'classification',
    'mime',
  ])
    expect(body).not.toContain(forbidden);
});

it('uses joinedAt descending and IDs ascending for current neighbors and keeps unreadable public positions', () => {
  for (const [id, joinedAt] of [
    ['z', 2],
    ['b', 3],
    ['a', 3],
    ['old', 1],
  ] as const)
    image(id, joinedAt);
  fixture.db
    .update(mediaImages)
    .set({ processingStatus: 'failed' })
    .where(eq(mediaImages.id, 'b'))
    .run();
  expect(neighbors('b')).toMatchObject({
    current: { imageId: 'b', status: 'failed', previewUrl: null },
    previous: { imageId: 'a' },
    next: { imageId: 'z' },
    position: 2,
    total: 4,
  });
  fixture.db
    .update(mediaImages)
    .set({ visibility: 'private' })
    .where(eq(mediaImages.id, 'a'))
    .run();
  expect(neighbors('b')).toMatchObject({
    previous: null,
    position: 1,
    total: 3,
  });
});

it('publishes only existing displayable preview addresses with explicit versions and current processing/storage policy', () => {
  for (const id of [
    'static',
    'original-only',
    'animated',
    'svg',
    'container',
    'missing-preview',
    'writing',
    'unsupported',
  ])
    image(id);
  for (const id of [
    'static',
    'animated',
    'svg',
    'container',
    'writing',
    'unsupported',
  ])
    thumbnail(id);
  savedVersion('static', 'compressed');
  savedVersion('animated', 'compressed');
  savedVersion('svg', 'compressed');
  savedVersion('container', 'compressed');
  savedVersion('writing', 'compressed', 'image/webp', 'writing');
  savedVersion('unsupported', 'compressed', 'image/heic');
  fixture.db
    .update(mediaImages)
    .set({ animated: true, classification: 'animated' })
    .where(eq(mediaImages.id, 'animated'))
    .run();
  fixture.db
    .update(mediaImages)
    .set({ format: 'SVG', classification: 'preview_only' })
    .where(eq(mediaImages.id, 'svg'))
    .run();
  fixture.db
    .update(mediaImages)
    .set({ classification: 'preview_only' })
    .where(eq(mediaImages.id, 'container'))
    .run();
  fixture.db
    .update(mediaObjects)
    .set({ status: 'writing' })
    .where(eq(mediaObjects.imageId, 'missing-preview'))
    .run();
  const selected = refresh([
    'static',
    'original-only',
    'animated',
    'svg',
    'container',
    'missing-preview',
    'writing',
    'unsupported',
  ]);
  expect(selected.items.map((item) => item.previewUrl)).toEqual([
    '/i/static?type=compressed',
    '/i/original-only?type=original',
    '/i/animated?type=original',
    '/i/svg?type=thumbnail',
    '/i/container?type=thumbnail',
    null,
    '/i/writing?type=original',
    '/i/unsupported?type=original',
  ]);
  expect(neighbors('static').current).toEqual(selected.items[0]);
  expect(page().items.find((item) => item.imageId === 'static')).toEqual(
    selected.items[0],
  );
  for (const processingStatus of ['pending', 'processing', 'failed'] as const) {
    fixture.db
      .update(mediaImages)
      .set({ processingStatus })
      .where(eq(mediaImages.id, 'static'))
      .run();
    expect(neighbors('static').current?.previewUrl).toBeNull();
  }
  fixture.db
    .update(mediaImages)
    .set({ processingStatus: 'ready' })
    .where(eq(mediaImages.id, 'static'))
    .run();
  fixture.db.update(storageConfigs).set({ enabled: false }).run();
  expect(neighbors('static').current).toMatchObject({
    status: 'disabled',
    thumbnailUrl: null,
    previewUrl: null,
  });
  fixture.db.update(storageConfigs).set({ enabled: true }).run();
  expect(neighbors('static').current?.previewUrl).toBe(
    '/i/static?type=compressed',
  );
});

it('uniformly clears neighbors for unknown, private, recycled, deleting and moved current members', async () => {
  image('public');
  for (const id of ['private', 'recycled', 'deleting', 'moved']) image(id);
  fixture.db
    .update(mediaImages)
    .set({ visibility: 'private' })
    .where(eq(mediaImages.id, 'private'))
    .run();
  fixture.db
    .update(mediaImages)
    .set({ trashedAt: now })
    .where(eq(mediaImages.id, 'recycled'))
    .run();
  fixture.db
    .update(mediaImages)
    .set({ deletionStatus: 'deleting' })
    .where(eq(mediaImages.id, 'deleting'))
    .run();
  removeMemberships(fixture.db, ['moved'], { albumIds: [albumId], tagIds: [] });
  const empty = {
    current: null,
    previous: null,
    next: null,
    position: null,
    total: 1,
    showName: false,
  };
  for (const id of ['unknown', 'private', 'recycled', 'deleting', 'moved'])
    expect(neighbors(id)).toEqual(empty);
  await updateShare(fixture.db, albumId, { showName: true });
  expect(neighbors('public').current?.displayName).toBe('秘密名称-public');
  await updateShare(fixture.db, albumId, { showName: false });
  expect(JSON.stringify(neighbors('public'))).not.toContain('displayName');
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
    expect(() =>
      readPublicShareItems(
        fixture.db,
        { token, now },
        new URLSearchParams(params),
      ),
    ).toThrowError(expect.objectContaining({ status: 400 }));
  expect(() => page('')).toThrowError(expect.objectContaining({ status: 400 }));
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
  for (const read of [
    () => page(),
    () => page(''),
    () => refresh(['public']),
    () => neighbors('public'),
    () => neighbors(''),
  ])
    expect(read).toThrowError(expect.objectContaining({ status: 401 }));
  expect(page(null, secret).items).toHaveLength(1);
  expect(neighbors('public', secret).current?.imageId).toBe('public');
  const before = fixture.db.select().from(shareGrants).all();
  expect(refresh(['public'], secret).items).toHaveLength(1);
  expect(fixture.db.select().from(shareGrants).all()).toEqual(before);
  expect(() =>
    page(null, secret, new Date(now.getTime() + 86400000)),
  ).toThrowError(expect.objectContaining({ status: 401 }));
  expect(() =>
    neighbors('public', secret, new Date(now.getTime() + 86400000)),
  ).toThrowError(expect.objectContaining({ status: 401 }));
  await updateShare(fixture.db, albumId, { enabled: false });
  expect(() => page(null, secret)).toThrowError(
    expect.objectContaining({ status: 410 }),
  );
  expect(() => page('', secret)).toThrowError(
    expect.objectContaining({ status: 410 }),
  );
  expect(() => neighbors('', secret)).toThrowError(
    expect.objectContaining({ status: 410 }),
  );
  await updateShare(fixture.db, albumId, { enabled: true });
  expect(() => page(null, secret)).toThrowError(
    expect.objectContaining({ status: 401 }),
  );
  expect(() => neighbors('public', secret)).toThrowError(
    expect.objectContaining({ status: 401 }),
  );
  await rotateShare(fixture.db, albumId);
  expect(() => page(null, secret)).toThrowError(
    expect.objectContaining({ status: 404 }),
  );
  expect(() => page('', secret)).toThrowError(
    expect.objectContaining({ status: 404 }),
  );
  expect(() => neighbors('', secret)).toThrowError(
    expect.objectContaining({ status: 404 }),
  );
  fixture.db.transaction((tx) => deleteAlbum(tx, albumId));
  expect(() => refresh(['public'], secret)).toThrowError(
    expect.objectContaining({ status: 404 }),
  );
  expect(fixture.db.select().from(mediaImages).all()).toHaveLength(1);
  expect(fixture.db.select().from(albumShares).all()).toEqual([]);
  expect(fixture.db.select().from(shareGrants).all()).toEqual([]);
});
