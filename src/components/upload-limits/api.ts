import type {
  UploadSettingsFieldError,
  UploadSettingsInput,
} from '../../shared/upload-settings';

export type SavedUploadLimits = UploadSettingsInput & { maxFileBytes: number };
export const uploadLimitsUrl = '/api/settings/upload';

export class UploadLimitsRequestError extends Error {
  readonly fields: UploadSettingsFieldError[];
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
    fields: UploadSettingsFieldError[] = [],
  ) {
    super(message);
    this.fields = fields;
  }
}

export async function uploadLimitsRequest(
  init?: RequestInit,
): Promise<SavedUploadLimits> {
  const response = await fetch(uploadLimitsUrl, { cache: 'no-store', ...init });
  if (!response.ok) {
    // A confirmed HTTP refusal remains a refusal even without a JSON error body.
    const body = await response.json().catch(() => null);
    throw new UploadLimitsRequestError(
      response.status,
      body?.code,
      body?.message ?? `上传限制请求失败（HTTP ${response.status}）`,
      body?.fields,
    );
  }
  return response.json();
}
