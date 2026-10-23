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
import { readStorageTaskReferences } from '../../../../server/startup/storage-references.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

export function GET(request: Request, context: Context) {
  return storageResponse(request, async (db) => {
    const { id } = await context.params;
    const readReferences = getServerRuntime().storageReferences;
    return db.transaction((tx) => {
      const { counts, activeWrites } = readReferences(tx, id);
      return {
        ...readStorage(tx, id),
        probes: listStorageProbes(tx, id),
        references: { counts, activeWrites },
        taskReferences: readStorageTaskReferences(tx, id),
        scan: readStorageScan(tx, id),
        orphans: readStorageOrphanUsage({ db: tx, readReferences }, id),
      };
    });
  });
}
export function PATCH(request: Request, context: Context) {
  return storageResponse(
    request,
    async (db, settingsContext) => {
      const { id } = await context.params;
      return updateStorage(
        db,
        id,
        storageUpdateInputSchema.parse(await request.json()),
        settingsContext,
        getServerRuntime().storageReferences,
      );
    },
    200,
    'storages/[id]/route.ts:PATCH',
  );
}

export function DELETE(request: Request, context: Context) {
  return storageResponse(
    request,
    async () => {
      const { id } = await context.params;
      return getServerRuntime().storageMaintenance.deleteStorage(id);
    },
    200,
    'storages/[id]/route.ts:DELETE',
  );
}
