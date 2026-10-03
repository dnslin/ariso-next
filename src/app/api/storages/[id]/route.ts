import { listStorageProbes } from '../../../../server/storage/probes.ts';
import { storageResponse } from '../../../../server/storage/http.ts';
import {
  readStorage,
  updateStorage,
} from '../../../../server/storage/settings.ts';
import { storageUpdateInputSchema } from '../../../../server/storage/validation.ts';
import { getServerRuntime } from '../../../../server/startup/server-start.ts';
import { readStorageScan } from '../../../../server/storage/scans.ts';
import { readStorageOrphanUsage } from '../../../../server/storage/maintenance.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

export function GET(request: Request, context: Context) {
  return storageResponse(request, async (db) => {
    const { id } = await context.params;
    const readReferences = getServerRuntime().storageReferences;
    const { counts, activeWrites } = readReferences(db, id);
    return {
      ...readStorage(db, id),
      probes: listStorageProbes(db, id),
      references: { counts, activeWrites },
      scan: readStorageScan(db, id),
      orphans: readStorageOrphanUsage({ db, readReferences }, id),
    };
  });
}
export function PATCH(request: Request, context: Context) {
  return storageResponse(request, async (db, settingsContext) => {
    const { id } = await context.params;
    return updateStorage(
      db,
      id,
      storageUpdateInputSchema.parse(await request.json()),
      settingsContext,
      getServerRuntime().storageReferences,
    );
  });
}

export function DELETE(request: Request, context: Context) {
  return storageResponse(request, async () => {
    const { id } = await context.params;
    return getServerRuntime().storageMaintenance.deleteStorage(id);
  });
}
