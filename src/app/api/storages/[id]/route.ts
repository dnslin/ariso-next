import { storageResponse } from '../../../../server/storage/http.ts';
import {
  readStorage,
  updateStorage,
} from '../../../../server/storage/settings.ts';
import { storageUpdateInputSchema } from '../../../../server/storage/validation.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

export function GET(request: Request, context: Context) {
  return storageResponse(request, async (db) =>
    readStorage(db, (await context.params).id),
  );
}
export function PATCH(request: Request, context: Context) {
  return storageResponse(request, async (db, settingsContext) => {
    const { id } = await context.params;
    return updateStorage(
      db,
      id,
      storageUpdateInputSchema.parse(await request.json()),
      settingsContext,
    );
  });
}
