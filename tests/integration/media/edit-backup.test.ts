import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMediaDeliveryFixture } from '../delivery/media-fixture.ts';
import { emptyImageEditRecipe } from '../../../src/shared/image-editing.ts';
import {
  requestImageEdit,
  retryImageEdit,
} from '../../../src/server/media/edit-requests.ts';
import {
  createEditTemplate,
  deleteEditTemplate,
} from '../../../src/server/media/edit-templates.ts';
import { mediaImages, mediaObjects } from '../../../src/server/media/schema.ts';
import {
  cleanupWatermarkAssets,
  createWatermarkAsset,
  getWatermarkAsset,
} from '../../../src/server/media/watermark-assets.ts';
import {
  requiredBackupAssets,
  requiredBackupObjects,
} from '../../../src/server/backup/manifest.ts';
import { snapshotDatabase } from '../../../src/server/backup/snapshot.ts';
import { initializeSiteSettings } from '../../../src/server/site/settings.ts';
import * as renderer from '../../../src/server/media/edit-render.ts';
import * as local from '../../../src/server/storage/local.ts';
import { receiveImageReplacement } from '../../../src/server/media/replacement.ts';
import { cleanupMediaCandidates } from '../../../src/server/media/candidate-cleanup.ts';

let app: Awaited<ReturnType<typeof createMediaDeliveryFixture>>;
beforeEach(async () => {
  app = await createMediaDeliveryFixture();
  app.db.transaction((tx) =>
    initializeSiteSettings(tx, {
      publicUrl: 'http://ariso.test',
      timeZone: 'UTC',
    }),
  );
});
afterEach(async () => {
  vi.restoreAllMocks();
  await app.close();
});

it('keeps the queued edit source in the portable snapshot when source deletion has been accepted', async () => {
  const source = await app.accept('tests/fixtures/media-formats/source.png');
  const recipe = emptyImageEditRecipe();
  recipe.regions = [
    {
      id: 'mask',
      x: 0.1,
      y: 0.1,
      width: 0.3,
      height: 0.2,
      mode: 'solid',
      color: '#272343',
      strength: 20,
    },
  ];
  const requestId = randomUUID();
  const edit = requestImageEdit(app.db, source.imageId, {
    requestId,
    sourceObjectId: source.objectId,
    recipe,
  });
  app.db
    .update(mediaImages)
    .set({ deletionStatus: 'deleting', trashedAt: new Date() })
    .where(eq(mediaImages.id, source.imageId))
    .run();
  app.db
    .update(mediaObjects)
    .set({ status: 'cleanup_pending' })
    .where(eq(mediaObjects.id, source.objectId))
    .run();
  const key = app.db
    .select()
    .from(mediaObjects)
    .where(eq(mediaObjects.id, source.objectId))
    .get()!.key;
  expect(
    [...requiredBackupObjects(app.db.$client)].some(
      (object) => object.key === key,
    ),
  ).toBe(true);
  const path = join(app.runtime.temporaryRoot, 'snapshot.db');
  await snapshotDatabase({ db: app.db, destination: path });
  const restored = new Database(path);
  try {
    expect(
      [...requiredBackupObjects(restored)].some((object) => object.key === key),
    ).toBe(true);
    expect(
      restored
        .prepare(
          'SELECT source_object_id AS source FROM media_edit_requests WHERE id=?',
        )
        .get(requestId),
    ).toEqual({ source: source.objectId });
    expect(
      restored
        .prepare('SELECT status FROM media_jobs WHERE id=?')
        .get(edit.jobId),
    ).toEqual({ status: 'queued' });
  } finally {
    restored.close();
  }
});

it('backs up a queued edit logo after its template is deleted and preserves remaining templates', async () => {
  const source = await app.accept('tests/fixtures/media-formats/source.png');
  const watermarksRoot = join(app.runtime.temporaryRoot, 'watermarks');
  await mkdir(watermarksRoot);
  const context = {
    db: app.db,
    watermarksRoot,
    hasUploadReference: () => false,
  };
  const asset = await createWatermarkAsset(
    context,
    await readFile('tests/fixtures/media-formats/source.png'),
    new AbortController().signal,
  );
  const recipe = emptyImageEditRecipe();
  recipe.watermark = {
    ...recipe.watermark,
    enabled: true,
    kind: 'image',
    assetId: asset.id,
  };
  const template = createEditTemplate(app.db, { name: 'Logo', recipe });
  requestImageEdit(app.db, source.imageId, {
    requestId: randomUUID(),
    sourceObjectId: source.objectId,
    recipe,
  });
  deleteEditTemplate(app.db, template.id);
  await cleanupWatermarkAssets(context);
  expect(getWatermarkAsset(app.db, asset.id)?.status).toBe('ready');
  const textRecipe = emptyImageEditRecipe();
  textRecipe.watermark.enabled = true;
  createEditTemplate(app.db, { name: '文本模板', recipe: textRecipe });
  const path = join(app.runtime.temporaryRoot, 'snapshot.db');
  await snapshotDatabase({ db: app.db, destination: path });
  const restored = new Database(path);
  try {
    const logos = [...requiredBackupAssets(restored)].filter(
      (item) => item.relativePath === `watermarks/${asset.path}`,
    );
    expect(logos).toHaveLength(1);
    expect(logos[0].size).toBe(asset.byteSize);
    expect(
      restored.prepare('SELECT name FROM media_edit_templates').all(),
    ).toEqual([{ name: '文本模板' }]);
  } finally {
    restored.close();
  }
});

