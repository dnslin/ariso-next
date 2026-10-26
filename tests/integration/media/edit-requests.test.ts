import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collectionFixture } from '../collections/helpers.ts';
import { emptyImageEditRecipe } from '../../../src/shared/image-editing.ts';
import {
  albumImages,
  albums,
  imageTags,
  tags,
} from '../../../src/server/collections/schema.ts';
import {
  mediaImages,
  mediaJobs,
  mediaVersions,
} from '../../../src/server/media/schema.ts';
import { mediaEditRequests } from '../../../src/server/media/editing-schema.ts';
import { mediaReplacements } from '../../../src/server/media/replacement-schema.ts';
import {
  readImageEditContext,
  requestImageEdit,
  readImageEditRequest,
  retryImageEdit,
} from '../../../src/server/media/edit-requests.ts';
import { requestReprocess } from '../../../src/server/media/reprocess.ts';
import { patchMediaSettings } from '../../../src/server/media/settings.ts';
import { enqueueFingerprintJobs } from '../../../src/server/media/fingerprints.ts';
import {
  requestPermanentDelete,
  readMediaCleanup,
} from '../../../src/server/media/cleanup.ts';

let fixture: ReturnType<typeof collectionFixture>;
beforeEach(() => {
  fixture = collectionFixture();
});
afterEach(() => fixture.close());
function source() {
  const id = fixture.image('source');
  fixture.db
    .update(mediaJobs)
    .set({ status: 'succeeded' })
    .where(eq(mediaJobs.imageId, id))
    .run();
  fixture.db
    .update(mediaImages)
    .set({
      processingStatus: 'ready',
      classification: 'static',
      width: 100,
      height: 80,
    })
    .where(eq(mediaImages.id, id))
    .run();
  const objectId = fixture.db
    .select()
    .from(mediaVersions)
    .where(
      and(eq(mediaVersions.imageId, id), eq(mediaVersions.kind, 'original')),
    )
    .get()!.objectId;
  return { id, objectId };
}
function input(sourceObjectId: string) {
  const recipe = emptyImageEditRecipe();
  recipe.regions.push({
    id: 'mask',
    x: 0.2,
    y: 0.2,
    width: 0.3,
    height: 0.2,
    mode: 'solid',
    strength: 20,
    color: '#272343',
  });
  return { requestId: randomUUID(), sourceObjectId, recipe };
}
const count = (table: typeof mediaImages | typeof mediaJobs) =>
  fixture.db
    .select({ count: sql<number>`count(*)` })
    .from(table)
    .get()!.count;

