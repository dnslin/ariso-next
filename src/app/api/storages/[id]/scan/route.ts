import { storageResponse } from '../../../../../server/storage/http.ts';
import { getServerRuntime } from '../../../../../server/startup/server-start.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return storageResponse(request, async () => {
    const { id } = await context.params;
    return getServerRuntime().storageMaintenance.scan(id);
  });
}
