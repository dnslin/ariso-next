import {
  patchSiteSettingsResponse,
  readSiteSettingsResponse,
  siteSettingsResponse,
} from '../../../../server/site/settings-http.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return siteSettingsResponse(request, readSiteSettingsResponse);
}

export function PATCH(request: Request) {
  return siteSettingsResponse(request, async (db) =>
    patchSiteSettingsResponse(db, await request.json()),
  );
}
