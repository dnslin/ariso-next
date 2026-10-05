import type { MediaSettingsInput } from '../../server/media/validation';
import type {
  mediaPreviews,
  mediaWatermarkAssets,
} from '../../server/media/schema';

type JsonValue<T> = T extends Date
  ? string
  : T extends object
    ? { [K in keyof T]: JsonValue<T[K]> }
    : T;

export type SavedProcessingSettings = MediaSettingsInput & {
  id: number;
  updatedAt: string;
};
export type WatermarkAsset = JsonValue<
  typeof mediaWatermarkAssets.$inferSelect
> & {
  available?: boolean;
};
export type MediaPreview = JsonValue<
  Omit<typeof mediaPreviews.$inferSelect, 'snapshot'>
> & { resultUrl: string | null };

export class ProcessingRequestError extends Error {
  readonly code?: string;
  readonly previewId?: string;
  readonly fields: { field: string; message: string }[];
  constructor(
    readonly status: number,
    body: {
      code?: string;
      message?: string;
      previewId?: string;
      fields?: { field: string; message: string }[];
    },
  ) {
    super(body.message ?? `图片处理请求失败（HTTP ${status}）`);
    this.code = body.code;
    this.previewId = body.previewId;
    this.fields = body.fields ?? [];
  }
}

export async function processingRequest<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  const body = await response.json();
  if (!response.ok) throw new ProcessingRequestError(response.status, body);
  return body;
}

export const processingSettingsUrl = '/api/settings/media';
export const previewUrl = (id: string) =>
  `/api/media/previews/${encodeURIComponent(id)}`;
export const watermarkAssetUrl = (id: string) =>
  `/api/media/watermark-assets/${encodeURIComponent(id)}`;
