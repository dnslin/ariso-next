import { mediaSettingsResponse } from '../../../../server/media/settings-http.ts';
import {
  patchMediaSettings,
  requireMediaSettings,
} from '../../../../server/media/settings.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return mediaSettingsResponse(request, requireMediaSettings);
}

export function PATCH(request: Request) {
  return mediaSettingsResponse(request, async (db) =>
    patchMediaSettings(db, await request.json()),
  );
}
