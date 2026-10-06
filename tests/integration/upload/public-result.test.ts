import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { collectionFixture } from '../collections/helpers.ts';
import { mediaError } from '../../../src/server/media/errors.ts';
import { planDerivedObject } from '../../../src/server/media/objects.ts';
import { settleMediaFailure } from '../../../src/server/media/recovery.ts';
import { requestReprocess } from '../../../src/server/media/reprocess.ts';
import {
  mediaImages,
  mediaJobs,
  mediaMetadata,
  mediaObjects,
  mediaSettings,
  mediaVersions,
  type DerivedVersionKind,
} from '../../../src/server/media/schema.ts';
import {
  completeMediaJob,
  saveMediaCandidate,
} from '../../../src/server/media/steps.ts';
import { siteSettings } from '../../../src/server/site/schema.ts';
import {
  publicUploadFieldsSchema,
  publicUploadResponseSchema,
} from '../../../src/server/upload/public-contract.ts';
import { waitPublicUpload } from '../../../src/server/upload/public-result.ts';

let fixture: ReturnType<typeof collectionFixture>;
let accepted: { imageId: string; jobId: string };
beforeEach(() => {
  fixture = collectionFixture();
  fixture.db
    .insert(siteSettings)
    .values({
      publicUrl: 'https://images.example',
      timeZone: 'Asia/Shanghai',
      updatedAt: new Date(),
    })
    .run();
  accepted = fixture.db.transaction((tx) => {
    const imageId = fixture.image();
    const job = tx
      .select()
      .from(mediaJobs)
      .where(eq(mediaJobs.imageId, imageId))
      .get()!;
    tx.update(mediaImages)
      .set({ classification: 'static' })
      .where(eq(mediaImages.id, imageId))
      .run();
    return { imageId, jobId: job.id };
  });
});
afterEach(() => {
  vi.useRealTimers();
  fixture.close();
});

function complete(jobId = accepted.jobId) {
  const { db } = fixture;
  db.update(mediaJobs)
    .set({ status: 'running' })
    .where(eq(mediaJobs.id, jobId))
    .run();
  const job = db.select().from(mediaJobs).where(eq(mediaJobs.id, jobId)).get()!;
  for (const kind of job.expectedVersions) {
    const object = db.transaction((tx) => planDerivedObject(tx, jobId, kind));
    saveMediaCandidate(db, jobId, kind, object.objectId, {
      size: 50,
      width: 10,
      height: 10,
      format: 'WEBP',
      mime: 'image/webp',
    });
  }
  completeMediaJob(db, jobId);
}

function changeExpected(versions: DerivedVersionKind[]) {
  fixture.db
    .update(mediaJobs)
    .set({ expectedVersions: versions })
    .where(eq(mediaJobs.id, accepted.jobId))
    .run();
}

const wait = (options?: Parameters<typeof waitPublicUpload>[3]) =>
  waitPublicUpload(fixture, accepted, 'request-id', options);

