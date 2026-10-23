import { restoreResponse } from '../../../../server/backup/http.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return restoreResponse(request, (controller) => controller.current());
}
