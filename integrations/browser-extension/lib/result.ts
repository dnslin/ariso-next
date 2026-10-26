import { z } from 'zod';
import type {
  Capabilities,
  LinkVersion,
  UploadItem,
  VersionKind,
  Visibility,
} from './types';

const id = z.string().min(1);
const kinds = ['original', 'compressed', 'thumbnail', 'watermark'] as const;
const status = z.enum(['pending', 'processing', 'ready', 'failed']);
const detail = z.strictObject({ code: id, stage: id, message: id });
const httpUrl = z
  .url()
  .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol));
const version = z.strictObject({ url: httpUrl, mime: id });
const outcome = z.strictObject({
  status: z.enum(['succeeded', 'not_applicable', 'disabled', 'not_generated']),
  reason: z.string().nullable(),
});
const success = z.strictObject({
  imageId: id,
  status: z.literal('ready'),
  currentImageStatus: status.optional(),
  url: httpUrl,
  actualVersion: z.enum(kinds).nullable(),
  defaultResolution: z.union([
    z.strictObject({ available: z.literal(true), code: z.null() }),
    z.strictObject({
      available: z.literal(false),
      code: z.literal('VERSION_UNAVAILABLE'),
    }),
  ]),
  versions: z.strictObject({
    original: version.optional(),
    compressed: version.optional(),
    thumbnail: version.optional(),
    watermark: version.optional(),
  }),
  processing: z.strictObject({
    status: z.literal('succeeded'),
    versions: z.strictObject({
      original: outcome,
      compressed: outcome,
      thumbnail: outcome,
      watermark: outcome,
    }),
    warnings: z.array(detail),
  }),
  requestId: id,
});
const failure = z.strictObject({
  imageId: id.nullable(),
  status: z.enum([
    'not_created',
    'pending',
    'processing',
    'ready',
    'failed',
    'unavailable',
  ]),
  currentImageStatus: status.optional(),
  error: detail,
  requestId: id,
});
export const capabilitiesSchema = z.strictObject({
  maxFileBytes: z.number().int().positive(),
  queueLimit: z.number().int().positive(),
  defaultVisibility: z.enum(['public', 'private']),
  defaultLinkVersion: z.enum(kinds),
  defaultStorageAvailable: z.boolean(),
  requestId: id,
});
export function parseCapabilities(value: unknown): Capabilities {
  const result = capabilitiesSchema.safeParse(value);
  if (!result.success)
    throw new Error(
      '站点未返回有效的上传能力，请确认 Ariso 已升级到支持此扩展的版本',
    );
  return result.data;
}
export function parseApiError(value: unknown): string | null {
  const result = z.object({ error: detail, requestId: id }).safeParse(value);
  return result.success
    ? `${result.data.error.message}（${result.data.error.code}；请求 ${result.data.requestId}）`
    : null;
}

export function parseUploadResponse(
  httpStatus: number,
  body: unknown,
  selected: LinkVersion,
  visibility: Visibility,
): Partial<UploadItem> {
  if (httpStatus === 201) {
    const result = success.safeParse(body);
    if (result.success) {
      const data = result.data;
      const chosen = selected === 'site' ? data.actualVersion : selected;
      const saved = chosen ? data.versions[chosen] : undefined;
      const available =
        !!saved && (selected !== 'site' || data.defaultResolution.available);
      return {
        state: available ? 'ready' : 'version-unavailable',
        progress: 100,
        visibility,
        imageId: data.imageId,
        requestId: data.requestId,
        versions: data.versions,
        ...(available
          ? { selectedVersion: chosen as VersionKind, url: saved!.url }
          : {}),
        message: available
          ? data.processing.warnings
              .map((warning) => warning.message)
              .join('；') || undefined
          : '图片已保存，但所选版本不可用。请选择已存在的版本，无需重新上传。',
      };
    }
  } else {
    const result = failure.safeParse(body);
    if (result.success) {
      const data = result.data;
      return {
        state:
          data.error.code === 'UPLOAD_DUPLICATE'
            ? 'duplicate'
            : ['pending', 'processing', 'ready'].includes(data.status)
              ? 'unknown'
              : 'failed',
        ...(data.imageId ? { imageId: data.imageId } : {}),
        requestId: data.requestId,
        errorCode: data.error.code,
        stage: data.error.stage,
        message: `${data.error.message}${data.status === 'not_created' ? '（本次未创建图片）' : ''}`,
        visibility,
      };
    }
  }
  return {
    state: 'unknown',
    visibility,
    message: `HTTP ${httpStatus}：未取得有效上传结果，请先到 Ariso 图库核对，不要直接重传。`,
  };
}
