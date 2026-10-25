import { readFile, access, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMediaDeliveryFixture } from '../delivery/media-fixture.ts';
import {
  readImageReplacement,
  receiveImageReplacement,
} from '../../../src/server/media/replacement.ts';
import { patchMediaSettings } from '../../../src/server/media/settings.ts';
import { readMediaMetadata } from '../../../src/server/media/metadata.ts';
import {
  mediaJobs,
  mediaObjects,
  mediaVersions,
} from '../../../src/server/media/schema.ts';
import { requestImageSize } from '../../../src/server/media/sizes.ts';
import {
  mediaSizeCandidates,
  mediaSizeVersions,
} from '../../../src/server/media/size-schema.ts';
import { trashImage } from '../../../src/server/media/trash.ts';
import {
  requestPermanentDelete,
  cleanupPermanentDeletes,
  readMediaCleanup,
  retryMediaCleanup,
} from '../../../src/server/media/cleanup.ts';
import { getImageAccessState } from '../../../src/server/media/images.ts';
import {
  createWatermarkAsset,
  cleanupWatermarkAssets,
  getWatermarkAsset,
} from '../../../src/server/media/watermark-assets.ts';
import { requestReprocess } from '../../../src/server/media/reprocess.ts';
import * as mediaStorage from '../../../src/server/media/storage.ts';
import * as mediaInput from '../../../src/server/media/input.ts';
import { storageConfigs } from '../../../src/server/storage/schema.ts';
import { findDuplicateImage } from '../../../src/server/media/duplicates.ts';

let app: Awaited<ReturnType<typeof createMediaDeliveryFixture>>;
beforeEach(async () => {
  app = await createMediaDeliveryFixture();
  patchMediaSettings(app.db, {
    watermarkMode: 'text',
    watermarkText: 'A',
    watermarkFont: 'latin',
  });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await app?.close();
});
async function input() {
  const data = new FormData();
  data.set(
    'file',
    new File(
      [await readFile('tests/fixtures/media-formats/static.jpg')],
      '新内容.jpg',
    ),
  );
  return new Request('http://ariso.test/replace', {
    method: 'POST',
    body: data,
  });
}

function publishedReferences(imageId: string) {
  return {
    image: app.state(imageId).image,
    metadata: readMediaMetadata(app.db, imageId),
    originalFingerprint: app.db
      .select({ hash: mediaObjects.contentSha256 })
      .from(mediaVersions)
      .innerJoin(mediaObjects, eq(mediaObjects.id, mediaVersions.objectId))
      .where(
        and(
          eq(mediaVersions.imageId, imageId),
          eq(mediaVersions.kind, 'original'),
        ),
      )
      .get()?.hash,
    versions: app.db
      .select()
      .from(mediaVersions)
      .where(eq(mediaVersions.imageId, imageId))
      .orderBy(mediaVersions.kind)
      .all(),
    sizes: app.db
      .select()
      .from(mediaSizeVersions)
      .where(eq(mediaSizeVersions.imageId, imageId))
      .orderBy(mediaSizeVersions.sourceVersion, mediaSizeVersions.preset)
      .all(),
  };
}

async function publishedImage() {
  const { imageId, bytes } = await app.accept(
    'tests/fixtures/runtime/images/sample.png',
  );
  app.db
    .update(mediaObjects)
    .set({ contentSha256: createHash('sha256').update(bytes).digest('hex') })
    .where(
      and(
        eq(mediaObjects.imageId, imageId),
        eq(mediaObjects.purpose, 'original'),
      ),
    )
    .run();
  const queries = ['original', 'compressed', 'thumbnail', 'watermark'].map(
    (version) => '?type=' + version,
  );
  for (const version of ['compressed', 'watermark'] as const)
    for (const preset of ['small', 'medium', 'large'] as const) {
      expect(
        requestImageSize(app.db, imageId, { version, preset }).status,
      ).toBe('queued');
      expect((await app.processNext()).status).toBe('succeeded');
      queries.push(`?type=${version}&preset=${preset}`);
    }
  const contents = new Map<string, Buffer>();
  for (const query of queries) {
    const response = await app.request(imageId, query);
    expect(response.status, query).toBe(200);
    contents.set(query, Buffer.from(await response.arrayBuffer()));
  }
  return { imageId, references: publishedReferences(imageId), contents };
}