it('does not require retired raw inputs when a queued retry already owns a safe edited original', async () => {
  const source = await app.accept('tests/fixtures/media-formats/source.png');
  const watermarksRoot = join(app.runtime.temporaryRoot, 'watermarks');
  await mkdir(watermarksRoot);
  app.runtime.watermarksRoot = watermarksRoot;
  const context = {
    db: app.db,
    watermarksRoot,
    hasUploadReference: () => false,
  };
  const asset = await createWatermarkAsset(
    context,
    await readFile('tests/fixtures/media-formats/source.png'),
    new AbortController().signal,
  );
  const recipe = emptyImageEditRecipe();
  recipe.watermark = {
    ...recipe.watermark,
    enabled: true,
    kind: 'image',
    assetId: asset.id,
    x: 0.5,
    y: 0.5,
  };
  const accepted = requestImageEdit(app.db, source.imageId, {
    requestId: randomUUID(),
    sourceObjectId: source.objectId,
    recipe,
  });
  const actualWrite = local.writeObject;
  const failure = vi
    .spyOn(local, 'writeObject')
    .mockImplementation(async (...args) => {
      if (args[2].key.includes('/thumbnail/'))
        throw Object.assign(new Error('test thumbnail disk full'), {
          code: 'ENOSPC',
        });
      return actualWrite(...args);
    });
  expect((await app.processNext()).status).toBe('failed');
  failure.mockRestore();
  const form = new FormData();
  form.set(
    'file',
    new File(
      [await readFile('tests/fixtures/media-formats/second.png')],
      'replacement.png',
    ),
  );
  await receiveImageReplacement(
    app.runtime,
    source.imageId,
    new Request('http://ariso.test/replace', { method: 'POST', body: form }),
  );
  expect((await app.processNext()).status).toBe('succeeded');
  await cleanupMediaCandidates(app.runtime);
  await cleanupWatermarkAssets(context);
  const raw = app.db
    .select()
    .from(mediaObjects)
    .where(eq(mediaObjects.id, source.objectId))
    .get()!;
  expect(raw.status).toBe('deleted');
  expect(getWatermarkAsset(app.db, asset.id)?.status).toBe('deleted');
  expect(retryImageEdit(app.db, accepted.requestId).status).toBe('queued');
  expect(
    [...requiredBackupObjects(app.db.$client)].some(
      (item) => item.key === raw.key,
    ),
  ).toBe(false);
  expect(
    [...requiredBackupAssets(app.db.$client)].some(
      (item) => item.relativePath === `watermarks/${asset.path}`,
    ),
  ).toBe(false);
  await snapshotDatabase({
    db: app.db,
    destination: join(app.runtime.temporaryRoot, 'safe-retry.db'),
  });
  expect((await app.processNext()).status).toBe('succeeded');
});

it('keeps a failed unrendered request logo available for later retry and backup', async () => {
  const source = await app.accept('tests/fixtures/media-formats/source.png');
  const watermarksRoot = join(app.runtime.temporaryRoot, 'watermarks');
  await mkdir(watermarksRoot);
  app.runtime.watermarksRoot = watermarksRoot;
  const context = {
    db: app.db,
    watermarksRoot,
    hasUploadReference: () => false,
  };
  const asset = await createWatermarkAsset(
    context,
    await readFile('tests/fixtures/media-formats/source.png'),
    new AbortController().signal,
  );
  const recipe = emptyImageEditRecipe();
  recipe.watermark = {
    ...recipe.watermark,
    enabled: true,
    kind: 'image',
    assetId: asset.id,
    x: 0.5,
    y: 0.5,
  };
  const accepted = requestImageEdit(app.db, source.imageId, {
    requestId: randomUUID(),
    sourceObjectId: source.objectId,
    recipe,
  });
  const failure = vi
    .spyOn(renderer, 'renderEditedFile')
    .mockRejectedValueOnce(
      Object.assign(new Error('test rendering disk full'), { code: 'ENOSPC' }),
    );
  expect((await app.processNext()).status).toBe('failed');
  failure.mockRestore();
  await cleanupWatermarkAssets(context);
  expect(getWatermarkAsset(app.db, asset.id)?.status).toBe('ready');
  expect(
    [...requiredBackupAssets(app.db.$client)].some(
      (item) => item.relativePath === `watermarks/${asset.path}`,
    ),
  ).toBe(true);
  expect(retryImageEdit(app.db, accepted.requestId).status).toBe('queued');
  expect((await app.processNext()).status).toBe('succeeded');
  await cleanupWatermarkAssets(context);
  expect(getWatermarkAsset(app.db, asset.id)?.status).toBe('deleted');
});
