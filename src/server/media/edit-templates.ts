import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { z } from 'zod';
import {
  hasImageEdits,
  imageEditRecipeSchema,
  type ImageEditRecipe,
} from '../../shared/image-editing.ts';
import { mediaEditTemplates } from './editing-schema.ts';
import { MediaReprocessError } from './reprocess.ts';
import { adoptWatermarkAsset } from './watermark-assets.ts';

const templateInput = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1, '请输入模板名称')
    .max(60, '模板名称最多60个字符'),
  recipe: imageEditRecipeSchema.refine(
    hasImageEdits,
    '模板至少包含一处打码或一个水印',
  ),
});
const templatePatch = templateInput
  .partial()
  .refine((value) => Object.keys(value).length > 0, '请选择要修改的模板内容');
const activeAsset = (recipe: ImageEditRecipe) =>
  recipe.watermark.enabled && recipe.watermark.kind === 'image'
    ? recipe.watermark.assetId
    : null;
function dto(template: typeof mediaEditTemplates.$inferSelect) {
  const { watermarkAssetId, ...data } = template;
  void watermarkAssetId;
  return {
    ...data,
    createdAt: data.createdAt.toISOString(),
    updatedAt: data.updatedAt.toISOString(),
  };
}
export function listEditTemplates(db: BetterSQLite3Database) {
  return db
    .select()
    .from(mediaEditTemplates)
    .orderBy(desc(mediaEditTemplates.updatedAt), mediaEditTemplates.id)
    .all()
    .map(dto);
}
export function createEditTemplate(db: BetterSQLite3Database, value: unknown) {
  const input = templateInput.parse(value);
  return db.transaction(
    (tx) => {
      const now = new Date();
      const assetId = activeAsset(input.recipe);
      if (assetId) adoptWatermarkAsset(tx, assetId, now);
      const row = tx
        .insert(mediaEditTemplates)
        .values({
          id: randomUUID(),
          ...input,
          watermarkAssetId: assetId,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get()!;
      return dto(row);
    },
    { behavior: 'immediate' },
  );
}
export function updateEditTemplate(
  db: BetterSQLite3Database,
  id: string,
  value: unknown,
) {
  const input = templatePatch.parse(value);
  return db.transaction(
    (tx) => {
      const previous = tx
        .select()
        .from(mediaEditTemplates)
        .where(eq(mediaEditTemplates.id, id))
        .get();
      if (!previous)
        throw new MediaReprocessError(
          'MEDIA_EDIT_TEMPLATE_NOT_FOUND',
          404,
          '模板不存在',
        );
      const now = new Date();
      const assetId = activeAsset(input.recipe ?? previous.recipe);
      if (assetId) adoptWatermarkAsset(tx, assetId, now);
      return dto(
        tx
          .update(mediaEditTemplates)
          .set({ ...input, watermarkAssetId: assetId, updatedAt: now })
          .where(eq(mediaEditTemplates.id, id))
          .returning()
          .get()!,
      );
    },
    { behavior: 'immediate' },
  );
}
export function deleteEditTemplate(db: BetterSQLite3Database, id: string) {
  const deleted = db
    .delete(mediaEditTemplates)
    .where(eq(mediaEditTemplates.id, id))
    .returning({ id: mediaEditTemplates.id })
    .get();
  if (!deleted)
    throw new MediaReprocessError(
      'MEDIA_EDIT_TEMPLATE_NOT_FOUND',
      404,
      '模板不存在',
    );
}
