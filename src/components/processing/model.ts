import {
  mediaSettingsInputSchema,
  type MediaSettingsInput,
} from '../../server/media/validation';
import { previewSettingsSchema } from '../../server/media/preview-validation';
import type { SavedProcessingSettings } from './api';

export const fieldLabels: Record<keyof MediaSettingsInput, string> = {
  compressionEnabled: '压缩版本',
  outputFormat: '输出格式',
  quality: '质量',
  maxEdge: '最长边',
  jpegBackground: 'JPEG 背景色',
  watermarkMode: '水印类型',
  watermarkAssetId: '水印素材',
  watermarkText: '水印文字',
  watermarkFont: '内置字体',
  watermarkFontSize: '相对字号',
  watermarkColor: '字体颜色',
  watermarkStrokeColor: '描边颜色',
  watermarkStrokeWidth: '描边宽度',
  watermarkOpacity: '不透明度',
  watermarkPosition: '水印位置',
  watermarkMargin: '边距',
  watermarkWidth: '相对图片宽度',
  defaultLinkVersion: '默认外链版本',
  defaultVisibility: '新上传默认可见性',
  concurrency: '处理并发数',
};
export const previewTargetLabels = {
  original: '原图',
  thumbnail: '缩略图',
  compressed: '压缩图',
  watermark: '水印图',
} as const;

export function settingsInput(
  value: SavedProcessingSettings,
): MediaSettingsInput {
  const { id, updatedAt, ...input } = value;
  void id;
  void updatedAt;
  return input;
}

export function renderingParameters(input: MediaSettingsInput) {
  const { defaultVisibility, defaultLinkVersion, concurrency, ...rendering } =
    input;
  void defaultVisibility;
  void defaultLinkVersion;
  void concurrency;
  return rendering;
}

export function settingsMatch(
  input: MediaSettingsInput,
  saved: MediaSettingsInput,
) {
  return (
    Object.keys(mediaSettingsInputSchema.shape) as (keyof MediaSettingsInput)[]
  ).every((field) => Object.is(input[field], saved[field]));
}

export function validateProcessingInput(
  input: MediaSettingsInput,
  purpose: 'save' | 'preview',
) {
  const parsed =
    purpose === 'save'
      ? mediaSettingsInputSchema.safeParse(input)
      : previewSettingsSchema.safeParse(renderingParameters(input));
  if (parsed.success)
    return { value: parsed.data, errors: {} as Record<string, string> };
  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const field = String(issue.path[0]);
    if (errors[field]) continue;
    errors[field] =
      issue.code === 'invalid_type'
        ? issue.expected === 'int'
          ? '请输入整数'
          : '请输入有效的数字'
        : issue.code === 'too_small'
          ? `不能小于 ${issue.minimum}`
          : issue.code === 'too_big'
            ? `不能大于 ${issue.maximum}`
            : issue.message;
  }
  return { value: undefined, errors };
}

export function formatBytes(value: number) {
  return value >= 1024 ** 2
    ? `${(value / 1024 ** 2).toFixed(1)} MiB`
    : value >= 1024
      ? `${(value / 1024).toFixed(1)} KiB`
      : `${value} B`;
}

export const cardClass =
  'min-w-0 gap-5 rounded-[20px] border border-border bg-surface px-4 py-5 shadow-none min-[1200px]:gap-6 min-[1200px]:p-6';
export const controlClass =
  'h-11 min-w-0 rounded-xl border border-border bg-background text-base font-normal shadow-none min-[1200px]:text-sm';
export const footerActionClass =
  'h-12 min-w-0 flex-1 rounded-xl px-3 text-sm font-normal min-[1200px]:w-50 min-[1200px]:flex-none';
