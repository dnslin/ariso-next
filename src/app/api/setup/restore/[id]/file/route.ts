import {
  backupJobId,
  restoreResponse,
  restoreUploadHeaders,
  type BackupJobContext,
} from '../../../../../../server/backup/http.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function PUT(request: Request, context: BackupJobContext) {
  return restoreResponse(request, async (controller) => {
    const id = await backupJobId(context);
    const { offset, total } = restoreUploadHeaders(request);
    return { job: await controller.receive(id, request, offset, total) };
  });
}
export function DELETE(request: Request, context: BackupJobContext) {
  return restoreResponse(request, async (controller) => ({
    job: await controller.reset(await backupJobId(context)),
  }));
}
