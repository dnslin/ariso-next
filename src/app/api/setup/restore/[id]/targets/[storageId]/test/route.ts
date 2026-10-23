import {
  backupJson,
  restoreResponse,
  restoreTargetIds,
  type RestoreTargetContext,
} from '../../../../../../../../server/backup/http.ts';
import { restoreRemoteTestInputSchema } from '../../../../../../../../server/backup/restore-remote-validation.ts';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function POST(request: Request, context: RestoreTargetContext) {
  return restoreResponse(
    request,
    async (controller) => {
      const { id, storageId } = await restoreTargetIds(context);
      const input = await backupJson(request, restoreRemoteTestInputSchema);
      return { job: await controller.testTarget(id, storageId, input) };
    },
    202,
  );
}
