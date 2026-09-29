import { storageResponse } from '../../../server/storage/http.ts';
import {
  createStorage,
  listStorages,
} from '../../../server/storage/settings.ts';
import { storageCreateInputSchema } from '../../../server/storage/validation.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return storageResponse(request, (db) => listStorages(db));
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
