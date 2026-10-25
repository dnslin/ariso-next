import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { eq } from 'drizzle-orm';
import { execa } from 'execa';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMediaDeliveryFixture } from '../delivery/media-fixture.ts';
import { emptyImageEditRecipe } from '../../../src/shared/image-editing.ts';
import {
  requestImageEdit,
  readImageEditRequest,
  readImageEditContext,
  retryImageEdit,
} from '../../../src/server/media/edit-requests.ts';
import { mediaEditRequests } from '../../../src/server/media/editing-schema.ts';
import {
  mediaImages,
  mediaJobs,
  mediaObjects,
  mediaVersions,
} from '../../../src/server/media/schema.ts';
import { mediaSizeVersions } from '../../../src/server/media/size-schema.ts';
import { requestImageSize } from '../../../src/server/media/sizes.ts';
import { patchMediaSettings } from '../../../src/server/media/settings.ts';
import { requestReprocess } from '../../../src/server/media/reprocess.ts';
import { processMediaJob } from '../../../src/server/media/process.ts';
import { receiveImageReplacement } from '../../../src/server/media/replacement.ts';
import { planDerivedObject } from '../../../src/server/media/objects.ts';
import { cleanupMediaCandidates } from '../../../src/server/media/candidate-cleanup.ts';
import {
  cleanupPermanentDeletes,
  requestPermanentDelete,
  readMediaCleanup,
} from '../../../src/server/media/cleanup.ts';
import { trashImage } from '../../../src/server/media/trash.ts';
import * as renderer from '../../../src/server/media/edit-render.ts';
import * as local from '../../../src/server/storage/local.ts';
import { resolveLocalUploadStorage } from '../../../src/server/storage/defaults.ts';
import { readMediaObject } from '../../../src/server/media/storage.ts';

let app: Awaited<ReturnType<typeof createMediaDeliveryFixture>>;
beforeEach(async () => {
  app = await createMediaDeliveryFixture();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await app.close();
});
function input(imageId: string, mode: 'copy' | 'overwrite' = 'copy') {
  const recipe = emptyImageEditRecipe();
  recipe.regions.push({
    id: 'redaction',
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    mode: 'solid',
    strength: 20,
    color: '#ff0000',
  });
  return {
    requestId: randomUUID(),
    sourceObjectId: app
      .state(imageId)
      .versions.find((value) => value.kind === 'original')!.saved!.object.id,
    mode,
    recipe,
  };
}
async function original(imageId: string) {
  const response = await app.request(imageId, '?type=original');
  expect(response.status).toBe(200);
  return Buffer.from(await response.arrayBuffer());
}
async function expectRedPixels(bytes: Buffer) {
  const { stdout } = await execa(
    'magick',
    ['png:-', '-format', '%[fx:r] %[fx:g] %[fx:b] %[fx:a]', 'info:'],
    { input: bytes },
  );
  expect(stdout.split(' ').map(Number)).toEqual([1, 0, 0, 1]);
}
async function replacement(imageId: string) {
  const form = new FormData();
  form.set(
    'file',
    new File(
      [await readFile('tests/fixtures/media-formats/static.jpg')],
      'replacement.jpg',
    ),
  );
  return receiveImageReplacement(
    app.runtime,
    imageId,
    new Request('http://ariso.test/replace', { method: 'POST', body: form }),
  );
}

