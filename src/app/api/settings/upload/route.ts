import {
  readUploadJson,
  uploadResponse,
} from '../../../../server/upload/http.ts';
import {
  patchUploadSettings,
  requireUploadSettings,
} from '../../../../server/upload/settings.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return uploadResponse(request, ({ connection }) =>
    requireUploadSettings(connection.db),
  );
}

export function PATCH(request: Request) {
  return uploadResponse(request, async ({ connection }) =>
    patchUploadSettings(connection.db, await readUploadJson(request)),
  );
}
