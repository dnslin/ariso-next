import { uploadResponse } from '../../../server/upload/http.ts';
import { readUploadPageSettings } from '../../../server/upload/page-settings.ts';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return uploadResponse(request, ({ connection }) =>
    readUploadPageSettings(connection.db),
  );
}
