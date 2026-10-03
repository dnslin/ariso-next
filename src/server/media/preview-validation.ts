import { z } from 'zod';
import { mediaSettingsInputSchema } from './validation.ts';

// A preview carries the entire unsaved rendering form, without site defaults or scheduling settings.
export const previewSettingsSchema = z
  .strictObject(mediaSettingsInputSchema.shape)
  .omit({
    defaultLinkVersion: true,
    defaultVisibility: true,
    concurrency: true,
  })
  .superRefine((settings, ctx) => {
    if (settings.watermarkMode === 'text' && !settings.watermarkText.length)
      ctx.addIssue({
        code: 'custom',
        path: ['watermarkText'],
        message: '请输入水印文字',
      });
    if (settings.watermarkMode === 'image' && !settings.watermarkAssetId)
      ctx.addIssue({
        code: 'custom',
        path: ['watermarkAssetId'],
        message: '请选择水印素材',
      });
  });

export const previewInputSchema = z.strictObject({
  target: z.enum(['original', 'compressed', 'thumbnail', 'watermark']),
  settings: previewSettingsSchema,
});
export type PreviewInput = z.output<typeof previewInputSchema>;
