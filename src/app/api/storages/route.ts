import { storageResponse } from '../../../server/storage/http.ts';
import { createStorage } from '../../../server/storage/settings.ts';
import { storageCreateInputSchema } from '../../../server/storage/validation.ts';
import { readStorageOverview } from '../../../server/startup/storage-overview.ts';
import { getServerRuntime } from '../../../server/startup/server-start.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return storageResponse(request, (db) =>
    readStorageOverview(db, getServerRuntime().storageReferences),
  );
}
export function POST(request: Request) {
  return storageResponse(
    request,
    async (db, context) =>
      createStorage(
        db,
        storageCreateInputSchema.parse(await request.json()),
        context,
      ),
    201,
  );
}
