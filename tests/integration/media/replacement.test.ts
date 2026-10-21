import { readFile, access, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMediaDeliveryFixture } from '../delivery/media-fixture.ts';
import { receiveImageReplacement } from '../../../src/server/media/replacement.ts';
import { patchMediaSettings } from '../../../src/server/media/settings.ts';
import { readMediaMetadata } from '../../../src/server/media/metadata.ts';
import { mediaJobs, mediaObjects } from '../../../src/server/media/schema.ts';
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
describe('atomic replacement lifecycle', () => {
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
