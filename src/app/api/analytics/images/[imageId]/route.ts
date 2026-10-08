import {
  analyticsResponse,
  parseStatsImageId,
} from '../../../../../server/analytics/http.ts';
import { readImageStats } from '../../../../../server/analytics/queries.ts';
import { getServerRuntime } from '../../../../../server/startup/server-start.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ imageId: string }> },
) {
  const { imageId } = await context.params;
  return analyticsResponse(request, () => {
    const server = getServerRuntime();
    return readImageStats(server.connection.db, parseStatsImageId(imageId), {
      health: server.analytics.health,
    });
  });
}
