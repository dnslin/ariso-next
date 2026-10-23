import { storageResponse } from '../../../../../../../server/storage/http.ts';
import { getServerRuntime } from '../../../../../../../server/startup/server-start.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function POST(
  request: Request,
  context: { params: Promise<{ id: string; probeId: string }> },
) {
  return storageResponse(
    request,
    async () => {
      const { id, probeId } = await context.params;
      return getServerRuntime().storageProbes.retryCleanup(id, probeId);
    },
    200,
    'storages/[id]/probes/[probeId]/retry-cleanup/route.ts:POST',
  );
}
