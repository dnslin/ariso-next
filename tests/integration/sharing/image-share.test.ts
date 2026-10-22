import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { collectionFixture } from '../collections/helpers.ts';
import { initializeSiteSettings } from '../../../src/server/site/settings.ts';
import {
  mediaImages,
  mediaObjects,
  mediaVersions,
  type VersionKind,
} from '../../../src/server/media/schema.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import { selectImageDelivery } from '../../../src/server/delivery/access.ts';
import { updateImageFields } from '../../../src/server/media/image-fields.ts';
import { restoreImage, trashImage } from '../../../src/server/media/trash.ts';
import {
  createImageShare,
  listImageShares,
  readOwnerImageShare,
  readPublicImageShare,
  revokeImageShares,
  selectImageShareDelivery,
} from '../../../src/server/sharing/image-configuration.ts';
import { imageShares } from '../../../src/server/sharing/image-schema.ts';

let fixture: ReturnType<typeof collectionFixture>;
const now = new Date('2026-10-21T02:00:00Z');
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  fixture = collectionFixture();
  fixture.db.transaction((tx) =>
    initializeSiteSettings(tx, {
      publicUrl: 'https://images.example.test',
      timeZone: 'Asia/Shanghai',
    }),
  );
});
afterEach(() => {
  fixture.close();
  vi.useRealTimers();
});
function image(id = 'private-image') {
  fixture.image(id);
  fixture.db
    .update(mediaImages)
    .set({
      visibility: 'private',
      processingStatus: 'ready',
      classification: 'static',
      displayName: '秘密旅行照片',
    })
    .where(eq(mediaImages.id, id))
    .run();
  return id;
}
function version(id: string, kind: VersionKind, objectId = `${kind}-${id}`) {
  fixture.db
    .insert(mediaObjects)
    .values({
      id: objectId,
      imageId: id,
      storageId: fixture.storage.id,
      key: `uploads/${objectId}.webp`,
      purpose: kind,
      status: 'stored',
      byteSize: 100,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  fixture.db
    .insert(mediaVersions)
    .values({
      imageId: id,
      kind,
      objectId,
      mime: 'image/webp',
      format: 'WEBP',
      byteSize: 100,
      width: 600,
      height: 400,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: [mediaVersions.imageId, mediaVersions.kind],
      set: { objectId },
    })
    .run();
  return objectId;
}
const create = (
  id: string,
  sourceVersion: 'original' | 'compressed' | 'thumbnail' = 'compressed',
  hours?: number,
) =>
  createImageShare(fixture.db, id, {
    sourceVersion,
    ...(hours === undefined ? {} : { hours }),
  });

it('only explicit creation saves one 24-hour random link and never makes the image public', () => {
  const id = image();
  version(id, 'compressed');
  expect(readOwnerImageShare(fixture.db, id)).toMatchObject({
    share: null,
    sourceVersion: 'compressed',
    unavailableReason: null,
  });
  expect(fixture.db.select().from(imageShares).all()).toEqual([]);
  const share = create(id);
  expect(share).toMatchObject({
    imageId: id,
    sourceVersion: 'compressed',
    state: 'active',
    expiresAt: '2026-10-22T02:00:00.000Z',
  });
  expect(Buffer.from(share.token, 'base64url')).toHaveLength(32);
  expect(share.url).toBe(`https://images.example.test/s/image/${share.token}`);
  expect(create(id, 'compressed', 1)).toEqual(share);
  expect(fixture.db.select().from(imageShares).all()).toHaveLength(1);
  expect(() =>
    selectImageDelivery(fixture.db, id, 'compressed', false),
  ).toThrowError(expect.objectContaining({ code: 'OWNER_LOGIN_REQUIRED' }));
});

it('discloses original or thumbnail fallback before creation and refuses an unconfirmed version change', () => {
  const id = image();
  expect(readOwnerImageShare(fixture.db, id).sourceVersion).toBe('original');
  expect(() => create(id)).toThrowError(
    expect.objectContaining({ status: 409 }),
  );
  const original = create(id, 'original', 1);
  expect(original.sourceVersion).toBe('original');
  fixture.db.transaction((tx) => revokeImageShares(tx, id));
  fixture.db
    .update(mediaImages)
    .set({ format: 'SVG', classification: 'preview_only' })
    .where(eq(mediaImages.id, id))
    .run();
  version(id, 'thumbnail');
  expect(readOwnerImageShare(fixture.db, id).sourceVersion).toBe('thumbnail');
  expect(create(id, 'thumbnail').sourceVersion).toBe('thumbnail');
});

it('accepts only the approved deadlines and rejects public, not-ready, trashed or disabled images', () => {
  const id = image();
  version(id, 'compressed');
  for (const hours of [0, 2, 48, 169, null])
    expect(() =>
      createImageShare(fixture.db, id, { sourceVersion: 'compressed', hours }),
    ).toThrowError(expect.objectContaining({ status: 400 }));
  expect(() =>
    createImageShare(fixture.db, id, {
      sourceVersion: 'compressed',
      imageId: 'other',
    }),
  ).toThrowError(expect.objectContaining({ status: 400 }));
  for (const patch of [
    { visibility: 'public' as const },
    { processingStatus: 'processing' as const },
    { trashedAt: now },
    { deletionStatus: 'deleting' as const },
  ]) {
    fixture.db
      .update(mediaImages)
      .set(patch)
      .where(eq(mediaImages.id, id))
      .run();
    expect(() => create(id)).toThrowError(
      expect.objectContaining({ status: 409 }),
    );
    fixture.db
      .update(mediaImages)
      .set({
        visibility: 'private',
        processingStatus: 'ready',
        trashedAt: null,
        deletionStatus: null,
      })
      .where(eq(mediaImages.id, id))
      .run();
  }
  fixture.db
    .update(storageConfigs)
    .set({ enabled: false })
    .where(eq(storageConfigs.id, fixture.storage.id))
    .run();
  expect(readOwnerImageShare(fixture.db, id).unavailableReason).toContain(
    '存储',
  );
  expect(() => create(id)).toThrowError(
    expect.objectContaining({ status: 409 }),
  );
});

it('expires exactly at the deadline and creates a new token without reviving an old address', () => {
  const id = image();
  version(id, 'compressed');
  const first = create(id, 'compressed', 1);
  vi.setSystemTime(new Date(Date.parse(first.expiresAt) - 1));
  expect(readPublicImageShare(fixture.db, first.token).mediaUrl).toBe(
    `/s/image/${first.token}/media`,
  );
  vi.setSystemTime(new Date(first.expiresAt));
  expect(readOwnerImageShare(fixture.db, id).share?.state).toBe('expired');
  expect(() => readPublicImageShare(fixture.db, first.token)).toThrowError(
    expect.objectContaining({ status: 410 }),
  );
  const second = create(id, 'compressed', 168);
  expect(second.token).not.toBe(first.token);
  expect(() => readPublicImageShare(fixture.db, first.token)).toThrowError(
    expect.objectContaining({ status: 404 }),
  );
  fixture.db.transaction((tx) => revokeImageShares(tx, id));
  expect(() => readPublicImageShare(fixture.db, second.token)).toThrowError(
    expect.objectContaining({ status: 410 }),
  );
  expect(create(id).token).not.toBe(second.token);
});

it('revocation participates in its caller transaction and restore cannot resurrect it', () => {
  const id = image();
  version(id, 'compressed');
  const share = create(id);
  expect(() =>
    fixture.db.transaction((tx) => {
      revokeImageShares(tx, id);
      throw new Error('rollback');
    }),
  ).toThrow('rollback');
  expect(readPublicImageShare(fixture.db, share.token)).toBeTruthy();
  fixture.db.transaction((tx) => {
    tx.update(mediaImages)
      .set({ trashedAt: now })
      .where(eq(mediaImages.id, id))
      .run();
    revokeImageShares(tx, id);
  });
  fixture.db
    .update(mediaImages)
    .set({ trashedAt: null })
    .where(eq(mediaImages.id, id))
    .run();
  expect(() => selectImageShareDelivery(fixture.db, share.token)).toThrowError(
    expect.objectContaining({ status: 410 }),
  );
});

it('real recycle and visibility mutations revoke a share permanently within the asset operation', () => {
  const id = image();
  version(id, 'compressed');
  const recycled = create(id);
  trashImage(fixture.db, id);
  restoreImage(fixture.db, id);
  expect(() =>
    selectImageShareDelivery(fixture.db, recycled.token),
  ).toThrowError(expect.objectContaining({ status: 410 }));
  const published = create(id);
  fixture.db.transaction((tx) =>
    updateImageFields(tx, id, { visibility: 'public' }),
  );
  fixture.db.transaction((tx) =>
    updateImageFields(tx, id, { visibility: 'private' }),
  );
  expect(() =>
    selectImageShareDelivery(fixture.db, published.token),
  ).toThrowError(expect.objectContaining({ status: 410 }));
});

it('retains the selected role during reprocessing and temporary storage disablement', () => {
  const id = image();
  const old = version(id, 'compressed');
  const share = create(id);
  const fresh = version(id, 'compressed', 'compressed-reprocessed');
  expect(selectImageShareDelivery(fixture.db, share.token).object.id).toBe(
    fresh,
  );
  expect(fresh).not.toBe(old);
  fixture.db
    .update(storageConfigs)
    .set({ enabled: false })
    .where(eq(storageConfigs.id, fixture.storage.id))
    .run();
  expect(() => selectImageShareDelivery(fixture.db, share.token)).toThrowError(
    expect.objectContaining({ status: 409 }),
  );
  fixture.db
    .update(storageConfigs)
    .set({ enabled: true })
    .where(eq(storageConfigs.id, fixture.storage.id))
    .run();
  expect(selectImageShareDelivery(fixture.db, share.token).object.id).toBe(
    fresh,
  );
  fixture.db
    .delete(mediaVersions)
    .where(
      and(eq(mediaVersions.imageId, id), eq(mediaVersions.kind, 'compressed')),
    )
    .run();
  expect(() => selectImageShareDelivery(fixture.db, share.token)).toThrowError(
    expect.objectContaining({ status: 409 }),
  );
});

it('returns only the token-scoped public view and keeps owner listings searchable and paged', () => {
  const id = image();
  version(id, 'compressed');
  const share = create(id);
  const view = readPublicImageShare(fixture.db, share.token);
  expect(Object.keys(view).sort()).toEqual(['expiresAt', 'mediaUrl']);
  expect(JSON.stringify(view)).not.toContain('秘密旅行照片');
  expect(
    listImageShares(fixture.db, { q: '秘密', page: 1, pageSize: 20 }),
  ).toMatchObject({
    total: 1,
    items: [{ imageId: id, displayName: '秘密旅行照片', state: 'active' }],
  });
  expect(
    listImageShares(fixture.db, { q: '不存在', page: 1, pageSize: 20 }).items,
  ).toEqual([]);
  expect(
    listImageShares(fixture.db, { q: '', page: 2, pageSize: 20 }),
  ).toMatchObject({ total: 1, items: [] });
});
