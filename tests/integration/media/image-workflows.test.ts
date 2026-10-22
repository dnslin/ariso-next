import { readFile } from 'node:fs/promises';
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMediaDeliveryFixture } from '../delivery/media-fixture.ts';
import { receiveImageReplacement } from '../../../src/server/media/replacement.ts';
import { requestImageSize } from '../../../src/server/media/sizes.ts';
import { mediaSizeVersions } from '../../../src/server/media/size-schema.ts';
import { patchMediaSettings } from '../../../src/server/media/settings.ts';
import { requestReprocess } from '../../../src/server/media/reprocess.ts';
import * as local from '../../../src/server/storage/local.ts';

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
async function replacementRequest() {
  const bytes = await readFile('tests/fixtures/media-formats/static.jpg');
  const data = new FormData();
  data.set('file', new File([bytes], '新版图片.jpg', { type: 'image/jpeg' }));
  return {
    bytes,
    request: new Request('http://ariso.test/replace', {
      method: 'POST',
      body: data,
    }),
  };
}
async function original(imageId: string) {
  const response = await app.request(imageId, '?type=original');
  expect(response.status).toBe(200);
  return Buffer.from(await response.arrayBuffer());
}

describe('image replacement and persistent size links', () => {
  it('keeps all old bytes and facts until one publication, including saved disabled versions', async () => {
    const image = await app.accept('tests/fixtures/runtime/images/sample.png');
    const before = app.state(image.imageId);
    const oldOriginal = await original(image.imageId);
    patchMediaSettings(app.db, {
      compressionEnabled: false,
      watermarkMode: 'off',
      defaultLinkVersion: 'original',
    });
    const { bytes, request } = await replacementRequest();
    const accepted = await receiveImageReplacement(
      app.runtime,
      image.imageId,
      request,
    );
    expect(await original(image.imageId)).toEqual(oldOriginal);
    expect(app.state(image.imageId).image).toEqual(before.image);
    const write = local.writeObject;
    vi.spyOn(local, 'writeObject').mockImplementation(async (...args) => {
      const saved = await write(...args);
      expect(await original(image.imageId)).toEqual(oldOriginal);
      expect(app.state(image.imageId).image).toEqual(before.image);
      return saved;
    });
    expect((await app.processNext()).status).toBe('succeeded');
    expect(app.job(accepted.jobId).kind).toBe('replace');
    expect(await original(image.imageId)).toEqual(bytes);
    const after = app.state(image.imageId);
    expect(after.image).toMatchObject({
      id: image.imageId,
      displayName: before.image.displayName,
      visibility: before.image.visibility,
      originalName: '新版图片.jpg',
      format: 'JPEG',
      processingStatus: 'ready',
    });
    expect(after.image.createdAt).toEqual(before.image.createdAt);
    for (const previous of before.versions) {
      if (previous.saved)
        expect(
          after.versions.find((v) => v.kind === previous.kind)!.saved!.object
            .id,
        ).not.toBe(previous.saved.object.id);
    }
  });
  it('preserves the original and metadata when a replacement candidate fails', async () => {
    const image = await app.accept('tests/fixtures/runtime/images/sample.png');
    const before = app.state(image.imageId);
    const bytes = await original(image.imageId);
    const accepted = await receiveImageReplacement(
      app.runtime,
      image.imageId,
      (await replacementRequest()).request,
    );
    const write = local.writeObject;
    vi.spyOn(local, 'writeObject').mockImplementation(async (...args) => {
      if (args[2].key.includes('/thumbnail/'))
        throw Object.assign(new Error('replacement thumbnail failed'), {
          code: 'EACCES',
        });
      return write(...args);
    });
    expect((await app.processNext()).status).toBe('failed');
    expect(app.job(accepted.jobId).error).toContain(
      'replacement thumbnail failed',
    );
    expect(await original(image.imageId)).toEqual(bytes);
    expect(app.state(image.imageId).image).toEqual(before.image);
  });
  it('publishes sizes once, retains their links through reprocessing, and never enlarges the source', async () => {
    const image = await app.accept('tests/fixtures/runtime/images/sample.png');
    const first = requestImageSize(app.db, image.imageId, {
      version: 'compressed',
      preset: 'medium',
    });
    expect(first.status).toBe('queued');
    expect((await app.processNext()).status).toBe('succeeded');
    expect(
      requestImageSize(app.db, image.imageId, {
        version: 'compressed',
        preset: 'medium',
      }).status,
    ).toBe('ready');
    const before = app.db
      .select()
      .from(mediaSizeVersions)
      .where(
        and(
          eq(mediaSizeVersions.imageId, image.imageId),
          eq(mediaSizeVersions.preset, 'medium'),
        ),
      )
      .get()!;
    const response = await app.request(
      image.imageId,
      '?type=compressed&preset=medium',
    );
    expect(response.status).toBe(200);
    await response.arrayBuffer();
    patchMediaSettings(app.db, { quality: 45, maxEdge: 32 });
    requestReprocess(app.db, image.imageId);
    expect((await app.processNext()).status).toBe('succeeded');
    const after = app.db
      .select()
      .from(mediaSizeVersions)
      .where(
        and(
          eq(mediaSizeVersions.imageId, image.imageId),
          eq(mediaSizeVersions.preset, 'medium'),
        ),
      )
      .get()!;
    expect(after.objectId).not.toBe(before.objectId);
    expect(
      (await app.request(image.imageId, '?type=compressed&preset=medium'))
        .status,
    ).toBe(200);
  });
  it('rejects size parameters that would change original or default semantics', async () => {
    const image = await app.accept('tests/fixtures/runtime/images/sample.png');
    for (const query of [
      '?preset=medium',
      '?type=original&preset=medium',
      '?type=thumbnail&preset=medium',
      '?type=compressed&preset=unknown',
      '?type=compressed&preset=small&preset=large',
    ]) {
      expect((await app.request(image.imageId, query)).status).toBe(400);
    }
  });
});