describe('image edit original preparation and publication', () => {
  it('persists real redacted pixels in a new original, hashes the actual bytes and preserves the source', async () => {
    const source = await app.accept('tests/fixtures/runtime/images/sample.png');
    const before = await original(source.imageId);
    const submitted = input(source.imageId);
    const accepted = requestImageEdit(app.db, source.imageId, submitted);
    expect((await app.processNext()).status).toBe('succeeded');
    expect(await original(source.imageId)).toEqual(before);
    const edited = await original(accepted.resultImageId);
    expect(edited).not.toEqual(before);
    await expectRedPixels(edited);
    const state = app.state(accepted.resultImageId);
    expect(state.image).toMatchObject({
      processingStatus: 'ready',
      format: 'PNG',
      width: source.facts.width,
      height: source.facts.height,
    });
    expect(
      state.versions.find((value) => value.kind === 'original')!.saved!.object
        .contentSha256,
    ).toBe(createHash('sha256').update(edited).digest('hex'));
    expect(readImageEditRequest(app.db, submitted.requestId)).toMatchObject({
      resultImageId: accepted.resultImageId,
      status: 'succeeded',
    });
  });

  it('publishes an overwrite and all previously saved sizes together without changing identity', async () => {
    patchMediaSettings(app.db, {
      watermarkMode: 'text',
      watermarkText: 'A',
      watermarkFont: 'latin',
    });
    const source = await app.accept('tests/fixtures/runtime/images/sample.png');
    requestImageSize(app.db, source.imageId, {
      version: 'compressed',
      preset: 'small',
    });
    await app.processNext();
    const before = app.state(source.imageId);
    const oldBytes = await original(source.imageId);
    const oldSize = app.db
      .select()
      .from(mediaSizeVersions)
      .where(eq(mediaSizeVersions.imageId, source.imageId))
      .get()!;
    patchMediaSettings(app.db, { watermarkMode: 'off' });
    expect(
      readImageEditContext(app.db, source.imageId).watermarkPreview,
    ).toEqual({ copy: false, overwrite: true });
    const accepted = requestImageEdit(
      app.db,
      source.imageId,
      input(source.imageId, 'overwrite'),
    );
    expect(await original(source.imageId)).toEqual(oldBytes);
    expect((await app.processNext()).status).toBe('succeeded');
    const after = app.state(source.imageId);
    expect(accepted.resultImageId).toBe(source.imageId);
    expect(after.image.createdAt).toEqual(before.image.createdAt);
    expect(after.image.displayName).toBe(before.image.displayName);
    expect(after.image.originalName).toBe(before.image.originalName);
    expect(after.image.contentUpdatedAt).not.toBeNull();
    for (const version of before.versions.filter((value) => value.saved))
      expect(
        after.versions.find((value) => value.kind === version.kind)!.saved!
          .object.id,
      ).not.toBe(version.saved!.object.id);
    const size = app.db
      .select()
      .from(mediaSizeVersions)
      .where(eq(mediaSizeVersions.imageId, source.imageId))
      .get()!;
    expect(size.objectId).not.toBe(oldSize.objectId);
    expect(size.sourceObjectId).toBe(
      after.versions.find((value) => value.kind === 'compressed')!.saved!.object
        .id,
    );
    await expectRedPixels(await original(source.imageId));
  });

  it('retries the same copy after first rendering fails before any original exists', async () => {
    const source = await app.accept('tests/fixtures/runtime/images/sample.png');
    const accepted = requestImageEdit(
      app.db,
      source.imageId,
      input(source.imageId),
    );
    vi.spyOn(renderer, 'renderEditedFile').mockRejectedValueOnce(
      new Error('edit render failed'),
    );
    expect((await app.processNext()).status).toBe('failed');
    expect(app.state(accepted.resultImageId).image.processingStatus).toBe(
      'failed',
    );
    expect(
      app.db
        .select()
        .from(mediaVersions)
        .where(eq(mediaVersions.imageId, accepted.resultImageId))
        .all(),
    ).toEqual([]);
    const retried = requestReprocess(app.db, accepted.resultImageId, {
      scope: 'all',
    });
    expect(retried.jobId).toBe(accepted.jobId);
    expect((await app.processNext()).status).toBe('succeeded');
    expect(app.db.select().from(mediaImages).all()).toHaveLength(2);
    await expectRedPixels(await original(accepted.resultImageId));
  });

  it('reuses a safe edited original when only the derived generation failed', async () => {
    const source = await app.accept('tests/fixtures/runtime/images/sample.png');
    const accepted = requestImageEdit(
      app.db,
      source.imageId,
      input(source.imageId),
    );
    const render = vi.spyOn(renderer, 'renderEditedFile');
    const write = local.writeObject;
    const failure = vi
      .spyOn(local, 'writeObject')
      .mockImplementation(async (...args) => {
        if (args[2].key.includes('/thumbnail/'))
          throw Object.assign(new Error('no space for thumbnail'), {
            code: 'ENOSPC',
          });
        return write(...args);
      });
    expect((await app.processNext()).status).toBe('failed');
    expect(
      (await app.request(accepted.resultImageId, '?type=original')).status,
    ).toBe(409);
    const persisted = app
      .state(accepted.resultImageId)
      .versions.find((value) => value.kind === 'original')!.saved!.object;
    const stored = await readMediaObject(
      app.runtime,
      resolveLocalUploadStorage(app.db),
      persisted.key,
      persisted.mime!,
    );
    const chunks: Buffer[] = [];
    for await (const chunk of stored.stream) chunks.push(Buffer.from(chunk));
    const edited = Buffer.concat(chunks);
    await expectRedPixels(edited);
    failure.mockRestore();
    const retried = retryImageEdit(app.db, accepted.requestId);
    expect(retried.resultImageId).toBe(accepted.resultImageId);
    trashImage(app.db, source.imageId);
    requestPermanentDelete(app.db, source.imageId);
    expect(readMediaCleanup(app.db, source.imageId).waitingForWrites).toBe(
      false,
    );
    await cleanupPermanentDeletes(app.runtime, new Set());
    expect(
      app.db
        .select()
        .from(mediaImages)
        .where(eq(mediaImages.id, source.imageId))
        .get(),
    ).toBeUndefined();
    expect((await app.processNext()).status).toBe('succeeded');
    expect(render).toHaveBeenCalledTimes(1);
    expect(await original(accepted.resultImageId)).toEqual(edited);
  });

  it('regenerates an interrupted writing candidate and cleans its owned partial output', async () => {
    const source = await app.accept('tests/fixtures/runtime/images/sample.png');
    const accepted = requestImageEdit(
      app.db,
      source.imageId,
      input(source.imageId),
    );
    const interrupted = app.db.transaction((tx) => {
      const plan = planDerivedObject(tx, accepted.jobId, 'original');
      tx.update(mediaObjects)
        .set({ status: 'writing' })
        .where(eq(mediaObjects.id, plan.objectId))
        .run();
      return plan;
    });
    await local.writeObject(
      app.runtime.storageRoot,
      resolveLocalUploadStorage(app.db),
      interrupted,
      Readable.from('partial'),
    );
    expect((await app.processNext()).status).toBe('succeeded');
    expect(
      app
        .state(accepted.resultImageId)
        .versions.find((value) => value.kind === 'original')!.saved!.object.id,
    ).not.toBe(interrupted.objectId);
    expect(
      app.db
        .select()
        .from(mediaObjects)
        .where(eq(mediaObjects.id, interrupted.objectId))
        .get()!.status,
    ).toBe('cleanup_pending');
    await cleanupMediaCandidates(app.runtime);
    expect(
      app.db
        .select()
        .from(mediaObjects)
        .where(eq(mediaObjects.id, interrupted.objectId))
        .get()!.status,
    ).toBe('deleted');
    await expectRedPixels(await original(accepted.resultImageId));
  });

  it('retains a retired source while an accepted copy still reads it, then releases its bytes', async () => {
    const source = await app.accept('tests/fixtures/runtime/images/sample.png');
    const accepted = requestImageEdit(
      app.db,
      source.imageId,
      input(source.imageId),
    );
    const request = app.db
      .select()
      .from(mediaEditRequests)
      .where(eq(mediaEditRequests.id, accepted.requestId))
      .get()!;
    const changed = await replacement(source.imageId);
    app.db
      .update(mediaJobs)
      .set({ status: 'running' })
      .where(eq(mediaJobs.id, changed.jobId))
      .run();
    await processMediaJob(app.runtime, changed.jobId);
    expect(app.job(changed.jobId).status).toBe('succeeded');
    await cleanupMediaCandidates(app.runtime);
    expect(
      app.db
        .select()
        .from(mediaObjects)
        .where(eq(mediaObjects.id, request.sourceObjectId))
        .get()!.status,
    ).toBe('cleanup_pending');
    expect((await app.processNext()).status).toBe('succeeded');
    expect(app.state(accepted.resultImageId).image).toMatchObject({
      format: 'PNG',
      width: source.facts.width,
      height: source.facts.height,
    });
    await cleanupMediaCandidates(app.runtime);
    expect(
      app.db
        .select()
        .from(mediaObjects)
        .where(eq(mediaObjects.id, request.sourceObjectId))
        .get()!.status,
    ).toBe('deleted');
  });

  it('waits for an accepted reader before permanently removing its source image', async () => {
    const source = await app.accept('tests/fixtures/runtime/images/sample.png');
    const accepted = requestImageEdit(
      app.db,
      source.imageId,
      input(source.imageId),
    );
    trashImage(app.db, source.imageId);
    requestPermanentDelete(app.db, source.imageId);
    await cleanupPermanentDeletes(app.runtime, new Set());
    expect(
      app.db
        .select()
        .from(mediaImages)
        .where(eq(mediaImages.id, source.imageId))
        .get(),
    ).toBeDefined();
    expect((await app.processNext()).status).toBe('succeeded');
    await cleanupPermanentDeletes(app.runtime, new Set());
    expect(
      app.db
        .select()
        .from(mediaImages)
        .where(eq(mediaImages.id, source.imageId))
        .get(),
    ).toBeUndefined();
    expect(app.state(accepted.resultImageId).image.processingStatus).toBe(
      'ready',
    );
    expect(readImageEditRequest(app.db, accepted.requestId).status).toBe(
      'succeeded',
    );
  });

  it.each(['copy', 'overwrite'] as const)(
    'does not retry an old %s intent over a source replaced after its failure',
    async (mode) => {
      const source = await app.accept(
        'tests/fixtures/runtime/images/sample.png',
      );
      const accepted = requestImageEdit(
        app.db,
        source.imageId,
        input(source.imageId, mode),
      );
      vi.spyOn(renderer, 'renderEditedFile').mockRejectedValueOnce(
        new Error('first edit failed'),
      );
      expect((await app.processNext()).status).toBe('failed');
      await replacement(source.imageId);
      expect((await app.processNext()).status).toBe('succeeded');
      const changed = await original(source.imageId);
      expect(() => retryImageEdit(app.db, accepted.requestId)).toThrow(
        /其他操作|变化|原图|不可用/,
      );
      expect(app.job(accepted.jobId).status).toBe('failed');
      expect(await original(source.imageId)).toEqual(changed);
    },
  );

  it('does not reclaim a failed unrendered copy source after permanent deletion starts', async () => {
    const source = await app.accept('tests/fixtures/runtime/images/sample.png');
    const accepted = requestImageEdit(
      app.db,
      source.imageId,
      input(source.imageId),
    );
    vi.spyOn(renderer, 'renderEditedFile').mockRejectedValueOnce(
      new Error('first edit failed'),
    );
    expect((await app.processNext()).status).toBe('failed');
    trashImage(app.db, source.imageId);
    requestPermanentDelete(app.db, source.imageId);
    expect(() => retryImageEdit(app.db, accepted.requestId)).toThrow(
      /原图|不可用/,
    );
    expect(app.job(accepted.jobId).status).toBe('failed');
    await cleanupPermanentDeletes(app.runtime, new Set());
    expect(
      app.db
        .select()
        .from(mediaImages)
        .where(eq(mediaImages.id, source.imageId))
        .get(),
    ).toBeUndefined();
  });

  it('does not retain an obsolete raw source while a stored edited original waits for derivative retry', async () => {
    const source = await app.accept('tests/fixtures/runtime/images/sample.png');
    const submitted = input(source.imageId);
    const accepted = requestImageEdit(app.db, source.imageId, submitted);
    const write = local.writeObject;
    const failure = vi
      .spyOn(local, 'writeObject')
      .mockImplementation(async (...args) => {
        if (args[2].key.includes('/thumbnail/'))
          throw Object.assign(new Error('no space for thumbnail'), {
            code: 'ENOSPC',
          });
        return write(...args);
      });
    expect((await app.processNext()).status).toBe('failed');
    failure.mockRestore();
    await replacement(source.imageId);
    expect((await app.processNext()).status).toBe('succeeded');
    retryImageEdit(app.db, accepted.requestId);
    await cleanupMediaCandidates(app.runtime);
    expect(
      app.db
        .select()
        .from(mediaObjects)
        .where(eq(mediaObjects.id, submitted.sourceObjectId))
        .get()!.status,
    ).toBe('deleted');
    expect(app.job(accepted.jobId).status).toBe('queued');
    expect((await app.processNext()).status).toBe('succeeded');
    await expectRedPixels(await original(accepted.resultImageId));
  });
});
