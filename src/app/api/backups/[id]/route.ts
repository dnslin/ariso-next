import {
  backupJobId,
  backupJson,
  backupPasswordInput,
  backupResponse,
  type BackupJobContext,
} from '../../../../server/backup/http.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request, context: BackupJobContext) {
  return backupResponse(request, async (controller) => ({
    job: await controller.read(await backupJobId(context)),
  }));
}
export function PUT(request: Request, context: BackupJobContext) {
  return backupResponse(
    request,
    async (controller) => {
      const id = await backupJobId(context);
      const input = await backupJson(request, backupPasswordInput);
      return { job: await controller.create(id, input.password) };
    },
    202,
  );
}
export function DELETE(request: Request, context: BackupJobContext) {
  return backupResponse(request, async (controller) => {
    await controller.remove(await backupJobId(context));
    return new Response(null, { status: 204 });
  });
}
