import {
  backupJson,
  restoreResponse,
  restoreTargetIds,
  type RestoreTargetContext,
} from '../../../../../../../server/backup/http.ts';
import { restoreRemoteTargetInputSchema } from '../../../../../../../server/backup/restore-remote-validation.ts';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function PUT(request: Request, context: RestoreTargetContext) {
  return restoreResponse(request, async (controller) => {
    const { id, storageId } = await restoreTargetIds(context);
    const input = await backupJson(request, restoreRemoteTargetInputSchema);
    return { job: await controller.saveTarget(id, storageId, input) };
  });
}