describe('persistent image edit requests', () => {
  it.each(['queued', 'running'] as const)(
    'admits editing while a %s fingerprint backfill retains the original',
    (status) => {
      const image = source();
      expect(enqueueFingerprintJobs(fixture.db)).toBe(1);
      fixture.db
        .update(mediaJobs)
        .set({ status })
        .where(eq(mediaJobs.kind, 'fingerprint'))
        .run();
      expect(readImageEditContext(fixture.db, image.id).sourceObjectId).toBe(
        image.objectId,
      );
      expect(
        requestImageEdit(fixture.db, image.id, input(image.objectId)),
      ).toMatchObject({ status: 'queued', mode: 'copy' });
    },
  );

  it('describes current copy watermark settings independently of old published roles', () => {
    const image = source();
    expect(readImageEditContext(fixture.db, image.id).watermarkPreview).toEqual(
      { copy: false, overwrite: false },
    );
    patchMediaSettings(fixture.db, {
      watermarkMode: 'text',
      watermarkText: 'Site',
    });
    expect(readImageEditContext(fixture.db, image.id).watermarkPreview).toEqual(
      { copy: true, overwrite: false },
    );
    fixture.db
      .update(mediaImages)
      .set({ trashedAt: new Date() })
      .where(eq(mediaImages.id, image.id))
      .run();
    expect(readImageEditContext(fixture.db, image.id)).toMatchObject({
      sourceObjectId: null,
      sourceUrl: null,
      watermarkPreview: { copy: false, overwrite: false },
    });
  });
  it('defaults to an independent copy and inherits visibility, albums and tags exactly once', () => {
    const image = source();
    const now = new Date();
    fixture.db
      .insert(albums)
      .values({
        id: 'album',
        name: '旅行',
        description: '',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    fixture.db
      .insert(tags)
      .values({
        id: 'tag',
        displayName: '截图',
        normalizedKey: '截图',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    fixture.db
      .insert(albumImages)
      .values({ albumId: 'album', imageId: image.id, joinedAt: now })
      .run();
    fixture.db
      .insert(imageTags)
      .values({ imageId: image.id, tagId: 'tag' })
      .run();
    fixture.db
      .update(mediaImages)
      .set({ visibility: 'private' })
      .where(eq(mediaImages.id, image.id))
      .run();
    const submitted = input(image.objectId);
    const accepted = requestImageEdit(fixture.db, image.id, submitted);
    expect(accepted).toMatchObject({
      requestId: submitted.requestId,
      sourceImageId: image.id,
      mode: 'copy',
      status: 'queued',
    });
    expect(accepted.resultImageId).not.toBe(image.id);
    expect(
      fixture.db
        .select()
        .from(mediaImages)
        .where(eq(mediaImages.id, accepted.resultImageId))
        .get(),
    ).toMatchObject({
      storageId: fixture.storage.id,
      displayName: 'sample-编辑',
      visibility: 'private',
      processingStatus: 'pending',
      byteSize: 0,
    });
    expect(
      fixture.db
        .select()
        .from(mediaVersions)
        .where(eq(mediaVersions.imageId, accepted.resultImageId))
        .all(),
    ).toEqual([]);
    expect(
      fixture.db
        .select()
        .from(albumImages)
        .where(eq(albumImages.imageId, accepted.resultImageId))
        .all(),
    ).toHaveLength(1);
    expect(
      fixture.db
        .select()
        .from(imageTags)
        .where(eq(imageTags.imageId, accepted.resultImageId))
        .all(),
    ).toHaveLength(1);
    expect(requestImageEdit(fixture.db, image.id, submitted)).toEqual(accepted);
    expect(count(mediaImages)).toBe(2);
    expect(count(mediaJobs)).toBe(2);
    expect(readImageEditRequest(fixture.db, submitted.requestId)).toEqual(
      accepted,
    );
    expect(retryImageEdit(fixture.db, submitted.requestId)).toEqual(accepted);
    expect(() =>
      requestImageEdit(fixture.db, image.id, {
        ...submitted,
        mode: 'overwrite',
      }),
    ).toThrow(/请求|标识/);
  });

  it('captures overwrite recipes and leaves the currently published original untouched', () => {
    const image = source();
    const accepted = requestImageEdit(fixture.db, image.id, {
      ...input(image.objectId),
      mode: 'overwrite',
    });
    expect(accepted.resultImageId).toBe(image.id);
    expect(
      fixture.db
        .select()
        .from(mediaJobs)
        .where(eq(mediaJobs.id, accepted.jobId))
        .get(),
    ).toMatchObject({ kind: 'replace', step: 'editing', status: 'queued' });
    expect(
      fixture.db
        .select()
        .from(mediaReplacements)
        .where(eq(mediaReplacements.jobId, accepted.jobId))
        .get(),
    ).toMatchObject({
      originalName: 'sample.png',
      originalObjectId: null,
      snapshots: {},
    });
    expect(
      fixture.db
        .select()
        .from(mediaVersions)
        .where(eq(mediaVersions.imageId, image.id))
        .get()!.objectId,
    ).toBe(image.objectId);
    expect(count(mediaImages)).toBe(1);
  });

  it('retries the same first-edit copy when rendering failed before an original existed', () => {
    const image = source();
    const accepted = requestImageEdit(
      fixture.db,
      image.id,
      input(image.objectId),
    );
    fixture.db
      .update(mediaJobs)
      .set({
        status: 'failed',
        error: 'render failed',
        finishedAt: new Date(),
        retryCount: 1,
      })
      .where(eq(mediaJobs.id, accepted.jobId))
      .run();
    fixture.db
      .update(mediaImages)
      .set({ processingStatus: 'failed' })
      .where(eq(mediaImages.id, accepted.resultImageId))
      .run();
    const retried = requestReprocess(fixture.db, accepted.resultImageId, {
      scope: 'all',
    });
    expect(retried.jobId).toBe(accepted.jobId);
    expect(readImageEditRequest(fixture.db, accepted.requestId)).toMatchObject({
      resultImageId: accepted.resultImageId,
      status: 'queued',
      error: null,
    });
    expect(count(mediaImages)).toBe(2);
    expect(count(mediaJobs)).toBe(2);
  });

  it('rejects a stale source or an empty recipe and explains unsupported source formats', () => {
    const image = source();
    expect(() =>
      requestImageEdit(fixture.db, image.id, input(randomUUID())),
    ).toThrow(/变化|原图/);
    expect(() =>
      requestImageEdit(fixture.db, image.id, {
        ...input(image.objectId),
        recipe: emptyImageEditRecipe(),
      }),
    ).toThrow();
    fixture.db
      .update(mediaImages)
      .set({ format: 'GIF', classification: 'preview_only' })
      .where(eq(mediaImages.id, image.id))
      .run();
    expect(
      readImageEditContext(fixture.db, image.id).unavailableReason,
    ).toMatch(/格式|JPEG|PNG|WebP/);
    expect(() =>
      requestImageEdit(fixture.db, image.id, input(image.objectId)),
    ).toThrow();
    expect(fixture.db.select().from(mediaEditRequests).all()).toEqual([]);
  });

  it('reports permanent deletion waiting while a different image edit reads its source', () => {
    const image = source();
    requestImageEdit(fixture.db, image.id, input(image.objectId));
    fixture.db
      .update(mediaImages)
      .set({ trashedAt: new Date() })
      .where(eq(mediaImages.id, image.id))
      .run();
    requestPermanentDelete(fixture.db, image.id);
    expect(readMediaCleanup(fixture.db, image.id).waitingForWrites).toBe(true);
  });
});
