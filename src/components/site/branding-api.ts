import {
  siteRequest,
  SiteRequestError,
  type SiteSettingsResponse,
} from './api';

export type BrandKind = 'logo' | 'favicon';
export type BrandAsset = { url: string | null; mime: string | null };
export type BrandSettings = Pick<
  SiteSettingsResponse,
  'name' | 'description' | 'logoUrl' | 'logoMime' | 'faviconUrl' | 'faviconMime'
>;
export const brandLabels = { logo: 'Logo', favicon: 'Favicon' } as const;
export const brandAccept = {
  logo: 'image/png,image/jpeg,image/webp,image/svg+xml',
  favicon: 'image/png,image/x-icon,image/vnd.microsoft.icon,image/svg+xml',
};
export function brandAsset(
  settings: BrandSettings,
  kind: BrandKind,
): BrandAsset {
  return { url: settings[`${kind}Url`], mime: settings[`${kind}Mime`] };
}
export function withBrandAsset(
  settings: BrandSettings,
  kind: BrandKind,
  asset: BrandAsset,
): BrandSettings {
  return {
    ...settings,
    [`${kind}Url`]: asset.url,
    [`${kind}Mime`]: asset.mime,
  };
}
export async function readBrandSettings(
  signal?: AbortSignal,
): Promise<BrandSettings> {
  const { name, description, logoUrl, logoMime, faviconUrl, faviconMime } =
    await siteRequest<SiteSettingsResponse>({ signal });
  return { name, description, logoUrl, logoMime, faviconUrl, faviconMime };
}
export async function writeBrandAsset(
  kind: BrandKind,
  file: File | null,
  signal: AbortSignal,
): Promise<BrandAsset> {
  const body = file ? new FormData() : undefined;
  if (file) body!.append('file', file);
  const response = await fetch(`/api/settings/site/branding/${kind}`, {
    method: file ? 'PUT' : 'DELETE',
    body,
    signal,
    cache: 'no-store',
  });
  const result = await response.json();
  if (!response.ok) throw new SiteRequestError(response.status, result);
  return result;
}
