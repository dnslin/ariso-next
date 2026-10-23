import {
  backupJobId,
  backupJson,
  backupPasswordInput,
  restoreResponse,
  type BackupJobContext,
} from '../../../../../../server/backup/http.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(request: Request, context: BackupJobContext) {
  return restoreResponse(
    request,
    async (controller) => {
      const id = await backupJobId(context);
      const input = await backupJson(request, backupPasswordInput);
      return { job: await controller.decrypt(id, input.password) };
    },
    202,
  );
}
