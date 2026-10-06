import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { readCoverThumbnails } from '../../../src/server/delivery/cover-thumbnails.ts';
import {
  mediaImages,
  mediaObjects,
  mediaVersions,
} from '../../../src/server/media/schema.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import { collectionFixture } from '../collections/helpers.ts';

let fixture: ReturnType<typeof collectionFixture>;
beforeEach(() => {
  fixture = collectionFixture();
});
afterEach(() => fixture.close());

it('reports actual cover processing, storage and saved thumbnail states without a version fallback', () => {
  const { db } = fixture;
  fixture.image('cover');
  const now = new Date();
  db.insert(mediaObjects)
    .values({
      id: 'cover-thumbnail',
      imageId: 'cover',
      storageId: fixture.storage.id,
      key: 'covers/thumbnail.webp',
      purpose: 'thumbnail',
      status: 'stored',
      byteSize: 100,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  db.insert(mediaVersions)
    .values({
      imageId: 'cover',
      kind: 'thumbnail',
      objectId: 'cover-thumbnail',
      byteSize: 100,
      format: 'WEBP',
      mime: 'image/webp',
      width: 100,
      height: 80,
      createdAt: now,
    })
    .run();
  const read = () =>
    db.transaction((tx) => readCoverThumbnails(tx, ['cover', 'cover']));
  for (const [processingStatus, status] of [
    ['pending', 'processing'],
    ['processing', 'processing'],
    ['failed', 'failed'],
    ['ready', 'ready'],
  ] as const) {
    db.update(mediaImages)
      .set({ processingStatus })
      .where(eq(mediaImages.id, 'cover'))
      .run();
    expect(read()).toEqual(
      new Map([
        [
          'cover',
          {
            displayName: 'sample',
            status,
            thumbnailUrl: status === 'ready' ? '/i/cover?type=thumbnail' : null,
          },
        ],
      ]),
    );
  }
  db.update(storageConfigs).set({ enabled: false }).run();
  expect(read().get('cover')).toEqual({
    displayName: 'sample',
    status: 'disabled',
    thumbnailUrl: null,
  });
  db.update(storageConfigs).set({ enabled: true }).run();
  db.update(mediaObjects)
    .set({ status: 'writing' })
    .where(eq(mediaObjects.id, 'cover-thumbnail'))
    .run();
  expect(read().get('cover')).toEqual({
    displayName: 'sample',
    status: 'missing',
    thumbnailUrl: null,
  });
  expect(db.transaction((tx) => readCoverThumbnails(tx, []))).toEqual(
    new Map(),
  );
});