describe('public upload completion from durable media records', () => {
  it('returns only saved versions with delivery URLs after the accepted job completes', async () => {
    complete();
    const result = await wait();
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({
      imageId: accepted.imageId,
      status: 'ready',
      requestId: 'request-id',
      url: `https://images.example/i/${accepted.imageId}`,
      actualVersion: 'compressed',
      defaultResolution: { available: true, code: null },
      processing: {
        status: 'succeeded',
        versions: {
          original: { status: 'succeeded', reason: null },
          compressed: { status: 'succeeded', reason: null },
          thumbnail: { status: 'succeeded', reason: null },
          watermark: { status: 'disabled', reason: 'WATERMARK_DISABLED' },
        },
        warnings: [],
      },
    });
    if (!('versions' in result.body))
      throw new Error('Missing successful versions');
    expect(Object.keys(result.body.versions)).toEqual([
      'original',
      'compressed',
      'thumbnail',
    ]);
    expect(result.body.versions.original).toEqual({
      url: `https://images.example/i/${accepted.imageId}?type=original`,
      mime: 'image/png',
    });
    expect(publicUploadResponseSchema.parse(result.body)).toEqual(result.body);
  });

  it('uses the accepted snapshot for disabled results even if live processing settings change', async () => {
    const { db } = fixture;
    const job = db
      .select()
      .from(mediaJobs)
      .where(eq(mediaJobs.id, accepted.jobId))
      .get()!;
    db.update(mediaJobs)
      .set({ snapshot: { ...job.snapshot, compressionEnabled: false } })
      .where(eq(mediaJobs.id, accepted.jobId))
      .run();
    changeExpected(['thumbnail']);
    complete();
    db.update(mediaSettings)
      .set({
        compressionEnabled: true,
        watermarkMode: 'text',
        watermarkText: 'new',
      })
      .run();
    expect((await wait()).body).toMatchObject({
      processing: {
        versions: {
          compressed: { status: 'disabled', reason: 'COMPRESSION_DISABLED' },
          watermark: { status: 'disabled', reason: 'WATERMARK_DISABLED' },
        },
      },
    });
  });

  it('keeps private uploads successful and uses the current public site URL', async () => {
    complete();
    fixture.db
      .update(mediaImages)
      .set({ visibility: 'private' })
      .where(eq(mediaImages.id, accepted.imageId))
      .run();
    fixture.db
      .update(siteSettings)
      .set({ publicUrl: 'https://new.example' })
      .run();
    expect(await wait()).toMatchObject({
      status: 201,
      body: {
        status: 'ready',
        url: `https://new.example/i/${accepted.imageId}`,
      },
    });
  });

  it('reports a missing applicable default version without failing a ready upload', async () => {
    complete();
    fixture.db
      .update(mediaSettings)
      .set({ defaultLinkVersion: 'watermark' })
      .run();
    const result = await wait();
    expect(result).toMatchObject({
      status: 201,
      body: {
        status: 'ready',
        actualVersion: null,
        defaultResolution: { available: false, code: 'VERSION_UNAVAILABLE' },
        versions: {
          original: expect.any(Object),
          compressed: expect.any(Object),
          thumbnail: expect.any(Object),
        },
      },
    });
    expect(publicUploadResponseSchema.parse(result.body)).toEqual(result.body);
  });

  it('uses delivery original fallback for an inapplicable default and explains version outcomes', async () => {
    fixture.db
      .update(mediaImages)
      .set({ classification: 'animated' })
      .where(eq(mediaImages.id, accepted.imageId))
      .run();
    changeExpected(['thumbnail']);
    complete();
    expect(await wait()).toMatchObject({
      status: 201,
      body: {
        actualVersion: 'original',
        processing: {
          versions: {
            compressed: {
              status: 'not_applicable',
              reason: 'VERSION_NOT_APPLICABLE',
            },
            watermark: {
              status: 'not_applicable',
              reason: 'VERSION_NOT_APPLICABLE',
            },
          },
        },
      },
    });
  });

  it('does not replace the accepted failure with a later successful manual reprocessing result', async () => {
    const { db } = fixture;
    db.update(mediaJobs)
      .set({ status: 'running', step: 'compressed' })
      .where(eq(mediaJobs.id, accepted.jobId))
      .run();
    settleMediaFailure(
      db,
      accepted.jobId,
      'compressed',
      mediaError('MEDIA_OUTPUT_INVALID', '编码输出无效'),
    );
    const later = requestReprocess(db, accepted.imageId);
    complete(later.jobId);
    expect(await wait()).toEqual({
      status: 422,
      body: {
        imageId: accepted.imageId,
        status: 'failed',
        currentImageStatus: 'ready',
        requestId: 'request-id',
        error: {
          code: 'MEDIA_OUTPUT_INVALID',
          stage: 'compressed',
          message: '编码输出无效',
        },
      },
    });
  });

  it.each([
    ['INSUFFICIENT_DISK_SPACE', 507],
    ['STORAGE_OPERATION_FAILED', 502],
    ['STORAGE_DISABLED', 409],
    ['MEDIA_PROCESS_FAILED', 422],
  ])(
    'returns %s as HTTP %s with the real accepted image and failed step',
    async (code, status) => {
      fixture.db
        .update(mediaJobs)
        .set({ status: 'running', step: 'thumbnail' })
        .where(eq(mediaJobs.id, accepted.jobId))
        .run();
      settleMediaFailure(
        fixture.db,
        accepted.jobId,
        'thumbnail',
        mediaError(code, '处理失败详情'),
      );
      expect(await wait()).toMatchObject({
        status,
        body: {
          imageId: accepted.imageId,
          status: 'failed',
          error: { code, stage: 'thumbnail', message: '处理失败详情' },
        },
      });
    },
  );

  it.each([
    'trashed',
    'deleting',
    'cleanup_failed',
    'cancelled',
    'missing_job',
  ] as const)(
    'returns accepted but unavailable for %s without erasing the image ID',
    async (state) => {
      const { db } = fixture;
      if (state === 'trashed')
        db.update(mediaImages)
          .set({ trashedAt: new Date() })
          .where(eq(mediaImages.id, accepted.imageId))
          .run();
      else if (state === 'deleting' || state === 'cleanup_failed')
        db.update(mediaImages)
          .set({ deletionStatus: state })
          .where(eq(mediaImages.id, accepted.imageId))
          .run();
      else if (state === 'cancelled')
        db.update(mediaJobs)
          .set({ status: 'cancelled' })
          .where(eq(mediaJobs.id, accepted.jobId))
          .run();
      else db.delete(mediaJobs).where(eq(mediaJobs.id, accepted.jobId)).run();
      const result = await wait();
      expect(result).toMatchObject({
        status: 409,
        body: {
          imageId: accepted.imageId,
          status: 'unavailable',
          error: { code: 'IMAGE_UNAVAILABLE' },
        },
      });
      expect(publicUploadResponseSchema.parse(result.body)).toEqual(
        result.body,
      );
    },
  );

  it('returns unavailable with the original image ID after all media records are permanently removed', async () => {
    const { db } = fixture;
    db.transaction((tx) => {
      tx.delete(mediaVersions)
        .where(eq(mediaVersions.imageId, accepted.imageId))
        .run();
      tx.delete(mediaObjects)
        .where(eq(mediaObjects.imageId, accepted.imageId))
        .run();
      tx.delete(mediaJobs).where(eq(mediaJobs.imageId, accepted.imageId)).run();
      tx.delete(mediaImages).where(eq(mediaImages.id, accepted.imageId)).run();
    });
    expect(await wait()).toMatchObject({
      status: 409,
      body: {
        imageId: accepted.imageId,
        status: 'unavailable',
        error: { code: 'IMAGE_UNAVAILABLE' },
      },
    });
  });

  it.each(['pending', 'processing'] as const)(
    'returns 504 with actual %s state without mutating the image or task',
    async (processingStatus) => {
      fixture.db
        .update(mediaImages)
        .set({ processingStatus })
        .where(eq(mediaImages.id, accepted.imageId))
        .run();
      const before = {
        images: fixture.db.select().from(mediaImages).all(),
        jobs: fixture.db.select().from(mediaJobs).all(),
      };
      const result = await wait({ timeoutMs: 0 });
      expect(result).toMatchObject({
        status: 504,
        body: {
          imageId: accepted.imageId,
          status: processingStatus,
          error: { code: 'UPLOAD_WAIT_TIMEOUT', stage: 'waiting' },
        },
      });
      expect({
        images: fixture.db.select().from(mediaImages).all(),
        jobs: fixture.db.select().from(mediaJobs).all(),
      }).toEqual(before);
    },
  );

  it('does not mistake a later job success or current ready state for accepted job success', async () => {
    const { db } = fixture;
    const own = db
      .select()
      .from(mediaJobs)
      .where(eq(mediaJobs.id, accepted.jobId))
      .get()!;
    db.insert(mediaJobs)
      .values({ ...own, id: 'later-job', status: 'succeeded' })
      .run();
    db.update(mediaImages)
      .set({ processingStatus: 'ready' })
      .where(eq(mediaImages.id, accepted.imageId))
      .run();
    expect(await wait({ timeoutMs: 0 })).toMatchObject({
      status: 504,
      body: { status: 'ready', error: { code: 'UPLOAD_WAIT_TIMEOUT' } },
    });
  });

  it('rechecks completion at the wait deadline and prefers the durable success', async () => {
    vi.useFakeTimers();
    setTimeout(() => complete(), 10);
    const pending = wait({ timeoutMs: 10, pollMs: 100 });
    await vi.advanceTimersByTimeAsync(10);
    expect(await pending).toMatchObject({
      status: 201,
      body: { status: 'ready' },
    });
  });

  it('rechecks a failed task at the wait deadline and returns its failure instead of a timeout', async () => {
    vi.useFakeTimers();
    fixture.db
      .update(mediaJobs)
      .set({ status: 'running' })
      .where(eq(mediaJobs.id, accepted.jobId))
      .run();
    setTimeout(() => {
      settleMediaFailure(
        fixture.db,
        accepted.jobId,
        'compressed',
        mediaError('MEDIA_OUTPUT_INVALID', '本次处理失败'),
      );
    }, 10);
    const pending = wait({ timeoutMs: 10, pollMs: 100 });
    await vi.advanceTimersByTimeAsync(10);
    expect(await pending).toMatchObject({
      status: 422,
      body: {
        status: 'failed',
        error: { code: 'MEDIA_OUTPUT_INVALID', stage: 'compressed' },
      },
    });
  });

  it('prefers the final image lifecycle state over a completed job success', async () => {
    complete();
    fixture.db
      .update(mediaImages)
      .set({ trashedAt: new Date() })
      .where(eq(mediaImages.id, accepted.imageId))
      .run();
    expect(await wait()).toMatchObject({
      status: 409,
      body: {
        imageId: accepted.imageId,
        status: 'unavailable',
        currentImageStatus: 'ready',
        error: { code: 'IMAGE_UNAVAILABLE' },
      },
    });
  });

  it('ends only the waiter when its signal is aborted and leaves the task available to finish', async () => {
    const controller = new AbortController();
    const pending = wait({
      signal: controller.signal,
      timeoutMs: 1000,
      pollMs: 1000,
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(
      fixture.db
        .select()
        .from(mediaJobs)
        .where(eq(mediaJobs.id, accepted.jobId))
        .get(),
    ).toMatchObject({ status: 'queued' });
    complete();
    expect(await wait()).toMatchObject({ status: 201 });
  });

  it('retains only the accepted task metadata warning after a later metadata reread succeeds', async () => {
    complete();
    fixture.db
      .update(mediaJobs)
      .set({
        metadataWarning:
          'metadata: MEDIA_METADATA_READ_FAILED: 本次元数据读取失败',
      })
      .where(eq(mediaJobs.id, accepted.jobId))
      .run();
    fixture.db
      .insert(mediaMetadata)
      .values({
        imageId: accepted.imageId,
        status: 'succeeded',
        readAt: new Date(),
      })
      .run();
    expect((await wait()).body).toMatchObject({
      processing: {
        warnings: [
          {
            code: 'MEDIA_METADATA_READ_FAILED',
            stage: 'metadata',
            message: '本次元数据读取失败',
          },
        ],
      },
    });
  });
});

describe('shared public upload fields', () => {
  it('accepts repeated album IDs and Unicode tag names without splitting commas', () => {
    const input = {
      albumId: ['one', 'one', 'two'],
      tag: ['Go,旅行', '😀'.repeat(50)],
      visibility: 'private',
    };
    expect(publicUploadFieldsSchema.parse(input)).toEqual(input);
  });
  it.each([
    { storageId: '' },
    { albumId: 'one,two' },
    { albumId: ['one,two'] },
    { 'albumId[]': ['one'] },
    { tag: ['😀'.repeat(51)] },
    { tag: ['bad\nname'] },
    { unknown: 'field' },
  ])('rejects illegal public fields %o', (input) => {
    expect(publicUploadFieldsSchema.safeParse(input).success).toBe(false);
  });
});
