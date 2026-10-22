import {
  accessProtectionSettingsResponse,
  patchAccessProtectionSettingsResponse,
  readAccessProtectionSettingsResponse,
} from '../../../../server/access-protection/settings-http.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return accessProtectionSettingsResponse(
    request,
    readAccessProtectionSettingsResponse,
  );
}

export function PATCH(request: Request) {
  return accessProtectionSettingsResponse(
    request,
    patchAccessProtectionSettingsResponse,
  );
}
