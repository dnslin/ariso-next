import {
  backupJobId,
  backupResponse,
  type BackupJobContext,
} from '../../../../../server/backup/http.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(request: Request, context: BackupJobContext) {
  return backupResponse(request, async (controller) => ({
    job: await controller.cancel(await backupJobId(context)),
  }));
}
