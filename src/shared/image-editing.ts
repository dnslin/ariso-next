import { z } from 'zod';

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, '请输入 #RRGGBB 颜色');
const ratio = z.number().min(0).max(1);
export const imageEditRegionSchema = z
  .strictObject({
    id: z.string().min(1).max(100),
    x: ratio,
    y: ratio,
    width: z.number().gt(0).max(1),
    height: z.number().gt(0).max(1),
    mode: z.enum(['pixelate', 'solid']),
    strength: z.number().min(1).max(80),
    color,
  })
  .superRefine((region, context) => {
    if (
      region.x + region.width > 1 + Number.EPSILON ||
      region.y + region.height > 1 + Number.EPSILON
    ) {
      context.addIssue({
        code: 'custom',
        message: '打码区域必须完整位于图片内',
      });
    }
  });

export const imageEditWatermarkSchema = z
  .strictObject({
    enabled: z.boolean(),
    kind: z.enum(['text', 'image']),
    text: z
      .string()
      .refine((text) => !text.includes('\0'), '水印文字不能包含 NUL 字符')
      .refine(
        (text) =>
          Array.from(text).length <= 200 &&
          text.split(/\r\n|\r|\n/).length <= 5,
        '水印文字最多 200 个 Unicode 字符、5 行',
      ),
    assetId: z.string().uuid().nullable(),
    x: ratio,
    y: ratio,
    width: z.number().min(0.01).max(1),
    fontSize: z.number().min(0.01).max(0.2),
    opacity: ratio,
    rotation: z.number().min(-180).max(180),
    color,
    tiled: z.boolean(),
    font: z.enum(['chinese', 'latin']),
  })
  .superRefine((watermark, context) => {
    if (!watermark.enabled) return;
    if (watermark.kind === 'text' && !watermark.text.trim()) {
      context.addIssue({
        code: 'custom',
        path: ['text'],
        message: '请输入水印文字',
      });
    }
    if (watermark.kind === 'image' && !watermark.assetId) {
      context.addIssue({
        code: 'custom',
        path: ['assetId'],
        message: '请选择水印素材',
      });
    }
  });

export const imageEditRecipeSchema = z
  .strictObject({
    regions: z.array(imageEditRegionSchema),
    watermark: imageEditWatermarkSchema,
  })
  .superRefine((recipe, context) => {
    if (
      new Set(recipe.regions.map((region) => region.id)).size !==
      recipe.regions.length
    ) {
      context.addIssue({
        code: 'custom',
        path: ['regions'],
        message: '打码区域标识不能重复',
      });
    }
  });

export type ImageEditRegion = z.output<typeof imageEditRegionSchema>;
export type ImageEditWatermark = z.output<typeof imageEditWatermarkSchema>;
export type ImageEditRecipe = z.output<typeof imageEditRecipeSchema>;

export function emptyImageEditRecipe(): ImageEditRecipe {
  return {
    regions: [],
    watermark: {
      enabled: false,
      kind: 'text',
      text: '© Ariso',
      assetId: null,
      x: 0.84,
      y: 0.9,
      width: 0.2,
      fontSize: 0.035,
      opacity: 0.65,
      rotation: 0,
      color: '#ffffff',
      tiled: false,
      font: 'chinese',
    },
  };
}

export function copyImageEditRecipe(recipe: ImageEditRecipe): ImageEditRecipe {
  return {
    regions: recipe.regions.map((region) => ({ ...region })),
    watermark: { ...recipe.watermark },
  };
}

export function hasImageEdits(recipe: ImageEditRecipe): boolean {
  return (
    recipe.regions.length > 0 ||
    (recipe.watermark.enabled &&
      Boolean(
        recipe.watermark.kind === 'image'
          ? recipe.watermark.assetId
          : recipe.watermark.text.trim(),
      ))
  );
}

/** Editing handles stay in the normalized picture while preserving the box size. */
export function normalizeImageEditRegion(
  region: ImageEditRegion,
): ImageEditRegion {
  const width = Math.max(0.005, Math.min(1, region.width));
  const height = Math.max(0.005, Math.min(1, region.height));
  return {
    ...region,
    width,
    height,
    x: Math.max(0, Math.min(1 - width, region.x)),
    y: Math.max(0, Math.min(1 - height, region.y)),
  };
}

/** The renderer rounds outwards, so fractional bounds cannot leave exposed pixels. */
export function regionPixels(
  region: ImageEditRegion,
  width: number,
  height: number,
) {
  const x = Math.max(0, Math.floor(region.x * width));
  const y = Math.max(0, Math.floor(region.y * height));
  return {
    x,
    y,
    width: Math.min(width, Math.ceil((region.x + region.width) * width)) - x,
    height:
      Math.min(height, Math.ceil((region.y + region.height) * height)) - y,
  };
}
