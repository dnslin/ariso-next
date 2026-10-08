import { siteSettingsPatchSchema } from '../../server/site/validation';
import type { SiteSettingsResponse } from './api';

export const siteFieldLabels = {
  name: '站点名称',
  description: '站点描述',
  publicUrl: '站点公开地址',
  timeZone: '站点时区',
} as const;
export type SiteDraft = { [K in keyof typeof siteFieldLabels]: string };
export type SitePhase =
  | 'ready'
  | 'saving'
  | 'unknown'
  | 'checking'
  | 'check-error'
  | 'different'
  | 'confirmed';
export function siteDraft(settings: SiteDraft): SiteDraft {
  return {
    name: settings.name,
    description: settings.description,
    publicUrl: settings.publicUrl,
    timeZone: settings.timeZone,
  };
}
export function validateSiteDraft(input: SiteDraft) {
  const parsed = siteSettingsPatchSchema.safeParse(input);
  return parsed.success
    ? { value: parsed.data as SiteDraft, errors: {} as Record<string, string> }
    : {
        errors: Object.fromEntries(
          parsed.error.issues.map((issue) => [
            issue.path.join('.'),
            issue.message,
          ]),
        ),
      };
}
/** 核对消费本次提交的四个标量，不比较更新时间或素材元数据。 */
export function matchesSiteDraft(
  input: SiteDraft,
  saved: SiteSettingsResponse,
) {
  return (Object.keys(siteFieldLabels) as (keyof SiteDraft)[]).every(
    (field) => input[field] === saved[field],
  );
}
export function sitePhaseLocked(phase: SitePhase) {
  return !['ready', 'confirmed'].includes(phase);
}
export function hasUnsavedSiteChanges(
  input: SiteDraft,
  saved: SiteSettingsResponse,
  phase: SitePhase,
) {
  return (
    sitePhaseLocked(phase) ||
    !matchesSiteDraft(validateSiteDraft(input).value ?? input, saved)
  );
}
