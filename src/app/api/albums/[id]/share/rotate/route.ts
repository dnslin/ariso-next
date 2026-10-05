import { rotateShare } from '../../../../../../server/sharing/configuration.ts';
import { ownerShareResponse } from '../../../../../../server/sharing/http.ts';
import { getServerRuntime } from '../../../../../../server/startup/server-start.ts';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return ownerShareResponse(request, async () => ({
    share: rotateShare(
      getServerRuntime().connection.db,
      (await context.params).id,
    ),
  }));
}
