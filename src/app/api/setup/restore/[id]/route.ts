import { z } from 'zod';
import {
  backupJobId,
  backupJson,
  restoreResponse,
  type BackupJobContext,
} from '../../../../../server/backup/http.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const createInput = z.strictObject({
  uploadBytes: z.number().int().positive().safe(),
});

export function GET(request: Request, context: BackupJobContext) {
  return restoreResponse(request, async (controller) => ({
    job: await controller.read(await backupJobId(context)),
  }));
}
export function PUT(request: Request, context: BackupJobContext) {
  return restoreResponse(
    request,
    async (controller) => {
      const id = await backupJobId(context);
      const input = await backupJson(request, createInput);
      return { job: await controller.create(id, input.uploadBytes) };
    },
    201,
  );
}