async function expectPublishedUnchanged(
  before: Awaited<ReturnType<typeof publishedImage>>,
) {
  expect(publishedReferences(before.imageId)).toEqual(before.references);
  for (const [query, bytes] of before.contents) {
    const response = await app.request(before.imageId, query);
    expect(response.status, query).toBe(200);
    expect(Buffer.from(await response.arrayBuffer()), query).toEqual(bytes);
  }
}

describe('atomic replacement lifecycle', () => {
  it('keeps every published role and preset URL on old bytes throughout all replacement writes', async () => {
    const before = await publishedImage();
    const written = new Set<string>();
    const write = mediaStorage.writeMediaObject;
    vi.spyOn(mediaStorage, 'writeMediaObject').mockImplementation(
      async (...args) => {
        const saved = await write(...args);
        const object = app.db
          .select()
          .from(mediaObjects)
          .where(eq(mediaObjects.key, args[2].key))
          .get()!;
        const size = app.db
          .select()
          .from(mediaSizeCandidates)
          .where(eq(mediaSizeCandidates.objectId, object.id))
          .get();
        written.add(
          size ? `${size.sourceVersion}:${size.preset}` : object.purpose,
        );
        await expectPublishedUnchanged(before);
        return saved;
      },
    );
    const replacement = await receiveImageReplacement(
      app.runtime,
      before.imageId,
      await input(),
    );
    await expectPublishedUnchanged(before);
    expect((await app.processNext()).status).toBe('succeeded');
    expect(app.job(replacement.jobId).status).toBe('succeeded');
    expect(publishedReferences(before.imageId).originalFingerprint).toBe(
      createHash('sha256')
        .update(await readFile('tests/fixtures/media-formats/static.jpg'))
        .digest('hex'),
    );
    expect(
      findDuplicateImage(app.db, before.references.originalFingerprint!),
    ).toBeUndefined();
    expect([...written].sort()).toEqual(
      [
        'original',
        'compressed',
        'thumbnail',
        'watermark',
        'compressed:small',
        'compressed:medium',
        'compressed:large',
        'watermark:small',
        'watermark:medium',
        'watermark:large',
      ].sort(),
    );
    for (const [query, bytes] of before.contents) {
      const response = await app.request(before.imageId, query);
      expect(response.status, query).toBe(200);
      expect(Buffer.from(await response.arrayBuffer()), query).not.toEqual(
        bytes,
      );
    }
  });
  it('allows explicit replacement with content already used by another image identity', async () => {
    const existing = await app.accept(
      'tests/fixtures/media-formats/static.jpg',
    );
    const hash = createHash('sha256').update(existing.bytes).digest('hex');
    app.db
      .update(mediaObjects)
      .set({ contentSha256: hash })
      .where(
        and(
          eq(mediaObjects.imageId, existing.imageId),
          eq(mediaObjects.purpose, 'original'),
        ),
      )
      .run();
    const target = await app.accept('tests/fixtures/runtime/images/sample.png');
    await receiveImageReplacement(app.runtime, target.imageId, await input());
    expect((await app.processNext()).status).toBe('succeeded');
    expect(publishedReferences(target.imageId).originalFingerprint).toBe(hash);
    expect(publishedReferences(existing.imageId).originalFingerprint).toBe(
      hash,
    );
    expect(findDuplicateImage(app.db, hash)?.id).toBe(existing.imageId);
  });
  it('retains every old role and preset reference and HTTP payload when a later size candidate fails', async () => {
    const before = await publishedImage();
    let sizesWritten = 0;
    const write = mediaStorage.writeMediaObject;
    vi.spyOn(mediaStorage, 'writeMediaObject').mockImplementation(
      async (...args) => {
        const saved = await write(...args);
        const size = app.db
          .select({ objectId: mediaSizeCandidates.objectId })
          .from(mediaSizeCandidates)
          .innerJoin(
            mediaObjects,
            eq(mediaSizeCandidates.objectId, mediaObjects.id),
          )
          .where(eq(mediaObjects.key, args[2].key))
          .get();
        if (size && ++sizesWritten === 2)
          throw Object.assign(
            new Error('later replacement size write failed'),
            {
              code: 'EACCES',
            },
          );
        return saved;
      },
    );
    const replacement = await receiveImageReplacement(
      app.runtime,
      before.imageId,
      await input(),
    );
    expect((await app.processNext()).status).toBe('failed');
    expect(sizesWritten).toBe(2);
    expect(app.job(replacement.jobId).error).toContain('sizes:');
    expect(app.job(replacement.jobId).error).toContain(
      'later replacement size write failed',
    );
    await expectPublishedUnchanged(before);
  });
  it('records a requested cancellation without an error log or changed content', async () => {
    const image = await app.accept('tests/fixtures/runtime/images/sample.png');
    const before = app.state(image.imageId).image;
    const errors = vi.spyOn(app.runtime.logger, 'error');
    const controller = new AbortController();
    const request = new Request(await input(), { signal: controller.signal });
    controller.abort();
    await expect(
      receiveImageReplacement(app.runtime, image.imageId, request),
    ).rejects.toMatchObject({ code: 'UPLOAD_CANCELLED' });
    expect(
      app.db
        .select()
        .from(mediaJobs)
        .where(
          and(
            eq(mediaJobs.imageId, image.imageId),
            eq(mediaJobs.kind, 'replace'),
          ),
        )
        .get()!.status,
    ).toBe('cancelled');
    expect(errors).not.toHaveBeenCalled();
    expect(app.state(image.imageId).image).toEqual(before);
  });
  it('retains a real storage failure even if the request is also aborted', async () => {
    const image = await app.accept('tests/fixtures/runtime/images/sample.png');
    const controller = new AbortController();
    const request = new Request(await input(), { signal: controller.signal });
    vi.spyOn(mediaStorage, 'writeMediaObject').mockImplementation(async () => {
      controller.abort();
      throw Object.assign(new Error('replacement write denied'), {
        code: 'EACCES',
      });
    });
    await expect(
      receiveImageReplacement(app.runtime, image.imageId, request),
    ).rejects.toThrow('replacement write denied');
    expect(
      app.db
        .select()
        .from(mediaJobs)
        .where(
          and(
            eq(mediaJobs.imageId, image.imageId),
            eq(mediaJobs.kind, 'replace'),
          ),
        )
        .get()!,
    ).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('replacement write denied'),
    });
  });
  it('can rebuild a thumbnail recipe whose unused image watermark has already been released', async () => {
    const root = join(app.runtime.temporaryRoot, 'watermarks');
    await mkdir(root);
    app.runtime.watermarksRoot = root;
    const context = {
      db: app.db,
      watermarksRoot: root,
      hasUploadReference: () => false,
    };
    const watermark = await createWatermarkAsset(
      context,
      await readFile('tests/fixtures/media-formats/source.png'),
      new AbortController().signal,
    );
    patchMediaSettings(app.db, {
      watermarkMode: 'image',
      watermarkAssetId: watermark.id,
    });
    const image = await app.accept('tests/fixtures/runtime/images/sample.png');
    patchMediaSettings(app.db, {
      watermarkMode: 'text',
      watermarkAssetId: null,
      watermarkText: 'B',
      watermarkFont: 'latin',
    });
    requestReprocess(app.db, image.imageId, { scope: 'watermark' });
    expect((await app.processNext()).status).toBe('succeeded');
    await cleanupWatermarkAssets(context, new Date(Date.now() + 7_200_000));
    expect(getWatermarkAsset(app.db, watermark.id)?.status).toBe('deleted');
    await receiveImageReplacement(app.runtime, image.imageId, await input());
    expect((await app.processNext()).status).toBe('succeeded');
  });
  it('rolls the original, metadata and all references back if final publication fails', async () => {
    const asset = await app.accept('tests/fixtures/runtime/images/sample.png');
    const before = app.state(asset.imageId);
    const metadata = readMediaMetadata(app.db, asset.imageId);
    const replacement = await receiveImageReplacement(
      app.runtime,
      asset.imageId,
      await input(),
    );
    app.db.$client.exec(
      "CREATE TRIGGER reject_replacement_publish BEFORE UPDATE OF object_id ON media_versions WHEN NEW.kind='thumbnail' BEGIN SELECT RAISE(ABORT,'replacement publication failed'); END",
    );
    expect((await app.processNext()).status).toBe('failed');
    expect(app.job(replacement.jobId).error).toContain(
      'replacement publication failed',
    );
    expect(app.state(asset.imageId).image).toEqual(before.image);
    expect(readMediaMetadata(app.db, asset.imageId)).toEqual(metadata);
    for (const version of before.versions)
      if (version.saved)
        expect(
          app
            .state(asset.imageId)
            .versions.find((v) => v.kind === version.kind)!.saved!.object.id,
        ).toBe(version.saved.object.id);
    expect(
      app.db
        .select()
        .from(mediaObjects)
        .where(
          and(
            eq(mediaObjects.jobId, replacement.jobId),
            eq(mediaObjects.purpose, 'original'),
          ),
        )
        .get()!.status,
    ).toBe('cleanup_pending');
  });
  it('keeps replacement status readable when its storage is disabled and rejects another submission with a conflict', async () => {
    const { imageId } = await app.accept(
      'tests/fixtures/runtime/images/sample.png',
    );
    const replacement = await receiveImageReplacement(
      app.runtime,
      imageId,
      await input(),
    );
    app.db
      .update(storageConfigs)
      .set({ enabled: false })
      .where(eq(storageConfigs.id, app.state(imageId).image.storageId))
      .run();

    expect(readImageReplacement(app.db, imageId)).toMatchObject({
      unavailableReason: '图片所属存储已停用',
      job: { id: replacement.jobId, status: 'queued' },
    });
    await expect(
      receiveImageReplacement(app.runtime, imageId, await input()),
    ).rejects.toMatchObject({ code: 'STORAGE_DISABLED', status: 409 });

    const failed = await app.processNext();
    expect(failed.status).toBe('failed');
    expect(failed.error).toContain('STORAGE_DISABLED');
    expect(readImageReplacement(app.db, imageId)).toEqual({
      unavailableReason: '图片所属存储已停用',
      job: {
        id: replacement.jobId,
        status: 'failed',
        step: failed.step,
        error: failed.error,
        finishedAt: failed.finishedAt!.toISOString(),
      },
    });
  });
  it('rejects another content task and deletes queued replacement records through the real cleanup path', async () => {
    const asset = await app.accept('tests/fixtures/runtime/images/sample.png');
    const replacement = await receiveImageReplacement(
      app.runtime,
      asset.imageId,
      await input(),
    );
    await expect(
      receiveImageReplacement(app.runtime, asset.imageId, await input()),
    ).rejects.toMatchObject({ code: 'MEDIA_JOB_CONFLICT' });
    trashImage(app.db, asset.imageId);
    requestPermanentDelete(app.db, asset.imageId);
    expect(
      app.db
        .select()
        .from(mediaJobs)
        .where(eq(mediaJobs.id, replacement.jobId))
        .get()!.status,
    ).toBe('cancelled');
    await cleanupPermanentDeletes(app.runtime, new Set());
    expect(getImageAccessState(app.db, asset.imageId)).toBeNull();
    await expect(
      access(
        join(app.runtime.temporaryRoot, 'media-input-' + replacement.jobId),
      ),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('retains the cleanup journal on input deletion failure and resumes the same deletion', async () => {
    const asset = await app.accept('tests/fixtures/runtime/images/sample.png');
    const replacement = await receiveImageReplacement(
      app.runtime,
      asset.imageId,
      await input(),
    );
    trashImage(app.db, asset.imageId);
    const accepted = requestPermanentDelete(app.db, asset.imageId);
    const discard = vi
      .spyOn(mediaInput, 'discardMediaInput')
      .mockRejectedValueOnce(
        Object.assign(new Error('input directory denied'), { code: 'EACCES' }),
      );
    await cleanupPermanentDeletes(app.runtime, new Set());
    expect(readMediaCleanup(app.db, asset.imageId)).toMatchObject({
      jobId: accepted.jobId,
      status: 'failed',
      error: expect.stringContaining('input directory denied'),
    });
    expect(
      getImageAccessState(app.db, asset.imageId)?.image.deletionStatus,
    ).toBe('cleanup_failed');
    await access(
      join(app.runtime.temporaryRoot, 'media-input-' + replacement.jobId),
    );
    discard.mockRestore();
    retryMediaCleanup(app.db, asset.imageId);
    await cleanupPermanentDeletes(app.runtime, new Set());
    expect(readMediaCleanup(app.db, asset.imageId)).toMatchObject({
      jobId: accepted.jobId,
      status: 'succeeded',
    });
    expect(getImageAccessState(app.db, asset.imageId)).toBeNull();
    await expect(
      access(
        join(app.runtime.temporaryRoot, 'media-input-' + replacement.jobId),
      ),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
