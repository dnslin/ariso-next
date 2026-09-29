import { storageDefaultInputSchema } from '../../../../server/storage/validation.ts';
import { storageResponse } from '../../../../server/storage/http.ts';
import {
  readStorageSettings,
  setDefaultStorage,
} from '../../../../server/storage/settings.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return storageResponse(request, (db) => readStorageSettings(db));
}
export function PATCH(request: Request) {
  return storageResponse(request, async (db) =>
    setDefaultStorage(
      db,
      storageDefaultInputSchema.parse(await request.json()).defaultStorageId,
    ),
  );
}
