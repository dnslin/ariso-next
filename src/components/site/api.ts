import type {
  SiteSettingsResponse,
  SiteSettingsPatchResponse,
} from '../../server/site/settings-http';

export type { SiteSettingsResponse, SiteSettingsPatchResponse };
export const siteSettingsUrl = '/api/settings/site';

export class SiteRequestError extends Error {
  readonly code?: string;
  readonly fields: { field: string; message: string }[];
  constructor(
    readonly status: number,
    body: {
      code?: string;
      message?: string;
      fields?: { field: string; message: string }[];
    },
  ) {
    super(body.message ?? `站点信息请求失败（HTTP ${status}）`);
    this.code = body.code;
    this.fields = body.fields ?? [];
  }
}

export async function siteRequest<T>(init?: RequestInit): Promise<T> {
  const response = await fetch(siteSettingsUrl, { cache: 'no-store', ...init });
  const body = await response.json();
  if (!response.ok) throw new SiteRequestError(response.status, body);
  return body;
}
