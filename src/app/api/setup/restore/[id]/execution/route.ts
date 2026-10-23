import {
  backupJobId,
  requireEmptyRestoreBody,
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
      await requireEmptyRestoreBody(request);
      return { job: await controller.execute(id) };
    },
    202,
  );
}
