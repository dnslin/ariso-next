import { z } from 'zod';
import {
  backupJobId,
  backupJson,
  restoreResponse,
  type BackupJobContext,
} from '../../../../../../server/backup/http.ts';
import { publicUrlSchema } from '../../../../../../server/site/validation.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const siteInput = z.strictObject({ publicUrl: publicUrlSchema });

export function PUT(request: Request, context: BackupJobContext) {
  return restoreResponse(request, async (controller) => {
    const id = await backupJobId(context);
    const input = await backupJson(request, siteInput);
    return { job: await controller.configure(id, input.publicUrl) };
  });
}
