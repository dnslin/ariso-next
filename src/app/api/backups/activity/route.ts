import { backupResponse } from '../../../../server/backup/http.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return backupResponse(request, (controller) => controller.activity());
}
