import { z } from 'zod';

/** Shared by initialization and the future settings entry point. Validate the whole save. */
export const mediaSettingsInputSchema = z
  .object({
    compressionEnabled: z.boolean(),
    outputFormat: z.enum(['jpeg', 'webp', 'avif']),
    quality: z.number().int().min(1).max(100),
    maxEdge: z.number().int().min(1).max(32768).nullable(),
    jpegBackground: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, '请输入 #RRGGBB 颜色'),
    watermarkMode: z.enum(['off', 'text', 'image']),
    watermarkAssetId: z.string().uuid().nullable(),
    defaultLinkVersion: z.enum(['original', 'compressed', 'watermark']),
    defaultVisibility: z.enum(['public', 'private']),
    concurrency: z.number().int().min(1).max(4),
  })
  .superRefine((settings, ctx) => {
    if (settings.watermarkMode === 'image' && !settings.watermarkAssetId) {
      ctx.addIssue({
        code: 'custom',
        path: ['watermarkAssetId'],
        message: '请选择水印素材',
      });
    }
    if (
      settings.defaultLinkVersion === 'compressed' &&
      !settings.compressionEnabled
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['defaultLinkVersion'],
        message: '关闭压缩时，请同时选择其他有效的默认外链版本',
      });
    }
    if (
      settings.defaultLinkVersion === 'watermark' &&
      settings.watermarkMode === 'off'
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['defaultLinkVersion'],
        message: '关闭水印时，请同时选择其他有效的默认外链版本',
      });
    }
  });

export type MediaSettingsInput = z.output<typeof mediaSettingsInputSchema>;
export type ProcessingSnapshot = Omit<
  MediaSettingsInput,
  'defaultLinkVersion' | 'concurrency' | 'watermarkAssetId'
> & { watermarkAsset: WatermarkAssetSnapshot | null };

export type WatermarkAssetSnapshot = {
  id: string;
  path: string;
  format: 'PNG' | 'WEBP' | 'SVG';
  mime: string;
  width: number;
  height: number;
  byteSize: number;
};

export const initialMediaSettings: Readonly<MediaSettingsInput> = {
  compressionEnabled: true,
  outputFormat: 'webp',
  quality: 82,
  maxEdge: null,
  jpegBackground: '#FFFFFF',
  watermarkMode: 'off',
  watermarkAssetId: null,
  defaultLinkVersion: 'compressed',
  defaultVisibility: 'public',
  concurrency: 1,
};
