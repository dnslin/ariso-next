import {
  backupJobId,
  restoreResponse,
  type BackupJobContext,
} from '../../../../../../server/backup/http.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(request: Request, context: BackupJobContext) {
  return restoreResponse(request, async (controller) => ({
    job: await controller.cancel(await backupJobId(context)),
  }));
}
