import { z } from 'zod';

export const watermarkPositions = [
  'top-left',
  'top-center',
  'top-right',
  'center-left',
  'center',
  'center-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
] as const;
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, '请输入 #RRGGBB 颜色');

/** Initialization and settings share the same complete save contract. */
export const mediaSettingsInputSchema = z
  .strictObject({
    compressionEnabled: z.boolean(),
    outputFormat: z.enum(['jpeg', 'webp', 'avif']),
    quality: z.number().int().min(1).max(100),
    maxEdge: z.number().int().min(1).max(32768).nullable(),
    jpegBackground: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, '请输入 #RRGGBB 颜色'),
    watermarkMode: z.enum(['off', 'text', 'image']),
    watermarkAssetId: z.string().uuid().nullable(),
    watermarkText: z
      .string()
      .refine((value) => !value.includes('\0'), '水印文字不能包含 NUL 字符')
      .refine(
        (value) =>
          Array.from(value).length <= 200 &&
          value.split(/\r\n|\r|\n/).length <= 5,
        '水印文字最多 200 个 Unicode 字符、5 行',
      ),
    watermarkFont: z.enum(['chinese', 'latin']),
    watermarkFontSize: z.number().min(1).max(20),
    watermarkColor: color,
    watermarkStrokeColor: color,
    watermarkStrokeWidth: z.number().min(0).max(10),
    watermarkOpacity: z.number().min(0).max(100),
    watermarkPosition: z.enum(watermarkPositions),
    watermarkMargin: z.number().min(0).max(20),
    watermarkWidth: z.number().min(1).max(100),
    defaultLinkVersion: z.enum(['original', 'compressed', 'watermark']),
    defaultVisibility: z.enum(['public', 'private']),
    concurrency: z.number().int().min(1).max(4),
  })
  .superRefine((settings, ctx) => {
    if (settings.watermarkMode === 'text' && !settings.watermarkText.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['watermarkText'],
        message: '请输入水印文字',
      });
    }
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

export const mediaSettingsPatchSchema = z
  .strictObject(mediaSettingsInputSchema.shape)
  .partial();

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
  watermarkText: '',
  watermarkFont: 'chinese',
  watermarkFontSize: 3,
  watermarkColor: '#FFFFFF',
  watermarkStrokeColor: '#000000',
  watermarkStrokeWidth: 0,
  watermarkOpacity: 50,
  watermarkPosition: 'bottom-right',
  watermarkMargin: 2,
  watermarkWidth: 20,
  defaultLinkVersion: 'compressed',
  defaultVisibility: 'public',
  concurrency: 1,
};
