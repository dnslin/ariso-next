import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createMediaDeliveryFixture } from '../delivery/media-fixture.ts';
import { emptyImageEditRecipe } from '../../../src/shared/image-editing.ts';
import {
  createEditTemplate,
  deleteEditTemplate,
  listEditTemplates,
  updateEditTemplate,
} from '../../../src/server/media/edit-templates.ts';
import {
  cleanupWatermarkAssets,
  createWatermarkAsset,
  getWatermarkAsset,
} from '../../../src/server/media/watermark-assets.ts';

let app: Awaited<ReturnType<typeof createMediaDeliveryFixture>>;
beforeEach(async () => {
  app = await createMediaDeliveryFixture();
});
afterEach(async () => {
  await app.close();
});

it('persists named templates and changes only requested fields', () => {
  const recipe = emptyImageEditRecipe();
  recipe.watermark = { ...recipe.watermark, enabled: true, text: '署名' };
  expect(listEditTemplates(app.db)).toEqual([]);
  const template = createEditTemplate(app.db, { name: '  照片署名  ', recipe });
  expect(template.name).toBe('照片署名');
  expect(listEditTemplates(app.db)).toEqual([template]);
  const renamed = updateEditTemplate(app.db, template.id, { name: '新名字' });
  expect(renamed.recipe).toEqual(recipe);
  expect(renamed.id).toBe(template.id);
  deleteEditTemplate(app.db, template.id);
  expect(listEditTemplates(app.db)).toEqual([]);
  expect(() =>
    updateEditTemplate(app.db, template.id, { name: '不存在' }),
  ).toThrow('模板不存在');
});

it('rejects empty or invalid template contents without creating a record', () => {
  const recipe = emptyImageEditRecipe();
  expect(() =>
    createEditTemplate(app.db, { name: '空模板', recipe }),
  ).toThrow();
  recipe.watermark.enabled = true;
  expect(() => createEditTemplate(app.db, { name: ' ', recipe })).toThrow();
  expect(() =>
    createEditTemplate(app.db, {
      name: '模板',
      recipe: { ...recipe, extra: true },
    }),
  ).toThrow();
  expect(listEditTemplates(app.db)).toEqual([]);
});

it('retains a template logo until its last template reference is removed', async () => {
  const root = join(app.runtime.temporaryRoot, 'watermarks');
  await mkdir(root);
  const context = {
    db: app.db,
    watermarksRoot: root,
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
  expect(getWatermarkAsset(app.db, asset.id)?.expiresAt).toBeNull();
  await cleanupWatermarkAssets(context);
  expect(getWatermarkAsset(app.db, asset.id)?.status).toBe('ready');
  deleteEditTemplate(app.db, template.id);
  await cleanupWatermarkAssets(context);
  expect(getWatermarkAsset(app.db, asset.id)?.status).toBe('deleted');
});
